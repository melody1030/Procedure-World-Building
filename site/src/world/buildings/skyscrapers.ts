import type { RGB } from "../geometry";
import type { BuildingConfig } from "./config";
import { Kit, PAL, PROUD, m, sideBounds, sideBox, sides, type Hex, type Side } from "./kit";
import { FLATS, OFFICE, antenna, billboard, block, blank, bayCount, pierSign, cornerStrips, cornice, entrance, hvac, neonLine, pipes, plainWall, planter, platform, roof, rooftop, shopfronts, type EntranceStyle, type Facade } from "./parts";

/**
 * Skyscraper archetypes. Each takes the kit and a validated config and builds within the footprint
 * (0, 0)–(width, depth), in voxels.
 */

/** The facade for a config: the base style recolored, with the config's floor height and lights. */
export function styled(base: Facade, c: BuildingConfig, frame = c.primaryColor): Facade {
  return {
    ...base,
    floor: m(c.floorHeight),
    frame,
    accent: base.accent ?? (frame === c.secondaryColor ? c.primaryColor : c.secondaryColor),
    lit: c.windowDensity,
    balconies: base.balconies === undefined ? undefined : c.balconyDensity,
    ac: base.ac === undefined ? undefined : base.ac * (0.5 + c.detailDensity),
    signs: base.signs === undefined ? undefined : base.signs * (0.5 + c.detailDensity) * (c.neonIntensity > 0 ? 1 : 0),
  };
}

/**
 * A street-level podium: a ground floor (`retail` shops on the south side and plain walls on the
 * others, shops `all` round, or an `office` glass lobby front all round), a lit office floor
 * above, a roof. The middle of the south row is the tower's lobby.
 */
export function podium(k: Kit, c: BuildingConfig, x: number, z: number, w: number, d: number, h: number, lobby: EntranceStyle = "glass", ground: "retail" | "all" | "office" = "retail") {
  const shop = Math.min(h, m(4.5));
  k.occupy([x, 0, z, x + w, shop, z + d], "mass");
  k.box(x + m(0.5), 0, z + m(0.5), w - m(1), shop, d - m(1), PAL.charcoal);
  const colors = [c.accentColor, PAL.magenta, PAL.cyan, PAL.amber];
  sides(x, z, w, d).forEach((s, side) => {
    if (ground === "office") shopfronts(k, s, 0, shop, colors, m(4), side === 0 && lobby, "office");
    else if (side === 0 || ground === "all") shopfronts(k, s, 0, shop, colors, m(4), side === 0 && lobby);
    else plainWall(k, s, 0, shop, side === 2);
  });
  if (h > shop + m(1)) block(k, x, shop, z, w, h - shop, d, { ...styled(OFFICE, c, c.secondaryColor), bay: m(3) });
  roof(k, x, h, z, w, d, c.secondaryColor);
  return h + m(0.25);
}

/**
 * A. Corporate megatower, after One Vanderbilt (SUMMIT) and 30 Hudson Yards (Edge): a shaft that
 * tapers all the way up (a voxel or two in at every tier, the south face leaning in twice as fast,
 * the north face sheer), cut every few tiers by a recessed glass reveal; a glass observation
 * floor near the top with a triangular sky deck jutting out of the leaning face; a faceted glass
 * crown of shrinking lanterns; and a spire. A lobby podium at the base, screens on the shaft.
 */
