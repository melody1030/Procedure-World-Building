import { fbm } from "../noise";
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
 *      parks        not buildable, or a slow noise patch (PARK_SHARE of buildable land, not in
 *                   the core)
 *      core         the CORE_SHARE of buildable land nearest the plaza (by access)
 *      industrial   near the river (DOCK_RIVER) on low ground (height rank under DOCK_LOW), or
 *                   near an exit (DOCK_EXIT)
 *      neon         within NEON_FRONTAGE of an avenue in the nearer NEON_AVENUE_SHARE, or within
 *                   NEON_RING_FRONTAGE of any street in the nearer NEON_RING_SHARE (the inner ring)
 *      wealthy      high ground (rank over WEALTHY_HIGH), in the farther half by access, and at
 *                   least WEALTHY_GAP from industrial
 *      megablocks   everything else buildable
 *    Access thresholds are shares of the buildable land, so every city's districts scale with it.
 *    Then two majority passes smooth the edges, and any region under MIN_REGION joins the
 *    neighbor it shares the most border with.
 * 3. Density per cell: the district's base density · (1 − 0.5 · access / span).
 * 4. Lots: along every street (avenues first), on both sides, behind the verge, a rectangle
 *    aligned to the street of the district's width (±15%, seeded) and depth, with an ALLEY gap.
 *    A lot is kept only if every column is free, buildable and not a park, and its ground spans
 *    at most MAX_LOT_STEP (megablocks MAX_STACK_STEP: they stack down slopes). Its columns are
 *    claimed `lot`.
 */

export const DISTRICT = { core: 0, neon: 1, megablock: 2, industrial: 3, wealthy: 4, park: 5 } as const;
export type District = (typeof DISTRICT)[keyof typeof DISTRICT];
/** No district: road, plaza, river or bank. */
export const NO_DISTRICT = 255;

/** Names, debug colors, lot sizes (meters) and base density, by district. */
export const DISTRICTS: { name: string; color: number; width: number; depth: number; density: number }[] = [
  { name: "Corporate core", color: 0x22d3ee, width: 16, depth: 16, density: 1 },
  { name: "Neon strip", color: 0xe879f9, width: 8, depth: 10, density: 0.75 },
  { name: "Megablocks", color: 0x8b5cf6, width: 10, depth: 12, density: 0.6 },
  { name: "Industrial", color: 0xf59e0b, width: 20, depth: 20, density: 0.35 },
  { name: "Wealthy", color: 0xfde68a, width: 14, depth: 14, density: 0.3 },
  { name: "Parks", color: 0x4ade80, width: 0, depth: 0, density: 0 },
];

const BUILD_SLOPE = 30;
const REACH = 30;
const PARK_SHARE = 0.1;
const PARK_FREQ = 4;
/** Access thresholds are shares of the buildable land, nearest the plaza first, so every city's
 * core and strips scale with it. */
const CORE_SHARE = 0.15;
const DOCK_RIVER = 50;
const DOCK_LOW = 0.5;
const DOCK_EXIT = 30;
const NEON_FRONTAGE = 14;
/** Neon runs along avenues within this share of access, and along any street in the inner ring. */
const NEON_AVENUE_SHARE = 0.6;
const NEON_RING_SHARE = 0.35;
const NEON_RING_FRONTAGE = 10;
const WEALTHY_HIGH = 0.8;
const WEALTHY_FAR_SHARE = 0.5;
const WEALTHY_GAP = 40;
const MIN_REGION = 100;
/** Lots: gap between neighbors, size variation, the narrower width tried when a full one doesn't
 * fit, and the most their ground may span (meters; the building stage terraces them). */
