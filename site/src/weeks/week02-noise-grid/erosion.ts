import { sampleNoise } from "./noise";
import { applyShaping } from "./shaping";
import type { Week1State } from "./types";

export interface ErosionParams {
  inertia: number;
  capacityFactor: number;
  minSlope: number;
  erodeSpeed: number;
  depositSpeed: number;
  evaporateSpeed: number;
  gravity: number;
  maxLifetime: number;
  initialWater: number;
  initialSpeed: number;
}

export const defaultErosionParams: ErosionParams = {
  inertia: 0.05,
  capacityFactor: 1.5,
  minSlope: 0.01,
  erodeSpeed: 0.08,
  depositSpeed: 0.15,
  evaporateSpeed: 0.02,
  gravity: 4,
  maxLifetime: 30,
  initialWater: 1,
  initialSpeed: 1,
};

/** Samples the noise/shaping stack onto a (resolution+1)^2 grid — the starting point for erosion. */
export function generateHeightField(resolution: number, state: Week1State): Float32Array {
  const cols = resolution + 1;
  const field = new Float32Array(cols * cols);
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const nx = col / resolution;
      const ny = row / resolution;
      const raw = sampleNoise(nx, ny, state);
      field[row * cols + col] = applyShaping(raw, state.shapingType, state.amount);
    }
  }
  return field;
}

/** Bilinear-samples a height field at normalized [0,1] map coordinates. */
export function sampleHeightField(field: Float32Array, resolution: number, nx: number, ny: number): number {
  const cols = resolution + 1;
  const x = Math.min(resolution, Math.max(0, nx * resolution));
  const y = Math.min(resolution, Math.max(0, ny * resolution));
  const x0 = Math.min(resolution - 1, Math.floor(x));
  const y0 = Math.min(resolution - 1, Math.floor(y));
  const fx = x - x0;
  const fy = y - y0;
  const h00 = field[y0 * cols + x0];
  const h10 = field[y0 * cols + x0 + 1];
  const h01 = field[(y0 + 1) * cols + x0];
  const h11 = field[(y0 + 1) * cols + x0 + 1];
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

function heightAndGradient(field: Float32Array, resolution: number, x: number, y: number) {
  const cols = resolution + 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const h00 = field[y0 * cols + x0];
  const h10 = field[y0 * cols + x0 + 1];
  const h01 = field[(y0 + 1) * cols + x0];
  const h11 = field[(y0 + 1) * cols + x0 + 1];
  const gradX = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
  const gradY = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
  const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
  return { height, gradX, gradY };
}

/** Adds `amount` of height, split across a cell's 4 corners by bilinear weight. */
function depositAt(field: Float32Array, resolution: number, x: number, y: number, amount: number) {
  const cols = resolution + 1;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  field[y0 * cols + x0] += amount * (1 - fx) * (1 - fy);
  field[y0 * cols + x0 + 1] += amount * fx * (1 - fy);
  field[(y0 + 1) * cols + x0] += amount * (1 - fx) * fy;
  field[(y0 + 1) * cols + x0 + 1] += amount * fx * fy;
}

/** Simulates a single water droplet's path, eroding and depositing sediment as it flows downhill. */
function simulateDroplet(field: Float32Array, resolution: number, rng: () => number, params: ErosionParams) {
  let x = rng() * resolution;
  let y = rng() * resolution;
  let dirX = 0;
  let dirY = 0;
  let speed = params.initialSpeed;
  let water = params.initialWater;
  let sediment = 0;

  for (let step = 0; step < params.maxLifetime; step++) {
    const nodeX = Math.floor(x);
    const nodeY = Math.floor(y);
    if (nodeX < 0 || nodeX >= resolution || nodeY < 0 || nodeY >= resolution) break;

    const { height: oldHeight, gradX, gradY } = heightAndGradient(field, resolution, x, y);

    dirX = dirX * params.inertia - gradX * (1 - params.inertia);
    dirY = dirY * params.inertia - gradY * (1 - params.inertia);
    const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1e-8;
    dirX /= len;
    dirY /= len;

    const prevX = x;
    const prevY = y;
    x += dirX;
    y += dirY;

    if (x < 0 || x >= resolution || y < 0 || y >= resolution) {
      x = prevX;
      y = prevY;
      break;
    }

    const newHeight = heightAndGradient(field, resolution, x, y).height;
    const deltaHeight = newHeight - oldHeight;
    const capacity = Math.max(-deltaHeight, params.minSlope) * speed * water * params.capacityFactor;

    if (deltaHeight > 0 || sediment > capacity) {
      const depositAmount =
        deltaHeight > 0 ? Math.min(deltaHeight, sediment) : (sediment - capacity) * params.depositSpeed;
      sediment -= depositAmount;
      depositAt(field, resolution, prevX, prevY, depositAmount);
    } else {
      const erodeAmount = Math.min((capacity - sediment) * params.erodeSpeed, -deltaHeight);
      depositAt(field, resolution, prevX, prevY, -erodeAmount);
      sediment += erodeAmount;
    }

    speed = Math.sqrt(Math.max(0, speed * speed - deltaHeight * params.gravity));
    water *= 1 - params.evaporateSpeed;
    if (water < 0.01) break;
  }

  // Whatever sediment remains when the droplet's life ends — off the edge,
  // dried up, or out of lifetime — goes back into the terrain here. Without
  // this, erosion "leaks" material out of the system every time a droplet
  // dies mid-carry, and the whole terrain slowly flattens instead of
  // settling into a stable, channel-carved shape.
  if (sediment > 0) {
    depositAt(field, resolution, x, y, sediment);
  }
}

/** Runs `count` droplets, mutating `field` in place. */
export function erodeDroplets(
  field: Float32Array,
  resolution: number,
  count: number,
  params: ErosionParams,
  rng: () => number,
) {
  for (let i = 0; i < count; i++) {
    simulateDroplet(field, resolution, rng, params);
  }
}

/** Small seeded PRNG (mulberry32) so erosion runs are reproducible per session. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