export function corporateMegatower(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const face = styled({ ...OFFICE, bay: m(2), fins: 2, finColor: c.secondaryColor }, c);
  const top0 = podium(k, c, 0, 0, W, D, fl * 3, "revolving", "office");

  // 1. The shaft, in tiers of four floors, tapering to the observation floor at ~72% of the height.
  const deckY = top0 + Math.round((H * 0.72 - top0) / fl) * fl;
  const w0 = Math.round(W * 0.76);
  const d0 = Math.round(D * 0.8);
  const x0 = Math.round((W - w0) / 2);
  const z0 = Math.round(D * 0.06);
  const at = (y: number) => {
    const f = (y - top0) / (deckY - top0);
    const ix = Math.round(f * W * 0.15);
    return { x: x0 + ix, z: z0, w: w0 - 2 * ix, d: d0 - Math.round(f * D * 0.3) };
  };
  const tierH = fl * 4;
  // Each tier ends in a thin ledge standing out past its fins (the bands on SUMMIT's shaft); the
  // observation floor's slab reaches as far.
  const ledge = m(0.6);
  let y = top0;
  let tier = 0;
  let last = at(y);
  while (y < deckY - fl) {
    const { x, z, w, d } = at(y);
    if (tier % 3 === 2) {
      // A reveal: a storey of dark glass set back from the faces, a cyan line along it, and a
      // soffit under the tier above (which stands out over it).
      const r = m(0.75);
      const rh = fl - m(0.25);
      glassBand(k, x + r, y, z + r, w - 2 * r, rh, d - 2 * r, c.accentColor, 0.3);
      const n = at(y + fl);
      k.box(n.x, y + rh, n.z, n.w, m(0.25), n.d, c.secondaryColor);
      last = { x: x + r, z: z + r, w: w - 2 * r, d: d - 2 * r };
      y += fl;
    } else {
      const h = Math.min(tierH, deckY - y) - m(0.25);
      block(k, x, y, z, w, h, d, face);
      cornice(k, x, y + h, z, w, d, c.secondaryColor, ledge, m(0.25));
      last = { x, z, w, d };
      cornerStrips(k, x, y, z, w, h, d, c.accentColor);
      const [south, east, north] = sides(x, z, w, d);
      // Screens: a wide one low on the east face, a tall banner high on the sheer north face.
      if (tier === 1) billboard(k, east, d * 0.2, y + h * 0.12, d * 0.6, h * 0.72, [PAL.violet, PAL.magenta, PAL.blue]);
      if (tier === 7) billboard(k, north, w * 0.32, y + h * 0.08, w * 0.36, h * 0.84, [PAL.cyan, PAL.blue, PAL.violet]);
      if (tier === 4) billboard(k, south, w * 0.25, y + h * 0.15, w * 0.5, h * 0.6, [PAL.magenta, PAL.violet, PAL.cyan]);
      y += h + m(0.25);
    }
    tier++;
  }

  // 2. The observation floor: a slab, a glass wall set back from its edge, and a roof slab.
  const { x, z, w, d } = last;
  const e = ledge;
  const obsH = Math.round(fl * 1.5);
  k.box(x - e, y, z - e, w + 2 * e, m(0.25), d + 2 * e, c.secondaryColor);
  const gy = y + m(0.25);
  const gi = m(0.75);
  glassBand(k, x + gi, gy, z + gi, w - 2 * gi, obsH, d - 2 * gi, PAL.cyan, 0.35);
  skyDeck(k, sides(x, z, w, d)[0], y, e, c.accentColor);
  const ry = gy + obsH;
  k.box(x - e, ry, z - e, w + 2 * e, m(0.5), d + 2 * e, c.primaryColor);
  for (const s of sides(x - e, z - e, w + 2 * e, d + 2 * e)) neonLine(k, s, 0, ry + m(0.15), s.length, c.accentColor);

  // 3. The crown: lanterns of glass between pale fins, each smaller and pulled toward the sheer
  // north face, a slab between, light up their corners; then the spire.
  let cy = ry + m(0.5);
  let cx = x;
  let cz = z;
  let cw = w;
  let cd = d;
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const nw = Math.round(cw * 0.82);
    const nd = Math.round(cd * 0.78);
    cx += Math.round((cw - nw) / 2);
    cw = nw;
    cd = nd;
    const ch = Math.round(fl * (1.4 - i * 0.15));
    k.occupy([cx, cy, cz, cx + cw, cy + ch, cz + cd], "mass");
    k.box(cx, cy, cz, cw, ch, cd, PAL.glassBlue);
    for (const s of sides(cx, cz, cw, cd)) {
      for (let a = 0; a + m(0.2) <= s.length; a += m(1.25)) {
        sideBox(k, s, a, cy, 0, m(0.2), ch, m(0.3), PAL.pale);
        const pw = Math.min(m(1.05), s.length - a - m(0.2));
        if (pw > m(0.3)) sideBox(k, s, a + m(0.2), cy + m(0.25), PROUD, pw, ch - m(0.5), 0.12, i % 2 ? PAL.white : PAL.cyan, true, (0.22 + 0.1 * i) * k.neon);
      }
    }
    cornerStrips(k, cx, cy, cz, cw, ch, cd, c.accentColor);
    cy += ch;
    k.box(cx - e, cy, cz - e, cw + 2 * e, m(0.25), cd + 2 * e, i === levels - 1 ? c.primaryColor : c.secondaryColor);
    cy += m(0.25);
  }
  const spire = Math.max(m(6), H - cy);
  const sx = cx + cw / 2;
  const sz = cz + cd / 2;
  k.occupy([sx - m(0.6), cy, sz - m(0.6), sx + m(0.6), cy + spire + m(0.6), sz + m(0.6)], "roofgear");
  // Three sections, each thinner, with red marker rings a little wider than the section they wrap.
  const sections: [number, number, Hex][] = [
    [0, m(1.2), PAL.steel],
    [0.35, m(0.7), PAL.pale],
    [0.7, m(0.3), PAL.pale],
  ];
  sections.forEach(([from, size, color], i) => {
    const to = i < 2 ? sections[i + 1][0] : 1;
    k.box(sx - size / 2, cy + spire * from, sz - size / 2, size, spire * (to - from), size, color);
    const mid = cy + spire * (from + to) / 2;
    k.light(sx - size / 2 - 0.25, mid, sz - size / 2 - 0.25, size + 0.5, m(0.3), size + 0.5, PAL.red, 0.8);
  });
  k.light(sx - m(0.3), cy + spire, sz - m(0.3), m(0.6), m(0.6), m(0.6), PAL.red);

  // Planters on the podium roof.
  if (c.detailDensity > 0.3) {
    planter(k, m(1.5), top0, m(1.5));
    planter(k, W - m(1.5), top0, m(1.5));
  }
}

/**
 * A storey of glass all round a mass: a dark glass box, softly lit panes in front of it between
 * pale mullions. For the shaft's reveals and the observation floor.
 */
function glassBand(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, color: Hex, strength: number) {
  k.occupy([x, y, z, x + w, y + h, z + d], "mass");
  k.box(x, y, z, w, h, d, PAL.glassBlue);
  for (const s of sides(x, z, w, d)) {
    const n = Math.max(1, Math.round(s.length / m(1.75)));
    const step = s.length / n;
    for (let i = 0; i < n; i++) {
      sideBox(k, s, i * step, y, 0, m(0.15), h, m(0.2), PAL.pale);
      sideBox(k, s, i * step + m(0.15), y + m(0.1), PROUD, step - m(0.15), h - m(0.2), 0.12, color, true, strength * k.neon);
    }
  }
}

