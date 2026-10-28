import { fbm, smoothstep } from "../noise";
import type { P2 } from "../path";
import { Rng } from "../rng";
import { VOXEL_M, voxels } from "../scale";
import { CLAIM, type Claims } from "./claims";
import { CELL, type Hubs } from "./hubs";
import type { Streets } from "./streets";
import type { Columns } from "./voxelize";

/**
 * Districts: what kind of cyberpunk district belongs where, and the lots buildings will stand on
 * (town plan, section 6). It runs after the mesh: it changes no ground. Nothing here is tunable;
 * every number is a constant below.
 *
 * 1. Fields per 2 m cell:
 *    - access: distance from the plaza along the streets (Dijkstra over road cells), plus the
 *      straight distance from a cell to its nearest road cell;
 *    - frontage: that nearest road cell, its distance, and whether it is on an avenue;
 *    - buildable: free ground (not road, plaza, river or bank), slope under BUILD_SLOPE (on the
 *      ground before the streets were carved), within REACH of a road;
 *    - height rank: a buildable cell's height as a percentile of all buildable cells;
 *    - river distance, and distance to the avenue exits at the diorama's edge.
 * 2. Districts, first match wins:
 *      core         the CORE_SHARE of the land nearest the plaza in a straight line, at most
 *                   CORE_MAX from it: one compact disc around the plaza
 *      industrial   near the river (DOCK_RIVER) on low ground (height rank under DOCK_LOW), or
 *                   near an exit (DOCK_EXIT)
 *      commercial   street frontage (within COMMERCIAL_FRONTAGE of a street) in a ring
 *                   COMMERCIAL_RING wide around the core, and along the avenues in the nearer
 *                   COMMERCIAL_AVENUE_SHARE (shops, bars and neon signs at street level):
 *                   one band hugging the core, with strips running out along the avenues
 *      wealthy      high ground (rank over WEALTHY_HIGH), in the farther half by access, and at
 *                   least WEALTHY_GAP from industrial
 *      megablocks   everything else buildable
 *    Access thresholds are shares of the buildable land, so every city's districts scale with it.
 *    Then districts are smoothed into whole areas, as Cities: Skylines districts are painted
 *    areas: SMOOTH_PASSES majority passes within SMOOTH_RADIUS (the core and the commercial strips stay
 *    as their rules draw them), and any region still under MIN_REGION joins the neighbor it
 *    shares the most border with (the core never does, and commercial only under COMMERCIAL_MIN).
 *    Parks are not a district: see 3b.
 * 3. Density per cell: the district's base density · (1 − 0.5 · access / span).
 *    3b. Parks, a layer of their own over the districts: PARKS_MIN to PARKS_MAX of them (the seed
 *    picks), each PARK_SIZE_MIN to PARK_SIZE_MAX, a whole rectangle (PARK_ASPECT_MIN to
 *    PARK_ASPECT_MAX long) at a spot on steep or hilly ground (plus slow noise) outside the core.
 *    Every park keeps at least PARK_APART of ground from every other; a spot that can't fit one,
 *    even shrunk to PARK_FILL of its size, is skipped for the next. Their free columns are claimed
 *    `park`, so no lot goes there. If the land runs out, there are fewer.
 * 4. Lots, as in Cities: Skylines' zoning: only along the streets, so every lot fronts one. Each
 *    street side (avenues first) is cut behind the verge into lots ZONE meters a cell: the
 *    district's width in cells or one more (seeded; fewer where a full one doesn't fit). A second
 *    walk fills the gaps the first left with lots of any width from MIN_PLOT up. A lot starts
 *    MIN_DEPTH deep and deepens a meter at a time to the district's depth (up to 4 cells), while
 *    the street straight behind the block is still farther than the lot is deep: lots from
 *    facing streets meet half an ALLEY short of halfway. A block shallower than THROUGH_BLOCK
 *    (parallel streets a tile apart) is not split: its lots run through it, fronting both streets. A lot is kept only if it touches the
 *    verge, every column is free (so not a park), no column is within an
 *    ALLEY of another lot, and its ground spans at most MAX_LOT_STEP (megablocks MAX_STACK_STEP:
 *    they stack down slopes). Its columns are claimed `lot`.
 * 5. Corner lots: the frontage the walk leaves (rounded corners, short runs, odd pockets) is
 *    packed with grid-aligned rectangles, the district's size or smaller down to MIN_PLOT a
 *    side (in CORNER_STEP steps), each fronting a verge or street along at least a quarter of its
 *    narrower side, with the same
 *    alley and ground rules. So every lot still fronts a street.
 * 6. Small lots: a lot narrower than MERGE_BELOW is merged with the neighbor beside it on the same
 *    frontage (across their alley); one still narrower than MIN_PLOT is given up, its ground left
 *    free (see mergeSmallLots).
 */

export const DISTRICT = { core: 0, commercial: 1, megablock: 2, industrial: 3, wealthy: 4 } as const;
export type District = (typeof DISTRICT)[keyof typeof DISTRICT];
/** No district: road, plaza, river or bank. */
export const NO_DISTRICT = 255;

/** Names, debug colors, lot width and the deepest a lot grows (zone cells of ZONE meters), and
 * base density, by district. */
export const DISTRICTS: { name: string; color: number; width: number; depth: number; density: number }[] = [
  { name: "Corporate core", color: 0x22d3ee, width: 2, depth: 4, density: 1 },
  { name: "Commercial", color: 0xe879f9, width: 2, depth: 3, density: 0.75 },
  { name: "Megablocks", color: 0x8b5cf6, width: 2, depth: 4, density: 0.6 },
  { name: "Industrial", color: 0xf59e0b, width: 3, depth: 4, density: 0.35 },
  { name: "Wealthy", color: 0xfde68a, width: 2, depth: 3, density: 0.3 },
];

const BUILD_SLOPE = 30;
const REACH = 30;
/** Parks: how many (the seed picks), each one's size (m², the seed picks), and the least ground
 * between any two parks (meters). */
const PARKS_MIN = 3;
const PARKS_MAX = 6;
const PARK_SIZE_MIN = 700;
const PARK_SIZE_MAX = 1400;
const PARK_APART = 25;
/** A park is a rectangle, its long side this many times its short one (the seed picks). */
const PARK_ASPECT_MIN = 1;
const PARK_ASPECT_MAX = 2;
/** The smallest share of its size a park may shrink to where a whole one doesn't fit; below it the spot is skipped. */
const PARK_FILL = 0.8;
const PARK_FREQ = 3;
/** Cells either side over which slope is averaged when choosing parks. */
const PARK_BLUR = 3;
/** The core: the CORE_SHARE of the land nearest the plaza, but never past CORE_MAX meters from
 * it, so it stays one compact disc around the plaza. */
