import * as THREE from "three";
import { LEVEL_RAMP } from "../palette";
import type { WorldModel } from "../pipeline";

/**
 * The Terraces overlay, drawn as one RGBA texel per voxel column and sampled by the terrain
 * shader: each level gets a colour from the shore (dark) to the top (bright).
 */

const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

function ramp(stops: number[], t: number): number[] {
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const a = rgb(stops[i]);
  const b = rgb(stops[i + 1]);
  return a.map((v, c) => v + (b[c] - v) * (x - i));
}

export function buildTerraceOverlay(world: WorldModel): THREE.DataTexture {
  const { n, level, levels } = world.terrain;
  const data = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    if (level[k] < 0) continue;
    const colour = ramp(LEVEL_RAMP, levels > 1 ? level[k] / (levels - 1) : 0);
    data[k * 4] = colour[0];
    data[k * 4 + 1] = colour[1];
    data[k * 4 + 2] = colour[2];
    data[k * 4 + 3] = Math.round(0.85 * 255);
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
