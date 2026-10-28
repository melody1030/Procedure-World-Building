import { ARCHETYPES, buildBuilding } from "../buildings/registry";
import type { BuildingModel } from "../buildings/config";
import { findClashes, findOverlaps } from "../buildings/overlaps";
import { hash2 } from "../rng";
import { VOXEL_M } from "../scale";
import { DISTRICT, type Districts, type Lot } from "../terrain/districts";
import type { Streets } from "../terrain/streets";

/**
 * Which building stands on which lot, and how big (pure: no three.js). Each lot gets one building
 * from the library, picked by its district and sized to it:
 *
 * - the archetype: seeded among those that suit the lot's district and fit its footprint (each
 *   archetype has a smallest side it still reads well at); the Landmark is never picked here;
 * - the footprint: the room is the lot less GAP all round (lots already keep an alley between
 *   them), and the whole building, with everything that sticks out of its walls (awnings, porches,
 *   balconies, signs), is kept within it (see `fitBuilding`): so every building stands back from
 *   the sidewalk and its neighbors on a strip of its lot's concrete; width runs along the street,
 *   depth away from it;
 * - the height: the district's range, higher with the lot's density (nearer the plaza, busier),
 *   but at most SLENDER times the footprint's narrower side, so small lots get no needles;
 * - the facing: the entrance side (the model's +z) turned toward the street;
 * - the base: the lot's floor, the level its site is graded to (see gradeLots).
 *
 * One Landmark stands at the center of the plaza (no lot is big enough for it), taller than
 * everything else: the city's monument, seen from everywhere.
 */

export interface BuildingPlan {
  lot: number;
  archetype: string;
  seed: number;
  /** The room it must fit in, all of it (along the street, away from it), in meters: the lot less GAP all round. */
  room: { width: number; depth: number };
  /** The room again (the archetype is picked to suit it), and the height, in meters. */
  width: number;
  depth: number;
  height: number;
  /** Center of the footprint, in columns. */
  x: number;
  z: number;
  /** Rotation about y (radians) that turns the model's front (+z) to the street. */
  rotation: number;
  /** The ground the building stands on (voxels). */
  base: number;
}

/** Lots narrower than this (meters) get no building; the narrowest lots are exactly this. */
const MIN_LOT = 6;
/** The strip of lot left clear round each building (2 voxels), in meters; and the smallest body (meters). */
const GAP = 2 * VOXEL_M;
const MIN_BODY = 4.5;
/** How much narrower (meters) than it reads well at a district's slimmest building may still be built, before another district's is taken. */
const SQUEEZE = 1.5;
/** The tallest a building may be, as a multiple of its footprint's narrower side. */
const SLENDER = 8;
/** The Landmark's footprint on the plaza, and the paving it leaves around it, in meters. */
const LANDMARK_SIZE = 18;
const LANDMARK_RING = 3;
/** Height range per district (meters): low at density 0, high at density 1. */
const HEIGHTS: Record<number, [number, number]> = {
  [DISTRICT.core]: [55, 140],
  [DISTRICT.commercial]: [28, 75],
  [DISTRICT.megablock]: [24, 55],
  [DISTRICT.industrial]: [20, 50],
  [DISTRICT.wealthy]: [14, 30],
};
/** The smallest footprint side (meters) each archetype still reads well at. */
const MIN_SIDE: Record<string, number> = {
  "corporate-megatower": 12,
  "neon-commercial-tower": 6,
  "residential-skyscraper": 6,
  "research-lab-tower": 12,
  // (Narrower, a tall one's stacked modules run into each other.)
  "modular-apartment-block": 8,
  "twin-tower-complex": 14,
  "stacked-megablock": 8,
  "vertical-neighborhood": 14,
  "terraced-residential": 10,
  "tower-and-annex": 12,
};
/** The Landmark stands this much taller than the tallest other building. */
const LANDMARK_LEAD = 25;

const DISTRICT_KEYS = ["core", "commercial", "megablock", "industrial", "wealthy"] as const;

function lotFrame(lot: Lot) {
  const [a, b, , d] = lot.corners;
  const width = Math.hypot(b.x - a.x, b.z - a.z) * VOXEL_M;
  const depth = Math.hypot(d.x - a.x, d.z - a.z) * VOXEL_M;
  const x = lot.corners.reduce((s, q) => s + q.x, 0) / 4;
  const z = lot.corners.reduce((s, q) => s + q.z, 0) / 4;
  return { width, depth, x, z };
}

