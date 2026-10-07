import { GeometryBuilder, lin, mix, shade, type GeometryData, type RGB } from "../geometry";
import { N4 } from "../grid";
import { fbm } from "../noise";
import { TERRAIN } from "../palette";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import { CHUNK, SEABED, SEA_LEVEL, STOREY, WATER_DEPTH } from "../scale";
import { SURFACE, type TerrainData } from "./terrain";
import type { WaterData } from "./water";

/**
 * Stage 04, voxelise. Turns the column heights into meshes with greedy meshing (Week 3).
 *
 * - Surfaces first: cliff rims that drop two storeys or more become rock.
 * - Top faces: neighbouring columns with the same height and surface are merged into one
 *   rectangle (grow along x as far as possible, then along z while the whole row matches).
 *   Each grass patch gets one of three tones from low-frequency noise, so merged areas still vary.
 * - Side faces: a column shows a side wherever its neighbour is lower; runs of identical sides along
 *   a line are merged into one quad.
 * - Merging never crosses a chunk border, so each chunk could be rebuilt on its own.
 * - The river and lake surfaces and their waterfalls are a separate water mesh.
 */

export interface VoxelMeshes {
  terrain: GeometryData;
  water: GeometryData;
  /** Faces before and after merging, for the pipeline panel. */
  naiveFaces: number;
  mergedFaces: number;
}

type Col = RGB;

const C = {
  grassLow: lin(TERRAIN.grassLow),
  grassHigh: lin(TERRAIN.grassHigh),
  sand: lin(TERRAIN.sand),
  sandSide: lin(TERRAIN.sandSide),
  cliffTop: lin(TERRAIN.cliffTop),
  cliffBottom: lin(TERRAIN.cliffBottom),
  seabedShallow: lin(TERRAIN.seabedShallow),
  seabedDeep: lin(TERRAIN.seabedDeep),
  rock: lin(TERRAIN.rock),
  riverbed: lin(TERRAIN.riverbed),
  bank: lin(TERRAIN.bank),
  water: lin(TERRAIN.water),
  foamLow: lin(TERRAIN.foamLow),
  foamHigh: lin(TERRAIN.foamHigh),
};

const cliffAt = (y: number): Col => mix(C.cliffBottom, C.cliffTop, Math.min(1, Math.max(0, (y - SEABED) / 44)));

/** 2D greedy merge over an n × n grid of keys (−1 = nothing), within chunks. Without `greedy`, every cell is its own rectangle. */
function greedyRects(keys: Int32Array, n: number, greedy: boolean, emit: (x: number, z: number, w: number, d: number, key: number) => void) {
  const done = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const key = keys[k];
      if (done[k] || key < 0) continue;
      const chunkX = Math.floor(x / CHUNK) * CHUNK + CHUNK;
      const chunkZ = Math.floor(z / CHUNK) * CHUNK + CHUNK;
      let w = 1;
      while (greedy && x + w < chunkX && x + w < n && !done[k + w] && keys[k + w] === key) w++;
      let d = 1;
      grow: while (greedy && z + d < chunkZ && z + d < n) {
        for (let i = 0; i < w; i++) {
          const kk = (z + d) * n + x + i;
          if (done[kk] || keys[kk] !== key) break grow;
        }
        d++;
      }
      for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) done[(z + j) * n + x + i] = 1;
      emit(x, z, w, d, key);
    }
  }
}

