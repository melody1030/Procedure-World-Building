import { defaultErosionParams, erodeDroplets, sampleHeightField } from "../../weeks/week02-noise-grid/erosion";
import { fbm, ridged, smoothstep } from "../noise";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import { FIELD_RES, MAX_TERRACES, MIN_TERRACES, SEABED, SEA_LEVEL, WATER_DEPTH, WORLD_SIZE, terraceTop } from "../scale";
import { FIELD_NODES, nodeCoord, type IslandData } from "./island";

/**
 * Stage 02, terrain and terraces.
 *
 * 1. Elevation on the coarse field: fBm for rolling ground, ridged noise for crests, and a
 *    flat-topped plateau, shaped by the island mask, then a power curve (Week 2 "Power" shaping)
 *    so lowlands flatten out.
 * 2. Hydraulic erosion: Week 2's droplet simulation, run on that same coarse field, carves
 *    valleys and moves sediment towards the coast.
 * 3. Terraces: each voxel column samples the eroded field and snaps to a level, one storey per
 *    step. Low-frequency noise nudges the boundaries so terrace edges wander.
 * 4. Clean-up: a majority filter removes one-column spikes and notches, and a flood fill drops
 *    islets too small to build on.
 * 5. Distance to water (breadth-first search from every water column) decides where beaches go,
 *    and is kept for the suitability map later.
 */

export const SURFACE = { seabed: 0, sand: 1, grass: 2, rock: 3, riverbed: 4, bank: 5 } as const;
export type Surface = (typeof SURFACE)[keyof typeof SURFACE];

export type TerrainParams = WorldParams["terrain"];

/** Coarse-field value below which a point is under water. */
export const SEA_THRESHOLD = 0.07;
/** Land pieces smaller than this many columns (about 7 × 7 m) are sunk. */
const MIN_ISLET = 250;
/** Beach width, in voxels from the water. */
const BEACH = 3;

export interface TerrainData {
  /** Columns per side (= WORLD_SIZE). Arrays below are row-major by z, then x. */
  n: number;
  /** Top of each column, in voxels. */
  height: Int16Array;
  /** Terrace level of each column; −1 is under water. */
  level: Int8Array;
  surface: Uint8Array;
  /** Steps (4-neighbour) from each land column to the nearest water column; 0 for water. */
  waterDistance: Uint16Array;
  /** How many terrace levels this seed has. */
  levels: number;
  /** The eroded coarse elevation field, (FIELD_RES + 1)² nodes. */
  elevation: Float32Array;
  /** Share of columns above the water. */
  landShare: number;
  maxHeight: number;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function buildElevation(rng: Rng, island: IslandData, params: TerrainParams): Float32Array {
  const seedBase = rng.int(0, 1e6);
  const seedRidge = rng.int(0, 1e6);
  const { plateau } = island;
  const field = new Float32Array(FIELD_NODES * FIELD_NODES);
  for (let j = 0; j < FIELD_NODES; j++) {
    for (let i = 0; i < FIELD_NODES; i++) {
      const u = nodeCoord(i);
      const v = nodeCoord(j);
      const k = j * FIELD_NODES + i;
      const m = island.mask[k];
      // Rises quickly from the coast, then stays flat inland: broad ground for terraces.
      const inland = smoothstep(0.05, 0.9, m);
      const rolling = 0.5 + 0.5 * fbm(u * 1.4 + 3.1, v * 1.4 - 1.7, seedBase, 3);
      const crest = ridged(u * 2.4 + 0.4, v * 2.4 + 8.2, seedRidge, 4);
      // The plateau: a flat top with steep sides.
      const high = 1 - smoothstep(0.7, 1, Math.hypot(u - plateau.u, v - plateau.v) / plateau.r);
      const e = 0.1 * m + inland * (0.22 + 0.28 * rolling + params.ridges * crest + params.plateau * high);
      field[k] = Math.pow(e, 1.3);
    }
  }
  return field;
}

/** 3 × 3 box blur, in place (edges keep their value). */
function blur(values: Float32Array, size: number) {
  const src = values.slice();
  for (let j = 1; j < size - 1; j++) {
    for (let i = 1; i < size - 1; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) sum += src[(j + dj) * size + i + di];
      values[j * size + i] = sum / 9;
    }
  }
}

/**
 * Runs Week 2's droplet erosion, then applies its result gently so it suits terraces:
 * - the change is blurred, so single droplet pits don't turn into speckled pillars once terraced;
 * - deposits count half, so valleys fill a little without whole slopes swelling;
 * - the sea floor never rises, so sediment cannot build new land and round off the coast or bay.
 */
function erode(field: Float32Array, droplets: number, rng: Rng) {
  const before = field.slice();
  erodeDroplets(field, FIELD_RES, droplets, { ...defaultErosionParams, erosionRadius: 2, maxLifetime: 40 }, () => rng.next());
  const change = new Float32Array(field.length);
  for (let k = 0; k < field.length; k++) change[k] = field[k] - before[k];
  blur(change, FIELD_NODES);
  blur(change, FIELD_NODES);
  for (let k = 0; k < field.length; k++) {
    const d = change[k] < 0 ? change[k] : change[k] * 0.5;
    field[k] = before[k] < SEA_THRESHOLD ? Math.min(before[k], before[k] + d) : before[k] + d;
  }
}

