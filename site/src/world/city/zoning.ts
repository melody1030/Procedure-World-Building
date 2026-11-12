import { TIER_TOPS } from "../buildings/config";
import { perlin } from "../noise";
import { VOXEL_M } from "../scale";
import { DISTRICT, DISTRICTS, NO_DISTRICT, type Districts } from "../terrain/districts";
import { CELL } from "../terrain/hubs";
import type { TerrainParams } from "../terrain/params";

/**
 * The zoning map: how tall the city may build where (pure: no three.js). One height limit per 2 m
 * cell, read by `planBuildings`. It is built from three terms:
 *
 *   limit = scale · (lo + (hi − lo) · density · skyline · variety)    the district's range
 * *
 * - The district's range: HEIGHTS, the lowest and highest each district builds; `density` is the
 *   district's base density (DISTRICTS), so busy districts reach further up their range. `scale`
 *   is the center height over HEIGHTS' tallest (140 m), so every range follows it.
 * - The skyline: 1 at the plaza, halving every FALLOFF meters along the streets (access, not
 *   straight-line distance). Far out, a district builds near its floor.
 * - Variety: slow noise (patches about VARIETY_WAVE across), 1 − VARIETY · (1 − noise), so heights
 *   vary in patches rather than lot by lot.
 * - Smoothing: one 3 × 3 pass over the cells with a district, so neighbors step rather than jump.
 *
 * A building's height is then the smaller of its lot's limit and SLENDER × its narrower side
 * (see placement.ts).
 */

/** The zoning settings: Build → Zoning (`params.zoning`). Read here only, never by the terrain. */
export type ZoningParams = TerrainParams["zoning"];

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
/** The skyline halves every this many meters along the streets (the old density fell to half at
 * the city's reach, about 220 m on every seed tried). */
const FALLOFF = 220;
/** How far the variety noise pulls heights down: 0.75–1, the old per-lot random factor's range. */
const VARIETY = 0.25;
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
export const HEIGHT_TIERS = TIER_TOPS;

export interface Zoning {
  cells: number;
  /** Height limit per cell, in meters; 0 where there is no district (roads, the plaza, water, parks). */
  limit: Float32Array;
  /** Per lot (by lot index): its limit, its center cell's. */
  lots: { limit: number }[];
  params: ZoningParams;
}

export function buildZoning(districts: Districts, seed: number, params: ZoningParams): Zoning {
  const { cells, district, access, lots } = districts;
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
    const a = Number.isFinite(access[c]) ? access[c] : 4 * FALLOFF;
    const skyline = 0.5 ** (a / FALLOFF);
    const cx = c % cells;
    const cz = (c - cx) / cells;
    const noise = Math.min(1, Math.max(0, 0.5 + 0.5 * perlin((cx * cellM) / VARIETY_WAVE, (cz * cellM) / VARIETY_WAVE, noiseSeed)));
    const variety = 1 - VARIETY * (1 - noise);
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

  const limit = new Float32Array(total);
  for (let c = 0; c < total; c++) if (smooth[c] > 0) limit[c] = smooth[c];

  // Each lot: its center cell's smoothed value, or its own district's middle where the center cell
  // has none.
  const lotLimits = lots.map((lot) => {
    const x = lot.corners.reduce((s, q) => s + q.x, 0) / 4;
    const z = lot.corners.reduce((s, q) => s + q.z, 0) / 4;
    const cx = Math.min(cells - 1, Math.max(0, Math.floor(x / CELL)));
    const cz = Math.min(cells - 1, Math.max(0, Math.floor(z / CELL)));
    const c = cz * cells + cx;
    const [lo, hi] = HEIGHTS[lot.district] ?? [20, 40];
    return { limit: smooth[c] > 0 ? smooth[c] : scale * (lo + (hi - lo) * 0.5 * DISTRICTS[lot.district].density) };
  });
  return { cells, limit, lots: lotLimits, params };
}
