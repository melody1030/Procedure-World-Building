import * as THREE from "three";
import { N4 } from "../grid";
import { LEVEL_RAMP } from "../palette";
import type { WorldModel } from "../pipeline";
import type { DistrictType } from "../stages/districts";

/**
 * The rule overlays, drawn as one RGBA texel per voxel column and sampled by the terrain shader.
 * They show the numbers behind the city: which terrace, how suitable, which district.
 */

export type OverlayMode = "levels" | "suitability" | "districts";

export const DISTRICT_COLOURS: Record<DistrictType, number> = {
  core: 0xff4fd8,
  residential: 0x22d3ee,
  industrial: 0xffb340,
  waterfront: 0x3b82f6,
  green: 0x5dffb0,
};

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const lerp3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

function ramp(stops: number[], t: number): number[] {
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return lerp3(rgb(stops[i]), rgb(stops[i + 1]), x - i);
}

export function buildOverlay(world: WorldModel, mode: OverlayMode): THREE.DataTexture {
  const { n, level, levels } = world.terrain;
  const data = new Uint8Array(n * n * 4);
  const { score, buildable } = world.suitability;
  const { district, list } = world.districts;

  for (let k = 0; k < n * n; k++) {
    let colour: number[] | null = null;
    let alpha = 0.85;
    if (mode === "levels") {
      if (level[k] >= 0 && !world.water.kind[k]) colour = ramp(LEVEL_RAMP, levels > 1 ? level[k] / (levels - 1) : 0);
    } else if (mode === "suitability") {
      if (buildable[k]) colour = ramp([0x0f1e33, 0x155e75, 0x22d3ee, 0xf0fdff], score[k]);
    } else if (district[k] >= 0) {
      colour = rgb(DISTRICT_COLOURS[list[district[k]].type]);
      alpha = 0.6;
      // Cell borders brighter, so the Voronoi edges read.
      const x = k % n;
      const z = (k - x) / n;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < n && nz < n && district[nz * n + nx] >= 0 && district[nz * n + nx] !== district[k]) {
          colour = [255, 255, 255];
          alpha = 0.95;
        }
      }
    }
    if (!colour) continue;
    data[k * 4] = colour[0];
    data[k * 4 + 1] = colour[1];
    data[k * 4 + 2] = colour[2];
    data[k * 4 + 3] = Math.round(alpha * 255);
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