export function planBuildings(districts: Districts, streets: Streets, seed: number): BuildingPlan[] {
  const plans: BuildingPlan[] = [];
  const plaza = streets.plazas[0];
  const fits = (id: string, w: number, d: number) => Math.min(w, d) >= (MIN_SIDE[id] ?? 10);

  let tallest = 0;
  for (const lot of districts.lots) {
    const lotSize = lotFrame(lot);
    const { x, z } = lotSize;
    // (Lots are measured from rotated corners, so a 6 m side can come out a hair under 6.)
    if (Math.min(lotSize.width, lotSize.depth) < MIN_LOT - 0.01) continue;
    const width = lotSize.width - 2 * GAP;
    const depth = lotSize.depth - 2 * GAP;
    const r = (salt: number) => hash2(seed ^ 0x51ed, lot.id, salt);
    const key = DISTRICT_KEYS[lot.district];
    const suits = ARCHETYPES.filter((a) => a.id !== "landmark-tower" && a.districts.includes(key));
    const fitting = suits.filter((a) => fits(a.id, width, depth));
    // Nothing of the district's fits: its own slimmest if that is within SQUEEZE of fitting (so a
    // small megablock lot still gets a residential tower, not a shop tower); else the slimmest
    // building that does fit, of any district (those built much narrower than they read well at run
    // their parts into each other); failing that, the slimmest of all.
    const slimmest = (list: typeof ARCHETYPES) => [list.reduce((p, q) => ((MIN_SIDE[q.id] ?? 10) < (MIN_SIDE[p.id] ?? 10) ? q : p))];
    const own = suits.length ? slimmest(suits) : [];
    const anyFitting = ARCHETYPES.filter((a) => a.id !== "landmark-tower" && fits(a.id, width, depth));
    const all = ARCHETYPES.filter((a) => a.id !== "landmark-tower");
    const pool = fitting.length
      ? fitting
      : own.length && fits(own[0].id, width + SQUEEZE, depth + SQUEEZE)
        ? own
        : anyFitting.length
          ? slimmest(anyFitting)
          : slimmest(all);
    if (!pool.length) continue;
    const archetype = pool[Math.floor(r(1) * pool.length)].id;
    const [lo, hi] = HEIGHTS[lot.district] ?? [20, 40];
    const wanted = lo + (hi - lo) * Math.min(1, Math.max(0, lot.density)) * (0.75 + 0.25 * r(2));
    const height = Math.round(Math.max(12, Math.min(wanted, SLENDER * Math.min(width, depth))));
    tallest = Math.max(tallest, height);
    plans.push({
      lot: lot.id,
      room: { width, depth },
      archetype,
      seed: Math.floor(r(3) * 1e6),
      width,
      depth,
      height,
      x,
      z,
      rotation: Math.PI / 2 - lot.facing,
      base: lot.floor,
    });
  }
  // The Landmark, on the plaza: its entrance toward the plaza's south edge, like the city's own.
  if (plaza) {
    const side = Math.min(LANDMARK_SIZE, plaza.half * 2 * VOXEL_M - 2 * LANDMARK_RING);
    if (side >= 10)
      plans.push({
        lot: -1,
        room: { width: side + 2 * LANDMARK_RING, depth: side + 2 * LANDMARK_RING },
        archetype: "landmark-tower",
        seed: Math.floor(hash2(seed ^ 0x51ed, -1, 3) * 1e6),
        width: side,
        depth: side,
        height: Math.min(200, Math.max(170, tallest + LANDMARK_LEAD)),
        x: plaza.x,
        z: plaza.z,
        rotation: 0,
        base: plaza.level,
      });
  }
  return plans;
}

/**
 * Body sizes tried, as how much narrower and shallower than the room (meters), in order: first
 * GAP all round; then a little either way, down to none (its parts then cut flush with its walls).
 * And the flicker (m² of faces in one plane) and part clashes let pass.
 */
const FIT_SIZES: [number, number][] = [
  [2 * GAP, 2 * GAP],
  [2 * GAP + 0.25, 2 * GAP],
  [2 * GAP - 0.25, 2 * GAP],
  [2 * GAP, 2 * GAP + 0.25],
  [2 * GAP, 2 * GAP - 0.25],
  [2 * GAP + 0.5, 2 * GAP],
  [2 * GAP - 0.5, 2 * GAP],
  [2 * GAP + 0.75, 2 * GAP + 0.25],
  [0.25, 0.25],
  [0, 0],
];
const FLICKER = 0.5;

/**
 * Builds a plan's building within its room: the body GAP smaller than the room all round, so
 * awnings, porches, balconies and signs have that much to stick out into, and anything reaching
 * further cut off at the room's edge. The body is centered on the lot. Some archetypes build with
 * faces in one plane (flicker) or parts run into each other at a few sizes; then the next of
 * FIT_SIZES is tried, and the cleanest kept.
 */
export function fitBuilding(plan: BuildingPlan): BuildingModel {
  // (The Landmark keeps its own size: its room is the plaza less the paving ring.)
  if (plan.lot < 0) return buildBuilding(plan.archetype, { width: plan.width, depth: plan.depth, height: plan.height, seed: plan.seed }, plan.room);
  let best: { model: BuildingModel; score: number } | null = null;
  for (const [lessW, lessD] of FIT_SIZES) {
    const width = Math.max(MIN_BODY, plan.room.width - lessW);
    const depth = Math.max(MIN_BODY, plan.room.depth - lessD);
    const model = buildBuilding(plan.archetype, { width, depth, height: plan.height, seed: plan.seed }, plan.room);
    const clashes = Object.values(findClashes(model, 0).pairs).reduce((a, b) => a + b, 0);
    const score = findOverlaps(model, 0).area + clashes;
    if (!best || score < best.score) best = { model, score };
    if (score <= FLICKER + 1) break;
  }
  return best!.model;
}
