import { FLOOR, Kit, PAL, PROUD, m, sideBounds, sideBox, sides, type Hex, type Side } from "./kit";

/**
 * Reusable parts, each placing boxes into a Kit. Sizes are in voxels (0.25 m) unless a name says
 * otherwise; every random choice comes from the kit's seeded generator, so the same seed always
 * builds the same building.
 */

/* ---------- Facades ---------- */

export interface Facade {
  /** Storey height. */
  floor: number;
  /** Width of one window bay, pier included (the bays are stretched to fill each side exactly). */
  bay: number;
  /** Pier (the wall between windows) width, and the floor band height. */
  pier: number;
  band: number;
  /** How far the glass sits behind the wall line: the depth of the window cavities. */
  recess: number;
  /** Piers, bands and corners; the glass behind. */
  frame: Hex;
  glass: Hex;
  /** Share of windows lit, and their light colors (repeat one to weight it). */
  lit: number;
  lights: Hex[];
  /** Shares of bays with a balcony and with an AC unit; every `fins`-th pier carries a fin. */
  balconies?: number;
  balconyRail?: Hex;
  ac?: number;
  fins?: number;
  finColor?: Hex;
  /** Floors with no windows at the bottom (a blank plinth or a podium behind). */
  skipFloors?: number;
  /** A contrasting floor band every few floors (3–6, seeded), in this color. */
  accent?: Hex;
  /** Chance per side and floor of a small neon sign hanging off the facade (residential). */
  signs?: number;
  /**
   * Bays that are doors instead of windows: called with the side (0 south, 1 east, 2 north,
   * 3 west), the bay's start and width along that side, and the floor. A door bay gets a recessed,
   * unlit steel door with a handle and no window, sill, balcony or AC unit.
   */
  door?: (side: number, a: number, len: number, floor: number) => boolean;
  /** Sides (0 south, 1 east, 2 north, 3 west) left undressed: no windows, balconies, AC units or
   * signs, for walls that face a neighbor close by. */
  blind?: number[];
}

/** Office glazing: wide bays, thin piers, cool light. */
export const OFFICE: Facade = { floor: FLOOR, bay: m(2.5), pier: m(0.5), band: m(0.75), recess: m(0.5), frame: PAL.navy, glass: PAL.glassBlue, lit: 0.45, lights: [PAL.white, PAL.amber, PAL.amber, PAL.blue] };

/** Apartments: narrow bays, deep windows, warm light, balconies and AC units. */
export const FLATS: Facade = { floor: FLOOR, bay: m(2), pier: m(0.75), band: m(0.75), recess: m(0.5), frame: PAL.slate, glass: PAL.glass, lit: 0.55, lights: [PAL.warm, PAL.warm, PAL.amber, PAL.dim], balconies: 0.3, balconyRail: PAL.steel, ac: 0.25, signs: 0.06 };

/**
 * A rectangular mass with a facade on all four sides, in layers that never share a plane:
 * - a dark glass core, set back by `recess` (the depth of the window cavities);
 * - piers between the windows, on the wall line;
 * - floor bands, PROUD of the piers, running between the corner columns;
 * - corner columns, drawn once per corner, twice PROUD of both walls (in front of the bands);
 * - sills in front of the bands; lit windows, mullions, balconies, AC units and fins.
 * Returns the floor count.
 */
export function block(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, f: Facade): number {
  const floors = Math.max(1, Math.round(h / f.floor));
  const fh = h / floors;
  k.occupy([x, y, z, x + w, y + h, z + d], "mass");
  // The mass stands on the ground, a podium or a cornice: its structure needs no underside.
  k.grounded = true;
  k.box(x + f.recess, y, z + f.recess, w - 2 * f.recess, h, d - 2 * f.recess, f.glass);
  const co = 2 * PROUD;
  const corner = f.pier + 2 * co;
  const accentEvery = k.rng.int(3, 6);
  for (const [cx, cz] of [
    [x - co, z - co],
    [x + w - f.pier - co, z - co],
    [x - co, z + d - f.pier - co],
    [x + w - f.pier - co, z + d - f.pier - co],
  ])
    k.box(cx, y, cz, corner, h, corner, f.frame);
  for (const s of sides(x, z, w, d)) {
    const bays = Math.max(1, Math.round((s.length - f.pier) / f.bay));
    const bay = (s.length - f.pier) / bays;
    // Piers between the windows (the corners are the columns above), and floor bands between the
    // corner columns, standing PROUD of the piers.
    for (let i = 1; i < bays; i++) {
      sideBox(k, s, i * bay, y, -f.recess, f.pier, h, f.recess, k.vary(f.frame, 0.04));
      if (f.fins && i % f.fins === 0) {
        sideBox(k, s, i * bay + f.pier * 0.25, y, 0, f.pier * 0.5, h, m(0.5), f.finColor ?? f.frame);
        k.occupy(sideBounds(s, i * bay + f.pier * 0.25, y, 0, f.pier * 0.5, h, m(0.5)), "fin");
      }
    }
    for (let j = 0; j <= floors; j++) sideBox(k, s, f.pier, y + j * fh - (j === floors ? f.band : 0), -f.recess, s.length - 2 * f.pier, f.band, f.recess + PROUD, f.accent && j > 0 && j < floors && j % accentEvery === 0 ? f.accent : f.frame);
  }
  k.grounded = false;
  // How lit each floor is: some floors busy, some nearly dark, the same on every side.
  const floorLight = Array.from({ length: floors }, () => k.rng.range(0.35, 1.65));
  const signs: [Side, number, number, number, Hex][] = [];
  for (const [side, s] of sides(x, z, w, d).entries()) {
    if (f.blind?.includes(side)) continue;
    const bays = Math.max(1, Math.round((s.length - f.pier) / f.bay));
    const bay = (s.length - f.pier) / bays;
    // Windows, balconies and AC units, per floor and bay. Neighboring windows often share a flat,
    // so a lit one tends to have a lit neighbor.
    for (let j = f.skipFloors ?? 0; j < floors; j++) {
      const fy = y + j * fh;
      let lastLit = false;
      for (let i = 0; i < bays; i++) {
        const a = i * bay + f.pier;
        const ww = bay - f.pier;
        const wy = fy + f.band;
        const wh = fh - f.band;
        const lit: boolean = k.rng.chance(0.45) ? lastLit : k.rng.chance(Math.min(0.95, f.lit * floorLight[j]));
        lastLit = lit;
        if (f.door?.(side, a, ww, j) && fy < 0.5) {
          // A street door: it reaches the ground (in front of the floor band), with a frame line,
          // a handle and a step, and it records itself as an entrance.
          const dh = wh + f.band - m(0.1);
          k.occupy(sideBounds(s, a, fy, 0, ww, dh, PROUD + m(0.7)), "entrance");
          sideBox(k, s, a + m(0.1), fy, PROUD, ww - m(0.2), dh, 0.1, PAL.gunmetal);
          sideBox(k, s, a + m(0.1), fy + dh - m(0.25), PROUD + 0.1, ww - m(0.2), m(0.08), 0.06, PAL.charcoal);
          sideBox(k, s, a + ww - m(0.35), fy + dh * 0.45, PROUD + 0.1, m(0.06), m(0.18), 0.08, PAL.pale);
          sideBox(k, s, a, fy, PROUD + 0.1, ww, m(0.15), m(0.6), PAL.concrete);
          continue;
        }
        if (f.door?.(side, a, ww, j)) {
          // A door: a dark steel leaf set back in the opening, a frame line and a handle.
          sideBox(k, s, a + m(0.1), wy, -f.recess, ww - m(0.2), wh - m(0.1), f.recess - PROUD, PAL.gunmetal);
          sideBox(k, s, a + m(0.1), wy + wh - m(0.25), -PROUD, ww - m(0.2), m(0.08), PROUD * 0.5, PAL.charcoal);
          sideBox(k, s, a + ww - m(0.35), wy + wh * 0.45, -PROUD, m(0.06), m(0.18), PROUD * 0.6, PAL.pale);
          continue;
        }
        if (lit) {
          // A lit window, lit from sill to head: light just in front of the glass.
          sideBox(k, s, a + 0.1, wy, -f.recess, ww - 0.2, wh - 0.1, 0.15, k.rng.pick(f.lights), true, k.rng.range(0.6, 1));
        } else if (k.rng.chance(0.08)) {
          // A dark room with a screen on: a faint cold glow.
          sideBox(k, s, a + 0.1, wy, -f.recess, ww - 0.2, wh - 0.1, 0.15, PAL.blue, true, 0.12);
        }
        // A mullion down wide windows, and a sill under every window.
        if (ww > m(1.6)) sideBox(k, s, a + ww / 2 - m(0.08), wy, -f.recess, m(0.16), wh, f.recess * 0.6, f.frame);
        sideBox(k, s, a - m(0.05), wy - m(0.12), PROUD, ww + m(0.1), m(0.12) + PROUD, m(0.15), k.vary(f.frame, 0.12));
        // Balconies and AC units only where nothing (a bridge, a platform, a tree) is in the way.
        const ba = a - f.pier * 0.5 + PROUD;
        const bl = ww + f.pier - 2 * PROUD;
        const acw = Math.min(m(1.2), ww * 0.68);
        const acy = fy + f.band + m(0.2);
        if (f.balconies && j > 0 && k.rng.chance(f.balconies) && k.clear(sideBounds(s, ba, fy + PROUD, 0, bl, m(1.05), PROUD + m(1)))) balcony(k, s, ba, fy + PROUD, bl, f.frame, f.balconyRail ?? PAL.steel);
        else if (f.ac && k.rng.chance(f.ac * AC_KEEP) && k.clear(sideBounds(s, a + (ww - acw) / 2, acy - m(0.12), 0, acw, acw * 0.68 + m(0.12), PROUD * 1.5 + acw * 0.42 + 0.1))) acUnit(k, s, a + (ww - acw) / 2, acy, acw);
      }
      // Now and then a small neon sign hangs off a pier (placed once the whole facade is dressed).
      if (f.signs && j > 0 && j < floors - 1 && bays > 1 && k.rng.chance(f.signs)) signs.push([s, k.rng.int(1, bays - 1) * bay + (f.pier - SIGN_T) / 2, fy + f.band, m(k.rng.range(1.5, 2.6)), k.rng.pick([PAL.magenta, PAL.cyan, PAL.amber, PAL.violet, PAL.red])]);
    }
  }
  for (const [s, a, sy, sh, color] of signs) bladeSign(k, s, a, sy, sh, color, [y + f.band, y + h - f.band]);
  return floors;
}

