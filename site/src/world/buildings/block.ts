import { tierOf, type Tier } from "./config";
import { DEFAULT_GRAMMAR, GRAMMAR_RANGES, type CrownType, type GrammarParams, type RoofType, type WindowType } from "./grammar";
import { massing, type Shape } from "./massing";
import { fbm } from "../noise";
import { Rng, hash2 } from "../rng";
import { voxels } from "../scale";

/**
 * The grammar's Simulation (docs/plans/building-grammar-plan.md §2.1, after Class 09's City
 * Morphology Demo): streets, blocks and lots on flat ground, a hidden height field, and the
 * grammar settings each lot draws for its building. Pure: no three.js. Sizes are in meters, on a
 * plan centered on the origin, x across and z down; a lot's building faces +z or −z, its street.
 *
 *   AREA   -> STREET (BAND STREET)+
 *   BAND   -> BLOCK (CROSS STREET BLOCK)*           cross streets staggered band by band
 *   BLOCK  -> ROW(faces −z) ROW(faces +z)           two rows of lots, back to back
 *   ROW    -> LOT+                                  cut at the frontage, jittered
 *   LOT    -> setbacks BODY | open                  the body under 6 × 8 m stays open
 *   BODY   -> BUILDING(height field, slender rule)  the grammar, with the lot's own draws
 */

export interface BlockParams {
  /** The square laid out, its side in meters. */
  area: number;
  /** A block's length along its street, and the street's width (sidewalks included), in meters. */
  blockLength: number;
  streetWidth: number;
  /** How much block lengths and lot depths vary, and how far cross streets stagger, 0–1. */
  irregularity: number;
  /** Each lot's street front and depth, in meters, and how much the fronts vary lot to lot, 0–0.5. */
  frontage: number;
  depth: number;
  jitter: number;
  /** How far the building stands back from the street, and from the lot's sides and back, in meters. */
  frontSetback: number;
  sideSetback: number;
  /** The height field: its range in meters, its features' size in meters, and how few tall ones it makes. */
  minHeight: number;
  maxHeight: number;
  district: number;
  contrast: number;
}

export const DEFAULT_BLOCK: BlockParams = {
  area: 320,
  blockLength: 80,
  streetWidth: 12,
  irregularity: 0.4,
  frontage: 14,
  depth: 22,
  jitter: 0.3,
  frontSetback: 2,
  sideSetback: 1.25,
  minHeight: 10,
  maxHeight: 100,
  district: 120,
  contrast: 2,
};

/**
 * The ranges the page offers. The setbacks start at what the grammar's parts reach past the body:
 * balconies 1.15 m on the sides and back, awnings 1.52 m in front.
 */
export const BLOCK_RANGES = {
  area: [200, 480],
  blockLength: [40, 160],
  streetWidth: [8, 20],
  irregularity: [0, 1],
  frontage: [8, 40],
  depth: [10, 40],
  jitter: [0, 0.5],
  frontSetback: [1.75, 6],
  sideSetback: [1.25, 4],
  minHeight: [8, 40],
  maxHeight: [20, 140],
  district: [40, 240],
  contrast: [0.5, 3],
} as const satisfies Record<keyof BlockParams, readonly [number, number]>;

/** The tallest a building may be, as a multiple of its body's narrower side (the city's rule). */
export const SLENDER = 8;
/** The grammar's storeys: the ground floor the lots draw with, and the city's 3 m above it. */
const GROUND = DEFAULT_GRAMMAR.groundFloor;
const STOREY = 3;

const quarter = (v: number) => Math.round(v * 4) / 4;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** A rectangle in plan, in meters: [x0, z0, x1, z1]. */
export type PlanRect = [number, number, number, number];

