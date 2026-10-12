import * as THREE from "three";
import { smoothstep } from "../../world/noise";
import { neverRising, smoothProfile } from "../../world/path";
import { Rng, hashSeed } from "../../world/rng";
import { GRID, WORLD_SIZE } from "./config";
import { gridCoord, heightAt, withRange, type Heightmap } from "./terrain";
import type { PathParams } from "./types";

/**
 * Spline overlays (Class 06, PCG 04: Paths). Each path is a Catmull-Rom curve through a few
 * control points. The influence runs both ways:
 *  - mesh → spline: the control points are chosen by reading the terrain (the river looks for
 *    low ground, the road for level ground), and the curve is projected onto the surface;
 *  - spline → mesh: the curve flattens a road bed and carves a river channel into the heightmap;
 *  - spline → scatter: distance to the curve masks the scatter layers and places lamp posts.
 */

export interface PathCurve {
  kind: "road" | "river";
  /** Samples along the curve: x, z pairs. */
  xz: Float32Array;
  /** The surface height at each sample: road deck or water level. */
  y: Float32Array;
  halfWidth: number;
}

export interface PathsResult {
  /** The terrain after the paths have deformed it (the input map if deform is off). */
  map: Heightmap;
  road: PathCurve | null;
  river: PathCurve | null;
  /** Distance from every grid vertex to each path's centre line (Infinity when absent or far). */
  roadDist: Float32Array;
  riverDist: Float32Array;
  lamps: { x: number; y: number; z: number }[];
}

const HALF = WORLD_SIZE / 2;
const CELL = WORLD_SIZE / (GRID - 1);
const SAMPLES = 320;
const ROWS = 9;

/**
 * Walks across the terrain row by row, at each row picking the sideways offset with the lowest
 * cost. `along` is the axis the path travels on; the other axis is where it may wander.
 */
function chooseControlPoints(
  map: Heightmap,
  along: "x" | "z",
  wander: number,
  rng: Rng,
  cost: (h: number, prevH: number) => number,
): THREE.Vector3[] {
  const toWorld = (a: number, b: number) => (along === "x" ? new THREE.Vector3(a, 0, b) : new THREE.Vector3(b, 0, a));
  const height = (a: number, b: number) => (along === "x" ? heightAt(map, a, b) : heightAt(map, b, a));
  const span = 2 + wander * 5;
  const limit = HALF - 2.5;

  // Start on the cheapest spot of the first row.
  const a0 = -HALF - 1;
  let b = 0;
  let best = Infinity;
  for (let k = 0; k <= 16; k++) {
    const candidate = -limit + (2 * limit * k) / 16;
    const c = cost(height(a0 + 1, candidate), height(a0 + 1, candidate)) + rng.next() * 0.2;
    if (c < best) {
      best = c;
      b = candidate;
    }
  }

  const points = [toWorld(a0, b)];
  let prevH = height(a0 + 1, b);
  for (let row = 1; row < ROWS; row++) {
    const a = a0 + ((WORLD_SIZE + 2) * row) / (ROWS - 1);
    let next = b;
    best = Infinity;
    for (let k = 0; k <= 10; k++) {
      const candidate = Math.max(-limit, Math.min(limit, b + span * (k / 5 - 1)));
      const h = height(Math.max(-HALF, Math.min(HALF, a)), candidate);
      const turn = Math.abs(candidate - b) * 0.08;
      const c = cost(h, prevH) + turn + rng.next() * 0.05;
      if (c < best) {
        best = c;
        next = candidate;
      }
    }
    b = next;
    prevH = height(Math.max(-HALF, Math.min(HALF, a)), b);
    points.push(toWorld(a, b));
  }
  return points;
}

function sampleCurve(points: THREE.Vector3[]): Float32Array {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const xz = new Float32Array(SAMPLES * 2);
  curve.getSpacedPoints(SAMPLES - 1).forEach((p, i) => {
    xz[i * 2] = p.x;
    xz[i * 2 + 1] = p.z;
  });
  return xz;
}

/** Height of the terrain under each sample: the curve projected onto the mesh. */
function project(map: Heightmap, xz: Float32Array): Float32Array {
  const y = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) y[i] = heightAt(map, xz[i * 2], xz[i * 2 + 1]);
  return y;
}

/** Water only flows downhill: from the higher end, the level can only go down. */
function riverLevel(y: Float32Array): Float32Array {
  return smoothProfile(neverRising(y, y[0] >= y[y.length - 1]), 3, 1);
}

/**
 * For every grid vertex within `reach` of the curve: the distance to its centre line and the
 * curve's height at the nearest point. Each segment only visits the vertices around it.
 */