/** Share of the facade's AC units actually placed (the rest are left out at random). */
const AC_KEEP = 0.7;

/**
 * A wall-mounted AC unit under a window: a pale casing on two brackets, a dark fan grille with
 * slats on its front and a small vent strip beside the fan. `w` is its width along the wall; it
 * stands off the wall line.
 */
export function acUnit(k: Kit, s: Side, a: number, y: number, w: number) {
  const h = w * 0.68;
  const d = w * 0.42;
  const out = PROUD * 1.5;
  const front = out + d;
  k.occupy(sideBounds(s, a, y - m(0.12), 0, w, h + m(0.12), front + 0.1), "ac");
  for (const t of [0.15, 0.78]) sideBox(k, s, a + w * t, y - m(0.12), PROUD, m(0.06), m(0.12), d + m(0.06), PAL.charcoal);
  sideBox(k, s, a, y, out, w, h, d, k.vary(PAL.pale, 0.05));
  // The fan: a dark square grille with two slats across it.
  sideBox(k, s, a + w * 0.1, y + h * 0.14, front, w * 0.52, h * 0.72, 0.08, PAL.charcoal);
  for (const t of [0.38, 0.62]) sideBox(k, s, a + w * 0.1, y + h * (0.14 + 0.72 * t) - 0.06, front + 0.08, w * 0.52, 0.12, 0.05, PAL.steel);
  // A vent strip beside the fan.
  sideBox(k, s, a + w * 0.7, y + h * 0.55, front, w * 0.2, h * 0.3, 0.08, PAL.steel);
}

/**
 * A balcony: a slab out from the wall with a railing on three sides (a low parapet, posts and a
 * top rail along the front and both ends, back to the wall), and now and then a plant.
 */
export function balcony(k: Kit, s: Side, a: number, y: number, len: number, slab: Hex, rail: Hex) {
  const deep = m(1);
  const t = m(0.12);
  const front = PROUD + deep - t;
  const py = y + m(0.25);
  const ph = m(0.45);
  const ry = y + m(0.95);
  k.occupy(sideBounds(s, a, y, 0, len, m(1.05), PROUD + deep), "balcony");
  sideBox(k, s, a, y, PROUD, len, m(0.25), deep, slab);
  // Front: parapet, posts, top rail.
  sideBox(k, s, a + PROUD, py, front, len - 2 * PROUD, ph, t, slab);
  sideBox(k, s, a + PROUD, ry, front, len - 2 * PROUD, m(0.08), t, rail);
  // Ends: parapet and top rail from the wall to the front, inside the front pieces' ends.
  for (const e of [a + PROUD, a + len - PROUD - t]) {
    sideBox(k, s, e, py, PROUD * 2, t, ph, front - PROUD * 2, slab);
    sideBox(k, s, e, ry, PROUD * 2, t, m(0.08), front - PROUD * 2, rail);
  }
  // Posts between parapet and rail, at the corners and every meter along the front.
  const ends = [a + PROUD, a + len - PROUD - t];
  for (let u = ends[0]; u <= ends[1] + 0.01; u += Math.max(m(1), (ends[1] - ends[0]) / Math.max(1, Math.round((ends[1] - ends[0]) / m(1))))) sideBox(k, s, Math.min(u, ends[1]) + 0.02, py + ph, front + 0.02, t - 0.04, ry - py - ph, t - 0.04, rail);
  for (const e of ends) sideBox(k, s, e + 0.02, py + ph, PROUD * 2 + (front - PROUD * 2) / 2, t - 0.04, ry - py - ph, t - 0.04, rail);
  if (k.rng.chance(0.3)) sideBox(k, s, a + len * 0.3, y + m(0.25), PROUD * 3, m(0.45), m(0.42), m(0.45), k.vary(PAL.leaf, 0.15));
}

/** A plain wall slab with a few vents, for blank sides and service cores. */
export function blank(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, color: Hex) {
  k.occupy([x, y, z, x + w, y + h, z + d], "mass");
  k.box(x, y, z, w, h, d, color);
  for (const s of sides(x, z, w, d)) {
    const n = Math.floor(s.length / m(3));
    for (let i = 0; i < n; i++) if (k.rng.chance(0.3)) sideBox(k, s, i * m(3) + m(1), y + k.rng.range(0.2, 0.8) * h, 0, m(0.75), m(0.75), m(0.25), PAL.charcoal);
  }
}

/**
 * A roof slab, a little wider than the mass below (a drip edge), with a parapet standing on it
 * (none if `parapet` is 0) and a pale coping along its top.
 */
export function roof(k: Kit, x: number, y: number, z: number, w: number, d: number, color: Hex, parapet = m(0.75)) {
  const e = PROUD * 3;
  k.box(x - e, y, z - e, w + 2 * e, m(0.25), d + 2 * e, color);
  if (parapet <= 0) return;
  const t = m(0.25);
  const top = y + m(0.25);
  // North and south full width, east and west between them, so the ring never overlaps itself.
  for (const [px, pz, pw, pd, ns] of [
    [x, z, w, t, 1],
    [x, z + d - t, w, t, 1],
    [x, z + t, t, d - 2 * t, 0],
    [x + w - t, z + t, t, d - 2 * t, 0],
  ]) {
    k.box(px, top, pz, pw, parapet, pd, color);
    // The coping: the north and south pieces own the corners, the east and west fit between.
    const ez = ns ? PROUD : -PROUD;
    k.box(px - PROUD, top + parapet, pz - ez, pw + 2 * PROUD, m(0.1), pd + 2 * ez, PAL.concrete);
  }
}

/** A flat cornice band sticking out a little all round, to mark a setback or a crown. */
export function cornice(k: Kit, x: number, y: number, z: number, w: number, d: number, color: Hex, out = m(0.5), h = m(0.5)) {
  k.box(x - out, y, z - out, w + 2 * out, h, d + 2 * out, color);
}

/* ---------- Light strips and signs ---------- */

/** A thin neon line along a side at height y. */
export function neonLine(k: Kit, s: Side, a: number, y: number, len: number, color: Hex, strength = 1) {
  sideBox(k, s, a, y, 0, len, m(0.2), m(0.15), color, true, strength * k.neon);
}

/** Vertical light strips up a mass's four corners. */
export function cornerStrips(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, color: Hex) {
  const t = m(0.25);
  // Just outside the corner columns (which stand twice PROUD of the walls).
  const o = PROUD * 3;
  for (const [cx, cz] of [
    [x - t - o, z - t - o],
    [x + w + o, z - t - o],
    [x - t - o, z + d + o],
    [x + w + o, z + d + o],
  ])
    k.light(cx, y, cz, t, h, t, color, 0.9 * k.neon);
}

/** The screen designs each building has used, so its screens differ. */
const adsUsed = new WeakMap<Kit, Set<string>>();

/**
 * A billboard flat on a side: a dark frame and a "screen" of light pixels in a seeded design, so
 * it reads as an ad without any text. Tall screens get a ramen bowl, a phone launch, a drink with
 * a price burst, or a cat mascot; wide ones a logo ring, a headline over "text", a synthwave travel
 * ad, the drink, the mascot or the ramen. Lit like a printed backlit poster, below the bloom
 * threshold, so it reads crisp rather than glowing.
 */
