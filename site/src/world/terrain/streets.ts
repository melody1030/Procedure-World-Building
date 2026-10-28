import { smoothstep } from "../noise";
import { centripetalCurve, distanceToCurveLocal, smoothProfile, type P2 } from "../path";
import { hash2 } from "../rng";
import { VOXEL_M, voxels } from "../scale";
import { CLAIM, type Claims } from "./claims";
import { CELL, type Hubs } from "./hubs";
import { MODULES, solve, type EdgeKind } from "./wfc";

/**
 * Streets: the street network (town plan, section 4W). Nothing here is tunable; every number is a
 * constant below.
 *
 * 1. The center plaza: a PLAZA_SIZE square as near the city center as it fits on the city's bank,
 *    clear of the river, leveled to the median ground inside. It is where the streets start.
 * 2. The street tiles, by wave function collapse (wfc.ts), following the "2D Module & Rule" board:
 *    a grid of TILE cells on the voxel grid with the plaza at the center of one cell; each cell holds
 *    one of 12 modules (empty, straights, corners, T-junctions, a cross).
 *    - Terrain: an arm (center to edge) is allowed only on the city's side, clear of the river and
 *      within STREET_GRADE (MAX_GRADE for avenues). Edges are shared (both cells match), blank, or
 *      open (an exit at the diorama's edge). Cells with fewer than two ways on are dropped first,
 *      so there are no dead ends.
 *    - The plaza cell holds every arm it can; 3–5 of them (at most its four sides; the seed picks)
 *      are avenues, straight along their row or column, leaving the diorama as exits.
 *    - Weights: straights over corners, a denser core, roads along the contours on slopes.
 *    - The rules: matching edges; no U-turns and no 2 × 2 loops (Rule 1); no staircases (Rule 2);
 *      the collapse starts at the plaza and grows outward, and roads not connected to it are
 *      erased (Rule 3).
 *    The road cells become polylines through cell centers and edge midpoints, joined in a planar
 *    street graph (exits run on to the diorama's edge).
 * 3. Levels: every junction starts at the smoothed ground (the plaza's are fixed) and is relaxed
 *    until every street can reach both its ends within its grade (MAX_GRADE for main streets,
 *    STREET_GRADE for side streets, stepped hillside streets). Each street's profile is then
 *    pinned to its two junctions and held within the grade, and rounded to whole voxels.
 * 4. One carve, cut and fill: junctions first (a square pad at the junction's level, as wide as
 *    the widest street meeting there, so crossings are flush), then main streets, then side
 *    streets; the first to pave a column keeps it.
 *    Embankments widen with the depth of the cut or fill. The river, its bank and the plaza are
 *    never touched. Streets claim `road`, and VERGE beyond their edges `verge`. Small unpaved
 *    pockets enclosed by paving are paved as small squares.
 * 5. The blocks: the ground between the streets is smoothed (smoothBlocks), so blocks slope evenly
 *    from one street's level to the next instead of keeping the hill's terraces, and the lots on
 *    them need less cut and fill.
 * 6. Curbs: paving that borders unpaved ground is raised one voxel, open wherever paving meets paving.
 */

/** Width of every street, avenues included, in meters. */
const STREET_WIDTH = 3.5;
/** How many avenues leave the plaza, at least and at most (the seed picks); at most its four sides. */
const MIN_MAIN = 3;
const MAX_MAIN = 5;
/** Side of a street tile, in meters: streets run through tile centers, so blocks are at least 2 × 3 tiles. */
const TILE = 20;
/** Cut or fill an arm may need beyond its grade, in meters (the carve makes it); more where it
 * meets the plaza, so streets can climb out of a plaza on a valley floor. */
const ARM_CUT = 1.5;
const PLAZA_CUT = 4;
/** Steepest a main street may climb, and a side street (stepped hillside streets), as rise over run. */
const MAX_GRADE = 0.15;
const STREET_GRADE = 0.25;
/** Unpaved pockets smaller than this (square meters) enclosed by paving are paved over: too small
 * for a building, they become small paved squares (a forecourt beside the plaza, a corner square). */
const POCKET = 150;
/** Passes of the junction-level relaxation. */
const LEVEL_PASSES = 300;
/** Embankments (cut and fill slopes) are at least EMBANKMENT wide, and BANK_RUN meters wide per
 * meter of cut or fill, up to MAX_EMBANKMENT: shallow cuts blend quickly, deep ones get long slopes. */
const EMBANKMENT = 2;
const BANK_RUN = 1;
const MAX_EMBANKMENT = 10;
/** How much higher a curb stands than the paving, in voxels. */
const CURB = 1;
/** The strip beyond each street edge kept for lamps and street trees, in meters. */
const VERGE = 1.5;
/** Block smoothing: within BLOCK_REACH meters of paving the ground is free to take the smoothest
 * shape between the streets' levels; by WILD_REACH it keeps its own (the hills beyond the city). */
