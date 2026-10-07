import { MinHeap, N8, chaikin, resample, type P2 } from "../grid";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import { FIELD_RES, terraceTop } from "../scale";
import { FIELD_NODES } from "./island";
import { SEA_THRESHOLD, SURFACE, type TerrainData } from "./terrain";

/**
 * Stage 03, water and rivers, on the coarse eroded elevation field.
 *
 * 1. Priority-flood: grow inward from the sea, always taking the lowest open node next. Each node
 *    remembers which node reached it (its "receiver"), which gives every point a downhill path to
 *    the sea. Pits get filled on the way; where the filled surface sits above the ground, that is
 *    a lake.
 * 2. Flow accumulation: walk the nodes from highest to lowest and add each node's catchment to its
 *    receiver. The node with the biggest catchment that empties into the sea is the river mouth.
 * 3. The main stem: from the mouth, keep stepping upstream into the child with the largest
 *    catchment until the flow gets small. That is the river.
 * 4. Carving: the river is drawn onto the voxel columns, a little wider downstream. Its level
 *    never rises going downstream, so it cuts gorges into the terraces and drops one storey at a
 *    time: each drop is a waterfall.
 *
 * This stage changes the terrain where water cuts into it.
 */

export const WATER_KIND = { none: 0, river: 1, lake: 2 } as const;

export interface WaterData {
  /** Water surface height per column for rivers and lakes; NaN where there is none (the sea is separate). */
  surfaceY: Float32Array;
  /** WATER_KIND per column. */
  kind: Uint8Array;
  /** River centre line in column coordinates, source to mouth. Empty if this island has no river. */
  riverPath: P2[];
  falls: number;
  lakes: number;
}


