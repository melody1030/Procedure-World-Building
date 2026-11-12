import { ARCHETYPES, buildBuilding } from "../buildings/registry";
import { TIER_TOPS, TIERS, tierOf, type Archetype, type BuildingModel, type Tier } from "../buildings/config";
import { findClashes, findOverlaps } from "../buildings/overlaps";
import { hash2 } from "../rng";
import { VOXEL_M } from "../scale";
import type { Districts, Lot } from "../terrain/districts";
import type { Streets } from "../terrain/streets";
import type { Zoning } from "./zoning";

/**
 * Which building stands on which lot, and how big (pure: no three.js). Each lot gets one building
 * from the library, picked by its district and sized to it:
 *
 * - the archetype: seeded among those that suit the lot's district and its height tier (low-rise
 *   under 20 m, mid-rise to 60 m, high-rise above) and fit its footprint (each archetype has the
 *   tiers and the smallest side it still reads well at, and some a height they never build under);
 *   in order: its district's for its tier; its district's for a lower tier, the height brought down
 *   to it; any district's for its tier; the slimmest fallback (of those that can build that low).
 *   Where none fits, the slimmest within SQUEEZE of fitting is taken at each step.
 *   The Landmark is never picked here;
 * - the footprint: the room is the lot less GAP all round (lots already keep an alley between
 *   them), and the whole building, with everything that sticks out of its walls (awnings, porches,
 *   balconies, signs), is kept within it (see `fitBuilding`): so every building stands back from
 *   the sidewalk and its neighbors on a strip of its lot's concrete; width runs along the street,
 *   depth away from it;
 * - the height: the zoning map's limit for the lot (see zoning.ts: the district's range, the
 *   skyline falling off from the plaza and slow variety), but
 *   at most SLENDER times the footprint's narrower side, so small lots get no needles;
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
  /** The zoning map's limit for its lot (meters), and what held the height below it: the slender rule, a lower tier (no building of its district for its own), or nothing. */
  limit: number;
  cap: "none" | "slender" | "tier";
  /** Its height tier, and how its archetype was picked (see planBuildings): its district's for its tier; its district's for a lower tier; any district's for its tier; or the slimmest fallback. */
  tier: Tier;
  pick: "district" | "lower" | "tier" | "fallback";
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
/** No building is lower than this (meters). */
const MIN_HEIGHT = 12;
/** An archetype with a floor (`minHeight`) may still take a lot this much (meters) lower than it. */
const HEIGHT_SLACK = 3;
/** The Landmark stands this much taller than the tallest other building. */
const LANDMARK_LEAD = 25;

const DISTRICT_KEYS = ["core", "commercial", "megablock", "industrial", "wealthy"] as const;
/** Every archetype a lot can take (the Landmark only stands on the plaza). */
const PLACEABLE = ARCHETYPES.filter((a) => a.id !== "landmark-tower");
const slimmest = (list: Archetype[]) => list.reduce((p, q) => (q.minSide < p.minSide ? q : p));

function lotFrame(lot: Lot) {
  const [a, b, , d] = lot.corners;
  const width = Math.hypot(b.x - a.x, b.z - a.z) * VOXEL_M;
  const depth = Math.hypot(d.x - a.x, d.z - a.z) * VOXEL_M;
  const x = lot.corners.reduce((s, q) => s + q.x, 0) / 4;
  const z = lot.corners.reduce((s, q) => s + q.z, 0) / 4;
  return { width, depth, x, z };
}

export function planBuildings(districts: Districts, streets: Streets, zoning: Zoning, seed: number): BuildingPlan[] {
  const plans: BuildingPlan[] = [];
  const plaza = streets.plazas[0];

  let tallest = 0;
  for (const lot of districts.lots) {
    const lotSize = lotFrame(lot);
    const { x, z } = lotSize;
    // (Lots are measured from rotated corners, so a 6 m side can come out a hair under 6.)
    if (Math.min(lotSize.width, lotSize.depth) < MIN_LOT - 0.01) continue;
    const width = lotSize.width - 2 * GAP;
    const depth = lotSize.depth - 2 * GAP;
    const r = (salt: number) => hash2(seed ^ 0x51ed, lot.id, salt);
    const zone = zoning.lots[lot.id];
    const slender = SLENDER * Math.min(width, depth);
    let height = Math.round(Math.max(MIN_HEIGHT, Math.min(zone.limit, slender)));
    let cap: BuildingPlan["cap"] = slender < zone.limit ? "slender" : "none";
    const tier = tierOf(height);
    const fits = (a: Archetype) => Math.min(width, depth) >= a.minSide;
    const reaches = (a: Archetype, h: number) => h >= (a.minHeight ?? 0) - HEIGHT_SLACK;
    const suits = (a: Archetype, t: Tier, h: number) => fits(a) && a.tiers.includes(t) && reaches(a, h);
    const own = PLACEABLE.filter((a) => a.districts.includes(DISTRICT_KEYS[lot.district]));
    let pick: BuildingPlan["pick"] = "district";
    // 1. Its district's buildings for its tier that fit; else the slimmest of them, if that is
    //    within SQUEEZE of fitting (so a small megablock lot still gets a residential tower, not
    //    a shop tower).
    let pool = own.filter((a) => suits(a, tier, height));
    const squeezed = (list: Archetype[]) => {
      const near = list.filter((a) => a.tiers.includes(tier) && reaches(a, height) && Math.min(width, depth) + SQUEEZE >= a.minSide);
      return near.length ? [slimmest(near)] : [];
    };
    if (!pool.length) pool = squeezed(own);
    // 2. Its district's buildings that fit a lower tier: the height comes down to that tier's top.
    //    (Never up: that would break the limit.)
    if (!pool.length) {
      for (const lower of TIERS.slice(0, TIERS.indexOf(tier)).reverse()) {
        const top = lower === "low" ? TIER_TOPS[0] - 1 : TIER_TOPS[1];
        pool = own.filter((a) => suits(a, lower, top));
        if (pool.length) {
          height = top;
          cap = "tier";
          pick = "lower";
          break;
        }
      }
    }
    // 3. Any district's buildings for its tier that fit; else the slimmest of them within SQUEEZE.
    if (!pool.length) {
      pool = PLACEABLE.filter((a) => suits(a, tier, height));
      if (!pool.length) pool = squeezed(PLACEABLE);
      pick = "tier";
    }
    // 4. Nothing for its tier: among those that can build this low (no floor far above it), its
    //    own district's slimmest if that is within SQUEEZE of fitting; else the slimmest that does
    //    fit, of any district (those built much narrower than they read well at run their parts into
    //    each other); failing that, the slimmest of all.
    if (!pool.length) {
      pick = "fallback";
      const low = PLACEABLE.filter((a) => reaches(a, height));
      const ownLow = own.filter((a) => reaches(a, height));
      const ownSlim = ownLow.length ? slimmest(ownLow) : null;
      const anyFitting = low.filter(fits);
      pool = ownSlim && Math.min(width, depth) + SQUEEZE >= ownSlim.minSide ? [ownSlim] : [slimmest(anyFitting.length ? anyFitting : low.length ? low : PLACEABLE)];
    }
    const archetype = pool[Math.floor(r(1) * pool.length)].id;
    tallest = Math.max(tallest, height);
    plans.push({
      lot: lot.id,
      room: { width, depth },
      archetype,
      seed: Math.floor(r(3) * 1e6),
      width,
      depth,
      height,
      limit: zone.limit,
      cap,
      tier: tierOf(height),
      pick,
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
        limit: 200,
        cap: "none",
        tier: "high",
        pick: "district",
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
