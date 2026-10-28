import { Kit, m, PAL, type Hex } from "../buildings/kit";
import type { GeometryData, RGB } from "../geometry";
import { Rng } from "../rng";
import { FENCE_HEIGHT, type Park, type ParkProp } from "./parks";

/**
 * A park's props as geometry (pure: no three.js), in the buildings' blocky style and night
 * palette: one solid and one glow bucket for the whole park, so a park is two draw calls.
 *
 * Each prop is built at the origin, its front toward +z, then turned and moved into place. Beside
 * the geometry, every vertex carries its prop's base point and delay (`grow`: x, y, z, delay), so
 * the renderer can grow each prop out of the ground in turn.
 */

export interface ParkModel {
  solid: GeometryData;
  glow: GeometryData;
  /** Per vertex: the prop's base (x, y, z, in columns/voxels) and its delay (0–1). */
  solidGrow: Float32Array;
  glowGrow: Float32Array;
}

const STONE = 0x6d717c;
const IRON = 0x2c3038;
const WOOD = 0x7d5b40;
const WOOD_DARK = 0x5b412f;
const SAND = 0x9c8862;
const SOIL = 0x3b2f2a;
const WATER = 0x1f4f73;
const PLAY = [0xc8453a, 0xe2b13c, 0x3a8fa0, 0x6e5bc0] as const;
const LEAF = [0x3f6e45, 0x4c7c48, 0x355f3e] as const;
const NEEDLE = [0x2b4c3b, 0x325843, 0x274536] as const;
const BLOSSOM = [0xd88cb0, 0xc46e98, 0xe6a6c4] as const;
const FLOWERS = [0xd94c8a, 0xe8c547, 0xe8e4f0, 0xc8423c, 0x8a5ad0, 0xf08a3c] as const;
const LAMP_COLORS = [PAL.amber, PAL.warm, PAL.cyan] as const;

export function buildParkModel(park: Park, seed: number): ParkModel {
  const k = new Kit(seed);
  const solidGrow: number[] = [];
  const glowGrow: number[] = [];
  const lampColor = new Rng(seed).pick(LAMP_COLORS);
  for (const p of park.props) {
    const s0 = k.solid.count;
    const g0 = k.glow.count;
    const r = new Rng(p.seed);
    draw(k, p, r, lampColor);
    k.solid.place(s0, p.rotation, p.x, p.y, p.z);
    k.glow.place(g0, p.rotation, p.x, p.y, p.z);
    for (let v = s0; v < k.solid.count; v++) solidGrow.push(p.x, p.y, p.z, p.delay);
    for (let v = g0; v < k.glow.count; v++) glowGrow.push(p.x, p.y, p.z, p.delay);
  }
  const { solid, glow } = k.finish();
  return { solid, glow, solidGrow: new Float32Array(solidGrow), glowGrow: new Float32Array(glowGrow) };
}

function draw(k: Kit, p: ParkProp, r: Rng, lampColor: Hex) {
  switch (p.kind) {
    case "fountain":
      return fountain(k);
    case "pavilion":
      return pavilion(k, r, lampColor);
    case "playground":
      return playground(k, r);
    case "picnic":
      return picnic(k);
    case "bench":
      return bench(k);
    case "bin":
      k.box(-m(0.25), 0, -m(0.25), m(0.5), m(0.85), m(0.5), 0x3d5a4c);
      k.box(-m(0.3), m(0.85), -m(0.3), m(0.6), m(0.1), m(0.6), PAL.charcoal);
      return;
    case "lamp":
      return lamp(k, lampColor);
    case "vending":
      k.box(-m(0.5), 0, -m(0.4), m(1), m(1.9), m(0.8), r.pick([PAL.slate, PAL.indigo, PAL.wine]));
      k.light(-m(0.4), m(0.7), m(0.4), m(0.8), m(1.05), 0.12, r.pick([PAL.cyan, PAL.magenta, PAL.white, PAL.mint]), 0.85);
      k.light(-m(0.4), m(1.95) - m(0.3), m(0.4), m(0.8), m(0.18), 0.12, PAL.white, 0.7);
      return;
    case "flowerbed":
      return flowerbed(k, r, p.size);
    case "fence":
      return fence(k, p.size);
    case "hedge":
      return hedge(k, r, p.size);
    case "broadleaf":
      return broadleaf(k, r, p.size, LEAF, PAL.trunk);
    case "blossom":
      return broadleaf(k, r, p.size, BLOSSOM, 0x3b2c2a, true);
    case "conifer":
      return conifer(k, r, p.size);
    case "shrub":
      return shrub(k, r, p.size);
  }
}

