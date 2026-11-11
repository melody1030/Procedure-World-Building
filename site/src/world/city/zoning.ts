import { perlin } from "../noise";
import { VOXEL_M } from "../scale";
import { CLAIM } from "../terrain/claims";
import { distanceTo } from "../terrain/distance";
import { DISTRICT, DISTRICTS, NO_DISTRICT, type Districts } from "../terrain/districts";
import { CELL } from "../terrain/hubs";

/**
 * The zoning map: how tall the city may build where (pure: no three.js). One height limit per 2 m
 * cell, read by `planBuildings`. It is built from four terms:
 *
 *   limit = scale · (lo + (hi − lo) · density · skyline · variety)    the district's range
 *           · avenue bonus (on a lot fronting an avenue)
 *           then at most the edge cap near the river and the parks
 *
 * - The district's range: HEIGHTS, the lowest and highest each district builds; `density` is the
 *   district's base density (DISTRICTS), so busy districts reach further up their range. `scale`
 *   is the center height over HEIGHTS' tallest (140 m), so every range follows it.
 * - The skyline: 1 at the plaza, halving every `falloff` meters along the streets (access, not
 *   straight-line distance). Far out, a district builds near its floor.
 * - Variety: slow noise (patches about VARIETY_WAVE across), 1 − variety · (1 − noise), so heights
 *   vary in patches rather than lot by lot.
 * - Smoothing: one 3 × 3 pass over the cells with a district, so neighbors step rather than jump.
 * - Avenues: a lot fronting an avenue may build `avenueBonus` times higher.
 * - Open edges: within EDGE of the river (its bank) or a park, the limit is at most `edgeCap`;
 *   past that the cap doubles every EDGE, so the city steps down toward open ground.
 *
 * A building's height is then the smaller of its lot's limit and SLENDER × its narrower side
 * (see placement.ts).
 */

export interface ZoningParams {
  /** The tallest limit, at the plaza, in meters; every district's range scales with it. */
  peak: number;
  /** The skyline halves every this many meters along the streets. */
  falloff: number;
  /** How many times higher a lot fronting an avenue may build. */
  avenueBonus: number;
  /** The limit within EDGE of the river or a park, in meters. */
  edgeCap: number;
  /** How far the slow noise pulls heights down, 0–1. */
  variety: number;
}

export const DEFAULT_ZONING: ZoningParams = { peak: 140, falloff: 220, avenueBonus: 1, edgeCap: 30, variety: 0.25 };

/** Height range per district (meters) at the default peak: lo far out and quiet, hi at the plaza at full density. */
export const HEIGHTS: Record<number, [number, number]> = {
  [DISTRICT.core]: [55, 140],
  [DISTRICT.commercial]: [28, 75],
  [DISTRICT.megablock]: [24, 55],
  [DISTRICT.industrial]: [20, 50],
  [DISTRICT.wealthy]: [14, 30],
};
/** HEIGHTS' tallest: the peak the ranges are written for. */
const HEIGHTS_PEAK = 140;
/** The edge cap holds this far from the river bank or a park (meters), and doubles every EDGE beyond. */
export const EDGE = 12;
/** Size of the variety noise's patches, in meters. */
const VARIETY_WAVE = 48;

/**
 * The Height limit tint: a heat map from navy (low) through violet and rose to amber (high), on a
 * log scale from HEIGHT_TINT_BOTTOM to HEIGHT_TINT_TOP, so the mid-rise band most lots sit in gets
 * the most color. Shared by the ground shader and the legend.
 */
export const HEIGHT_TINT_BOTTOM = 12;
export const HEIGHT_TINT_TOP = 140;
/** The tint texture holds limits up to this many meters. */
export const HEIGHT_TINT_ENCODE = 200;
export const HEIGHT_TINT_COLORS = [0x1f2f7a, 0x7c4dff, 0xf0508c, 0xffb82e] as const;
export const heightTintShare = (meters: number) =>
  Math.min(1, Math.max(0, Math.log(Math.max(meters, 1e-3) / HEIGHT_TINT_BOTTOM) / Math.log(HEIGHT_TINT_TOP / HEIGHT_TINT_BOTTOM)));
/** The tiers the tint's legend marks: low under 20 m, mid 20–60 m, high over 60 m. */
export const HEIGHT_TIERS = [20, 60] as const;

/** What set a limit below the district's own: nothing, or the open edge. */
export type LimitCap = "none" | "edge";