const CORE_SHARE = 0.15;
const CORE_MAX = 50;
const DOCK_RIVER = 50;
const DOCK_LOW = 0.5;
const DOCK_EXIT = 30;
/** Commercial: how far it reaches back from a street (meters). */
const COMMERCIAL_FRONTAGE = 28;
/** Commercial also rings the core: street frontage within COMMERCIAL_RING meters outside it. */
const COMMERCIAL_RING = 40;
/** A commercial piece smaller than this (m²) is a speck and joins its neighbor. */
const COMMERCIAL_MIN = 400;
/** Commercial runs along the avenues within this share of access. */
const COMMERCIAL_AVENUE_SHARE = 0.6;
const WEALTHY_HIGH = 0.8;
const WEALTHY_FAR_SHARE = 0.5;
const WEALTHY_GAP = 40;
/** Districts: the radius (meters) and passes of the majority smoothing, and the smallest region
 * kept (m²). */
const SMOOTH_RADIUS = 8;
const SMOOTH_PASSES = 3;
const MIN_REGION = 2000;
/** How many cells a district region reaches across a street. */
const ACROSS = 3;
/** Lots: a zone cell (meters), the depth every lot starts at, the gap between lots, and the most
 * their ground may span (meters; the building stage terraces them). */
const ZONE = 8;
const MIN_DEPTH = 6;
const ALLEY = 1;
const MAX_LOT_STEP = 6;
const MAX_STACK_STEP = 10;
/** Small lots: narrower than MERGE_BELOW (meters) either way, a lot is merged with a neighbor
 * (into one no wider than MERGE_WIDEST); still narrower than MIN_PLOT, it is given up. */
const MERGE_BELOW = 10;
const MERGE_WIDEST = 24;
const MIN_PLOT = 8;
/** Corner lots are tried in sizes this many meters apart, and may stand this far (meters) back from the paving. */
const FORECOURT = 1;
/** Corner lots are tried in sizes this many meters apart. */
const CORNER_STEP = 2;
/** Blocks shallower than this (meters, sidewalk to sidewalk) get lots running through them. */
const THROUGH_BLOCK = 20;
/** The strip between a street's edge and its lots (the verge), in meters. */
const VERGE = 1.5;

export interface Lot {
  id: number;
  /** Corners in columns: front-left, front-right, back-right, back-left. */
  corners: P2[];
  /** Direction from the lot's back to its front (toward the street), radians. */
  facing: number;
  district: District;
  density: number;
  /** Area in square meters. */
  area: number;
  /** Lowest and highest ground under the lot, in voxels. */
  low: number;
  high: number;
  /** The level its site is graded to (the median of its ground: as much cut as fill), its building's floor. */
  floor: number;
}

export interface Districts {
  /** Cells per side (the hubs grid). */
  cells: number;
  /** District per cell; NO_DISTRICT on roads, the plaza, the river and its bank. */
  district: Uint8Array;
  /** Distance from the plaza along the streets, per cell, in meters. */
  access: Float32Array;
  /** 0–1 per cell. */
  density: Float32Array;
  lots: Lot[];
  /** Lot id + 1 per column, 0 where there is none. */
  lotId: Int32Array;
  /** The claim map with the lots added. */
  claims: Claims;
  /** Each district's share of the land that has one. */
  shares: number[];
  /** How many parks were placed (their columns are claimed `park`). */
  parks: number;
  /** Each park's rectangle, in columns: x0 ≤ x < x1, z0 ≤ z < z1. */
  parkRects: { x0: number; z0: number; x1: number; z1: number }[];
}