/**
 * Edge's sky deck: a triangle of floor jutting out from a side at floor level `y` (its point off
 * toward one end), in rows a half meter deep: a slab, a stepped truss under it that thins toward
 * the point, a glass floor panel near the wall, glass rails all round with a pale top rail, and a
 * light strip under its rim. `e` is how far out the floor slab it adjoins reaches.
 */
function skyDeck(k: Kit, s: Side, y: number, e: number, color: Hex) {
  const reach = Math.min(m(12), s.length * 0.8);
  const rd = m(0.5);
  const len = s.length;
  const [b0, b1, apex] = [len * 0.04, len * 0.96, len * 0.74];
  const top = y + m(0.25);
  const railH = m(1.3);
  k.occupy(sideBounds(s, b0, y - m(2.75), e, b1 - b0, m(2.75) + m(0.25) + railH + m(0.1), reach), "platform");
  let prev: [number, number] | null = null;
  for (let t = 0; t + rd <= reach; t += rd) {
    const f = (t + rd / 2) / reach;
    const a0 = Math.round(b0 + (apex - b0) * f);
    const a1 = Math.round(b1 + (apex - b1) * f);
    if (a1 - a0 < m(0.75)) break;
    const out = e + t;
    sideBox(k, s, a0, y - m(0.5), out, a1 - a0, m(0.75), rd, PAL.charcoal);
    // The truss: deepest at the wall, gone at the point.
    const belly = Math.round(m(2.25) * (1 - f));
    if (belly > 0 && a1 - a0 > m(1.5)) sideBox(k, s, a0 + m(0.5), y - m(0.5) - belly, out, a1 - a0 - m(1), belly, rd, PAL.slate);
    // The glass floor, out over the street for the first few meters.
    if (t < reach * 0.45 && a1 - a0 > m(3)) sideBox(k, s, a0 + m(1), top, out, a1 - a0 - m(2), 0.1, rd, color, true, 0.45 * k.neon);
    // The rim light under the slab's two edges.
    for (const ea of [a0, a1 - m(0.25)]) sideBox(k, s, ea, y - m(0.5) - 0.1, out, m(0.25), 0.1, rd, color, true, 0.9 * k.neon);
    // Glass rails: along both edges of the row, and across the steps between rows.
    const pane = (a: number, o: number, l: number, th: number) => {
      sideBox(k, s, a, top, o, l, railH, th, PAL.cyan, true, 0.3 * k.neon);
      sideBox(k, s, a, top + railH, o, l, m(0.1), th, PAL.pale);
    };
    pane(a0, out, 0.15, rd);
    pane(a1 - 0.15, out, 0.15, rd);
    if (prev) {
      if (a0 > prev[0] + 0.15) pane(prev[0] + 0.15, out, a0 - prev[0] - 0.15, 0.15);
      if (a1 < prev[1] - 0.15) pane(a1, out, prev[1] - 0.15 - a1, 0.15);
    }
    prev = [a0, a1];
    if (t + 2 * rd > reach || Math.round(b1 + (apex - b1) * ((t + 1.5 * rd) / reach)) - Math.round(b0 + (apex - b0) * ((t + 1.5 * rd) / reach)) < m(0.75)) {
      // The point: a rail across the last row's end.
      pane(a0 + 0.15, out + rd - 0.15, a1 - a0 - 0.3, 0.15);
      break;
    }
  }
}

/**
 * B. Neon commercial tower: a mid-height tower covered in signs: blade signs at several heights,
 * screens, neon bands every few floors, service platforms on the back, a penthouse and a rooftop
 * sign frame.
 */
