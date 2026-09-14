import type { NoiseParams } from "./types";

function hash(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ 0x27d4eb2d, 0x85ebca6b);
  h = h ^ (h >>> 15);
  h = Math.imul(h, 0xc2b2ae35);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function hash2D(x: number, y: number, seed: number): number {
  const n = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  return hash(n);
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Random value per integer cell, no interpolation — pure static. Returns [0, 1]. */
function whiteNoise2D(x: number, y: number, seed: number): number {
  return hash2D(Math.floor(x), Math.floor(y), seed);
}

/** Classic gradient (Perlin-style) noise. Returns [0, 1]. */
function perlinNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = x - x0;
  const sy = y - y0;

  const gradient = (ix: number, iy: number) => {
    const angle = hash2D(ix, iy, seed) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)];
  };
  const dotGrid = (ix: number, iy: number) => {
    const [gx, gy] = gradient(ix, iy);
    return (x - ix) * gx + (y - iy) * gy;
  };

  const u = fade(sx);
  const v = fade(sy);
  const nx0 = lerp(dotGrid(x0, y0), dotGrid(x1, y0), u);
  const nx1 = lerp(dotGrid(x0, y1), dotGrid(x1, y1), u);
  const n = lerp(nx0, nx1, v);
  return Math.min(1, Math.max(0, n * 0.7 + 0.5));
}

/** Distance to the nearest of one random feature point per cell (Worley F1). Returns [0, 1]. */
function cellularNoise2D(x: number, y: number, seed: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let minDist = 4;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const fx = gx + hash2D(gx, gy, seed);
      const fy = gy + hash2D(gx, gy, seed + 1);
      const dx = fx - x;
      const dy = fy - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }
  }
  return Math.min(1, minDist / 1.5);
}

function baseNoise(type: NoiseParams["noiseType"], x: number, y: number, seed: number): number {
  switch (type) {
    case "white":
      return whiteNoise2D(x, y, seed);
    case "perlin":
      return perlinNoise2D(x, y, seed);
    case "cellular":
      return cellularNoise2D(x, y, seed);
  }
}

/** Fractal Brownian Motion: sums `octaves` layers of the chosen base noise. Returns [0, 1]. */
export function sampleNoise(x: number, y: number, params: NoiseParams): number {
  let total = 0;
  let amplitude = 1;
  let maxAmplitude = 0;
  let frequency = params.scale;

  for (let o = 0; o < params.octaves; o++) {
    total += amplitude * baseNoise(params.noiseType, x * frequency, y * frequency, params.seed + o * 17);
    maxAmplitude += amplitude;
    amplitude *= params.persistence;
    frequency *= 2;
  }

  return maxAmplitude > 0 ? total / maxAmplitude : 0;
}
