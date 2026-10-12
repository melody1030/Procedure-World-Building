import { fbm, smoothstep } from "../../world/noise";
import { Rng, hashSeed } from "../../world/rng";
import { GRID, WORLD_SIZE } from "./config";
import type { PathsResult } from "./paths";
import { heightAt, normalAt, normalizedHeight, type Heightmap } from "./terrain";
import type { LayerId, LayerParams, PathParams } from "./types";

/**
 * Scattering (Class 06, PCG 04: Distributions). Each layer runs the same three steps:
 *  1. where?   generate candidate points (random, noise distribution or Poisson disk);
 *  2. whether? keep the ones that pass the layer's rules (height, slope, paths);
 *  3. how?     orient, size and tint each copy from the terrain data under it.
 */

export interface Instance {
  x: number;
  y: number;
  z: number;
  /** The "up" the copy stands along: world up blended towards the surface normal. */
  up: [number, number, number];
  /** Spin around that up axis, in radians. */
  spin: number;
  scale: number;
  /** Tint 0 to 1 from the terrain data, used to shade the copy. */
  tint: number;
  /** Random 0 to 1 per copy, for colour jitter. */
  jitter: number;
}

export type RejectReason = "height" | "slope" | "path" | "patch";

export interface LayerResult {
  instances: Instance[];
  candidates: number;
  rejected: Record<RejectReason, number>;
}

const HALF = WORLD_SIZE / 2;
const MARGIN = 0.3;
const CELL = WORLD_SIZE / (GRID - 1);
/** Candidates for density 1 on random and noise layers. */
const MAX_CANDIDATES = 6000;

const LAYER_SALT: Record<LayerId, number> = { trees: 11, bushes: 23, rocks: 37, windmills: 53 };

/** Each layer's own seed, so layers never share random numbers. */
export function layerSeed(id: LayerId, seedText: string): number {
  return hashSeed(seedText) ^ (LAYER_SALT[id] * 0x9e3779b1);
}

function randomPoints(rng: Rng, count: number): [number, number][] {
  const span = HALF - MARGIN;
  return Array.from({ length: count }, () => [rng.range(-span, span), rng.range(-span, span)]);
}

