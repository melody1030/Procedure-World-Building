import { perlin } from "../noise";
import { hash2 } from "../rng";
import type { NoiseType, TerrainParams } from "./params";

/**
 * Stage 1, base noise: Week 2's noise stack on a field grid over the land.
 *
 * - Five base noises, each returning [0, 1]: Perlin, Ridged (1 − |n|), Billow (|n|),
 *   Cellular (Worley F1) and White.
 * - fBm: `octaves` layers, each `lacunarity` times the frequency and `persistence` times the
 *   amplitude of the one before (Week 2 fixed lacunarity at 2).
 * - The finished field is stretched to fill [0, 1], so every setting uses the whole height range.
 *
 * Coordinates: u and v run from 0 to 1 across the land, as in Week 2's map.
 */

export interface NoiseField {
  /** Cells across; the field has (res + 1)² nodes, row-major by v then u. */
  res: number;
  values: Float32Array;
}

/** Worley F1: distance to the nearest of one random feature point per cell. */
function cellular(x: number, y: number, seed: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let min = 4;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const dx = gx + hash2(gx, gy, seed) - x;
      const dy = gy + hash2(gx, gy, seed + 1) - y;
      min = Math.min(min, dx * dx + dy * dy);
    }
  }
  return Math.min(1, Math.sqrt(min) / 1.5);
}

function base(type: NoiseType, x: number, y: number, seed: number): number {
  switch (type) {
    case "perlin":
      return Math.min(1, Math.max(0, 0.5 + 0.5 * perlin(x, y, seed)));
    case "ridged":
      return 1 - Math.min(1, Math.abs(perlin(x, y, seed)));
    case "billow":
      return Math.min(1, Math.abs(perlin(x, y, seed)));
    case "cellular":
      return cellular(x, y, seed);
    case "white":
      return hash2(Math.floor(x), Math.floor(y), seed);
  }
}

/** Field samples across the land (one per 2.4 m); columns between samples are interpolated. */
const RESOLUTION = 96;

export function buildNoiseField(seed: number, p: TerrainParams["noise"]): NoiseField {
  const res = RESOLUTION;
  const nodes = res + 1;
  const values = new Float32Array(nodes * nodes);

  let lo = Infinity;
  let hi = -Infinity;
  for (let j = 0; j < nodes; j++) {
    for (let i = 0; i < nodes; i++) {
      const u = i / res;
      const v = j / res;
      let total = 0;
      let amplitude = 1;
      let norm = 0;
      let frequency = p.scale;
      for (let o = 0; o < p.octaves; o++) {
        total += amplitude * base(p.type, u * frequency, v * frequency, seed + o * 101);
        norm += amplitude;
        amplitude *= p.persistence;
        frequency *= p.lacunarity;
      }
      const value = norm > 0 ? total / norm : 0;
      values[j * nodes + i] = value;
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
  }

  // Stretch to [0, 1]: fBm piles values up around the middle, and the terrain should use its full height.
  const span = hi - lo || 1;
  // Clamped: float rounding can land a hair outside [0, 1], and the shaping curves take fractional powers.
  for (let k = 0; k < values.length; k++) values[k] = Math.min(1, Math.max(0, (values[k] - lo) / span));
  return { res, values };
}

/** Bilinear sample of the field at (u, v) in [0, 1]. */
export function sampleField(field: NoiseField, u: number, v: number): number {
  const { res, values } = field;
  const nodes = res + 1;
  const x = Math.min(res, Math.max(0, u * res));
  const y = Math.min(res, Math.max(0, v * res));
  const x0 = Math.min(res - 1, Math.floor(x));
  const y0 = Math.min(res - 1, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const k = y0 * nodes + x0;
  const a = values[k] + (values[k + 1] - values[k]) * fx;
  const b = values[k + nodes] + (values[k + nodes + 1] - values[k + nodes]) * fx;
  return a + (b - a) * fy;
}
