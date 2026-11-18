import * as THREE from "three";
import type { Life } from "../life/agents";
import { NO_PATH, type Path } from "../life/ahead";

/**
 * What a click can select in the city (its people, pigeons, cats and vehicles, not its buildings),
 * and the ring that marks it. Agents are found by index in their Life arrays. Everything here works in scene units (voxels), with the agents' columns moved
 * by `half` to the scene's center, as render/life.ts draws them.
 */

export type Selection =
  | { kind: "person"; index: number }
  | { kind: "pigeon"; index: number }
  | { kind: "cat"; index: number }
  | { kind: "vehicle"; index: number };

/** Where a selection stands (scene units): its feet, how tall it is, and how far it reaches round. */
export interface Located {
  x: number;
  y: number;
  z: number;
  height: number;
  radius: number;
}

/** Rough sizes (voxels) for the hit test and the ring: people are 1.3 m (about 5.2 voxels) tall. */
const PERSON = { height: 5.4, radius: 1.1 };
const PIGEON = { height: 1, radius: 0.7 };
const CAT = { height: 1.6, radius: 1.1 };
const VEHICLE_HEIGHT: Record<string, number> = { car: 6, van: 7, taxi: 6, bus: 9, truck: 9 };
/** Small things are padded to at least this many pixels on screen, so they can be clicked. */
const PAD_PIXELS = 5;
/** How far (voxels) the ring stands out round an agent. */
export const RING_PAD = 1.2;

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.index === b.index;
}

/** Where the selection is now, or null if it can't be seen (a person riding or away, a vehicle off the island). */
export function locate(sel: Selection, life: Life | null, half: number): Located | null {
  if (!life) return null;
  if (sel.kind === "person") {
    const p = life.people[sel.index];
    if (!p || p.activity === "away" || p.activity === "ride") return null;
    return { x: p.x - half, y: p.y, z: p.z - half, ...PERSON };
  }
  if (sel.kind === "pigeon") {
    const b = life.pigeons[sel.index];
    return b ? { x: b.x - half, y: b.y, z: b.z - half, ...PIGEON } : null;
  }
  if (sel.kind === "cat") {
    const c = life.cats[sel.index];
    return c ? { x: c.x - half, y: c.y, z: c.z - half, ...CAT } : null;
  }
  const v = life.traffic.vehicles[sel.index];
  if (!v || v.activity === "off") return null;
  return { x: v.x - half, y: v.y, z: v.z - half, height: VEHICLE_HEIGHT[v.kind] ?? 6, radius: Math.max(v.length, v.width) / 2 };
}

/**
 * The agent the ray hits first (tested as a sphere round its middle, padded to a few pixels so
 * small ones can be clicked), in front of anything solid (`wall`: how far along the ray the ground
 * or a building is). `pixel` is how wide a pixel is per unit of distance. Buildings can't be
 * selected; they only hide what stands behind them.
 */
export function pick(ray: THREE.Ray, life: Life | null, half: number, pixel: number, wall: number): Selection | null {
  if (!life) return null;
  let best: Selection | null = null;
  let bestT = Infinity;
  const center = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const tryAgent = (sel: Selection) => {
    const at = locate(sel, life, half);
    // (A position that isn't a number would pass every test below: NaN compares false.)
    if (!at || !Number.isFinite(at.x + at.y + at.z)) return;
    center.set(at.x, at.y + at.height / 2, at.z);
    const t = ray.closestPointToPoint(center, closest).distanceTo(ray.origin);
    if (t <= 0 || t >= bestT) return;
    const reach = Math.max(at.radius, at.height / 2, PAD_PIXELS * pixel * t);
    if (closest.distanceTo(center) > reach) return;
    // Hidden behind a hill or a building (the ground may pass a little under the agent's feet).
    if (t - reach > wall + 1) return;
    best = sel;
    bestT = t;
  };
  life.people.forEach((_, index) => tryAgent({ kind: "person", index }));
  life.pigeons.forEach((_, index) => tryAgent({ kind: "pigeon", index }));
  life.cats.forEach((_, index) => tryAgent({ kind: "cat", index }));
  life.traffic.vehicles.forEach((_, index) => tryAgent({ kind: "vehicle", index }));
  return best;
}

/**
 * The path ahead, by kind: how far (voxels) it is drawn and how far apart its points are. A
 * vehicle's goes 240 voxels (60 m).
 */
const REACH = { person: 120, pigeon: 160, cat: 60, vehicle: 240 };
const EVERY = { person: 2, pigeon: 3, cat: 2, vehicle: 4 };
/** The goal ring's radius (voxels) by kind. */
const GOAL = { person: 1.8, pigeon: 1.2, cat: 1.5, vehicle: 4 };
/**
 * The line: a thin flat strip (a one-pixel line reads too dark on the paving), its width (voxels)
 * by kind, its opacity; how many points it holds (the agent, then the path); passes smoothing a
 * walker's stepped path.
 */
const WIDTH = { person: 0.45, pigeon: 0.35, cat: 0.4, vehicle: 0.9 };
const LINE_OPACITY = 0.75;
const MOST_POINTS = 72;
const SMOOTH = 3;

