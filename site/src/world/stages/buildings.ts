import { GeometryBuilder, lin, shade, type GeometryData, type RGB } from "../geometry";
import { CITY, SIGN_NEON, WINDOW } from "../palette";
import type { WorldParams } from "../params";
import { hash2, type Rng } from "../rng";
import { STOREY } from "../scale";
import type { Building, Facing } from "./growth";

/**
 * Stage 09, buildings. One generator per district, everything made of voxel boxes:
 *
 * - residential: a block with an optional setback top floor, balconies, a roof cap with water
 *   tanks and AC units, and a lit shopfront with a neon awning on the road side;
 * - core: towers in one to three tiers that step in as they rise, with neon corner strips, glowing
 *   bands, a blade sign, a roof billboard, and a spire or antenna on top;
 * - industrial: sheds with sawtooth roofs, smoke stacks with a warning light, and storage tanks;
 * - waterfront: low market halls with big signs;
 * - green: small cottages with stepped roofs and chimneys.
 *
 * Stacked housing (from the growth stage) is drawn as a prefab block in a different material on
 * top, offset by a voxel so it overhangs. Windows are quads on the walls: lit ones go into the glow
 * mesh (bloom picks them up), dark ones into the lit mesh.
 */

export interface BuildingMeshes {
  lit: GeometryData;
  glow: GeometryData;
  /** This seed's neon accents (cyan first). */
  neon: number[];
  litWindows: number;
}

/** Glow colours can go above 1: bloom uses that to know what shines brightest. */
const glow = (hex: number, intensity: number): RGB => shade(lin(hex), intensity);

interface Ctx {
  lit: GeometryBuilder;
  glow: GeometryBuilder;
  rng: Rng;
  half: number;
  neon: number[];
  litWindows: number;
  params: WorldParams["buildings"];
}

/** A sign's chance, scaled by the Signs setting. */
const sign = (c: Ctx, p: number) => c.rng.chance(Math.min(1, p * c.params.signs));

/** Face of a box: which wall, where it is, and the span along it. */
interface Face {
  axis: Facing;
  p: number;
  a0: number;
  len: number;
}

function faces(x0: number, z0: number, w: number, d: number, out = 0.06): Face[] {
  return [
    { axis: "x+", p: x0 + w + out, a0: z0, len: d },
    { axis: "x-", p: x0 - out, a0: z0, len: d },
    { axis: "z+", p: z0 + d + out, a0: x0, len: w },
    { axis: "z-", p: z0 - out, a0: x0, len: w },
  ];
}

function faceOf(x0: number, z0: number, w: number, d: number, side: Facing, out = 0.06): Face {
  return faces(x0, z0, w, d, out).find((f) => f.axis === side)!;
}

function windows(
  c: Ctx,
  id: number,
  x0: number,
  z0: number,
  w: number,
  d: number,
  y0: number,
  storeys: number,
  from: number,
  litP: number,
  palette: number[],
  birth: number,
  base: number,
) {
  const dark = lin(WINDOW.dark);
  faces(x0, z0, w, d).forEach((f, fi) => {
    const count = Math.floor((f.len - 2) / 3);
    if (count < 1) return;
    const offset = (f.len - count * 3) / 2;
    for (let s = from; s < storeys; s++) {
      const wy0 = y0 + s * STOREY + 1.8;
      const wy1 = wy0 + 2.4;
      for (let i = 0; i < count; i++) {
        const a0 = f.a0 + offset + i * 3 + 0.7;
        const h = hash2(id * 7 + fi, s * 31 + i, 77);
        if (h < litP * c.params.windows) {
          const colour = palette[Math.floor(hash2(id, s * 13 + i, 5) * palette.length)];
          c.glow.panel(f.axis, f.p, a0, a0 + 1.6, wy0, wy1, glow(colour, 0.7 + 0.6 * hash2(i, s, id)), birth, base);
          c.litWindows++;
        } else c.lit.panel(f.axis, f.p, a0, a0 + 1.6, wy0, wy1, dark, birth, base);
      }
    }
  });
}

