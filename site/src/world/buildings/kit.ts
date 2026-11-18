import { GeometryBuilder, lin, shade, type GeometryData, type RGB } from "../geometry";
import { Rng } from "../rng";
import { voxels } from "../scale";

/**
 * The building kit's base: a box builder with two buckets, so a whole building is two draw calls.
 * - `solid`: lit surfaces (walls, slabs, roofs, props), drawn with a standard material.
 * - `glow`: light sources (lit windows, neon, signs, warning lights), drawn unlit and bright.
 *
 * Everything is in voxels (0.25 m), y up, with the building's footprint starting at (0, 0, 0).
 * Pure: no three.js, so buildings can be generated anywhere and wrapped by the renderer.
 */

/** Meters → voxels, rounded to a quarter voxel so boxes line up. */
export const m = (meters: number) => Math.round(voxels(meters) * 4) / 4;
/** Meters → whole voxels: the masses (footprints, storeys, wings) stand on the voxels' grid (render/voxelLook.ts). */
export const whole = (meters: number) => Math.round(voxels(meters));

/** The fine voxel (a quarter voxel): what parts smaller than a voxel are drawn in (render/voxelLook.ts). */
export const FINE = 0.25;

/** One storey (3 m). */
export const FLOOR = m(3);

/** Building colors (sRGB hex): dark masses, cold metal, warm windows, a few neon accents. */
export const PAL = {
  // Structure
  night: 0x161c2e,
  navy: 0x26324f,
  charcoal: 0x2e3445,
  slate: 0x4a5470,
  steel: 0x65718c,
  concrete: 0x7b8396,
  pale: 0xa9b1c2,
  indigo: 0x332d63,
  plum: 0x4a3762,
  rust: 0x6b463c,
  warmGray: 0x5c5862,
  teal: 0x34505a,
  wine: 0x4a2a3c,
  gunmetal: 0x4c5560,
  // Glass (unlit) and greenery
  glass: 0x0e1626,
  glassBlue: 0x16233d,
  solar: 0x1d3b6e,
  leaf: 0x4f7a4f,
  leafDark: 0x355a3f,
  trunk: 0x4a3a30,
  // Light
  warm: 0xffb85c,
  amber: 0xffcf7a,
  dim: 0xc9874a,
  cyan: 0x3ee6ff,
  mint: 0x5cffa8,
  blue: 0x4f8dff,
  magenta: 0xff3fb4,
  violet: 0xa45bff,
  red: 0xff3b3b,
  yellow: 0xffd23f,
  white: 0xe8f1ff,
} as const;

export type Hex = number;

/** What a recorded part is, for clash checks (see overlaps.ts). */
export type FixtureKind = "mass" | "ac" | "balcony" | "billboard" | "sign" | "roofgear" | "plant" | "prop" | "bridge" | "platform" | "pipe" | "shopfront" | "fin" | "entrance";

/** Which faces to draw: a box on the ground skips its underside; one off the ground draws it, so
 * balconies, cantilevers and bridges are solid seen from below. */
const ALL = 0b111111;
// Bits follow `put`: +x 1, −x 2, +y 4, −y 8, +z 16, −z 32; this drops −y (8).
const ALL_BUT_BOTTOM = ALL & ~8;
const facesFor = (y: number) => (y > 0.01 ? ALL : ALL_BUT_BOTTOM);

/**
 * The gap that keeps two surfaces out of the same plane, in voxels. Parts that meet a wall stand
 * this far proud of it, so no two faces ever share a plane and flicker against each other: one
 * fine voxel, so they stay on the grid.
 */
export const PROUD = 0.25;
/**
 * Snapped to the grid, a detail often ends in the same plane as the wall, frame or pane drawn
 * before it, and the two would flicker against each other. So each face drawn is checked against
 * the faces already in its plane, looking the same way: where it overlaps one, it is drawn a LAYER
 * in front of the frontmost it overlaps, the box growing out to it. The later part (the detail)
 * shows. In voxels; at most LAYERS deep.
 */