/** Where the selected agent means to go next (life/ahead.ts), in columns. */
function pathAhead(sel: Selection, life: Life): Path {
  const reach = REACH[sel.kind];
  const every = EVERY[sel.kind];
  if (sel.kind === "person") {
    const p = life.people[sel.index];
    return p ? life.personAhead(p, reach, every) : NO_PATH;
  }
  if (sel.kind === "pigeon") {
    const b = life.pigeons[sel.index];
    return b ? life.pigeonAhead(b, reach, every) : NO_PATH;
  }
  if (sel.kind === "cat") {
    const c = life.cats[sel.index];
    return c ? life.catAhead(c, reach, every) : NO_PATH;
  }
  const v = life.traffic.vehicles[sel.index];
  return v ? life.traffic.pathAhead(v, reach, every) : NO_PATH;
}

/**
 * The ring on the ground round the selection, pulsing gently so it can be found in a crowd; and
 * where it is going: a faint thin line from it along the path it means to take, and a ring
 * pulsing at its goal when the goal is in reach (the line fades out where it is not).
 */
export class SelectionMark {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly line: THREE.Mesh;
  /** The path's points (scene units), and the strip's two edges at each. */
  private readonly positions = new Float32Array(MOST_POINTS * 3);
  private readonly strip = new Float32Array(MOST_POINTS * 2 * 3);
  private readonly alpha = new Float32Array(MOST_POINTS * 2 * 4);
  private readonly goal: THREE.Mesh;
  private readonly goalMaterial: THREE.MeshBasicMaterial;

  constructor() {
    const geometry = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(geometry, this.material);
    this.ring.renderOrder = 10;
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(this.strip, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(this.alpha, 4).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let j = 0; j < MOST_POINTS - 1; j++) index.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);
    lineGeometry.setIndex(index);
    lineGeometry.setDrawRange(0, 0);
    this.line = new THREE.Mesh(lineGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 10;
    this.goalMaterial = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.goal = new THREE.Mesh(geometry, this.goalMaterial);
    this.goal.renderOrder = 10;
    this.goal.visible = false;
    this.group.add(this.ring, this.line, this.goal);
  }

  update(sel: Selection | null, life: Life | null, half: number, time: number) {
    const at = sel ? locate(sel, life, half) : null;
    this.line.geometry.setDrawRange(0, 0);
    this.goal.visible = false;
    if (sel && life && at) this.drawPath(sel, life, at, half, time);
    this.ring.visible = !!at;
    if (!at) return;
    const pulse = 1 + 0.08 * Math.sin(time * 4);
    const r = (at.radius + RING_PAD) * pulse;
    this.ring.position.set(at.x, at.y + 0.2, at.z);
    this.ring.scale.setScalar(r);
    this.material.opacity = 0.65 + 0.2 * Math.sin(time * 4);
  }

  /** The line from the agent along its path, and the ring at its goal. */
  private drawPath(sel: Selection, life: Life, at: Located, half: number, time: number) {
    const { pts, end } = pathAhead(sel, life);
    if (!pts.length) return;
    const count = Math.min(MOST_POINTS, pts.length / 3 + 1);
    const p = this.positions;
    // The agent first (at its feet, a pigeon where it flies), then the path, a little off the ground.
    p[0] = at.x;
    p[1] = at.y + 0.5;
    p[2] = at.z;
    for (let j = 1; j < count; j++) {
      p[j * 3] = pts[(j - 1) * 3] - half;
      p[j * 3 + 1] = pts[(j - 1) * 3 + 1] + 0.5;
      p[j * 3 + 2] = pts[(j - 1) * 3 + 2] - half;
    }
    // A walker's path steps from column to column: round it off (the ends stay put).
    if (sel.kind === "person" || sel.kind === "cat") {
      for (let pass = 0; pass < SMOOTH; pass++) {
        for (let j = 1; j < count - 1; j++) {
          for (const o of [0, 2]) p[j * 3 + o] = (p[(j - 1) * 3 + o] + 2 * p[j * 3 + o] + p[(j + 1) * 3 + o]) / 4;
        }
      }
    }
    // The strip: two edges, either side of each point, across the way it runs; faint all along,
    // fading out where the path is cut off before the goal.
    const w = WIDTH[sel.kind] / 2;
    for (let j = 0; j < count; j++) {
      const a = Math.max(0, j - 1);
      const b = Math.min(count - 1, j + 1);
      const dx = p[b * 3] - p[a * 3];
      const dz = p[b * 3 + 2] - p[a * 3 + 2];
      const d = Math.hypot(dx, dz) || 1;
      const ox = (-dz / d) * w;
      const oz = (dx / d) * w;
      this.strip.set([p[j * 3] + ox, p[j * 3 + 1], p[j * 3 + 2] + oz, p[j * 3] - ox, p[j * 3 + 1], p[j * 3 + 2] - oz], j * 6);
      const fade = LINE_OPACITY * (end ? 1 : 1 - j / Math.max(1, count - 1));
      this.alpha.set([0.353, 0.847, 1, fade, 0.353, 0.847, 1, fade], j * 8);
    }
    const g = this.line.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, (count - 1) * 6);
    if (!end) return;
    // The goal: a ring breathing slowly where the path ends.
    const k = (count - 1) * 3;
    this.goal.visible = true;
    this.goal.position.set(p[k], p[k + 1] - 0.1, p[k + 2]);
    this.goal.scale.setScalar(GOAL[sel.kind] * (1 + 0.15 * Math.sin(time * 3)));
    this.goalMaterial.opacity = 0.55 + 0.3 * Math.sin(time * 3);
  }

  dispose() {
    this.ring.geometry.dispose();
    this.material.dispose();
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.goalMaterial.dispose();
  }
}
