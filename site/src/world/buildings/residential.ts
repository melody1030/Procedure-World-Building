import type { BuildingConfig } from "./config";
import { Kit, PAL, PROUD, m, sides } from "./kit";
import { FLATS, antenna, billboard, blank, block, bridgeBox, pierSign, cornice, garden, pipes, roof, rooftop, shopfronts, skybridge, plainWall, tree, type EntranceStyle, treeBox } from "./parts";
import { styled } from "./skyscrapers";

/**
 * Residential archetypes. Each takes the kit and a validated config and builds within the
 * footprint (0, 0)–(width, depth), in voxels.
 */

/**
 * A ground floor: shops along the street side (south) around the residents' lobby (or an `office`
 * glass front), plain walls on the others with a service door at the back; nothing on `blind`
 * sides.
 */
function groundFloor(k: Kit, c: BuildingConfig, x: number, z: number, w: number, d: number, h: number, blind: number[] = [], lobby: EntranceStyle = "gate", mode: "retail" | "office" = "retail") {
  k.occupy([x, 0, z, x + w, h, z + d], "mass");
  k.box(x + m(0.5), 0, z + m(0.5), w - m(1), h, d - m(1), PAL.charcoal);
  const [south, east, north, west] = sides(x, z, w, d);
  // The middle of the south row is the lobby for the flats above.
  shopfronts(k, south, 0, h, [c.accentColor, PAL.magenta, PAL.cyan, PAL.amber], m(4), lobby, mode);
  for (const [side, s] of [[1, east], [2, north], [3, west]] as const) if (!blind.includes(side)) plainWall(k, s, 0, h, side === 2);
}

/**
 * A. Modular apartment block: a slab of repeated flats split into two or three modules of
 * slightly different height and tone, shops at the bottom, an exposed stair core with pipes up one
 * end, and a busy roof.
 */
export function modularApartmentBlock(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const shop = m(4.5);
  const core = Math.min(m(4), W * 0.2);
  groundFloor(k, c, 0, 0, W, D, shop);

  // The stair core on the west end: a blank tower a floor taller than the rest, with slit windows.
  const coreH = H - shop - m(2);
  blank(k, 0, shop, D * 0.3, core, coreH, D * 0.4, c.secondaryColor);
  for (let t = shop + fl * 0.5; t < shop + coreH - fl; t += fl) k.light(-0.15, t, D * 0.45, 0.15, fl * 0.5, D * 0.1, PAL.cyan, 0.5);
  roof(k, 0, shop + coreH, D * 0.3, core, D * 0.4, c.primaryColor);
  const [south] = sides(0, D * 0.3, core, D * 0.4);
  pipes(k, south, core * 0.2, shop, coreH, 3);

  // Two or three modules along x, stepped by a floor, with a little tone change.
  const n = k.rng.int(2, 3);
  const span = (W - core) / n;
  let tallest = 0;
  let lastH = 0;
  for (let i = 0; i < n; i++) {
    const x = core + i * span;
    const steps = k.rng.int(-1, 0);
    const h = Math.max(fl * 3, Math.floor((H - shop - m(3)) / fl) * fl + steps * fl);
    const tone = i % 2 ? c.primaryColor : c.secondaryColor;
    // A reveal between modules, so their corner columns and roofs don't overlap.
    const reveal = i < n - 1 ? 1.5 : 0;
    // The walls facing the stair core or a neighboring module are blind.
    const blind = [3, ...(i < n - 1 ? [1] : [])];
    block(k, x, shop, 0, span - reveal, h, D, { ...styled(FLATS, c, tone), blind });
    roof(k, x, shop + h, 0, span - reveal, D, c.primaryColor);
    rooftop(k, x, shop + h + m(0.25), 0, span - reveal, D, c.rooftopStyle);
    tallest = Math.max(tallest, shop + h);
    lastH = h;
  }
  // A blade sign on the street corner of the last module and a small screen high on the east end.
  const [, east] = sides(core, 0, W - core, D);
  if (c.neonIntensity > 0) {
    const [lastSouth] = sides(core + (n - 1) * span, 0, span, D);
    pierSign(k, lastSouth, FLATS, -1, shop, lastH, shop + fl, m(6), c.accentColor);
    billboard(k, east, D * 0.3, tallest - m(9), D * 0.4, m(5), [PAL.magenta, PAL.violet, PAL.cyan]);
  }
}