/** A lit ground-floor shop with a neon awning on the road side. */
function shopfront(c: Ctx, b: Building, x0: number, z0: number, w: number, d: number) {
  const f = faceOf(x0, z0, w, d, b.front);
  const inset = f.len * 0.15;
  const neon = c.neon[Math.floor(hash2(b.id, 3, 9) * c.neon.length)];
  c.glow.panel(f.axis, f.p, f.a0 + inset, f.a0 + f.len - inset, b.y + 2.5, b.y + 3.2, glow(neon, 2), b.birth, b.y);
  c.glow.panel(f.axis, f.p, f.a0 + inset + 0.5, f.a0 + f.len - inset - 0.5, b.y + 0.3, b.y + 2.2, glow(WINDOW.warm[b.id % 4], 0.9), b.birth, b.y);
}

/** A box laid along one face, `depth` out from it (balconies, blade signs). */
function outFrom(c: GeometryBuilder, f: Face, a0: number, a1: number, y: number, h: number, depth: number, colour: number | RGB, birth: number, base: number) {
  const s = f.axis === "x+" || f.axis === "z+" ? 1 : -1;
  const p0 = s > 0 ? f.p : f.p - depth;
  if (f.axis[0] === "x") c.box(p0, y, a0, depth, h, a1 - a0, colour, birth, base);
  else c.box(a0, y, p0, a1 - a0, h, depth, colour, birth, base);
}

function residential(c: Ctx, b: Building, x0: number, z0: number) {
  const { rng } = c;
  const { w, d, y, storeys, birth } = b;
  const wall = lin(rng.pick(CITY.walls.residential));
  const H = storeys * STOREY;
  const setback = storeys >= 4 && rng.chance(0.55);
  const bodyStoreys = setback ? storeys - 1 : storeys;
  const bodyH = bodyStoreys * STOREY;
  const shop = storeys >= 2 && sign(c, 0.55);
  c.lit.box(x0, y, z0, w, bodyH, d, wall, birth, y, { top: lin(CITY.roof) });
  windows(c, b.id, x0, z0, w, d, y, bodyStoreys, shop ? 1 : 0, 0.42, WINDOW.warm, birth, y);
  if (shop) shopfront(c, b, x0, z0, w, d);
  if (setback) {
    c.lit.box(x0 + 1, y + bodyH, z0 + 1, w - 2, STOREY, d - 2, shade(wall, 0.85), birth, y, { top: lin(CITY.roof) });
    windows(c, b.id + 5000, x0 + 1, z0 + 1, w - 2, d - 2, y + bodyH, 1, 0, 0.5, WINDOW.warm, birth, y);
  }
  // Balconies on the road side.
  const f = faceOf(x0, z0, w, d, b.front, 0);
  for (let s = 1; s < bodyStoreys; s++) {
    if (!rng.chance(0.35)) continue;
    outFrom(c.lit, f, f.a0 + 1, f.a0 + f.len - 1, y + s * STOREY, 0.3, 1.2, lin(CITY.concrete), birth, y);
    outFrom(c.lit, faceOf(x0, z0, w, d, b.front, 1.0), f.a0 + 1, f.a0 + f.len - 1, y + s * STOREY + 0.3, 0.9, 0.2, lin(CITY.metal), birth, y);
  }
  if (!b.extension) roofClutter(c, b, x0 + (setback ? 1 : 0), z0 + (setback ? 1 : 0), w - (setback ? 2 : 0), d - (setback ? 2 : 0), y + H, birth, y);
}

