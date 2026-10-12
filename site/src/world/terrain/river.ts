import { centripetalCurve, distanceToCurve, neverRising, smoothProfile, type P2 } from "../path";
import { Rng, hash2 } from "../rng";
import { voxels } from "../scale";
import type { HeightMap } from "./heights";
import type { TerrainParams } from "./params";

/**
 * Stage 6, river valley: a path across the diorama, from one edge (the source) to the opposite
 * one (the mouth), carved into the height map. The seed picks the direction. It runs after the
 * terrain is finished (terraces go before it), so it carves the final ground.
 *
 * 1. Terrain → path: control points are spaced evenly from the source edge to the mouth edge. The
 *    first sits on the lowest ground near a seeded spot on the source edge; each next one moves
 *    sideways (up to half the gap between points) to the lowest ground within reach. Points
 *    dragged by hand replace these.
 * 2. The curve: a centripetal Catmull-Rom spline through them, sampled about every column.
 * 3. Water level, done the way real rivers behave: level across the channel, falling along it.
 *    - At each sample, the ground is the *lowest* across the whole channel plus a column of bank
 *      each side, not just under the center. So the water can never stand above either bank.
 *    - That profile is smoothed, kept under the ground, and made to only fall (running minimum).
 *    - Steady descent: the running minimum is flat for long stretches, then drops at once. Each
 *      drop is spread back along the flat stretch before it (up to 0.75 m), so the river keeps
 *      falling gently. Bigger drops keep the rest as a fall: a waterfall at a terrace edge.
 *    - Finally no water cell may stand above a dry neighbor: at bends, where the carve and the
 *      level can disagree, the water is lowered to the bank.
 * 4. Path → terrain: for every column near the curve, the distance to it. Inside the channel
 *    the ground drops to the bed, below the water; across the valley it
 *    blends back up to the original ground. Ground is only ever lowered, and never below one
 *    voxel above the plinth.
 *
 * Distances come from `distanceToCurve` (path.ts), shared with the streets.
 */

export interface RiverPath {
  /** Control points, in columns. */
  control: P2[];
  /** The curve, in columns, about one sample per column. */
  curve: P2[];
  /** Water level at each curve sample, in voxels. */
  level: Float32Array;
  /** Length in columns. */
  length: number;
}

export interface River {
  /** The height map after carving (the input map itself when the river is off). */
  h: Float32Array;
  /** Water surface per column in voxels, NaN where there is none; null when water is off. */
  water: Float32Array | null;
  /** 1 for columns inside the river channel; null when the river is off. */
  channel: Uint8Array | null;
  path: RiverPath | null;
}

/** Columns kept clear of the diorama's side edges. */
const MARGIN = 12;
/** How far each automatic point may move sideways, as a share of the gap between points. */
const WANDER = 0.5;
/** Smoothing passes on the water level before it is made to only fall. */
const SMOOTHING = 4;
/** Columns of bank checked beyond each side of the channel when finding the water level. */
const BANK = 2;
/** The most of each drop spread back along the flat stretch before it (0.75 m); the rest stays a fall. */
const SPREAD = voxels(0.75);

type Side = "north" | "east" | "south" | "west";
const SIDES: Side[] = ["north", "east", "south", "west"];

/** Maps (along, across) to (x, z): `along` runs from the source edge (0) to the mouth edge (n − 1), which faces `mouth`. */
function frame(mouth: Side, n: number) {
  const last = n - 1;
  switch (mouth) {
    case "north":
      return (a: number, b: number): P2 => ({ x: b, z: last - a });
    case "south":
      return (a: number, b: number): P2 => ({ x: b, z: a });
    case "west":
      return (a: number, b: number): P2 => ({ x: last - a, z: b });
    case "east":
      return (a: number, b: number): P2 => ({ x: a, z: b });
  }
}