/** Bridson's Poisson-disk sampling: throw new points around active ones, reject any too close. */
function poissonPoints(rng: Rng, radius: number): [number, number][] {
  const span = HALF - MARGIN;
  const cell = radius / Math.SQRT2;
  const cols = Math.ceil((2 * span) / cell);
  const grid = new Int32Array(cols * cols).fill(-1);
  const points: [number, number][] = [];
  const active: number[] = [];
  const cellOf = (x: number, z: number) => [Math.floor((x + span) / cell), Math.floor((z + span) / cell)];

  const add = (x: number, z: number) => {
    const [ci, cj] = cellOf(x, z);
    grid[cj * cols + ci] = points.length;
    active.push(points.length);
    points.push([x, z]);
  };

  const fits = (x: number, z: number) => {
    if (Math.abs(x) > span || Math.abs(z) > span) return false;
    const [ci, cj] = cellOf(x, z);
    for (let j = Math.max(0, cj - 2); j <= Math.min(cols - 1, cj + 2); j++) {
      for (let i = Math.max(0, ci - 2); i <= Math.min(cols - 1, ci + 2); i++) {
        const k = grid[j * cols + i];
        if (k >= 0 && Math.hypot(points[k][0] - x, points[k][1] - z) < radius) return false;
      }
    }
    return true;
  };

  add(rng.range(-span, span), rng.range(-span, span));
  while (active.length > 0) {
    const slot = Math.floor(rng.next() * active.length);
    const [px, pz] = points[active[slot]];
    let placed = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = rng.next() * Math.PI * 2;
      const r = radius * (1 + rng.next());
      const x = px + Math.cos(angle) * r;
      const z = pz + Math.sin(angle) * r;
      if (fits(x, z)) {
        add(x, z);
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(slot, 1);
  }
  return points;
}

/** Noise distribution: the chance a candidate survives at this spot (0 to 1). */
export function patchChance(params: LayerParams, seed: number, x: number, z: number): number {
  const freq = 0.18 / params.patchSize;
  const density = fbm(x * freq, z * freq, seed, 4) * 0.5 + 0.5;
  const edge = 1 - params.patchCover;
  return smoothstep(edge - 0.08, edge + 0.08, density);
}

/** Distance from a world position to a path, read from the nearest grid vertex. */
function fieldAt(field: Float32Array, x: number, z: number): number {
  const i = Math.round((x + HALF) / CELL);
  const j = Math.round((z + HALF) / CELL);
  return field[Math.min(GRID - 1, Math.max(0, j)) * GRID + Math.min(GRID - 1, Math.max(0, i))];
}

/** True when the point is inside a path or its clearance band. */
export function nearPath(paths: PathsResult, pathParams: PathParams, x: number, z: number): boolean {
  const road = paths.road ? fieldAt(paths.roadDist, x, z) < paths.road.halfWidth + pathParams.clearance + 0.2 : false;
  const river = paths.river ? fieldAt(paths.riverDist, x, z) < paths.river.halfWidth + pathParams.clearance + 0.2 : false;
  return road || river;
}

/**
 * The rules a point must pass, in the order the mask view colours them. Returns the first rule
 * that fails, or null if the point may hold this layer.
 */
export function checkRules(
  params: LayerParams,
  map: Heightmap,
  paths: PathsResult,
  pathParams: PathParams,
  x: number,
  z: number,
  normal: number[],
): Exclude<RejectReason, "patch"> | null {
  if (params.avoidPaths && nearPath(paths, pathParams, x, z)) return "path";
  const slope = (Math.acos(Math.min(1, normal[1])) * 180) / Math.PI;
  if (slope < params.slopeMin || slope > params.slopeMax) return "slope";
  const h = normalizedHeight(map, heightAt(map, x, z));
  if (h < params.heightMin || h > params.heightMax) return "height";
  return null;
}

export function scatterLayer(
  id: LayerId,
  params: LayerParams,
  map: Heightmap,
  paths: PathsResult,
  pathParams: PathParams,
  seedText: string,
): LayerResult {
  const seed = layerSeed(id, seedText);
  const rng = new Rng(seed);
  const rejected: Record<RejectReason, number> = { height: 0, slope: 0, path: 0, patch: 0 };
  const instances: Instance[] = [];
  if (!params.enabled) return { instances, candidates: 0, rejected };

  // 1. Where: candidate points.
  const candidates =
    params.method === "poisson" ? poissonPoints(rng.fork("poisson"), params.spacing) : randomPoints(rng.fork("points"), Math.round(params.density * MAX_CANDIDATES));

  const normal = [0, 1, 0];
  const pick = rng.fork("pick");
  for (const [x, z] of candidates) {
    // Always draw the same numbers per candidate, so changing one rule never reshuffles the rest.
    const roll = pick.next();
    const spinRoll = pick.next();
    const sizeRoll = pick.next();
    const jitter = pick.next();

    // 2. Whether: the noise patch first (noise distribution), then the layer's rules.
    if (params.method === "noise" && roll > patchChance(params, seed, x, z)) {
      rejected.patch++;
      continue;
    }
    normalAt(map, x, z, normal);
    const reason = checkRules(params, map, paths, pathParams, x, z, normal);
    if (reason) {
      rejected[reason]++;
      continue;
    }

    // 3. How: orient to the surface, vary size, tint from the terrain.
    const a = params.align;
    const ux = normal[0] * a;
    const uy = 1 - a + normal[1] * a;
    const uz = normal[2] * a;
    const len = Math.hypot(ux, uy, uz);
    const h = normalizedHeight(map, heightAt(map, x, z));
    const steep = 1 - normal[1];
    instances.push({
      x,
      y: heightAt(map, x, z),
      z,
      up: [ux / len, uy / len, uz / len],
      spin: spinRoll * Math.PI * 2,
      scale: params.size * (1 + params.sizeVariation * (sizeRoll * 2 - 1)),
      tint: params.terrainTint ? Math.min(1, Math.max(0, h * 0.85 + steep * 0.6)) : 0.35,
      jitter,
    });
  }
  return { instances, candidates: candidates.length, rejected };
}