export function neonCommercialTower(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const top0 = podium(k, c, 0, 0, W, D, fl * 2, "glass", "all");
  const inset = m(1);
  const bodyH = Math.round((H - top0) * 0.72 / fl) * fl;
  // Lit windows in one warm family, so the signs carry the color.
  const face = { ...styled({ ...OFFICE, bay: m(2) }, c, PAL.charcoal), lights: [PAL.warm, PAL.warm, PAL.amber] };
  block(k, inset, top0, inset, W - 2 * inset, bodyH, D - 2 * inset, face);
  const [south, east, north, west] = sides(inset, inset, W - 2 * inset, D - 2 * inset);
  // Screens, platforms and pipes first, then the neon bands (broken around them), then the blade
  // signs, which keep clear of all of it.
  billboard(k, west, west.length * 0.15, top0 + bodyH * 0.45, west.length * 0.7, bodyH * 0.3, [PAL.magenta, PAL.violet, PAL.cyan]);
  billboard(k, south, south.length * 0.55, top0 + bodyH * 0.15, south.length * 0.35, bodyH * 0.2, [PAL.cyan, PAL.blue]);
  for (let y = top0 + fl * 3; y < top0 + bodyH - fl; y += fl * 5) platform(k, north, north.length * 0.2, y, north.length * 0.5);
  pipes(k, north, north.length * 0.8, top0, bodyH, 3);
  // Neon bands every four floors, alternating colors, in runs between whatever is on the wall.
  for (let y = top0 + fl * 4; y < top0 + bodyH - fl; y += fl * 4) {
    const color = ((y / fl) | 0) % 8 < 4 ? c.accentColor : PAL.magenta;
    for (const s of [south, east, north, west]) {
      const gap = m(0.25);
      const blocked = k
        .touching(sideBounds(s, 0, y, 0, s.length, m(0.2), m(0.15)))
        .map(({ box }) => {
          const along = [box[0] * s.ux + box[2] * s.uz, box[3] * s.ux + box[5] * s.uz].map((v) => v - (s.ox * s.ux + s.oz * s.uz));
          return [Math.min(...along) - gap, Math.max(...along) + gap];
        })
        .sort((p, q) => p[0] - q[0]);
      let a = 0;
      for (const [b0, b1] of [...blocked, [s.length, s.length]]) {
        if (b0 - a > m(0.5)) {
          neonLine(k, s, a, y, b0 - a, color, 0.9);
          k.occupy(sideBounds(s, a, y, 0, b0 - a, m(0.2), m(0.15)), "prop");
        }
        a = Math.max(a, b1);
      }
    }
  }
  // Blade signs on the inner piers of the south and east faces (never the corner columns, where a
  // south and an east sign would meet), as many as the height has room for. Each keeps clear of
  // the screens, the bands and the other signs, or is left out.
  const signs = Math.round(((3 + 4 * c.detailDensity) * bodyH) / m(30));
  for (let i = 0; i < signs; i++) {
    const s = i % 2 ? east : south;
    const bays = bayCount(s, face);
    if (bays < 2) continue;
    // Every other pier only, so neighboring signs are two bays apart and don't cover each other
    // seen at an angle.
    pierSign(k, s, face, 1 + 2 * k.rng.int(0, Math.floor((bays - 2) / 2)), top0, bodyH, top0 + k.rng.range(0.05, 0.8) * bodyH, m(k.rng.range(3, 7)), k.rng.pick([c.accentColor, PAL.magenta, PAL.amber, PAL.violet]));
  }
  cornice(k, inset, top0 + bodyH, inset, W - 2 * inset, D - 2 * inset, c.secondaryColor);
  // Penthouse, rooftop gear and a sign on a frame.
  const py = top0 + bodyH + m(0.5);
  const pw = (W - 2 * inset) * 0.65;
  const pd = (D - 2 * inset) * 0.6;
  block(k, inset + m(1), py, inset + m(1), pw, fl * 2, pd, face);
  roof(k, inset + m(1), py + fl * 2, inset + m(1), pw, pd, c.primaryColor);
  rooftop(k, inset + m(1), py + fl * 2 + m(0.25), inset + m(1), pw, pd, "service");
  const fx = inset + pw + m(1.5);
  const fw = W - inset - fx - m(0.5);
  if (fw > m(3)) {
    k.box(fx, py, D * 0.6, m(0.3), m(5), m(0.3), PAL.steel);
    k.box(fx + fw - m(0.3), py, D * 0.6, m(0.3), m(5), m(0.3), PAL.steel);
    const [frameFace] = sides(fx, D * 0.6 - m(0.3), fw, m(0.3));
    billboard(k, frameFace, 0, py + m(2), fw, m(3), [PAL.magenta, c.accentColor]);
  }
  antenna(k, inset + m(2), py + fl * 2, inset + m(2), m(5));
}

/**
 * C. Residential skyscraper: a tall stack of flats in three sections split by mechanical floors,
 * warm light strips up the middle, balconies, a maintenance platform near the top and a garden roof.
 */
export function residentialSkyscraper(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const top0 = podium(k, c, 0, 0, W, D, m(4.5), "porte");
  const inset = m(1.25);
  const x = inset;
  const z = inset;
  const w = W - 2 * inset;
  const d = D - 2 * inset;
  const total = Math.floor((H - top0 - m(6)) / fl);
  const parts = [0.4, 0.33, 0.27];
  let y = top0;
  parts.forEach((share, i) => {
    const floors = Math.max(3, Math.round(total * share) - 1);
    const tone = i % 2 ? c.secondaryColor : c.primaryColor;
    block(k, x, y, z, w, floors * fl, d, styled({ ...FLATS_TALL }, c, tone));
    y += floors * fl;
    // A mechanical floor: a solid band with vents and a light line.
    blank(k, x - m(0.25), y, z - m(0.25), w + m(0.5), fl * 0.7, d + m(0.5), PAL.charcoal);
    for (const s of sides(x - m(0.25), z - m(0.25), w + m(0.5), d + m(0.5))) neonLine(k, s, 0, y + fl * 0.35, s.length, i === 2 ? c.accentColor : PAL.amber, 0.7);
    y += fl * 0.7;
  });
  // Warm light strips up the middle of the south and east faces.
  const [south, east, north] = sides(x, z, w, d);
  for (const s of [south, east]) sideBox(k, s, s.length / 2 - m(0.2), top0 + fl, m(0.05), m(0.4), y - top0 - fl * 2, m(0.15), PAL.amber, true, 0.75 * k.neon);
  // A maintenance platform near the top, at the first height clear of balconies and AC units.
  for (let up = 3; up <= 8 && !platform(k, north, north.length * 0.15, y - fl * up, north.length * 0.7); up++);
  roof(k, x, y, z, w, d, c.primaryColor, m(1));
  rooftop(k, x, y + m(0.25), z, w, d, "garden");
  antenna(k, x + m(1), y + m(0.25), z + m(1), m(7));
  hvac(k, x + w - m(3), y + m(0.25), z + m(1));
}

