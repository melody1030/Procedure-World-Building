import { WORLD_SIZE, voxels } from "../scale";
import { sampleField, type NoiseField } from "./noise";
import type { TerrainParams } from "./params";

/**
 * Height map: one continuous height (in voxels above the plinth) per 0.25 m column, before
 * anything is rounded, so the river can carve it. At each column's center:
 *
 *   h = 1 + noise · (Height − 1)
 *
 * so the ground runs from one voxel above the plinth where the noise is lowest to Shaping's
 * Height where it is highest. The whole square is land.
 */

export interface HeightMap {
  /** Columns per side (= WORLD_SIZE). Row-major by z, then x. */
  n: number;
  /** Height of each column, in voxels, not yet rounded. */
  h: Float32Array;
  /** The highest the ground may reach (Shaping's Height), in voxels. */
  top: number;
}

export function buildHeights(field: NoiseField, shaping: TerrainParams["shaping"]): HeightMap {
  const n = WORLD_SIZE;
  const top = voxels(shaping.height);
  const h = new Float32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      h[z * n + x] = 1 + sampleField(field, (x + 0.5) / n, (z + 0.5) / n) * (top - 1);
    }
  }
  return { n, h, top };
}
