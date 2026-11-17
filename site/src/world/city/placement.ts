import { ARCHETYPES, buildBuilding } from "../buildings/registry";
import { TIER_TOPS, TIERS, tierOf, type Archetype, type BuildingModel, type Tier } from "../buildings/config";
import { findClashes, findOverlaps } from "../buildings/overlaps";
import { buildGrammar, type Clearance, type GrammarParams, type GrammarStyle } from "../buildings/grammar";
import { LOT_GROUND, STOREY, drawCityGrammar } from "../buildings/lotGrammar";
import { hash2 } from "../rng";
import { FIGURE_SCALE, VOXEL_M } from "../scale";
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
 *
 * Every lot but the Corporate Megatower's also gets a grammar building (`grammar`; see
 * docs/plans/grammar-city-plan.md §1): the body, its clearance and its settings, drawn from the
 * lot's size, height and seed. The archetype stays picked, for the Megatower and the library.
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
  /** The lot's grammar building, or null where a signature building stands (the Landmark, the Megatower). */
  grammar: GrammarPlan | null;
}

/** A grammar building on a lot: its settings and facade style and the room round its body (at full size: see fitGrammar), and the body's center (columns). */
export interface GrammarPlan {
  params: GrammarParams;
  style: GrammarStyle;
  clearance: Clearance;
  x: number;
  z: number;
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
/**
 * A grammar building's body on its lot (meters). Its sides are party walls: PARTY_WALL in from the
 * lot's side edges, so neighbors stand wall to wall (with a hairline between, as on a curve their
 * lots fan apart). Its back is on the lot's back edge (the alley behind is the lots' own). In front
 * it keeps as much of FRONT_ROOM as the depth can spare above GRAMMAR_MIN_DEPTH (at least
 * MIN_FRONT), so the street front's blade signs, awnings and balconies have room to reach out; a
 * corner lot's side on its cross street is a street front too and gets the same. A body past
 * GRAMMAR_MOST at full size (so GRAMMAR_MOST × FIGURE_SCALE on the lot: see fitGrammar) is kept to
 * it, centered across and to the street side.
 */
const PARTY_WALL = 0.25;
const FRONT_ROOM = 1.5;
const MIN_FRONT = 0.5;
const GRAMMAR_MIN_DEPTH = 6;
const GRAMMAR_MIN_WIDTH = 6;
const GRAMMAR_MOST = 40;
/** The archetypes that keep their own building rather than a grammar one. */
const SIGNATURE = new Set(["landmark-tower", "corporate-megatower"]);

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
      grammar: SIGNATURE.has(archetype) ? null : planGrammar(lot, lotSize, Math.min(height, Math.max(MIN_HEIGHT, Math.min(zone.limit, slender))), x, z, seed),
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
        grammar: null,
      });
  }
  return plans;
}

/**
 * A lot's grammar building: the body on its lot (see PARTY_WALL), its floors from the planned
 * height (the top floor within it), and the lot's own draw of settings, by its district and
 * frontage (lotGrammar.ts). Its room is the whole lot. `x`, `z` is the lot's center (columns); the
 * body moves off it by half the difference between opposite clearances.
 */
