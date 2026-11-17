import { tierOf, type BuildingModel, type Tier } from "./config";
import { FLOOR, Kit, PAL, PROUD, m, sideBounds, sideBox, sides, type Hex, type Side } from "./kit";
import { antenna, billboard, dish, duct, garden, helipad, hvac, machine, solar, stairHut, tank } from "./parts";
import { massing, outline, reach, stretches, SHAPES, type Edge, type Rect, type Shape } from "./massing";
import { VOXEL_M } from "../scale";
import { Rng, hash2 } from "../rng";
import { lin, shade, type RGB } from "../geometry";

/**
 * The building grammar (docs/plans/building-grammar-plan.md, after Class 09's slide 21): a
 * building is not modeled but derived, rule by rule, from a few parameters and two bay patterns:
 *
 *   BUILDING -> BASE SHAFT TOP
 *   BASE     -> pier [ground pattern]+ pier  (mirrored)     h ground floor
 *   SHAFT    -> FLOOR x (floors - 1)
 *   FLOOR    -> pier [upper pattern]+ pier   (mirrored)     h 3 m, the city's storey
 *   TOP      -> parapet + rooftop gear
 *   FRONT    -> n bays x bay width
 *
 * Each letter of a pattern is one bay (BAY_NAMES). The patterns aren't typed in: they are drawn
 * from the seed (drawPatterns); the signs then take a share of the street front's columns, drawn
 * from the seed up to SIGN_CAP (placeSigns), and the balconies share is a stochastic rule,
 * A -> window | balcony, drawn window by window. The street front (+z,
 * the side a city building turns to its street) is built from the patterns as drawn; the sides
 * read S, C and N as A, and the back is windows, service bays and blank panels in turns.
 *
 * Pure: no three.js. It builds into the same Kit as the library (buildings/registry.ts) and returns
 * the same BuildingModel, so it renders with the city's materials and can stand on a lot.
 */

export type Bay = "A" | "B" | "C" | "S" | "N" | "V";
export const BAY_NAMES: Record<Bay, string> = { A: "window", B: "blank", C: "door", S: "shop front", N: "sign", V: "service" };
/** How the A bays are glazed. */
export type WindowType = "punched" | "ribbon" | "glass";
export const WINDOW_TYPES: { value: WindowType; label: string }[] = [
  { value: "punched", label: "Punched" },
  { value: "ribbon", label: "Ribbon" },
  { value: "glass", label: "Glass" },
];

/** What stands on the roof, and what crowns the top. */
export type RoofType = "gear" | "garden" | "billboard" | "helipad";
export const ROOF_TYPES: { value: RoofType; label: string }[] = [
  { value: "gear", label: "Gear" },
  { value: "garden", label: "Garden" },
  { value: "billboard", label: "Billboard" },
  { value: "helipad", label: "Helipad" },
];
export type CrownType = "none" | "band" | "cap";
export const CROWN_TYPES: { value: CrownType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "band", label: "Band" },
  { value: "cap", label: "Cap" },
];

export interface GrammarParams {
  /** The footprint's plan (massing.ts). */
  shape: Shape;
  /** Street front and depth, in meters. */
  frontage: number;
  depth: number;
  /** Storeys, the ground floor included. */
  floors: number;
  /** Ground floor height, in meters (the upper floors are the city's 3 m). */
  groundFloor: number;
  /** How the A bays are glazed. */
  windowType: WindowType;
  /** Bay width (a window and the pier beside it), window width and height, in meters. */
  bayWidth: number;
  windowWidth: number;
  windowHeight: number;
  /** Share of windows lit, 0–1. */
  lit: number;
  /** The chance an upper-floor window is a balcony instead, 0–1. */
  balconies: number;
  roof: RoofType;
  /** How full the roof is: its gear, or the garden's trees and shrubs, 0–1. */
  fill: number;
  /** The helipad's size, in meters (or as large as the roof allows). */
  padSize: number;
  /** The parapet's height, in meters, on the top and on every terrace. */
  parapet: number;
  crown: CrownType;
}

export const DEFAULT_GRAMMAR: GrammarParams = {
  shape: "bar",
  frontage: 16,
  depth: 20,
  floors: 12,
  groundFloor: 4.5,
  windowType: "punched",
  bayWidth: 2,
  windowWidth: 1.25,
  windowHeight: 1.75,
  lit: 0.55,
  balconies: 0.35,
  roof: "gear",
  fill: 0.5,
  padSize: 16,
  parapet: 0.75,
  crown: "none",
};

/** The ranges the page offers (and `validateGrammar` keeps to), in meters where sized. */
export const GRAMMAR_RANGES = {
  frontage: [6, 40],
  depth: [8, 40],
  floors: [2, 46],
  groundFloor: [4, 6],
  bayWidth: [1.5, 4],
  windowWidth: [0.5, 3.5],
  windowHeight: [0.75, 2.25],
  lit: [0, 1],
  balconies: [0, 1],
  fill: [0, 1],
  padSize: [8, 16],
  parapet: [0.5, 2],
} as const;

/**
 * What `validateGrammar` keeps a build to, where it is wider than the page's sliders: the city's
 * smallest lots leave a 6 m deep body, and its 200 m Center height, at full size (city/placement.ts
 * draws its buildings at FIGURE_SCALE), needs 89 floors.
 */
const BUILD_RANGES = { ...GRAMMAR_RANGES, depth: [6, 40], floors: [2, 90] } as const;

/**
 * The room round the body, in meters, on the street front, the two sides and the back: a building
 * on the city's lots (city/placement.ts) has little. A face with less than a part's reach leaves
 * the part out or shortens it (balconies, blade signs, awnings), and anything else reaching past
 * the room is cut at its edge (`Kit.clip`). With none, every face has all the room it needs.
 */
export interface Clearance {
  front: number;
  /** The sides: left at x = 0, right at x = frontage, as the plan is drawn (the street at +z). */
  left: number;
  right: number;
  back: number;
}

/**
 * How a lot's district and frontage steer the facade (city/placement.ts and lotGrammar.ts;
 * docs/plans/grammar-city-plan.md §1.5). Every field is optional; with none, the facade is the
 * one the seed alone draws, as on the `/grammar` page.
 */
export interface GrammarStyle {
  /** The weights of the upper pattern's slots after its first window, and of the ground's after its first slot. */
  upper?: [Bay, number][];
  ground?: [Bay, number][];
  /** The ground pattern's first slot: a shop unless given. */
  groundFirst?: Bay;
  /** The range the sign share is drawn in, and the most of the front's columns that may be signs (SIGN_CAP unless given). */
  signs?: readonly [number, number];
  signCap?: number;
  /** A side that fronts a street too (a corner lot): its floors take the street front's patterns, ground floor and signs. */
  corner?: "left" | "right";
}

/** Down to a quarter voxel, as the kit's sizes are. */
const quarter = (v: number) => Math.floor(v * 4) / 4;

/** The most of the street front's columns that may be signs; each draw takes a share up to it. */
export const SIGN_CAP = 0.3;

/** The wall between bays, the floor band, and how deep the window cavities are. */
const PIER = m(0.5);
const BAND = m(0.5);
const RECESS = m(0.5);
/** The corner columns stand this far proud of the wall line. */
const CORNER = 2 * PROUD;
/** Ribbon and glass windows reach across the piers but for a mullion this wide. */
const MULLION = m(0.2);
const SPAN = PIER / 2 - MULLION / 2;
/** How far a balcony reaches over the piers either side of its bay. */
const LEDGE = m(0.05);
/** The shop fronts' sign band. */
const FASCIA = m(0.9);