const NARROW = 0.6;
const ALLEY = 1;
const LOT_VARIATION = 0.15;
const MAX_LOT_STEP = 6;
const MAX_STACK_STEP = 10;
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
  const empty: Districts = { cells, district, access, density, lots: [], lotId, claims, shares: DISTRICTS.map(() => 0) };
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
  for (let c = 0; c < total; c++) {
    if (road[c] || wet[c] || free[c] < (CELL * CELL) / 2 || !hubs.side[c]) continue;
    const cx = c % cells;
    const cz = (c - cx) / cells;
    const gx = (at(cx + 1, cz) - at(cx - 1, cz)) / (2 * CELL);
    const gz = (at(cx, cz + 1) - at(cx, cz - 1)) / (2 * CELL);
    const slope = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
    if (slope <= BUILD_SLOPE && roadDist[c] <= REACH) buildable[c] = 1;
  }
  const order = Array.from({ length: total }, (_, c) => c).filter((c) => buildable[c]).sort((a, b) => ground[a] - ground[b]);
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

  // Access thresholds as shares of the buildable land.
  const byAccess = order.map((c) => access[c]).sort((a, b) => a - b);
  const accessAt = (share: number) => (byAccess.length ? byAccess[Math.min(byAccess.length - 1, Math.floor(share * byAccess.length))] : 0);
  const CORE_ACCESS = accessAt(CORE_SHARE);
  const NEON_ACCESS = accessAt(NEON_AVENUE_SHARE);
  const RING_ACCESS = accessAt(NEON_RING_SHARE);
  const WEALTHY_ACCESS = accessAt(WEALTHY_FAR_SHARE);

  // 2. Districts. Parks: unbuildable land, plus the noisiest PARK_SHARE of buildable land outside the core.
  const parkNoise = new Float32Array(total);
  const salt = seed ^ 0x2f6b8a1d;
  const noisy: number[] = [];
  for (let c = 0; c < total; c++) {
    if (!buildable[c]) continue;
    parkNoise[c] = fbm(((c % cells) / cells) * PARK_FREQ, (Math.floor(c / cells) / cells) * PARK_FREQ, salt, 3);
    if (access[c] > CORE_ACCESS) noisy.push(parkNoise[c]);
  }
  noisy.sort((a, b) => b - a);
  const parkLine = noisy.length ? noisy[Math.floor(noisy.length * PARK_SHARE)] : Infinity;
  for (let c = 0; c < total; c++) {
    if (road[c] || wet[c] || !hubs.side[c]) continue;
    if (!buildable[c] || (access[c] > CORE_ACCESS && parkNoise[c] >= parkLine)) district[c] = DISTRICT.park;
    else if (access[c] <= CORE_ACCESS) district[c] = DISTRICT.core;
    else if ((riverM(c) <= DOCK_RIVER && rank[c] <= DOCK_LOW) || exitM(c) <= DOCK_EXIT) district[c] = DISTRICT.industrial;
    else if ((roadDist[c] <= NEON_FRONTAGE && avenue[nearest[c]] && access[c] <= NEON_ACCESS) || (roadDist[c] <= NEON_RING_FRONTAGE && access[c] <= RING_ACCESS)) district[c] = DISTRICT.neon;
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

  // Smoothing: two majority passes over buildable cells, then small regions join a neighbor.
  const votes = new Uint8Array(DISTRICTS.length);
  for (let pass = 0; pass < 2; pass++) {
    const next = district.slice();
    for (let c = 0; c < total; c++) {
      if (!buildable[c] || district[c] === NO_DISTRICT) continue;
      votes.fill(0);
      const cx = c % cells;
      const cz = (c - cx) / cells;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
          const d = district[z * cells + x];
          if (d !== NO_DISTRICT) votes[d]++;
        }
      }
      // A cell changes only if another district clearly outvotes its own.
      let best = district[c];
      for (let d = 0; d < votes.length; d++) if (votes[d] > votes[best] + 1) best = d;
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
      for (const [dx, dz] of N8.slice(0, 4)) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
        const nc = z * cells + x;
        const d = district[nc];
        if (d === d0 && region[nc] < 0) {
          region[nc] = c0;
          members.push(nc);
        } else if (d !== d0 && d !== NO_DISTRICT) border.set(d, (border.get(d) ?? 0) + 1);
      }
    }
    if (members.length >= minCells || !border.size) continue;
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

  // 4. Lots along the streets, avenues first.
  const rng = new Rng(seed ^ 0x7b3c1e95);
  const lots: Lot[] = [];
  const cellOf = (x: number, z: number) => Math.min(cells - 1, Math.max(0, Math.floor(z / CELL))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / CELL)));
  const ordered = [...streets.streets].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "main" ? -1 : 1));
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
        // The district is read a few meters in, at the middle of a typical lot.
        const probe = offset + voxels(5);
        const d = district[cellOf(p.x + nx * probe, p.z + nz * probe)];
        if (d === NO_DISTRICT || d === DISTRICT.park) {
          s += voxels(1);
          continue;
        }
        const spec = DISTRICTS[d];
        const jitter = 1 + LOT_VARIATION * (2 * rng.next() - 1);
        let placed = 0;
        for (const factor of [1, NARROW]) {
          const w = voxels(spec.width * jitter * factor);
          const depth = voxels(spec.depth);
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
          // A quick look at the corners and the middle first, before testing every column.
          const middle = { x: fc.x + (mx * depth) / 2, z: fc.z + (mz * depth) / 2 };
          const inset = Math.min(0.25, 2 / Math.min(w, depth));
          const probes = [...corners.map((q) => ({ x: q.x + (middle.x - q.x) * inset, z: q.z + (middle.z - q.z) * inset })), middle];
          const quick = probes.every((q) => {
            if (q.x < 0 || q.z < 0 || q.x > n - 1 || q.z > n - 1) return false;
            const k = Math.round(q.z) * n + Math.round(q.x);
            const cd = district[cellOf(q.x, q.z)];
            return claim[k] === CLAIM.free && cd !== NO_DISTRICT && cd !== DISTRICT.park;
          });
          if (!quick) continue;
          const columns = rasterize(corners, n);
          let ok = columns.length > 0;
          let low = Infinity;
          let high = -Infinity;
          for (const k of columns) {
            const cd = district[cellOf(k % n, Math.floor(k / n))];
            if (claim[k] !== CLAIM.free || cd === NO_DISTRICT || cd === DISTRICT.park) {
              ok = false;
              break;
            }
            low = Math.min(low, height[k]);
            high = Math.max(high, height[k]);
          }
          if (!ok || high - low > voxels(d === DISTRICT.megablock ? MAX_STACK_STEP : MAX_LOT_STEP)) continue;
          const id = lots.length;
          for (const k of columns) {
            claim[k] = CLAIM.lot;
            lotId[k] = id + 1;
          }
          const centerCell = cellOf(middle.x, middle.z);
          lots.push({ id, corners, facing: Math.atan2(-mz, -mx), district: d as District, density: density[centerCell], area: columns.length * VOXEL_M * VOXEL_M, low, high });
          placed = w;
          break;
        }
        s += placed ? placed + voxels(ALLEY) : voxels(1);
      }
    }
  }

  // Shares of the buildable land.
  const counts = DISTRICTS.map(() => 0);
  let any = 0;
  for (let c = 0; c < total; c++) {
    if (district[c] === NO_DISTRICT || !buildable[c]) continue;
    counts[district[c]]++;
    any++;
  }
  return { cells, district, access, density, lots, lotId, claims, shares: counts.map((k) => (any ? k / any : 0)) };
}

/** Column indices inside a convex quadrilateral (corners in order), clipped to the map. */
function rasterize(corners: P2[], n: number): number[] {
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
  return xs.some((x) => x < 0 || x > n - 1) || zs.some((z) => z < 0 || z > n - 1) ? [] : out;
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