/** Tall flats: like FLATS but a little more glass and fewer AC units. */
const FLATS_TALL: Facade = { ...FLATS, bay: m(2.25), balconies: 0.35, ac: 0.15 };

/**
 * D. Research lab tower, after Louis Kahn's Richards Medical Research Laboratories and the Salk
 * Institute: two glass lab towers either side of a windowless concrete service tower. Every two
 * lab floors there is a louvered service floor (Salk's interstitial floors). Exterior columns
 * stand at the third points of each face, so the corners are glass, and brick shafts for stairs
 * and exhaust air climb the outside of the lab towers past their roofs (Kahn's "servant" spaces).
 * Clusters of tall exhaust stacks stand on the roofs, a glass greenhouse on one lab tower, and a
 * lit double helix runs up the service tower.
 */
export function researchLabTower(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  // A gap wide enough for the lab towers' fins and ledges.
  const g = m(1);
  // The service tower in the middle, a lab tower either side.
  const sw = Math.round(W * 0.18);
  const L = Math.round((W - sw - 2 * g) / 2);
  const sx = L + g;
  const sd = Math.round(D * 0.6);
  const sz = Math.round((D - sd) / 2);
  const ld = Math.min(L + m(1), Math.round(D * 0.75));
  const lz = Math.round((D - ld) / 2);
  const serviceH = Math.round((H * 0.8) / fl) * fl;
  const band = m(1.5);
  const pier = m(0.6);
  const bay = (L - pier) / 3;
  const glass = c.accentColor;

  // 1. The lab towers: pairs of lab floors between louvered service floors.
  const labs = [
    { x: 0, h: serviceH - fl * 2, shafts: [3, 2], green: false },
    { x: sx + sw + g, h: Math.round((serviceH * 0.72) / fl) * fl, shafts: [1, 0], green: true },
  ];
  for (const lab of labs) {
    const face: Facade = {
      ...styled({ ...OFFICE, bay, pier, recess: m(0.5), fins: 1, finColor: c.secondaryColor }, c, c.secondaryColor),
      lit: Math.min(1, c.windowDensity * 1.2),
      lights: [PAL.white, PAL.white, PAL.cyan],
    };
    const ground: Facade = { ...face, door: (side, a, len, j) => j === 0 && side === 0 && Math.abs(a + len / 2 - L / 2) < len / 2 };
    let y = 0;
    while (y + 2 * fl <= lab.h) {
      block(k, lab.x, y, lz, L, 2 * fl, ld, y === 0 ? ground : face);
      y += 2 * fl;
      if (y + band + 2 * fl > lab.h) break;
      louvers(k, lab.x, y, lz, L, band, ld);
      y += band;
    }
    roof(k, lab.x, y, lz, L, ld, c.primaryColor);
    const top = y + m(0.25);
    // Brick shafts up the outside: one on the far end, one on a long face (in a side bay).
    const labSides = sides(lab.x, lz, L, ld);
    lab.shafts.forEach((side, i) => {
      const s = labSides[side];
      const shw = m(2);
      const a = i === 0 ? (s.length - shw) / 2 : pier + (bay - pier - shw) / 2;
      brickShaft(k, s, a, shw, m(1.6), top + m(3.5), i === 0);
    });
    // Exhaust stacks, and on one tower a greenhouse.
    if (lab.green) greenhouse(k, lab.x + m(1), top, lz + m(1), L * 0.55, ld * 0.5);
    exhaustStacks(k, lab.x + L * (lab.green ? 0.72 : 0.3), top, lz + ld * 0.6, 3);
  }

  // 2. The service tower: board-marked concrete, almost no windows, air intakes on the north face,
  // a loading door, and the helix on its south face.
  k.occupy([sx, 0, sz, sx + sw, serviceH, sz + sd], "mass");
  k.box(sx, 0, sz, sw, serviceH, sd, c.primaryColor);
  const svc = sides(sx, sz, sw, sd);
  for (const [side, s] of svc.entries()) {
    // Formwork lines every floor (held short of the corners, so neighbors never meet).
    for (let y = fl; y < serviceH - m(0.5); y += fl) sideBox(k, s, PROUD, y, 0, s.length - 2 * PROUD, m(0.1), PROUD, k.vary(c.primaryColor, 0.08));
    // A few slit windows, high up on the side walls.
    if (side % 2) for (let y = serviceH - fl * 3; y < serviceH - fl; y += fl) sideBox(k, s, s.length / 2 - m(0.15), y + m(0.6), 0, m(0.3), m(1.6), 0.15, PAL.amber, true, 0.55);
  }
  const [svcS, , svcN] = svc;
  for (let i = 0; i < 3; i++) {
    const a = (svcN.length / 3) * i + m(0.5);
    const iw = svcN.length / 3 - m(1);
    const iy = fl + m(0.5);
    sideBox(k, svcN, a, iy, 0, iw, serviceH * 0.55, m(0.3), PAL.charcoal);
    for (let y = iy + m(0.3); y < iy + serviceH * 0.55; y += m(0.45)) sideBox(k, svcN, a, y, m(0.3), iw, m(0.12), m(0.12), PAL.steel);
  }
  sideBox(k, svcN, m(0.5), 0, 0, svcN.length - m(1), m(2.8), PROUD, PAL.gunmetal);
  helix(k, svcS, fl * 2, serviceH - fl * 2, glass);
  entrance(k, svcS, svcS.length / 2, 0, svcS.length - m(1), "portico");
  roof(k, sx, serviceH, sz, sw, sd, c.secondaryColor, m(0.5));
  exhaustStacks(k, sx + sw / 2, serviceH + m(0.25), sz + sd * 0.45, Math.max(3, Math.round(H / m(15))), Math.min(m(7), H - serviceH - m(1)));
}

