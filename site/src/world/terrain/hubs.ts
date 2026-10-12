import { smoothstep } from "../noise";
import { VOXEL_M } from "../scale";
import type { Claims } from "./claims";
import type { HeightMap } from "./heights";

/**
 * Hubs: where the megacity starts and where it may spread. Nothing here is tunable; every number
 * is a constant below. (The street network grows from this: streets.ts.)
 *
 * Everything works on a coarse grid of 2 m cells (CELL × CELL columns), which the streets use too.
 * Each cell's height and slope come from its mean height on the finished, river-carved ground, so
 * a flat valley floor counts as flat and single terrace steps average out.
 *
 * 1. The center: the cell with the best suitability (an "interest map", as in Emilien et al. 2012):
 *
 *      flat  = 1 − smoothstep(0, CENTER_SLOPE, slope)
 *      river = exp(−((d − RIVER_DISTANCE) / RIVER_BAND)²)      d = distance to the river channel
 *      low   = 1 − 0.5 · height / Height
 *      S     = flat · low · (RIVER_FLOOR + (1 − RIVER_FLOOR) · river)
 *
 *    S is 0 within 1 m of the channel and in the outer EDGE cells. Without a river, `river` is 1.
 * 2. Buildable cells: slope under BUILD_SLOPE, at least RIVER_CLEARANCE from the channel, away from
 *    the edge, and on the center's side of the river (until bridges exist). `span` is how far
 *    the buildable land reaches from the center.
 */

/** Columns per side of one cell (2 m). */
export const CELL = 8;
/** Cells left out along the diorama's edge. */
const EDGE = 2;
/** The center's preferred distance from the river, and the width of that preference, in meters. */
const RIVER_DISTANCE = 8;
const RIVER_BAND = 15;
/** Far from the river the center's score keeps this share. */
const RIVER_FLOOR = 0.4;
/** Slope (degrees) at which a cell stops being a candidate center. */
const CENTER_SLOPE = 8;
/** Steepest ground (degrees) a junction may sit on. */
const BUILD_SLOPE = 15;
/** Junctions keep this far from the river channel, in meters. */
const RIVER_CLEARANCE = 3;

export interface Hub {
  /** Cell coordinates. */
  cx: number;
  cz: number;
  /** Center of the cell, in columns. */
  x: number;
  z: number;
  /** Distance from the city center, in meters. */
  fromCenter: number;
}

export interface Hubs {
  /** Cells per side. Row-major by z, then x. */
  cells: number;
  /** Suitability for the center per cell, 0–1; 0 where nothing can be built. */
  suitability: Float32Array;
  /** 1 for cells a junction (and later a building) may sit on. */
  buildable: Uint8Array;
  /** 1 for cells on the center's side of the river. */
  side: Uint8Array;
  /** Distance from the center to the furthest buildable cell, in meters. */
  span: number;
  /** Mean ground height per cell, in voxels. */
  mean: Float32Array;
  /** Distance from each cell's center to the river channel, in meters. */
  riverD: Float32Array;
  /** The city center (one hub; kept as a list for the overlay). */
  hubs: Hub[];
}

export function buildHubs(map: HeightMap, claims: Claims): Hubs {
  const { n, h, top } = map;
  const cells = n / CELL;

  // Mean height per cell, and channel per cell (a cell holding any channel column).
  const mean = new Float32Array(cells * cells);
  const wet = new Uint8Array(cells * cells);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const c = Math.floor(z / CELL) * cells + Math.floor(x / CELL);
      mean[c] += h[z * n + x];
      if (claims.riverDist[z * n + x] === 0) wet[c] = 1;
    }
  }
  for (let c = 0; c < mean.length; c++) mean[c] /= CELL * CELL;
  const hasRiver = wet.some(Boolean);

  // Slope and river distance per cell.
  const at = (cx: number, cz: number) => mean[Math.min(cells - 1, Math.max(0, cz)) * cells + Math.min(cells - 1, Math.max(0, cx))];
  const slope = new Float32Array(cells * cells);
  const riverD = new Float32Array(cells * cells);
  for (let cz = 0; cz < cells; cz++) {
    for (let cx = 0; cx < cells; cx++) {
      const c = cz * cells + cx;
      const gx = (at(cx + 1, cz) - at(cx - 1, cz)) / (2 * CELL);
      const gz = (at(cx, cz + 1) - at(cx, cz - 1)) / (2 * CELL);
      slope[c] = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
      riverD[c] = claims.riverDist[(cz * CELL + CELL / 2) * n + cx * CELL + CELL / 2] * VOXEL_M;
    }
  }
  const inside = (cx: number, cz: number) => cx >= EDGE && cz >= EDGE && cx < cells - EDGE && cz < cells - EDGE;

  // 1. The center.
  const suitability = new Float32Array(cells * cells);
  let best = -1;
  for (let cz = EDGE; cz < cells - EDGE; cz++) {
    for (let cx = EDGE; cx < cells - EDGE; cx++) {
      const c = cz * cells + cx;
      if (riverD[c] < 1) continue;
      const flat = 1 - smoothstep(0, CENTER_SLOPE, slope[c]);
      const river = hasRiver ? Math.exp(-(((riverD[c] - RIVER_DISTANCE) / RIVER_BAND) ** 2)) : 1;
      const low = 1 - (0.5 * mean[c]) / top;
      suitability[c] = flat * low * (RIVER_FLOOR + (1 - RIVER_FLOOR) * river);
      if (best < 0 || suitability[c] > suitability[best]) best = c;
    }
  }
  if (best < 0 || suitability[best] <= 0) return { cells, suitability, buildable: new Uint8Array(cells * cells), side: new Uint8Array(cells * cells), span: 0, mean, riverD, hubs: [] };
  const ccx = best % cells;
  const ccz = (best - ccx) / cells;

  // 2. Buildable cells on the center's side of the river: a flood fill that never enters a wet cell.
  const buildable = new Uint8Array(cells * cells);
  const side = new Uint8Array(cells * cells);
  const queue = [best];
  side[best] = 1;
  while (queue.length) {
    const c = queue.pop()!;
    const cx = c % cells;
    const cz = (c - cx) / cells;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
      const nc = z * cells + x;
      if (side[nc] || wet[nc]) continue;
      side[nc] = 1;
      queue.push(nc);
    }
  }
  const meters = (cx: number, cz: number) => Math.hypot(cx - ccx, cz - ccz) * CELL * VOXEL_M;
  let span = 0;
  for (let cz = 0; cz < cells; cz++) {
    for (let cx = 0; cx < cells; cx++) {
      const c = cz * cells + cx;
      if (!side[c] || !inside(cx, cz) || slope[c] > BUILD_SLOPE || riverD[c] < RIVER_CLEARANCE) {
        suitability[c] = 0;
        continue;
      }
      buildable[c] = 1;
      span = Math.max(span, meters(cx, cz));
    }
  }
  buildable[best] = 1;

  const hubs: Hub[] = [{ cx: ccx, cz: ccz, x: ccx * CELL + CELL / 2, z: ccz * CELL + CELL / 2, fromCenter: 0 }];
  return { cells, suitability, buildable, side, span, mean, riverD, hubs };
}