/** Colors: the city's dark masses, warm windows and a few neon accents. */
const WALL = PAL.slate;
const BASE_WALL = PAL.charcoal;
const TRIM = PAL.charcoal;
const LIGHTS: Hex[] = [PAL.warm, PAL.warm, PAL.amber, PAL.dim];
const NEON: Hex[] = [PAL.magenta, PAL.cyan, PAL.violet, PAL.amber, PAL.mint];
const AWNINGS: Hex[] = [PAL.wine, PAL.teal, PAL.indigo, PAL.rust];
/** Blank bays' panels, balcony rails and laundry. */
const PANELS: Hex[] = [PAL.rust, PAL.warmGray, PAL.teal, PAL.gunmetal, PAL.wine];
const RAILS: Hex[] = [PAL.steel, PAL.gunmetal, PAL.rust, PAL.teal, PAL.charcoal];
const CLOTH: Hex[] = [PAL.pale, PAL.wine, PAL.teal, PAL.rust, PAL.indigo, PAL.concrete, PAL.plum];

/** What an upper slot is after the first window, and the ground's slots after the first shop, by weight. */
const UPPER_REST: [Bay, number][] = [
  ["A", 6],
  ["V", 1.5],
  ["B", 1.5],
];
const GROUND_REST: [Bay, number][] = [
  ["S", 4],
  ["A", 2],
  ["C", 1.5],
  ["V", 1.5],
  ["B", 1],
];

const weighted = (items: [Bay, number][], x: number): Bay => {
  let left = x * items.reduce((sum, [, w]) => sum + w, 0);
  for (const [bay, w] of items) if ((left -= w) < 0) return bay;
  return items[items.length - 1][0];
};

/**
 * The facade's two patterns, drawn from the seed: two to four letters for the upper floors, two or
 * three for the ground floor. Every front is mirrored.
 * - The upper pattern opens with a window, so every front has some; the rest are windows, service
 *   bays and blank panels. Signs aren't in it: placeSigns sets them on the expanded
 *   row, where their share of the front can be kept under SIGN_CAP.
 * - The ground pattern opens with a shop; the rest are shops, windows, doors, service doors and
 *   blank walls.
 */
export function drawPatterns(seed: number, style: GrammarStyle = {}): { upper: Bay[]; ground: Bay[]; mirror: boolean } {
  const u = (slot: number, salt: number) => hash2(slot, salt, seed);
  const upperRest = style.upper ?? UPPER_REST;
  const groundRest = style.ground ?? GROUND_REST;
  const first = style.groundFirst ?? "S";
  const upper = Array.from({ length: 2 + Math.floor(u(0, 101) * 3) }, (_, i): Bay => (i === 0 ? "A" : weighted(upperRest, u(i, 203))));
  const ground = Array.from({ length: 2 + Math.floor(u(0, 102) * 2) }, (_, i): Bay => (i === 0 ? first : weighted(groundRest, u(i, 301))));
  return { upper, ground, mirror: true };
}

/**
 * One row of bays from a pattern: repeated from the left, or with `mirror`, the left half repeated
 * and reflected, an odd middle bay taking the first letter (a door on the ground floor).
 */
export function rowLetters(pattern: Bay[], n: number, mirror: boolean, ground: boolean): Bay[] {
  if (!mirror) return Array.from({ length: n }, (_, i) => pattern[i % pattern.length]);
  const left = Array.from({ length: Math.floor(n / 2) }, (_, i) => pattern[i % pattern.length]);
  const middle: Bay[] = n % 2 ? [ground ? "C" : pattern[0]] : [];
  return [...left, ...middle, ...left.slice().reverse()];
}

/**
 * The signs on an expanded upper row: the seed draws a share from 0 to SIGN_CAP, and that share of
 * the columns, never more than SIGN_CAP of them, become sign columns. On a mirrored row a column
 * goes with its reflection, so the signs stay symmetric; which columns is drawn from the seed too.
 */
export function placeSigns(
  row: Bay[],
  mirror: boolean,
  seed: number,
  range: readonly [number, number] = [0, SIGN_CAP],
  cap = SIGN_CAP,
): { row: Bay[]; share: number; count: number } {
  const n = row.length;
  const share = range[0] + (range[1] - range[0]) * hash2(0, 501, seed);
  const budget = Math.min(Math.round(share * n), Math.floor(cap * n));
  const half = mirror ? Math.floor(n / 2) : n;
  // The first column is never a sign: its blade would stand on the corner column.
  const units = Array.from({ length: half }, (_, i) => (mirror ? [i, n - 1 - i] : [i])).slice(1);
  if (mirror && n % 2) units.push([half]);
  units.sort((a, b) => hash2(a[0], 503, seed) - hash2(b[0], 503, seed));
  const out = row.slice();
  let count = 0;
  for (const unit of units) {
    if (count + unit.length > budget) continue;
    for (const i of unit) out[i] = "N";
    count += unit.length;
  }
  return { row: out, share, count };
}

/** How a wall of `length` voxels divides into bays: n bays of `bay` voxels, each a pier and an opening. */
export function bayLayout(length: number, bayWidth: number): { n: number; bay: number } {
  const n = Math.max(1, Math.floor((length - PIER) / bayWidth));
  return { n, bay: (length - PIER) / n };
}

/** The expanded rules, for the page to print. */
export interface Derivation {
  /** The plan built (a court shape too small for its footprint is a bar) and its wings' depth, in meters. */
  shape: Shape;
  wing: number;
  /** Each stage's floors and how far it steps in from the footprint's outer edge (meters). */
  stageFloors: number[];
  stageInsets: number[];
  roof: RoofType;
  crown: CrownType;
  /** Whether the cap went up (a roof too small for one keeps its own), and the roof that did (too small a roof gets gear). */
  capped: boolean;
  roofBuilt: RoofType;
  /** The billboard's height or the helipad's size as built, in meters (0 for gear or a garden). */
  roofSize: number;
  fill: number;
  parapet: number;
  bays: number;
  /** Bay width once stretched to fill the front, in meters. */
  bay: number;
  /** The patterns as drawn, and the street front's rows they expand to. */
  groundPattern: Bay[];
  upperPattern: Bay[];
  ground: Bay[];
  upper: Bay[];
  mirror: boolean;
  windowType: WindowType;
  /** The share of upper-floor windows that are balconies instead. */
  balconies: number;
  /** How many edges the street front has (the U's two wing ends), and their columns all told. */
  fronts: number;
  columns: number;
  /** The sign share this draw took (0 to SIGN_CAP), and how many of the street front's columns are signs. */
  signShare: number;
  signs: number;
  groundFloor: number;
  floorHeight: number;
  floors: number;
}

export interface GrammarStats {
  /** Height to the top of the parapet (meters), and its tier in the city (low, mid, high). */
  height: number;
  tier: Tier;
  frontage: number;
  depth: number;
  floors: number;
  windows: number;
  lit: number;
  vertices: number;
  triangles: number;
  /** Milliseconds the build took. */
  ms: number;
}

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Keeps every parameter in its range. */
export function validateGrammar(p: Partial<GrammarParams>): GrammarParams {
  const c = { ...DEFAULT_GRAMMAR, ...p };
  const r = BUILD_RANGES;
  return {
    ...c,
    frontage: clamp(c.frontage, r.frontage),
    depth: clamp(c.depth, r.depth),
    floors: Math.round(clamp(c.floors, r.floors)),
    groundFloor: clamp(c.groundFloor, r.groundFloor),
    windowType: WINDOW_TYPES.some((t) => t.value === c.windowType) ? c.windowType : "punched",
    bayWidth: clamp(c.bayWidth, r.bayWidth),
    windowWidth: clamp(c.windowWidth, r.windowWidth),
    windowHeight: clamp(c.windowHeight, r.windowHeight),
    lit: clamp(c.lit, r.lit),
    balconies: clamp(c.balconies, r.balconies),
    shape: SHAPES.some((t) => t.value === c.shape) ? c.shape : "bar",
    roof: ROOF_TYPES.some((t) => t.value === c.roof) ? c.roof : "gear",
    crown: CROWN_TYPES.some((t) => t.value === c.crown) ? c.crown : "none",
    fill: clamp(c.fill, r.fill),
    padSize: clamp(c.padSize, r.padSize),
    parapet: clamp(c.parapet, r.parapet),
  };
}