/** A shared podium: shops and the residents' lobby on the south side, plain walls on the others; returns its top. */
function sharedPodium(k: Kit, c: BuildingConfig, x: number, z: number, w: number, d: number, h: number, lobby: EntranceStyle = "porte") {
  k.occupy([x, 0, z, x + w, h, z + d], "mass");
  k.box(x + m(0.5), 0, z + m(0.5), w - m(1), h, d - m(1), PAL.charcoal);
  sides(x, z, w, d).forEach((s, side) => (side === 0 ? shopfronts(k, s, 0, Math.min(h, m(4.5)), [c.accentColor, PAL.magenta, PAL.cyan, PAL.amber], m(4), lobby) : plainWall(k, s, 0, Math.min(h, m(4.5)), side === 2)));
  roof(k, x, h, z, w, d, c.secondaryColor, m(1));
  return h + m(0.25);
}

/** A residential tower of flats with a roof, rooftop gear and the odd neon sign; returns its top. */
function flatsTower(k: Kit, c: BuildingConfig, x: number, y: number, z: number, w: number, h: number, d: number, tone: number, kind: BuildingConfig["rooftopStyle"]) {
  block(k, x, y, z, w, h, d, styled(FLATS, c, tone));
  roof(k, x, y + h, z, w, d, c.primaryColor);
  rooftop(k, x, y + h + m(0.25), z, w, d, kind);
  return y + h;
}

/**
 * B. Twin-tower complex: two apartment towers of different heights on a shared shop podium,
 * skybridges between them at two levels, a garden court on the podium roof.
 */
export function twinTowerComplex(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const top0 = sharedPodium(k, c, 0, 0, W, D, fl * 2);
  const tw = Math.round(W * 0.38);
  const td = Math.round(D * 0.7);
  const tz = (D - td) / 2;
  const h1 = Math.round((H - top0 - m(3)) / fl) * fl;
  const h2 = Math.round((h1 * k.rng.range(0.68, 0.82)) / fl) * fl;
  const ax = m(1);
  const bx = W - tw - m(1);
  // The skybridges reserve their space first, so the towers' balconies and AC units keep clear.
  const bridgeYs = [0.45, 0.85].map((share) => top0 + Math.round((h2 * share) / fl) * fl);
  for (const by of bridgeYs) k.occupy(bridgeBox(ax + tw, D / 2, bx, D / 2, by), "bridge");
  const topA = flatsTower(k, c, ax, top0, tz, tw, h1, td, c.primaryColor, c.rooftopStyle);
  flatsTower(k, c, bx, top0, tz + m(1), tw, h2, td - m(2), c.secondaryColor, "garden");
  for (const by of bridgeYs) skybridge(k, ax + tw, D / 2, bx, D / 2, by, m(2.5), false);
  // The court between the towers.
  const gx = ax + tw + m(1);
  garden(k, gx, top0, m(1.5), bx - gx - m(1), D - m(3));
  // A blade sign on tower A's corner facing the court.
  const [south] = sides(ax, tz, tw, td);
  pierSign(k, south, FLATS, -1, top0, h1, top0 + fl * 2, m(7), c.accentColor);
  const [, east] = sides(bx, tz + m(1), tw, td - m(2));
  billboard(k, east, (td - m(2)) * 0.25, top0 + h2 * 0.5, (td - m(2)) * 0.5, m(6), [PAL.cyan, PAL.blue, PAL.violet]);
  antenna(k, ax + m(1.5), topA + m(0.25), tz + m(1.5), m(5));
}

/**
 * C. Stacked megablock: interlocking volumes stacked off-center so the upper ones cantilever out,
 * terraces with gardens on the exposed roofs, and neon signs.
 */