const N8: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function buildDistricts(seed: number, cols: Columns, streets: Streets, hubs: Hubs, base: Claims): Districts {
  const { n, height } = cols;
  const { cells } = hubs;
  const cellM = CELL * VOXEL_M;
  const total = cells * cells;
  const claim = base.claim.slice();
  const claims: Claims = { ...base, claim };
  const district = new Uint8Array(total).fill(NO_DISTRICT);
  const access = new Float32Array(total).fill(Infinity);
  const density = new Float32Array(total);
  const lotId = new Int32Array(n * n);
  const empty: Districts = { cells, district, access, density, lots: [], lotId, claims, shares: DISTRICTS.map(() => 0), parks: 0, parkRects: [] };
  const plaza = streets.plazas[0];
  if (!plaza) return empty;

  // Per cell: mean ground, and what its columns are. A cell is road if at least half of it is
  // paving; verge counts as free (it is the lots' frontage).
  const mean = new Float32Array(total);
  const paving = new Uint16Array(total);
  const free = new Uint16Array(total);
  const wet = new Uint8Array(total);
  const perCell = 1 / (CELL * CELL);
  for (let z = 0; z < n; z++) {
    const row = ((z / CELL) | 0) * cells;
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const c = row + ((x / CELL) | 0);
      mean[c] += height[k] * perCell;
      const what = claim[k];
      if (what === CLAIM.road || what === CLAIM.plaza) paving[c]++;
      else if (what === CLAIM.river || what === CLAIM.bank) wet[c] = 1;
      else free[c]++;
    }
  }
  const road = Uint8Array.from(paving, (p) => (p * 2 >= CELL * CELL ? 1 : 0));
  const cellCenter = (c: number): P2 => ({ x: (c % cells) * CELL + CELL / 2, z: Math.floor(c / cells) * CELL + CELL / 2 });
  const inPlaza = (q: P2) => Math.max(Math.abs(q.x - plaza.x), Math.abs(q.z - plaza.z)) <= plaza.half;

  // Avenue cells: road cells on or next to a main street's center line (a street spans two cells).
  const avenue = new Uint8Array(total);
  for (const st of streets.streets) {
    if (st.kind !== "main") continue;
    for (const q of st.curve) {
      const cx = Math.min(cells - 1, Math.floor(q.x / CELL));
      const cz = Math.min(cells - 1, Math.floor(q.z / CELL));
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x >= 0 && z >= 0 && x < cells && z < cells && road[z * cells + x]) avenue[z * cells + x] = 1;
        }
      }
    }
  }

  // 1a. Access along the streets: Dijkstra over road cells from the plaza.
  const queue = new MinHeap();
  for (let c = 0; c < total; c++) {
    if (road[c] && inPlaza(cellCenter(c))) {
      access[c] = 0;
      queue.push(c, 0);
    }
  }
  const settle = (passable: (c: number) => boolean, dist: Float32Array, from?: Int32Array) => {
    while (queue.size) {
      const c = queue.pop();
      const cx = c % cells;
      const cz = (c - cx) / cells;
      for (const [dx, dz, w] of N8) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
        const nc = z * cells + x;
        if (!passable(nc)) continue;
        const d = dist[c] + w * cellM;
        if (d < dist[nc]) {
          dist[nc] = d;
          if (from) from[nc] = from[c];
          queue.push(nc, d);
        }
      }
    }
  };
  settle((c) => road[c] === 1, access);

  // 1b. Frontage: every cell's nearest reachable road cell (a second Dijkstra from all road cells).
  const nearest = new Int32Array(total).fill(-1);
  const roadDist = new Float32Array(total).fill(Infinity);
  for (let c = 0; c < total; c++) {
    if (road[c] && access[c] < Infinity) {
      roadDist[c] = 0;
      nearest[c] = c;
      queue.push(c, 0);
    }
  }
  settle((c) => !wet[c], roadDist, nearest);
  for (let c = 0; c < total; c++) if (!road[c] && nearest[c] >= 0) access[c] = access[nearest[c]] + roadDist[c];

  // 1c. Buildable, slope, height rank, river and exit distance. Slope and height are read from the
  // ground before the streets were carved: the cut and fill slopes beside a street are where its
  // buildings go (the building stage terraces them), not unbuildable land.
  const ground = hubs.mean;
  const at = (cx: number, cz: number) => ground[Math.min(cells - 1, Math.max(0, cz)) * cells + Math.min(cells - 1, Math.max(0, cx))];
  const buildable = new Uint8Array(total);
  // Land: every cell that gets a district (not road, water, or across the river).
  const land = new Uint8Array(total);
  const slope = new Float32Array(total);
  for (let c = 0; c < total; c++) {
    if (road[c] || wet[c] || !hubs.side[c]) continue;
    land[c] = 1;
    const cx = c % cells;
    const cz = (c - cx) / cells;
    const gx = (at(cx + 1, cz) - at(cx - 1, cz)) / (2 * CELL);
    const gz = (at(cx, cz + 1) - at(cx, cz - 1)) / (2 * CELL);
    slope[c] = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
    if (free[c] >= (CELL * CELL) / 2 && slope[c] <= BUILD_SLOPE && roadDist[c] <= REACH) buildable[c] = 1;
  }
  const order = Array.from({ length: total }, (_, c) => c).filter((c) => land[c]).sort((a, b) => ground[a] - ground[b]);
  const rank = new Float32Array(total);
  order.forEach((c, i) => (rank[c] = order.length > 1 ? i / (order.length - 1) : 0.5));
  const riverM = (c: number) => {
    const q = cellCenter(c);
    return base.riverDist[Math.round(q.z) * n + Math.round(q.x)] * VOXEL_M;
  };
  const exits: P2[] = [];
  for (const st of streets.streets) {
    if (st.kind !== "main") continue;
    const q = st.curve[st.curve.length - 1];
    if (q.x <= 1 || q.z <= 1 || q.x >= n - 2 || q.z >= n - 2) exits.push(q);
  }
  const exitM = (c: number) => {
    const q = cellCenter(c);
    return exits.reduce((m, e) => Math.min(m, Math.hypot(e.x - q.x, e.z - q.z) * VOXEL_M), Infinity);
  };

  // Access thresholds as shares of the land; the core is the land nearest the plaza in a straight line.
  const byAccess = order.map((c) => access[c]).sort((a, b) => a - b);
  const fromPlaza = (c: number) => {
    const q = cellCenter(c);
    return Math.hypot(q.x - plaza.x, q.z - plaza.z) * VOXEL_M;
  };
  const byPlaza = order.map(fromPlaza).sort((a, b) => a - b);
  const CORE_RADIUS = Math.min(CORE_MAX, byPlaza.length ? byPlaza[Math.min(byPlaza.length - 1, Math.floor(CORE_SHARE * byPlaza.length))] : 0);
  const accessAt = (share: number) => (byAccess.length ? byAccess[Math.min(byAccess.length - 1, Math.floor(share * byAccess.length))] : 0);
  const COMMERCIAL_ACCESS = accessAt(COMMERCIAL_AVENUE_SHARE);
  const WEALTHY_ACCESS = accessAt(WEALTHY_FAR_SHARE);

  // Parks (placed here, claimed after the districts, 3b): PARKS_MIN to PARKS_MAX whole parks (the
  // seed picks), each PARK_SIZE_MIN to PARK_SIZE_MAX, outside the core. The score is the slope
  // averaged over PARK_BLUR cells around (steep hillsides) plus slow noise.
  const salt = seed ^ 0x2f6b8a1d;
  const parkScore = new Float32Array(total);
  const outside: number[] = [];
  for (let c = 0; c < total; c++) {
    if (!land[c] || fromPlaza(c) <= CORE_RADIUS) continue;
    const cx = c % cells;
    const cz = (c - cx) / cells;
    let sum = 0;
    let count = 0;
    for (let dz = -PARK_BLUR; dz <= PARK_BLUR; dz++) {
      for (let dx = -PARK_BLUR; dx <= PARK_BLUR; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= cells || z >= cells || !land[z * cells + x]) continue;
        sum += slope[z * cells + x];
        count++;
      }
    }
    const noise = fbm((cx / cells) * PARK_FREQ, (cz / cells) * PARK_FREQ, salt, 3);
    parkScore[c] = smoothstep(BUILD_SLOPE * 0.5, BUILD_SLOPE * 1.5, sum / count) + noise;
    outside.push(c);
  }
  outside.sort((a, b) => parkScore[b] - parkScore[a]);
  // Each park is a rectangle at the best-scoring spot at least PARK_APART from every other park,
  // whole (no street or edge cutting it), never coming within PARK_APART of another park.
  const parkRng = new Rng(seed ^ 0x51ed270b);
  let parksLeft = PARKS_MIN + Math.floor(parkRng.next() * (PARKS_MAX - PARKS_MIN + 1));
  const isPark = new Uint8Array(total);
  // Which park (id + 1) each cell belongs to, so a park keeps PARK_APART from the others. With
  // id −1, any park counts.
  const parkOf = new Uint8Array(total);
  const apart = Math.ceil(PARK_APART / cellM);
  const nearOther = (c: number, id: number) => {
    const cx = c % cells;
    const cz = (c - cx) / cells;
    for (let dz = -apart; dz <= apart; dz++) {
      for (let dx = -apart; dx <= apart; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
        const o = parkOf[z * cells + x];
        if (o && o !== id + 1) return true;
      }
    }
    return false;
  };
  const starts: P2[] = [];
  const parkRects: Districts["parkRects"] = [];
  // A rectangle of cells with its corner at (x0, z0), if every cell is land outside the core, no
  // park yet, and clear of the other parks.
  const fits = (x0: number, z0: number, w: number, h: number, id: number) => {
    if (x0 < 0 || z0 < 0 || x0 + w > cells || z0 + h > cells) return false;
    for (let z = z0; z < z0 + h; z++) {
      for (let x = x0; x < x0 + w; x++) {
        const c = z * cells + x;
        if (isPark[c] || !land[c] || fromPlaza(c) <= CORE_RADIUS || nearOther(c, id)) return false;
      }
    }
    return true;
  };
  for (const start of outside) {
    if (parksLeft <= 0) break;
    if (isPark[start] || nearOther(start, -1)) continue;
    const sx = start % cells;
    const sz = (start - sx) / cells;
    const target = (PARK_SIZE_MIN + parkRng.next() * (PARK_SIZE_MAX - PARK_SIZE_MIN)) / (cellM * cellM);
    const aspect = PARK_ASPECT_MIN + parkRng.next() * (PARK_ASPECT_MAX - PARK_ASPECT_MIN);
    const id = starts.length;
    // A rectangle of the park's size around the spot, either way round, shifted up to a quarter
    // of its sides; where none fits whole (a street or the edge cuts it), a smaller one, down to
    // PARK_FILL of the size; else the next spot.
    let found: [number, number, number, number] | null = null;
    search: for (const scale of [1, 0.9, PARK_FILL]) {
      const long = Math.max(2, Math.round(Math.sqrt(target * scale * aspect)));
      const short = Math.max(2, Math.round((target * scale) / long));
      for (const [w, h] of [
        [long, short],
        [short, long],
      ]) {
        for (const fz of [0.5, 0.25, 0.75]) {
          for (const fx of [0.5, 0.25, 0.75]) {
            const x0 = sx - Math.round(w * fx);
            const z0 = sz - Math.round(h * fz);
            if (fits(x0, z0, w, h, id)) {
              found = [x0, z0, w, h];
              break search;
            }
          }
        }
      }
    }
    if (!found) continue;
    const [x0, z0, w, h] = found;
    for (let z = z0; z < z0 + h; z++) {
      for (let x = x0; x < x0 + w; x++) {
        isPark[z * cells + x] = 1;
        parkOf[z * cells + x] = id + 1;
      }
    }
    starts.push({ x: (x0 + w / 2) * CELL, z: (z0 + h / 2) * CELL });
    parkRects.push({ x0: x0 * CELL, z0: z0 * CELL, x1: (x0 + w) * CELL, z1: (z0 + h) * CELL });
    parksLeft--;
  }
  // 2. Districts.
  for (let c = 0; c < total; c++) {
    if (!land[c]) continue;
    if (fromPlaza(c) <= CORE_RADIUS) district[c] = DISTRICT.core;
    else if ((riverM(c) <= DOCK_RIVER && rank[c] <= DOCK_LOW) || exitM(c) <= DOCK_EXIT) district[c] = DISTRICT.industrial;
    else if (roadDist[c] <= COMMERCIAL_FRONTAGE && ((avenue[nearest[c]] && access[c] <= COMMERCIAL_ACCESS) || fromPlaza(c) <= CORE_RADIUS + COMMERCIAL_RING)) district[c] = DISTRICT.commercial;
    else district[c] = DISTRICT.megablock;
  }
  // Wealthy needs the distance to industrial, so it comes second.
  const fromIndustry = new Float32Array(total).fill(Infinity);
  for (let c = 0; c < total; c++) {
    if (district[c] === DISTRICT.industrial) {
      fromIndustry[c] = 0;
      queue.push(c, 0);
    }
  }
  settle(() => true, fromIndustry);
  for (let c = 0; c < total; c++) {
    if (district[c] === DISTRICT.megablock && rank[c] >= WEALTHY_HIGH && access[c] >= WEALTHY_ACCESS && fromIndustry[c] >= WEALTHY_GAP) district[c] = DISTRICT.wealthy;
  }

  // Smoothing into whole areas, like painted districts: SMOOTH_PASSES majority passes over the land
  // within SMOOTH_RADIUS. The core and the commercial strips are drawn whole by their own rules: they
  // stay as they are and don't vote, so they never spread or fray.
  const fixed = (d: number) => d === DISTRICT.core || d === DISTRICT.commercial;
  const votes = new Float32Array(DISTRICTS.length);
  const reachCells = Math.round(SMOOTH_RADIUS / cellM);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next = district.slice();
    for (let c = 0; c < total; c++) {
      if (!land[c] || fixed(district[c])) continue;
      votes.fill(0);
      const cx = c % cells;
      const cz = (c - cx) / cells;
      for (let dz = -reachCells; dz <= reachCells; dz++) {
        for (let dx = -reachCells; dx <= reachCells; dx++) {
          if (dx * dx + dz * dz > reachCells * reachCells) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
          const nc = z * cells + x;
          if (land[nc] && !fixed(district[nc])) votes[district[nc]]++;
        }
      }
      let best = district[c];
      for (let d = 0; d < votes.length; d++) if (votes[d] > votes[best]) best = d;
      next[c] = best;
    }
    district.set(next);
  }
  const region = new Int32Array(total).fill(-1);
  const minCells = MIN_REGION / (cellM * cellM);
  for (let c0 = 0; c0 < total; c0++) {
    if (region[c0] >= 0 || district[c0] === NO_DISTRICT) continue;
    const d0 = district[c0];
    const members = [c0];
    region[c0] = c0;
    const border = new Map<number, number>();
    for (let i = 0; i < members.length; i++) {
      const c = members[i];
      const cx = c % cells;
      const cz = (c - cx) / cells;
      // A region reaches across a street (up to ACROSS cells), so a district on both sides of
      // one counts as one area; its border is counted with the four direct neighbors.
      for (let dz = -ACROSS; dz <= ACROSS; dz++) {
        for (let dx = -ACROSS; dx <= ACROSS; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
          const nc = z * cells + x;
          const d = district[nc];
          if (d === d0 && region[nc] < 0) {
            region[nc] = c0;
            members.push(nc);
          } else if (Math.abs(dx) + Math.abs(dz) === 1 && d !== d0 && d !== NO_DISTRICT) border.set(d, (border.get(d) ?? 0) + 1);
        }
      }
    }
    // The core never merges away (it is whole by construction), and commercial only as a speck
    // (under COMMERCIAL_MIN): its strips are thin.
    const keep = d0 === DISTRICT.core ? 0 : d0 === DISTRICT.commercial ? COMMERCIAL_MIN / (cellM * cellM) : minCells;
    if (members.length >= keep || !border.size) continue;
    // It joins the neighbor it shares the most border with.
    let into = d0;
    let most = 0;
    for (const [d, count] of border) if (count > most) [into, most] = [d, count];
    for (const c of members) district[c] = into;
  }

  // 3. Density.
  const span = Math.max(60, hubs.span);
  for (let c = 0; c < total; c++) {
    if (district[c] === NO_DISTRICT) continue;
    density[c] = DISTRICTS[district[c]].density * Math.max(0, 1 - (0.5 * Math.min(access[c], span)) / span);
  }

  // 3b. Parks: their free columns are claimed, so lots keep off them.
  for (let z = 0; z < n; z++) {
    const row = ((z / CELL) | 0) * cells;
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (isPark[row + ((x / CELL) | 0)] && claim[k] === CLAIM.free) claim[k] = CLAIM.park;
    }
  }

  // 4. Lots along the streets, avenues first. `gap` is the alley around every lot placed so far,
  // which no other lot may use.
  const gap = new Uint8Array(n * n);
  // How far paving lies straight ahead of a point, in columns (up to `limit`).
  const ahead = (x: number, z: number, dx: number, dz: number, limit: number) => {
    for (let i = 0; i <= limit; i++) {
      const X = Math.round(x + dx * i);
      const Z = Math.round(z + dz * i);
      if (X < 0 || Z < 0 || X >= n || Z >= n) return Infinity;
      const what = claim[Z * n + X];
      if (what === CLAIM.road || what === CLAIM.plaza || what === CLAIM.verge) return i;
    }
    return Infinity;
  };
  const rng = new Rng(seed ^ 0x7b3c1e95);
  const lots: Lot[] = [];
  const cellOf = (x: number, z: number) => Math.min(cells - 1, Math.max(0, Math.floor(z / CELL))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / CELL)));
  // A column a lot may use: free (not a park), outside every lot's alley, in a district. (The
  // lot's ground-step limit keeps lots off ground too steep to build on.)
  const usable = (k: number) => claim[k] === CLAIM.free && !gap[k] && district[cellOf(k % n, Math.floor(k / n))] !== NO_DISTRICT;
  const ordered = [...streets.streets].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "main" ? -1 : 1));
  // Two walks: whole zone cells, then (`fill`) whatever width from MIN_PLOT up fits the gaps the
  // first left (short straight runs between bends, ends of blocks).
  for (const fill of [false, true])
  for (const st of ordered) {
    const curve = st.curve;
    if (curve.length < 4) continue;
    // Half a column more than the verge, so rounding never lets a lot touch it.
    const offset = st.width / 2 + voxels(VERGE) + 0.5;
    const along = new Float32Array(curve.length);
    for (let i = 1; i < curve.length; i++) along[i] = along[i - 1] + Math.hypot(curve[i].x - curve[i - 1].x, curve[i].z - curve[i - 1].z);
    const length = along[curve.length - 1];
    const pointAt = (s: number) => {
      // The first sample at or past `s` (binary search).
      let lo = 1;
      let hi = curve.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (along[mid] < s) lo = mid + 1;
        else hi = mid;
      }
      const i = lo;
      const a = curve[i - 1];
      const b = curve[i];
      const t = (s - along[i - 1]) / (along[i] - along[i - 1] || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, angle: Math.atan2(b.z - a.z, b.x - a.x) };
    };
    for (const side of [1, -1]) {
      let s = 0;
      while (s < length) {
        const p = pointAt(Math.min(length, s));
        const nx = -Math.sin(p.angle) * side;
        const nz = Math.cos(p.angle) * side;
        // The district is read a few meters in.
        const probe = offset + voxels(MIN_DEPTH / 2);
        const d = district[cellOf(p.x + nx * probe, p.z + nz * probe)];
        if (d === NO_DISTRICT) {
          s += voxels(1);
          continue;
        }
        const spec = DISTRICTS[d];
        const maxStep = voxels(d === DISTRICT.megablock ? MAX_STACK_STEP : MAX_LOT_STEP);
        // Width in zone cells: the district's or one more, then fewer where it doesn't fit.
        const want = spec.width + Math.floor(rng.next() * 2);
        let placed = 0;
        const widths: number[] = [];
        if (fill) for (let m = want * ZONE; m >= MIN_PLOT; m--) widths.push(m);
        else for (let wc = want; wc >= 1; wc--) widths.push(wc * ZONE);
        for (const meters of widths) {
          if (placed) break;
          const w = voxels(meters);
          const depth = voxels(MIN_DEPTH);
          if (s + w > length) continue;
          // The lot's axis follows the street at its middle; the street must be nearly straight along it.
          const mid = pointAt(s + w / 2);
          const end = pointAt(s + w);
          if (Math.abs(Math.atan2(Math.sin(end.angle - p.angle), Math.cos(end.angle - p.angle))) > 0.2) continue;
          const tx = Math.cos(mid.angle);
          const tz = Math.sin(mid.angle);
          const mx = -tz * side;
          const mz = tx * side;
          const fc = { x: mid.x + mx * offset, z: mid.z + mz * offset };
          const corners = [
            { x: fc.x - (tx * w) / 2, z: fc.z - (tz * w) / 2 },
            { x: fc.x + (tx * w) / 2, z: fc.z + (tz * w) / 2 },
            { x: fc.x + (tx * w) / 2 + mx * depth, z: fc.z + (tz * w) / 2 + mz * depth },
            { x: fc.x - (tx * w) / 2 + mx * depth, z: fc.z - (tz * w) / 2 + mz * depth },
          ];
          let columns = rasterize(corners, n);
          let ok = columns.length > 0;
          let low = Infinity;
          let high = -Infinity;
          for (const k of columns) {
            if (!usable(k)) {
              ok = false;
              break;
            }
            low = Math.min(low, height[k]);
            high = Math.max(high, height[k]);
          }
          if (!ok || high - low > maxStep) continue;
          // It must touch its verge or street (diagonally counts): on a curve the rounding can
          // leave a sliver between them.
          const fronted = columns.some((k) => {
            const x = k % n;
            const z = (k - x) / n;
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const X = x + dx;
                const Z = z + dz;
                if (X < 0 || Z < 0 || X >= n || Z >= n) continue;
                const what = claim[Z * n + X];
                if (what === CLAIM.verge || what === CLAIM.road || what === CLAIM.plaza) return true;
              }
            }
            return false;
          });
          if (!fronted) continue;
          // Deepen toward the back of the block, a meter at a time, while every new column is usable,
          // the ground stays within the step, and the paving straight ahead (the street behind the
          // block) is still farther than the lot is deep: lots from facing streets meet halfway.
          // Cross streets at the block's ends don't stop it. Then back off half an alley.
          // A thin block (parallel streets one tile apart): too shallow to split between its two
          // streets, so the lot runs through it, fronting both, short of the far sidewalk by an alley.
          const block = Math.min(
            ...[corners[0], corners[1], fc].map((q, i) => {
              const inX = i === 0 ? tx * 0.5 : i === 1 ? -tx * 0.5 : 0;
              const inZ = i === 0 ? tz * 0.5 : i === 1 ? -tz * 0.5 : 0;
              return ahead(q.x + inX + mx, q.z + inZ + mz, mx, mz, voxels(THROUGH_BLOCK));
            }),
          );
          const through = block < voxels(THROUGH_BLOCK);
          const grow = voxels(1);
          let deep = depth;
          let stopped = false;
          while (deep + grow <= voxels(spec.depth * ZONE) + 0.01) {
            const strip = rasterize([corners[3], corners[2], { x: corners[2].x + mx * grow, z: corners[2].z + mz * grow }, { x: corners[3].x + mx * grow, z: corners[3].z + mz * grow }], n);
            let lo = low;
            let hi = high;
            let fits = strip.length > 0;
            const t = deep + grow;
            for (const q of [corners[3], corners[2], { x: (corners[2].x + corners[3].x) / 2, z: (corners[2].z + corners[3].z) / 2 }]) {
              // From the strip's far edge, pulled half a column in from the lot's sides.
              const inX = q === corners[3] ? tx * 0.5 : q === corners[2] ? -tx * 0.5 : 0;
              const inZ = q === corners[3] ? tz * 0.5 : q === corners[2] ? -tz * 0.5 : 0;
              if (ahead(q.x + inX + mx * grow, q.z + inZ + mz * grow, mx, mz, Math.ceil(t)) < (through ? voxels(ALLEY) : t - 0.5)) fits = false;
            }
            for (const k of strip) {
              if (!fits) break;
              if (!usable(k)) {
                fits = false;
                break;
              }
              lo = Math.min(lo, height[k]);
              hi = Math.max(hi, height[k]);
            }
            if (!fits || hi - lo > maxStep) {
              stopped = true;
              break;
            }
            for (const q of [2, 3]) corners[q] = { x: corners[q].x + mx * grow, z: corners[q].z + mz * grow };
            deep += grow;
          }
          const back = stopped ? Math.min(deep - depth, voxels(ALLEY / 2)) : 0;
          if (back > 0) for (const q of [2, 3]) corners[q] = { x: corners[q].x - mx * back, z: corners[q].z - mz * back };
          if (deep > depth) {
            columns = rasterize(corners, n);
            low = Infinity;
            high = -Infinity;
            for (const k of columns) {
              low = Math.min(low, height[k]);
              high = Math.max(high, height[k]);
            }
          }
          const id = lots.length;
          for (const k of columns) {
            claim[k] = CLAIM.lot;
            lotId[k] = id + 1;
          }
          // The lot grown by an alley on every side (the front's alley falls on the verge).
          const a = voxels(ALLEY);
          const ring = [
            { x: corners[0].x - tx * a - mx * a, z: corners[0].z - tz * a - mz * a },
            { x: corners[1].x + tx * a - mx * a, z: corners[1].z + tz * a - mz * a },
            { x: corners[2].x + tx * a + mx * a, z: corners[2].z + tz * a + mz * a },
            { x: corners[3].x - tx * a + mx * a, z: corners[3].z - tz * a + mz * a },
          ];
          for (const k of rasterize(ring, n, false)) gap[k] = 1;
          const centerCell = cellOf((corners[0].x + corners[2].x) / 2, (corners[0].z + corners[2].z) / 2);
          lots.push({ id, corners, facing: Math.atan2(-mz, -mx), district: d as District, density: density[centerCell], area: columns.length * VOXEL_M * VOXEL_M, low, high, floor: low });
          placed = w;
        }
        s += placed ? placed + voxels(ALLEY) : voxels(1);
      }
    }
  }

  // The street walk's small lots merged or given up first (see 6), so what they leave is packed
  // with corner lots too; the alleys round the lots kept are marked again.
  {
    const kept = mergeSmallLots(lots, lotId, claim, height, n);
    lots.length = 0;
    lots.push(...kept);
    gap.fill(0);
    const a = voxels(ALLEY);
    for (const lot of lots) {
      const f = frame(lot);
      const at = (u: number, v: number) => ({ x: f.a.x + f.t.x * u + f.m.x * v, z: f.a.z + f.t.z * u + f.m.z * v });
      for (const k of rasterize([at(-a, -a), at(f.width + a, -a), at(f.width + a, f.depth + a), at(-a, f.depth + a)], n, false)) gap[k] = 1;
    }
  }

  // 5. Corner lots: the frontage the street walk leaves (rounded corners, short runs, odd
  // pockets) is packed with grid-aligned rectangles, the district's size or smaller down to
  // MIN_PLOT a side, each touching a verge or street, an alley from every other lot. A summed-area
  // table of usable columns tests a rectangle at once; `taken` holds those placed so far.
  const alley = voxels(ALLEY);
  const sat = new Int32Array((n + 1) * (n + 1));
  for (let z = 0; z < n; z++) {
    let row = 0;
    for (let x = 0; x < n; x++) {
      if (usable(z * n + x)) row++;
      sat[(z + 1) * (n + 1) + x + 1] = sat[z * (n + 1) + x + 1] + row;
    }
  }
  const openIn = (x0: number, z0: number, w: number, d: number) =>
    sat[(z0 + d) * (n + 1) + x0 + w] - sat[z0 * (n + 1) + x0 + w] - sat[(z0 + d) * (n + 1) + x0] + sat[z0 * (n + 1) + x0] === w * d;
  const isFront = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= n || z >= n) return false;
    const what = claim[z * n + x];
    return what === CLAIM.verge || what === CLAIM.road || what === CLAIM.plaza;
  };
  // Columns of a side of the rectangle with paving just outside it, within FORECOURT (beside a
  // bend the verge curves away from a grid-aligned side; the strip between is the lot's forecourt).
  const reach = voxels(FORECOURT);
  const near = (x: number, z: number, dx: number, dz: number) => {
    for (let d = 0; d < reach; d++) if (isFront(x + dx * d, z + dz * d)) return true;
    return false;
  };
  const touching = (x0: number, z0: number, x1: number, z1: number) => {
    let north = 0;
    let south = 0;
    let west = 0;
    let east = 0;
    for (let x = x0; x < x1; x++) {
      if (near(x, z0 - 1, 0, -1)) north++;
      if (near(x, z1, 0, 1)) south++;
    }
    for (let z = z0; z < z1; z++) {
      if (near(x0 - 1, z, -1, 0)) west++;
      if (near(x1, z, 1, 0)) east++;
    }
    return [north, east, south, west];
  };
  const taken = new Uint8Array(n * n);
  const stride = voxels(0.5);
  const minSide = voxels(MIN_PLOT);
  for (let z0 = 0; z0 + minSide <= n; z0 += stride) {
    for (let x0 = 0; x0 + minSide <= n; x0 += stride) {
      if (taken[z0 * n + x0] || !openIn(x0, z0, 1, 1)) continue;
      const d = district[cellOf(x0, z0)] as District;
      const spec = DISTRICTS[d];
      const maxStep = voxels(d === DISTRICT.megablock ? MAX_STACK_STEP : MAX_LOT_STEP);
      const wide = Math.max(minSide, voxels(spec.width * ZONE));
      const deepest = Math.max(minSide, voxels(Math.min(spec.depth * ZONE, 2 * ZONE)));
      // Every size from the district's down to MIN_PLOT a side, in steps of CORNER_STEP, roomiest first.
      const lengths = [...new Set([wide, deepest, ...Array.from({ length: 8 }, (_, i) => voxels(MIN_PLOT + i * CORNER_STEP))])].filter((v) => v >= minSide && v <= Math.max(wide, deepest));
      const sizes = lengths.flatMap((a) => lengths.map((b) => [a, b])).sort((p, q) => Math.min(q[0], q[1]) - Math.min(p[0], p[1]) || q[0] * q[1] - p[0] * p[1]);
      for (const [w, dd] of sizes) {
        if (x0 + w > n || z0 + dd > n || !openIn(x0, z0, w, dd)) continue;
        // Every earlier corner lot starts before this one in scan order, so one that overlaps it
        // crosses its top row or its left column.
        let ok = true;
        for (let x = x0; x < x0 + w && ok; x++) if (taken[z0 * n + x]) ok = false;
        for (let z = z0; z < z0 + dd && ok; z++) if (taken[z * n + x0]) ok = false;
        if (!ok) continue;
        const x1 = x0 + w;
        const z1 = z0 + dd;
        const sides = touching(x0, z0, x1, z1);
        const front = sides.indexOf(Math.max(...sides));
        // It must front a street along at least a quarter of its narrower side (beside a bend, less
        // of it touches the rounded verge).
        if (sides[front] < Math.min(w, dd) / 4) continue;
        let low = Infinity;
        let high = -Infinity;
        for (let z = z0; z < z1; z++) {
          for (let x = x0; x < x1; x++) {
            const v = height[z * n + x];
            if (v < low) low = v;
            if (v > high) high = v;
          }
        }
        if (high - low > maxStep) continue;
        const A = { x: x0, z: z0 };
        const B = { x: x1, z: z0 };
        const C = { x: x1, z: z1 };
        const D = { x: x0, z: z1 };
        const corners = [[A, B, C, D], [B, C, D, A], [C, D, A, B], [D, A, B, C]][front];
        const facing = [Math.atan2(-1, 0), 0, Math.atan2(1, 0), Math.PI][front];
        const id = lots.length;
        for (let z = z0; z < z1; z++) {
          for (let x = x0; x < x1; x++) {
            claim[z * n + x] = CLAIM.lot;
            lotId[z * n + x] = id + 1;
          }
        }
        for (let z = Math.max(0, z0 - alley); z < Math.min(n, z1 + alley); z++) taken.fill(1, z * n + Math.max(0, x0 - alley), z * n + Math.min(n, x1 + alley));
        const center = cellOf((x0 + x1) / 2, (z0 + z1) / 2);
        lots.push({ id, corners, facing, district: d, density: density[center], area: w * dd * VOXEL_M * VOXEL_M, low, high, floor: low });
        break;
      }
    }
  }

  // 6. Small lots: merged with a neighbor, else given up.
  const kept = mergeSmallLots(lots, lotId, claim, height, n);

  // Shares of the land.
  const counts = DISTRICTS.map(() => 0);
  let any = 0;
  for (let c = 0; c < total; c++) {
    if (district[c] === NO_DISTRICT) continue;
    counts[district[c]]++;
    any++;
  }
  // Each lot's floor: the median of its ground.
  const under: number[][] = kept.map(() => []);
  for (let k = 0; k < n * n; k++) if (lotId[k]) under[lotId[k] - 1].push(height[k]);
  kept.forEach((lot, i) => {
    const hs = under[i].sort((a, b) => a - b);
    if (hs.length) lot.floor = hs[hs.length >> 1];
  });
  return { cells, district, access, density, lots: kept, lotId, claims, shares: counts.map((k) => (any ? k / any : 0)), parks: starts.length, parkRects };
}