/** One side as the bays see it: where on it a part may reach, clear of the corner columns. */
interface Face {
  k: Kit;
  s: Side;
  p: GrammarParams;
  lo: number;
  hi: number;
  /** How far out from the wall a part may reach (voxels; Infinity with no clearance). */
  room: number;
}

/** One storey: its foot, the top of its floor band (where openings start), its top. */
interface Storey {
  rb: number;
  open: number;
  rt: number;
  ground: boolean;
  top: boolean;
}

/** A sign column's color, the same all the way up. */
interface Column {
  color: Hex;
}

/** A hole cut in a floor's wall: [from, to] along the side, [bottom, top] up. */
type Hole = [number, number, number, number];

/** How far an inner (concave) corner keeps the bays from it, past the deepest part a bay hangs out (a balcony, 1.15 m). */
const CLEAR = m(1.5);
/** The roof slab, and how far its edge stands out from the walls. */
const SLAB = m(0.25);
const LIP = 3 * PROUD;
/** The parapet's thickness. */
const COPE = m(0.25);

export function buildGrammar(
  params: Partial<GrammarParams>,
  seed: number,
  clearance?: Clearance,
  style: GrammarStyle = {},
): { model: BuildingModel; derivation: Derivation; stats: GrammarStats } {
  const start = performance.now();
  const p = validateGrammar(params);
  const k = new Kit(seed ^ 0x6a17);
  const W = m(p.frontage);
  const D = m(p.depth);
  // The room, in the plan's voxels (the street at +z), and how far out from an edge's line it reaches.
  const room: [number, number, number, number] | null = clearance
    ? [-m(clearance.left), -m(clearance.back), W + m(clearance.right), D + m(clearance.front)]
    : null;
  k.clip = room;
  const roomOut = (e: Edge) =>
    !room ? Infinity : e.dir === 0 ? room[3] - e.line : e.dir === 1 ? room[2] - e.line : e.dir === 2 ? e.line - room[1] : e.line - room[0];
  const gh = m(p.groundFloor);
  const H = gh + (p.floors - 1) * FLOOR;
  const parapet = m(p.parapet);
  const counts = { windows: 0, lit: 0 };
  // Floor j's foot and head.
  const foot = (j: number) => (j === 0 ? 0 : gh + (j - 1) * FLOOR);
  const head = (j: number) => (j === 0 ? gh : foot(j) + FLOOR);
  const plan = massing(p.shape, W, D, p.floors);

  // Every random choice on a facade comes from its own place (face, floor, bay), never from the
  // kit's running sequence: changing one parameter then leaves every other window as it was.
  // `k.rng` is kept for the roof alone, so it depends only on the seed and the footprint.
  const at = (face: number, floor: number, bay: number) => new Rng(Math.floor(hash2(face * 64 + floor, bay, seed) * 4294967296));
  // How lit each floor is: some floors busy, some nearly dark, the same on every side.
  const floorLight = Array.from({ length: p.floors }, (_, j) => 0.35 + 1.3 * hash2(j, 7919, seed));
  const { upper: upperPattern, ground: groundPattern, mirror } = drawPatterns(seed, style);
  const signRange = style.signs ?? ([0, SIGN_CAP] as const);
  const signCap = style.signCap ?? SIGN_CAP;
  // The street front: every edge of the first stage along the street (the U has two, its wings'
  // ends), each with its own row of bays and its own signs. The widest is the one the printout shows.
  const streets = outline(plan.stages[0].rects)
    .filter((e) => e.dir === 0 && e.line === D)
    .sort((a, b) => a.side.ox - b.side.ox)
    .map((e) => {
      const { n, bay } = bayLayout(e.side.length, m(p.bayWidth));
      const signed = placeSigns(rowLetters(upperPattern, n, mirror, false), mirror, seed, signRange, signCap);
      return { ox: e.side.ox, n, bay, ground: rowLetters(groundPattern, n, mirror, true), signed };
    });
  const front = streets.reduce((best, f) => (f.n > best.n ? f : best));
  const signed = front.signed;
  const derivation: Derivation = {
    shape: plan.shape,
    wing: plan.wing * VOXEL_M,
    stageFloors: plan.stages.map((st) => st.j1 - st.j0),
    stageInsets: plan.stages.map((st) => st.inset * VOXEL_M),
    roof: p.roof,
    crown: p.crown,
    capped: false,
    roofBuilt: p.roof,
    roofSize: 0,
    fill: p.fill,
    parapet: p.parapet,
    bays: front.n,
    bay: front.bay * VOXEL_M,
    groundPattern,
    upperPattern,
    ground: front.ground,
    upper: signed.row,
    fronts: streets.length,
    columns: streets.reduce((sum, f) => sum + f.n, 0),
    mirror,
    windowType: p.windowType,
    balconies: p.balconies,
    signShare: signed.share,
    signs: streets.reduce((sum, f) => sum + f.signed.count, 0),
    groundFloor: p.groundFloor,
    floorHeight: FLOOR * VOXEL_M,
    floors: p.floors,
  };

  // The patterns off the street: the sides read shops and doors as windows; the back (and a
  // court's street-side walls) are windows, service bays (pipes, vents) and blank panels in turns.
  const plain = (bays: Bay[]): Bay[] => bays.map((b) => (b === "S" || b === "C" ? "A" : b));
  const back: Bay[] = ["A", "V", "B"];

  for (const [si, st] of plan.stages.entries()) {
    const y0 = foot(st.j0);
    const y1 = head(st.j1 - 1);
    const edges = outline(st.rects);
    const zMax = Math.max(...st.rects.map((r) => r[3]));

    // The mass: a dark glass core set back by the window depth, and a column at each outer corner.
    for (const [x0, z0, x1, z1] of st.rects) k.occupy([x0, y0, z0, x1, y1, z1], "mass");
    k.grounded = true;
    for (const [x0, z0, x1, z1] of cores(st.rects)) k.box(x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, PAL.glass);
    for (const e of edges) if (e.convex[1]) column(k, e, y0, y1);
    k.grounded = false;

    for (const [ei, e] of edges.entries()) {
      const s = e.side;
      const L = s.length;
      const sx = si === 0 && e.dir === 0 && e.line === D ? streets.findIndex((f) => f.ox === s.ox) : -1;
      const street = sx >= 0 ? streets[sx] : null;
      // The street front keeps key 0, so its windows don't change with the stages behind it.
      const fk = sx === 0 ? 0 : sx > 0 ? 1000 + sx : 1 + si * 16 + ei;
      // The bays run between the corners: from a column at an outer corner, from CLEAR at an inner one.
      const r0 = e.convex[0] ? 0 : CLEAR;
      const r1 = e.convex[1] ? L : L - CLEAR;
      const { n, bay } = r1 - r0 >= PIER + m(1) ? bayLayout(r1 - r0, m(p.bayWidth)) : { n: 0, bay: 0 };
      // A corner lot's side on the cross street reads as a second street front.
      const corner = (style.corner === "right" && e.dir === 1 && e.line === W) || (style.corner === "left" && e.dir === 3 && e.line === 0);
      const rows = street
        ? { ground: street.ground, upper: street.signed.row }
        : corner
          ? { ground: rowLetters(groundPattern, n, mirror, true), upper: placeSigns(rowLetters(upperPattern, n, mirror, false), mirror, seed ^ 0x7c1, signRange, signCap).row }
          : e.dir === 2
          ? { ground: rowLetters(back, n, false, false), upper: rowLetters(back, n, false, false) }
          : e.dir === 0 && e.line === zMax
            ? { ground: rowLetters(plain(groundPattern), n, mirror, false), upper: rowLetters(upperPattern, n, mirror, false) }
            : { ground: rowLetters(plain(groundPattern), n, mirror, false), upper: rowLetters(plain(upperPattern), n, mirror, false) };
      const f: Face = { k, s, p, lo: e.convex[0] ? PIER : 0, hi: e.convex[1] ? L - PIER : L, room: roomOut(e) };
      // A face with no room for a balcony's reach gets none (on the city's lots, a party wall).
      const balconies = f.room >= BALCONY_REACH;
      // A sign column is a blade sign on its bay's left pier, one color all the way up. The first
      // bay's left pier is the corner column, so placeSigns never picks it.
      const columns: Column[] = Array.from({ length: n }, (_, i) => ({ color: at(fk, 63, i).pick(NEON) }));
      // Floor bands stop inside the corner columns; at an inner corner they meet the other side's.
      const [b0, b1] = reach(e, -RECESS, PROUD);
      const band: [number, number] = [e.convex[0] ? PIER : -b0, e.convex[1] ? L - PIER : L + b1];
      for (let j = st.j0; j < st.j1; j++) {
        const ground = j === 0;
        const rb = foot(j);
        const rt = head(j);
        // The first floor over a setback opens onto the terrace: no balconies hang over its parapet.
        const terrace = si > 0 && j === st.j0;
        // A floor band at the foot of each upper floor, standing PROUD of the wall; over a
        // setback it sits on the terrace's slab.
        const bb = terrace ? rb + SLAB : rb;
        if (!ground) sideBox(k, s, band[0], bb, -RECESS, band[1] - band[0], rb + BAND - bb, RECESS + PROUD, TRIM);
        // Over a setback, what runs up the wall (pipes) starts on the terrace's slab.
        const fl: Storey = { rb: bb, open: ground ? rb : rb + BAND, rt, ground, top: j === st.j1 - 1 };
        const letters = ground ? rows.ground : rows.upper;
        // Each bay cuts its hole in the floor's wall and fills it; the wall is then the floor less
        // its holes, in a few long strips rather than a box round every window.
        const holes: Hole[] = [];
        let lastLit = false;
        for (let i = 0; i < n; i++) {
          const a = r0 + i * bay + PIER;
          const ow = bay - PIER;
          const letter = letters[i];
          const r = at(fk, j, i);
          // Lit windows run in pairs now and then: a bay copies its neighbor's light.
          const light = () => {
            const lit = r.next() < 0.45 ? lastLit : r.next() < Math.min(0.95, p.lit * floorLight[j]);
            lastLit = lit;
            counts.windows++;
            if (lit) counts.lit++;
            return lit;
          };
          // A -> window | balcony, for the windows above the ground floor: each draws its own
          // number, so raising the share adds balconies one by one.
          const free = letter === "A" && !ground && !terrace && balconies;
          let hole: Hole | null = null;
          if (letter === "B") blank(f, r, fl, a, ow);
          else if (letter === "C" && ground) hole = door(f, r, a, ow, rt);
          else if (letter === "S" && ground) hole = shop(f, r, a, ow, rt);
          else if (letter === "V") hole = service_(f, r, fl, a, ow);
          else if (free && hash2(fk * 64 + j, i, seed ^ 0x5bd1) < p.balconies) hole = balcony(f, r, fl, a, ow, light());
          else {
            hole = window_(f, r, fl, a, ow, p.windowType, light());
            if (letter === "N" && f.room >= BLADE_MIN) blade(f, r, fl, a - PIER / 2, columns[i]);
          }
          if (hole) holes.push(hole);
        }
        // The wall runs between the corner columns; inside them it would only hide.
        walls(k, at(fk, j, 999), s, f.lo, f.hi, fl.open, rt, holes, ground ? BASE_WALL : WALL);
      }
    }

    // The stage's roof: a slab, and a parapet where nothing stands on it.
    const above = plan.stages[si + 1]?.rects ?? [];
    roofOf(k, st.rects, edges, above, y1, parapet);
    if (si === plan.stages.length - 1) {
      const neon = k.rng.pick(NEON);
      if (p.crown === "band") for (const e of edges) crownBand(k, e, y1 + SLAB + parapet * 0.3, neon);
      // The roof's main area, the largest rectangle, carries the roof; any other wings get service gear.
      const main = st.rects.reduce((best, r) => ((r[2] - r[0]) * (r[3] - r[1]) > (best[2] - best[0]) * (best[3] - best[1]) ? r : best));
      let surface = y1 + SLAB;
      let area: Rect = main;
      if (p.crown === "cap") [area, surface] = cap(k, main, surface, neon);
      [derivation.roofBuilt, derivation.roofSize] = roofOn(k, p, area, surface, main === area, st.rects);
      for (const r of st.rects) if (r !== main) gearRoof(k, r, y1 + SLAB, m(1), p.fill);
      derivation.capped = area !== main;
    }
  }

  const geometry = k.finish();
  const model: BuildingModel = { id: "grammar", ...geometry, width: W, depth: D, height: k.top, fixtures: k.fixtures };
  const vertices = (geometry.solid.position.length + geometry.glow.position.length) / 3;
  const triangles = (geometry.solid.index.length + geometry.glow.index.length) / 3;
  const height = (H + SLAB + (derivation.capped ? CAP_HEIGHT : parapet + m(0.1))) * VOXEL_M;
  return {
    model,
    derivation,
    stats: { height, tier: tierOf(height), frontage: p.frontage, depth: p.depth, floors: p.floors, windows: counts.windows, lit: counts.lit, vertices, triangles, ms: performance.now() - start },
  };
}