const LAYER = 0.02;
const LAYERS = 5;
/** The squares faces are filed in, by plane, for the LAYER check (voxels). */
const BIN = 8;

export class Kit {
  readonly solid = new GeometryBuilder();
  readonly glow = new GeometryBuilder();
  readonly rng: Rng;
  /** Highest point so far, in voxels. */
  top = 0;
  /** Brightness of neon and signs (0–1), from the building's neonIntensity. */
  neon = 1;
  /** While set, boxes skip their underside even off the ground (for masses standing on something). */
  grounded = false;
  /**
   * While set, [x0, z0, x1, z1]: the room the building must keep within (its lot less a gap). Every
   * box is cut at it, so nothing (an awning, a sign) reaches past; a cut side gets its face.
   */
  clip: [number, number, number, number] | null = null;
  /** Cuts so far: each is pulled in by its own hair, so no two cut faces share a plane. */
  private cuts = 0;
  /** Faces drawn so far, by plane, the way they look and square (see BIN): [u0, u1, v0, v1, layer] each (see LAYER). */
  private planes = new Map<number, Map<number, number[][]>>();
  /**
   * Space taken by things fixed to facades, as world boxes [x0, y0, z0, x1, y1, z1] with what
   * they are, so signs and screens can find room that doesn't run into them.
   */
  readonly fixtures: { box: number[]; kind: FixtureKind }[] = [];

  /** Records a part's space. */
  occupy(box: number[], kind: FixtureKind) {
    this.fixtures.push({ box, kind });
  }

  /** The fixtures overlapping a box. */
  touching(b: number[]) {
    return this.fixtures.filter(({ box: f }) => f[0] < b[3] && f[3] > b[0] && f[1] < b[4] && f[4] > b[1] && f[2] < b[5] && f[5] > b[2]);
  }