export function billboard(k: Kit, s: Side, a: number, y: number, len: number, h: number, colors: Hex[]) {
  const frame = m(0.25);
  // Over balconies, AC units or signs, the screen stands off the wall on brackets, in front of
  // them, instead of cutting through them.
  const behind = k.touching(sideBounds(s, a - frame, y - frame, 0, len + 2 * frame, h + 2 * frame, m(0.5)));
  const reach = (b: number[]) => (s.nx > 0 ? b[3] - s.ox : s.nx < 0 ? s.ox - b[0] : s.nz > 0 ? b[5] - s.oz : s.oz - b[2]);
  const so = behind.length ? Math.max(...behind.map(({ box }) => reach(box))) + m(0.15) : 0;
  if (so > 0) {
    for (const t of [0.1, 0.9]) {
      for (const v of [0.2, 0.8]) sideBox(k, s, a + len * t - m(0.1), y + h * v - m(0.1), PROUD, m(0.2), m(0.2), so - PROUD, PAL.steel);
    }
  }
  k.occupy(sideBounds(s, a - frame, y - frame, so, len + 2 * frame, h + 2 * frame, m(0.5)), "billboard");
  sideBox(k, s, a - frame, y - frame, so, len + 2 * frame, h + 2 * frame, m(0.3), PAL.charcoal);
  // The picture, on a one-voxel grid. Each row's runs of the same color and brightness are drawn
  // as one box, so the finer grid costs little.
  const px = 1;
  const cols = Math.max(1, Math.floor(len / px));
  const rows = Math.max(1, Math.floor(h / px));
  const ox = a + (len - cols * px) / 2;
  const oy = y + (h - rows * px) / 2;
  const bg = k.rng.pick(colors);
  const fg = k.rng.pick(colors.filter((c) => c !== bg).concat(PAL.white));
  const pop = k.rng.pick([PAL.yellow, PAL.amber, PAL.cyan, PAL.magenta].filter((c) => c !== bg && c !== fg));
  const hi = PAL.white;
  // Tall screens get banner designs, wide ones landscape designs.
  const tall = rows > cols * 1.3;
  // A building doesn't repeat a design until it has used every one that fits.
  const options = tall ? ["ramen", "phone", "product", "mascot"] : ["logo", "headline", "sunset", "product", "mascot", "ramen"];
  const used = adsUsed.get(k) ?? new Set<string>();
  adsUsed.set(k, used);
  const fresh = options.filter((o) => !used.has(o));
  const design = k.rng.pick(fresh.length ? fresh : options);
  used.add(design);
  const cx = (cols - 1) / 2;
  // Seeded "letters": a few blocks wide with a gap between, so slogans read as words.
  const glyph = Array.from({ length: 64 }, () => k.rng.int(0, 15));
  const letters = (i: number, j: number, u0: number, row0: number, rowH: number) => {
    const g = Math.floor((i - u0) / 4);
    const gx = (i - u0) % 4;
    const gy = Math.floor(((j - row0) / rowH) * 2);
    return gx < 3 && ((glyph[(g * 7 + row0) & 63] >> (gy * 2 + (gx === 1 ? 0 : 1))) & 1) === 1;
  };
  // The perspective floor lines of the sunset design.
  const horizon = Math.round(rows * 0.36);
  const floorLines = new Set<number>();
  for (let n = 1, t = 1; t < horizon; n++, t += n) floorLines.add(horizon - t);

  type Px = [Hex, number];
  const designPixel = (i: number, j: number): Px | null => {
    const u = i / Math.max(1, cols - 1);
    const v = j / Math.max(1, rows - 1);
    switch (design) {
      case "logo": {
        // A double ring around a mark, with a slogan under it.
        const r = Math.hypot((i - cx) / (cols * 0.3), (v - 0.62) / 0.22);
        if (r > 0.82 && r < 1) return [fg, 0.95];
        if (r > 0.66 && r < 0.72) return [hi, 0.85];
        if (r < 0.4 && Math.abs(i - cx) < cols * 0.05 + (0.4 - r) * cols * 0.1) return [hi, 0.95];
        if (v > 0.12 && v < 0.26 && u > 0.12 && u < 0.88) return letters(i, j, Math.round(cols * 0.14), Math.round(rows * 0.13), rows * 0.12) ? [hi, 0.95] : [fg, 0.45];
        return null;
      }
      case "headline": {
        // A headline over rows of "text", with a lit button.
        if (v > 0.78 && v < 0.92 && u > 0.08 && u < 0.92) return letters(i, j, Math.round(cols * 0.1), Math.round(rows * 0.79), rows * 0.12) ? [hi, 1] : [fg, 0.75];
        if (v < 0.68 && v > 0.2 && j % 3 === 0 && u > 0.08 && u < 0.08 + 0.84 * (0.5 + 0.5 * Math.abs(Math.sin(j * 1.7 + 0.5))) && i % 6 !== 5) return [fg, 0.6];
        if (v < 0.14 && v > 0.05 && u > 0.6 && u < 0.9) return [pop, 0.9];
        return null;
      }
      case "sunset": {
        // A travel ad: a striped synthwave sun over a perspective grid, the destination above.
        if (v > 0.83 && v < 0.94 && u > 0.1 && u < 0.9) return letters(i, j, Math.round(cols * 0.12), Math.round(rows * 0.84), rows * 0.1) ? [hi, 1] : null;
        if (j > horizon) {
          const scy = rows * 0.58;
          const R = Math.min(cols * 0.3, rows * 0.25);
          const d = Math.hypot(i - cx, j - scy);
          if (d < R) {
            const below = (scy - j) / R;
            if (below > 0 && (j % 4) < below * 3) return null;
            return [j > scy ? pop : fg, 0.95];
          }
          if (d < R + 1.5) return [pop, 0.35];
          return null;
        }
        if (floorLines.has(j) || j === horizon) return [fg, j === horizon ? 1 : 0.75];
        for (let n = -7; n <= 7; n++) if (Math.abs(i - (cx + n * cols * 0.12 * ((horizon - j) / horizon))) < 0.5) return [fg, 0.7];
        return [bg, 0.12];
      }
      case "product": {
        // A drink: a bottle with a highlight and a label, a halo, its reflection, a price burst and
        // the brand across the top.
        const bw = Math.max(2, Math.round(cols * (tall ? 0.16 : 0.1)));
        const nw = Math.max(1, Math.round(bw * 0.4));
        const half = v < 0.12 ? -1 : v < 0.62 ? bw : v < 0.7 ? bw + (nw - bw) * ((v - 0.62) / 0.08) : v < 0.9 ? nw : -1;
        const dx = Math.abs(i - cx);
        if (half > 0 && dx <= half) {
          if (v > 0.84) return [hi, 0.95];
          if (v > 0.32 && v < 0.46) return letters(i, j, Math.round(cx - half + 1), Math.round(rows * 0.36), rows * 0.07) ? [fg, 0.9] : [hi, 0.9];
          if (i - (cx - half) >= 1 && i - (cx - half) < 2) return [hi, 0.9];
          return [fg, 0.55 + 0.3 * v];
        }
        if (v > 0.05 && v < 0.11 && dx <= bw && j % 2 === 0) return [fg, 0.3];
        const bx = cols * 0.8;
        const by = rows * (tall ? 0.72 : 0.68);
        const r0 = Math.min(cols, rows) * 0.14;
        const ang = Math.atan2(j - by, i - bx);
        const db = Math.hypot(i - bx, j - by);
        if (db < r0 * (Math.cos(ang * 10) > 0 ? 1.1 : 0.85)) return db < r0 * 0.45 ? [hi, 1] : [pop, 0.95];
        if (v > 0.88 && v < 0.95 && u > 0.08 && u < 0.6) return letters(i, j, Math.round(cols * 0.08), Math.round(rows * 0.885), rows * 0.06) ? [hi, 1] : null;
        return null;
      }
      case "mascot": {
        // A round cat mascot: ears, big glossy eyes, blush and a smile, a speech line under it.
        const scy = rows * (tall ? 0.6 : 0.55);
        const R = Math.min(cols * 0.3, rows * (tall ? 0.22 : 0.3));
        const d = Math.hypot(i - cx, j - scy);
        for (const sx of [-1, 1]) {
          const ex = cx + sx * R * 0.62;
          const apex = scy + R * 1.2;
          if (j > scy + R * 0.5 && j < apex && Math.abs(i - ex) < (apex - j) * 0.55) return [fg, 0.85];
        }
        if (d < R) {
          if (d > R - 1.2) return [hi, 0.95];
          for (const sx of [-1, 1]) {
            const ex = cx + sx * R * 0.36;
            const ey = scy + R * 0.12;
            const e = Math.hypot((i - ex) / (R * 0.17), (j - ey) / (R * 0.25));
            if (e < 1) return Math.hypot(i - (ex - R * 0.06), j - (ey + R * 0.1)) < Math.max(0.8, R * 0.07) ? [hi, 1] : [bg, 0.12];
            if (Math.hypot(i - (cx + sx * R * 0.62), j - (scy - R * 0.25)) < R * 0.13) return [fg === PAL.magenta ? PAL.red : PAL.magenta, 0.8];
          }
          const sm = Math.hypot(i - cx, j - (scy - R * 0.05));
          if (sm > R * 0.3 && sm < R * 0.3 + 1.1 && j < scy - R * 0.2) return [hi, 0.95];
          return [fg, 0.7];
        }
        if (v > 0.06 && v < 0.17 && u > 0.12 && u < 0.88) return letters(i, j, Math.round(cols * 0.15), Math.round(rows * 0.07), rows * 0.09) ? [hi, 1] : [pop, 0.4];
        return null;
      }
      case "ramen": {
        // A noodle bar: a bowl with a stripe and a foot, noodles, an egg and nori, chopsticks
        // dipped in, steam curling up, the shop's name above and a price below.
        const Rb = Math.min(cols * 0.36, rows * 0.26);
        const rim = rows * 0.42;
        const dx = i - cx;
        const dy = j - rim;
        if (v > 0.84 && v < 0.94 && u > 0.1 && u < 0.9) return letters(i, j, Math.round(cols * 0.12), Math.round(rows * 0.85), rows * 0.09) ? [hi, 1] : null;
        if (v > 0.06 && v < 0.14 && u > 0.3 && u < 0.7) return letters(i, j, Math.round(cols * 0.32), Math.round(rows * 0.07), rows * 0.07) ? [pop, 0.9] : null;
        // Chopsticks: two lines from the bowl up to the right.
        for (const off of [0, 1.6]) {
          const [x0, y0, x1, y1] = [cx + Rb * 0.15 + off, rim + 1.5, cx + Rb * 0.95 + off, rows * 0.78];
          const t = Math.max(0, Math.min(1, ((i - x0) * (x1 - x0) + (j - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2)));
          if (Math.hypot(i - (x0 + t * (x1 - x0)), j - (y0 + t * (y1 - y0))) < 0.6) return [PAL.amber, 0.7];
        }
        if (dy < 0 && Math.hypot(dx / Rb, dy / (Rb * 0.8)) < 1) return Math.abs(dy + Rb * 0.3) < 0.8 ? [hi, 0.8] : [pop, 0.75];
        if (dy < -Rb * 0.8 && dy > -Rb * 0.8 - 2 && Math.abs(dx) < Rb * 0.35) return [pop, 0.6];
        if (dy >= 0 && dy < 1 && Math.abs(dx) <= Rb) return [hi, 0.85];
        if (dy >= 1 && Math.hypot(dx / Rb, (dy - 1) / Math.max(1.5, Rb * 0.18)) < 1) {
          if (Math.hypot(dx + Rb * 0.35, dy - 1.5) < Math.max(1.2, Rb * 0.16)) return Math.hypot(dx + Rb * 0.35, dy - 1.5) < Math.max(0.6, Rb * 0.07) ? [PAL.yellow, 0.9] : [hi, 0.9];
          if (dx > Rb * 0.1 && dx < Rb * 0.4) return [bg, 0.15];
          return [PAL.amber, 0.65 + ((i + j) % 2) * 0.1];
        }
        for (let n = -1; n <= 1; n++) {
          if (j > rim + Rb * 0.25 && j < rows * 0.78 && Math.abs(i - (cx + n * Rb * 0.35 + Math.round(Math.sin(j * 0.6 + n * 2) * 1.2))) < 0.5) return [hi, 0.4];
        }
        return null;
      }
      default: {
        // A phone launch: the handset with a bright screen (an app icon and two lines on it), the
        // camera notch and a button, light rays behind it, the brand above and a tagline below.
        const pw = Math.max(4, Math.round(Math.min(cols * 0.46, rows * 0.3)));
        const ph = Math.round(Math.min(rows * 0.62, pw * 2.1));
        const x0 = Math.round(cx - pw / 2);
        const y0 = Math.round(rows * 0.52 - ph / 2);
        const pi = i - x0;
        const pj = j - y0;
        if (v > 0.86 && v < 0.95 && u > 0.15 && u < 0.85) return letters(i, j, Math.round(cols * 0.17), Math.round(rows * 0.87), rows * 0.07) ? [hi, 1] : null;
        if (v > 0.05 && v < 0.12 && u > 0.12 && u < 0.88) return letters(i, j, Math.round(cols * 0.14), Math.round(rows * 0.06), rows * 0.06) ? [pop, 0.85] : null;
        if (pi >= 0 && pi < pw && pj >= 0 && pj < ph) {
          const corner = (pi === 0 || pi === pw - 1) && (pj === 0 || pj === ph - 1);
          if (corner) return null;
          if (pi === 0 || pi === pw - 1 || pj === 0 || pj === ph - 1) return [hi, 0.7];
          if (pj === ph - 2 && Math.abs(pi - (pw - 1) / 2) < pw * 0.2) return [bg, 0.1];
          if (pj === 1 && Math.abs(pi - (pw - 1) / 2) < 1) return [hi, 0.9];
          const sv = pj / ph;
          const icon = Math.hypot(pi - (pw - 1) / 2, pj - ph * 0.62);
          if (icon < pw * 0.22) return icon < pw * 0.1 ? [hi, 0.95] : [pop, 0.9];
          if ((pj === Math.round(ph * 0.36) || pj === Math.round(ph * 0.3)) && pi > pw * 0.2 && pi < pw * (pj === Math.round(ph * 0.36) ? 0.8 : 0.6)) return [hi, 0.75];
          return [sv > 0.5 ? fg : pop, 0.45 + 0.3 * sv];
        }
        const ang = Math.atan2(j - rows * 0.52, i - cx);
        if (Math.cos(ang * 8) > 0.6) return [fg, 0.3];
        return null;
      }
    }
  };
  const pixel = (i: number, j: number): Px => {
    const v = j / Math.max(1, rows - 1);
    // A thin bright border just inside the frame.
    if (i === 1 || i === cols - 2 || j === 1 || j === rows - 2) return [fg, 0.55];
    const p = i > 1 && i < cols - 2 ? designPixel(i, j) : null;
    // Background: a soft vertical gradient in steps.
    return p ?? [bg, 0.22 + (0.3 * Math.round(v * 4)) / 4];
  };
  for (let j = 0; j < rows; j++) {
    let run = 0;
    let runColor: Hex = bg;
    let runStrength = -1;
    const flush = (end: number) => {
      if (end > run) sideBox(k, s, ox + run * px, oy + j * px, so + m(0.3), (end - run) * px, px, 0.1, runColor, true, runStrength * k.neon);
    };
    for (let i = 0; i < cols; i++) {
      // Printed-poster brightness, not neon: every pixel stays under the bloom threshold, so the
      // picture reads crisp instead of glowing.
      const [color, raw] = pixel(i, j);
      const strength = Math.round((0.1 + 0.5 * raw) * 20) / 20;
      if (i === 0 || color !== runColor || Math.abs(strength - runStrength) > 1e-6) {
        flush(i);
        [run, runColor, runStrength] = [i, color, strength];
      }
    }
    flush(cols);
  }
}

/**
 * A blade sign sticking out from a side: a tall narrow box with glyph-like light blocks down both
 * faces (seeded patterns, like signs in a script the viewer can't read).
 */
/** A blade sign's width along the wall. */
const SIGN_T = m(0.5);

export function bladeSign(k: Kit, s: Side, a: number, y0: number, h: number, color: Hex, range?: [number, number]): boolean {
  const out = m(1.5);
  const t = SIGN_T;
  const back = PROUD * 2;
  // A spot clear of AC units, balconies, billboards and other signs, on the same pier: the height
  // asked for, or (when `range` gives the wall's extent) up to 3 m up or down within it, so the
  // sign never leaves its wall. With no free spot there is no sign.
  const margin = m(0.3);
  const room = (y: number) => {
    if (range && (y < range[0] || y + h > range[1])) return null;
    const b = sideBounds(s, a - margin, y - margin, 0, t + 2 * margin, h + 2 * margin, back + out + margin);
    return a >= 0 && a + t <= s.length && k.clear(b) ? b : null;
  };
  let y = NaN;
  for (const dy of (range ? [0, 1, -1, 2, -2, 3, -3] : [0]).map(m)) {
    const b = room(y0 + dy);
    if (b) {
      y = y0 + dy;
      k.occupy(b, "sign");
      break;
    }
  }
  if (Number.isNaN(y)) return false;
  // The sign stands against the wall face, held by a bracket at its top and its bottom.
  sideBox(k, s, a, y, back, t, h, out, PAL.charcoal);
  for (const by of [y + m(0.15), y + h - m(0.35)]) sideBox(k, s, a + t * 0.3, by, 0, t * 0.4, m(0.2), back + m(0.2), PAL.steel);
  const cell = m(0.75);
  const glyphs = Math.floor((h - m(0.5)) / cell);
  for (let g = 0; g < glyphs; g++) {
    const gy = y + m(0.25) + g * cell;
    for (let bit = 0; bit < 4; bit++) {
      if (!k.rng.chance(0.6)) continue;
      const bx = bit % 2;
      const by = (bit / 2) | 0;
      sideBox(k, s, a - 0.05, gy + by * m(0.3), m(0.4) + bx * m(0.45), t + 0.1, m(0.25), m(0.4), color, true, 0.95 * k.neon);
    }
  }
  return true;
}

/** How many window bays a facade fits on a side (the bays are stretched to fill it exactly). */
export function bayCount(s: Side, f: Facade): number {
  return Math.max(1, Math.round((s.length - f.pier) / f.bay));
}

/**
 * A blade sign on one pier of a mass's side, centered on it, so it always hangs on solid wall,
 * never in front of a window: `pier` counts from the side's start (0 is the corner column) or,
 * when negative, from its end (-1 is the far corner column). It may slide up or down to find
 * clear space, but stays within the mass's wall (`y`, `h`: the mass's bottom and height).
 */
export function pierSign(k: Kit, s: Side, f: Facade, pier: number, y: number, h: number, y0: number, sh: number, color: Hex): boolean {
  const bays = bayCount(s, f);
  const bay = (s.length - f.pier) / bays;
  const i = pier < 0 ? Math.max(0, bays + 1 + pier) : Math.min(pier, bays);
  const lo = y + f.band;
  const hi = y + h - f.band;
  const len = Math.min(sh, hi - lo);
  if (len < m(1.5)) return false;
  return bladeSign(k, s, i * bay + (f.pier - SIGN_T) / 2, Math.min(hi - len, Math.max(lo, y0)), len, color, [lo, hi]);
}

/** A small sign box over a door or shop: a frame and a glowing face. */
export function shopSign(k: Kit, s: Side, a: number, y: number, len: number, color: Hex) {
  sideBox(k, s, a, y, PROUD, len, m(0.7), m(0.3), PAL.charcoal);
  sideBox(k, s, a + m(0.15), y + m(0.13), m(0.3) + PROUD, len - m(0.3), m(0.45), 0.1, color, true, 0.9 * k.neon);
}

/* ---------- Ground level ---------- */

/**
 * A row of ground-floor units along a side, between dark pillars, under a fascia band.
 * - `retail` units are a seeded mix: a store (kickplate, display silhouettes, a glass door), a
 *   closed roller shutter with graffiti, a noodle bar (counter, noren curtains, a red lantern,
 *   stools), a convenience store (bright, a brand stripe, window posters) or a hatch kiosk; some
 *   under striped awnings, some with a lit sign, the odd vending machine.
 * - `office` units are a glazed lobby front: tall glass between mullions, no signs or awnings.
 * With a `lobby` style, the middle unit is the building's own entrance instead: a stone infill
 * with an `entrance` of that style and a lit house number.
 */
export function shopfronts(k: Kit, s: Side, y: number, h: number, colors: Hex[], unit = m(4), lobby: EntranceStyle | false = false, mode: "retail" | "office" = "retail") {
  k.occupy(sideBounds(s, 0, y, 0, s.length, h, m(1.45)), "shopfront");
  // Each side owns the pillar at its starting corner and stops short of its far corner (the next
  // side's pillar), so no two sides overlap there.
  const cornerW = m(0.5);
  sideBox(k, s, 0, y, -m(0.5), cornerW, h, m(0.5) + PROUD, PAL.charcoal);
  const span = s.length - 2 * cornerW;
  const n = Math.max(1, Math.round(span / unit));
  const u = span / n;
  const lobbyAt = lobby ? Math.floor(n / 2) : -1;
  const gh = h - m(1);
  const back = -m(0.5);
  for (let i = 0; i < n; i++) {
    const a = cornerW + i * u;
    if (i > 0) sideBox(k, s, a, y, back, m(0.4), h, m(0.5), PAL.charcoal);
    const g0 = a + (i > 0 ? m(0.4) : 0);
    const gw = a + u - g0;
    // The fascia band over every unit.
    sideBox(k, s, a, y + gh, back, u, m(1) - PROUD, m(0.5) - PROUD, PAL.charcoal);
    if (i === lobbyAt) {
      sideBox(k, s, g0, y, back, gw, gh, m(0.5) - PROUD, PAL.concrete);
      entrance(k, s, g0 + gw / 2, y, gw - m(0.2), lobby || "glass");
      sideBox(k, s, g0 + gw / 2 - m(0.3), y + h - m(0.75), 0, m(0.6), m(0.35), 0.1, PAL.white, true, 0.6);
      continue;
    }
    if (mode === "office") {
      // Tall lobby glass between slim mullions.
      sideBox(k, s, g0, y, back, gw, gh, 0.15, PAL.white, true, k.rng.range(0.35, 0.55));
      const panes = Math.max(1, Math.round(gw / m(1.5)));
      for (let p = 1; p < panes; p++) sideBox(k, s, g0 + (gw / panes) * p - m(0.05), y, back + 0.15, m(0.1), gh, m(0.15), PAL.steel);
      sideBox(k, s, g0, y + m(2.8), back + 0.15, gw, m(0.1), 0.4, PAL.steel);
      continue;
    }
    const kind = k.rng.pick(["store", "store", "shutter", "food", "convenience", "kiosk"] as const);
    const inner = back + 0.16;
    if (kind === "shutter") {
      // A closed roller shutter: ribbed steel under its housing, a patch of graffiti.
      sideBox(k, s, g0, y, back, gw, gh - m(0.4), m(0.3), PAL.gunmetal);
      for (let t = m(0.3); t < gh - m(0.5); t += m(0.3)) sideBox(k, s, g0, y + t, back + m(0.3), gw, m(0.05), 0.06, PAL.steel);
      sideBox(k, s, g0, y + gh - m(0.4), back, gw, m(0.4), m(0.45), PAL.charcoal);
      if (k.rng.chance(0.7)) sideBox(k, s, g0 + k.rng.range(0.1, 0.4) * gw, y + m(0.4), back + m(0.3) + 0.06, gw * 0.4, m(0.9), 0.04, k.rng.pick([PAL.magenta, PAL.teal, PAL.yellow, PAL.violet]));
      continue;
    }
    if (kind === "kiosk") {
      // A walled unit with a lit service hatch, a counter shelf and a menu board.
      sideBox(k, s, g0, y, back, gw, gh, m(0.5) - PROUD, k.vary(PAL.slate, 0.05));
      sideBox(k, s, g0 + gw * 0.2, y + m(1.1), -PROUD, gw * 0.6, m(1.1), 0.1, PAL.warm, true, 0.7);
      sideBox(k, s, g0 + gw * 0.15, y + m(1), -PROUD, gw * 0.7, m(0.1), m(0.45), PAL.trunk);
      sideBox(k, s, g0 + gw * 0.3, y + m(2.4), -PROUD, gw * 0.4, m(0.5), 0.06, PAL.white, true, 0.45);
    } else {
      const light = kind === "convenience" ? PAL.white : kind === "food" ? PAL.warm : k.rng.pick([PAL.warm, PAL.amber, PAL.white]);
      const lit = kind !== "store" || k.rng.chance(0.85);
      sideBox(k, s, g0, y, back, gw, gh, 0.15, lit ? light : PAL.dim, true, lit ? (kind === "convenience" ? 0.8 : 0.65) : 0.2);
      if (kind === "food") {
        // A counter across the front, noren curtains under the fascia, a lantern, stools.
        sideBox(k, s, g0, y, inner, gw, m(1), m(0.3), PAL.trunk);
        const strips = Math.max(2, Math.floor(gw / m(0.6)));
        const cloth = k.rng.pick([PAL.indigo, PAL.wine, PAL.pale]);
        for (let t = 0; t < strips; t++) sideBox(k, s, g0 + t * (gw / strips) + m(0.03), y + gh - m(0.7), inner, gw / strips - m(0.06), m(0.7), 0.06, cloth);
        sideBox(k, s, a + u - m(0.55), y + gh - m(0.7), m(0.1), m(0.35), m(0.45), m(0.35), PAL.red, true, 0.6);
        for (let t = 0; t < 2; t++) sideBox(k, s, g0 + gw * (0.25 + 0.4 * t), y, m(0.3), m(0.35), m(0.6), m(0.35), PAL.charcoal);
      } else if (kind === "convenience") {
        // A brand stripe across the fascia, posters on the glass.
        const [c1, c2] = [k.rng.pick([PAL.cyan, PAL.red, PAL.yellow]), k.rng.pick([PAL.magenta, PAL.blue, PAL.amber])];
        sideBox(k, s, a + m(0.45), y + gh + m(0.2), -PROUD, u - m(0.9), m(0.18), PROUD * 0.5, c1, true, 0.7);
        sideBox(k, s, a + m(0.45), y + gh + m(0.45), -PROUD, u - m(0.9), m(0.18), PROUD * 0.5, c2, true, 0.7);
        for (let t = 0; t < 3; t++) if (k.rng.chance(0.7)) sideBox(k, s, g0 + m(0.2) + t * (gw / 3), y + m(1.2), inner, m(0.5), m(0.7), 0.04, k.rng.pick([PAL.magenta, PAL.yellow, PAL.cyan, PAL.pale]));
      } else {
        // A store: a kickplate, a shelf line, display silhouettes, a framed glass door.
        sideBox(k, s, g0, y, inner, gw, m(0.4), 0.15, PAL.charcoal);
        sideBox(k, s, g0, y + m(1.3), inner, gw, m(0.06), 0.12, PAL.charcoal);
        for (let t = 0; t < 2; t++) sideBox(k, s, g0 + gw * (0.12 + 0.22 * t), y + m(0.4), inner + 0.03, m(0.35), m(k.rng.range(0.8, 1.5)), 0.1, PAL.charcoal);
        const da = g0 + gw - m(1.1);
        for (const fa of [da, da + m(0.95)]) sideBox(k, s, fa, y, inner + 0.15, m(0.08), m(2.3), 0.08, PAL.steel);
        sideBox(k, s, da, y + m(2.3), inner + 0.15, m(1.03), m(0.08), 0.08, PAL.steel);
        sideBox(k, s, da + m(0.15), y + m(1), inner + 0.23, m(0.06), m(0.5), 0.06, PAL.pale);
      }
    }
    if (kind !== "convenience" && k.rng.chance(0.5)) {
      // A striped awning.
      const [c1, c2] = [k.rng.pick([PAL.rust, PAL.indigo, PAL.plum, PAL.teal]), k.rng.pick([PAL.pale, PAL.slate])];
      const seg = m(0.5);
      for (let t = 0, idx = 0; t < u - m(0.6) - 0.01; t += seg, idx++) sideBox(k, s, a + m(0.3) + t, y + gh - m(0.25), PROUD, Math.min(seg, u - m(0.6) - t), m(0.25), m(1.2), idx % 2 ? c2 : c1);
    }
    if (kind !== "convenience" && k.rng.chance(0.6)) shopSign(k, s, a + u * 0.15, y + h - m(0.85), u * 0.7, k.rng.pick(colors));
    if (kind === "store" && k.rng.chance(0.25)) vending(k, s, a + u - m(1.2), y);
  }
}

/**
 * A plain ground-floor wall along a side (a service or back wall): the wall itself out to the
 * wall line, a stone base course, vents, pasted posters and, with `door`, a steel service door.
 * Like shop rows, each side owns its starting corner and stops short of the far one.
 */
export function plainWall(k: Kit, s: Side, y: number, h: number, door = false) {
  const len = s.length - m(0.5);
  sideBox(k, s, 0, y, -m(0.5), len, h, m(0.5) - PROUD, k.vary(PAL.slate, 0.04));
  sideBox(k, s, 0, y, -PROUD, len, m(0.4), PROUD, PAL.concrete);
  if (door) {
    const da = len * k.rng.range(0.2, 0.6);
    sideBox(k, s, da, y + m(0.4), -PROUD, m(1), m(1.9), 0.1, PAL.gunmetal);
    sideBox(k, s, da + m(0.4), y + m(2.4), -PROUD, m(0.2), m(0.2), m(0.2), PAL.warm, true, 0.6);
  }
  for (let t = m(1.5); t < len - m(1.5); t += m(k.rng.range(3, 5))) {
    if (k.rng.chance(0.4)) sideBox(k, s, t, y + h - m(1.6), -PROUD, m(0.8), m(0.5), 0.1, PAL.charcoal);
    else if (k.rng.chance(0.5)) sideBox(k, s, t, y + m(1), -PROUD, m(0.6), m(0.85), 0.04, k.rng.pick([PAL.pale, PAL.magenta, PAL.yellow, PAL.cyan]));
  }
}

/**
 * Entrance styles, each after a real type:
 * - `glass`: a pair of glass doors in a dark surround under a slim canopy (the everyday lobby);
 * - `revolving`: a glass revolving-door drum with a steel cap and a side door, in a tall portal
 *   under a name band (office towers, where revolving doors stop the stack-effect draft);
 * - `portico`: three steps up to a pair of tall dark doors, two columns carrying a deep flat roof,
 *   wall lamps (civic and institutional fronts);
 * - `gate`: a narrow stair-hall door behind a folding steel security gate, a mailbox panel, a
 *   name plaque and a bare bulb (the residents' door of a Hong Kong tong lau tenement);
 * - `porte`: a porte-cochère, a deep canopy on two posts lit from beneath over glass doors, for
 *   drop-offs (hotels and grand apartment blocks).
 */
export type EntranceStyle = "glass" | "revolving" | "portico" | "gate" | "porte";

/**
 * A building's entrance in the given style, centered at `mid` along a wall, fitting within `room`
 * (the wall width it may use). Records itself as an entrance.
 */
export function entrance(k: Kit, s: Side, mid: number, y = 0, room = m(3), style: EntranceStyle = "glass") {
  const f = PROUD * 2;
  const reach = { glass: m(1.5), revolving: m(1.4), portico: m(1.9), gate: m(0.8), porte: m(2.6) }[style];
  const w = Math.min(room, style === "gate" ? m(2.2) : m(3.4));
  const a0 = mid - w / 2;
  k.occupy(sideBounds(s, a0, y, 0, w, m(3.5), reach), "entrance");
  const glassDoors = (a: number, leaf: number, dh: number) => {
    for (const side of [0, 1]) {
      const la = a + side * leaf;
      sideBox(k, s, la + m(0.05), y + m(0.15), f, leaf - m(0.1), dh - m(0.15), 0.1, PAL.amber, true, 0.4);
      sideBox(k, s, la + (side ? m(0.15) : leaf - m(0.25)), y + m(0.9), f + 0.1, m(0.1), m(0.8), m(0.08), PAL.pale);
    }
    sideBox(k, s, a + leaf - m(0.05), y + m(0.15), f + 0.1, m(0.1), dh - m(0.15), 0.1, PAL.charcoal);
  };
  if (style === "glass" || style === "porte") {
    const leaf = Math.min(m(1.1), (w - m(0.8)) / 2);
    const a = mid - leaf;
    sideBox(k, s, a - m(0.3), y, 0, 2 * leaf + m(0.6), m(2.95), f, PAL.charcoal);
    glassDoors(a, leaf, m(2.4));
    sideBox(k, s, a + m(0.05), y + m(2.5), f, 2 * leaf - m(0.1), m(0.35), 0.1, PAL.amber, true, 0.3);
    if (style === "glass") {
      sideBox(k, s, a - m(0.4), y + m(3.2), f, 2 * leaf + m(0.8), m(0.2), m(1.5) - f, PAL.pale);
    } else {
      // The porte-cochère: a deep canopy on two posts, lit from beneath.
      const cw = w - m(0.2);
      sideBox(k, s, mid - cw / 2, y + m(3.2), f, cw, m(0.3), reach - f, PAL.slate);
      sideBox(k, s, mid - cw / 2 + m(0.3), y + m(3.2) - 0.1, m(0.6), cw - m(0.6), 0.1, reach - m(1), PAL.warm, true, 0.55);
      for (const pa of [mid - cw / 2 + m(0.1), mid + cw / 2 - m(0.3)]) sideBox(k, s, pa, y, reach - m(0.35), m(0.2), m(3.2), m(0.2), PAL.steel);
    }
    sideBox(k, s, a - m(0.4), y, f, 2 * leaf + m(0.8), m(0.15), m(1.2), PAL.concrete);
  } else if (style === "revolving") {
    // A tall portal; the drum (three nested glass boxes make it round) with a steel cap, mullions
    // down its front, and a single glass door beside it if there is room.
    sideBox(k, s, a0, y, 0, w, m(3.1), f, PAL.charcoal);
    const r = Math.min(m(1), w / 2 - m(0.6));
    const dc = mid - (w >= 2 * r + m(1.6) ? m(0.5) : 0);
    for (const [hw, depth] of [
      [1, 0.45],
      [0.8, 0.8],
      [0.45, 1],
    ])
      sideBox(k, s, dc - r * hw, y, f, 2 * r * hw, m(2.5), r * depth, PAL.cyan, true, 0.32);
    for (const t of [-0.45, 0.45]) sideBox(k, s, dc + r * t - m(0.04), y, f + r * 0.8, m(0.08), m(2.5), 0.08, PAL.charcoal);
    sideBox(k, s, dc - r - m(0.1), y + m(2.5), f, 2 * r + m(0.2), m(0.3), r + m(0.1), PAL.steel);
    if (w >= 2 * r + m(1.6)) {
      const da = dc + r + m(0.2);
      sideBox(k, s, da, y + m(0.15), f, m(0.85), m(2.3), 0.1, PAL.amber, true, 0.4);
      sideBox(k, s, da + m(0.1), y + m(0.9), f + 0.1, m(0.08), m(0.8), m(0.08), PAL.pale);
    }
    sideBox(k, s, a0 + m(0.2), y + m(2.85), f, w - m(0.4), m(0.2), 0.1, PAL.pale);
    sideBox(k, s, a0, y, f, w, m(0.12), r + m(0.4), PAL.concrete);
  } else if (style === "portico") {
    // Three steps, tall doors on the top step, two columns on the ground carrying a deep roof.
    const leaf = Math.min(m(1), (w - m(1.4)) / 2);
    for (let i = 0; i < 3; i++) sideBox(k, s, a0 + m(0.1), y + i * m(0.15), f, w - m(0.2), m(0.15), m(1.05) - i * m(0.35), PAL.pale);
    const dy = y + m(0.45);
    sideBox(k, s, mid - leaf - m(0.25), dy, 0, 2 * leaf + m(0.5), m(2.65), f, PAL.charcoal);
    for (const side of [0, 1]) {
      sideBox(k, s, mid - leaf + side * leaf + m(0.05), dy, f, leaf - m(0.1), m(2.5), 0.1, PAL.trunk);
      sideBox(k, s, mid - m(0.2) + side * m(0.3), dy + m(1), f + 0.1, m(0.1), m(0.5), m(0.06), PAL.amber);
    }
    for (const ca of [a0 + m(0.2), a0 + w - m(0.6)]) sideBox(k, s, ca, y, m(1.35), m(0.4), m(3.2), m(0.4), PAL.pale);
    sideBox(k, s, a0, y + m(3.2), f, w, m(0.3), reach - f, PAL.concrete);
    for (const la of [mid - leaf - m(0.55), mid + leaf + m(0.35)]) sideBox(k, s, la, dy + m(1.8), f, m(0.2), m(0.3), m(0.15), PAL.warm, true, 0.6);
  } else {
    // The tenement stair-hall door: a dark doorway behind a folding gate, a mailbox panel, a name
    // plaque and a bare bulb.
    const dw = m(1.2);
    const da = mid - dw / 2 - m(0.35);
    sideBox(k, s, da - m(0.15), y, 0, dw + m(0.3), m(2.6), f, PAL.charcoal);
    sideBox(k, s, da, y + m(0.1), f, dw, m(2.3), 0.08, PAL.dim, true, 0.18);
    for (let b = da + m(0.05); b < da + dw - m(0.05); b += m(0.15)) sideBox(k, s, b, y + m(0.1), f + 0.1, m(0.04), m(2.3), m(0.04), PAL.steel);
    for (const by of [y + m(0.15), y + m(2.3)]) sideBox(k, s, da + 0.05, by, f + 0.05, dw - 0.1, m(0.08), 0.45, PAL.steel);
    const ma = da + dw + m(0.25);
    sideBox(k, s, ma, y + m(1), f, m(0.6), m(0.8), m(0.12), PAL.gunmetal);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) sideBox(k, s, ma + m(0.07) + c * m(0.27), y + m(1.08) + r * m(0.25), f + m(0.12), m(0.2), m(0.08), 0.05, PAL.charcoal);
    sideBox(k, s, ma, y + m(2), f, m(0.6), m(0.9), m(0.06), PAL.pale);
    for (let g = 0; g < 3; g++) sideBox(k, s, ma + m(0.15), y + m(2.1) + g * m(0.27), f + m(0.06), m(0.3), m(0.18), 0.04, PAL.charcoal);
    sideBox(k, s, da + dw / 2 - m(0.1), y + m(2.65), f, m(0.2), m(0.2), m(0.2), PAL.warm, true, 0.7);
    sideBox(k, s, da - m(0.15), y, f, dw + m(0.3), m(0.15), m(0.6), PAL.concrete);
  }
}

