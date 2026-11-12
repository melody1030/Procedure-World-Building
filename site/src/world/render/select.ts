import * as THREE from "three";
import type { Life } from "../life/agents";

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
const VEHICLE_HEIGHT: Record<string, number> = { car: 6, van: 7, taxi: 6, bus: 9 };
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

/** The ring on the ground round the selection, pulsing gently so it can be found in a crowd. */
export class SelectionMark {
  readonly group = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor() {
    const geometry = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({ color: 0x5ad8ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(geometry, this.material);
    this.ring.renderOrder = 10;
    this.group.add(this.ring);
    this.group.visible = false;
  }

  update(sel: Selection | null, life: Life | null, half: number, time: number) {
    const at = sel ? locate(sel, life, half) : null;
    this.group.visible = !!at;
    if (!at) return;
    const pulse = 1 + 0.08 * Math.sin(time * 4);
    const r = (at.radius + RING_PAD) * pulse;
    this.ring.position.set(at.x, at.y + 0.2, at.z);
    this.ring.scale.setScalar(r);
    this.material.opacity = 0.65 + 0.2 * Math.sin(time * 4);
  }

  dispose() {
    this.ring.geometry.dispose();
    this.material.dispose();
  }
}