  /** True if the box is clear of every fixture recorded so far. */
  clear(b: number[]): boolean {
    return this.touching(b).length === 0;
  }

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** A box at (x, y, z) of size (w, h, d), into the solid bucket. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: Hex | RGB, faces = this.grounded ? ALL_BUT_BOTTOM : facesFor(y)) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    [x, y, z, w, h, d] = this.snap(x, y, z, w, h, d);
    if (this.clip) [x, z, w, d, faces] = this.cut(x, z, w, d, faces);
    if (w <= 0 || h <= 0 || d <= 0) return;
    // Drawn as voxels if it is a voxel or more every way, else as fine voxels (a quarter voxel).
    const cell = Math.min(w, h, d) >= 0.9 ? 1 : FINE;
    [x, y, z, w, h, d] = this.layer(x, y, z, w, h, d, faces);
    this.solid.grid(cell);
    put(this.solid, x, y, z, w, h, d, typeof color === "number" ? lin(color) : color, faces);
    this.solid.grid(0);
    this.top = Math.max(this.top, y + h);
  }

  /** A box on the fine voxels' grid: each face moved to the nearest fine voxel (a box thinner than one is one thick). */
  private snap(x: number, y: number, z: number, w: number, h: number, d: number): [number, number, number, number, number, number] {
    const on = (a: number, s: number): [number, number] => {
      const a0 = Math.round(a / FINE) * FINE;
      return [a0, Math.max(FINE, Math.round((a + s) / FINE) * FINE - a0)];
    };
    const [sx, sw] = on(x, w);
    const [sy, sh] = on(y, h);
    const [sz, sd] = on(z, d);
    return [sx, sy, sz, sw, sh, sd];
  }

  /**
   * A box grown out of each drawn face that overlaps one already in its plane (see LAYER). (Growing
   * a face widens the faces beside it by a LAYER or so; those slivers are left, as finding them
   * again pushes long bands to the back of every layer.)
   */
  private layer(x: number, y: number, z: number, w: number, h: number, d: number, faces: number): [number, number, number, number, number, number] {
    const lo = [x, y, z];
    const hi = [x + w, y + h, z + d];
    const out = [...lo, ...hi];
    for (let axis = 0; axis < 3; axis++) {
      const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
      for (const up of [true, false]) {
        // Bits follow `put`: +x 1, −x 2, +y 4, −y 8, +z 16, −z 32.
        if (!(faces & (1 << (axis * 2 + (up ? 0 : 1))))) continue;
        const plane = Math.round((up ? hi : lo)[axis] * 1000) * 8 + axis * 2 + (up ? 1 : 0);
        const rect = [lo[u], hi[u], lo[v], hi[v], 0];
        // The plane in squares of BIN voxels, so a face is checked only against the faces near it;
        // a face over more than a few squares (a wall) goes in the plane's list of large ones (key -1).
        let squares = this.planes.get(plane);
        if (!squares) this.planes.set(plane, (squares = new Map([[-1, []]])));
        const i0 = Math.floor(rect[0] / BIN);
        const i1 = Math.floor(rect[1] / BIN);
        const j0 = Math.floor(rect[2] / BIN);
        const j1 = Math.floor(rect[3] / BIN);
        const larges = squares.get(-1)!;
        rect[4] = above(larges, rect, 0);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > 4) larges.push(rect);
        else {
          for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
              const square = (i + 1024) * 2048 + j + 1024;
              const list = squares.get(square);
              if (list) {
                rect[4] = above(list, rect, rect[4]);
                list.push(rect);
              } else squares.set(square, [rect]);
            }
          }
        }
        if (up) out[axis + 3] += rect[4] * LAYER;
        else out[axis] -= rect[4] * LAYER;
      }
    }
    return [out[0], out[1], out[2], out[3] - out[0], out[4] - out[1], out[5] - out[2]];
  }

  /** A box into the glow bucket. `strength` dims it (0–1) without changing its hue. */
  light(x: number, y: number, z: number, w: number, h: number, d: number, color: Hex, strength = 1, faces = facesFor(y)) {
    if (w <= 0 || h <= 0 || d <= 0) return;
    [x, y, z, w, h, d] = this.snap(x, y, z, w, h, d);
    if (this.clip) [x, z, w, d, faces] = this.cut(x, z, w, d, faces);
    if (w <= 0 || h <= 0 || d <= 0) return;
    [x, y, z, w, h, d] = this.layer(x, y, z, w, h, d, faces);
    put(this.glow, x, y, z, w, h, d, shade(lin(color), strength), faces);
    this.top = Math.max(this.top, y + h);
  }

  /** A box's footprint cut to `clip`, with a face on each cut side. */
  private cut(x: number, z: number, w: number, d: number, faces: number): [number, number, number, number, number] {
    const [x0, z0, x1, z1] = this.clip!;
    if (x >= x0 && z >= z0 && x + w <= x1 && z + d <= z1) return [x, z, w, d, faces];
    const hair = 0.0015 * (1 + (this.cuts++ % 100));
    let ex = x + w;
    let ez = z + d;
    if (x < x0) [x, faces] = [x0 + hair, faces | 2];
    if (ex > x1) [ex, faces] = [x1 - hair, faces | 1];
    if (z < z0) [z, faces] = [z0 + hair, faces | 32];
    if (ez > z1) [ez, faces] = [z1 - hair, faces | 16];
    return [x, z, ex - x, ez - z, faces];
  }

  /** A slight per-box variation of a color, so repeated modules don't look stamped. */
  vary(color: Hex, amount = 0.08): RGB {
    return shade(lin(color), 1 + amount * (2 * this.rng.next() - 1));
  }

  finish(): { solid: GeometryData; glow: GeometryData } {
    return { solid: this.solid.finish(), glow: this.glow.finish() };
  }
}

/** The layer a face [u0, u1, v0, v1, layer] goes on: in front of every face in `list` it overlaps, and of `layer`. */
function above(list: number[][], rect: number[], layer: number) {
  for (const r of list) if (r[0] < rect[1] - 1e-3 && r[1] > rect[0] + 1e-3 && r[2] < rect[3] - 1e-3 && r[3] > rect[2] + 1e-3) layer = Math.max(layer, Math.min(r[4] + 1, LAYERS));
  return layer;
}