/**
 * The dark glass core of a stage: each rectangle set in by the window depth, and a joint across
 * each place two rectangles meet, so the core is one piece behind every window.
 */
function cores(rects: Rect[]): Rect[] {
  const R = RECESS;
  const out: Rect[] = rects.map(([x0, z0, x1, z1]) => [x0 + R, z0 + R, x1 - R, z1 - R]);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const [a, b] = [rects[i], rects[j]];
      const zs: [number, number] = [Math.max(a[1], b[1]) + R, Math.min(a[3], b[3]) - R];
      const xs: [number, number] = [Math.max(a[0], b[0]) + R, Math.min(a[2], b[2]) - R];
      for (const x of [a[2] === b[0] ? a[2] : null, b[2] === a[0] ? b[2] : null]) if (x !== null && zs[1] > zs[0]) out.push([x - R, zs[0], x + R, zs[1]]);
      for (const z of [a[3] === b[1] ? a[3] : null, b[3] === a[1] ? b[3] : null]) if (z !== null && xs[1] > xs[0]) out.push([xs[0], z - R, xs[1], z + R]);
    }
  }
  return out;
}

/**
 * A corner column where an edge ends at an outer corner, a pier square standing CORNER proud of
 * both walls; the walls, the floor bands and the core start where it ends.
 */
function column(k: Kit, e: Edge, y0: number, y1: number) {
  const s = e.side;
  const vx = s.ox + s.ux * s.length;
  const vz = s.oz + s.uz * s.length;
  // Out from the corner along both walls' normals: this edge's, and the next edge's (its direction).
  const dx = s.nx + s.ux;
  const dz = s.nz + s.uz;
  const [ax, bx] = [vx + CORNER * dx, vx - PIER * dx];
  const [az, bz] = [vz + CORNER * dz, vz - PIER * dz];
  k.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.abs(ax - bx), y1 - y0, Math.abs(az - bz), WALL);
}

/**
 * Where an edge's top is open to the sky: the stretches no stage above stands on, each with how
 * far a band out from `o0` to `o1` reaches past its ends. At the edge's own corners the bands meet
 * (massing.ts `reach`); where the stage above begins they stop short of its corner column.
 */
