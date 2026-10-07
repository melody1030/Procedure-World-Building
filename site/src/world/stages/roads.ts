import { GeometryBuilder, lin, type GeometryData } from "../geometry";
import { MinHeap, N8, chaikin, resample, type P2 } from "../grid";
import { CITY } from "../palette";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import type { DistrictData, DistrictType } from "./districts";
import type { SuitabilityData } from "./suitability";
import type { TerrainData } from "./terrain";
import type { WaterData } from "./water";

/**
 * Stage 07, the road network.
 *
 * 1. Nodes: every district's seed, plus the harbour.
 * 2. Which pairs to join: a minimum spanning tree (Prim) over straight-line distance, then up to
 *    three extra links where the tree makes a long detour between close neighbours (loops).
 * 3. Routing: A* on a grid of 2 × 2 voxel cells. A step costs its length, more near terrace rims,
 *    a lot more for climbing a terrace (30 per level), extra for crossing the river (a bridge), and
 *    much less along a road already built. Roads are routed from the core outward, so later roads
 *    join earlier ones and the network branches like a hillside town.
 * 4. Shape: the cell path is smoothed (Chaikin) and resampled every voxel.
 * 5. Height: each point takes its terrace's height; over water it becomes a bridge deck. Ramps are
 *    then filled in so no step rises faster than 1 voxel per 2, which turns every terrace crossing
 *    into a stair-stepped embankment.
 * 6. Plazas open where three or more roads meet.
 *
 * Every road has a birth time for the growth timeline: the first ones link the core and harbour.
 */

export interface Road {
  points: { x: number; z: number; y: number }[];
  width: number;
  birth: number;
  main: boolean;
}

export interface Plaza {
  x: number;
  z: number;
  y: number;
  r: number;
  birth: number;
}

export const ROAD_KIND = { none: 0, road: 1, sidewalk: 2, plaza: 3 } as const;

export interface RoadData {
  roads: Road[];
  plazas: Plaza[];
  /** Road, sidewalk or plaza per column. */
  kind: Uint8Array;
  /** Surface height of the road per column (NaN where there is none). */
  deckY: Float32Array;
  /** When each road column is built. */
  birth: Float32Array;
  geometry: GeometryData;
  /** Node positions (district seeds, then the harbour) and the links built, for the overlay. */
  nodes: P2[];
}

const CELL = 2;
const BRIDGE_COST = 14;
const SLOPE = 0.5;

const WIDTH: Record<DistrictType, number> = { core: 8, waterfront: 8, residential: 6, industrial: 7, green: 4 };