export function buildVoxels(rng: Rng, terrain: TerrainData, water: WaterData, params: WorldParams["voxels"]): VoxelMeshes {
  const { n, height, level, surface, levels } = terrain;
  const TONES = [1 - params.tones, 1, 1 + params.tones];
  const half = n / 2;
  const seedTone = rng.int(0, 1e6);
  const heightAt = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? SEABED : height[z * n + x]);

  // Rock on rims that drop two storeys or more.
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (surface[k] !== SURFACE.grass) continue;
      for (const [dx, dz] of N4) {
        if (heightAt(x + dx, z + dz) <= height[k] - 2 * STOREY) {
          surface[k] = SURFACE.rock;
          break;
        }
      }
    }
  }

  const builder = new GeometryBuilder();
  let naive = 0;
  let merged = 0;

  // Top faces. Key = height, surface and tone packed into one integer.
  const keys = new Int32Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const tone = surface[k] === SURFACE.seabed ? 1 : Math.min(2, Math.max(0, Math.floor((fbm(x * 0.045, z * 0.045, seedTone, 2) + 0.5) * 3)));
      keys[k] = ((height[k] + 64) * 8 + surface[k]) * 4 + tone;
      naive++;
    }
  }
  greedyRects(keys, n, params.greedy, (x, z, w, d, key) => {
    const tone = key % 4;
    const surf = Math.floor(key / 4) % 8;
    const h = Math.floor(key / 32) - 64;
    const lv = level[z * n + x];
    let colour: Col;
    if (surf === SURFACE.seabed) colour = mix(C.seabedDeep, C.seabedShallow, (h - SEABED) / (WATER_DEPTH - 1));
    else if (surf === SURFACE.sand) colour = shade(C.sand, TONES[tone]);
    else if (surf === SURFACE.rock) colour = shade(C.rock, TONES[tone]);
    else if (surf === SURFACE.riverbed) colour = C.riverbed;
    else if (surf === SURFACE.bank) colour = shade(C.bank, TONES[tone]);
    else colour = shade(mix(C.grassLow, C.grassHigh, levels > 1 ? lv / (levels - 1) : 0), TONES[tone]);
    const x0 = x - half;
    const z0 = z - half;
    builder.quad([x0, h, z0 + d, x0 + w, h, z0 + d, x0 + w, h, z0, x0, h, z0], 0, 1, 0, colour);
    merged++;
  });

  // Side faces, one direction at a time, merged along runs.
  const sideColours = (k: number, b: number, h: number): [Col, Col] => {
    const s = surface[k];
    if (s === SURFACE.seabed) {
      const top = mix(C.seabedDeep, C.seabedShallow, (h - SEABED) / (WATER_DEPTH - 1));
      return [shade(top, 0.6), shade(top, 0.8)];
    }
    if (s === SURFACE.sand) return [cliffAt(b), C.sandSide];
    return [cliffAt(b), cliffAt(h)];
  };
  for (const [dx, dz] of N4) {
    // Lines run along z for x-facing sides and along x for z-facing sides.
    const alongX = dz !== 0;
    for (let line = 0; line < n; line++) {
      let run = -1;
      let runB = 0;
      let runH = 0;
      let runSurf = -1;
      const flush = (end: number) => {
        if (run < 0) return;
        const k = alongX ? line * n + run : run * n + line;
        const [low, high] = sideColours(k, runB, runH);
        const a0 = run - half;
        const a1 = end - half;
        const p = line - half + (dx > 0 || dz > 0 ? 1 : 0);
        if (dx > 0) builder.quad([p, runB, a1, p, runB, a0, p, runH, a0, p, runH, a1], 1, 0, 0, low, high);
        else if (dx < 0) builder.quad([p, runB, a0, p, runB, a1, p, runH, a1, p, runH, a0], -1, 0, 0, low, high);
        else if (dz > 0) builder.quad([a0, runB, p, a1, runB, p, a1, runH, p, a0, runH, p], 0, 0, 1, low, high);
        else builder.quad([a1, runB, p, a0, runB, p, a0, runH, p, a1, runH, p], 0, 0, -1, low, high);
        merged++;
        run = -1;
      };
      for (let a = 0; a < n; a++) {
        const x = alongX ? a : line;
        const z = alongX ? line : a;
        const k = z * n + x;
        const h = height[k];
        const b = heightAt(x + dx, z + dz);
        const surf = surface[k] === SURFACE.seabed || surface[k] === SURFACE.sand ? surface[k] : 99;
        if (b >= h) {
          flush(a);
          continue;
        }
        naive++;
        if (params.greedy && run >= 0 && b === runB && h === runH && surf === runSurf && a % CHUNK !== 0) continue;
        flush(a);
        run = a;
        runB = b;
        runH = h;
        runSurf = surf;
      }
      flush(n);
    }
  }

  // Water: surfaces, then falls wherever water steps down to lower water or the sea.
  const waterBuilder = new GeometryBuilder();
  const waterKeys = new Int32Array(n * n).fill(-1);
  for (let k = 0; k < n * n; k++) if (!Number.isNaN(water.surfaceY[k])) waterKeys[k] = Math.round(water.surfaceY[k] * 10) + 1000;
  greedyRects(waterKeys, n, params.greedy, (x, z, w, d, key) => {
    const y = (key - 1000) / 10;
    const x0 = x - half;
    const z0 = z - half;
    waterBuilder.quad([x0, y, z0 + d, x0 + w, y, z0 + d, x0 + w, y, z0, x0, y, z0], 0, 1, 0, C.water);
  });
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const top = water.surfaceY[k];
      if (Number.isNaN(top)) continue;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const nk = nz * n + nx;
        const below = Number.isNaN(water.surfaceY[nk]) ? (level[nk] < 0 ? SEA_LEVEL : NaN) : water.surfaceY[nk];
        if (Number.isNaN(below) || below >= top - 0.01) continue;
        const x0 = x - half;
        const z0 = z - half;
        if (dx > 0) waterBuilder.panel("x+", x0 + 1, z0, z0 + 1, below, top, C.foamLow);
        else if (dx < 0) waterBuilder.panel("x-", x0, z0, z0 + 1, below, top, C.foamLow);
        else if (dz > 0) waterBuilder.panel("z+", z0 + 1, x0, x0 + 1, below, top, C.foamLow);
        else waterBuilder.panel("z-", z0, x0, x0 + 1, below, top, C.foamLow);
      }
    }
  }

  return { terrain: builder.finish(), water: waterBuilder.finish(), naiveFaces: naive, mergedFaces: merged };
}