/** A vending machine against a side: a box with a lit front. */
export function vending(k: Kit, s: Side, a: number, y: number) {
  sideBox(k, s, a, y, 0, m(0.75), m(1.75), m(0.6), PAL.pale);
  sideBox(k, s, a + m(0.1), y + m(0.6), m(0.6), m(0.55), m(1), 0.1, k.rng.pick([PAL.cyan, PAL.white, PAL.magenta]), true, 0.85);
}

/** A street lamp: a thin post, an arm and a glowing head. */
export function lamp(k: Kit, x: number, y: number, z: number, color: Hex = PAL.amber) {
  k.occupy([x, y, z - 0.05, x + m(0.7), y + m(3.7), z + m(0.3)], "prop");
  k.box(x, y, z, m(0.2), m(3.5), m(0.2), PAL.charcoal);
  k.box(x, y + m(3.5), z, m(0.6), m(0.2), m(0.2), PAL.charcoal);
  k.light(x + m(0.4), y + m(3.25), z - 0.05, m(0.3), m(0.25), m(0.3), color, 1);
}

/** A blocky tree: a trunk and a canopy of a few offset cubes. */
/** The space a tree of this size takes (see tree). */
export function treeBox(x: number, y: number, z: number, size: number): number[] {
  const r = size * 0.7 * 0.8;
  return [x - r, y, z - r, x + r, y + size * 0.5 + size * 0.7 * 1.3, z + r];
}