/** Each land column takes the level most of its 8 neighbours share, if it disagrees with them. */
function majorityFilter(level: Int8Array, n: number, levels: number) {
  const next = level.slice();
  const counts = new Int16Array(levels);
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const k = z * n + x;
      if (level[k] < 0) continue;
      counts.fill(0);
      let water = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const l = level[k + dz * n + dx];
          if (l < 0) water++;
          else counts[l]++;
        }
      }
      if (counts[level[k]] >= 3) continue;
      let best = level[k];
      for (let l = 0; l < levels; l++) if (counts[l] > counts[best]) best = l;
      next[k] = water >= 6 ? -1 : best;
    }
  }
  level.set(next);
}

/** Flood fill over land; pieces smaller than MIN_ISLET columns become water. */
function sinkIslets(level: Int8Array, n: number) {
  const seen = new Uint8Array(n * n);
  const stack: number[] = [];
  const piece: number[] = [];
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || level[start] < 0) continue;
    piece.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      piece.push(k);
      const x = k % n;
      const z = (k - x) / n;
      for (const [dx, dz] of NEIGHBOURS) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const nk = nz * n + nx;
        if (!seen[nk] && level[nk] >= 0) {
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    if (piece.length < MIN_ISLET) for (const k of piece) level[k] = -1;
  }
}

/** Breadth-first search outward from every water column at once. */
function distanceToWater(level: Int8Array, n: number): Uint16Array {
  const dist = new Uint16Array(n * n).fill(0xffff);
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  for (let k = 0; k < n * n; k++) {
    if (level[k] < 0) {
      dist[k] = 0;
      queue[tail++] = k;
    }
  }
  while (head < tail) {
    const k = queue[head++];
    const x = k % n;
    const z = (k - x) / n;
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const nk = nz * n + nx;
      if (dist[nk] > dist[k] + 1) {
        dist[nk] = dist[k] + 1;
        queue[tail++] = nk;
      }
    }
  }
  return dist;
}

export function buildTerrain(rng: Rng, island: IslandData, params: TerrainParams): TerrainData {
  // Always drawn, so choosing a level count never shifts the random numbers after it.
  const seeded = rng.int(MIN_TERRACES, MAX_TERRACES);
  const levels = params.terraces > 0 ? params.terraces : seeded;
  const seedEdge = rng.int(0, 1e6);

  // 1. Elevation.
  const field = buildElevation(rng, island, params);

  // 2. Erosion (Week 2's droplets). Its random numbers come from this stage's own generator.
  if (params.erosion > 0) erode(field, params.erosion, rng);

  // 3. Terraces, one voxel column at a time.
  let eMax = SEA_THRESHOLD + 1e-3;
  for (const e of field) eMax = Math.max(eMax, e);

  const n = WORLD_SIZE;
  const columnE = new Float32Array(n * n);
  const level = new Int8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const e = sampleHeightField(field, FIELD_RES, (x + 0.5) / n, (z + 0.5) / n);
      columnE[k] = e;
      if (e < SEA_THRESHOLD) {
        level[k] = -1;
        continue;
      }
      const t = ((e - SEA_THRESHOLD) / (eMax - SEA_THRESHOLD)) * levels;
      const wander = params.wander * fbm(x * 0.02, z * 0.02, seedEdge, 3);
      level[k] = Math.min(levels - 1, Math.max(0, Math.floor(t * 0.999 + wander)));
    }
  }

  // 4. Clean-up.
  majorityFilter(level, n, levels);
  majorityFilter(level, n, levels);
  sinkIslets(level, n);

  // 5. Distance to water, then heights and surfaces.
  const waterDistance = distanceToWater(level, n);
  const height = new Int16Array(n * n);
  const surface = new Uint8Array(n * n);
  let land = 0;
  let maxHeight = SEABED;
  for (let k = 0; k < n * n; k++) {
    if (level[k] < 0) {
      // Shallow shelf near the coast, deeper further out. Sunk islets stay just under the surface.
      const depth = Math.pow(Math.min(1, Math.max(0, columnE[k]) / SEA_THRESHOLD), 0.8);
      height[k] = Math.min(SEA_LEVEL - 1, SEABED + Math.round(depth * (WATER_DEPTH - 1)));
      surface[k] = SURFACE.seabed;
    } else {
      height[k] = terraceTop(level[k]);
      surface[k] = level[k] === 0 && waterDistance[k] <= BEACH ? SURFACE.sand : SURFACE.grass;
      land++;
    }
    maxHeight = Math.max(maxHeight, height[k]);
  }

  return { n, height, level, surface, waterDistance, levels, elevation: field, landShare: land / (n * n), maxHeight };
}