export function buildRoads(rng: Rng, terrain: TerrainData, water: WaterData, suit: SuitabilityData, districts: DistrictData, params: WorldParams["roads"]): RoadData {
  const { n, height, level } = terrain;
  const LEVEL_COST = params.climb;
  const REUSE = params.reuse;
  const m = n / CELL;

  // 1. Nodes.
  const nodes: P2[] = districts.list.map((d) => d.seed);
  const types: DistrictType[] = districts.list.map((d) => d.type);
  nodes.push(districts.harbour);
  types.push("waterfront");
  const harbourNode = nodes.length - 1;
  const coreNode = Math.max(0, types.indexOf("core"));

  // 2. Minimum spanning tree (Prim), then loops.
  const dist = (a: number, b: number) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
  const inTree = new Set([coreNode]);
  const edges: [number, number][] = [];
  while (inTree.size < nodes.length) {
    let bestEdge: [number, number] | null = null;
    let bestD = Infinity;
    for (const a of inTree) {
      for (let b = 0; b < nodes.length; b++) {
        if (inTree.has(b)) continue;
        const d = dist(a, b);
        if (d < bestD) {
          bestD = d;
          bestEdge = [a, b];
        }
      }
    }
    if (!bestEdge) break;
    inTree.add(bestEdge[1]);
    edges.push(bestEdge);
  }
  // Graph distances over the tree (Floyd–Warshall; there are only a dozen or so nodes).
  const count = nodes.length;
  const graph = Array.from({ length: count }, (_, i) => Array.from({ length: count }, (_, j) => (i === j ? 0 : Infinity)));
  for (const [a, b] of edges) graph[a][b] = graph[b][a] = dist(a, b);
  for (let k = 0; k < count; k++) for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) graph[i][j] = Math.min(graph[i][j], graph[i][k] + graph[k][j]);
  const loops: [number, number][] = [];
  const pairs: [number, number, number][] = [];
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) if (dist(a, b) < 130 && graph[a][b] > 1.7 * dist(a, b)) pairs.push([a, b, dist(a, b)]);
  pairs.sort((p, q) => p[2] - q[2]);
  for (const [a, b] of pairs.slice(0, params.loops)) if (rng.chance(0.85)) loops.push([a, b]);

  // Build order: breadth-first from the core over the tree, then the loops.
  const order: [number, number][] = [];
  const seen = new Set([coreNode]);
  const queue = [coreNode];
  while (queue.length) {
    const a = queue.shift()!;
    const next = edges.filter(([p, q]) => (p === a && !seen.has(q)) || (q === a && !seen.has(p))).map(([p, q]) => (p === a ? q : p));
    // The harbour link comes first.
    next.sort((p, q) => (p === harbourNode ? -1 : q === harbourNode ? 1 : dist(a, p) - dist(a, q)));
    for (const b of next) {
      seen.add(b);
      queue.push(b);
      order.push([a, b]);
    }
  }
  order.push(...loops);

  // 3. A* routing.
  const cellOf = (p: P2) => Math.min(m - 1, Math.floor(p.z / CELL)) * m + Math.min(m - 1, Math.floor(p.x / CELL));
  const columnOf = (c: number) => {
    const i = c % m;
    const j = (c - i) / m;
    return j * CELL * n + i * CELL;
  };
  const passable = new Uint8Array(m * m);
  const isRiver = new Uint8Array(m * m);
  for (let c = 0; c < m * m; c++) {
    const i = c % m;
    const j = (c - i) / m;
    let ok = 1;
    for (let dz = 0; dz < CELL; dz++) {
      for (let dx = 0; dx < CELL; dx++) {
        const k = (j * CELL + dz) * n + i * CELL + dx;
        if (level[k] < 0 && water.kind[k] === 0) ok = 0;
        if (water.kind[k]) isRiver[c] = 1;
      }
    }
    passable[c] = ok;
  }
  const onRoad = new Uint8Array(m * m);
  const greenCell = (c: number) => {
    const id = districts.district[columnOf(c)];
    return id >= 0 && districts.list[id].type === "green";
  };
  const levelOfCell = (c: number) => {
    const k = columnOf(c);
    return water.kind[k] ? -1 : level[k];
  };

  const route = (from: P2, to: P2): number[] | null => {
    const start = cellOf(from);
    const goal = cellOf(to);
    const g = new Float32Array(m * m).fill(Infinity);
    const came = new Int32Array(m * m).fill(-1);
    const closed = new Uint8Array(m * m);
    const heap = new MinHeap();
    const gx = goal % m;
    const gz = (goal - gx) / m;
    g[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const c = heap.pop();
      if (c === goal) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const i = c % m;
      const j = (c - i) / m;
      const lc = levelOfCell(c);
      for (const [di, dj] of N8) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= m || nj >= m) continue;
        const nc = nj * m + ni;
        if (!passable[nc] || closed[nc]) continue;
        let step = di && dj ? Math.SQRT2 : 1;
        const k = columnOf(nc);
        if (suit.edgeDistance[k] < 3) step *= 2;
        if (greenCell(nc)) step *= 1.5;
        const ln = levelOfCell(nc);
        let cost = step;
        if (isRiver[nc]) cost += BRIDGE_COST;
        else if (lc >= 0 && ln >= 0) cost += LEVEL_COST * Math.abs(ln - lc);
        if (onRoad[nc]) cost *= REUSE;
        const ng = g[c] + cost;
        if (ng < g[nc]) {
          g[nc] = ng;
          came[nc] = c;
          heap.push(nc, ng + REUSE * Math.hypot(ni - gx, nj - gz));
        }
      }
    }
    if (came[goal] < 0 && goal !== start) return null;
    const path = [goal];
    while (path[path.length - 1] !== start) path.push(came[path[path.length - 1]]);
    return path.reverse();
  };

  // 4–5. Route, smooth, give heights, and draw each road onto the columns.
  const kind = new Uint8Array(n * n);
  const deckY = new Float32Array(n * n).fill(NaN);
  const birth = new Float32Array(n * n).fill(1);
  const roads: Road[] = [];
  const nodeBirth = new Float32Array(nodes.length).fill(1);
  const degree = new Uint8Array(nodes.length);
  const topAt = (x: number, z: number) => {
    const k = Math.min(n - 1, Math.max(0, Math.round(z))) * n + Math.min(n - 1, Math.max(0, Math.round(x)));
    return water.kind[k] || level[k] < 0 ? NaN : height[k];
  };

  order.forEach(([a, b], index) => {
    const cells = route(nodes[a], nodes[b]);
    if (!cells || cells.length < 2) return;
    for (const c of cells) onRoad[c] = 1;
    const isLoop = index >= order.length - loops.length;
    const roadBirth = isLoop ? 0.62 + 0.08 * rng.next() : 0.03 + (0.52 * index) / Math.max(1, order.length - loops.length);
    const width = Math.min(WIDTH[types[a]], WIDTH[types[b]]) + (a === harbourNode || b === harbourNode ? 2 : 0);
    const main = width >= 8;

    const centre = cells.map((c) => ({ x: (c % m) * CELL + 1, z: Math.floor(c / m) * CELL + 1 }));
    const pts = resample(chaikin(centre, params.smooth), 1);
    // Heights: the terrace under each point; bridges span across water at the higher bank + 1.
    const ys = pts.map((p) => topAt(p.x, p.z));
    for (let i = 0; i < ys.length; i++) {
      if (!Number.isNaN(ys[i])) continue;
      let j = i;
      while (j < ys.length && Number.isNaN(ys[j])) j++;
      const before = i > 0 ? ys[i - 1] : ys[j] ?? 0;
      const after = j < ys.length ? ys[j] : before;
      const deck = Math.max(before, after) + 1;
      for (let t = i; t < j; t++) ys[t] = deck;
      i = j;
    }
    // Ramps: fill so the road never climbs faster than SLOPE per voxel.
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] - SLOPE);
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.max(ys[i], ys[i + 1] - SLOPE);
    const points = pts.map((p, i) => ({ x: p.x, z: p.z, y: Math.round(ys[i]) }));
    roads.push({ points, width, birth: roadBirth, main });
    nodeBirth[a] = Math.min(nodeBirth[a], roadBirth);
    nodeBirth[b] = Math.min(nodeBirth[b], roadBirth);
    degree[a]++;
    degree[b]++;

    const r = width / 2;
    const reach = Math.ceil(r + 1.5);
    for (const p of points) {
      const cx = Math.round(p.x);
      const cz = Math.round(p.z);
      for (let dz = -reach; dz <= reach; dz++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const k = z * n + x;
          if (level[k] < 0 && !water.kind[k]) continue;
          const d = Math.hypot(dx, dz);
          if (d <= r) {
            if (kind[k] !== ROAD_KIND.road || p.y > deckY[k]) deckY[k] = p.y;
            kind[k] = ROAD_KIND.road;
            birth[k] = Math.min(birth[k], roadBirth);
          } else if (d <= r + 1.5 && kind[k] === ROAD_KIND.none && suit.buildable[k] && height[k] === p.y) {
            kind[k] = ROAD_KIND.sidewalk;
            deckY[k] = p.y;
            birth[k] = Math.min(birth[k], roadBirth);
          }
        }
      }
    }
  });

  // 6. Plazas at busy nodes and at the harbour.
  const plazas: Plaza[] = [];
  nodes.forEach((p, i) => {
    if (degree[i] < 3 && i !== harbourNode) return;
    const k = Math.round(p.z) * n + Math.round(p.x);
    const r = types[i] === "core" ? 13 : 9;
    const y = height[k];
    plazas.push({ x: p.x, z: p.z, y, r, birth: nodeBirth[i] });
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        const x = Math.round(p.x) + dx;
        const z = Math.round(p.z) + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const kk = z * n + x;
        if (!suit.buildable[kk] || height[kk] !== y || kind[kk] === ROAD_KIND.road) continue;
        kind[kk] = ROAD_KIND.plaza;
        deckY[kk] = y;
        birth[kk] = Math.min(birth[kk], nodeBirth[i]);
      }
    }
  });

  return { roads, plazas, kind, deckY, birth, geometry: buildRoadGeometry(terrain, water, kind, deckY, birth, roads), nodes };
}