export function tree(k: Kit, x: number, y: number, z: number, size = m(2), record = true) {
  const t = Math.max(1, size * 0.15);
  if (record) k.occupy(treeBox(x, y, z, size), "plant");
  k.box(x - t / 2, y, z - t / 2, t, size * 0.6, t, PAL.trunk);
  const c = size * 0.7;
  k.box(x - c / 2, y + size * 0.5, z - c / 2, c, c * 0.8, c, k.vary(PAL.leaf, 0.12));
  for (let i = 0; i < 3; i++) {
    const s = c * k.rng.range(0.4, 0.6);
    k.box(x - s / 2 + k.rng.range(-c, c) * 0.3, y + size * 0.5 + c * k.rng.range(0.3, 0.7), z - s / 2 + k.rng.range(-c, c) * 0.3, s, s, s, k.vary(PAL.leafDark, 0.12));
  }
}

/** A raised planter with a tree or a shrub. */
export function planter(k: Kit, x: number, y: number, z: number, size = m(1.5)) {
  k.occupy([x - size / 2, y, z - size / 2, x + size / 2, y + m(0.5), z + size / 2], "prop");
  k.box(x - size / 2, y, z - size / 2, size, m(0.5), size, PAL.concrete);
  k.box(x - size / 2 + 0.25, y + m(0.5), z - size / 2 + 0.25, size - 0.5, 0.25, size - 0.5, PAL.leafDark);
  if (k.rng.chance(0.6)) tree(k, x, y + m(0.5), z, size * 1.2, false);
}

