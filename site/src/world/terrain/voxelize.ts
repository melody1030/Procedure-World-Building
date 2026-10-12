import type { HeightMap } from "./heights";
import type { River } from "./river";

/**
 * Voxels: one column per 0.25 m square, its top a whole number of voxels. Runs last, after the
 * river.
 * The carved height map is rounded, never below one voxel above the plinth. River water is
 * rounded the same way and kept only where it stands above its bed.
 *
 * Terraces (Stage 4) run before the river, on the height map.
 */

/** Marks a column with no river water. */
export const NO_WATER = -32768;

export interface Columns {
  /** Columns per side (= WORLD_SIZE). Row-major by z, then x. */
  n: number;
  /** Top of each column, in voxels above the plinth. */
  height: Int16Array;
  /** River water surface per column, in voxels; NO_WATER where there is none. */
  water: Int16Array;
  min: number;
  max: number;
  /** The highest the ground may reach (Shaping's Height), in voxels. */
  top: number;
}

/** `h` is the finished height map (river and streets carved); `river` supplies the water. */
export function voxelize(map: HeightMap, h: Float32Array, river: River): Columns {
  const { n } = map;
  const height = new Int16Array(n * n);
  const water = new Int16Array(n * n).fill(NO_WATER);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < n * n; k++) {
    const top = Math.max(1, Math.round(h[k]));
    height[k] = top;
    min = Math.min(min, top);
    max = Math.max(max, top);
    if (river.water && !Number.isNaN(river.water[k])) {
      const w = Math.round(river.water[k]);
      if (w > top) water[k] = w;
    }
  }
  return { n, height, water, min, max, top: map.top };
}