const BLOCK_REACH = 20;
const WILD_REACH = 40;
/** Side of the square center plaza, in meters. */
const PLAZA_SIZE = 24;
/** The plaza keeps this far from the river channel, in meters. */
const PLAZA_CLEARANCE = 2;
/** How far the center plaza may move to fit, in meters. */
const PLAZA_SHIFT = 30;
/** Blur passes (3 × 3 cells each) on the heights streets read while growing. */
const GROUND_BLUR = 2;
/** Columns kept clear along the diorama's edge while growing. */
const EDGE_COLUMNS = CELL;

export interface Plaza {
  /** Center, in columns. */
  x: number;
  z: number;
  /** Half its side (it is a square on the voxel grid), in columns. */
  half: number;
  /** Ground level, in voxels. */
  level: number;
}

export interface Street {
  /** "main" for the avenues and their exits; "street" for side streets. */
  kind: "main" | "street";
  /** The center line, in columns, about one sample per column. */
  curve: P2[];
  /** Street level at each curve sample, in whole voxels. */
  level: Float32Array;
  /** Width, in columns. */
  width: number;
}

export interface Streets {
  /** The height map after carving the plaza and the streets. */
  h: Float32Array;
  /** The claim map with roads, verges and plazas added. */
  claims: Claims;
  /** 1 for curb columns: paving that borders unpaved ground, one voxel higher than the paving. */
  curb: Uint8Array;
  /** The center plaza (the only plaza). */
  plazas: Plaza[];
  /** Main streets first, then side streets. */
  streets: Street[];
  /** Junctions where three or more streets meet, in columns. */
  junctions: P2[];
  /** Centers of the road tiles (in columns) and the tile size (columns), for the overlay. */
  tiles: { centers: P2[]; size: number };
}

/* ---------- The street graph ---------- */

interface GNode {
  x: number;
  z: number;
  level: number;
  fixed: boolean;
}

interface GEdge {
  a: number;
  b: number;
  /** The polyline from node a to node b, in columns. */
  pts: P2[];
  kind: Street["kind"];
  /** Width, in columns. */
  width: number;
  alive: boolean;
}

/** The street graph: junctions (nodes) and the streets between them (edges, as polylines). */
class Graph {
  nodes: GNode[] = [];
  edges: GEdge[] = [];

  addNode(x: number, z: number, level = NaN, fixed = false): number {
    this.nodes.push({ x, z, level, fixed });
    return this.nodes.length - 1;
  }

  addEdge(a: number, b: number, pts: P2[], kind: Street["kind"], width: number): number {
    this.edges.push({ a, b, pts, kind, width, alive: true });
    return this.edges.length - 1;
  }
}

function polylineLength(pts: P2[]): number {
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return length;
}

/* ---------- Building the network ---------- */