function roofClutter(c: Ctx, b: Building, x0: number, z0: number, w: number, d: number, top: number, birth: number, base: number) {
  const { rng } = c;
  if (w >= 7 && d >= 7 && rng.chance(0.6)) {
    const tx = x0 + rng.range(1, w - 4);
    const tz = z0 + rng.range(1, d - 4);
    c.lit.box(tx, top, tz, 3, 1.5, 3, lin(CITY.metal), birth, base);
    c.lit.box(tx + 0.2, top + 1.5, tz + 0.2, 2.6, 2.4, 2.6, lin(CITY.rust), birth, base);
  }
  const ac = rng.int(0, 3);
  for (let i = 0; i < ac && w > 3 && d > 3; i++) c.lit.box(x0 + rng.range(0.5, w - 1.8), top, z0 + rng.range(0.5, d - 1.8), 1.3, 1, 1.3, lin(CITY.concrete), birth, base);
  if (rng.chance(0.25) && b.storeys >= 3) {
    const ax = x0 + w / 2;
    const az = z0 + d / 2;
    c.lit.box(ax, top, az, 0.3, rng.range(3, 6), 0.3, lin(CITY.metal), birth, base);
  }
}

function core(c: Ctx, b: Building, x0: number, z0: number) {
  const { rng } = c;
  const { w, d, y, storeys, birth } = b;
  const wall = lin(rng.pick(CITY.walls.core));
  const tiers = storeys >= 14 ? 3 : storeys >= 7 ? 2 : 1;
  const shares = tiers === 3 ? [0.5, 0.3, 0.2] : tiers === 2 ? [0.65, 0.35] : [1];
  const accent = c.neon[rng.int(0, c.neon.length - 1)];
  const edges = b.band === "landmark" || rng.chance(0.5);
  const banded = rng.chance(0.4);
  let ty = y;
  let inset = 0;
  let left = storeys;
  let top = { x0, z0, w, d };
  for (let t = 0; t < tiers; t++) {
    const ts = t === tiers - 1 ? left : Math.max(1, Math.round(storeys * shares[t]));
    left -= ts;
    const tw = Math.max(6, w - 2 * inset);
    const td = Math.max(6, d - 2 * inset);
    const tx = x0 + (w - tw) / 2;
    const tz = z0 + (d - td) / 2;
    const th = ts * STOREY;
    c.lit.box(tx, ty, tz, tw, th, td, shade(wall, 1 - t * 0.06), birth, y, { top: lin(CITY.roof) });
    windows(c, b.id * 3 + t, tx, tz, tw, td, ty, ts, t === 0 ? 1 : 0, 0.55, WINDOW.cool, birth, y);
    if (edges) {
      for (const [cx, cz] of [
        [tx - 0.1, tz - 0.1],
        [tx + tw - 0.25, tz - 0.1],
        [tx - 0.1, tz + td - 0.25],
        [tx + tw - 0.25, tz + td - 0.25],
      ])
        c.glow.box(cx, ty, cz, 0.35, th, 0.35, glow(accent, 1.8), birth, y);
    }
    if (banded) {
      for (let s = 5; s < ts; s += 5) {
        const by = ty + s * STOREY - 0.3;
        for (const f of faces(tx, tz, tw, td, 0.08)) c.glow.panel(f.axis, f.p, f.a0, f.a0 + f.len, by, by + 0.3, glow(accent, 1.6), birth, y);
      }
    }
    top = { x0: tx, z0: tz, w: tw, d: td };
    ty += th;
    inset += rng.int(1, 3);
  }
  shopfront(c, b, x0, z0, w, d);

  // Blade sign: segments of light on a dark frame, standing out from the road-side wall.
  const H = storeys * STOREY;
  if (storeys >= 6 && sign(c, 0.65)) {
    const f = faceOf(x0, z0, w, d, b.front, 0);
    const a = f.a0 + (rng.chance(0.5) ? 1 : f.len - 1.6);
    const hs = Math.min(20, H * 0.45);
    const sy = y + Math.min(H * shares[0], H) - hs - STOREY * 0.5;
    const colour = c.neon[rng.int(0, c.neon.length - 1)];
    outFrom(c.lit, f, a, a + 0.6, sy, hs, 2.6, lin(WINDOW.dark), birth, y);
    for (let s = sy + 0.4; s + 1.2 < sy + hs; s += 1.7) outFrom(c.glow, faceOf(x0, z0, w, d, b.front, 0.1), a - 0.05, a + 0.65, s, 1.2, 2.4, glow(colour, 2.2), birth, y);
  }
  // Roof: billboard, spire or antenna.
  if (top.w >= 10 && sign(c, 0.3)) {
    const f = faceOf(top.x0, top.z0, top.w, top.d, b.front, -2);
    outFrom(c.lit, f, f.a0 + 1, f.a0 + f.len - 1, ty, 1, 0.4, lin(CITY.metal), birth, y);
    outFrom(c.glow, f, f.a0 + 1, f.a0 + f.len - 1, ty + 1, 4.5, 0.4, glow(c.neon[rng.int(0, c.neon.length - 1)], 1.7), birth, y);
  } else if (b.band === "landmark") {
    const cx = top.x0 + top.w / 2;
    const cz = top.z0 + top.d / 2;
    const sh = rng.range(12, 20);
    c.lit.box(cx - 0.6, ty, cz - 0.6, 1.2, sh, 1.2, lin(CITY.metal), birth, y);
    c.glow.box(cx - 0.5, ty + sh, cz - 0.5, 1, 1, 1, glow(0xff3b3b, 2.5), birth, y);
    for (const f of faces(top.x0, top.z0, top.w, top.d, 0.1)) c.glow.panel(f.axis, f.p, f.a0, f.a0 + f.len, ty - 1.2, ty - 0.6, glow(accent, 2), birth, y);
  } else if (rng.chance(0.5)) {
    const ah = rng.range(4, 9);
    c.lit.box(top.x0 + top.w / 2, ty, top.z0 + top.d / 2, 0.4, ah, 0.4, lin(CITY.metal), birth, y);
    c.glow.box(top.x0 + top.w / 2 - 0.1, ty + ah, top.z0 + top.d / 2 - 0.1, 0.6, 0.6, 0.6, glow(0xff3b3b, 2.2), birth, y);
  }
}