function planGrammar(lot: Lot, room: { width: number; depth: number }, height: number, x: number, z: number, seed: number): GrammarPlan {
  // Which side of the plan (x = 0 left, x = frontage right) the corner's cross street is on: the
  // side edge's middle against the plan's +x, which the rotation turns to (sin f, −cos f).
  let corner: "left" | "right" | undefined;
  if (lot.cornerSide) {
    const [p, q] = lot.cornerSide === "right" ? [lot.corners[1], lot.corners[2]] : [lot.corners[3], lot.corners[0]];
    const dot = ((p.x + q.x) / 2 - x) * Math.sin(lot.facing) - ((p.z + q.z) / 2 - z) * Math.cos(lot.facing);
    corner = dot > 0 ? "right" : "left";
  }
  const street = Math.min(FRONT_ROOM, Math.max(MIN_FRONT, room.width - PARTY_WALL - GRAMMAR_MIN_WIDTH));
  const left = corner === "left" ? street : PARTY_WALL;
  const right = corner === "right" ? street : PARTY_WALL;
  const most = GRAMMAR_MOST * FIGURE_SCALE;
  const frontage = Math.min(most, room.width - left - right);
  const front = Math.min(FRONT_ROOM, Math.max(MIN_FRONT, room.depth - GRAMMAR_MIN_DEPTH));
  const depth = Math.min(most, room.depth - front);
  // A body kept to GRAMMAR_MOST leaves the rest to its sides and back.
  const spare = room.width - left - right - frontage;
  const clearance: Clearance = { front, left: left + spare / 2, right: right + spare / 2, back: room.depth - front - depth };
  // The grammar builds at full size and the model is drawn at FIGURE_SCALE (see fitGrammar), so
  // it is given the body, the room and the height at full size: each over FIGURE_SCALE.
  const S = FIGURE_SCALE;
  const full = height / S;
  const floorsOver = (ground: number) => Math.max(2, 1 + Math.floor((full - ground) / STOREY));
  const floors = floorsOver(LOT_GROUND);
  const tier = tierOf((LOT_GROUND + (floors - 1) * STOREY) * S);
  const { params, style } = drawCityGrammar({ id: lot.id, salt: seed, frontage: frontage / S, depth: depth / S, floors, tier, district: lot.district, avenue: lot.street === "avenue", corner });
  // A taller ground floor (shops) takes its storeys from the top, so the top floor stays within the height.
  params.floors = floorsOver(params.groundFloor);
  // The body's offset from the room's center on the plan (meters: x across, z toward the street),
  // turned as the building is (rotation π/2 − facing), in columns.
  const ox = (clearance.left - clearance.right) / 2;
  const oz = (clearance.back - clearance.front) / 2;
  const [sin, cos] = [Math.sin(lot.facing), Math.cos(lot.facing)];
  const fullRoom: Clearance = { front: clearance.front / S, left: clearance.left / S, right: clearance.right / S, back: clearance.back / S };
  return { params, style, clearance: fullRoom, x: x + (ox * sin + oz * cos) / VOXEL_M, z: z + (oz * sin - ox * cos) / VOXEL_M };
}

/**
 * Builds a lot's grammar building within its room (see planGrammar): at full size, then scaled
 * by FIGURE_SCALE, the scale the city's people are drawn to (scale.ts), so its storeys, doors and
 * windows stand to them as they would to people at full size. The body then fills its lot.
 */
export function fitGrammar(grammar: GrammarPlan, seed: number): BuildingModel {
  return scaleModel(buildGrammar(grammar.params, seed, grammar.clearance, grammar.style).model, FIGURE_SCALE);
}

/** A model scaled by `s` about its origin (the footprint's corner on the ground): every vertex, its sizes and its parts' boxes. */
function scaleModel(model: BuildingModel, s: number): BuildingModel {
  for (const data of [model.solid, model.glow]) for (let i = 0; i < data.position.length; i++) data.position[i] *= s;
  return {
    ...model,
    width: model.width * s,
    depth: model.depth * s,
    height: model.height * s,
    fixtures: model.fixtures.map((f) => ({ ...f, box: f.box.map((v) => v * s) })),
  };
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
  // Built at full size and drawn at FIGURE_SCALE, as the grammar's are (see fitGrammar).
  const S = FIGURE_SCALE;
  const room = { width: plan.room.width / S, depth: plan.room.depth / S };
  const height = plan.height / S;
  // (The Landmark keeps its own size: its room is the plaza less the paving ring.)
  if (plan.lot < 0) return scaleModel(buildBuilding(plan.archetype, { width: plan.width / S, depth: plan.depth / S, height, seed: plan.seed }, room), S);
  let best: { model: BuildingModel; score: number } | null = null;
  for (const [lessW, lessD] of FIT_SIZES) {
    const width = Math.max(MIN_BODY, room.width - lessW);
    const depth = Math.max(MIN_BODY, room.depth - lessD);
    const model = buildBuilding(plan.archetype, { width, depth, height, seed: plan.seed }, room);
    const clashes = Object.values(findClashes(model, 0).pairs).reduce((a, b) => a + b, 0);
    const score = findOverlaps(model, 0).area + clashes;
    if (!best || score < best.score) best = { model, score };
    if (score <= FLICKER + 1) break;
  }
  return scaleModel(best!.model, S);
}