/**
 * A louvered service floor: a ledge capping the lab floors below, a dark band set in, steel slats
 * across it, and a soffit under the floor above. Ledge and soffit reach past the fins.
 */
function louvers(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number) {
  const r = m(0.3);
  const e = m(0.6);
  const t = m(0.15);
  k.occupy([x, y, z, x + w, y + h, z + d], "mass");
  k.box(x - e, y, z - e, w + 2 * e, t, d + 2 * e, PAL.charcoal);
  k.box(x + r, y + t, z + r, w - 2 * r, h - 2 * t, d - 2 * r, PAL.gunmetal);
  for (const [side, s] of sides(x, z, w, d).entries()) {
    // The long sides run corner to corner; the ends fit between them.
    const a0 = side % 2 ? r : 0;
    for (let ty = t + m(0.12); ty < h - t - m(0.2); ty += m(0.35)) sideBox(k, s, a0, y + ty, -r, s.length - 2 * a0, m(0.12), r + PROUD, PAL.steel);
  }
  k.box(x - e, y + h - t, z - e, w + 2 * e, t, d + 2 * e, PAL.charcoal);
}

/** A brick shaft up a face: courses every 3 m (offset so they never line up with the ledges), a stair's slit windows (or an exhaust grille) and a cap. */
function brickShaft(k: Kit, s: Side, a: number, w: number, d: number, h: number, stair: boolean) {
  k.occupy(sideBounds(s, a, 0, 0, w, h + m(0.5), d + PROUD), "mass");
  sideBox(k, s, a, 0, 0, w, h, d, k.vary(PAL.rust, 0.04));
  for (let y = m(1.3); y < h - m(1); y += m(3)) sideBox(k, s, a - PROUD, y, PROUD, w + 2 * PROUD, m(0.15), d, PAL.concrete);
  if (stair) for (let y = m(1.5); y < h - m(2); y += m(3)) sideBox(k, s, a + w / 2 - m(0.15), y + m(0.4), d, m(0.3), m(1.4), 0.12, PAL.amber, true, 0.6);
  else sideBox(k, s, a + m(0.3), h - m(2.5), d, w - m(0.6), m(1.5), 0.12, PAL.charcoal);
  sideBox(k, s, a - m(0.15), h, 0, w + m(0.3), m(0.5), d + m(0.15), PAL.charcoal);
}

/** Lab exhaust: a cluster of tall slim stacks with dark caps, side by side along x, each where it has room. */
function exhaustStacks(k: Kit, x: number, y: number, z: number, n: number, h = m(6)) {
  const r = m(0.35);
  for (let i = 0; i < n; i++) {
    const px = x + (i - (n - 1) / 2) * m(1.2);
    const sh = h * k.rng.range(0.75, 1);
    if (!k.clear([px - r - 0.1, y, z - r - 0.1, px + r + 0.1, y + sh + m(0.4), z + r + 0.1])) continue;
    k.occupy([px - r, y, z - r, px + r, y + sh + m(0.3), z + r], "roofgear");
    k.box(px - r, y, z - r, 2 * r, sh, 2 * r, PAL.steel);
    k.box(px - r - 0.1, y + sh, z - r - 0.1, 2 * r + 0.2, m(0.3), 2 * r + 0.2, PAL.charcoal);
  }
}

/** A rooftop greenhouse: a pale frame of glass panes, with plants showing through. */
function greenhouse(k: Kit, x: number, y: number, z: number, w: number, d: number) {
  const h = m(2.5);
  if (!k.clear([x, y, z, x + w, y + h + m(0.2), z + d])) return;
  k.occupy([x, y, z, x + w, y + h + m(0.2), z + d], "roofgear");
  k.box(x, y, z, w, m(0.2), d, PAL.charcoal);
  k.box(x + PROUD, y + m(0.2), z + PROUD, w - 2 * PROUD, h - m(0.2), d - 2 * PROUD, PAL.leafDark);
  for (const s of sides(x, z, w, d)) for (let a = 0; a + m(0.15) <= s.length; a += m(1.2)) sideBox(k, s, a, y + m(0.2), 0, m(0.15), h - m(0.2), m(0.1), PAL.pale);
  k.box(x - m(0.1), y + h, z - m(0.1), w + m(0.2), m(0.2), d + m(0.2), PAL.pale);
}

/** A double helix of light up a wall: two strands crossing as they turn, rungs between. */
function helix(k: Kit, s: Side, y0: number, y1: number, color: Hex) {
  const amp = s.length * 0.3;
  const mid = s.length / 2;
  const turn = m(9);
  for (let y = y0; y < y1; y += m(0.5)) {
    const p = ((y - y0) / turn) * Math.PI * 2;
    const a1 = mid + Math.sin(p) * amp;
    const a2 = mid - Math.sin(p) * amp;
    sideBox(k, s, a1 - m(0.25), y, PROUD, m(0.5), m(0.5), 0.15, color, true, (0.6 + 0.35 * Math.cos(p)) * k.neon);
    sideBox(k, s, a2 - m(0.25), y, PROUD + 0.2, m(0.5), m(0.5), 0.15, PAL.white, true, (0.6 - 0.35 * Math.cos(p)) * k.neon);
    if (Math.round((y - y0) / m(0.5)) % 3 === 0 && Math.abs(a1 - a2) > m(0.75)) sideBox(k, s, Math.min(a1, a2) + m(0.25), y + m(0.2), 0.02, Math.abs(a1 - a2) - m(0.5), m(0.1), 0.1, PAL.pale, true, 0.4 * k.neon);
  }
}

