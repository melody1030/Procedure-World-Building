/**
 * Geometry built by the pipeline as plain typed arrays (no three.js), so generation stays pure and
 * the renderer only wraps finished buffers.
 */

export type RGB = [number, number, number];
export type Color = number | RGB;

export interface GeometryData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint32Array;
  /**
   * Per vertex, where it lies on the cubes it is drawn as (x, y, z in cubes, and 1; 0 for none),
   * for the voxel look (render/voxelLook.ts); only from builders that were given a grid.
   */
  voxel?: Float32Array;
}

const linearCache = new Map<number, RGB>();
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** sRGB hex → linear RGB (what vertex colors need). Cached. */
export function lin(hex: number): RGB {
  let rgb = linearCache.get(hex);
  if (!rgb) {
    rgb = [toLinear(((hex >> 16) & 255) / 255), toLinear(((hex >> 8) & 255) / 255), toLinear((hex & 255) / 255)];
    linearCache.set(hex, rgb);
  }
  return rgb;
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (a: RGB, s: number): RGB => [a[0] * s, a[1] * s, a[2] * s];
const rgbOf = (c: Color): RGB => (typeof c === "number" ? lin(c) : c);

export class GeometryBuilder {
  private pos = new Float32Array(3 * 4096);
  private nor = new Float32Array(3 * 4096);
  private col = new Float32Array(3 * 4096);
  private idx = new Uint32Array(6 * 1024);
  private vox: Float32Array | null = null;
  private v = 0;
  private i = 0;
  /** The grid the next quads are drawn on: its origin and cubes per unit along each axis (see `grid`). */
  private frame: number[] | null = null;

  /**
   * The quads from here on are drawn as cubes of side `cell` on a grid from the builder's own origin
   * (before `place` turns and moves them), so neighboring boxes' cubes line up; 0 for none.
   */
  grid(cell: number) {
    if (!cell) {
      this.frame = null;
      return;
    }
    this.frame = [0, 0, 0, 1 / cell, 1 / cell, 1 / cell];
    this.vox ??= new Float32Array((this.pos.length / 3) * 4);
  }

  private reserve(nv: number, ni: number) {
    if (this.v + nv > this.pos.length / 3) {
      const verts = Math.max((this.pos.length / 3) * 2, this.v + nv);
      const grow = (a: Float32Array, per: number) => {
        const b = new Float32Array(verts * per);
        b.set(a);
        return b;
      };
      this.pos = grow(this.pos, 3);
      this.nor = grow(this.nor, 3);
      this.col = grow(this.col, 3);
      if (this.vox) this.vox = grow(this.vox, 4);
    }
    if (this.i + ni > this.idx.length) {
      const b = new Uint32Array(Math.max(this.idx.length * 2, this.i + ni));
      b.set(this.idx);
      this.idx = b;
    }
  }

  /**
   * One quad. `c` holds 4 corners × (x, y, z), counter-clockwise seen from the front. `bottom`
   * colors corners 0–1 and `top` corners 2–3 (pass the same color for a flat face).
   */
  quad(c: ArrayLike<number>, nx: number, ny: number, nz: number, bottom: Color, top: Color = bottom) {
    this.reserve(4, 6);
    const b = rgbOf(bottom);
    const t = rgbOf(top);
    const v = this.v;
    for (let j = 0; j < 4; j++) {
      const o = (v + j) * 3;
      this.pos[o] = c[j * 3];
      this.pos[o + 1] = c[j * 3 + 1];
      this.pos[o + 2] = c[j * 3 + 2];
      this.nor[o] = nx;
      this.nor[o + 1] = ny;
      this.nor[o + 2] = nz;
      const rgb = j < 2 ? b : t;
      this.col[o] = rgb[0];
      this.col[o + 1] = rgb[1];
      this.col[o + 2] = rgb[2];
      if (this.vox) {
        const f = this.frame;
        const q = (v + j) * 4;
        this.vox[q] = f ? (c[j * 3] - f[0]) * f[3] : 0;
        this.vox[q + 1] = f ? (c[j * 3 + 1] - f[1]) * f[4] : 0;
        this.vox[q + 2] = f ? (c[j * 3 + 2] - f[2]) * f[5] : 0;
        this.vox[q + 3] = f ? 1 : 0;
      }
    }
    const i = this.i;
    this.idx[i] = v;
    this.idx[i + 1] = v + 1;
    this.idx[i + 2] = v + 2;
    this.idx[i + 3] = v;
    this.idx[i + 4] = v + 2;
    this.idx[i + 5] = v + 3;
    this.v += 4;
    this.i += 6;
  }

  /** Vertices so far. */
  get count() {
    return this.v;
  }

  /** Turns the vertices from `from` on by `angle` about y, then moves them by (x, y, z). */
  place(from: number, angle: number, x: number, y: number, z: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let v = from; v < this.v; v++) {
      const o = v * 3;
      const px = this.pos[o];
      const pz = this.pos[o + 2];
      this.pos[o] = px * c + pz * s + x;
      this.pos[o + 1] += y;
      this.pos[o + 2] = -px * s + pz * c + z;
      const nx = this.nor[o];
      const nz = this.nor[o + 2];
      this.nor[o] = nx * c + nz * s;
      this.nor[o + 2] = -nx * s + nz * c;
    }
  }

  finish(): GeometryData {
    return {
      position: this.pos.slice(0, this.v * 3),
      normal: this.nor.slice(0, this.v * 3),
      color: this.col.slice(0, this.v * 3),
      index: this.idx.slice(0, this.i),
      ...(this.vox ? { voxel: this.vox.slice(0, this.v * 4) } : {}),
    };
  }
}
