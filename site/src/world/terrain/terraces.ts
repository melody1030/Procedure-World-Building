import { fbm, smoothstep } from "../noise";
import { voxels } from "../scale";
import type { HeightMap } from "./heights";
import type { TerrainParams } from "./params";

/**
 * Stage 4, terraces: the smooth height map becomes stepped ground. For each land column:
 *
 *   level   = ⌊h / step + wander · fBm(x, z)⌋              which terrace it belongs to
 *   terrace = level · step                                   snapped down to that terrace
 *   s       = strength · ramp(slope, threshold)              how much to snap here
 *   h'      = mix(h, terrace, s)
 *
 * `ramp` is 0 on slopes gentler than the threshold and rises to 1 just past it, so gentle
 * hillsides stay as walkable voxel stairs while steeper ground becomes flat shelves and cliffs.
 * A threshold of 0 snaps everywhere. Slope is read from the unterraced map (central differences
 * two columns apart). Ground never drops below one voxel above the plinth.
 *
 * Heights stay continuous (rounding happens in voxelize), so the river can still carve them.
 */

/** Wander noise frequency: about one wobble every 50 m. */
const WANDER_FREQ = 0.005;

export function buildTerraces(seed: number, map: HeightMap, p: TerrainParams["terraces"]): HeightMap {
  const { n, h: src } = map;
  if (p.strength <= 0) return map;
  const step = voxels(p.height);
  const seedWander = seed ^ 0x3c6ef372;
  const tanLow = Math.tan((p.slope * 0.6 * Math.PI) / 180);
  const tanHigh = Math.tan((p.slope * Math.PI) / 180);
  const at = (x: number, z: number) => src[Math.min(n - 1, Math.max(0, z)) * n + Math.min(n - 1, Math.max(0, x))];

  const h = new Float32Array(src.length);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const v = src[k];
      if (v < 1) {
        h[k] = v;
        continue;
      }
      let s = p.strength;
      if (p.slope > 0) {
        const gx = (at(x + 2, z) - at(x - 2, z)) / 4;
        const gz = (at(x, z + 2) - at(x, z - 2)) / 4;
        s *= smoothstep(tanLow, tanHigh, Math.sqrt(gx * gx + gz * gz));
      }
      if (s <= 0) {
        h[k] = v;
        continue;
      }
      const wander = p.wander > 0 ? p.wander * fbm(x * WANDER_FREQ, z * WANDER_FREQ, seedWander, 3) : 0;
      const terrace = Math.floor(v / step + wander) * step;
      h[k] = Math.max(1, v + (terrace - v) * s);
    }
  }
  return { n, h, top: map.top };
}