export interface Zoning {
  cells: number;
  /** Height limit per cell, in meters; 0 where there is no district (roads, the plaza, water, parks). */
  limit: Float32Array;
  /** Distance from each cell to the river bank or a park, in meters. */
  edge: Float32Array;
  /** Each lot's limit (by lot index): its center cell's, times the avenue bonus, under the edge cap. */
  lots: { limit: number; cap: LimitCap }[];
  params: ZoningParams;
}

/** The edge cap at `d` meters from the river or a park. */
function edgeCapAt(params: ZoningParams, d: number): number {
  return d <= EDGE ? params.edgeCap : params.edgeCap * 2 ** ((d - EDGE) / EDGE);
}

export function buildZoning(districts: Districts, seed: number, params: ZoningParams = DEFAULT_ZONING): Zoning {
  const { cells, district, access, lots } = districts;
  const { claim, n } = districts.claims;
  const cellM = CELL * VOXEL_M;
  const total = cells * cells;
  const scale = params.peak / HEIGHTS_PEAK;
  const noiseSeed = (seed ^ 0x2071e5) >>> 0;

  // The district's range, the skyline and the variety, per cell.
  const raw = new Float32Array(total);
  for (let c = 0; c < total; c++) {
    const d = district[c];
    if (d === NO_DISTRICT) continue;
    const [lo, hi] = HEIGHTS[d] ?? [20, 40];
    const a = Number.isFinite(access[c]) ? access[c] : 4 * params.falloff;
    const skyline = 0.5 ** (a / params.falloff);
    const cx = c % cells;
    const cz = (c - cx) / cells;
    const noise = Math.min(1, Math.max(0, 0.5 + 0.5 * perlin((cx * cellM) / VARIETY_WAVE, (cz * cellM) / VARIETY_WAVE, noiseSeed)));
    const variety = 1 - params.variety * (1 - noise);
    raw[c] = scale * (lo + (hi - lo) * DISTRICTS[d].density * skyline * variety);
  }

  // Smoothed over the cells with a district, so neighbors step rather than jump.
  const smooth = new Float32Array(total);
  for (let c = 0; c < total; c++) {
    if (district[c] === NO_DISTRICT) continue;
    const cx = c % cells;
    const cz = (c - cx) / cells;
    let sum = 0;
    let count = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
        const nc = z * cells + x;
        if (district[nc] === NO_DISTRICT) continue;
        sum += raw[nc];
        count++;
      }
    }
    smooth[c] = sum / count;
  }

  // The open edges: cells holding any river bank, water or park.
  const open = new Uint8Array(total);
  for (let z = 0; z < n; z++) {
    const row = Math.floor(z / CELL) * cells;
    for (let x = 0; x < n; x++) {
      const what = claim[z * n + x];
      if (what === CLAIM.river || what === CLAIM.bank || what === CLAIM.park) open[row + Math.floor(x / CELL)] = 1;
    }
  }
  const edge = distanceTo(open, cells);
  const limit = new Float32Array(total);
  for (let c = 0; c < total; c++) {
    edge[c] *= cellM;
    if (smooth[c] > 0) limit[c] = Math.min(smooth[c], edgeCapAt(params, edge[c]));
  }

  // Each lot: its center cell's smoothed value (or its own district's middle, where the center cell
  // has none), times the avenue bonus, then under the edge cap.
  const lotLimits = lots.map((lot) => {
    const x = lot.corners.reduce((s, q) => s + q.x, 0) / 4;
    const z = lot.corners.reduce((s, q) => s + q.z, 0) / 4;
    const cx = Math.min(cells - 1, Math.max(0, Math.floor(x / CELL)));
    const cz = Math.min(cells - 1, Math.max(0, Math.floor(z / CELL)));
    const c = cz * cells + cx;
    const [lo, hi] = HEIGHTS[lot.district] ?? [20, 40];
    const own = smooth[c] > 0 ? smooth[c] : scale * (lo + (hi - lo) * 0.5 * DISTRICTS[lot.district].density);
    const wanted = own * (lot.street === "avenue" ? params.avenueBonus : 1);
    const cap = edgeCapAt(params, edge[c]);
    return wanted > cap ? { limit: cap, cap: "edge" as const } : { limit: wanted, cap: "none" as const };
  });
  return { cells, limit, edge, lots: lotLimits, params };
}
