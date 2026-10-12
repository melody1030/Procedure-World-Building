import { fbm } from "../noise";
import { voxels } from "../scale";
import type { HeightMap } from "./heights";
import type { TerrainParams } from "./params";
import type { River } from "./river";
import type { Columns } from "./voxelize";
import { CLAIM, type Claims } from "./claims";

/**
 * Stage 7, surfaces: every column gets a ground type by rule, in this order (first match wins):
 *
 *   riverbed  inside the river channel
 *   plaza     a plaza (claimed by the streets)
 *   road      a street
 *   curb      the edge of a street or plaza: paving that borders anything that isn't paved, so
 *             each plaza is framed by a curb, open where streets come in
 *   bank      next to the channel
 *   rock      a cliff rim (a neighbor at least Rock cliff lower), or the highest land: Grass limit
 *             is the share of land (by area, lowest first) that may be grass
 *   dirt      ground steeper than Dirt slope: the voxel stairs on hillsides
 *   grass     everything else
 *
 * Each column also gets one of three tones from slow noise, so large areas vary without changing
 * type. Steepness is read from the height map from *before* terracing, across 3 m: terrace
 * edges are sudden steps that would read as near-vertical, and edges are the Rock cliff rule's job,
 * so dirt marks only hillsides that are steep as a whole.
 */

export const SURFACE = { riverbed: 0, bank: 1, rock: 2, dirt: 3, grass: 4, road: 5, curb: 6, plaza: 7 } as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];

export interface Surfaces {
  kind: Uint8Array;
  /** 0, 1 or 2: darker, normal, lighter. */
  tone: Uint8Array;
}

/** Half the window slope is measured over, in columns: 6 columns each side, 3 m across. */
const SLOPE_REACH = 6;
/** Tone noise frequency: patches about 20 m across. */
const TONE_FREQ = 0.012;

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function buildSurfaces(seed: number, cols: Columns, river: River, claims: Claims, curb: Uint8Array, before: HeightMap, p: TerrainParams["surfaces"]): Surfaces {
  const { n, height } = cols;
  const CLIFF = voxels(p.rockCliff);
  const STEEP = Math.tan((p.dirtSlope * Math.PI) / 180);
  const GRASS_TOP = grassTop(height, p.grassLimit);
  const smooth = before.h;
  const channel = river.channel;
  const claim = claims.claim;
  const kind = new Uint8Array(n * n);
  const tone = new Uint8Array(n * n);
  const at = (x: number, z: number) => height[Math.min(n - 1, Math.max(0, z)) * n + Math.min(n - 1, Math.max(0, x))];
  const smoothAt = (x: number, z: number) => smooth[Math.min(n - 1, Math.max(0, z)) * n + Math.min(n - 1, Math.max(0, x))];

  const seedTone = seed ^ 0x1f83d9ab;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const h = height[k];
      const t = 0.5 + 0.5 * fbm(x * TONE_FREQ, z * TONE_FREQ, seedTone, 2);
      tone[k] = t < 0.38 ? 0 : t < 0.62 ? 1 : 2;

      let s: Surface;
      if (channel?.[k]) s = SURFACE.riverbed;
      else if (curb[k]) s = SURFACE.curb;
      else if (claim[k] === CLAIM.plaza) s = SURFACE.plaza;
      else if (claim[k] === CLAIM.road) s = SURFACE.road;
      else if (channel && N4.some(([dx, dz]) => channel[Math.min(n - 1, Math.max(0, z + dz)) * n + Math.min(n - 1, Math.max(0, x + dx))])) s = SURFACE.bank;
      else if (h > GRASS_TOP || N4.some(([dx, dz]) => h - at(x + dx, z + dz) >= CLIFF)) s = SURFACE.rock;
      else {
        const gx = (smoothAt(x + SLOPE_REACH, z) - smoothAt(x - SLOPE_REACH, z)) / (2 * SLOPE_REACH);
        const gz = (smoothAt(x, z + SLOPE_REACH) - smoothAt(x, z - SLOPE_REACH)) / (2 * SLOPE_REACH);
        s = Math.sqrt(gx * gx + gz * gz) > STEEP ? SURFACE.dirt : SURFACE.grass;
      }
      kind[k] = s;
      // Paving has no tone patches, so its faces stay merged.
      if (s === SURFACE.road || s === SURFACE.curb || s === SURFACE.plaza) tone[k] = 1;
    }
  }
  return { kind, tone };
}

/**
 * The height below which `share` of the land lies (a percentile by area). Ground above it is bare
 * rock, so every terrain gets about the same amount of bare peak, however tall or flat it is.
 */
function grassTop(height: Int16Array, share: number): number {
  if (share >= 1) return Infinity;
  const counts = new Map<number, number>();
  let land = 0;
  for (const h of height) {
    counts.set(h, (counts.get(h) ?? 0) + 1);
    land++;
  }
  const levels = [...counts.keys()].sort((a, b) => a - b);
  let below = 0;
  for (const h of levels) {
    below += counts.get(h)!;
    if (below >= share * land) return h;
  }
  return Infinity;
}
