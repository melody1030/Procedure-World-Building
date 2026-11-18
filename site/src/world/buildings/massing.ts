import { m, whole, type Side } from "./kit";

/**
 * The building grammar's massing (docs/plans/building-grammar-plan.md, M3): the footprint's plan
 * and the stages it rises in, as rectangles, and the outline the facades are built along.
 *
 * Pure geometry in voxels, x along the street front, z back from it; the street is at z = depth.
 */

export type Shape = "bar" | "l" | "u" | "stepped";
export const SHAPES: { value: Shape; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "l", label: "L" },
  { value: "u", label: "U (light court)" },
  { value: "stepped", label: "Stepped" },
];

/** A rectangle in plan: [x0, z0, x1, z1]. */
export type Rect = [number, number, number, number];

/**
 * An exposed stretch of a stage's outline, as a Side (kit.ts) with which way it faces, 0 +z (the
 * street), 1 +x, 2 −z, 3 −x, and whether the outline turns outward (a convex corner) or inward
 * (a concave one) at its start and end. Edges run head to tail, so each corner ends one edge and
 * starts the next.
 */
export interface Edge {
  side: Side;
  dir: 0 | 1 | 2 | 3;
  convex: [boolean, boolean];
  /** Where the edge's line lies (z for dirs 0 and 2, x for 1 and 3), and its span along the other axis. */
  line: number;
  span: [number, number];
}

/** One stage: its plan and its floors [j0, j1). */
export interface Stage {
  rects: Rect[];
  j0: number;
  j1: number;
  /** How far it steps in from the footprint's outer edge, in voxels (0 for the first). */
  inset: number;
}

export interface Massing {
  /** The shape built: a court shape on too small a footprint falls back to a bar. */
  shape: Shape;
  /** The wings' depth for L and U, in voxels. */
  wing: number;
  stages: Stage[];
}

/** The smallest a wing, a court and a stage's plan may be, in meters. */
const MIN_WING = 6;
const MIN_COURT = 4;
const MIN_PLAN = 6;

/** Down to a whole voxel: the stages' plans stay on the voxels' grid. */
const down = (v: number) => Math.floor(v);

/** Stepped rises in this many stages, each this far back from the one below (meters). */
export const STEPPED_STAGES = 3;
export const STEPPED_SETBACK = 2;

/**
 * The plan and the stages for a footprint of W × D voxels:
 * - Bar, L and U rise in one stage. L and U are wings of one depth round a court open to the
 *   street.
 * - Stepped rises in STEPPED_STAGES stages, each STEPPED_SETBACK m back from the street front, so
 *   its terraces face the street. The floors split evenly between them, the lower ones taking any
 *   left over.
 */
export function massing(shape: Shape, W: number, D: number, floors: number): Massing {
  // The wings' depth, then whether the court shape fits; if not, a bar.
  let wing = whole(Math.min(12, Math.max(MIN_WING, Math.round(Math.min(W, D) * 0.25 * 0.35 * 2) / 2)));
  const fits = (t: number) =>
    shape === "l" ? W >= t + m(MIN_COURT) && D >= t + m(MIN_COURT) : shape === "u" ? W >= 2 * t + m(MIN_COURT) && D >= t + m(MIN_COURT) : true;
  if (!fits(wing)) wing = whole(MIN_WING);
  const built: Shape = fits(wing) ? shape : "bar";
  const setback = m(STEPPED_SETBACK);

  // How many stages, and their floors.
  const count = built === "stepped" ? Math.min(STEPPED_STAGES, floors) : 1;
  const split = even(floors, count);

  // How far back a stage may step before it gets too shallow.
  const most = D - m(MIN_PLAN);
  const stages: Stage[] = [];
  let j0 = 0;
  // A step under a meter (where a stage meets its limit) leaves too narrow a terrace for a
  // parapet with anything above it, so the stage keeps the size of the one below instead.
  let prev = 0;
  for (let i = 0; i < count; i++) {
    const j1 = j0 + split[i];
    const want = down(Math.max(0, Math.min(most, i * setback)));
    const inset = want - prev < m(1) ? prev : want;
    prev = inset;
    stages.push({ rects: plan(built, W, D, wing, inset), j0, j1, inset });
    j0 = j1;
  }
  return { shape: built, wing, stages };
}

function even(total: number, parts: number): number[] {
  return Array.from({ length: parts }, (_, i) => Math.floor(total / parts) + (i < total % parts ? 1 : 0));
}