/** A square basin with chamfered corners, lit from under the water, and a two-tier spout. */
function fountain(k: Kit) {
  const R = m(3);
  const wall = m(0.4);
  const rim = m(0.6);
  const c = m(0.9);
  // The rim: four walls and four chamfer blocks.
  k.box(-R + c, 0, -R, 2 * (R - c), rim, wall, STONE);
  k.box(-R + c, 0, R - wall, 2 * (R - c), rim, wall, STONE);
  k.box(-R, 0, -R + c, wall, rim, 2 * (R - c), STONE);
  k.box(R - wall, 0, -R + c, wall, rim, 2 * (R - c), STONE);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = sx < 0 ? -R + wall * 0.5 : R - c - wall * 0.5;
    const z = sz < 0 ? -R + wall * 0.5 : R - c - wall * 0.5;
    k.box(x, 0, z, c, rim, c, STONE);
  }
  // The water, lit from below.
  k.box(-R + wall, 0, -R + wall, 2 * (R - wall), m(0.35), 2 * (R - wall), WATER);
  k.light(-R + wall + m(0.3), m(0.36), -R + wall + m(0.3), 2 * (R - wall - m(0.3)), 0.06, 2 * (R - wall - m(0.3)), PAL.cyan, 0.28);
  // The spout: a pedestal, a bowl, a jet.
  k.box(-m(0.5), 0, -m(0.5), m(1), m(1.4), m(1), STONE);
  k.box(-m(1.1), m(1.4), -m(1.1), m(2.2), m(0.3), m(2.2), STONE);
  k.light(-m(1), m(1.7), -m(1), m(2), 0.06, m(2), PAL.cyan, 0.4);
  k.box(-m(0.25), m(1.7), -m(0.25), m(0.5), m(0.6), m(0.5), STONE);
  k.light(-m(0.12), m(2.3), -m(0.12), m(0.24), m(1.4), m(0.24), PAL.white, 0.9);
  // Water falling from the bowl's edges.
  for (const [x, z, w, d] of [
    [-m(1.1), -m(1.15), m(2.2), 0.08],
    [-m(1.1), m(1.1), m(2.2), 0.08],
    [-m(1.15), -m(1.1), 0.08, m(2.2)],
    [m(1.1), -m(1.1), 0.08, m(2.2)],
  ])
    k.light(x, m(0.36), z, w, m(1.4) - m(0.36), d, PAL.cyan, 0.3);
}

