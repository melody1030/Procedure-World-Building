import { hash2 } from "./rng";

/**
 * Noise for the world (see docs/notes/noise-and-maps-notes.md). Everything takes an integer `seed`
 * so each stage can ask for its own independent field.
 */

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 16 unit gradients around the circle; each lattice point picks one by hash (no trig per sample). */
const GRADIENTS = 16;
const GX = Float64Array.from({ length: GRADIENTS }, (_, i) => Math.cos((i / GRADIENTS) * Math.PI * 2));
const GY = Float64Array.from({ length: GRADIENTS }, (_, i) => Math.sin((i / GRADIENTS) * Math.PI * 2));

/** Gradient (Perlin) noise. Returns roughly [-1, 1]. */
export function perlin(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  // Corner gradients dotted with the offset from each corner (written out: this is the hot loop).
  const g00 = (hash2(x0, y0, seed) * GRADIENTS) | 0;
  const g10 = (hash2(x0 + 1, y0, seed) * GRADIENTS) | 0;
  const g01 = (hash2(x0, y0 + 1, seed) * GRADIENTS) | 0;
  const g11 = (hash2(x0 + 1, y0 + 1, seed) * GRADIENTS) | 0;
  const d00 = fx * GX[g00] + fy * GY[g00];
  const d10 = (fx - 1) * GX[g10] + fy * GY[g10];
  const d01 = fx * GX[g01] + (fy - 1) * GY[g01];
  const d11 = (fx - 1) * GX[g11] + (fy - 1) * GY[g11];
  const u = fade(fx);
  const v = fade(fy);
  const a = d00 + (d10 - d00) * u;
  const b = d01 + (d11 - d01) * u;
  return (a + (b - a) * v) * 1.41;
}

/** Fractal Brownian motion: octaves of Perlin, each twice the frequency and half the amplitude. Roughly [-1, 1]. */
export function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let total = 0;
  let amplitude = 1;
  let norm = 0;
  let frequency = 1;
  for (let o = 0; o < octaves; o++) {
    total += amplitude * perlin(x * frequency, y * frequency, seed + o * 101);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}

/**
 * Ridged multifractal: folds each octave (1 − |n|) so zero-crossings become sharp crests, and
 * weights each octave by the one before so ridges stay crisp. Returns [0, 1].
 */
export function ridged(x: number, y: number, seed: number, octaves = 4): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let weight = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(perlin(x * frequency, y * frequency, seed + o * 131));
    n *= n * weight;
    weight = Math.min(1, n * 2);
    total += n * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return Math.min(1, total / norm);
}

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
