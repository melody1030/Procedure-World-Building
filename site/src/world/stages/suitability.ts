import { N4, bfsDistance } from "../grid";
import { smoothstep } from "../noise";
import type { WorldParams } from "../params";
import { SURFACE, type TerrainData } from "./terrain";
import type { WaterData } from "./water";

/**
 * Stage 05, suitability. Every land column gets a score in [0, 1] for "how good a place to build":
 *
 *   score = w₁ · room + w₂ · near water + w₃ · low ground   (defaults 0.45, 0.30, 0.25)
 *
 * - room: distance (breadth-first) to the nearest terrace edge, cliff or water, so the middle of a
 *   wide terrace scores high and a rim scores low;
 * - near water: falls off with distance to the sea, river or a lake (harbours, waterfronts);
 * - low ground: lower terraces first, the way real hillside towns grow up from the shore.
 *
 * The overlay draws this as a heatmap, so you can see why buildings appear where they do.
 */

export interface SuitabilityData {
  score: Float32Array;
  buildable: Uint8Array;
  /** Steps to the nearest sea, river or lake column. */
  waterDistance: Uint16Array;
  /** Steps to the nearest terrace edge, cliff or water. */
  edgeDistance: Uint16Array;
}

export function buildSuitability(terrain: TerrainData, water: WaterData, params: WorldParams["suitability"]): SuitabilityData {
  const { n, level, height, surface, levels } = terrain;
  const buildable = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) buildable[k] = level[k] >= 0 && water.kind[k] === 0 && surface[k] !== SURFACE.riverbed ? 1 : 0;

  const isEdge = (k: number) => {
    if (!buildable[k]) return true;
    const x = k % n;
    const z = (k - x) / n;
    for (const [dx, dz] of N4) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) return true;
      const nk = nz * n + nx;
      if (!buildable[nk] || height[nk] !== height[k]) return true;
    }
    return false;
  };
  const edgeDistance = bfsDistance(n, isEdge, (k) => buildable[k] === 1);
  const waterDistance = bfsDistance(n, (k) => level[k] < 0 || water.kind[k] !== 0);

  // Weights are normalised so the score stays in [0, 1] whatever the sliders say.
  const total = params.room + params.water + params.low;
  const [wRoom, wWater, wLow] = total > 0 ? [params.room / total, params.water / total, params.low / total] : [1 / 3, 1 / 3, 1 / 3];
  const score = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (!buildable[k]) continue;
    const room = smoothstep(1, 10, edgeDistance[k]);
    const nearWater = Math.exp(-waterDistance[k] / 70);
    const low = 1 - level[k] / Math.max(1, levels);
    score[k] = wRoom * room + wWater * nearWater + wLow * low;
  }
  return { score, buildable, waterDistance, edgeDistance };
}