export function stackedMegablock(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const shop = m(4.5);
  groundFloor(k, c, 0, 0, W, D, shop);

  // 1. Lay out three or four volumes, each offset from the one below by a few meters.
  const n = k.rng.int(3, 4);
  const each = Math.max(2, Math.floor((H - shop - m(3)) / fl / n));
  const volumes: Volume[] = [];
  let x = 0;
  let z = 0;
  let w = Math.round(W * 0.85);
  let d = Math.round(D * 0.85);
  let y = shop;
  for (let i = 0; i < n; i++) {
    const h = each * fl;
    volumes.push({ x, z, w, d, y, h });
    const nw = Math.round(w * k.rng.range(0.6, 0.8));
    const nd = Math.round(d * k.rng.range(0.7, 0.95));
    const nx = Math.min(W - nw, Math.max(0, x + (i % 2 ? -1 : 1) * m(k.rng.range(2, 4)) + (w - nw) * (i % 2 ? 0.2 : 0.8)));
    const nz = Math.min(D - nd, Math.max(0, z + (i % 2 ? 1 : -1) * m(k.rng.range(1, 3)) + (d - nd) / 2));
    y += h + m(0.5);
    [x, z, w, d] = [nx, nz, nw, nd];
  }

  // 2. Build the volumes.
  volumes.forEach((v, i) => {
    const tone = [c.primaryColor, c.secondaryColor, PAL.warmGray, PAL.plum][i % 4];
    block(k, v.x, v.y, v.z, v.w, v.h, v.d, styled({ ...FLATS, balconies: 0.25, ac: 0.35 }, c, tone));
    cornice(k, v.x, v.y + v.h, v.z, v.w, v.d, PAL.charcoal, m(0.25));
    const next = volumes[i + 1];
    if (next) {
      // A garden on the part of this roof the next volume doesn't cover.
      const tx = next.x > v.x + m(2) ? v.x : next.x + next.w;
      const tw = next.x > v.x + m(2) ? next.x - v.x : v.x + v.w - (next.x + next.w);
      if (tw > m(2)) garden(k, tx + m(0.5), v.y + v.h + m(0.5), v.z + m(0.5), tw - m(1), v.d - m(1));
    } else {
      roof(k, v.x, v.y + v.h + m(0.5), v.z, v.w, v.d, c.primaryColor);
      rooftop(k, v.x, v.y + v.h + m(0.75), v.z, v.w, v.d, c.rooftopStyle);
    }
  });
  // Blade signs on two corner columns of the bottom volume.
  const v0 = volumes[0];
  const [south, east] = sides(v0.x, v0.z, v0.w, v0.d);
  pierSign(k, south, FLATS, 0, v0.y, v0.h, shop + fl, m(6), c.accentColor);
  pierSign(k, east, FLATS, 0, v0.y, v0.h, shop + fl * 3, m(5), PAL.magenta);
}

interface Volume {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  h: number;
}

/**
 * D. Vertical neighborhood: four slim towers of different heights on a shared shop podium, with
 * narrow alleys between them, elevated walkways, laundry lines and window units.
 */