/** Asphalt, sidewalks and plaza tiles as thin decks; embankments under ramps; bridge slabs and piers. */
function buildRoadGeometry(terrain: TerrainData, water: WaterData, kind: Uint8Array, deckY: Float32Array, birth: Float32Array, roads: Road[]): GeometryData {
  const { n, height } = terrain;
  const half = n / 2;
  const b = new GeometryBuilder();
  const asphalt = lin(CITY.asphalt);
  const sidewalk = lin(CITY.sidewalk);
  const plazaA = lin(CITY.plaza);
  const plazaB = lin(CITY.plazaAlt);
  const embankment = lin(CITY.embankment);

  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const kd = kind[k];
      if (!kd) continue;
      const y = deckY[k];
      const t = birth[k];
      const x0 = x - half;
      const z0 = z - half;
      const overWater = water.kind[k] !== 0;
      const ground = overWater ? water.surfaceY[k] : height[k];
      if (y > ground + 0.05) {
        // Embankment (on land) or bridge slab (over water).
        const bottom = overWater ? y - 1 : ground;
        b.box(x0, bottom, z0, 1, y - bottom, 1, embankment, t, y);
      }
      const colour = kd === ROAD_KIND.road ? asphalt : kd === ROAD_KIND.sidewalk ? sidewalk : (x + z) % 2 ? plazaA : plazaB;
      const lift = kd === ROAD_KIND.sidewalk ? 0.25 : 0.1;
      b.box(x0, y, z0, 1, lift, 1, colour, t, y, { noSides: kd !== ROAD_KIND.sidewalk });
    }
  }

  // Bridge piers every 8 voxels, and dashed centre lines on main roads.
  const marking = lin(CITY.marking);
  for (const road of roads) {
    road.points.forEach((p, i) => {
      const k = Math.round(p.z) * n + Math.round(p.x);
      if (k < 0 || k >= n * n) return;
      if (water.kind[k] && i % 8 === 0) {
        const bed = height[k];
        b.box(p.x - half - 0.75, bed, p.z - half - 0.75, 1.5, p.y - 1 - bed, 1.5, embankment, road.birth, bed);
      }
      if (road.main && i % 6 < 3) b.box(p.x - half - 0.25, p.y + 0.1, p.z - half - 0.25, 0.5, 0.06, 0.5, marking, road.birth, p.y, { noSides: true });
    });
  }
  return b.finish();
}