/** A lot's frame: its front-left corner, unit vectors along its front (t) and toward its back (m), and its width and depth (columns). */
function frame(lot: Lot) {
  const [a, b, , d] = lot.corners;
  const width = Math.hypot(b.x - a.x, b.z - a.z);
  const depth = Math.hypot(d.x - a.x, d.z - a.z);
  return { a, t: { x: (b.x - a.x) / width, z: (b.z - a.z) / width }, m: { x: (d.x - a.x) / depth, z: (d.z - a.z) / depth }, width, depth };
}

/**
 * Small lots (6 in the list above). A lot narrower than MERGE_BELOW either way is merged with a
 * neighbor of its district facing the same way along the same frontage (across the alley between
 * them), as deep as the shallower of the two and no wider than MERGE_WIDEST, if the ground under it
 * stays within the district's step; of its neighbors, the one giving the roomiest lot. Lots still
 * narrower than MIN_PLOT are given up (their ground is left free). Lots are renumbered, and
 * `lotId` and `claim` rewritten to match; returns the lots kept.
 */
function mergeSmallLots(lots: Lot[], lotId: Int32Array, claim: Uint8Array, height: ArrayLike<number>, n: number): Lot[] {
  const live = lots.map(() => true);
  const narrow = (lot: Lot) => Math.min(frame(lot).width, frame(lot).depth);
  const columns: number[][] = lots.map(() => []);
  for (let k = 0; k < n * n; k++) if (lotId[k]) columns[lotId[k] - 1].push(k);
  const release = (id: number) => {
    for (const k of columns[id]) {
      lotId[k] = 0;
      claim[k] = CLAIM.free;
    }
    columns[id] = [];
  };
  // The two lots as one, or null if they can't be.
  const merged = (p: Lot, q: Lot): { corners: P2[]; columns: number[]; low: number; high: number } | null => {
    if (p.district !== q.district || Math.abs(Math.atan2(Math.sin(p.facing - q.facing), Math.cos(p.facing - q.facing))) > 0.05) return null;
    const f = frame(p);
    const g = frame(q);
    const local = (c: P2) => ({ u: (c.x - f.a.x) * f.t.x + (c.z - f.a.z) * f.t.z, v: (c.x - f.a.x) * f.m.x + (c.z - f.a.z) * f.m.z });
    const qs = q.corners.map(local);
    // Same frontage: its front edge on p's.
    if (Math.abs(qs[0].v) > 1.5 || Math.abs(qs[1].v) > 1.5) return null;
    const u0 = Math.min(qs[0].u, qs[1].u);
    const u1 = Math.max(qs[0].u, qs[1].u);
    const gap = Math.max(u0 - f.width, -u1);
    if (gap < -0.5 || gap > voxels(ALLEY) + 1.5) return null;
    const lo = Math.min(0, u0);
    const hi = Math.max(f.width, u1);
    const deep = Math.min(f.depth, g.depth);
    if (hi - lo > voxels(MERGE_WIDEST)) return null;
    const at = (u: number, v: number) => ({ x: f.a.x + f.t.x * u + f.m.x * v, z: f.a.z + f.t.z * u + f.m.z * v });
    const corners = [at(lo, 0), at(hi, 0), at(hi, deep), at(lo, deep)];
    const columns = rasterize(corners, n);
    let low = Infinity;
    let high = -Infinity;
    for (const k of columns) {
      const id = lotId[k];
      if (id !== 0 ? id !== p.id + 1 && id !== q.id + 1 : claim[k] !== CLAIM.free) return null;
      low = Math.min(low, height[k]);
      high = Math.max(high, height[k]);
    }
    if (high - low > voxels(p.district === DISTRICT.megablock ? MAX_STACK_STEP : MAX_LOT_STEP)) return null;
    return { corners, columns, low, high };
  };
  for (let changed = true; changed; ) {
    changed = false;
    const order = lots.map((_, i) => i).filter((i) => live[i] && narrow(lots[i]) < voxels(MERGE_BELOW));
    order.sort((i, j) => narrow(lots[i]) - narrow(lots[j]));
    for (const i of order) {
      if (!live[i]) continue;
      const p = lots[i];
      let best: { j: number; m: NonNullable<ReturnType<typeof merged>>; side: number } | null = null;
      for (let j = 0; j < lots.length; j++) {
        if (j === i || !live[j]) continue;
        const q = lots[j];
        if (Math.hypot(q.corners[0].x - p.corners[0].x, q.corners[0].z - p.corners[0].z) > voxels(MERGE_WIDEST) + 8) continue;
        const m = merged(p, q);
        if (!m) continue;
        const side = Math.min(Math.hypot(m.corners[1].x - m.corners[0].x, m.corners[1].z - m.corners[0].z), Math.hypot(m.corners[3].x - m.corners[0].x, m.corners[3].z - m.corners[0].z));
        if (side > narrow(p) + 0.5 && (!best || side > best.side)) best = { j, m, side };
      }
      if (!best) continue;
      const q = lots[best.j];
      release(i);
      release(best.j);
      live[best.j] = false;
      for (const k of best.m.columns) {
        lotId[k] = p.id + 1;
        claim[k] = CLAIM.lot;
      }
      columns[i] = best.m.columns;
      Object.assign(p, { corners: best.m.corners, low: best.m.low, high: best.m.high, area: best.m.columns.length * VOXEL_M * VOXEL_M, density: Math.max(p.density, q.density) });
      changed = true;
    }
  }
  for (let i = 0; i < lots.length; i++) {
    if (live[i] && narrow(lots[i]) < voxels(MIN_PLOT) - 0.25) {
      release(i);
      live[i] = false;
    }
  }
  // Renumbered.
  const kept = lots.filter((_, i) => live[i]);
  const renumber = new Int32Array(lots.length + 1);
  kept.forEach((lot, i) => {
    renumber[lot.id + 1] = i + 1;
    lot.id = i;
  });
  for (let k = 0; k < n * n; k++) if (lotId[k]) lotId[k] = renumber[lotId[k]];
  return kept;
}