export interface Lot {
  id: number;
  block: number;
  rect: PlanRect;
  /** Which way its street is: +1 (+z) or −1 (−z). */
  facing: 1 | -1;
  /** The building's body (the lot less its setbacks), or null for an open lot. */
  body: PlanRect | null;
  /** The height field here (0–1), the height it asks for, and what held it: nothing or the slender rule (meters). */
  field: number;
  height: number;
  cap: "none" | "slender";
  floors: number;
  tier: Tier;
  /** The grammar settings and seed its building is drawn with (null for an open lot). */
  grammar: GrammarParams | null;
  seed: number;
}

export interface Layout {
  /** The plan's extent: [x0, z0, x1, z1], streets included. */
  extent: PlanRect;
  blocks: PlanRect[];
  lots: Lot[];
  stats: {
    blocks: number;
    lots: number;
    built: number;
    open: number;
    tallest: number;
    tiers: Record<Tier, number>;
    ms: number;
  };
}

export function validateBlock(p: Partial<BlockParams>): BlockParams {
  const c = { ...DEFAULT_BLOCK, ...p };
  const out = { ...c };
  for (const key of Object.keys(BLOCK_RANGES) as (keyof BlockParams)[]) {
    const v = Number(c[key]);
    out[key] = clamp(Number.isFinite(v) ? v : DEFAULT_BLOCK[key], BLOCK_RANGES[key]);
  }
  if (out.maxHeight < out.minHeight) out.maxHeight = out.minHeight;
  return out;
}

/**
 * Lays out the area. `streets` seeds the streets, lots and each lot's draws; `heights` the height
 * field, so New heights keeps every street and lot where it was.
 */
export function layoutBlocks(params: Partial<BlockParams>, streets: number, heights: number): Layout {
  const start = performance.now();
  const p = validateBlock(params);
  const r = (a: number, b: number) => hash2(a, b, streets ^ 0x3b1d);
  const half = p.area / 2;
  const sw = p.streetWidth;

  // Bands down z, each two rows of lots deep, its own depth varied by the irregularity.
  const bands: { z0: number; depth: number }[] = [];
  let z = -half + sw;
  for (let b = 0; ; b++) {
    const lotDepth = quarter(p.depth * (1 + 0.3 * p.irregularity * (2 * r(b, 1) - 1)));
    if (z + 2 * lotDepth > half - sw && bands.length) break;
    bands.push({ z0: z, depth: lotDepth });
    z += 2 * lotDepth + sw;
    if (z > half) break;
  }
  const bottom = bands[bands.length - 1].z0 + 2 * bands[bands.length - 1].depth + sw;
  // Centered on z, so a short last band doesn't leave the plan lopsided.
  const shift = (half - bottom) / 2;

  const blocks: PlanRect[] = [];
  const lots: Lot[] = [];
  const left = -half + sw;
  const right = half - sw;
  bands.forEach((band, b) => {
    const z0 = band.z0 + shift;
    const z1 = z0 + 2 * band.depth;
    // Cross streets: block lengths varied, the first offset band by band so they stagger.
    const cuts: number[] = [left];
    let x = left + quarter(p.blockLength * (1 - 0.5 * p.irregularity * r(b, 2)));
    for (let i = 0; x < right - p.blockLength / 2; i++) {
      cuts.push(x, x + sw);
      x += sw + quarter(p.blockLength * (1 + 0.5 * p.irregularity * (2 * r(b, 10 + i) - 1)));
    }
    cuts.push(right);
    for (let i = 0; i < cuts.length; i += 2) {
      const [x0, x1] = [cuts[i], cuts[i + 1]];
      if (x1 - x0 < 1) continue;
      const block = blocks.length;
      blocks.push([x0, z0, x1, z1]);
      // Two rows back to back: the near one faces the street above (−z), the far one the street below (+z).
      for (const facing of [-1, 1] as const) {
        const rz0 = facing < 0 ? z0 : z0 + band.depth;
        const rz1 = rz0 + band.depth;
        const n = Math.max(1, Math.round((x1 - x0) / p.frontage));
        const weights = Array.from({ length: n }, (_, j) => 1 + p.jitter * (2 * r(block * 2 + (facing + 1) / 2, 100 + j) - 1));
        const total = weights.reduce((s, w) => s + w, 0);
        let lx = x0;
        weights.forEach((w, j) => {
          const lx1 = j === n - 1 ? x1 : quarter(lx + ((x1 - x0) * w) / total);
          lots.push(makeLot(lots.length, block, [lx, rz0, lx1, rz1], facing, p, streets));
          lx = lx1;
        });
      }
    }
  });

  // The height field, sampled at each lot's center and stretched over the lots to the full range.
  const samples = lots.map((l) => fbm((l.rect[0] + l.rect[2]) / 2 / p.district, (l.rect[1] + l.rect[3]) / 2 / p.district, heights ^ 0x51a7, 3));
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  const tiers: Record<Tier, number> = { low: 0, mid: 0, high: 0 };
  let tallest = 0;
  lots.forEach((lot, i) => {
    lot.field = hi > lo ? (samples[i] - lo) / (hi - lo) : 0.5;
    if (!lot.body) return;
    const [bx0, bz0, bx1, bz1] = lot.body;
    const asked = p.minHeight + (p.maxHeight - p.minHeight) * Math.pow(lot.field, p.contrast);
    const slender = SLENDER * Math.min(bx1 - bx0, bz1 - bz0);
    lot.cap = slender < asked ? "slender" : "none";
    const height = Math.min(asked, slender);
    lot.floors = Math.round(clamp(1 + (height - GROUND) / STOREY, GRAMMAR_RANGES.floors));
    lot.height = GROUND + (lot.floors - 1) * STOREY;
    lot.tier = tierOf(lot.height);
    lot.grammar = drawGrammar(lot, streets);
    tiers[lot.tier]++;
    tallest = Math.max(tallest, lot.height);
  });

  const built = lots.filter((l) => l.body).length;
  const extent: PlanRect = [-half, -half + shift, half, bottom + shift];
  return {
    extent,
    blocks,
    lots,
    stats: { blocks: blocks.length, lots: lots.length, built, open: lots.length - built, tallest, tiers, ms: performance.now() - start },
  };
}