export function verticalNeighborhood(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const top0 = sharedPodium(k, c, 0, 0, W, D, fl * 1.5, "gate");
  const alley = m(4);
  const tw = (W - alley - m(1)) / 2;
  const td = (D - alley - m(1)) / 2;
  const spots = [
    [m(0.5), m(0.5)],
    [m(0.5) + tw + alley, m(0.5)],
    [m(0.5), m(0.5) + td + alley],
    [m(0.5) + tw + alley, m(0.5) + td + alley],
  ];
  const heights = spots.map(() => Math.round(((H - top0 - m(3)) * k.rng.range(0.6, 1)) / fl) * fl);
  heights[k.rng.int(0, 3)] = Math.round((H - top0 - m(3)) / fl) * fl;
  const tones = [c.primaryColor, c.secondaryColor, PAL.rust, PAL.slate];
  // Walkways across the alleys and laundry lines, decided and reserved first, so the towers'
  // balconies and AC units keep clear of them. Spans reach from 80% into one quarter to 20% into
  // the next, so they meet the towers however far each is pulled back from the alley.
  const low = Math.min(...heights);
  const gapX = alley + tw * 0.4;
  const gapZ = alley + td * 0.4;
  const walks: [number, number, number, number, number][] = [];
  const lines: number[] = [];
  for (let t = fl * 3; t < low - fl; t += fl * k.rng.int(3, 5)) {
    const y = top0 + t;
    if (k.rng.chance(0.6)) walks.push([m(0.5) + tw * 0.8, m(0.5) + td / 2, m(0.5) + tw * 0.8 + gapX, m(0.5) + td / 2, y]);
    if (k.rng.chance(0.6)) walks.push([m(0.5) + tw / 2, m(0.5) + td * 0.8, m(0.5) + tw / 2, m(0.5) + td * 0.8 + gapZ, y + fl]);
    lines.push(y + fl * 0.5, y + fl * 1.5);
  }
  const lx = m(0.5) + tw * 0.8;
  const lz = m(0.5) + td * 0.7;
  for (const [x0, z0, x1, z1, y] of walks) k.occupy(bridgeBox(x0, z0, x1, z1, y, m(1.5)), "bridge");
  // (The lines run into the towers' walls; only the stretch across the alley itself is reserved.)
  for (const ly of lines) k.occupy([m(0.5) + tw, ly - m(0.55), lz - m(0.1), m(0.5) + tw + alley, ly + m(0.1), lz + m(0.1)], "prop");
  // Each tower takes 80–100% of its quarter, pulled back from the alleys by its own amount, so
  // the notches between them show from outside.
  const towers = spots.map(([x, z], i) => {
    const w = Math.round(tw * k.rng.range(0.8, 1));
    const d = Math.round(td * k.rng.range(0.8, 1));
    const ox = i % 2 ? x + (tw - w) : x;
    const oz = i < 2 ? z : z + (td - d);
    flatsTower(k, c, ox, top0, oz, w, heights[i], d, tones[i], i % 2 ? "garden" : c.rooftopStyle);
    return { ox, oz, w, d };
  });
  for (const [x0, z0, x1, z1, y] of walks) skybridge(k, x0, z0, x1, z1, y, m(1.5), false);
  for (const ly of lines) {
    k.box(lx, ly, lz, gapX, m(0.05), m(0.05), PAL.pale);
    for (let a = m(0.3); a < gapX - m(0.3); a += m(0.5)) if (k.rng.chance(0.5)) k.box(lx + a, ly - m(0.5), lz - m(0.05), m(0.35), m(0.45), m(0.1), k.rng.pick([PAL.magenta, PAL.pale, PAL.amber, PAL.blue, PAL.leaf]));
  }
  // A blade sign on the first tower's corner at the mouth of the alley.
  const t0 = towers[0];
  const [south] = sides(t0.ox, t0.oz, t0.w, t0.d);
  pierSign(k, south, FLATS, -1, top0, heights[0], top0 + fl, m(6), c.accentColor);
}

/**
 * E. Terraced residential: a broad stepped block, each storey group pulled back from the south and
 * east to leave a planted terrace with a railing, trees on the terraces, a garden on top.
 */