/** Steps up against a side, from y to y + h. */
export function stairs(k: Kit, s: Side, a: number, y: number, h: number, width = m(1.5)) {
  const steps = Math.max(1, Math.round(h / m(0.25)));
  for (let i = 0; i < steps; i++) sideBox(k, s, a, y + i * (h / steps), (steps - i) * m(0.3) - m(0.3), width, h / steps, m(0.3), PAL.concrete);
}

/* ---------- Rooftops ---------- */

/** Records a piece of rooftop gear if its space is clear; false (place nothing) if not. */
function place(k: Kit, box: number[]): boolean {
  if (!k.clear(box)) return false;
  k.occupy(box, "roofgear");
  return true;
}

/** An HVAC unit: a box with a dark fan on top. */
export function hvac(k: Kit, x: number, y: number, z: number, size = m(1.5)): boolean {
  if (!place(k, [x, y, z, x + size, y + size * 0.6 + 0.25, z + size])) return false;
  k.box(x, y, z, size, size * 0.6, size, k.vary(PAL.pale, 0.06));
  k.box(x + size * 0.2, y + size * 0.6, z + size * 0.2, size * 0.6, 0.25, size * 0.6, PAL.charcoal);
  return true;
}

/** A water tank on legs. */
export function tank(k: Kit, x: number, y: number, z: number, size = m(2)): boolean {
  if (!place(k, [x, y, z, x + size, y + size * 1.2 + 0.5, z + size])) return false;
  const leg = 0.5;
  for (const [dx, dz] of [
    [0, 0],
    [size - leg, 0],
    [0, size - leg],
    [size - leg, size - leg],
  ])
    k.box(x + dx, y, z + dz, leg, size * 0.4, leg, PAL.charcoal);
  k.box(x, y + size * 0.4, z, size, size * 0.8, size, k.vary(PAL.steel, 0.08));
  k.box(x + size * 0.1, y + size * 1.2, z + size * 0.1, size * 0.8, 0.5, size * 0.8, PAL.slate);
  return true;
}