/** Faces: +x, −x, +y, −y, +z, −z as bits 0–5. */
function put(b: GeometryBuilder, x: number, y: number, z: number, w: number, h: number, d: number, c: RGB, faces: number) {
  const x1 = x + w;
  const y1 = y + h;
  const z1 = z + d;
  // Tops a little lighter and sides a little darker, so blocks read even in flat light.
  const top = shade(c, 1.08);
  if (faces & 1) b.quad([x1, y, z1, x1, y, z, x1, y1, z, x1, y1, z1], 1, 0, 0, c);
  if (faces & 2) b.quad([x, y, z, x, y, z1, x, y1, z1, x, y1, z], -1, 0, 0, c);
  if (faces & 4) b.quad([x, y1, z1, x1, y1, z1, x1, y1, z, x, y1, z], 0, 1, 0, top);
  if (faces & 8) b.quad([x, y, z, x1, y, z, x1, y, z1, x, y, z1], 0, -1, 0, c);
  if (faces & 16) b.quad([x, y, z1, x1, y, z1, x1, y1, z1, x, y1, z1], 0, 0, 1, c);
  if (faces & 32) b.quad([x1, y, z, x, y, z, x, y1, z, x1, y1, z], 0, 0, -1, c);
}

/**
 * A side of a rectangular mass, so facade parts can be written once for all four sides.
 * `u` runs along the face (left to right seen from outside), the face looks out along `n`.
 */
export interface Side {
  /** Point at the face's left end, on the outer wall line, at the mass's base. */
  ox: number;
  oz: number;
  /** Unit direction along the face, and the outward normal (axis-aligned). */
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  /** Length along the face. */
  length: number;
}

/** The four sides of a mass with corner (x, z), size (w, d), counter-clockwise seen from above. */
export function sides(x: number, z: number, w: number, d: number): Side[] {
  return [
    { ox: x, oz: z + d, ux: 1, uz: 0, nx: 0, nz: 1, length: w }, // south (+z)
    { ox: x + w, oz: z + d, ux: 0, uz: -1, nx: 1, nz: 0, length: d }, // east (+x)
    { ox: x + w, oz: z, ux: -1, uz: 0, nx: 0, nz: -1, length: w }, // north (−z)
    { ox: x, oz: z, ux: 0, uz: 1, nx: -1, nz: 0, length: d }, // west (−x)
  ];
}

/**
 * A box placed in a side's frame: `a` along the face, `y` up, `out` outward from the wall line
 * (negative goes into the wall), with sizes `len` along, `h` up and `thick` outward.
 */
/** The world box [x0, y0, z0, x1, y1, z1] of a box placed in a side's frame (see sideBox). */
export function sideBounds(s: Side, a: number, y: number, out: number, len: number, h: number, thick: number): number[] {
  const ax = s.ox + s.ux * a + s.nx * out;
  const az = s.oz + s.uz * a + s.nz * out;
  const bx = ax + s.ux * len + s.nx * thick;
  const bz = az + s.uz * len + s.nz * thick;
  return [Math.min(ax, bx), y, Math.min(az, bz), Math.max(ax, bx), y + h, Math.max(az, bz)];
}

export function sideBox(k: Kit, s: Side, a: number, y: number, out: number, len: number, h: number, thick: number, color: Hex | RGB, glow = false, strength = 1) {
  // The two corners in the face's frame, mapped to world x/z.
  const ax = s.ox + s.ux * a + s.nx * out;
  const az = s.oz + s.uz * a + s.nz * out;
  const bx = ax + s.ux * len + s.nx * thick;
  const bz = az + s.uz * len + s.nz * thick;
  const x = Math.min(ax, bx);
  const z = Math.min(az, bz);
  const w = Math.abs(bx - ax);
  const d = Math.abs(bz - az);
  if (glow) k.light(x, y, z, w, h, d, color as Hex, strength);
  else k.box(x, y, z, w, h, d, color);
}
