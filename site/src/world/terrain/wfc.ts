import { Rng } from "../rng";

/**
 * Wave function collapse for the street tiles (town plan, section 4W). A grid of cells, each holding
 * one of 12 road modules: a road from the cell's center to some of its four edge midpoints.
 *
 *   directions   0 E (+x), 1 S (+z), 2 W (−x), 3 N (−z); a module is a 4-bit mask of its arms
 *   modules      empty, 2 straights, 4 corners, 4 T-junctions, 1 cross (the board's 12), then 4
 *                dead ends, which the caller allows only where a street must start (the plaza)
 *
 * Rules (from the "2D Module & Rule" board):
 *   basic   across a shared edge, both cells have a road there or neither; an edge marked blank
 *           has no road; an open edge (an exit, or the boulevard) may have one on its own
 *   rule 1  no curve onto a curve in the same direction (a U-turn), and no 2 × 2 group of cells
 *           closing a loop, so the smallest block is 2 × 3 cells
 *   rule 2  no corner joining a corner that joins a third corner of the first's module (no
 *           staircases)
 *   rule 3  the collapse starts at the start cell (the plaza) and grows outward: the next cell is
 *           always one next to the collapsed area, the one with the fewest options left, nearest
 *           the start first. (Pieces not connected to the start are erased by the caller.)
 *
 * Options are pruned by propagation (arc consistency over shared edges). Rules 1 and 2 involve
 * more than two cells, so they are checked when a cell collapses, against its collapsed
 * neighbors. If no option keeps them all, they are relaxed one at a time (Rule 2, the 2 × 2 loop,
 * Rule 1) for that cell; only a propagation contradiction restarts the collapse with the next seed.
 */

export const MODULES = [0, 5, 10, 3, 6, 12, 9, 14, 13, 11, 7, 15, 1, 2, 4, 8];
const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
const opposite = (d: number) => (d + 2) & 3;
const has = (mask: number, d: number) => (mask >> d) & 1;
const bits = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
const isCorner = (mask: number) => bits(mask) === 2 && mask !== 5 && mask !== 10;

export type EdgeKind = "shared" | "blank" | "open";

export interface WfcProblem {
  /** Cells per side. Cell (i, j) is index j · size + i. */
  size: number;
  /** 1 where a cell exists. */
  exists: Uint8Array;
  /** The kind of each cell's edge in each direction (index cell · 4 + direction). */
  edges: EdgeKind[];
  /** Allowed module indices per cell (a bitmask over MODULES), before propagation. */
  allowed: Uint16Array;
  /** Weight of module m in cell c. */
  weight: (c: number, m: number) => number;
  /** The cell the collapse starts from. */
  start: number;
}

export interface WfcResult {
  /** The module mask (arms) per cell, 0 for empty or missing cells. */
  arms: Uint8Array;
  /** How many restarts were needed; −1 if every try failed (the last try's broken cells are empty). */
  restarts: number;
}

const RESTARTS = 30;

export function solve(problem: WfcProblem, seed: number): WfcResult {
  let last: Uint8Array | null = null;
  for (let attempt = 0; attempt < RESTARTS; attempt++) {
    const result = attemptSolve(problem, new Rng(seed + attempt * 0x9e3779b1));
    if (result.ok) return { arms: result.arms, restarts: attempt };
    last = result.arms;
  }
  return { arms: last ?? new Uint8Array(problem.size * problem.size), restarts: -1 };
}