/** A raised deck, four posts, a stepped roof and a lantern under it. */
function pavilion(k: Kit, r: Rng, lampColor: Hex) {
  const R = m(3);
  const roof = r.pick([PAL.wine, PAL.teal, PAL.rust, PAL.indigo]);
  k.box(-R, 0, -R, 2 * R, m(0.35), 2 * R, STONE);
  k.box(-R + m(0.2), m(0.35), -R + m(0.2), 2 * R - m(0.4), 0.25, 2 * R - m(0.4), WOOD);
  const post = m(0.3);
  const at = R - m(0.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(sx * at - post / 2, m(0.35), sz * at - post / 2, post, m(2.8), post, WOOD_DARK);
  // Railings on three sides; the front (+z) is open.
  for (const [x, z, w, d] of [
    [-at, -at, 2 * at, 0.4],
    [-at, -at, 0.4, 2 * at],
    [at - 0.4, -at, 0.4, 2 * at],
  ])
    k.box(x, m(1.2), z, w, m(0.15), d, WOOD_DARK);
  const top = m(0.35) + m(2.8);
  k.box(-R - m(0.4), top, -R - m(0.4), 2 * R + m(0.8), m(0.35), 2 * R + m(0.8), roof);
  k.box(-R + m(0.6), top + m(0.35), -R + m(0.6), 2 * R - m(1.2), m(0.45), 2 * R - m(1.2), roof);
  k.box(-m(1.1), top + m(0.8), -m(1.1), m(2.2), m(0.5), m(2.2), roof);
  k.box(-m(0.3), top + m(1.3), -m(0.3), m(0.6), m(0.5), m(0.6), PAL.charcoal);
  k.box(-0.1, top - m(0.7), -0.1, 0.2, m(0.7), 0.2, PAL.charcoal);
  k.light(-m(0.25), top - m(1.1), -m(0.25), m(0.5), m(0.45), m(0.5), lampColor, 1);
}

/** A sand pit with a slide tower and a swing frame. */
function playground(k: Kit, r: Rng) {
  const W = m(4);
  const D = m(3.5);
  const [a, b] = [r.pick(PLAY), r.pick(PLAY)];
  k.box(-W, 0, -D, 2 * W, 0.3, 2 * D, WOOD_DARK);
  k.box(-W + m(0.25), 0.3, -D + m(0.25), 2 * W - m(0.5), 0.05, 2 * D - m(0.5), SAND);
  // The slide tower, back left: posts, a deck, a roof, a ladder and a slide down toward +x.
  const tx = -W + m(1.6);
  const tz = -D + m(1.6);
  const t = m(0.8);
  const deck = m(1.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(tx + sx * t - 0.4, 0, tz + sz * t - 0.4, 0.8, m(2.8), 0.8, PAL.steel);
  k.box(tx - t, deck, tz - t, 2 * t, m(0.2), 2 * t, a);
  k.box(tx - t - 0.3, m(2.8), tz - t - 0.3, 2 * t + 0.6, m(0.3), 2 * t + 0.6, b);
  for (let i = 0; i < 5; i++) k.box(tx - m(0.4), (deck / 5) * i + m(0.25), tz + t + 0.2, m(0.8), 0.25, 0.4, PAL.steel);
  const steps = 8;
  for (let i = 0; i < steps; i++) k.box(tx + t + (i * m(2.4)) / steps, deck - (i * deck) / steps, tz - m(0.4), m(2.4) / steps + 0.3, 0.6, m(0.8), b);
  // The swings, front right: an A-frame at each end, a beam, two seats on chains.
  const sx0 = m(0.4);
  const sx1 = W - m(0.6);
  const sz = D - m(1.6);
  const top = m(2.3);
  for (const x of [sx0, sx1]) {
    k.box(x - 0.3, 0, sz - m(0.7), 0.6, top, 0.6, PAL.steel);
    k.box(x - 0.3, 0, sz + m(0.7), 0.6, top, 0.6, PAL.steel);
  }
  k.box(sx0 - 0.3, top, sz - m(0.7), sx1 - sx0 + 0.6, 0.6, m(1.4) + 0.6, a);
  for (const f of [0.3, 0.7]) {
    const x = sx0 + (sx1 - sx0) * f;
    k.box(x - m(0.25), top - m(1.7), sz, 0.12, m(1.7), 0.12, PAL.charcoal);
    k.box(x + m(0.25), top - m(1.7), sz, 0.12, m(1.7), 0.12, PAL.charcoal);
    k.box(x - m(0.3), m(0.45), sz - m(0.15), m(0.6), 0.25, m(0.4), b);
  }
  // A spring rider or two.
  if (r.chance(0.7)) {
    const x = -W + m(1.2);
    const z = D - m(1.2);
    k.box(x - 0.3, 0.3, z - 0.3, 0.6, m(0.5), 0.6, PAL.steel);
    k.box(x - m(0.3), m(0.6), z - m(0.5), m(0.6), m(0.5), m(1), r.pick(PLAY));
  }
}

function picnic(k: Kit) {
  const L = m(1.8);
  k.box(-L / 2, m(0.72), -m(0.4), L, m(0.08), m(0.8), WOOD);
  for (const sz of [-1, 1]) {
    k.box(-L / 2, m(0.42), sz * m(0.75) - m(0.15), L, m(0.06), m(0.3), WOOD);
    for (const sx of [-1, 1]) k.box(sx * (L / 2 - m(0.2)) - 0.2, 0, sz * m(0.35) - 0.2, 0.4, m(0.72), 0.4, WOOD_DARK);
    for (const sx of [-1, 1]) k.box(sx * (L / 2 - m(0.2)) - 0.2, 0, sz * m(0.75) - 0.2, 0.4, m(0.42), 0.4, WOOD_DARK);
  }
}

/** A park bench facing +z: slatted seat and back on two iron frames. */
function bench(k: Kit) {
  const L = m(1.8);
  for (const sx of [-1, 1]) {
    k.box(sx * (L / 2 - m(0.15)) - 0.2, 0, -m(0.25), 0.4, m(0.45), m(0.5), PAL.charcoal);
    // The frame's upright, in front of the back rest and lower, so no faces meet in a plane.
    k.box(sx * (L / 2 - m(0.15)) - 0.2, m(0.45), -m(0.3) + 0.35, 0.4, m(0.4), 0.4, PAL.charcoal);
  }
  k.box(-L / 2, m(0.42), -m(0.22), L, 0.25, m(0.48), WOOD);
  k.box(-L / 2, m(0.6), -m(0.32), L, m(0.32), 0.3, WOOD);
}

function lamp(k: Kit, color: Hex) {
  k.box(-m(0.1), 0, -m(0.1), m(0.2), m(0.3), m(0.2), PAL.charcoal);
  k.box(-0.3, 0, -0.3, 0.6, m(3.6), 0.6, PAL.charcoal);
  k.box(-m(0.25), m(3.6), -m(0.25), m(0.5), m(0.12), m(0.5), PAL.charcoal);
  // The lantern ends just under the cap, clear of the post's top.
  k.light(-m(0.18), m(3.6) - 1.45, -m(0.18), m(0.36), 1.4, m(0.36), color, 1);
}

/** A bed along x, `length` voxels: a low stone border, soil, and flowers in one or two colors. */
function flowerbed(k: Kit, r: Rng, length: number) {
  const D = m(0.6);
  k.box(-length / 2, 0, -D, length, m(0.35), D * 2, STONE);
  k.box(-length / 2 + 0.4, m(0.35), -D + 0.4, length - 0.8, 0.1, D * 2 - 0.8, SOIL);
  const colors = [r.pick(FLOWERS), r.pick(FLOWERS)];
  // Flowers stay inside the soil, so none is flush with its edge.
  for (let x = -length / 2 + 0.6; x + 0.6 <= length / 2 - 0.5; x += 0.75) {
    for (let z = -D + 0.6; z + 0.6 <= D - 0.5; z += 0.75) {
      if (r.chance(0.25)) continue;
      const h = r.range(0.3, 0.9);
      k.box(x, m(0.35), z, 0.5, h, 0.5, k.vary(LEAF[1], 0.1));
      if (r.chance(0.75)) k.box(x - 0.05, m(0.35) + h, z - 0.05, 0.6, 0.35, 0.6, colors[r.int(0, 1)]);
    }
  }
}

/** A clipped hedge along x, `length` voxels, in blocks of slightly different height. */
/**
 * A low iron fence along x, `length` voxels: a post at each end and about every 2 m, a rail near
 * the foot and one near the top, and a picket every voxel between the posts, poking above the top rail.
 */
function fence(k: Kit, length: number) {
  const P = 0.36;
  const H = FENCE_HEIGHT;
  const posts = Math.max(1, Math.round(length / m(2)));
  const at: number[] = [];
  for (let i = 0; i <= posts; i++) at.push(-length / 2 + ((length - P) * i) / posts);
  for (const x of at) k.box(x, 0, -P / 2, P, H + 0.15, P, IRON);
  for (const y of [0.5, H - 0.6]) k.box(-length / 2, y, -0.08, length, 0.2, 0.16, IRON);
  for (let x = -length / 2 + 1; x < length / 2 - 0.5; x += 1) {
    if (at.some((p) => x > p - 0.3 && x < p + P + 0.3)) continue;
    k.box(x - 0.07, 0, -0.07, 0.14, H - 0.15, 0.14, IRON);
  }
}

function hedge(k: Kit, r: Rng, length: number) {
  const D = m(0.45);
  let x = -length / 2;
  while (x < length / 2 - 0.01) {
    const w = Math.min(length / 2 - x, r.range(3, 6));
    const h = m(0.9) + r.range(-0.4, 0.4);
    k.box(x, 0, -D, w, h, D * 2, k.vary(LEAF[2], 0.08));
    k.box(x + 0.15, h, -D + 0.15, w - 0.3, 0.2, D * 2 - 0.3, k.vary(LEAF[0], 0.08));
    x += w;
  }
}

/**
 * Boxes for a plant's blocks, which land anywhere: each snapped to a quarter voxel, then grown by
 * a different hair (0.015 voxel more for each block), so no two of a plant's faces ever lie in one
 * plane and flicker against each other.
 */
function plant(k: Kit) {
  let i = 0;
  const snap = (v: number) => Math.round(v * 4) / 4;
  return (x: number, y: number, z: number, w: number, h: number, d: number, color: Hex | RGB) => {
    const e = 0.015 * ++i;
    const X = snap(x);
    const Y = snap(y);
    const Z = snap(z);
    // (The bottom stays on the ground where it starts there.)
    const lift = Y > 0 ? e : 0;
    k.box(X - e, Y - lift, Z - e, Math.max(0.25, snap(x + w) - X) + 2 * e, Math.max(0.25, snap(y + h) - Y) + e + lift, Math.max(0.25, snap(z + d) - Z) + 2 * e, color);
  };
}

/** A round-headed tree `size` voxels tall: a trunk, a branch or two, and a crown of overlapping lobes. */
function broadleaf(k: Kit, r: Rng, size: number, leaves: readonly Hex[], bark: Hex, petals = false) {
  const box = plant(k);
  const t = Math.max(1, size * 0.06);
  const trunk = size * 0.42;
  box(-t / 2, 0, -t / 2, t, trunk + size * 0.15, t, bark);
  for (let i = 0; i < 2; i++) {
    const a = r.range(0, Math.PI * 2);
    const l = size * 0.12;
    box(Math.cos(a) * l - t / 3, trunk * r.range(0.75, 0.95), Math.sin(a) * l - t / 3, (t * 2) / 3, t * 1.5, (t * 2) / 3, bark);
  }
  // The crown: a core and lobes around and over it, smaller toward the top, so it reads round.
  const R = size * r.range(0.24, 0.3);
  const mid = trunk + R * 0.9;
  box(-R * 0.75, mid - R * 0.6, -R * 0.75, R * 1.5, R * 1.3, R * 1.5, k.vary(leaves[0], 0.08));
  const lobes = 8;
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2 + r.range(-0.3, 0.3);
    const up = i % 2 ? 0.35 : -0.15;
    const s = R * r.range(0.7, 0.95);
    const d = R * 0.65;
    box(Math.cos(a) * d - s / 2, mid + up * R - s / 2, Math.sin(a) * d - s / 2, s, s * 0.9, s, k.vary(r.pick(leaves), 0.1));
  }
  const s = R * 0.9;
  box(-s / 2 + r.range(-0.2, 0.2) * R, mid + R * 0.45, -s / 2 + r.range(-0.2, 0.2) * R, s, s * 0.7, s, k.vary(leaves[2], 0.08));
  if (petals)
    for (let i = 0; i < 9; i++) {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(0.25, 0.6) * R;
      k.box(Math.cos(a) * d, 0, Math.sin(a) * d, 0.5, 0.06, 0.5, leaves[2]);
    }
}

/** A conifer `size` voxels tall: a short trunk under slim tiers narrowing to a point. */
function conifer(k: Kit, r: Rng, size: number) {
  const box = plant(k);
  const t = Math.max(1, size * 0.05);
  box(-t / 2, 0, -t / 2, t, size * 0.3, t, PAL.trunk);
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const w = size * (0.32 - i * 0.055);
    const y = size * (0.16 + i * 0.14);
    box(-w / 2, y, -w / 2, w, size * 0.15, w, k.vary(r.pick(NEEDLE), 0.08));
  }
  const tip = Math.max(0.6, size * 0.04);
  box(-tip / 2, size * 0.86, -tip / 2, tip, size * 0.14, tip, NEEDLE[1]);
}

/** A bush: a few blocks, now and then in flower. */
function shrub(k: Kit, r: Rng, size: number) {
  const box = plant(k);
  const bloom = r.chance(0.3) ? r.pick(FLOWERS) : null;
  for (let i = 0; i < 3; i++) {
    const s = size * r.range(0.55, 0.85);
    const ox = r.range(-0.25, 0.25) * size;
    const oz = r.range(-0.25, 0.25) * size;
    box(ox - s / 2, 0, oz - s / 2, s, s * 0.8, s, k.vary(r.pick(LEAF), 0.12));
    if (bloom) box(ox - 0.3, s * 0.8, oz - 0.3, 0.6, 0.3, 0.6, bloom);
  }
}