/** Column indices inside a convex quadrilateral (corners in order), clipped to the map; with
 * `dropOffMap`, a quadrilateral that runs off the map gives none. */
function rasterize(corners: P2[], n: number, dropOffMap = true): number[] {
  const xs = corners.map((q) => q.x);
  const zs = corners.map((q) => q.z);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(n - 1, Math.ceil(Math.max(...xs)));
  const z0 = Math.max(0, Math.floor(Math.min(...zs)));
  const z1 = Math.min(n - 1, Math.ceil(Math.max(...zs)));
  if (x0 > x1 || z0 > z1) return [];
  const out: number[] = [];
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const pz = z + 0.5;
      // Inside a convex polygon: on the same side of every edge (either winding).
      let sign = 0;
      let inside = true;
      for (let i = 0; i < 4 && inside; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        const cross = (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x);
        if (cross === 0) continue;
        if (sign === 0) sign = Math.sign(cross);
        else if (Math.sign(cross) !== sign) inside = false;
      }
      if (inside) out.push(z * n + x);
    }
  }
  // A lot that runs off the map is dropped.
  return dropOffMap && (xs.some((x) => x < 0 || x > n - 1) || zs.some((z) => z < 0 || z > n - 1)) ? [] : out;
}

/** A binary min-heap of indices by priority. */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop(): number {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= items.length) break;
        const r = l + 1;
        const c = r < items.length && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