export function buildRiver(seed: number, map: HeightMap, p: TerrainParams["river"]): River {
  if (!p.enabled) return { h: map.h, water: null, channel: null, path: null };
  const { n } = map;
  const rng = new Rng(seed ^ 0x7f4a7c15);
  const toXZ = frame(SIDES[Math.floor(hash2(seed, 0, 77) * 4)], n);
  const ground = (q: P2) => {
    const x = Math.min(n - 1, Math.max(0, Math.round(q.x)));
    const z = Math.min(n - 1, Math.max(0, Math.round(q.z)));
    return map.h[z * n + x];
  };
  const clampB = (b: number) => Math.min(n - 1 - MARGIN, Math.max(MARGIN, b));

  // 1. Control points: placed by hand, or by the low-ground rule.
  const control = p.control && p.control.length === p.points ? p.control.map((q) => ({ ...q })) : autoControl(p.points, n, ground, toXZ, clampB, rng);

  // 2. The curve.
  const curve = centripetalCurve(control, 1);
  const samples = curve.length;
  const along = new Float32Array(samples);
  for (let i = 1; i < samples; i++) along[i] = along[i - 1] + Math.hypot(curve[i].x - curve[i - 1].x, curve[i].z - curve[i - 1].z);
  const length = along[samples - 1] || 1;

  // 3. Water level: the lowest ground across the channel, smoothed, only falling, falling steadily.
  const half = voxels(p.width) / 2;
  const across = Math.ceil(half) + BANK;
  const g = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const a = curve[Math.max(0, i - 1)];
    const b = curve[Math.min(samples - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const px = -(b.z - a.z) / len;
    const pz = (b.x - a.x) / len;
    let lowest = Infinity;
    for (let o = -across; o <= across; o++) lowest = Math.min(lowest, ground({ x: curve[i].x + px * o, z: curve[i].z + pz * o }));
    g[i] = lowest;
  }
  const smooth = smoothProfile(g, 6, SMOOTHING);
  for (let i = 0; i < samples; i++) smooth[i] = Math.min(smooth[i], g[i]);
  const level = steadyDescent(neverRising(smooth), SPREAD);

  // 4. Distance from every nearby column to the curve, with the level at the nearest point.
  const valley = voxels(p.valleyWidth);
  const reachMax = half + valley + 1;
  const { dist, levelAt } = distanceToCurve(curve, level, reachMax, n);

  // Carve: channel down to the bed, valley sides blending back to the original ground.
  const h = map.h.slice();
  const water = p.water ? new Float32Array(n * n).fill(NaN) : null;
  const channel = new Uint8Array(n * n);
  const depth = voxels(p.depth);
  const exponent = 1 + 4 * p.valleyShape;
  for (let k = 0; k < n * n; k++) {
    const d = dist[k];
    if (d === Infinity) continue;
    const lvl = levelAt[k];
    let target: number;
    if (d <= half) {
      target = lvl - depth;
      channel[k] = 1;
      if (water && lvl >= 1) water[k] = lvl;
    } else if (d < half + valley) {
      target = lvl + (h[k] - lvl) * Math.pow((d - half) / valley, exponent);
    } else continue;
    h[k] = Math.max(1, Math.min(h[k], target));
  }

  // Banks: no water above a dry neighbor. Where the carve and the level disagree at a bend, the
  // water there is lowered to its lowest dry neighbor (or disappears if that is below its bed).
  if (water) {
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const k = z * n + x;
        if (Number.isNaN(water[k])) continue;
        let w = water[k];
        if (x > 0 && !channel[k - 1]) w = Math.min(w, h[k - 1]);
        if (x < n - 1 && !channel[k + 1]) w = Math.min(w, h[k + 1]);
        if (z > 0 && !channel[k - n]) w = Math.min(w, h[k - n]);
        if (z < n - 1 && !channel[k + n]) w = Math.min(w, h[k + n]);
        water[k] = w;
      }
    }
  }

  return { h, water, channel, path: { control, curve, level, length } };
}

/** The automatic control points: from a seeded spot on the source edge, each next point on the lowest ground within reach. */
function autoControl(count: number, n: number, ground: (q: P2) => number, toXZ: (a: number, b: number) => P2, clampB: (b: number) => number, rng: Rng): P2[] {
  const gap = (n - 1) / (count - 1);
  const reach = WANDER * gap;
  const control: P2[] = [];
  // The source: the lowest ground on the source edge near a seeded spot in its middle half.
  let b = clampB((0.25 + 0.5 * rng.next()) * (n - 1));
  let best = Infinity;
  const center = b;
  for (let k = -10; k <= 10; k++) {
    const candidate = clampB(center + k * n * 0.01);
    const cost = ground(toXZ(2, candidate)) + rng.next() * 0.5;
    if (cost < best) {
      best = cost;
      b = candidate;
    }
  }
  control.push(toXZ(0, b));
  for (let i = 1; i < count; i++) {
    const a = i * gap;
    best = Infinity;
    let next = b;
    for (let k = -5; k <= 5; k++) {
      const candidate = clampB(b + (reach * k) / 5);
      const cost = ground(toXZ(a, candidate)) + Math.abs(candidate - b) * 0.02 + rng.next() * 0.5;
      if (cost < best) {
        best = cost;
        next = candidate;
      }
    }
    b = next;
    control.push(toXZ(a, b));
  }
  return control;
}

/**
 * Spreads each drop of a stepped, only-falling profile back along the flat stretch before it: the
 * stretch now falls steadily by up to `spread`, and anything beyond that stays a sudden drop (a
 * fall). The result is never above the input, so it stays under the ground and only falls.
 */
function steadyDescent(m: Float32Array, spread: number): Float32Array {
  const out = m.slice();
  let start = 0;
  for (let i = 1; i <= m.length; i++) {
    if (i < m.length && m[i] >= m[i - 1] - 1e-6) continue;
    // The last stretch, to the mouth, keeps falling too: going lower than the input is always safe.
    const fall = i < m.length ? Math.min(m[start] - m[i], spread) : spread;
    const run = i - start;
    for (let j = start; j < i; j++) out[j] = m[start] - fall * ((j - start) / run);
    start = i;
  }
  return out;
}
