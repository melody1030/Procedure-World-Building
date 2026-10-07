/**
 * Geometry built by the pipeline as plain typed arrays (no three.js), so generation stays pure and
 * the renderer only wraps finished buffers.
 *
 * Every vertex can carry a growth pair (birth, base): the time in [0, 1] its piece of the city is
 * built, and the y it rises from. The renderer hides anything not yet born and animates it up
 * from its base, which is how the growth timeline replays the city.
 */

export type RGB = [number, number, number];
export type Colour = number | RGB;

export interface GeometryData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** (birth, base) per vertex. */
  growth: Float32Array;
  index: Uint32Array;
}

const linearCache = new Map<number, RGB>();
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** sRGB hex → linear RGB (what vertex colours need). Cached. */
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
const rgbOf = (c: Colour): RGB => (typeof c === "number" ? lin(c) : c);

export interface BoxOptions {
  /** Colour of the top face, if different. */
  top?: Colour;
  /** Draw the bottom face (off by default: it is almost never seen). */
  bottom?: boolean;
  /** Skip the four side faces (e.g. a flat deck). */
  noSides?: boolean;
}

export class GeometryBuilder {
  private pos = new Float32Array(3 * 4096);
  private nor = new Float32Array(3 * 4096);
  private col = new Float32Array(3 * 4096);
  private grw = new Float32Array(2 * 4096);
  private idx = new Uint32Array(6 * 1024);
  private v = 0;
  private i = 0;

  get vertices(): number {
    return this.v;
  }

  private reserve(nv: number, ni: number) {
    if (this.v + nv > this.pos.length / 3) {
      const size = Math.max(this.pos.length * 2, (this.v + nv) * 3);
      const grow = <T extends Float32Array>(a: T, per: number) => {
        const b = new Float32Array((size / 3) * per);
        b.set(a);
        return b;
      };
      this.pos = grow(this.pos, 3);
      this.nor = grow(this.nor, 3);
      this.col = grow(this.col, 3);
      this.grw = grow(this.grw, 2);
    }
    if (this.i + ni > this.idx.length) {
      const b = new Uint32Array(Math.max(this.idx.length * 2, this.i + ni));
      b.set(this.idx);
      this.idx = b;
    }
  }

  /**
   * One quad. `c` holds 4 corners × (x, y, z), counter-clockwise seen from the front. `bottom`
   * colours corners 0–1 and `top` corners 2–3 (pass the same colour for a flat face).
   */
  quad(c: ArrayLike<number>, nx: number, ny: number, nz: number, bottom: Colour, top: Colour = bottom, birth = 0, base = 0) {
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
      this.grw[(v + j) * 2] = birth;
      this.grw[(v + j) * 2 + 1] = base;
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

  /** Axis-aligned box with its minimum corner at (x, y, z). */
  box(x: number, y: number, z: number, w: number, h: number, d: number, colour: Colour, birth = 0, base = y, opts: BoxOptions = {}) {
    const x1 = x + w;
    const y1 = y + h;
    const z1 = z + d;
    const top = opts.top ?? colour;
    this.quad([x, y1, z1, x1, y1, z1, x1, y1, z, x, y1, z], 0, 1, 0, top, top, birth, base);
    if (!opts.noSides) {
      this.quad([x1, y, z1, x1, y, z, x1, y1, z, x1, y1, z1], 1, 0, 0, colour, colour, birth, base);
      this.quad([x, y, z, x, y, z1, x, y1, z1, x, y1, z], -1, 0, 0, colour, colour, birth, base);
      this.quad([x, y, z1, x1, y, z1, x1, y1, z1, x, y1, z1], 0, 0, 1, colour, colour, birth, base);
      this.quad([x1, y, z, x, y, z, x, y1, z, x1, y1, z], 0, 0, -1, colour, colour, birth, base);
    }
    if (opts.bottom) this.quad([x, y, z, x1, y, z, x1, y, z1, x, y, z1], 0, -1, 0, colour, colour, birth, base);
  }

  /** A flat rectangle facing one of the six axis directions, e.g. a window on a wall. */
  panel(axis: "x+" | "x-" | "z+" | "z-" | "y+", p: number, a0: number, a1: number, y0: number, y1: number, colour: Colour, birth = 0, base = 0) {
    switch (axis) {
      case "x+":
        this.quad([p, y0, a1, p, y0, a0, p, y1, a0, p, y1, a1], 1, 0, 0, colour, colour, birth, base);
        break;
      case "x-":
        this.quad([p, y0, a0, p, y0, a1, p, y1, a1, p, y1, a0], -1, 0, 0, colour, colour, birth, base);
        break;
      case "z+":
        this.quad([a0, y0, p, a1, y0, p, a1, y1, p, a0, y1, p], 0, 0, 1, colour, colour, birth, base);
        break;
      case "z-":
        this.quad([a1, y0, p, a0, y0, p, a0, y1, p, a1, y1, p], 0, 0, -1, colour, colour, birth, base);
        break;
      case "y+":
        // a0..a1 along x, y0..y1 reused as z0..z1, p is the height.
        this.quad([a0, p, y1, a1, p, y1, a1, p, y0, a0, p, y0], 0, 1, 0, colour, colour, birth, base);
        break;
    }
  }

  finish(): GeometryData {
    return {
      position: this.pos.slice(0, this.v * 3),
      normal: this.nor.slice(0, this.v * 3),
      color: this.col.slice(0, this.v * 3),
      growth: this.grw.slice(0, this.v * 2),
      index: this.idx.slice(0, this.i),
    };
  }
}
