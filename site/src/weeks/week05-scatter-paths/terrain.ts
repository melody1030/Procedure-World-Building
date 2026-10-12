import { fbm, ridged } from "../../world/noise";
import { hashSeed } from "../../world/rng";
import { GRID, MAX_HEIGHT, WORLD_SIZE } from "./config";
import type { TerrainParams } from "./types";

/**
 * A square heightmap over [-WORLD_SIZE/2, WORLD_SIZE/2] on x and z. Everything else in the week
 * (paths, scatter, particles) reads the terrain through `heightAt` and `normalAt`.
 */
export interface Heightmap {
  n: number;
  size: number;
  heights: Float32Array;
  minH: number;
  maxH: number;
}

const HALF = WORLD_SIZE / 2;
const CELL = WORLD_SIZE / (GRID - 1);

/** World x or z of grid index i. */
export const gridCoord = (i: number) => -HALF + i * CELL;

/** Rolling fbm hills with a ridged layer on top for steep crests (see the Noise & Maps notes). */
export function generateHeightmap({ seed, relief, scale }: TerrainParams): Heightmap {
  const s = hashSeed(seed);
  const heights = new Float32Array(GRID * GRID);
  const f = 0.07 * scale;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = gridCoord(i);
      const z = gridCoord(j);
      const hills = fbm(x * f, z * f, s, 5) * 0.5 + 0.5;
      const crests = ridged(x * f * 0.8 + 11.3, z * f * 0.8 - 4.7, s + 7, 4);
      const h = Math.pow(Math.max(0, hills * 0.65 + crests * 0.45 - 0.15), 1.5);
      heights[j * GRID + i] = h * MAX_HEIGHT * relief;
    }
  }
  return withRange({ n: GRID, size: WORLD_SIZE, heights, minH: 0, maxH: 0 });
}

export function withRange(map: Heightmap): Heightmap {
  let minH = Infinity;
  let maxH = -Infinity;
  for (const h of map.heights) {
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  return { ...map, minH, maxH: Math.max(maxH, minH + 1e-3) };
}

/** Bilinear height at any world position (clamped to the terrain's edge). */
export function heightAt(map: Heightmap, x: number, z: number): number {
  const n = map.n;
  const gx = Math.min(n - 1.001, Math.max(0, (x + HALF) / CELL));
  const gz = Math.min(n - 1.001, Math.max(0, (z + HALF) / CELL));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const h = map.heights;
  const a = h[j * n + i] + (h[j * n + i + 1] - h[j * n + i]) * fx;
  const b = h[(j + 1) * n + i] + (h[(j + 1) * n + i + 1] - h[(j + 1) * n + i]) * fx;
  return a + (b - a) * fz;
}

/** Surface normal from central differences, written into `out` as [x, y, z]. */
export function normalAt(map: Heightmap, x: number, z: number, out: number[] = [0, 1, 0]): number[] {
  const e = CELL;
  const dx = heightAt(map, x + e, z) - heightAt(map, x - e, z);
  const dz = heightAt(map, x, z + e) - heightAt(map, x, z - e);
  const nx = -dx;
  const ny = 2 * e;
  const nz = -dz;
  const len = Math.hypot(nx, ny, nz);
  out[0] = nx / len;
  out[1] = ny / len;
  out[2] = nz / len;
  return out;
}

/** Angle between the surface normal and straight up, in degrees. 0 is flat, 90 is a cliff. */
export function slopeAt(map: Heightmap, x: number, z: number): number {
  const ny = normalAt(map, x, z)[1];
  return (Math.acos(Math.min(1, ny)) * 180) / Math.PI;
}

/** 0 at the lowest point of the terrain, 1 at the highest. */
export function normalizedHeight(map: Heightmap, h: number): number {
  return (h - map.minH) / (map.maxH - map.minH);
}