export function buildStreets(seed: number, map: { n: number; h: Float32Array }, hubs: Hubs, base: Claims): Streets {
  const { n } = map;
  const h = map.h.slice();
  const claim = base.claim.slice();
  const claims: Claims = { ...base, claim };
  if (hubs.hubs.length === 0) return { h, claims, curb: new Uint8Array(n * n), plazas: [], streets: [], junctions: [], tiles: { centers: [], size: 0 } };
  const { cells } = hubs;
  const blocked = (k: number) => claim[k] === CLAIM.river || claim[k] === CLAIM.bank;
  const cellAt = (x: number, z: number) => Math.min(cells - 1, Math.max(0, Math.floor(z / CELL))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / CELL)));
  const ground = blur(hubs.mean, cells, GROUND_BLUR);
  const groundAt = (x: number, z: number) => sampleCells(ground, cells, x / CELL - 0.5, z / CELL - 0.5);

  // 1. The center plaza.
  const center = hubs.hubs[0];
  const half = voxels(PLAZA_SIZE) / 2;
  const at = placePlaza(center.x, center.z, half, PLAZA_SHIFT, n, base, hubs) ?? { x: center.x, z: center.z };
  const inside: number[] = [];
  forSquare(at.x, at.z, half, 0, n, (k) => !blocked(k) && inside.push(h[k]));
  inside.sort((a, b) => a - b);
  const plaza: Plaza = { x: at.x, z: at.z, half, level: Math.round(inside[inside.length >> 1] ?? h[at.z * n + at.x]) };
  forSquare(plaza.x, plaza.z, half, voxels(MAX_EMBANKMENT), n, (k, d) => {
    if (blocked(k)) return;
    if (d <= 0) {
      h[k] = plaza.level;
      claim[k] = CLAIM.plaza;
    } else h[k] = embank(h[k], plaza.level, d);
  });
  const inPlaza = (q: P2, grow = 0) => Math.max(Math.abs(q.x - plaza.x), Math.abs(q.z - plaza.z)) <= half + grow;

  const graph = new Graph();
  // Plaza nodes: the middle of each side, at the plaza's level.
  const sides = [
    { x: plaza.x + half, z: plaza.z, angle: 0 },
    { x: plaza.x, z: plaza.z + half, angle: Math.PI / 2 },
    { x: plaza.x - half, z: plaza.z, angle: Math.PI },
    { x: plaza.x, z: plaza.z - half, angle: -Math.PI / 2 },
  ].map((s) => ({ ...s, node: graph.addNode(s.x, s.z, plaza.level, true) }));
  const plazaNodes = new Set(sides.map((s) => s.node));


  // 3. The street tiles: wave function collapse on a TILE grid, starting from the plaza.
  const tile = voxels(TILE);
  const reach = tile / 2;
  const streetWidth = voxels(STREET_WIDTH);
  const left = Math.floor((plaza.x - EDGE_COLUMNS) / tile);
  const up = Math.floor((plaza.z - EDGE_COLUMNS) / tile);
  const right = Math.floor((n - 1 - EDGE_COLUMNS - plaza.x) / tile);
  const down = Math.floor((n - 1 - EDGE_COLUMNS - plaza.z) / tile);
  const size = Math.max(left + right, up + down) + 1;
  const centerOf = (c: number): P2 => ({ x: plaza.x + ((c % size) - left) * tile, z: plaza.z + (Math.floor(c / size) - up) * tile });
  const start = up * size + left;
  const cellCount = size * size;
  const exists = new Uint8Array(cellCount);
  for (let c = 0; c < cellCount; c++) {
    const q = centerOf(c);
    exists[c] = q.x >= EDGE_COLUMNS && q.z >= EDGE_COLUMNS && q.x <= n - 1 - EDGE_COLUMNS && q.z <= n - 1 - EDGE_COLUMNS ? 1 : 0;
  }
  const DX = [1, 0, -1, 0];
  const DZ = [0, 1, 0, -1];
  const neighborCell = (c: number, d: number) => {
    const i = (c % size) + DX[d];
    const j = Math.floor(c / size) + DZ[d];
    return i < 0 || j < 0 || i >= size || j >= size || !exists[j * size + i] ? -1 : j * size + i;
  };
  // An arm: from a cell's center toward its edge (`length` columns), clear of the river and within
  // the grade, allowing ARM_CUT of cut or fill. Inside the plaza the ground is the plaza's level.
  const levelAt = (q: P2) => (inPlaza(q) ? plaza.level : groundAt(q.x, q.z));
  const armClear = (c: number, d: number, main: boolean, length = reach) => {
    const o = centerOf(c);
    const base = levelAt(o);
    const toPlaza = inPlaza({ x: o.x + DX[d] * length, z: o.z + DZ[d] * length }) || inPlaza(o);
    for (let t = 0; t <= length + 1e-6; t += voxels(1)) {
      const q = { x: o.x + DX[d] * t, z: o.z + DZ[d] * t };
      if (q.x < 0 || q.z < 0 || q.x > n - 1 || q.z > n - 1) return false;
      const cell = cellAt(q.x, q.z);
      if (!hubs.side[cell] || hubs.riverD[cell] < STREET_WIDTH / 2 + 1) return false;
    }
    const end = { x: o.x + DX[d] * length, z: o.z + DZ[d] * length };
    return Math.abs(levelAt(end) - base) <= (main ? MAX_GRADE : STREET_GRADE) * length + voxels(toPlaza ? PLAZA_CUT : ARM_CUT);
  };
  const armGrade = new Float32Array(cellCount * 4);
  const armOk = new Uint8Array(cellCount * 4);
  const mainOk = new Uint8Array(cellCount * 4);
  for (let c = 0; c < cellCount; c++) {
    if (!exists[c]) continue;
    const o = centerOf(c);
    for (let d = 0; d < 4; d++) {
      armOk[c * 4 + d] = armClear(c, d, false) ? 1 : 0;
      mainOk[c * 4 + d] = armClear(c, d, true) ? 1 : 0;
      armGrade[c * 4 + d] = Math.abs(levelAt({ x: o.x + DX[d] * reach, z: o.z + DZ[d] * reach }) - levelAt(o)) / reach;
    }
  }

  // A cell can carry a street only if, besides the way in, at least one more of its edges can.
  const sharable = (c: number, d: number) => {
    const nb = neighborCell(c, d);
    return nb >= 0 ? armOk[c * 4 + d] === 1 && armOk[nb * 4 + ((d + 2) & 3)] === 1 : false;
  };
  const canContinue = (c: number, from: number) => [0, 1, 2, 3].some((e) => e !== from && sharable(c, e));
  // No dead ends: a cell with fewer than two ways on to another cell can't
  // carry a street, so its arms are dropped, which may leave a neighbor short too; repeat until
  // none is left. The plaza is exempt (it is where streets start).
  const ways = (c: number) => [0, 1, 2, 3].filter((d) => sharable(c, d)).length;
  const peelQueue = Array.from({ length: cellCount }, (_, c) => c).filter((c) => exists[c] && c !== start);
  while (peelQueue.length) {
    const c = peelQueue.pop()!;
    if (ways(c) >= 2) continue;
    for (let d = 0; d < 4; d++) {
      const nb = neighborCell(c, d);
      const linked = sharable(c, d);
      armOk[c * 4 + d] = 0;
      mainOk[c * 4 + d] = 0;
      if (linked && nb !== start) peelQueue.push(nb);
    }
  }

  // Avenues: 3–5 of the plaza's arms (as many as it has, at most four), straight along their
  // row or column for as long as both arms of each cell are allowed for a main street.
  const mainCount = MIN_MAIN + Math.floor(hash2(1, 2, seed ^ 0x6a09e667) * (MAX_MAIN - MIN_MAIN + 1));
  const avenueCount = mainCount;
  const plazaArms = [0, 1, 2, 3].filter((d) => neighborCell(start, d) >= 0 && armOk[start * 4 + d] && armOk[neighborCell(start, d) * 4 + ((d + 2) & 3)]);
  // Longest runs first, so the avenues cross the most city.
  const runLength = (d: number) => {
    let length = 0;
    for (let c = neighborCell(start, d); c >= 0 && mainOk[c * 4 + d] && mainOk[c * 4 + ((d + 2) & 3)]; c = neighborCell(c, d)) length++;
    return length;
  };
  const avenues = [...plazaArms].sort((a, b) => runLength(b) - runLength(a)).slice(0, avenueCount);
  const mainEdges = new Set<number>();
  const mustHave = new Uint8Array(cellCount);
  const exitEdge = new Uint8Array(cellCount * 4);
  for (const d of avenues) {
    const back = (d + 2) & 3;
    // Each step needs the shared edge between two cells (both arms allowed) and a way on from the
    // next cell; an avenue cell keeps going only while both its arms are allowed for a main street.
    let prev = start;
    let c = neighborCell(start, d);
    while (c >= 0 && (prev !== start || canContinue(c, back))) {
      mainEdges.add(prev * 4 + d).add(c * 4 + back);
      mustHave[c] |= 1 << back;
      if (!mainOk[c * 4 + d] || !mainOk[c * 4 + back]) break;
      const next = neighborCell(c, d);
      if (next < 0) {
        // At the diorama's edge, the avenue leaves it: an exit.
        mustHave[c] |= 1 << d;
        exitEdge[c * 4 + d] = 1;
        break;
      }
      if (!armOk[next * 4 + back] || !canContinue(next, back)) break;
      mustHave[c] |= 1 << d;
      prev = c;
      c = next;
    }
  }

  // Edges: shared between two cells, open (an exit), or blank.
  const edges: EdgeKind[] = new Array(cellCount * 4).fill("blank");
  for (let c = 0; c < cellCount; c++) {
    if (!exists[c]) continue;
    for (let d = 0; d < 4; d++) {
      if (sharable(c, d)) edges[c * 4 + d] = "shared";
      else if (exitEdge[c * 4 + d]) edges[c * 4 + d] = "open";
    }
  }

  // Allowed modules: the plaza holds every arm it can; avenue cells hold their avenue arms.
  const degreeOf = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
  const allowed = new Uint16Array(cellCount);
  // The plaza takes every arm that leads somewhere: an open edge, or a shared one whose next cell
  // can carry the street on.
  const plazaMask = [0, 1, 2, 3].reduce((m, d) => {
    const kind = edges[start * 4 + d];
    const nb = neighborCell(start, d);
    return kind === "open" || (kind === "shared" && nb >= 0 && canContinue(nb, (d + 2) & 3)) ? m | (1 << d) : m;
  }, 0);
  for (let c = 0; c < cellCount; c++) {
    if (!exists[c]) continue;
    let mask = 0;
    MODULES.forEach((m, k) => {
      // Dead ends only at the plaza, where a street must start even if only one side can have one.
      if (c === start ? m !== plazaMask : (m & mustHave[c]) !== mustHave[c] || degreeOf(m) === 1) return;
      mask |= 1 << k;
    });
    allowed[c] = mask;
  }

  // Weights: straights over corners, a denser core, and on slopes roads along the contours.
  const spanCells = Math.max(3, voxels(Math.max(60, hubs.span)) / tile);
  const weight = (c: number, k: number) => {
    const m = MODULES[k];
    const far = Math.min(1, Math.hypot((c % size) - left, Math.floor(c / size) - up) / spanCells);
    if (m === 0) return 0.3 + 1.2 * far;
    let w = m === 15 ? 0.6 : m === 5 || m === 10 ? 2 : [3, 6, 12, 9].includes(m) ? 0.8 : 1.2;
    for (let d = 0; d < 4; d++) if ((m >> d) & 1) w *= 1 - 0.6 * Math.min(1, armGrade[c * 4 + d] / STREET_GRADE);
    return w;
  };
  const solved = solve({ size, exists, edges, allowed, weight, start }, seed ^ 0x51ed270b);
  const arms = solved.arms;

  // Rule 3: only roads connected to the plaza stay. Arms that lead nowhere (left by a failed
  // collapse) are dropped too.
  for (let c = 0; c < cellCount; c++) {
    for (let d = 0; d < 4; d++) {
      if (!((arms[c] >> d) & 1) || edges[c * 4 + d] !== "shared") continue;
      const nb = neighborCell(c, d);
      if (nb < 0 || !((arms[nb] >> ((d + 2) & 3)) & 1)) arms[c] &= ~(1 << d);
    }
  }
  const reached = new Uint8Array(cellCount);
  const stack = [start];
  reached[start] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    for (let d = 0; d < 4; d++) {
      if (!((arms[c] >> d) & 1)) continue;
      const nb = neighborCell(c, d);
      if (nb < 0 || reached[nb] || edges[c * 4 + d] !== "shared") continue;
      reached[nb] = 1;
      stack.push(nb);
    }
  }
  for (let c = 0; c < cellCount; c++) if (!reached[c]) arms[c] = 0;

  // Tiles to streets: polylines through cell centers and edge midpoints, from node to node.
  const degree = (c: number) => ((arms[c] & 1) + ((arms[c] >> 1) & 1) + ((arms[c] >> 2) & 1) + ((arms[c] >> 3) & 1));
  const cellNode = new Map<number, number>();
  const nodeAt = (c: number) => {
    if (!cellNode.has(c)) {
      const q = centerOf(c);
      cellNode.set(c, graph.addNode(q.x, q.z));
    }
    return cellNode.get(c)!;
  };
  const isNode = (c: number) => c === start || degree(c) !== 2;
  const walked = new Uint8Array(cellCount * 4);
  const midOf = (c: number, d: number): P2 => {
    const o = centerOf(c);
    return { x: o.x + DX[d] * reach, z: o.z + DZ[d] * reach };
  };
  const walk = (from: number, d0: number) => {
    const pts: P2[] = [];
    const startNode = from === start ? sides[d0].node : nodeAt(from);
    pts.push(from === start ? { x: sides[d0].x, z: sides[d0].z } : centerOf(from));
    let main = false;
    let cur = from;
    let d = d0;
    for (;;) {
      walked[cur * 4 + d] = 1;
      if (mainEdges.has(cur * 4 + d)) main = true;
      if (edges[cur * 4 + d] === "open") {
        // An exit: straight on to the diorama's edge.
        const o = centerOf(cur);
        const t = d === 0 ? n - 1 - o.x : d === 1 ? n - 1 - o.z : d === 2 ? o.x : o.z;
        pts.push({ x: o.x + DX[d] * t, z: o.z + DZ[d] * t });
        return graph.addEdge(startNode, graph.addNode(pts[pts.length - 1].x, pts[pts.length - 1].z), pts, "main", streetWidth);
      }
      const nb = neighborCell(cur, d);
      walked[nb * 4 + ((d + 2) & 3)] = 1;
      if (cur !== start && nb !== start) pts.push(midOf(cur, d));
      if (nb === start) {
        pts.push({ x: sides[(d + 2) & 3].x, z: sides[(d + 2) & 3].z });
        return graph.addEdge(startNode, sides[(d + 2) & 3].node, pts, main ? "main" : "street", streetWidth);
      }
      pts.push(centerOf(nb));
      if (isNode(nb)) return graph.addEdge(startNode, nodeAt(nb), pts, main ? "main" : "street", streetWidth);
      cur = nb;
      d = [0, 1, 2, 3].find((e) => e !== ((d + 2) & 3) && (arms[nb] >> e) & 1)!;
    }
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let c = 0; c < cellCount; c++) {
      if (!arms[c] || (pass === 0 && !isNode(c))) continue;
      for (let d = 0; d < 4; d++) if ((arms[c] >> d) & 1 && !walked[c * 4 + d]) walk(c, d);
    }
  }
  const tileCells = Array.from({ length: cellCount }, (_, c) => c).filter((c) => arms[c]).map(centerOf);

  // 5. Levels: junctions relaxed until every street can reach both its ends within the grade.
  const live = graph.edges.filter((e) => e.alive);
  for (const N of graph.nodes) if (!N.fixed) N.level = groundAt(N.x, N.z);
  const lengths = live.map((e) => polylineLength(e.pts));
  for (let pass = 0; pass < LEVEL_PASSES; pass++) {
    let moved = false;
    live.forEach((e, i) => {
      const A = graph.nodes[e.a];
      const B = graph.nodes[e.b];
      const excess = Math.abs(A.level - B.level) - (e.kind === "main" ? MAX_GRADE : STREET_GRADE) * lengths[i];
      if (excess <= 1e-3 || (A.fixed && B.fixed)) return;
      const sign = Math.sign(A.level - B.level);
      if (A.fixed) B.level += sign * excess;
      else if (B.fixed) A.level -= sign * excess;
      else {
        A.level -= (sign * excess) / 2;
        B.level += (sign * excess) / 2;
      }
      moved = true;
    });
    if (!moved) break;
  }
  for (const N of graph.nodes) N.level = Math.round(N.level);

  // Street profiles, pinned to their junctions and held within the grade.
  const ordered = [...live].sort((p, q) => (p.kind === q.kind ? 0 : p.kind === "main" ? -1 : 1));
  const streets: Street[] = ordered.map((e) => {
    const curve = centripetalCurve(e.pts, 1);
    const level = smoothProfile(Float32Array.from(curve, (q) => groundAt(q.x, q.z)), 6, 3);
    level[0] = graph.nodes[e.a].level;
    level[level.length - 1] = graph.nodes[e.b].level;
    const grade = e.kind === "main" ? MAX_GRADE : STREET_GRADE;
    const span = (i: number, j: number) => grade * Math.hypot(curve[i].x - curve[j].x, curve[i].z - curve[j].z);
    for (let i = 1; i < level.length - 1; i++) level[i] = Math.min(level[i - 1] + span(i, i - 1), Math.max(level[i - 1] - span(i, i - 1), level[i]));
    for (let i = level.length - 2; i > 0; i--) level[i] = Math.min(level[i + 1] + span(i, i + 1), Math.max(level[i + 1] - span(i, i + 1), level[i]));
    // Inside the plaza, the street is at the plaza's level.
    curve.forEach((q, i) => inPlaza(q) && (level[i] = plaza.level));
    for (let i = 0; i < level.length; i++) level[i] = Math.round(level[i]);
    return { kind: e.kind, curve, level, width: e.width };
  });

  // 6. The carve: junctions, then streets in order; the first to pave a column keeps it.
  const junctions: P2[] = [];
  graph.nodes.forEach((N, i) => {
    if (plazaNodes.has(i)) return;
    const meeting = live.filter((e) => e.a === i || e.b === i);
    if (meeting.length < 2) return;
    if (meeting.length >= 3) junctions.push({ x: N.x, z: N.z });
    const width = Math.max(...meeting.map((e) => e.width));
    // A square pad (on the voxel grid) as wide as the widest street meeting here.
    forSquare(Math.round(N.x), Math.round(N.z), width / 2, 0, n, (k) => {
      if (blocked(k) || claim[k] === CLAIM.plaza || claim[k] === CLAIM.road) return;
      h[k] = N.level;
      claim[k] = CLAIM.road;
    });
  });
  const verge = voxels(VERGE);
  for (const st of streets) {
    const halfWidth = st.width / 2;
    let deepest = 0;
    st.curve.forEach((q, i) => (deepest = Math.max(deepest, Math.abs(h[Math.round(q.z) * n + Math.round(q.x)] - st.level[i]))));
    const bank = Math.min(voxels(MAX_EMBANKMENT), Math.max(voxels(EMBANKMENT), (deepest + 2) * BANK_RUN));
    const near = distanceToCurveLocal(st.curve, st.level, halfWidth + Math.max(bank, verge) + 1, n);
    for (let i = 0; i < near.dist.length; i++) {
      const d = near.dist[i];
      const k = (near.z0 + Math.floor(i / near.w)) * n + near.x0 + (i % near.w);
      if (d === Infinity || blocked(k) || claim[k] === CLAIM.plaza || claim[k] === CLAIM.road) continue;
      const lvl = Math.round(near.levelAt[i]);
      if (d <= halfWidth) {
        h[k] = lvl;
        claim[k] = CLAIM.road;
        continue;
      }
      h[k] = embank(h[k], lvl, d - halfWidth);
      if (d <= halfWidth + verge && claim[k] === CLAIM.free) claim[k] = CLAIM.verge;
    }
  }

  // Small unpaved pockets enclosed by paving (leftovers where streets meet the plaza or each other at
  // an angle) are paved over as small squares. Each search has its own marks, so a large open area
  // is never mistaken for a pocket.
  const isPaved = (k: number) => claim[k] === CLAIM.road || claim[k] === CLAIM.plaza;
  const done = new Uint8Array(n * n);
  const mark = new Int32Array(n * n);
  const maxPocket = POCKET / (VOXEL_M * VOXEL_M);
  let search = 0;
  for (let k0 = 0; k0 < n * n; k0++) {
    if (done[k0] || isPaved(k0) || blocked(k0)) continue;
    // Only unpaved columns next to paving can start a pocket.
    const x0 = k0 % n;
    if (!((x0 > 0 && isPaved(k0 - 1)) || (x0 < n - 1 && isPaved(k0 + 1)) || (k0 >= n && isPaved(k0 - n)) || (k0 < n * (n - 1) && isPaved(k0 + n)))) continue;
    search++;
    const pocket = [k0];
    mark[k0] = search;
    let enclosed = true;
    for (let i = 0; i < pocket.length && enclosed && pocket.length <= maxPocket; i++) {
      const k = pocket[i];
      const x = k % n;
      const z = (k - x) / n;
      if (x === 0 || z === 0 || x === n - 1 || z === n - 1) enclosed = false;
      for (const nk of [x > 0 ? k - 1 : -1, x < n - 1 ? k + 1 : -1, z > 0 ? k - n : -1, z < n - 1 ? k + n : -1]) {
        if (nk < 0 || mark[nk] === search || isPaved(nk)) continue;
        if (blocked(nk)) enclosed = false;
        mark[nk] = search;
        pocket.push(nk);
      }
    }
    if (!enclosed || pocket.length > maxPocket) {
      // Everything reached belongs to a large or open area, so none of it can be a pocket.
      for (const k of pocket) done[k] = 1;
      continue;
    }
    for (const k of pocket) {
      done[k] = 1;
      const around = [k - 1, k + 1, k - n, k + n].filter((j) => j >= 0 && j < n * n && isPaved(j)).map((j) => h[j]);
      if (around.length) h[k] = Math.min(...around);
      claim[k] = CLAIM.road;
    }
  }

  // 7. The blocks between the streets, smoothed.
  smoothBlocks(h, claim, n);

  // 8. Curbs: paving (street or plaza) that borders unpaved ground is raised one voxel, so streets
  // and the plaza are edged by a curb, open wherever paving meets paving.
  const paved = (k: number) => claim[k] === CLAIM.road || claim[k] === CLAIM.plaza;
  const curb = new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (!paved(k)) continue;
      if ((x > 0 && !paved(k - 1)) || (x < n - 1 && !paved(k + 1)) || (z > 0 && !paved(k - n)) || (z < n - 1 && !paved(k + n))) {
        curb[k] = 1;
        h[k] += CURB;
      }
    }
  }
  return { h, claims, curb, plazas: [plaza], streets, junctions, tiles: { centers: tileCells, size: tile } };
}