/**
 * E. Landmark tower: a TV tower, after the CN Tower and Berlin's Fernsehturm. A glass entrance
 * pavilion with four stepped buttress fins at the foot of a round concrete shaft that tapers as
 * it rises, a glass lift up its south side and light strips up the others; a disc-shaped
 * observation pod (a stepped underside, a lit glass observation floor, an open deck with a rail,
 * a restaurant floor, a stepped roof); a smaller sky pod above; and an antenna mast banded red and
 * white with red beacons. The silhouette is what makes it a landmark: nothing else in the city
 * has it.
 */
export function landmarkTower(k: Kit, c: BuildingConfig) {
  const W = m(c.width);
  const D = m(c.depth);
  const H = m(c.height);
  const fl = m(c.floorHeight);
  const cx = W / 2;
  const cz = D / 2;
  const size = Math.min(W, D);

  // 1. The entrance pavilion: two floors of lit glass, doors in the middle of the south face.
  const pw = Math.round(size * 0.72);
  const px = Math.round(cx - pw / 2);
  const pz = Math.round(cz - pw / 2);
  const ph = fl * 2;
  const lobby: Facade = {
    ...styled({ ...OFFICE, bay: m(2.5) }, c, c.secondaryColor),
    lit: 0.85,
    lights: [PAL.warm, PAL.amber, PAL.white],
    door: (side, a, len, j) => j === 0 && side === 0 && Math.abs(a + len / 2 - pw / 2) < len,
  };
  block(k, px, 0, pz, pw, ph, pw, lobby);
  roof(k, px, ph, pz, pw, pw, c.primaryColor);
  const y0 = ph + m(0.25);

  // 2. The shaft: round, tapering from r0 to r1 in 3 m rings.
  const podY = Math.round((H * 0.62) / fl) * fl;
  const r0 = size * 0.14;
  const r1 = size * 0.085;
  const ring = m(3);
  const radius = (y: number) => r0 + (r1 - r0) * Math.min(1, (y - y0) / (podY - y0));
  k.occupy([cx - r0, y0, cz - r0, cx + r0, podY, cz + r0], "mass");
  for (let y = y0; y < podY; y += ring) {
    const h = Math.min(ring, podY - y);
    const r = radius(y);
    disc(k, cx, y, cz, r, h, k.vary(c.primaryColor, 0.02));
    // The glass lift on the south side, light strips on the other three.
    k.light(cx - m(0.6), y, cz + r - m(0.1), m(1.2), h, m(0.35), PAL.cyan, 0.25 * k.neon);
    for (const dx of [r - m(0.1), -r - m(0.15)]) k.light(cx + dx, y + m(0.2), cz - m(0.12), m(0.25), h - m(0.4), m(0.25), c.accentColor, 0.8 * k.neon);
    k.light(cx - m(0.12), y + m(0.2), cz - r - m(0.15), m(0.25), h - m(0.4), m(0.25), c.accentColor, 0.8 * k.neon);
  }
  // Lift cabs: two, at seeded heights.
  for (let i = 0; i < 2; i++) {
    const ly = y0 + k.rng.range(0.1, 0.85) * (podY - y0);
    k.light(cx - m(0.45), ly, cz + radius(ly) + m(0.25), m(0.9), m(2), 0.1, PAL.white, 0.9);
  }
  // Buttress fins: stepped wedges along the four axes, leaning on the shaft's foot.
  const finH = (podY - y0) * 0.24;
  const reach = Math.min(pw / 2 - m(0.75), r0 + m(4));
  const ft = m(1.2);
  const step = m(1.6);
  for (const [ax, az] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let y = y0; y < y0 + finH; y += step) {
      const t = (y - y0) / finH;
      const len = reach - (reach - r0 * 0.6) * t;
      // Each fin starts inside the shaft wall (not at its center), so the four never meet.
      const s0 = r0 * 0.5;
      const [bx, bz, bw, bd] = ax ? [ax > 0 ? cx + s0 : cx - len, cz - ft / 2, len - s0, ft] : [cx - ft / 2, az > 0 ? cz + s0 : cz - len, ft, len - s0];
      k.box(bx, y, bz, bw, step, bd, c.secondaryColor);
      // A light on each step's outer corner traces the fin's edge.
      const ex = ax ? cx + ax * (len - m(0.3)) - (ax < 0 ? m(0.3) : 0) : cx - m(0.15);
      const ez = az ? cz + az * (len - m(0.3)) - (az < 0 ? m(0.3) : 0) : cz - m(0.15);
      k.light(ax ? ex : ex, y + step, az ? ez : ez, ax ? m(0.3) : m(0.3), 0.15, m(0.3), c.accentColor, 0.7 * k.neon);
    }
  }

  // 3. The observation pod.
  const R = Math.min(size * 0.42, r1 * 4.2);
  let y = podY;
  k.occupy([cx - R * 1.1, podY, cz - R * 1.1, cx + R * 1.1, podY + fl * 4, cz + R * 1.1], "mass");
  // The underside: rings stepping out from the shaft to the pod's edge.
  for (const share of [0.45, 0.65, 0.85]) {
    disc(k, cx, y, cz, R * share, m(1), c.secondaryColor);
    y += m(1);
  }
  // The observation floor: a dark glass drum wrapped in a lit window band.
  const obsH = Math.round(fl * 1.3);
  disc(k, cx, y, cz, R, obsH, PAL.glassBlue);
  disc(k, cx, y + m(0.4), cz, R + m(0.12), obsH - m(0.8), PAL.amber, 0.55);
  y += obsH;
  // The open deck: a slab reaching past the drum, a pale rail around it.
  disc(k, cx, y, cz, R * 1.08, m(0.3), c.primaryColor);
  y += m(0.3);
  hoop(k, cx, y, cz, R * 1.08, m(0.15), m(1.1), PAL.pale);
  // The restaurant floor, set back behind the deck, with its own window band.
  const restH = Math.round(fl * 1.1);
  disc(k, cx, y, cz, R * 0.86, restH, PAL.glassBlue);
  disc(k, cx, y + m(0.4), cz, R * 0.86 + m(0.12), restH - m(0.8), PAL.warm, 0.5);
  y += restH;
  // The roof, stepping back in to the upper shaft.
  for (const share of [0.9, 0.7, 0.5]) {
    disc(k, cx, y, cz, R * share, m(0.6), share === 0.9 ? c.secondaryColor : c.primaryColor);
    y += m(0.6);
  }

  // 4. The upper shaft, the sky pod and the antenna mast.
  const skyY = y + Math.round((H - y) * 0.28);
  const ru = r1 * 0.75;
  k.occupy([cx - ru * 2, y, cz - ru * 2, cx + ru * 2, skyY + m(1) + fl, cz + ru * 2], "mass");
  disc(k, cx, y, cz, ru, skyY - y, c.primaryColor);
  disc(k, cx, skyY, cz, ru * 2, m(0.5), c.secondaryColor);
  disc(k, cx, skyY + m(0.5), cz, ru * 1.8, fl, PAL.glassBlue);
  disc(k, cx, skyY + m(0.8), cz, ru * 1.8 + m(0.12), fl - m(0.6), PAL.cyan, 0.45);
  disc(k, cx, skyY + m(0.5) + fl, cz, ru * 2, m(0.5), c.secondaryColor);
  let my = skyY + m(1) + fl;
  const mastH = Math.max(m(8), H - my);
  k.occupy([cx - m(0.8), my, cz - m(0.8), cx + m(0.8), my + mastH + m(0.6), cz + m(0.8)], "roofgear");
  // Three sections, each thinner, the top one banded red and white, a red beacon on each.
  const sections = [
    [0.45, m(1.6)],
    [0.3, m(1)],
    [0.25, m(0.5)],
  ];
  sections.forEach(([share, w], i) => {
    const sh = mastH * share;
    if (i < 2) k.box(cx - w / 2, my, cz - w / 2, w, sh, w, PAL.steel);
    else for (let b = 0; b * m(1.5) < sh; b++) k.box(cx - w / 2, my + b * m(1.5), cz - w / 2, w, Math.min(m(1.5), sh - b * m(1.5)), w, b % 2 ? 0xa8423a : PAL.pale);
    my += sh;
    k.light(cx - w / 2 - 0.25, my - m(0.4), cz - w / 2 - 0.25, w + 0.5, m(0.3), w + 0.5, PAL.red, 0.9);
  });
  k.light(cx - m(0.3), my, cz - m(0.3), m(0.6), m(0.6), m(0.6), PAL.red);
}