function distanceField(curve: PathCurve, reach: number): { dist: Float32Array; y: Float32Array } {
  const dist = new Float32Array(GRID * GRID).fill(Infinity);
  const yAt = new Float32Array(GRID * GRID);
  const { xz, y } = curve;
  for (let s = 0; s < SAMPLES - 1; s++) {
    const ax = xz[s * 2];
    const az = xz[s * 2 + 1];
    const bx = xz[s * 2 + 2];
    const bz = xz[s * 2 + 3];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + HALF) / CELL));
    const i1 = Math.min(GRID - 1, Math.ceil((Math.max(ax, bx) + reach + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + HALF) / CELL));
    const j1 = Math.min(GRID - 1, Math.ceil((Math.max(az, bz) + reach + HALF) / CELL));
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) {
      const pz = gridCoord(j);
      for (let i = i0; i <= i1; i++) {
        const px = gridCoord(i);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
        const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
        const v = j * GRID + i;
        if (d < dist[v]) {
          dist[v] = d;
          yAt[v] = y[s] + (y[s + 1] - y[s]) * t;
        }
      }
    }
  }
  return { dist, y: yAt };
}

/** Lamp posts every `spacing` units along the road, alternating sides. */
function placeLamps(road: PathCurve, map: Heightmap, spacing: number): PathsResult["lamps"] {
  if (spacing <= 0) return [];
  const lamps: PathsResult["lamps"] = [];
  const { xz } = road;
  let travelled = spacing / 2;
  let side = 1;
  for (let i = 1; i < SAMPLES; i++) {
    const dx = xz[i * 2] - xz[i * 2 - 2];
    const dz = xz[i * 2 + 1] - xz[i * 2 - 1];
    const step = Math.hypot(dx, dz);
    travelled += step;
    if (travelled < spacing) continue;
    travelled -= spacing;
    // The curve's sideways direction is its tangent turned 90°.
    const x = xz[i * 2] + (-dz / step) * (road.halfWidth + 0.3) * side;
    const z = xz[i * 2 + 1] + (dx / step) * (road.halfWidth + 0.3) * side;
    side = -side;
    if (Math.abs(x) > HALF - 0.3 || Math.abs(z) > HALF - 0.3) continue;
    lamps.push({ x, y: heightAt(map, x, z), z });
  }
  return lamps;
}

export function buildPaths(base: Heightmap, params: PathParams, seed: string): PathsResult {
  const rng = new Rng(hashSeed(seed) ^ 0x51ed);
  const heights = new Float32Array(base.heights);
  const reach = Math.max(params.roadWidth, params.riverWidth) / 2 + params.falloff + params.clearance + 1;

  let river: PathCurve | null = null;
  let riverDist: Float32Array = new Float32Array(GRID * GRID).fill(Infinity);
  if (params.river) {
    // Mesh → spline: each row, the river moves to the lowest ground within reach.
    const points = chooseControlPoints(base, "z", params.wander, rng.fork("river"), (h) => h);
    const xz = sampleCurve(points);
    const level = riverLevel(project(base, xz));
    river = { kind: "river", xz, y: level, halfWidth: params.riverWidth / 2 };
    const field = distanceField(river, reach);
    riverDist = field.dist;
    if (params.deform) {
      for (let v = 0; v < heights.length; v++) {
        if (field.dist[v] === Infinity) continue;
        const w = 1 - smoothstep(river.halfWidth, river.halfWidth + params.falloff * 0.7, field.dist[v]);
        const bed = field.y[v] - params.riverDepth;
        heights[v] = Math.min(heights[v], heights[v] + (bed - heights[v]) * w);
      }
      // The water sits a little below the old ground, inside the carved channel.
      river.y = river.y.map((h) => h - params.riverDepth * 0.35);
    }
  }

  let road: PathCurve | null = null;
  let roadDist: Float32Array = new Float32Array(GRID * GRID).fill(Infinity);
  if (params.road) {
    // Mesh → spline: the road prefers rows where the height changes least, and lower ground.
    const points = chooseControlPoints(base, "x", params.wander, rng.fork("road"), (h, prevH) => Math.abs(h - prevH) * 2 + h * 0.15);
    const xz = sampleCurve(points);
    const deck = smoothProfile(project(base, xz), 14, 3);
    road = { kind: "road", xz, y: deck, halfWidth: params.roadWidth / 2 };
    const field = distanceField(road, reach);
    roadDist = field.dist;
    if (params.deform) {
      for (let v = 0; v < heights.length; v++) {
        if (field.dist[v] === Infinity) continue;
        const w = 1 - smoothstep(road.halfWidth, road.halfWidth + params.falloff, field.dist[v]);
        heights[v] += (field.y[v] - heights[v]) * w;
      }
    }
  }

  const map = params.deform ? withRange({ ...base, heights }) : base;
  if (!params.deform) {
    // Projection only: the curves drape over the untouched terrain.
    if (road) road.y = project(map, road.xz);
    if (river) river.y = project(map, river.xz);
  }
  const lamps = road ? placeLamps(road, map, params.lampSpacing) : [];
  return { map, road, river, roadDist, riverDist, lamps };
}