function industrial(c: Ctx, b: Building, x0: number, z0: number) {
  const { rng } = c;
  const { w, d, y, storeys, birth } = b;
  const wall = lin(rng.pick(CITY.walls.industrial));
  const H = storeys * STOREY;
  c.lit.box(x0, y, z0, w, H, d, wall, birth, y, { top: lin(CITY.roof) });
  windows(c, b.id, x0, z0, w, d, y, storeys, 0, 0.15, WINDOW.warm, birth, y);
  // Sawtooth roof.
  for (let i = 0.5; i + 2 <= w; i += 4) c.lit.box(x0 + i, y + H, z0 + 0.5, 2, 1.6, d - 1, shade(wall, 0.8), birth, y);
  // Stacks.
  if (w >= 14 && rng.chance(0.6)) {
    const stacks = rng.int(1, 2);
    for (let s = 0; s < stacks; s++) {
      const sx = x0 + 1 + s * 4;
      const sz = z0 + d - 4;
      const sh = rng.range(28, 46);
      c.lit.box(sx, y + H, sz, 2.6, sh, 2.6, lin(CITY.concrete), birth, y);
      c.lit.box(sx - 0.1, y + H + sh - 5, sz - 0.1, 2.8, 1.4, 2.8, lin(0x9a2e2e), birth, y);
      c.glow.box(sx + 0.9, y + H + sh, sz + 0.9, 0.8, 0.6, 0.8, glow(0xff3b3b, 2.4), birth, y);
    }
  }
  // Tanks beside the shed, if there is room on the roof.
  if (d >= 12 && w >= 12 && rng.chance(0.5)) {
    for (let t = 0; t < 2; t++) {
      const cx = x0 + w - 8 + (t ? 0 : -7);
      if (cx < x0) continue;
      c.lit.box(cx, y + H, z0 + 2, 6, 7, 4, lin(CITY.metal), birth, y);
      c.lit.box(cx + 1, y + H, z0 + 1, 4, 7, 6, lin(CITY.metal), birth, y);
    }
    c.lit.box(x0 + 1, y + H + 5, z0 + 3.5, w - 2, 0.6, 0.6, lin(CITY.rust), birth, y);
  }
}