export function buildWater(_rng: Rng, terrain: TerrainData, params: WorldParams["water"]): WaterData {
  const field = terrain.elevation;
  const nodes = FIELD_NODES * FIELD_NODES;
  const sea = (k: number) => field[k] < SEA_THRESHOLD;

  // 1. Priority-flood from every sea node.
  const filled = new Float32Array(nodes);
  const receiver = new Int32Array(nodes).fill(-1);
  const visited = new Uint8Array(nodes);
  const order: number[] = [];
  const heap = new MinHeap();
  for (let k = 0; k < nodes; k++) {
    if (sea(k)) {
      filled[k] = field[k];
      visited[k] = 1;
      heap.push(k, field[k]);
    }
  }
  while (heap.size) {
    const k = heap.pop();
    order.push(k);
    const i = k % FIELD_NODES;
    const j = (k - i) / FIELD_NODES;
    for (const [di, dj] of N8) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= FIELD_NODES || nj >= FIELD_NODES) continue;
      const nk = nj * FIELD_NODES + ni;
      if (visited[nk]) continue;
      visited[nk] = 1;
      filled[nk] = Math.max(field[nk], filled[k] + 1e-6);
      receiver[nk] = k;
      heap.push(nk, filled[nk]);
    }
  }

  // 2. Flow accumulation, highest node first.
  const flow = new Float32Array(nodes);
  for (let k = 0; k < nodes; k++) if (!sea(k)) flow[k] = 1;
  for (let o = order.length - 1; o >= 0; o--) {
    const k = order[o];
    if (!sea(k) && receiver[k] >= 0) flow[receiver[k]] += flow[k];
  }

  // 3. Main stem, from the biggest mouth upstream.
  let mouth = -1;
  for (let k = 0; k < nodes; k++) {
    if (!sea(k) && receiver[k] >= 0 && sea(receiver[k]) && (mouth < 0 || flow[k] > flow[mouth])) mouth = k;
  }
  const children = new Map<number, number[]>();
  for (let k = 0; k < nodes; k++) {
    if (sea(k) || receiver[k] < 0) continue;
    const list = children.get(receiver[k]);
    if (list) list.push(k);
    else children.set(receiver[k], [k]);
  }
  const stem: number[] = [];
  if (mouth >= 0 && params.river) {
    stem.push(receiver[mouth]);
    let k = mouth;
    while (k >= 0 && flow[k] >= params.riverFlow) {
      stem.push(k);
      let next = -1;
      for (const c of children.get(k) ?? []) if (next < 0 || flow[c] > flow[next]) next = c;
      k = next;
    }
  }

  const n = terrain.n;
  const surfaceY = new Float32Array(n * n).fill(NaN);
  const kind = new Uint8Array(n * n);
  const toColumn = (k: number): P2 => {
    const i = k % FIELD_NODES;
    const j = (k - i) / FIELD_NODES;
    return { x: (i * n) / FIELD_RES, z: (j * n) / FIELD_RES };
  };

  // 4. Carve the river, source first.
  let riverPath: P2[] = [];
  let falls = 0;
  if (stem.length >= 10) {
    riverPath = resample(chaikin(stem.map(toColumn).reverse(), 2), 1);
    const riverLevel = new Int8Array(n * n).fill(127);
    let current = 127;
    for (let p = 0; p < riverPath.length; p++) {
      const cx = Math.round(riverPath[p].x);
      const cz = Math.round(riverPath[p].z);
      if (cx < 0 || cz < 0 || cx >= n || cz >= n) break;
      const here = terrain.level[cz * n + cx];
      if (here >= 0 && here < current) {
        if (current !== 127) falls++;
        current = here;
      }
      if (current === 127) continue;
      const r = (params.riverWidth * (3 + 4 * (p / riverPath.length))) / 2;
      for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) {
        for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
          if (dx * dx + dz * dz > r * r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const k = z * n + x;
          if (terrain.level[k] < 0 && kind[k] === 0) continue;
          // Never above the ground it runs through, so the channel never stands up as a wall.
          riverLevel[k] = Math.min(riverLevel[k], current, terrain.level[k]);
          kind[k] = WATER_KIND.river;
        }
      }
      if (here < 0) break;
    }
    for (let k = 0; k < n * n; k++) {
      if (kind[k] !== WATER_KIND.river) continue;
      carve(terrain, surfaceY, k, riverLevel[k]);
    }
  }

  // Lakes: filled pits on land, as connected pieces.
  let lakes = 0;
  const lakeNode = new Uint8Array(nodes);
  for (let k = 0; k < nodes; k++) if (!sea(k) && filled[k] - field[k] > params.lakeDepth) lakeNode[k] = 1;
  const pieceOf = new Int32Array(nodes).fill(-1);
  const pieces: number[][] = [];
  for (let start = 0; start < nodes; start++) {
    if (!lakeNode[start] || pieceOf[start] >= 0) continue;
    const piece: number[] = [];
    const stack = [start];
    pieceOf[start] = pieces.length;
    while (stack.length) {
      const k = stack.pop()!;
      piece.push(k);
      const i = k % FIELD_NODES;
      const j = (k - i) / FIELD_NODES;
      for (const [di, dj] of N8) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= FIELD_NODES || nj >= FIELD_NODES) continue;
        const nk = nj * FIELD_NODES + ni;
        if (lakeNode[nk] && pieceOf[nk] < 0) {
          pieceOf[nk] = pieces.length;
          stack.push(nk);
        }
      }
    }
    pieces.push(piece);
  }
  const lakeColumns = pieces.map(() => [] as number[]);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (terrain.level[k] < 0 || kind[k]) continue;
      const node = Math.round((z * FIELD_RES) / n) * FIELD_NODES + Math.round((x * FIELD_RES) / n);
      if (pieceOf[node] >= 0) lakeColumns[pieceOf[node]].push(k);
    }
  }
  for (const columns of lakeColumns) {
    if (columns.length < params.lakeSize) continue;
    let level = 127;
    for (const k of columns) level = Math.min(level, terrain.level[k]);
    for (const k of columns) {
      kind[k] = WATER_KIND.lake;
      carve(terrain, surfaceY, k, level);
    }
    lakes++;
  }

  // Stone banks along rivers and lakes.
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (kind[k] || terrain.level[k] < 0) continue;
      for (const [dx, dz] of N8) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < n && nz < n && kind[nz * n + nx]) {
          terrain.surface[k] = SURFACE.bank;
          break;
        }
      }
    }
  }

  return { surfaceY, kind, riverPath, falls, lakes };
}

/** Sets a column to a water bed two voxels under its terrace, with the surface just below the top. */
function carve(terrain: TerrainData, surfaceY: Float32Array, k: number, level: number) {
  terrain.level[k] = level;
  terrain.height[k] = terraceTop(level) - 2;
  terrain.surface[k] = SURFACE.riverbed;
  surfaceY[k] = terraceTop(level) - 0.6;
}
