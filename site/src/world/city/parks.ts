import { Rng } from "../rng";
import { voxels } from "../scale";
import { CLAIM } from "../terrain/claims";
import type { Districts } from "../terrain/districts";
import type { Plaza } from "../terrain/streets";
import type { Columns } from "../terrain/voxelize";

/**
 * What stands in each park (pure: no three.js): its ground, regraded; its paths, painted into the
 * ground (see `paintCity`); and its props, drawn by the renderer (see parkModels.ts).
 *
 * The ground. Parks lie on hillsides (that is where the districts put them), up to ~12 m of rise
 * across one, in voxel steps and cliffs. Each park is regraded: inside, its ground is smoothed (a
 * box blur of BLUR columns) and its rise around the park's mean height scaled by FLATTEN, so the
 * lawn is nearly level, rolling in single-voxel steps. At the edge a short bank (BANK) brings it
 * to within WALL of the ground around, and a stone-capped retaining wall takes the rest; beside a
 * lot it is never cut below the lot's floor (it eases down from it over LOT_BANK), so no building's
 * footing is bared. Each path comes in at the street's level and climbs (or descends) to the
 * park's as stairs no steeper than GRADE (one voxel, 25 cm, every two columns), however far that
 * takes, with the lawn beside it sloping to it over FLANK. Steps of COPING or more get a stone coping on their upper edge.
 *
 * A low iron fence runs around the edge, open where the paths come in.
 *
 * The layout: one of three per park (the seed picks):
 *
 *   cross  two straight paths through the middle, meeting at a round paved court
 *   loop   a path around the park, inset, with a spur out to each side, and a paved terrace in the
 *          middle
 *   grand  the loop and the cross together, the court where they meet
 *
 * Most parks are furnished in full. In this order, each only where it is clear of the paths and of
 * what came before, set on a terrace (its footprint and a column around it cut and filled level at
 * its median, at most MAX_CUT), and kept clear of everything else (see `Room`):
 *
 *   the middle    a fountain on the court, or a pavilion on the terrace
 *   flower beds   around it
 *   a playground  (most parks) a sand pit with a slide tower and swings
 *   picnic tables a few, on the lawn
 *   benches       along the paths, facing them, each in a paved niche, with a litter bin beside some
 *   lamps         along the paths, between the benches
 *   a vending     machine where a path comes in from the street
 *   the fence     around the edge (in the gardens too)
 *   hedges        (some parks) along the edge, open where the paths come in
 *   trees         most along the edge, fewer on the open lawn; each park has a favorite kind
 *   shrubs        along the paths and between the trees
 *
 * One or two parks per city (GARDENS) are flower gardens instead: only paths, flower beds (a pair
 * in the middle, four around them, more along the paths) and benches.
 *
 * Every prop has a `delay` in the park's build (0–1): the middle first, then outward.
 */

export type ParkPropKind =
  | "fountain"
  | "pavilion"
  | "playground"
  | "picnic"
  | "bench"
  | "bin"
  | "lamp"
  | "vending"
  | "fence"
  | "flowerbed"
  | "hedge"
  | "broadleaf"
  | "conifer"
  | "blossom"
  | "shrub";

export interface ParkProp {
  kind: ParkPropKind;
  /** Base center, in columns, and the ground it stands on (voxels). */
  x: number;
  z: number;
  y: number;
  /** Rotation about y that turns the model's front (+z) where it faces. */
  rotation: number;
  /** Size: a tree's or shrub's height, a hedge's, bed's or fence's length (voxels); 0 for the fixed-size props. */
  size: number;
  seed: number;
  /** When it appears in its park's build, 0–1. */
  delay: number;
}

export interface Park {
  /** Center, in columns. */
  x: number;
  z: number;
  /** Distance from the plaza (columns): parks are built outward from it, as the buildings are. */
  fromPlaza: number;
  /** A flower garden: paths, beds and benches only. */
  garden: boolean;
  props: ParkProp[];
}

export interface Parks {
  /** The ground with the parks regraded. */
  ground: Columns;
  /** 1 for paved park ground: paths, the court, terraces, niches and wall copings. */
  path: Uint8Array;
  parks: Park[];
}

type Layout = "cross" | "loop" | "grand";
type Rect = Districts["parkRects"][number];

/**
 * Regrading: the blur's reach (columns, 3 m); the share of the smoothed rise kept inside the park;
 * the most the lawn may stand above or below the ground around at the park's edge (voxels: a
 * retaining wall takes the rest); and the bank (columns) over which it eases from there to the
 * park's level.
 */
const BLUR = 12;
const FLATTEN = 0.25;
const WALL = voxels(1.5);
const BANK = voxels(3);
/** The steepest a path climbs: voxels per column (a 25 cm step every 50 cm). */
const GRADE = 0.5;
/** How far (columns) the lawn beside a way in slopes to its stairs. */
const FLANK = voxels(3);
/** How far (columns) from a lot the park's ground eases down from the lot's floor. */
const LOT_BANK = voxels(3);
/** How near (columns) a lot must be for the park to keep to its floor. */
const LOT_REACH = 4;
/** The fence: its height (voxels), and how far its line stands in from the park's edge (columns). */
export const FENCE_HEIGHT = voxels(0.8);
const FENCE_INSET = 0.2;
/** A step this high or higher (voxels, 0.75 m) gets a stone coping on its upper edge, so its side is a retaining wall. */
const COPING = 3;
/** How many parks are flower gardens: one, or two in a city of four parks or more. */
const GARDENS = (parks: number) => (parks >= 4 ? 2 : parks >= 2 ? 1 : 0);
/** Path width (2 m) and the round court where the cross meets (radius 5 m), in columns. */
const PATH = voxels(2);
const COURT = voxels(5);
/** The most a terrace may cut into or fill above the ground (voxels): 1 m for the large ones, 0.5 m for the small. */
const MAX_CUT = voxels(1);
const MAX_CUT_SMALL = voxels(0.5);
/** Spacing along the paths (columns): benches, lamps, and a garden's beds. */
const BENCH_APART = voxels(7);
const LAMP_APART = voxels(9);
const BED_APART = voxels(5);
/** How many tries (per column of park) trees and shrubs get. */
const TREE_TRIES = 1 / 4;
const SHRUB_TRIES = 1 / 8;
/** The band along the edge (columns) where trees stand thickest. */
const EDGE_BAND = voxels(6);