/** An antenna mast with cross bars and a red warning light on top. */
export function antenna(k: Kit, x: number, y: number, z: number, h = m(6)): boolean {
  if (!place(k, [x - m(0.4), y, z - 0.1, x + m(0.65), y + h + m(0.35), z + m(0.3)])) return false;
  k.box(x, y, z, m(0.25), h, m(0.25), PAL.steel);
  for (let t = h * 0.3; t < h * 0.9; t += m(1.5)) k.box(x - m(0.4), y + t, z + 0.05, m(1.05), 0.2, 0.2, PAL.steel);
  k.light(x - 0.1, y + h, z - 0.1, m(0.35), m(0.35), m(0.35), PAL.red, 1);
  return true;
}

/** A satellite dish: a stepped bowl tipped up on a post. */
export function dish(k: Kit, x: number, y: number, z: number, r = m(1.5)): boolean {
  if (!place(k, [x, y, z, x + 2 * r, y + r * 1.9, z + 2 * r])) return false;
  k.box(x + r - 0.5, y, z + r - 0.5, 1, r * 0.6, 1, PAL.steel);
  for (let i = 0; i < 3; i++) {
    const rr = r * (1 - i * 0.3);
    k.box(x + r - rr, y + r * 0.6 + i * r * 0.25, z + r - rr + i * r * 0.15, rr * 2, r * 0.25, rr * 2, i === 0 ? PAL.pale : PAL.concrete);
  }
  k.box(x + r - 0.25, y + r * 1.3, z + r - 0.25, 0.5, r * 0.6, 0.5, PAL.steel);
  return true;
}

/** A field of solar panels, tilted up in steps. */
export function solar(k: Kit, x: number, y: number, z: number, w: number, d: number): boolean {
  if (!place(k, [x, y, z, x + w, y + m(0.6), z + d])) return false;
  const row = m(1.25);
  for (let zz = z; zz + row <= z + d; zz += row + m(0.5)) {
    k.box(x, y, zz, w, m(0.3), row * 0.5, PAL.glassBlue);
    k.box(x, y + m(0.3), zz + row * 0.5, w, m(0.3), row * 0.5, PAL.solar);
  }
  return true;
}

/** A rooftop garden: soil, planters and a few trees and shrubs. */
export function garden(k: Kit, x: number, y: number, z: number, w: number, d: number) {
  k.box(x, y, z, w, m(0.25), d, PAL.leafDark);
  // Trees and shrubs, each where it has room (a few tries each), kept inside the bed.
  const n = Math.max(1, Math.floor((w * d) / (m(3) * m(3))));
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 4; tries++) {
      const px = x + k.rng.range(0.15, 0.85) * w;
      const pz = z + k.rng.range(0.15, 0.85) * d;
      const isTree = k.rng.chance(0.5);
      const size = m(k.rng.range(1.5, 2.5));
      const box = isTree ? treeBox(px, y + m(0.25), pz, size) : [px - m(0.4), y + m(0.25), pz - m(0.4), px + m(0.4), y + m(0.75), pz + m(0.4)];
      if (box[0] < x || box[3] > x + w || box[2] < z || box[5] > z + d || !k.clear(box)) continue;
      if (isTree) tree(k, px, y + m(0.25), pz, size);
      else {
        k.occupy(box, "plant");
        k.box(px - m(0.4), y + m(0.25), pz - m(0.4), m(0.8), m(0.5), m(0.8), k.vary(PAL.leaf, 0.15));
      }
      break;
    }
  }
}

/** A helipad: a pale square with a yellow ring and an H, and lights at the corners. */
export function helipad(k: Kit, x: number, y: number, z: number, size: number) {
  k.occupy([x, y, z, x + size, y + m(0.4), z + size], "roofgear");
  k.box(x, y, z, size, m(0.25), size, PAL.charcoal);
  const t = m(0.3);
  const c = y + m(0.25);
  const i = size * 0.15;
  k.light(x + i, c, z + i, size - 2 * i, 0.1, t, PAL.yellow, 0.7);
  k.light(x + i, c, z + size - i - t, size - 2 * i, 0.1, t, PAL.yellow, 0.7);
  k.light(x + i, c, z + i, t, 0.1, size - 2 * i, PAL.yellow, 0.7);
  k.light(x + size - i - t, c, z + i, t, 0.1, size - 2 * i, PAL.yellow, 0.7);
  const hx = x + size * 0.35;
  const hz = z + size * 0.32;
  k.light(hx, c, hz, t, 0.1, size * 0.36, PAL.white, 0.8);
  k.light(hx + size * 0.3 - t, c, hz, t, 0.1, size * 0.36, PAL.white, 0.8);
  k.light(hx, c, hz + size * 0.18 - t / 2, size * 0.3, 0.1, t, PAL.white, 0.8);
  for (const [dx, dz] of [
    [0, 0],
    [size - 0.5, 0],
    [0, size - 0.5],
    [size - 0.5, size - 0.5],
  ])
    k.light(x + dx, c, z + dz, 0.5, 0.5, 0.5, PAL.cyan, 1);
}

/** A mechanical housing: a stepped box with louvres. */
export function machine(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number): boolean {
  if (!place(k, [x - 0.15, y, z, x + w, y + h + m(0.5), z + d])) return false;
  k.box(x, y, z, w, h, d, k.vary(PAL.slate, 0.06));
  k.box(x + 0.5, y + h, z + 0.5, w - 1, m(0.5), d - 1, PAL.steel);
  for (let t = y + m(0.5); t < y + h - m(0.3); t += m(0.5)) k.box(x - 0.15, t, z + d * 0.2, 0.15, 0.25, d * 0.6, PAL.charcoal);
  return true;
}

/** A rooftop stair hut: a small block with a lit door and a vent on top. */
export function stairHut(k: Kit, x: number, y: number, z: number) {
  const w = m(2.5);
  const h = m(2.6);
  k.occupy([x - PROUD, y, z - PROUD, x + w + PROUD, y + h + m(0.8), z + w + 0.2], "roofgear");
  k.box(x, y, z, w, h, w, k.vary(PAL.slate, 0.05));
  k.box(x - PROUD, y + h, z - PROUD, w + 2 * PROUD, m(0.2), w + 2 * PROUD, PAL.charcoal);
  k.light(x + w * 0.3, y, z + w, m(0.9), m(2), 0.1, PAL.amber, 0.7);
  k.light(x + w * 0.3 + m(0.3), y + m(2.15), z + w, m(0.3), m(0.15), m(0.2), PAL.cyan, 0.9);
  k.box(x + w * 0.6, y + h + m(0.2), z + w * 0.2, m(0.6), m(0.6), m(0.6), PAL.steel);
}

/** A duct running along a roof on little stands. */
export function duct(k: Kit, x: number, y: number, z: number, len: number, alongX: boolean) {
  const t = m(0.6);
  const [w, d] = alongX ? [len, t] : [t, len];
  k.occupy([x, y, z, x + w, y + m(0.4) + t, z + d], "roofgear");
  k.box(x, y + m(0.4), z, w, t, d, k.vary(PAL.steel, 0.05));
  for (let a = m(0.5); a < len; a += m(2.5)) {
    const [sx, sz] = alongX ? [x + a, z + t * 0.3] : [x + t * 0.3, z + a];
    k.box(sx, y, sz, m(0.2), m(0.4), m(0.2), PAL.charcoal);
  }
}

