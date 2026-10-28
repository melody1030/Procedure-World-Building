import { fbm } from "../noise";
import { voxels } from "../scale";
import type { HeightMap } from "./heights";
import type { TerrainParams } from "./params";
import type { River } from "./river";
import type { Columns } from "./voxelize";
import { CLAIM, type Claims } from "./claims";

/**
 * Stage 7, surfaces: the whole island is one city of poured concrete. Every column gets a ground
 * type by rule, in this order (first match wins):
 *
 *   riverbed  inside the river channel
 *   plaza     a plaza (claimed by the streets)
 *   road      a street
 *   curb      the edge of a street or plaza: paving that borders anything that isn't paved, so
 *             each plaza is framed by a curb, open where streets come in
 *   bank      next to the channel: the quay
 *   ledge     a rim with a neighbor at least Ledge drop lower: a pale coping along the drop
 *   stairs    ground steeper than Stair slope: flights of concrete steps up the hillsides
 *   concrete  everything else
 *
 * Each column also gets one of three tones from slow noise, so the concrete is grimed in large
 * patches (Grime). Steepness is read from the height map from *before* terracing, across 3 m:
 * terrace edges are sudden steps that would read as near-vertical, and edges are Ledge drop's job,
 * so stairs mark only hillsides that are steep as a whole. Every step in the ground is faced with
 * a concrete retaining wall.
 */

export const SURFACE = { riverbed: 0, bank: 1, rock: 2, dirt: 3, grass: 4, road: 5, curb: 6, plaza: 7, sidewalk: 8, pavement: 9, concrete: 10, lawn: 11, paving: 12, planter: 13, path: 14, ledge: 15, stairs: 16 } as const;
/** Ground with no retaining wall under its steps: cliff rock shows instead (park hills, the riverbed). */
export const NATURAL_SIDES: ReadonlySet<number> = new Set([SURFACE.riverbed, SURFACE.lawn, SURFACE.grass, SURFACE.dirt, SURFACE.rock]);
/**
 * Laid in slabs: the size of each kind's square tiles in columns. `paintCity` gives alternate
 * tiles the darker and lighter tone (0 and 2), and the mesh shades them apart whatever Ground tones is.
 */
export const TILES: ReadonlyMap<number, number> = new Map([
  [SURFACE.plaza, 6],
  [SURFACE.paving, 8],
  [SURFACE.sidewalk, 4],
  [SURFACE.path, 4],
]);
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
  const LEDGE = voxels(p.ledgeDrop);
  const STEEP = Math.tan((p.stairSlope * Math.PI) / 180);
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
      else if (N4.some(([dx, dz]) => h - at(x + dx, z + dz) >= LEDGE)) s = SURFACE.ledge;
      else {
        const gx = (smoothAt(x + SLOPE_REACH, z) - smoothAt(x - SLOPE_REACH, z)) / (2 * SLOPE_REACH);
        const gz = (smoothAt(x, z + SLOPE_REACH) - smoothAt(x, z - SLOPE_REACH)) / (2 * SLOPE_REACH);
        s = Math.sqrt(gx * gx + gz * gz) > STEEP ? SURFACE.stairs : SURFACE.concrete;
      }
      kind[k] = s;
      // Paving has no tone patches, so its faces stay merged.
      if (s === SURFACE.road || s === SURFACE.curb || s === SURFACE.plaza) tone[k] = 1;
    }
  }
  return { kind, tone };
}