/** A tree's crown: its radius and the height of its underside, for a tree `size` voxels tall (as parkModels.ts draws it). */
export function crown(kind: ParkPropKind, size: number) {
  // (Measured to the farthest corner of its blocks, which turn with the tree.)
  return kind === "conifer" ? { radius: size * 0.23, bottom: size * 0.16 } : { radius: size * 0.4, bottom: size * 0.47 };
}
/** How far a blossom's fallen petals lie from its trunk (voxels). */
export const petals = (size: number) => size * 0.2 + 1;
/** A shrub's spread (radius, voxels), for one `size` voxels tall. */
export const shrubRadius = (size: number) => size * 0.95;

/**
 * The room each fixed prop takes (radius to its farthest corner, and height, in columns/voxels), so
 * tree crowns and shrubs keep out of it. Hedges and beds, which are long, are given by their size.
 */
const ROOM: Partial<Record<ParkPropKind, [number, number]>> = {
  fountain: [voxels(4.6), voxels(3.8)],
  pavilion: [voxels(4.9), voxels(4.8)],
  playground: [voxels(5.4), voxels(3.1)],
  picnic: [voxels(1.3), voxels(0.85)],
  bench: [voxels(1), voxels(1)],
  bin: [voxels(0.45), voxels(1)],
  lamp: [voxels(0.45), voxels(3.8)],
  vending: [voxels(0.75), voxels(2)],
};

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** `dug`: the columns the lots' site grading dug (see gradeLots), which the parks leave as they are. */
export function planParks(districts: Districts, ground: Columns, plaza: Plaza | undefined, seed: number, dug: Int32Array | null = null): Parks {
  const { n } = ground;
  const height = ground.height.slice();
  const path = new Uint8Array(n * n);
  const rects = districts.parkRects;
  // Which parks are gardens (the seed picks).
  const pick = new Rng(seed ^ 0x6a7d1f3b);
  const order = rects.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(pick.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const gardens = new Set(order.slice(0, GARDENS(rects.length)));
  const parks = rects.map((rect, id) =>
    planPark(rect, new Rng(seed ^ Math.imul(id + 1, 0x2c1b3c6d)), gardens.has(id), n, height, ground.height, districts.claims.claim, districts.lotId, dug, path, plaza),
  );
  let min = Infinity;
  let max = -Infinity;
  for (const h of height) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { ground: { ...ground, height, min, max }, path, parks };
}

/** `orig`: the ground as graded for the lots, before the parks. */
function planPark(
  rect: Rect,
  rng: Rng,
  garden: boolean,
  n: number,
  height: Int16Array,
  orig: Int16Array,
  claim: Uint8Array,
  lotId: Int32Array,
  dug: Int32Array | null,
  path: Uint8Array,
  plaza: Plaza | undefined,
): Park {
  const { x0, z0, x1, z1 } = rect;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const inRect = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
  // (A column a lot's dig reached, beside its building, is left to the lot.)
  const inPark = (x: number, z: number) => inRect(x, z) && claim[z * n + x] === CLAIM.park && !dug?.[z * n + x];
  const at = (x: number, z: number) => (z - z0) * w + (x - x0);
  const heightAt = (x: number, z: number) => height[Math.min(n - 1, Math.max(0, z)) * n + Math.min(n - 1, Math.max(0, x))];
  const layout: Layout = garden ? rng.pick(["cross", "loop"] as const) : rng.pick(["cross", "cross", "loop", "loop", "grand"] as const);
  const half = PATH / 2;
  const distToEdge = (x: number, z: number) => Math.min(x - x0, x1 - 1 - x, z - z0, z1 - 1 - z);

  // 1. Paths. The loop is a rounded rectangle inset from the edge; spurs and the cross run out to the edge.
  const inset = Math.round(Math.min(w, d) * 0.2);
  const ringX = w / 2 - inset;
  const ringZ = d / 2 - inset;
  const corner = Math.min(ringX, ringZ) * 0.6;
  const onRing = (px: number, pz: number) => {
    const qx = Math.abs(px) - (ringX - corner);
    const qz = Math.abs(pz) - (ringZ - corner);
    const out = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - corner;
    return Math.abs(out) <= half;
  };
  const ring = layout !== "cross";
  const cross = layout !== "loop";
  const isPath = (x: number, z: number) => {
    const px = x + 0.5 - cx;
    const pz = z + 0.5 - cz;
    if (ring && onRing(px, pz)) return true;
    const onAxis = Math.abs(px) <= half || Math.abs(pz) <= half;
    if (cross) return onAxis || Math.hypot(px, pz) <= COURT;
    // Spurs: along the axes from the edge to the ring.
    return onAxis && (Math.abs(px) > ringX - half || Math.abs(pz) > ringZ - half);
  };
  const paved = new Uint8Array(w * d);
  const pave = (x: number, z: number) => {
    paved[at(x, z)] = 1;
    path[z * n + x] = 1;
  };
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (inPark(x, z) && isPath(x, z)) pave(x, z);
  const pathAt = (x: number, z: number) => inRect(x, z) && paved[at(x, z)] === 1;
  const street = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= n || z >= n) return false;
    const c = claim[z * n + x];
    return c === CLAIM.road || c === CLAIM.verge || c === CLAIM.plaza;
  };
  // Where the paths come in: each path column beside ground that isn't park, held at the street's
  // level there (or its own, beside anything else).
  const entries = new Map<number, number>();
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++) {
      if (!pathAt(x, z)) continue;
      const out = DIRS.filter(([dx, dz]) => !inPark(x + dx, z + dz));
      if (!out.length) continue;
      const road = out.find(([dx, dz]) => street(x + dx, z + dz));
      entries.set(at(x, z), road ? heightAt(x + road[0], z + road[1]) : heightAt(x, z));
    }
  /**
   * Holds the paths to GRADE: each path column (but the `fixed` ones, which keep their height) is
   * kept within GRADE per column, along the paths, of every fixed one, so the ways in become
   * stairs of single-voxel steps.
   */
  const limitPaths = (fixed: Map<number, number>) => {
    const up = new Float32Array(w * d).fill(Infinity);
    const lo = new Float32Array(w * d).fill(-Infinity);
    // (How far along the paths each bound comes from.)
    const upRun = new Float32Array(w * d);
    const loRun = new Float32Array(w * d);
    const queue: number[] = [];
    for (const [i, h] of fixed) {
      up[i] = lo[i] = h;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = x0 + (i % w);
      const z = z0 + ((i / w) | 0);
      for (const [dx, dz] of DIRS) {
        if (!pathAt(x + dx, z + dz)) continue;
        const j = at(x + dx, z + dz);
        if (fixed.has(j)) continue;
        let changed = false;
        if (up[i] + GRADE < up[j]) (up[j] = up[i] + GRADE), (upRun[j] = upRun[i] + 1), (changed = true);
        if (lo[i] - GRADE > lo[j]) (lo[j] = lo[i] - GRADE), (loRun[j] = loRun[i] + 1), (changed = true);
        if (changed) queue.push(j);
      }
    }
    for (let i = 0; i < w * d; i++) {
      if (!paved[i]) continue;
      const k = (z0 + ((i / w) | 0)) * n + x0 + (i % w);
      if (fixed.has(i)) {
        height[k] = fixed.get(i)!;
        continue;
      }
      // Two fixed ends too far apart in height for the grade between them (a way in below a court
      // too near it): the stairs run straight from one to the other, steeper.
      let h = Math.min(up[i], Math.max(lo[i], height[k]));
      if (lo[i] > up[i]) {
        const below = up[i] - GRADE * upRun[i];
        const above = lo[i] + GRADE * loRun[i];
        h = below + ((above - below) * upRun[i]) / Math.max(1, upRun[i] + loRun[i]);
      }
      height[k] = Math.max(1, Math.round(h));
    }
  };

  // 2. The ground, regraded: smoothed, its rise around the mean scaled down; the paths ramp back to
  // the original ground at the edge.
  const smooth = (t: number) => t * t * (3 - 2 * t);
  /** The park's level (before any terrace), per column. */
  const levels = new Float32Array(w * d);
  {
    // Summed-area tables of the park's heights and of its columns, for the box blur.
    const W1 = w + 1;
    const sumH = new Float64Array(W1 * (d + 1));
    const sumN = new Float64Array(W1 * (d + 1));
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        const inside = inPark(x0 + x, z0 + z) ? 1 : 0;
        const i = (z + 1) * W1 + (x + 1);
        sumH[i] = inside * heightAt(x0 + x, z0 + z) + sumH[i - 1] + sumH[i - W1] - sumH[i - W1 - 1];
        sumN[i] = inside + sumN[i - 1] + sumN[i - W1] - sumN[i - W1 - 1];
      }
    }
    const box = (s: Float64Array, ax: number, az: number, bx: number, bz: number) => s[bz * W1 + bx] - s[az * W1 + bx] - s[bz * W1 + ax] + s[az * W1 + ax];
    const blurred = new Float32Array(w * d);
    let total = 0;
    let count = 0;
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        if (!inPark(x0 + x, z0 + z)) continue;
        const ax = Math.max(0, x - BLUR);
        const az = Math.max(0, z - BLUR);
        const bx = Math.min(w, x + BLUR + 1);
        const bz = Math.min(d, z + BLUR + 1);
        const h = box(sumH, ax, az, bx, bz) / Math.max(1, box(sumN, ax, az, bx, bz));
        blurred[z * w + x] = h;
        total += h;
        count++;
      }
    }
    const mean = count ? total / count : 0;
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        if (!inPark(x, z)) continue;
        const k = z * n + x;
        const b = blurred[at(x, z)];
        const level = mean + (b - mean) * FLATTEN;
        levels[at(x, z)] = level;
        const edge = distToEdge(x, z);
        // (A path's stairs from the street are cut below, by `limitPaths`.)
        if (pathAt(x, z)) height[k] = Math.max(1, Math.round(level));
        else {
          // The lawn meets the edge within WALL of the ground around (smoothed; a retaining wall
          // takes the rest), easing to the park's level over BANK.
          const meet = level + Math.max(-WALL, Math.min(WALL, b - level));
          height[k] = Math.max(1, Math.round(meet + (level - meet) * smooth(Math.min(1, edge / BANK))));
        }
      }
    }
    // Beside a lot, the ground is not cut below the lot's floor (its graded ground), easing down
    // from it over LOT_BANK.
    {
      const dist = new Float32Array(w * d).fill(Infinity);
      const src = new Float32Array(w * d);
      const queue: number[] = [];
      for (let z = z0; z < z1; z++)
        for (let x = x0; x < x1; x++) {
          if (!inPark(x, z)) continue;
          // (A lot within LOT_REACH: a strip of verge or bare ground may lie between.)
          let floor = -Infinity;
          for (let dz = -LOT_REACH; dz <= LOT_REACH; dz++)
            for (let dx = -LOT_REACH; dx <= LOT_REACH; dx++) {
              const X = x + dx;
              const Z = z + dz;
              if (X >= 0 && Z >= 0 && X < n && Z < n && (lotId[Z * n + X] !== 0 || !!dug?.[Z * n + X])) floor = Math.max(floor, orig[Z * n + X]);
            }
          if (floor === -Infinity) continue;
          dist[at(x, z)] = 0;
          src[at(x, z)] = floor;
          queue.push(at(x, z));
        }
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        if (dist[i] + 1 >= LOT_BANK) continue;
        const x = x0 + (i % w);
        const z = z0 + ((i / w) | 0);
        for (const [dx, dz] of DIRS) {
          if (!inPark(x + dx, z + dz)) continue;
          const j = at(x + dx, z + dz);
          if (dist[j] <= dist[i] + 1) continue;
          dist[j] = dist[i] + 1;
          src[j] = src[i];
          queue.push(j);
        }
      }
      for (let i = 0; i < w * d; i++) {
        const k = (z0 + ((i / w) | 0)) * n + x0 + (i % w);
        if (!(dist[i] < LOT_BANK) || height[k] >= src[i]) continue;
        height[k] = Math.round(src[i] + (height[k] - src[i]) * smooth(dist[i] / LOT_BANK));
      }
    }
    limitPaths(entries);
  }

  /**
   * Beside the ways in, the lawn slopes down (or up) to the stairs over FLANK, a grassy bank
   * instead of a wall: each lawn column near a path column off the park's level eases toward it.
   */
  const slopeFlanks = () => {
    const src = new Float32Array(w * d).fill(NaN);
    const dist = new Float32Array(w * d).fill(Infinity);
    const queue: number[] = [];
    for (let i = 0; i < w * d; i++) {
      if (!paved[i] || Math.abs(height[(z0 + ((i / w) | 0)) * n + x0 + (i % w)] - levels[i]) < 1) continue;
      dist[i] = 0;
      src[i] = height[(z0 + ((i / w) | 0)) * n + x0 + (i % w)];
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (dist[i] >= FLANK) continue;
      const x = x0 + (i % w);
      const z = z0 + ((i / w) | 0);
      for (const [dx, dz] of DIRS) {
        if (!inPark(x + dx, z + dz) || pathAt(x + dx, z + dz)) continue;
        const j = at(x + dx, z + dz);
        if (dist[j] <= dist[i] + 1) continue;
        dist[j] = dist[i] + 1;
        src[j] = src[i];
        queue.push(j);
      }
    }
    for (let i = 0; i < w * d; i++) {
      if (paved[i] || !(dist[i] < FLANK)) continue;
      const k = (z0 + ((i / w) | 0)) * n + x0 + (i % w);
      height[k] = Math.max(1, Math.round(src[i] + (height[k] - src[i]) * smooth(dist[i] / FLANK)));
    }
  };

  // Distance to the nearest path (columns, chessboard), out to 40 (the paths only: not the terraces paved later).
  const pathDist = new Float32Array(w * d).fill(Infinity);
  {
    const queue: number[] = [];
    for (let i = 0; i < w * d; i++) if (paved[i]) (pathDist[i] = 0), queue.push(i);
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % w;
      const z = (i / w) | 0;
      if (pathDist[i] >= 40) continue;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx;
          const Z = z + dz;
          if (X < 0 || Z < 0 || X >= w || Z >= d) continue;
          const j = Z * w + X;
          if (pathDist[j] > pathDist[i] + 1) {
            pathDist[j] = pathDist[i] + 1;
            queue.push(j);
          }
        }
      }
    }
  }
  const distToPath = (x: number, z: number) => (inRect(x, z) ? pathDist[at(x, z)] : 0);

  // What is taken on the ground (terraces and the footprints of props), so later ones keep clear.
  const taken = new Uint8Array(w * d);
  const cells = (x: number, z: number, hx: number, hz: number) => {
    const out: [number, number][] = [];
    for (let Z = Math.floor(z - hz); Z < Math.ceil(z + hz); Z++) for (let X = Math.floor(x - hx); X < Math.ceil(x + hx); X++) out.push([X, Z]);
    return out;
  };
  /** True if a square of radius r around a column is all free park (paths allowed if `onPath`). */
  const clear = (x: number, z: number, r: number, onPath = true) => {
    for (const [X, Z] of cells(x, z, r, r)) if (!inPark(X, Z) || taken[at(X, Z)] || (!onPath && pathAt(X, Z))) return false;
    return true;
  };
  /**
   * The level a terrace over a footprint would be cut to (its median ground) and the most it cuts
   * or fills; null if any of it is outside the park, taken, or (unless allowed) on a path.
   */
  const survey = (x: number, z: number, hx: number, hz: number, onPath = false) => {
    const hs: number[] = [];
    for (const [X, Z] of cells(x, z, hx, hz)) {
      if (!inPark(X, Z) || taken[at(X, Z)] || (!onPath && pathAt(X, Z))) return null;
      hs.push(heightAt(X, Z));
    }
    if (!hs.length) return null;
    hs.sort((a, b) => a - b);
    const level = hs[hs.length >> 1];
    return { level, cut: Math.max(level - hs[0], hs[hs.length - 1] - level) };
  };
  /** True if paving a footprint at `level` leaves no step of more than 2 voxels (50 cm) to a path beside it. */
  const meetsPaths = (x: number, z: number, hx: number, hz: number, level: number) => {
    for (const [X, Z] of cells(x, z, hx + 1, hz + 1)) if (pathAt(X, Z) && Math.abs(heightAt(X, Z) - level) > 2) return false;
    return true;
  };
  /** Cuts and fills a footprint level, takes it, and paves it if asked. */
  const terrace = (x: number, z: number, hx: number, hz: number, level: number, paint: boolean) => {
    for (const [X, Z] of cells(x, z, hx, hz)) {
      if (!inPark(X, Z)) continue;
      height[Z * n + X] = level;
      taken[at(X, Z)] = 1;
      if (paint) pave(X, Z);
    }
  };
  const take = (x: number, z: number, hx: number, hz: number) => {
    for (const [X, Z] of cells(x, z, hx, hz)) if (inRect(X, Z)) taken[at(X, Z)] = 1;
  };
  /** The spot (of `spots`) whose terrace cuts least, up to `max`; it is cut, taken and (if `paint`) paved. */
  const settle = (spots: [number, number][], hx: number, hz: number, max: number, paint: boolean, margin = 1) => {
    let best: { x: number; z: number; level: number; cut: number } | null = null;
    for (const [x, z] of spots) {
      const s = survey(x, z, hx + margin, hz + margin);
      if (s && s.cut <= max && (!best || s.cut < best.cut) && (!paint || meetsPaths(x, z, hx + margin, hz + margin, s.level))) best = { x, z, ...s };
    }
    if (best) terrace(best.x, best.z, hx + margin, hz + margin, best.level, paint);
    return best;
  };

  const props: ParkProp[] = [];
  const reach = Math.hypot(w, d) / 2;
  const add = (kind: ParkPropKind, x: number, z: number, y: number, rotation = 0, size = 0) =>
    props.push({ kind, x, z, y, rotation, size, seed: Math.floor(rng.next() * 1e6), delay: Math.min(1, (Math.hypot(x - cx, z - cz) / reach) * 0.8 + rng.next() * 0.2) });
  const shuffle = <T>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const grid = (step: number) => {
    const spots: [number, number][] = [];
    for (let z = z0 + step / 2; z < z1; z += step) for (let x = x0 + step / 2; x < x1; x += step) spots.push([Math.round(x), Math.round(z)]);
    return spots;
  };

  // 3. The middle: the court (levelled whole) or a paved terrace, with a fountain or a pavilion on
  // it, or in a garden a pair of flower beds.
  const middle = cross ? COURT : voxels(3.5);
  {
    const round = (X: number, Z: number) => !cross || Math.hypot(X + 0.5 - cx, Z + 0.5 - cz) <= COURT;
    const area = cells(cx, cz, middle, middle).filter(([X, Z]) => inPark(X, Z) && round(X, Z));
    const hs = area.map(([X, Z]) => heightAt(X, Z)).sort((a, b) => a - b);
    if (!hs.length) slopeFlanks();
    else {
      const level = hs[hs.length >> 1];
      for (const [X, Z] of area) {
        height[Z * n + X] = level;
        taken[at(X, Z)] = 1;
        pave(X, Z);
      }
      // The paths meet it in single steps too.
      const fixed = new Map(entries);
      for (const [X, Z] of area) fixed.set(at(X, Z), level);
      limitPaths(fixed);
      slopeFlanks();
      if (garden) {
        const bed = voxels(4);
        for (const s of [-1, 1]) add("flowerbed", cx, cz + s * voxels(1.1), level, 0, bed);
      } else add(cross ? "fountain" : "pavilion", cx, cz, level, rng.int(0, 3) * (Math.PI / 2));
      for (const p of props) p.delay = 0;
      // Flower beds around it, on the four diagonals: alternately along x and along z, so the four
      // turn around the middle; each on a paved terrace its size.
      const bed = voxels(rng.range(2.4, 3.4));
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        const alongX = sx === sz;
        const hx = alongX ? bed / 2 : voxels(0.6);
        const hz = alongX ? voxels(0.6) : bed / 2;
        // Just outside the middle, or a little farther out where that is taken or steep.
        const spots = [2.5, 3.5, 4.5, 5.5].map((m): [number, number] => {
          const out = middle + voxels(m);
          return [Math.round(cx + (sx * out) / Math.SQRT2), Math.round(cz + (sz * out) / Math.SQRT2)];
        });
        const spot = settle(spots, hx, hz, MAX_CUT, true, 1);
        if (spot) add("flowerbed", spot.x, spot.z, spot.level, alongX ? 0 : Math.PI / 2, bed);
      }
    }
  }

  // The fence: along each side, on its edge columns (not where a path comes in), in runs of level ground, stepping where the ground does. Along x, a run spans its columns
  // whole; along z, it stops short of a corner already fenced along x.
  {
    const clearOfX = FENCE_INSET + 0.25;
    const sides: { line: number; from: number; to: number; alongX: boolean; out: number }[] = [
      { line: z0, from: x0, to: x1, alongX: true, out: -1 },
      { line: z1 - 1, from: x0, to: x1, alongX: true, out: 1 },
      { line: x0, from: z0, to: z1, alongX: false, out: -1 },
      { line: x1 - 1, from: z0, to: z1, alongX: false, out: 1 },
    ];
    const fenced = (s: (typeof sides)[number], i: number) => {
      const [x, z] = s.alongX ? [i, s.line] : [s.line, i];
      const [ox, oz] = s.alongX ? [x, z + s.out] : [x + s.out, z];
      return inPark(x, z) && !pathAt(x, z) && !inRect(ox, oz);
    };
    const fencedX = new Set<number>();
    for (const s of sides) {
      if (!s.alongX) continue;
      for (let i = s.from; i < s.to; i++) if (fenced(s, i)) fencedX.add(at(i, s.line));
    }
    for (const s of sides) {
      let start = -1;
      const flush = (end: number) => {
        if (start < 0) return;
        let a = start;
        let b = end;
        if (!s.alongX) {
          if (fencedX.has(at(s.line, start))) a += start === z0 ? clearOfX : 0;
          if (fencedX.has(at(s.line, end - 1))) b -= end === z1 ? clearOfX : 0;
        }
        const mid = (a + b) / 2;
        const off = s.out < 0 ? FENCE_INSET : 1 - FENCE_INSET;
        const [x, z] = s.alongX ? [mid, s.line + off] : [s.line + off, mid];
        const [cx0, cz0] = s.alongX ? [start, s.line] : [s.line, start];
        add("fence", x, z, heightAt(cx0, cz0), s.alongX ? 0 : Math.PI / 2, b - a);
        for (let i = start; i < end; i++) {
          const [X, Z] = s.alongX ? [i, s.line] : [s.line, i];
          taken[at(X, Z)] = 1;
        }
        start = -1;
      };
      for (let i = s.from; i < s.to; i++) {
        const [x, z] = s.alongX ? [i, s.line] : [s.line, i];
        if (!fenced(s, i)) {
          flush(i);
          continue;
        }
        if (start >= 0) {
          const [px, pz] = s.alongX ? [start, s.line] : [s.line, start];
          if (heightAt(x, z) !== heightAt(px, pz)) flush(i);
        }
        if (start < 0) start = i;
      }
      flush(s.to);
    }
  }

  // 4. A playground in most parks, where the ground is gentlest.
  if (!garden && rng.chance(0.75)) {
    const spot = settle(
      grid(4).filter(([x, z]) => distToPath(x, z) >= 3 && distToPath(x, z) < 30),
      voxels(4),
      voxels(3.5),
      MAX_CUT,
      false,
    );
    if (spot) add("playground", spot.x, spot.z, spot.level, rng.int(0, 1) * Math.PI);
  }

  // 5. Picnic tables on the lawn, each on a small paved terrace.
  if (!garden)
    for (let i = rng.int(1, 3); i > 0; i--) {
      const spots = shuffle(grid(6).filter(([x, z]) => distToPath(x, z) >= 6 && distToPath(x, z) < 24)).slice(0, 40);
      const spot = settle(spots, voxels(1.2), voxels(1.1), MAX_CUT_SMALL, true);
      if (spot) add("picnic", spot.x, spot.z, spot.level, rng.int(0, 1) * (Math.PI / 2));
    }

  // 6. Benches (and lamps, or in a garden beds) along the paths: a lawn column 2 columns from the
  // path's edge along an axis. A bench sits in a paved niche reaching back to the path, facing it.
  const along: { x: number; z: number; dx: number; dz: number }[] = [];
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      if (!inPark(x, z) || pathAt(x, z)) continue;
      for (const [dx, dz] of DIRS) if (pathAt(x + dx * 2, z + dz * 2) && !pathAt(x + dx, z + dz)) along.push({ x, z, dx, dz });
    }
  }
  shuffle(along);
  const near = (list: { x: number; z: number }[], x: number, z: number, apart: number) => list.some((q) => Math.hypot(q.x - x, q.z - z) < apart);
  const benches: { x: number; z: number }[] = [];
  const lamps: { x: number; z: number }[] = [];
  const beds: { x: number; z: number }[] = [];
  for (const a of along) {
    if (near(benches, a.x, a.z, BENCH_APART)) continue;
    // The niche: the bench (long across the way it faces) and the strip in front of it to the path.
    const long = voxels(1.1);
    const hx = a.dx ? 1.5 : long;
    const hz = a.dx ? long : 1.5;
    // (Centered on column `a`: the niche is it and one column either way, the bench on it.)
    const s = survey(a.x + 0.5, a.z + 0.5, hx, hz);
    if (!s || s.cut > MAX_CUT_SMALL || !meetsPaths(a.x + 0.5, a.z + 0.5, hx, hz, s.level)) continue;
    terrace(a.x + 0.5, a.z + 0.5, hx, hz, s.level, true);
    benches.push(a);
    add("bench", a.x + 0.5, a.z + 0.5, s.level, Math.atan2(a.dx, a.dz));
    // A litter bin beside some.
    if (!garden && rng.chance(0.4)) {
      const bx = a.x + (a.dx ? 0 : voxels(1.6));
      const bz = a.z + (a.dx ? voxels(1.6) : 0);
      // (Its pad reaches past its lid on every side.)
      const b = survey(bx, bz, 1.5, 1.5);
      if (b && b.cut <= MAX_CUT_SMALL && meetsPaths(bx, bz, 1.5, 1.5, b.level)) {
        terrace(bx, bz, 1.5, 1.5, b.level, true);
        add("bin", bx, bz, b.level, Math.atan2(a.dx, a.dz));
      }
    }
  }
  if (garden) {
    // Beds along the paths, long side to the path, between the benches.
    const length = voxels(2.6);
    for (const a of along) {
      if (near(beds, a.x, a.z, BED_APART) || near(benches, a.x, a.z, voxels(2.4))) continue;
      // Centered a column back from `a`, so its near side keeps a column of lawn to the path.
      const bx = a.x - a.dx;
      const bz = a.z - a.dz;
      const hx = a.dx ? voxels(0.6) : length / 2;
      const hz = a.dx ? length / 2 : voxels(0.6);
      const s = survey(bx, bz, hx, hz);
      if (!s || s.cut > MAX_CUT_SMALL) continue;
      terrace(bx, bz, hx, hz, s.level, false);
      beds.push(a);
      add("flowerbed", bx, bz, s.level, Math.atan2(a.dx, a.dz), length);
    }
  } else {
    for (const a of along) {
      if (near(lamps, a.x, a.z, LAMP_APART) || near(benches, a.x, a.z, voxels(2.5))) continue;
      const s = survey(a.x, a.z, 1, 1);
      if (!s || s.cut > MAX_CUT_SMALL) continue;
      terrace(a.x, a.z, 1, 1, s.level, false);
      lamps.push(a);
      add("lamp", a.x, a.z, s.level, Math.atan2(a.dx, a.dz));
    }
    // 7. A vending machine beside a path where it comes in from the street, facing the path.
    if (rng.chance(0.7)) {
      for (const a of along) {
        if (distToEdge(a.x, a.z) > voxels(2.5) || distToEdge(a.x, a.z) < 2) continue;
        const s = survey(a.x, a.z, voxels(0.6), voxels(0.6));
        if (!s || s.cut > MAX_CUT_SMALL || !meetsPaths(a.x, a.z, voxels(0.6), voxels(0.6), s.level)) continue;
        terrace(a.x, a.z, voxels(0.6), voxels(0.6), s.level, true);
        add("vending", a.x, a.z, s.level, Math.atan2(a.dx, a.dz));
        break;
      }
    }
  }

  if (!garden) {
    // 8. Hedges along the edge (some parks), three columns in: runs of free lawn, level across the
    // hedge's whole depth (±2 columns).
    if (rng.chance(0.55)) {
      const depth = 2;
      const runs = (from: [number, number], step: [number, number], count: number, rotation: number) => {
        const across: [number, number] = [step[1], step[0]];
        let start = -1;
        let level = 0;
        const flush = (end: number) => {
          if (start >= 0 && end - start >= 4) {
            const mid = (start + end - 1) / 2;
            add("hedge", from[0] + step[0] * mid + 0.5, from[1] + step[1] * mid + 0.5, level, rotation, end - start);
            for (let i = start; i < end; i++)
              for (let j = -depth; j <= depth; j++) {
                const X = from[0] + step[0] * i + across[0] * j;
                const Z = from[1] + step[1] * i + across[1] * j;
                if (inRect(X, Z)) taken[at(X, Z)] = 1;
              }
          }
          start = -1;
        };
        for (let i = 0; i < count; i++) {
          const X = from[0] + step[0] * i;
          const Z = from[1] + step[1] * i;
          let ok = distToPath(X, Z) >= 3;
          const h = heightAt(X, Z);
          for (let j = -depth; ok && j <= depth; j++) {
            const x = X + across[0] * j;
            const z = Z + across[1] * j;
            ok = inPark(x, z) && !taken[at(x, z)] && heightAt(x, z) === h;
          }
          if (!ok || (start >= 0 && h !== level)) flush(i);
          if (ok && start < 0) {
            start = i;
            level = h;
          }
        }
        flush(count);
      };
      const inn = 3;
      runs([x0 + inn, z0 + inn], [1, 0], w - 2 * inn, 0);
      runs([x0 + inn, z1 - 1 - inn], [1, 0], w - 2 * inn, 0);
      runs([x0 + inn, z0 + inn + 3], [0, 1], d - 2 * inn - 6, Math.PI / 2);
      runs([x1 - 1 - inn, z0 + inn + 3], [0, 1], d - 2 * inn - 6, Math.PI / 2);
    }

    // The ground under a trunk or a bush: its lowest column, so it never floats on a step; and the
    // highest ground within a radius, which a crown must clear.
    const lowest = (x: number, z: number, r: number) => {
      let lo = Infinity;
      for (let Z = z - r; Z <= z + r; Z++) for (let X = x - r; X <= x + r; X++) lo = Math.min(lo, heightAt(X, Z));
      return lo;
    };
    const highest = (x: number, z: number, r: number) => {
      let hi = -Infinity;
      for (const [X, Z] of cells(x + 0.5, z + 0.5, r, r)) hi = Math.max(hi, heightAt(X, Z));
      return hi;
    };
    // What a crown or a shrub must keep out of: every prop so far (hedges and beds as a row of
    // circles along their length), with its top.
    const rooms: { x: number; z: number; r: number; top: number }[] = [];
    for (const p of props) {
      const room = ROOM[p.kind];
      if (room) rooms.push({ x: p.x, z: p.z, r: room[0], top: p.y + room[1] });
      else if (p.kind === "hedge" || p.kind === "flowerbed" || p.kind === "fence") {
        const [r, top] = p.kind === "hedge" ? [voxels(0.75), voxels(1.2)] : p.kind === "fence" ? [0.5, FENCE_HEIGHT + 0.5] : [voxels(0.85), voxels(0.9)];
        const ux = Math.cos(p.rotation);
        const uz = -Math.sin(p.rotation);
        for (let u = -p.size / 2; u <= p.size / 2; u += r) rooms.push({ x: p.x + ux * u, z: p.z + uz * u, r, top: p.y + top });
      }
    }
    /** True if something reaching `radius` around (x, z), from `bottom` up, would meet no prop. */
    const roomy = (x: number, z: number, radius: number, bottom: number) => rooms.every((q) => q.top <= bottom || Math.hypot(q.x - x, q.z - z) >= q.r + radius);
    /** True if a circle of radius r around (x, z) lies all in the park. */
    const within = (x: number, z: number, r: number) => cells(x, z, r, r).every(([X, Z]) => inPark(X, Z));

    // 9. Trees: thick along the edge, sparse on the open lawn, never on a path; the park's favorite
    // kind most. A crown stays inside the park, clear of the ground under it, of every other crown
    // and of the tall props.
    const kinds: ParkPropKind[] = ["broadleaf", "conifer", "blossom"];
    const favorite = rng.pick(kinds);
    // (`foot`: what lies on the ground around the trunk: the trunk itself, or a blossom's petals.)
    const crowns: { x: number; z: number; r: number; foot: number }[] = [];
    for (let tries = Math.round(w * d * TREE_TRIES); tries > 0; tries--) {
      const x = x0 + Math.floor(rng.next() * w);
      const z = z0 + Math.floor(rng.next() * d);
      if (!inPark(x, z) || distToPath(x, z) < voxels(1.2)) continue;
      if (distToEdge(x, z) >= EDGE_BAND && rng.next() > 0.3) continue;
      const kind = rng.chance(0.65) ? favorite : rng.pick(kinds);
      const size = voxels(kind === "conifer" ? rng.range(5, 8.5) : rng.range(4.5, 7.5));
      const { radius, bottom } = crown(kind, size);
      if (distToEdge(x, z) < radius + 1 || !clear(x + 0.5, z + 0.5, 3, false)) continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      if (!within(cx, cz, radius + 1) || crowns.some((c) => Math.hypot(c.x - cx, c.z - cz) < c.r + radius)) continue;
      const y = lowest(x, z, 1);
      if (highest(x, z, radius) - y > bottom - 2 || !roomy(cx, cz, radius, y + bottom)) continue;
      // A blossom's fallen petals lie around its foot.
      if (kind === "blossom" && !roomy(cx, cz, petals(size), -Infinity)) continue;
      crowns.push({ x: cx, z: cz, r: radius, foot: kind === "blossom" ? petals(size) : 2 });
      add(kind, cx, cz, y, rng.next() * Math.PI * 2, size);
      take(cx, cz, 2, 2);
    }

    // 10. Shrubs: along the paths and between the trees, each clear of the paths and of everything else.
    const bushes: { x: number; z: number; r: number }[] = [];
    for (let tries = Math.round(w * d * SHRUB_TRIES); tries > 0; tries--) {
      const x = x0 + Math.floor(rng.next() * w);
      const z = z0 + Math.floor(rng.next() * d);
      const p = distToPath(x, z);
      if (!inPark(x, z) || p < 2 || p > 14) continue;
      const size = voxels(rng.range(0.7, 1.3));
      const r = shrubRadius(size);
      const sx = x + 0.5;
      const sz = z + 0.5;
      if (p < r + 1 || distToEdge(x, z) < r + 1 || !clear(sx, sz, r + 0.5, false)) continue;
      if (crowns.some((c) => Math.hypot(c.x - sx, c.z - sz) < r + Math.max(3, c.foot)) || bushes.some((b) => Math.hypot(b.x - sx, b.z - sz) < b.r + r)) continue;
      // On level ground only (a bush on a step would be half buried), and clear of every prop.
      const y = lowest(x, z, Math.ceil(r));
      if (highest(x, z, r) - y > 1 || !roomy(sx, sz, r, -Infinity)) continue;
      bushes.push({ x: sx, z: sz, r });
      take(sx, sz, r, r);
      add("shrub", sx, sz, y, rng.next() * Math.PI * 2, size);
    }
  }

  // 11. Stone copings: the upper edge of every step of COPING or more (inside the park or at its
  // edge) is paved, so its side is drawn as a retaining wall, not cliff rock.
  const copings: number[] = [];
  for (let z = z0; z < z1; z++) {
    for (let x = x0; x < x1; x++) {
      if (!inPark(x, z) || pathAt(x, z)) continue;
      const h = heightAt(x, z);
      if (DIRS.some(([dx, dz]) => h - heightAt(x + dx, z + dz) >= COPING)) copings.push(z * n + x);
    }
  }
  for (const k of copings) path[k] = 1;

  return { x: cx, z: cz, fromPlaza: plaza ? Math.hypot(cx - plaza.x, cz - plaza.z) : 0, garden, props };
}