/** A rooftop dressed with a seeded mix of equipment, kept inside a margin from the edge. */
export function rooftop(k: Kit, x: number, y: number, z: number, w: number, d: number, kind: "service" | "garden" | "mixed" = "mixed") {
  const pad = m(1);
  const ix = x + pad;
  const iz = z + pad;
  const iw = w - 2 * pad;
  const id = d - 2 * pad;
  if (iw <= m(2) || id <= m(2)) return;
  // Everything stands on the roof slab: no undersides.
  k.grounded = true;
  if (kind !== "service") garden(k, ix, y, iz + id * 0.55, iw * (kind === "garden" ? 1 : 0.5), id * 0.45);
  if (iw > m(5) && id > m(5) && k.clear([ix + iw - m(2.5) - PROUD, y, iz - PROUD, ix + iw + PROUD, y + m(3.4), iz + m(2.5) + 0.2])) stairHut(k, ix + iw - m(2.5), y, iz);
  if (kind !== "garden") {
    // A duct along the back (short of the stair hut), then a dense scatter of gear in front of it:
    // each piece where it has room, a few tries each, with a little space around it.
    if (iw > m(6)) duct(k, ix, y, iz, Math.min(iw * k.rng.range(0.5, 0.8), iw - m(3.5)), true);
    const items = Math.max(3, Math.floor((iw * id) / (m(3) * m(3))));
    const gap = m(0.3);
    for (let i = 0; i < items; i++) {
      for (let tries = 0; tries < 5; tries++) {
        const px = ix + k.rng.range(0, 0.75) * (iw - m(2.5));
        const pz = iz + m(1) + k.rng.range(0, kind === "mixed" ? 0.3 : 0.65) * id;
        const pick = k.rng.int(0, 6);
        const size = pick <= 1 ? m(k.rng.range(1.2, 2)) : pick === 2 ? m(k.rng.range(1.5, 2.2)) : pick === 5 ? m(k.rng.range(0.8, 1.4)) : 0;
        const masts = pick === 3 ? k.rng.int(1, 3) : 0;
        const [bw, bd] = pick <= 2 ? [size, size] : pick === 3 ? [m(1.05) + (masts - 1) * m(0.8), m(0.4) + (masts - 1) * m(0.5)] : pick === 4 ? [m(1.6), m(2)] : pick === 5 ? [2 * size, 2 * size] : [m(3), m(2)];
        const bx = pick === 3 ? px - m(0.4) : px - 0.15;
        const box = [bx - gap, y, pz - gap - 0.1, bx + bw + gap, y + m(8), pz + bd + gap];
        if (box[3] > ix + iw || box[5] > iz + id || !k.clear(box)) continue;
        if (pick <= 1) hvac(k, px, y, pz, size);
        else if (pick === 2) tank(k, px, y, pz, size);
        else if (pick === 3) for (let a = 0; a < masts; a++) antenna(k, px + a * m(0.8), y, pz + a * m(0.5), m(k.rng.range(2.5, 7)));
        else if (pick === 4) machine(k, px, y, pz, m(1.5), m(1.2), m(2));
        else if (pick === 5) dish(k, px, y, pz, size);
        else solar(k, px, y, pz, m(3), m(2));
        break;
      }
    }
  }
  k.grounded = false;
}

/* ---------- Connections ---------- */

/**
 * A skybridge between two points at height y (axis-aligned, along x or z): a deck, a glass tube
 * with a light strip, and a truss underneath.
 */
/** The space a skybridge takes (see skybridge), so it can be reserved before facades are dressed. */
export function bridgeBox(x0: number, z0: number, x1: number, z1: number, y: number, width = m(2.5)): number[] {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const sx = Math.min(x0, x1);
  const sz = Math.min(z0, z1);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  return alongX ? [sx, y - m(0.75), sz - width / 2, sx + len, y + m(3.75), sz + width / 2] : [sx - width / 2, y - m(0.75), sz, sx + width / 2, y + m(3.75), sz + len];
}

export function skybridge(k: Kit, x0: number, z0: number, x1: number, z1: number, y: number, width = m(2.5), record = true) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const sx = Math.min(x0, x1);
  const sz = Math.min(z0, z1);
  const h = m(2.75);
  const box = (a: number, yy: number, c: number, l: number, hh: number, cw: number, color: number, glow = false, strength = 1) => {
    const [bx, bz, bw, bd] = alongX ? [sx + a, sz - width / 2 + c, l, cw] : [sx - width / 2 + c, sz + a, cw, l];
    if (glow) k.light(bx, yy, bz, bw, hh, bd, color, strength);
    else k.box(bx, yy, bz, bw, hh, bd, color);
  };
  if (record) k.occupy(bridgeBox(x0, z0, x1, z1, y, width), "bridge");
  box(0, y, 0, len, m(0.5), width, PAL.navy);
  box(0, y + m(0.5), 0, len, h, m(0.2), PAL.glassBlue);
  box(0, y + m(0.5), width - m(0.2), len, h, m(0.2), PAL.glassBlue);
  box(0, y + m(0.5) + h, 0, len, m(0.4), width, PAL.slate);
  box(0, y + m(1.6), -0.1, len, m(0.15), 0.1, PAL.cyan, true, 0.9);
  box(0, y + m(1.6), width, len, m(0.15), 0.1, PAL.cyan, true, 0.9);
  for (let a = 0; a < len; a += m(2)) box(a, y - m(0.75), width * 0.4, m(0.25), m(0.75), width * 0.2, PAL.steel);
}

/** Exposed pipes running up a side, with brackets. */
export function pipes(k: Kit, s: Side, a: number, y: number, h: number, count = 2) {
  k.occupy(sideBounds(s, a - PROUD, y, 0, (count - 1) * m(0.5) + m(0.3) + 2 * PROUD, h, m(0.5) + PROUD), "pipe");
  for (let i = 0; i < count; i++) {
    const pa = a + i * m(0.5);
    sideBox(k, s, pa, y, m(0.1), m(0.3), h, m(0.3), i % 2 ? PAL.rust : PAL.steel);
    // Brackets clasp the pipe, every face a little outside the pipe's own.
    for (let t = m(2); t < h; t += m(3)) sideBox(k, s, pa - PROUD, y + t, PROUD, m(0.3) + 2 * PROUD, m(0.15), m(0.4), PAL.charcoal);
  }
}

/** An exterior service platform with a rail, sticking out from a side. */
export function platform(k: Kit, s: Side, a: number, y: number, len: number, deep = m(1.5), strut = true): boolean {
  // Only where nothing else is: returns false (and builds nothing) if the space is taken.
  const box = sideBounds(s, a, y - (strut ? m(1) : 0), 0, len, m(1) + (strut ? m(1) : 0), deep);
  if (!k.clear(box)) return false;
  k.occupy(box, "platform");
  sideBox(k, s, a, y, 0, len, m(0.25), deep, PAL.steel);
  sideBox(k, s, a, y + m(0.9), deep - m(0.1), len, m(0.1), m(0.1), PAL.pale);
  for (let t = 0; t <= len; t += m(1.5)) sideBox(k, s, a + Math.min(t, len - m(0.1)), y + m(0.25), deep - m(0.15), m(0.1), m(0.65), m(0.1), PAL.pale);
  if (strut) sideBox(k, s, a + len * 0.5, y - m(1), 0, m(0.15), m(1), deep * 0.8, PAL.charcoal);
  return true;
}

/* ---------- Base ---------- */

/**
 * A diorama base for a building on its own: a dark slab a little larger than the footprint, a
 * sidewalk edge, a curb light line and lamps at the corners. In the city the lot is the base.
 */
export function base(k: Kit, w: number, d: number, pad = m(2.5)) {
  k.box(-pad, -m(1), -pad, w + 2 * pad, m(1) - m(0.1), d + 2 * pad, PAL.night);
  k.box(-pad - PROUD, -m(0.1), -pad - PROUD, w + 2 * pad + 2 * PROUD, m(0.1), d + 2 * pad + 2 * PROUD, PAL.charcoal);
  const e = 0.25;
  k.light(-pad - e, -m(0.6), -pad - e, w + 2 * pad + 2 * e, 0.25, e, PAL.cyan, 0.5);
  k.light(-pad - e, -m(0.6), d + pad, w + 2 * pad + 2 * e, 0.25, e, PAL.cyan, 0.5);
  k.light(-pad - e, -m(0.6), -pad, e, 0.25, d + 2 * pad, PAL.cyan, 0.5);
  k.light(w + pad, -m(0.6), -pad, e, 0.25, d + 2 * pad, PAL.cyan, 0.5);
  // A curb along the street (south) side, with lamps, bollards and planters on the sidewalk.
  const front = d + pad - m(0.4);
  k.box(-pad + m(0.2), 0, front, w + 2 * pad - m(0.4), m(0.15), m(0.3), PAL.concrete);
  for (let x = -pad + m(1); x < w + pad - m(1); x += m(6)) lamp(k, x, 0, front - m(0.5));
  for (let x = -pad + m(3.5); x < w + pad - m(1); x += m(6)) k.box(x, 0, front - m(0.4), m(0.25), m(0.8), m(0.25), PAL.steel);
  planter(k, -pad + m(1.2), 0, -pad + m(1.2));
  planter(k, w + pad - m(0.8), 0, d + pad - m(0.9), m(1));
  // A utility cabinet and a railing along the back.
  k.box(w + pad - m(1.5), 0, -pad + m(0.6), m(0.8), m(1.3), m(0.5), PAL.slate);
  k.light(w + pad - m(1.3), m(1), -pad + m(0.6) - 0.1, m(0.2), m(0.1), 0.1, PAL.yellow, 0.8);
  k.box(-pad + m(0.3), m(0.9), -pad + m(0.2), w + 2 * pad - m(0.6), m(0.08), m(0.08), PAL.steel);
  for (let x = -pad + m(0.3); x < w + pad - m(0.3); x += m(2)) k.box(x, 0, -pad + m(0.2) - 0.05, m(0.08), m(0.9), m(0.08) + 0.1, PAL.steel);

}