/* ---------- Helpers ---------- */

/**
 * Calls `visit(k, d)` for every column of the axis-aligned square with half-side `half` around
 * (x, z), and of a band `rim` wide around it; `d` is 0 inside and the distance to the square
 * outside.
 */
/**
 * Smooths the ground between the streets: the smoothest surface (a membrane, Laplace's equation)
 * held at the paving's levels (streets, sidewalks, plaza) and the river's, and, away from the
 * paving, pulled back toward the ground as it was, fully so by WILD_REACH. Solved coarse to fine
 * (Gauss-Seidel on a pyramid of grids), then rounded to whole voxels.
 */
function smoothBlocks(h: Float32Array, claim: Uint8Array, n: number) {
  const WILD = 1000;
  const paved = (c: number) => c === CLAIM.road || c === CLAIM.verge || c === CLAIM.plaza;
  const held = (c: number) => paved(c) || c === CLAIM.river || c === CLAIM.bank;
  // Distance (columns) from the paving: a two-pass chamfer.
  const dist = new Float32Array(n * n).fill(1e9);
  for (let k = 0; k < n * n; k++) if (paved(claim[k])) dist[k] = 0;
  const D = Math.SQRT2;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      let d = dist[k];
      if (x > 0 && dist[k - 1] + 1 < d) d = dist[k - 1] + 1;
      if (z > 0) {
        if (dist[k - n] + 1 < d) d = dist[k - n] + 1;
        if (x > 0 && dist[k - n - 1] + D < d) d = dist[k - n - 1] + D;
        if (x < n - 1 && dist[k - n + 1] + D < d) d = dist[k - n + 1] + D;
      }
      dist[k] = d;
    }
  }
  for (let z = n - 1; z >= 0; z--) {
    for (let x = n - 1; x >= 0; x--) {
      const k = z * n + x;
      let d = dist[k];
      if (x < n - 1 && dist[k + 1] + 1 < d) d = dist[k + 1] + 1;
      if (z < n - 1) {
        if (dist[k + n] + 1 < d) d = dist[k + n] + 1;
        if (x < n - 1 && dist[k + n + 1] + D < d) d = dist[k + n + 1] + D;
        if (x > 0 && dist[k + n - 1] + D < d) d = dist[k + n - 1] + D;
      }
      dist[k] = d;
    }
  }
  // How strongly each column keeps its own height (Infinity: held).
  const keep = new Float32Array(n * n);
  const r0 = voxels(BLOCK_REACH);
  const r1 = voxels(WILD_REACH);
  for (let k = 0; k < n * n; k++) keep[k] = held(claim[k]) ? Infinity : WILD * smoothstep(r0, r1, dist[k]);

  // The pyramid: each level half the last; a cell is held if any column in it is (at their mean).
  const levels: { m: number; target: Float32Array; keep: Float32Array }[] = [{ m: n, target: h, keep }];
  while (levels[levels.length - 1].m > 64) {
    const f = levels[levels.length - 1];
    const m = Math.ceil(f.m / 2);
    const target = new Float32Array(m * m);
    const kp = new Float32Array(m * m);
    for (let z = 0; z < m; z++) {
      for (let x = 0; x < m; x++) {
        let sum = 0;
        let weight = 0;
        let count = 0;
        let fixedSum = 0;
        let fixed = 0;
        for (let j = 0; j < 4; j++) {
          const X = x * 2 + (j & 1);
          const Z = z * 2 + (j >> 1);
          if (X >= f.m || Z >= f.m) continue;
          const i = Z * f.m + X;
          if (f.keep[i] === Infinity) {
            fixedSum += f.target[i];
            fixed++;
          } else {
            sum += f.target[i];
            weight += f.keep[i];
            count++;
          }
        }
        target[z * m + x] = fixed ? fixedSum / fixed : sum / count;
        kp[z * m + x] = fixed ? Infinity : weight / count;
      }
    }
    levels.push({ m, target, keep: kp });
  }
  // Coarsest first; each finer level starts from the one below and is relaxed a little (over-relaxed
  // Gauss-Seidel), only where the ground is free to move.
  let value: Float32Array | null = null;
  for (let l = levels.length - 1; l >= 0; l--) {
    const { m, target, keep: kp } = levels[l];
    const v = target.slice();
    const free: number[] = [];
    for (let k = 0; k < m * m; k++) if (kp[k] < WILD) free.push(k);
    if (value) {
      const c = levels[l + 1].m;
      for (const k of free) v[k] = value[Math.min(c - 1, ((k / m) | 0) >> 1) * c + Math.min(c - 1, (k % m) >> 1)];
    }
    const passes = l === levels.length - 1 ? 300 : 24;
    for (let pass = 0; pass < passes; pass++) {
      for (const k of free) {
        const x = k % m;
        let sum = 0;
        let count = 0;
        if (x > 0) (sum += v[k - 1]), count++;
        if (x < m - 1) (sum += v[k + 1]), count++;
        if (k >= m) (sum += v[k - m]), count++;
        if (k < m * (m - 1)) (sum += v[k + m]), count++;
        const w = kp[k];
        v[k] += ((sum + w * target[k]) / (count + w) - v[k]) * 1.6;
      }
    }
    value = v;
  }
  for (let k = 0; k < n * n; k++) if (keep[k] < WILD) h[k] = Math.round(value![k]);
}