function makeLot(id: number, block: number, rect: PlanRect, facing: 1 | -1, p: BlockParams, streets: number): Lot {
  const [x0, z0, x1, z1] = rect;
  const bx0 = x0 + p.sideSetback;
  const bx1 = x1 - p.sideSetback;
  // The front setback on the street side, the rear one (the side setback) on the other.
  const bz0 = z0 + (facing < 0 ? p.frontSetback : p.sideSetback);
  const bz1 = z1 - (facing > 0 ? p.frontSetback : p.sideSetback);
  const [minW, maxW] = GRAMMAR_RANGES.frontage;
  const [minD, maxD] = GRAMMAR_RANGES.depth;
  const w = quarter(bx1 - bx0);
  const d = quarter(bz1 - bz0);
  let body: PlanRect | null = null;
  if (w >= minW && d >= minD) {
    // A body past the grammar's largest is centered across, and kept to the street side.
    const bw = Math.min(w, maxW);
    const bd = Math.min(d, maxD);
    const cx = quarter((bx0 + bx1) / 2 - bw / 2);
    const fz = facing > 0 ? bz1 - bd : bz0;
    body = [cx, fz, cx + bw, fz + bd];
  }
  return { id, block, rect, facing, body, field: 0, height: 0, cap: "none", floors: 0, tier: "low", grammar: null, seed: Math.floor(hash2(id, 0x9e37, streets) * 2 ** 31) };
}

/** A weighted pick: [value, weight] pairs. */
function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let t = rng.next() * total;
  for (const [v, w] of items) if ((t -= w) < 0) return v;
  return items[items.length - 1][0];
}

/**
 * The lot's own grammar settings, drawn from its seed and suited to its size and tier: courts on
 * wide lots, steps on tall ones, glass and helipads high up, gardens and shops low down.
 */