/**
 * A solid round slab or drum, rasterized into rows along z (rows never overlap, so no faces
 * share a plane). Lit if `glow` is given (its strength).
 */
function disc(k: Kit, x: number, y: number, z: number, r: number, h: number, color: Hex | RGB, glow?: number) {
  const rows = Math.max(4, Math.round(r / 1.5) * 2);
  const step = (2 * r) / rows;
  for (let i = 0; i < rows; i++) {
    const zc = -r + (i + 0.5) * step;
    const half = Math.sqrt(Math.max(0, r * r - zc * zc));
    if (glow !== undefined) k.light(x - half, y, z - r + i * step, 2 * half, h, step, color as Hex, glow * k.neon);
    else k.box(x - half, y, z - r + i * step, 2 * half, h, step, color);
  }
}

/** A round railing: a thin hoop of wall `t` thick and `h` tall around (x, z). */
function hoop(k: Kit, x: number, y: number, z: number, r: number, t: number, h: number, color: Hex) {
  const rows = Math.max(4, Math.round(r / 1.5) * 2);
  const step = (2 * r) / rows;
  const ri = r - t;
  for (let i = 0; i < rows; i++) {
    const zc = -r + (i + 0.5) * step;
    const zr = z - r + i * step;
    const xo = Math.sqrt(Math.max(0, r * r - zc * zc));
    if (Math.abs(zc) < ri) {
      const xi = Math.sqrt(ri * ri - zc * zc);
      if (xo - xi > 0.05) {
        k.box(x - xo, y, zr, xo - xi, h, step, color);
        k.box(x + xi, y, zr, xo - xi, h, step, color);
      }
    } else k.box(x - xo, y, zr, 2 * xo, h, step, color);
  }
}