function forSquare(x: number, z: number, half: number, rim: number, n: number, visit: (k: number, d: number) => void) {
  const r = Math.ceil(half + rim);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const X = x + dx;
      const Z = z + dz;
      if (X < 0 || Z < 0 || X >= n || Z >= n) continue;
      const d = Math.hypot(Math.max(0, Math.abs(dx) - half), Math.max(0, Math.abs(dz) - half));
      if (d <= rim) visit(Z * n + X, d);
    }
  }
}

/** A column `d` columns out from a street or plaza edge at `level`: blended back to its own height across an embankment that widens with the depth of the cut or fill. */
function embank(height: number, level: number, d: number): number {
  const width = Math.min(voxels(MAX_EMBANKMENT), Math.max(voxels(EMBANKMENT), Math.abs(height - level) * BANK_RUN));
  return d >= width ? height : level + (height - level) * smoothstep(0, 1, d / width);
}

/**
 * Where a plaza square goes: as near (x, z) as possible, within `shift` meters, with every column
 * on its border at least PLAZA_CLEARANCE from the river channel (the river crosses the whole map,
 * so a clear border means a clear square) and its center on the city's side of the river. Null
 * if it doesn't fit.
 */
function placePlaza(x: number, z: number, half: number, shift: number, n: number, claims: Claims, hubs: Hubs): P2 | null {
  const clearance = voxels(PLAZA_CLEARANCE);
  const reach = Math.ceil(half);
  const fits = (px: number, pz: number) => {
    if (px - reach < 0 || pz - reach < 0 || px + reach >= n || pz + reach >= n) return false;
    if (!hubs.side[Math.floor(pz / CELL) * hubs.cells + Math.floor(px / CELL)]) return false;
    for (let t = -reach; t <= reach; t++) {
      for (const [bx, bz] of [[px + t, pz - reach], [px + t, pz + reach], [px - reach, pz + t], [px + reach, pz + t]]) {
        if (claims.riverDist[bz * n + bx] < clearance) return false;
      }
    }
    return true;
  };
  const range = Math.ceil(voxels(shift));
  const offsets: [number, number][] = [];
  for (let dz = -range; dz <= range; dz += 4) for (let dx = -range; dx <= range; dx += 4) offsets.push([dx, dz]);
  offsets.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  for (const [dx, dz] of offsets) if (fits(x + dx, z + dz)) return { x: x + dx, z: z + dz };
  return null;
}