function drawGrammar(lot: Lot, streets: number): GrammarParams {
  const rng = new Rng(Math.floor(hash2(lot.id, 0x2c4f, streets) * 2 ** 32));
  const [bx0, bz0, bx1, bz1] = lot.body!;
  const frontage = bx1 - bx0;
  const depth = bz1 - bz0;
  const t = lot.tier;
  let shape: Shape = "bar";
  const roll = rng.next();
  if (lot.floors >= 10 && depth >= 14 && roll < 0.3) shape = "stepped";
  else if (frontage >= 20 && depth >= 16 && roll < 0.65) shape = frontage >= 24 && rng.chance(0.5) ? "u" : "l";
  const windowType = weighted<WindowType>(rng, t === "high" ? [["glass", 5], ["ribbon", 3], ["punched", 2]] : t === "mid" ? [["punched", 5], ["ribbon", 3.5], ["glass", 1.5]] : [["punched", 7], ["ribbon", 3]]);
  const bayWidth = rng.pick([1.75, 2, 2, 2.25, 2.5, 3]);
  const windowWidth = quarter(Math.min(bayWidth - 0.75, rng.range(1, 1.75)));
  const roof = weighted<RoofType>(rng, t === "high" ? [["gear", 4], ["helipad", 3.5], ["garden", 1], ["billboard", 1.5]] : t === "mid" ? [["gear", 4.5], ["garden", 2.5], ["billboard", 3]] : [["gear", 4], ["garden", 4.5], ["billboard", 1.5]]);
  const crown = weighted<CrownType>(rng, t === "high" ? [["none", 3], ["band", 3.5], ["cap", 3.5]] : t === "mid" ? [["none", 6], ["band", 3], ["cap", 1]] : [["none", 8.5], ["band", 1.5]]);
  return {
    ...DEFAULT_GRAMMAR,
    shape,
    frontage,
    depth,
    floors: lot.floors,
    groundFloor: GROUND,
    windowType,
    bayWidth,
    windowWidth: Math.max(0.5, windowWidth),
    windowHeight: quarter(rng.range(1.5, 2)),
    lit: rng.range(0.35, 0.75),
    balconies: t === "high" ? rng.range(0, 0.2) : rng.range(0.1, 0.5),
    roof,
    fill: rng.range(0.3, 0.8),
    padSize: 16,
    parapet: rng.pick([0.75, 0.75, 1]),
    crown,
  };
}

/**
 * Each built lot's massing as boxes, for the Masses view: [x0, y0, z0, x1, y1, z1] in voxels, on
 * the plan's frame (meters × 4), from the grammar's own plans and stages.
 */
export function massBoxes(lots: Lot[]): { lot: number; box: number[] }[] {
  const out: { lot: number; box: number[] }[] = [];
  for (const lot of lots) {
    if (!lot.body || !lot.grammar) continue;
    const [bx0, bz0, bx1, bz1] = lot.body.map(voxels);
    const W = bx1 - bx0;
    const D = bz1 - bz0;
    const plan = massing(lot.grammar.shape, W, D, lot.floors);
    const g = voxels(GROUND);
    const level = (j: number) => (j === 0 ? 0 : g + (j - 1) * voxels(STOREY));
    for (const st of plan.stages) {
      const y0 = level(st.j0);
      const y1 = level(st.j1 - 1) + (st.j1 - 1 === 0 ? g : voxels(STOREY));
      for (const [rx0, rz0, rx1, rz1] of st.rects) {
        // The plan's street is at z = D: facing +z it stands as drawn, facing −z it turns half round.
        const box =
          lot.facing > 0
            ? [bx0 + rx0, y0, bz0 + rz0, bx0 + rx1, y1, bz0 + rz1]
            : [bx1 - rx1, y0, bz1 - rz1, bx1 - rx0, y1, bz1 - rz0];
        out.push({ lot: lot.id, box });
      }
    }
  }
  return out;
}