/** A shape's rectangles; Stepped's street side steps back by `s`. */
function plan(shape: Shape, W: number, D: number, t: number, s: number): Rect[] {
  switch (shape) {
    // The L and the U: a wing along the back, and wings reaching from it to the street, so the
    // court opens onto the street.
    case "l":
      return [
        [0, 0, W, t],
        [0, t, t, D],
      ];
    case "u":
      return [
        [0, 0, W, t],
        [0, t, t, D],
        [W - t, t, W, D],
      ];
    case "stepped":
      return [[0, 0, W, D - s]];
    default:
      return [[0, 0, W, D]];
  }
}

const EPS = 0.01;
const inside = (rects: Rect[], x: number, z: number) => rects.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

/**
 * The parts of a line, from `from` to `to`, where `keep` holds at the midpoint, cut at `cuts`.
 * Neighboring kept parts are merged.
 */
export function stretches(from: number, to: number, cuts: number[], keep: (at: number) => boolean): [number, number][] {
  const at = [...new Set([from, to, ...cuts.filter((c) => c > from + EPS && c < to - EPS)])].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < at.length; i++) {
    if (!keep((at[i] + at[i + 1]) / 2)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - at[i]) < EPS) last[1] = at[i + 1];
    else out.push([at[i], at[i + 1]]);
  }
  return out;
}

/** The outline of a plan made of rectangles: the stretches of their sides that face out. */
export function outline(rects: Rect[]): Edge[] {
  const xs = rects.flatMap(([x0, , x1]) => [x0, x1]);
  const zs = rects.flatMap(([, z0, , z1]) => [z0, z1]);
  // Each rectangle's sides, less where another rectangle lies against them, gathered by line.
  const lines = new Map<string, { dir: 0 | 1 | 2 | 3; line: number; parts: [number, number][] }>();
  const add = (dir: 0 | 1 | 2 | 3, line: number, parts: [number, number][]) => {
    const key = `${dir}:${line}`;
    const entry = lines.get(key) ?? { dir, line, parts: [] };
    entry.parts.push(...parts);
    lines.set(key, entry);
  };
  for (const [x0, z0, x1, z1] of rects) {
    add(0, z1, stretches(x0, x1, xs, (x) => !inside(rects, x, z1 + EPS)));
    add(2, z0, stretches(x0, x1, xs, (x) => !inside(rects, x, z0 - EPS)));
    add(1, x1, stretches(z0, z1, zs, (z) => !inside(rects, x1 + EPS, z)));
    add(3, x0, stretches(z0, z1, zs, (z) => !inside(rects, x0 - EPS, z)));
  }
  const edges: Edge[] = [];
  for (const { dir, line, parts } of lines.values()) {
    parts.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const p of parts) {
      const last = merged[merged.length - 1];
      if (last && p[0] <= last[1] + EPS) last[1] = Math.max(last[1], p[1]);
      else merged.push([p[0], p[1]]);
    }
    for (const span of merged) edges.push(edge(rects, dir, line, span));
  }
  return edges;
}

/** An edge's Side, oriented as kit.ts `sides` orients a box's: counter-clockwise seen from above. */
function edge(rects: Rect[], dir: 0 | 1 | 2 | 3, line: number, [a, b]: [number, number]): Edge {
  const length = b - a;
  const side: Side =
    dir === 0
      ? { ox: a, oz: line, ux: 1, uz: 0, nx: 0, nz: 1, length }
      : dir === 1
        ? { ox: line, oz: b, ux: 0, uz: -1, nx: 1, nz: 0, length }
        : dir === 2
          ? { ox: b, oz: line, ux: -1, uz: 0, nx: 0, nz: -1, length }
          : { ox: line, oz: a, ux: 0, uz: 1, nx: -1, nz: 0, length };
  // A corner is concave if the mass goes on past it, just inside the wall line.
  const past = (along: number) => {
    const px = side.ox + side.ux * along - side.nx * EPS;
    const pz = side.oz + side.uz * along - side.nz * EPS;
    return inside(rects, px, pz);
  };
  return { side, dir, line, span: [a, b], convex: [!past(-EPS), !past(length + EPS)] };
}

/**
 * How far a band laid along an edge reaches past its ends, for a band spanning `o0` to `o1` out
 * from the wall line (negative is into the wall). The bands round an outline then meet at every
 * corner without overlapping or leaving a notch: the edges facing ±z own the corners.
 */
export function reach(e: Edge, o0: number, o1: number): [number, number] {
  const own = e.dir % 2 === 0;
  const at = (convex: boolean) => (convex ? (own ? o1 : o0) : own ? -o0 : -o1);
  return [at(e.convex[0]), at(e.convex[1])];
}