/** Box blur (3 × 3) over a cells × cells grid, `passes` times. */
function blur(values: Float32Array, cells: number, passes: number): Float32Array {
  let current = values;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(current.length);
    for (let cz = 0; cz < cells; cz++) {
      for (let cx = 0; cx < cells; cx++) {
        let sum = 0;
        let count = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const z = cz + dz;
            if (x < 0 || z < 0 || x >= cells || z >= cells) continue;
            sum += current[z * cells + x];
            count++;
          }
        }
        next[cz * cells + cx] = sum / count;
      }
    }
    current = next;
  }
  return current;
}

/** Bilinear sample of a cells × cells grid at fractional cell coordinates. */
function sampleCells(values: Float32Array, cells: number, fx: number, fz: number): number {
  const x = Math.min(cells - 1, Math.max(0, fx));
  const z = Math.min(cells - 1, Math.max(0, fz));
  const x0 = Math.min(cells - 2, Math.floor(x));
  const z0 = Math.min(cells - 2, Math.floor(z));
  const tx = x - x0;
  const tz = z - z0;
  const k = z0 * cells + x0;
  const a = values[k] + (values[k + 1] - values[k]) * tx;
  const b = values[k + cells] + (values[k + cells + 1] - values[k + cells]) * tx;
  return a + (b - a) * tz;
}