function skyline(e: Edge, above: Rect[], o0: number, o1: number): [number, number][] {
  const s = e.side;
  const L = s.length;
  const along = (x: number, z: number) => (s.ux ? (x - s.ox) * s.ux : (z - s.oz) * s.uz);
  const cuts = above.flatMap(([x0, z0, x1, z1]) => (s.ux ? [along(x0, 0), along(x1, 0)] : [along(0, z0), along(0, z1)]));
  const covered = (a: number) => {
    const px = s.ox + s.ux * a - s.nx * 0.01;
    const pz = s.oz + s.uz * a - s.nz * 0.01;
    return above.some(([x0, z0, x1, z1]) => px > x0 && px < x1 && pz > z0 && pz < z1);
  };
  const [r0, r1] = reach(e, o0, o1);
  return stretches(0, L, cuts, (a) => !covered(a))
    .map(([a, b]): [number, number] => [a < 0.01 ? -r0 : a + CORNER, b > L - 0.01 ? L + r1 : b - CORNER])
    .filter(([a, b]) => b - a > 0.01);
}

/** A stage's roof: a slab over its rectangles, and along its open edges a lip, a parapet `h` high and its coping. */
function roofOf(k: Kit, rects: Rect[], edges: Edge[], above: Rect[], y: number, h: number) {
  for (const [x0, z0, x1, z1] of rects) k.box(x0, y, z0, x1 - x0, SLAB, z1 - z0, TRIM);
  const top = y + SLAB;
  for (const e of edges) {
    for (const [a, b] of skyline(e, above, 0, LIP)) sideBox(k, e.side, a, y, 0, b - a, SLAB, LIP, TRIM);
    for (const [a, b] of skyline(e, above, -COPE, 0)) sideBox(k, e.side, a, top, -COPE, b - a, h, COPE, TRIM);
    for (const [a, b] of skyline(e, above, -COPE - PROUD, PROUD)) sideBox(k, e.side, a, top + h, -COPE - PROUD, b - a, m(0.1), COPE + 2 * PROUD, PAL.concrete);
  }
}

/** CROWN -> band: a neon line round the parapet's outer face. */
function crownBand(k: Kit, e: Edge, y: number, color: Hex) {
  const [r0, r1] = reach(e, 0, 0.1);
  sideBox(k, e.side, -r0, y, 0, e.side.length + r0 + r1, m(0.2), 0.1, color, true, 0.9 * k.neon);
}

/** How tall the stepped cap stands. */
const CAP_HEIGHT = m(3) + m(2.5);

/**
 * CROWN -> cap: two stepped tiers on the roof's main area, the lower ringed by a neon line.
 * Returns the top tier, where the roof's gear goes then, and its height; a roof too small for
 * one keeps its own.
 */
function cap(k: Kit, [x0, z0, x1, z1]: Rect, y: number, color: Hex): [Rect, number] {
  if (Math.min(x1 - x0, z1 - z0) < m(12)) return [[x0, z0, x1, z1], y];
  const tier = (inset: number, base: number, h: number): Rect => {
    const r: Rect = [x0 + inset, z0 + inset, x1 - inset, z1 - inset];
    k.occupy([r[0], base, r[1], r[2], base + h, r[3]], "roofgear");
    k.box(r[0], base, r[1], r[2] - r[0], h, r[3] - r[1], WALL);
    // A trim ring round its top: the ±z pieces own the corners.
    const [y, t] = [base + h - m(0.25), m(0.25)];
    k.box(r[0] - PROUD, y, r[1] - PROUD, r[2] - r[0] + 2 * PROUD, t, PROUD, TRIM);
    k.box(r[0] - PROUD, y, r[3], r[2] - r[0] + 2 * PROUD, t, PROUD, TRIM);
    for (const x of [r[0] - PROUD, r[2]]) k.box(x, y, r[1], PROUD, t, r[3] - r[1], TRIM);
    return r;
  };
  k.grounded = true;
  const low = tier(m(1.5), y, m(3));
  k.light(low[0] - 0.1, y + m(1.5), low[1] - 0.1, low[2] - low[0] + 0.2, m(0.2), low[3] - low[1] + 0.2, color, 0.85 * k.neon);
  const high = tier(m(3.5), y + m(3), m(2.5));
  k.grounded = false;
  return [high, y + CAP_HEIGHT];
}

/** The billboard's screen: one size on every roof wide enough for it (with 1.5 m either side). */
const BOARD_W = m(8);
const BOARD_H = m(4);

/** A roof bench's length, and the space from one to the next along the parapet. */
const BENCH = m(1.8);
const BENCH_EVERY = m(5);

/**
 * Benches along a side of a garden roof, backs to the parapet, every BENCH_EVERY or so and clear
 * of the corners, the stair hut and anywhere the side meets another wing (no parapet there).
 */
function benches(k: Kit, s: Side, y: number, stage: Rect[]) {
  const n = Math.floor((s.length - m(2)) / BENCH_EVERY);
  if (n < 1) return;
  const step = (s.length - m(2)) / n;
  const back = -COPE - m(0.15);
  const deep = m(0.5);
  for (let i = 0; i < n; i++) {
    const a = quarter(m(1) + step * (i + 0.5) - BENCH / 2);
    // Just past the wall line at the bench's middle: another wing there means no parapet.
    const mid = a + BENCH / 2;
    const px = s.ox + s.ux * mid + s.nx * 0.5;
    const pz = s.oz + s.uz * mid + s.nz * 0.5;
    if (stage.some(([x0, z0, x1, z1]) => px > x0 && px < x1 && pz > z0 && pz < z1)) continue;
    const box = sideBounds(s, a, y, back - deep, BENCH, m(1.2), deep);
    if (!k.clear(box)) continue;
    k.occupy(box, "prop");
    // Two legs, the seat on them, the back rest on the seat.
    for (const at of [a + m(0.15), a + BENCH - m(0.15) - m(0.25)]) sideBox(k, s, at, y, back - deep + 0.2, m(0.25), m(0.42), deep - 0.4, PAL.charcoal);
    sideBox(k, s, a, y + m(0.42), back - deep, BENCH, 0.25, deep, PAL.trunk);
    sideBox(k, s, a, y + m(0.42) + 0.25, back - 0.3, BENCH, m(0.4), 0.3, PAL.trunk);
  }
}

/** The stair hut's side, and the strip of roof it takes with the space round it. */
const HUT = m(2.5);
const HUT_ROOM = m(3);

/**
 * ROOF -> gear | garden | billboard | helipad, on an area of the roof at height `y`. Returns what
 * went up and the billboard's height or the pad's size (meters): too small a roof for a pad or a
 * billboard gets gear.
 */