export function terracedResidential(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const shop = m(4.5);
  groundFloor(k, c, 0, 0, W, D, shop, [], "portico", "office");
  const tiers = Math.max(3, Math.min(6, Math.floor((H - shop) / (fl * 2))));
  const per = Math.max(1, Math.floor((H - shop - m(2)) / fl / tiers));
  const stepX = m(2.5);
  const stepZ = m(2.5);
  let y = shop;
  for (let i = 0; i < tiers; i++) {
    const w = W - i * stepX;
    const d = D - i * stepZ;
    if (w < m(6) || d < m(6)) break;
    const h = per * fl;
    block(k, 0, y, 0, w, h, d, styled({ ...FLATS, balconies: 0.15, ac: 0.2 }, c, i % 2 ? c.secondaryColor : c.primaryColor));
    // No parapet: the next tier stands on this roof, and the terrace gets its own rail.
    roof(k, 0, y + h, 0, w, d, c.primaryColor, i === tiers - 1 ? m(0.5) : 0);
    // The terrace this tier leaves in front of the next: planting, trees and a rail.
    const nw = w - stepX;
    const nd = d - stepZ;
    const ty = y + h + m(0.25);
    if (i < tiers - 1 && nw >= m(6) && nd >= m(6)) {
      k.box(0, ty, nd, w, m(0.4), stepZ, PAL.leafDark);
      k.box(nw, ty, 0, stepX, m(0.4), nd, PAL.leafDark);
      // Rails stand on the planting, held in from its ends.
      k.box(PROUD, ty + m(0.4), d - m(0.15), w - 2 * PROUD, m(0.9), m(0.12), PAL.steel);
      k.box(w - m(0.15), ty + m(0.4), PROUD, m(0.12), m(0.9), d - m(0.15) - 2 * PROUD, PAL.steel);
      // Trees small enough to fit the terrace, each only where it has room.
      const plant = (px: number, pz: number) => {
        const size = m(k.rng.range(1.2, 1.6));
        if (k.clear(treeBox(px, ty + m(0.4), pz, size))) tree(k, px, ty + m(0.4), pz, size);
      };
      for (let a = m(2); a < w - m(1); a += m(k.rng.range(3, 5))) if (k.rng.chance(0.6)) plant(a, nd + stepZ / 2);
      for (let a = m(2); a < nd - m(1); a += m(k.rng.range(3, 5))) if (k.rng.chance(0.5)) plant(nw + stepX / 2, a);
    } else {
      rooftop(k, 0, ty, 0, w, d, "garden");
    }
    y += h + m(0.25);
  }
  // A blade sign on the bottom tier's street corner.
  const [south] = sides(0, 0, W, D);
  pierSign(k, south, FLATS, 0, shop, per * fl, shop + m(0.5), m(4), c.accentColor);
}

/**
 * F. Tower and annex: the old industrial pair, turned residential. A tall slab of flats over a
 * row of shops, and a low annex of flats beside it with shops below and a roof garden; a small
 * courtyard with trees in front of the annex, a screen high on the tower and a mast on its roof.
 */
export function towerAndAnnex(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const shop = m(4.5);
  // The annex on the west (the side the default view sees), the tower east of it.
  const aw = Math.round(W * 0.42);
  const tx = aw + m(0.5);
  const tw = W - tx;
  const th = Math.round((H * 0.9 - shop) / fl) * fl;
  groundFloor(k, c, tx, 0, tw, D, shop, [3], "glass");
  block(k, tx, shop, 0, tw, th, D, styled({ ...FLATS, balconies: 0.3, ac: 0.3, blind: [3] }, c, c.secondaryColor));
  roof(k, tx, shop + th, 0, tw, D, c.primaryColor);
  rooftop(k, tx, shop + th + m(0.25), 0, tw, D, "mixed");
  antenna(k, tx + tw * 0.2, shop + th + m(0.25), D * 0.2, Math.max(m(3), H - shop - th - m(1.5)));
  const [south] = sides(tx, 0, tw, D);
  billboard(k, south, tw * 0.3, shop + th * 0.62, tw * 0.45, tw * 0.55, [PAL.blue, PAL.cyan, PAL.violet]);
  pierSign(k, south, FLATS, -1, shop, th, shop + fl, m(6), c.accentColor);
  // The annex: shops, a few floors of flats (blind toward the tower), a roof garden.
  const ah = Math.round((H * 0.3 - shop) / fl) * fl;
  const ad = Math.round(D * 0.75);
  const az = D - ad;
  groundFloor(k, c, 0, az, aw, ad, shop, [1]);
  if (ah >= fl) {
    block(k, 0, shop, az, aw, ah, ad, styled({ ...FLATS, balconies: 0.35, ac: 0.3, blind: [1] }, c, c.primaryColor));
    roof(k, 0, shop + ah, az, aw, ad, c.secondaryColor);
    rooftop(k, 0, shop + ah + m(0.25), az, aw, ad, "garden");
  }
  // The courtyard in front of the annex: paving and a few trees, each where it has room.
  k.box(0, 0, 0, aw, m(0.15), az - m(0.25), PAL.concrete);
  for (let x = m(1.5); x < aw - m(1); x += m(3)) {
    const size = m(k.rng.range(1.5, 2.2));
    const z = (az - m(0.25)) / 2;
    if (k.clear(treeBox(x, m(0.15), z, size))) tree(k, x, m(0.15), z, size);
  }
}