function waterfront(c: Ctx, b: Building, x0: number, z0: number) {
  const { rng } = c;
  const { w, d, y, storeys, birth } = b;
  const wall = lin(rng.pick(CITY.walls.waterfront));
  const H = storeys * STOREY;
  c.lit.box(x0, y, z0, w, H, d, wall, birth, y, { top: lin(CITY.roof) });
  windows(c, b.id, x0, z0, w, d, y, storeys, 1, 0.4, WINDOW.warm, birth, y);
  shopfront(c, b, x0, z0, w, d);
  if (sign(c, 0.5)) {
    const f = faceOf(x0, z0, w, d, b.front, -0.5);
    outFrom(c.glow, f, f.a0 + 1, f.a0 + f.len - 1, y + H, 2.4, 0.4, glow(c.neon[rng.int(0, c.neon.length - 1)], 1.8), birth, y);
  }
  if (!b.extension) roofClutter(c, b, x0, z0, w, d, y + H, birth, y);
}

function cottage(c: Ctx, b: Building, x0: number, z0: number) {
  const { rng } = c;
  const { w, d, y, storeys, birth } = b;
  const H = storeys * STOREY;
  c.lit.box(x0, y, z0, w, H, d, lin(rng.pick(CITY.walls.green)), birth, y);
  windows(c, b.id, x0, z0, w, d, y, storeys, 0, 0.55, WINDOW.warm, birth, y);
  const roof = lin(0x4a3a36);
  c.lit.box(x0 - 0.5, y + H, z0 - 0.5, w + 1, 1.4, d + 1, roof, birth, y);
  c.lit.box(x0 + 1, y + H + 1.4, z0 + 1, w - 2, 1.4, d - 2, roof, birth, y);
  c.lit.box(x0 + 2, y + H + 2.8, z0 + 2, w - 4, 1, d - 4, roof, birth, y);
  c.lit.box(x0 + w - 2, y + H + 1, z0 + 1, 1, 3.5, 1, lin(CITY.concrete), birth, y);
}

function extension(c: Ctx, b: Building, x0: number, z0: number) {
  const e = b.extension!;
  const top = b.y + b.storeys * STOREY;
  const ew = Math.max(4, b.w - 2);
  const ed = Math.max(4, b.d - 2);
  const ex = x0 + 1 + e.dx;
  const ez = z0 + 1 + e.dz;
  c.lit.box(ex, top, ez, ew, e.storeys * STOREY, ed, lin(c.rng.pick(CITY.extension)), e.birth, top, { top: lin(CITY.roof), bottom: true });
  windows(c, b.id + 9000, ex, ez, ew, ed, top, e.storeys, 0, 0.5, WINDOW.warm, e.birth, top);
  roofClutter(c, b, ex, ez, ew, ed, top + e.storeys * STOREY, e.birth, top);
}

export function buildBuildings(rng: Rng, n: number, buildings: Building[], params: WorldParams["buildings"]): BuildingMeshes {
  const secondary = [...SIGN_NEON.secondary];
  const neon = [SIGN_NEON.cyan];
  for (let i = 0; i < 2; i++) neon.push(secondary.splice(rng.int(0, secondary.length - 1), 1)[0]);
  const c: Ctx = { lit: new GeometryBuilder(), glow: new GeometryBuilder(), rng, half: n / 2, neon, litWindows: 0, params };

  for (const b of buildings) {
    const x0 = b.x - c.half;
    const z0 = b.z - c.half;
    if (b.type === "core") core(c, b, x0, z0);
    else if (b.type === "industrial") industrial(c, b, x0, z0);
    else if (b.type === "waterfront") waterfront(c, b, x0, z0);
    else if (b.type === "green") cottage(c, b, x0, z0);
    else residential(c, b, x0, z0);
    if (b.extension) extension(c, b, x0, z0);
  }
  return { lit: c.lit.finish(), glow: c.glow.finish(), neon, litWindows: c.litWindows };
}

/** Top of each building (with any stacked housing) — used to keep bridges and rails clear of roofs. */
export function buildingTop(b: Building): number {
  return b.y + (b.storeys + (b.extension?.storeys ?? 0)) * STOREY + 4;
}