function attemptSolve(problem: WfcProblem, rng: Rng): { ok: boolean; arms: Uint8Array } {
  const { size, exists, edges, start } = problem;
  const cells = size * size;
  const domain = new Uint16Array(cells);
  const collapsed = new Int8Array(cells).fill(-1);
  const arms = new Uint8Array(cells);
  const neighbor = (c: number, d: number) => {
    const i = (c % size) + DX[d];
    const j = Math.floor(c / size) + DZ[d];
    return i < 0 || j < 0 || i >= size || j >= size || !exists[j * size + i] ? -1 : j * size + i;
  };

  // Initial domains: allowed modules whose arms only cross edges that may hold a road.
  for (let c = 0; c < cells; c++) {
    if (!exists[c]) continue;
    let mask = 0;
    MODULES.forEach((m, k) => {
      if (!((problem.allowed[c] >> k) & 1)) return;
      for (let d = 0; d < 4; d++) if (has(m, d) && edges[c * 4 + d] === "blank") return;
      mask |= 1 << k;
    });
    domain[c] = mask;
  }

  // Propagation: across shared edges, keep only options a neighbor can match.
  const armsPossible = (c: number, d: number) => {
    let road = false;
    let none = false;
    for (let k = 0; k < MODULES.length; k++) {
      if (!((domain[c] >> k) & 1)) continue;
      if (has(MODULES[k], d)) road = true;
      else none = true;
    }
    return { road, none };
  };
  const propagate = (queue: number[]): boolean => {
    while (queue.length) {
      const c = queue.pop()!;
      for (let d = 0; d < 4; d++) {
        if (edges[c * 4 + d] !== "shared") continue;
        const nb = neighbor(c, d);
        if (nb < 0) continue;
        const { road, none } = armsPossible(c, d);
        let next = domain[nb];
        for (let k = 0; k < MODULES.length; k++) {
          if (!((next >> k) & 1)) continue;
          const r = has(MODULES[k], opposite(d));
          if ((r && !road) || (!r && !none)) next &= ~(1 << k);
        }
        if (next !== domain[nb]) {
          if (!next) return false;
          domain[nb] = next;
          queue.push(nb);
        }
      }
    }
    return true;
  };
  for (let c = 0; c < cells; c++) if (exists[c] && !domain[c]) return { ok: false, arms };
  if (!propagate(Array.from({ length: cells }, (_, c) => c).filter((c) => exists[c]))) return { ok: false, arms };

  // The rules that look past one edge, checked against collapsed neighbors.
  const armsOf = (c: number) => (c >= 0 && collapsed[c] >= 0 ? MODULES[collapsed[c]] : -1);
  // `level` 3 checks every rule; 2 drops Rule 2; 1 also drops the 2 × 2 loop; 0 checks none.
  const breaksRules = (c: number, m: number, level: number): boolean => {
    if (level === 0) return false;
    for (let d = 0; d < 4; d++) {
      if (!has(m, d)) continue;
      const nb = neighbor(c, d);
      const b = armsOf(nb);
      if (b < 0) continue;
      // Rule 1: two corners joined here whose other arms point the same way (a U-turn).
      if (isCorner(m) && isCorner(b) && (m & ~(1 << d)) === (b & ~(1 << opposite(d)))) return true;
      // Rule 2: corner, corner, then the first corner's module again (a staircase), either way round.
      if (level >= 3 && isCorner(m) && isCorner(b)) {
        const e = b & ~(1 << opposite(d));
        const next = armsOf(neighbor(nb, Math.log2(e)));
        if (next === m) return true;
        for (let d2 = 0; d2 < 4; d2++) {
          if (d2 === d || !has(m, d2)) continue;
          const other = armsOf(neighbor(c, d2));
          if (other === b && isCorner(other)) return true;
        }
      }
    }
    // Rule 1, extended: no 2 × 2 group of cells closing a loop. The loop's four inner edges are
    // each known once either cell beside it has collapsed (or is the candidate), so the check fires
    // as soon as the loop is certain, not only when the last cell is decided.
    if (level < 2) return false;
    const i = c % size;
    const j = Math.floor(c / size);
    for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const at = (x: number, z: number) => (x < 0 || z < 0 || x >= size || z >= size || !exists[z * size + x] ? -2 : z * size + x);
      const tl = at(i + ox, j + oz);
      const tr = at(i + ox + 1, j + oz);
      const bl = at(i + ox, j + oz + 1);
      const br = at(i + ox + 1, j + oz + 1);
      if (tl < 0 || tr < 0 || bl < 0 || br < 0) continue;
      const maskOf = (g: number) => (g === c ? m : armsOf(g));
      // An edge between cells p (arm dp) and q (arm opposite): true or false if known, null if not.
      const edge = (p: number, dp: number, q: number) => {
        const a = maskOf(p);
        if (a >= 0) return has(a, dp) === 1;
        const b = maskOf(q);
        return b >= 0 ? has(b, opposite(dp)) === 1 : null;
      };
      if (edge(tl, 0, tr) && edge(tl, 1, bl) && edge(tr, 1, br) && edge(bl, 0, br)) return true;
    }
    return false;
  };

  // Collapse, growing outward from the start.
  const si = start % size;
  const sj = Math.floor(start / size);
  const distance = (c: number) => Math.hypot((c % size) - si, Math.floor(c / size) - sj);
  const frontier = new Set<number>([start]);
  let relaxed = 0;
  let remaining = 0;
  for (let c = 0; c < cells; c++) if (exists[c]) remaining++;
  while (remaining > 0) {
    let pick = -1;
    if (frontier.size) {
      let best = Infinity;
      for (const c of frontier) {
        const score = bits16(domain[c]) * 1000 + distance(c);
        if (score < best) {
          best = score;
          pick = c;
        }
      }
      frontier.delete(pick);
    } else {
      // Cells the collapsed area doesn't reach: take the nearest to the start.
      let best = Infinity;
      for (let c = 0; c < cells; c++) {
        if (!exists[c] || collapsed[c] >= 0) continue;
        if (distance(c) < best) {
          best = distance(c);
          pick = c;
        }
      }
    }
    if (pick < 0 || collapsed[pick] >= 0) continue;
    // Choose a module by weight among the options that keep the rules. If none does, the rules are
    // relaxed one at a time (Rule 2, then the 2 × 2 loop, then Rule 1) rather than giving up.
    let options: { k: number; w: number }[] = [];
    for (let level = 3; level >= 0 && !options.length; level--) {
      for (let k = 0; k < MODULES.length; k++) {
        if (!((domain[pick] >> k) & 1) || breaksRules(pick, MODULES[k], level)) continue;
        options.push({ k, w: problem.weight(pick, k) });
      }
      if (options.length && level < 3) relaxed++;
    }
    options = options.filter((o) => o.w > 0).length ? options.filter((o) => o.w > 0) : options;
    if (!options.length) return { ok: false, arms: finish() };
    const total = options.reduce((s, o) => s + o.w, 0);
    let r = rng.next() * total;
    let chosen = options[options.length - 1].k;
    for (const o of options) {
      r -= o.w;
      if (r <= 0) {
        chosen = o.k;
        break;
      }
    }
    collapsed[pick] = chosen;
    domain[pick] = 1 << chosen;
    remaining--;
    if (!propagate([pick])) return { ok: false, arms: finish() };
    for (let d = 0; d < 4; d++) {
      const nb = neighbor(pick, d);
      if (nb >= 0 && collapsed[nb] < 0) frontier.add(nb);
    }
  }
  void relaxed;
  return { ok: true, arms: finish() };

  function finish(): Uint8Array {
    for (let c = 0; c < cells; c++) arms[c] = collapsed[c] >= 0 ? MODULES[collapsed[c]] : 0;
    return arms;
  }
}

/** Number of set bits in a 16-bit mask. */
function bits16(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

