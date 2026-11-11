import * as THREE from "three";
import type { Life } from "../life/agents";

/**
 * What a click can select in the city, and the ring that marks it (Milestone 4 of
 * docs/plans/city-controls-plan.md). Agents are found by index in their Life arrays; a building by
 * its plan's index. Everything here works in scene units (voxels), with the agents' columns moved
 * by `half` to the scene's center, as render/life.ts draws them.
 */

export type Selection =
  | { kind: "person"; index: number }
  | { kind: "pigeon"; index: number }
  | { kind: "cat"; index: number }
  | { kind: "vehicle"; index: number }
  | { kind: "building"; index: number };

/** A building as it can be picked: its model, and its bounds in the scene. */
export interface PickableBuilding {
  group: THREE.Object3D;
  box: THREE.Box3;
}

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

/** Where the selection is now, or null if it can't be seen (a person riding or away, a vehicle off the island, a building not built). */
export function locate(sel: Selection, life: Life | null, buildings: PickableBuilding[], half: number): Located | null {
  if (sel.kind === "building") {
    const b = buildings[sel.index];
    if (!b || !b.group.visible || b.box.isEmpty()) return null;
    const c = b.box.getCenter(new THREE.Vector3());
    const size = b.box.getSize(new THREE.Vector3());
    return { x: c.x, y: b.box.min.y, z: c.z, height: size.y, radius: Math.max(size.x, size.z) / 2 };
  }
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
 * What the ray hits first: an agent (tested as a sphere round its middle, padded to a few pixels
 * so small ones can be clicked) or a building (its bounds), in front of the ground (`ground`: how
 * far along the ray the ground is). `pixel` is how wide a pixel is per unit of distance.
 */
export function pick(ray: THREE.Ray, life: Life | null, buildings: PickableBuilding[] | null, half: number, pixel: number, ground: number): Selection | null {
  let best: Selection | null = null;
  let bestT = Infinity;
  const center = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const tryAgent = (sel: Selection, at: Located | null) => {
    if (!at) return;
    center.set(at.x, at.y + at.height / 2, at.z);
    const t = ray.closestPointToPoint(center, closest).distanceTo(ray.origin);
    if (t <= 0 || t >= bestT) return;
    const reach = Math.max(at.radius, at.height / 2, PAD_PIXELS * pixel * t);
    if (closest.distanceTo(center) > reach) return;
    // Hidden behind a hill: the ground comes first (it may pass a little under the agent's feet).
    if (t - reach > ground + 1) return;
    best = sel;
    bestT = t;
  };
  if (life) {
    life.people.forEach((_, index) => tryAgent({ kind: "person", index }, locate({ kind: "person", index }, life, [], half)));
    life.pigeons.forEach((_, index) => tryAgent({ kind: "pigeon", index }, locate({ kind: "pigeon", index }, life, [], half)));
    life.cats.forEach((_, index) => tryAgent({ kind: "cat", index }, locate({ kind: "cat", index }, life, [], half)));
    life.traffic.vehicles.forEach((_, index) => tryAgent({ kind: "vehicle", index }, locate({ kind: "vehicle", index }, life, [], half)));
  }
  if (buildings) {
    const hit = new THREE.Vector3();
    buildings.forEach((b, index) => {
      if (!b.group.visible || b.box.isEmpty() || !ray.intersectBox(b.box, hit)) return;
      const t = hit.distanceTo(ray.origin);
      // An agent in front of the building, or just at its face, wins.
      if (t < bestT - 2 && t < ground + 1) {
        best = { kind: "building", index };
        bestT = t;
      }
    });
  }
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

  update(sel: Selection | null, life: Life | null, buildings: PickableBuilding[], half: number, time: number) {
    const at = sel ? locate(sel, life, buildings, half) : null;
    this.group.visible = !!at;
    if (!at) return;
    const pulse = 1 + 0.08 * Math.sin(time * 4);
    const r = (at.radius + (sel!.kind === "building" ? 3 : RING_PAD)) * pulse;
    this.ring.position.set(at.x, at.y + 0.2, at.z);
    this.ring.scale.setScalar(r);
    this.material.opacity = 0.65 + 0.2 * Math.sin(time * 4);
  }

  dispose() {
    this.ring.geometry.dispose();
    this.material.dispose();
  }
}