function roofOn(k: Kit, p: GrammarParams, [x0, z0, x1, z1]: Rect, y: number, parapet: boolean, stage: Rect[]): [RoofType, number] {
  const { roof, fill } = p;
  const w = x1 - x0;
  const d = z1 - z0;
  // Kept clear of the parapet (less on a cap's top tier, which has none). The stair hut stands in
  // the back corner on the right, where `rooftop` puts it.
  const e = m(parapet ? 1 : 0.5);
  const hut = (): void => stairHut(k, x1 - e - HUT, y, z0 + e);
  if (roof === "helipad") {
    // A pad of the size asked for, or as large as the roof allows beside the stair hut: behind it
    // along the back, or beside it along the right side, whichever leaves the larger pad. Too
    // small a roof keeps its gear.
    const back = Math.min(w - 2 * e, d - 2 * e - HUT_ROOM);
    const side = Math.min(w - 2 * e - HUT_ROOM, d - 2 * e);
    const size = quarter(Math.min(m(p.padSize), Math.max(back, side)));
    if (size >= m(8)) {
      // Centered in what is left once the hut's strip is set aside.
      const [ax0, az0, ax1, az1] = back >= side ? [x0 + e, z0 + e + HUT_ROOM, x1 - e, z1 - e] : [x0 + e, z0 + e, x1 - e - HUT_ROOM, z1 - e];
      k.grounded = true;
      hut();
      helipad(k, quarter((ax0 + ax1 - size) / 2), y, quarter((az0 + az1 - size) / 2), size);
      k.grounded = false;
      return ["helipad", size * VOXEL_M];
    }
  }
  if (roof === "garden" && w - 2 * e > m(2) && d - 2 * e > m(2)) {
    // The whole roof planted but for a path along the parapet: the stair hut in the back corner
    // (if the roof has room) and beds round it.
    const [ix, iz, iw, id] = [x0 + e, z0 + e, w - 2 * e, d - 2 * e];
    k.grounded = true;
    if (iw > m(5) && id > m(5)) {
      hut();
      // Benches in the path, their backs to the parapet, facing the beds.
      if (parapet) for (const s of sides(x0, z0, w, d)) benches(k, s, y, stage);
      garden(k, ix, y, iz + HUT_ROOM, iw, id - HUT_ROOM, fill);
      garden(k, ix, y, iz, iw - HUT_ROOM, HUT_ROOM, fill);
    } else garden(k, ix, y, iz, iw, id, fill);
    k.grounded = false;
    return ["garden", 0];
  }
  const board = roof === "billboard" && w >= BOARD_W + m(3) && d >= m(6);
  const h = BOARD_H;
  if (board) {
    // A screen of one size facing the street on two posts, centered near the roof's front edge,
    // then the gear behind it.
    const len = BOARD_W;
    const legs = m(2);
    const s: Side = { ox: x0 + (w - len) / 2, oz: z1 - m(2.5), ux: 1, uz: 0, nx: 0, nz: 1, length: len };
    k.occupy(sideBounds(s, 0, y, -m(0.5), len, legs + h, m(0.5)), "billboard");
    for (const t of [0.15, 0.85]) sideBox(k, s, len * t - m(0.15), y, -1.6, m(0.3), legs + h, 1.2, PAL.steel);
    sideBox(k, s, m(0.2), y + legs - m(0.2), -1.4, len - m(0.4), m(0.2), 0.8, PAL.steel);
    billboard(k, s, 0, y + legs + m(0.25), len, h, [PAL.magenta, PAL.cyan, PAL.violet, PAL.amber]);
  }
  gearRoof(k, [x0, z0, x1, z1], y, e, fill);
  return board ? ["billboard", h * VOXEL_M] : [roof === "garden" ? "garden" : "gear", 0];
}

/** The kinds of rooftop gear. Antennas and dishes go up once at most; the rest may come round again. */
type Gear = "hvac" | "tank" | "antenna" | "machine" | "dish" | "solar";
const GEAR: Gear[] = ["hvac", "tank", "antenna", "machine", "dish", "solar"];
const GEAR_AGAIN: Gear[] = ["hvac", "tank", "machine", "solar"];
/** At a full fill, one piece of gear for this much roof (square meters). */
const GEAR_AREA = 30;
/** The space kept clear round each piece of gear. */
const GEAR_GAP = m(0.75);

/**
 * ROOF -> gear: the stair hut in the back corner, a duct along the back, and a few pieces of gear
 * spread over the rest, `fill` (0–1) setting how many. The kinds are dealt from a shuffled deck, so
 * each comes up once before any comes round again, with room kept round every piece.
 */
function gearRoof(k: Kit, [x0, z0, x1, z1]: Rect, y: number, e: number, fill: number) {
  const [ix, iz, iw, id] = [x0 + e, z0 + e, x1 - x0 - 2 * e, z1 - z0 - 2 * e];
  if (iw <= m(2) || id <= m(2)) return;
  k.grounded = true;
  const hut = iw > m(5) && id > m(5) && k.clear([ix + iw - HUT - PROUD, y, iz - PROUD, ix + iw + PROUD, y + m(3.4), iz + HUT + 0.2]);
  if (hut) stairHut(k, ix + iw - HUT, y, iz);
  if (fill > 0 && iw > m(6)) duct(k, ix, y, iz, Math.min(iw * k.rng.range(0.4, 0.6), iw - HUT_ROOM - m(0.5)), true);
  const count = Math.round((fill * iw * id * VOXEL_M * VOXEL_M) / GEAR_AREA);
  const deck: Gear[] = [];
  for (let i = 0; i < count; i++) {
    if (deck.length === 0) deck.push(...shuffle(k.rng, i === 0 ? GEAR : GEAR_AGAIN));
    const kind = deck.pop()!;
    // A size for it, then a spot with room round it, a few tries.
    const size = kind === "hvac" ? m(k.rng.range(1.2, 2)) : kind === "tank" ? m(k.rng.range(1.5, 2.2)) : kind === "dish" ? m(k.rng.range(0.8, 1.2)) : 0;
    const masts = kind === "antenna" ? k.rng.int(1, 2) : 0;
    const [bw, bd] = kind === "hvac" || kind === "tank" ? [size, size] : kind === "antenna" ? [m(1.05) + (masts - 1) * m(0.8), m(0.4) + (masts - 1) * m(0.5)] : kind === "machine" ? [m(1.6), m(2)] : kind === "dish" ? [2 * size, 2 * size] : [m(3), m(2)];
    for (let tries = 0; tries < 8; tries++) {
      const px = quarter(ix + m(0.5) + k.rng.next() * (iw - bw - m(1)));
      const pz = quarter(iz + m(1.5) + k.rng.next() * (id - bd - m(2)));
      const bx = kind === "antenna" ? px - m(0.4) : px - 0.15;
      if (bx < ix || pz + bd > iz + id || px + bw > ix + iw) continue;
      if (!k.clear([bx - GEAR_GAP, y, pz - GEAR_GAP - 0.1, bx + bw + GEAR_GAP, y + m(8), pz + bd + GEAR_GAP])) continue;
      if (kind === "hvac") hvac(k, px, y, pz, size);
      else if (kind === "tank") tank(k, px, y, pz, size);
      else if (kind === "antenna") for (let a = 0; a < masts; a++) antenna(k, px + a * m(0.8), y, pz + a * m(0.5), m(k.rng.range(3, 6)));
      else if (kind === "machine") machine(k, px, y, pz, m(1.5), m(1.2), m(2));
      else if (kind === "dish") dish(k, px, y, pz, size);
      else solar(k, px, y, pz, m(3), m(2));
      break;
    }
  }
  k.grounded = false;
}

function shuffle<T>(r: Rng, items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The wall of one floor along a side, from `a0` to `a1` and `y0` to `y1`, less its holes: split
 * into horizontal bands at the holes' tops and bottoms, each band one box per solid stretch.
 */
function walls(k: Kit, r: Rng, s: Side, a0: number, a1: number, y0: number, y1: number, holes: Hole[], color: Hex) {
  const ys = [...new Set([y0, y1, ...holes.flatMap(([, , b, t]) => [Math.max(y0, Math.min(y1, b)), Math.max(y0, Math.min(y1, t))])])].sort((p, q) => p - q);
  for (let i = 0; i + 1 < ys.length; i++) {
    const [b, t] = [ys[i], ys[i + 1]];
    if (t - b < 0.01) continue;
    const cuts = holes.filter(([, , hb, ht]) => hb < t - 0.001 && ht > b + 0.001).sort((p, q) => p[0] - q[0]);
    let at = a0;
    for (const [from, to] of [...cuts, [a1, a1] as const]) {
      if (from - at > 0.01) sideBox(k, s, at, b, -RECESS, from - at, t - b, RECESS, vary(r, color, 0.05));
      at = Math.max(at, to);
    }
  }
}

/**
 * Where a window sits in the opening from `a` (`ow` wide): its left end and width along the wall,
 * its sill and height.
 * - Punched: the window's own size, centered.
 * - Ribbon: across the piers but for a mullion, so a floor's windows read as one band.
 * - Glass: the ribbon's width, floor band to floor band.
 */
function windowRect(f: Face, fl: Storey, a: number, ow: number, type: WindowType): [number, number, number, number] {
  const storey = fl.rt - fl.open;
  const wh = Math.min(m(f.p.windowHeight), storey - m(0.3));
  const sill = fl.open + Math.max(m(0.15), (storey - wh) * 0.45);
  if (type === "ribbon" || type === "glass") {
    const wa = Math.max(f.lo, a - SPAN);
    const wb = Math.min(f.hi, a + ow + SPAN);
    return type === "glass" ? [wa, wb - wa, fl.open, storey] : [wa, wb - wa, sill, wh];
  }
  const ww = Math.min(m(f.p.windowWidth), ow);
  return [a + (ow - ww) / 2, ww, sill, wh];
}

/**
 * A: lit or dark glass in the window's hole, a mullion down a wide one, a
 * transom across a glass wall, and a sill under the others. Returns its hole.
 */
function window_(f: Face, r: Rng, fl: Storey, a: number, ow: number, type: WindowType, lit: boolean): Hole {
  const { k, s } = f;
  const [wa, ww, sill, wh] = windowRect(f, fl, a, ow, type);
  const glass = type === "glass";
  if (lit) sideBox(k, s, wa + 0.1, sill, -RECESS, ww - 0.2, glass ? wh : wh - 0.1, 0.15, r.pick(LIGHTS), true, glass ? r.range(0.4, 0.75) : r.range(0.6, 1));
  else if (r.chance(0.08)) sideBox(k, s, wa + 0.1, sill, -RECESS, ww - 0.2, wh - 0.1, 0.15, PAL.blue, true, 0.12);
  if (ww > m(1.6)) sideBox(k, s, wa + ww / 2 - m(0.08), sill, -RECESS, m(0.16), wh, RECESS * 0.6, TRIM);
  if (glass) sideBox(k, s, wa, sill + m(1.1), -RECESS, ww, m(0.1), RECESS * 0.5, TRIM);
  else sideBox(k, s, wa - (type === "punched" ? m(0.05) : 0), sill - m(0.12), 0, ww + (type === "punched" ? m(0.1) : 0), m(0.12), m(0.15), vary(r, TRIM, 0.12));
  return [wa, wa + ww, sill, sill + wh];
}

/** B: plain wall, now and then patched with a panel in rust or grime, sometimes with a vent. */
function blank(f: Face, r: Rng, fl: Storey, a: number, ow: number) {
  if (fl.ground || ow < m(0.8) || !r.chance(0.45)) return;
  const { k, s } = f;
  const h = fl.rt - fl.open - m(0.5);
  const y = fl.open + m(0.25);
  sideBox(k, s, a + m(0.15), y, 0, ow - m(0.3), h, m(0.06), vary(r, r.pick(PANELS), 0.1));
  if (r.chance(0.4)) {
    sideBox(k, s, a + ow / 2 - m(0.3), y + h * 0.6, m(0.06), m(0.6), m(0.4), m(0.05), PAL.charcoal);
    for (const t of [0.3, 0.6]) sideBox(k, s, a + ow / 2 - m(0.28), y + h * 0.6 + m(0.4) * t, m(0.06) + m(0.05), m(0.56), m(0.04), 0.1, PAL.steel);
  }
}

/** C: a street door, set back in a dark frame with a lit strip over it and a step in front. Returns its hole. */
function door(f: Face, r: Rng, a: number, ow: number, rt: number): Hole {
  const { k, s } = f;
  const dw = Math.min(ow, m(1.6));
  const dh = Math.min(rt - m(0.6), m(2.6));
  const da = a + (ow - dw) / 2;
  sideBox(k, s, da + m(0.1), 0, -RECESS, dw - m(0.2), dh, RECESS - PROUD, PAL.gunmetal);
  sideBox(k, s, da + dw - m(0.35), dh * 0.45, -PROUD, m(0.06), m(0.18), PROUD * 0.6, PAL.pale);
  sideBox(k, s, da, dh + m(0.1), 0, dw, m(0.12), m(0.1), r.pick([PAL.amber, PAL.cyan, PAL.white]), true, 0.8 * k.neon);
  sideBox(k, s, da - m(0.1), 0, 0, dw + m(0.2), m(0.15), m(0.5), PAL.concrete);
  return [da, da + dw, 0, dh];
}

/**
 * S: a shop front: a lit interior behind full glazing (or a closed roller shutter), a fascia with
 * a neon sign band above, and now and then an awning with a light under it. It fills its whole
 * opening, so that is its hole.
 */
function shop(f: Face, r: Rng, a: number, ow: number, rt: number): Hole {
  const { k, s } = f;
  const top = rt - FASCIA;
  const neon = r.pick(NEON);
  if (r.chance(0.7)) {
    sideBox(k, s, a + 0.1, m(0.4), -RECESS, ow - 0.2, top - m(0.4), 0.15, r.pick([PAL.warm, PAL.white, PAL.amber]), true, r.range(0.45, 0.85));
    sideBox(k, s, a, 0, -RECESS, ow, m(0.4), RECESS, BASE_WALL);
    if (ow > m(2)) sideBox(k, s, a + ow / 2 - m(0.06), m(0.4), -RECESS, m(0.12), top - m(0.4), RECESS * 0.6, TRIM);
  } else {
    sideBox(k, s, a, 0, -RECESS, ow, top, RECESS, PAL.gunmetal);
    // The slats stop under where an awning would hang, so none lies flush with its underside.
    for (let y = m(0.4); y < top - m(0.5); y += m(0.4)) sideBox(k, s, a + m(0.05), y, 0, ow - m(0.1), m(0.05), 0.06, PAL.charcoal);
  }
  sideBox(k, s, a, top, -RECESS, ow, FASCIA, RECESS, TRIM);
  sideBox(k, s, a + m(0.1), top + m(0.1), 0, ow - m(0.2), FASCIA - m(0.2), PROUD, PAL.night);
  sideBox(k, s, a + m(0.2), top + m(0.22), PROUD, ow - m(0.4), m(0.45), 0.1, neon, true, 0.9 * k.neon);
  // The awning reaches AWNING out, or what the room allows; under half a meter, none.
  const awning = Math.min(AWNING, f.room);
  if (r.chance(0.5) && awning >= m(0.5)) {
    sideBox(k, s, a, top - m(0.25), 0, ow, m(0.2), awning, r.pick(AWNINGS));
    sideBox(k, s, a + m(0.1), top - m(0.3), m(0.1), ow - m(0.2), m(0.05), awning - m(0.2), neon, true, 0.5 * k.neon);
  }
  return [a, a + ow, 0, rt];
}

/** How far out a shop's awning reaches. */
const AWNING = m(0.9);

/**
 * A blade sign's depth, and the least it is built at where the room is short (a column whose
 * face has less room than that gets no blade, its windows only).
 */
const BLADE = m(1.4);
const BLADE_MIN = m(0.15) + m(0.6) + 0.1;

/** How far out a balcony reaches from the wall (its slab, rail and what hangs on it). */
const BALCONY_REACH = PROUD + m(1.1);

/**
 * A balcony, in place of a window: a tall door behind a slab with a sheet-metal front and ends, and on it, by chance,
 * laundry on a rod, an AC unit on the wall or a planter on the rail; now and then a neon strip under
 * the slab. Returns the door's hole.
 */
function balcony(f: Face, r: Rng, fl: Storey, a: number, ow: number, lit: boolean): Hole {
  const { k, s } = f;
  const ww = Math.min(ow - m(0.3), m(1.4));
  const wa = a + (ow - ww) / 2;
  const sill = fl.open + m(0.1);
  const wh = fl.rt - fl.open - m(0.45);
  if (lit) sideBox(k, s, wa + 0.1, sill, -RECESS, ww - 0.2, wh - 0.1, 0.15, r.pick(LIGHTS), true, r.range(0.6, 1));
  sideBox(k, s, wa + ww / 2 - m(0.05), sill, -RECESS, m(0.1), wh, RECESS * 0.6, TRIM);

  const lo = Math.max(f.lo, a - LEDGE);
  const len = Math.min(f.hi, a + ow + LEDGE) - lo;
  const y = fl.open;
  const deep = m(1.1);
  const front = PROUD + deep;
  const t = m(0.1);
  const rail = vary(r, r.pick(RAILS), 0.08);
  k.occupy(sideBounds(s, lo, y - m(0.25), 0, len, m(1.3), front), "balcony");
  sideBox(k, s, lo, y - m(0.2), PROUD, len, m(0.2), deep, vary(r, PAL.concrete, 0.06));
  sideBox(k, s, lo, y, front - t, len, m(1), t, rail);
  for (const e of [lo, lo + len - t]) sideBox(k, s, e, y, PROUD, t, m(1), deep - t, rail);
  if (r.chance(0.25)) sideBox(k, s, lo + m(0.1), y - m(0.25), front - m(0.15), len - m(0.2), m(0.05), m(0.1), r.pick(NEON), true, 0.6 * k.neon);

  const roll = r.next();
  if (roll < 0.4 && len > m(1)) {
    // Laundry: a rod under the floor above, and a few cloths of different sizes hanging from it.
    const rod = y + m(2.2);
    sideBox(k, s, lo + m(0.15), rod, front - m(0.35), len - m(0.3), m(0.05), m(0.05), PAL.steel);
    const count = r.int(2, 4);
    const step = (len - m(0.5)) / count;
    for (let c = 0; c < count; c++) {
      const cw = Math.min(step - m(0.05), r.range(m(0.3), m(0.55)));
      const ch = r.range(m(0.4), m(0.8));
      sideBox(k, s, lo + m(0.25) + c * step, rod - ch, front - m(0.35) + 0.05, cw, ch, 0.15, vary(r, r.pick(CLOTH), 0.1));
    }
  } else if (roll < 0.65 && len > m(1)) {
    // An AC unit on the wall beside the door, above the rail.
    const ay = y + m(1.45);
    const out = PROUD + m(0.1);
    sideBox(k, s, lo + m(0.12), ay, out, m(0.8), m(0.55), m(0.4), vary(r, PAL.pale, 0.05));
    sideBox(k, s, lo + m(0.18), ay + m(0.08), out + m(0.4), m(0.42), m(0.38), 0.08, PAL.charcoal);
  } else if (roll < 0.85) {
    // A planter on the rail.
    const pa = lo + len * r.range(0.15, 0.5);
    const pw = Math.min(m(0.6), len * 0.4);
    sideBox(k, s, pa, y + m(1), front - m(0.35), pw, m(0.25), m(0.35), PAL.trunk);
    sideBox(k, s, pa + m(0.05), y + m(1.25), front - m(0.32), pw - m(0.1), m(0.3), m(0.3), vary(r, PAL.leaf, 0.15));
  }
  return [wa, wa + ww, sill, sill + wh];
}

/**
 * N as a blade sign: one storey of a sign standing out from the pier centered at `pier`, held by a
 * bracket, with glyph cells on both faces and a neon edge. A column of them makes one tall sign.
 */
function blade(f: Face, r: Rng, fl: Storey, pier: number, col: Column) {
  const { k, s } = f;
  // Narrower than the pier less the balconies' ledges either side, so the two never meet.
  const t = 1.25;
  const ba = pier - t / 2;
  const out = m(0.15);
  // As deep as BLADE, or as the room allows (BLADE_MIN at the least: see the caller).
  const deep = Math.min(BLADE, f.room - out - 0.1);
  const h = fl.rt - fl.rb;
  k.occupy(sideBounds(s, ba - 0.05, fl.rb, out, t + 0.1, h, deep), "sign");
  sideBox(k, s, ba, fl.rb, out, t, h, deep, PAL.charcoal);
  sideBox(k, s, ba + t * 0.3, fl.rt - m(0.4), 0, t * 0.4, m(0.15), out, PAL.steel);
  sideBox(k, s, ba + t * 0.3, fl.rb + m(0.1), out + deep, t * 0.4, h - m(0.2), 0.08, col.color, true, 0.7 * k.neon);
  const cell = m(0.75);
  for (let q = 0; q < Math.floor((h - m(0.4)) / cell); q++) {
    for (let bit = 0; bit < 4; bit++) {
      if (!r.chance(0.6)) continue;
      sideBox(k, s, ba - 0.05, fl.rb + m(0.25) + q * cell + ((bit / 2) | 0) * m(0.3), out + m(0.25) + (bit % 2) * m(0.5), t + 0.1, m(0.25), m(0.4), col.color, true, 0.95 * k.neon);
    }
  }
}

/**
 * V: a service bay. Two pipes run down its right side, floor after floor into one line, held by a
 * bracket; beside them a louvered vent grille, or on the ground floor a roller shutter with a
 * warning light. Returns the grille's or shutter's hole, if there is room for one.
 */
function service_(f: Face, r: Rng, fl: Storey, a: number, ow: number): Hole | null {
  const { k, s } = f;
  const run = m(0.6);
  const pa = a + ow - run - m(0.05);
  const y1 = fl.top ? fl.rt - m(0.3) : fl.rt;
  k.occupy(sideBounds(s, pa - m(0.05), fl.rb, 0, run + m(0.1), y1 - fl.rb, PROUD + m(0.3)), "pipe");
  for (const q of [0, 1]) sideBox(k, s, pa + q * m(0.35), fl.rb, PROUD, m(0.25), y1 - fl.rb, m(0.25), q ? PAL.rust : PAL.steel);
  sideBox(k, s, pa - m(0.05), fl.rb + m(1.6), 0, run + m(0.1), m(0.12), PROUD + m(0.3), PAL.charcoal);

  const room = pa - a - m(0.25);
  if (fl.ground) {
    const dw = Math.min(room, m(2.5));
    if (dw < m(0.8)) return null;
    const da = a + m(0.1);
    const dh = Math.min(fl.rt - m(0.8), m(3));
    sideBox(k, s, da, 0, -RECESS, dw, dh, RECESS, PAL.gunmetal);
    for (let y = m(0.4); y < dh - m(0.1); y += m(0.4)) sideBox(k, s, da + m(0.05), y, 0, dw - m(0.1), m(0.05), 0.06, PAL.charcoal);
    sideBox(k, s, da + dw / 2 - m(0.15), dh + m(0.15), 0, m(0.3), m(0.12), m(0.12), r.chance(0.5) ? PAL.amber : PAL.red, true, 0.7 * k.neon);
    return [da, da + dw, 0, dh];
  }
  if (room < m(0.4)) return null;
  const ga = a + m(0.1);
  const gy = fl.open + m(0.5);
  const gh = Math.min(m(1.2), fl.rt - fl.open - m(0.9));
  sideBox(k, s, ga, gy, -RECESS, room, gh, RECESS - m(0.05), PAL.charcoal);
  for (let y = gy + m(0.1); y < gy + gh - m(0.1); y += m(0.2)) sideBox(k, s, ga + m(0.05), y, -m(0.05), room - m(0.1), m(0.08), m(0.08), PAL.gunmetal);
  return [ga, ga + room, gy, gy + gh];
}


/** Kit.vary, drawn from a local generator rather than the kit's running one. */
function vary(r: Rng, color: Hex, amount: number): RGB {
  return shade(lin(color), 1 + amount * (2 * r.next() - 1));
}
