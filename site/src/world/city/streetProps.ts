import { PAL } from "../buildings/kit";
import { hash2 } from "../rng";
import { voxels } from "../scale";
import { CLAIM } from "../terrain/claims";
import { DISTRICT, type Districts } from "../terrain/districts";
import type { Streets } from "../terrain/streets";
import type { Parks, ParkProp } from "./parks";

/**
 * The street lamps (pure: no three.js; docs/plans/street-furniture-plan.md). Few on purpose: the
 * streets are lit, not crowded.
 *
 * Each street is walked with a slot every SLOT along it (the first a quarter SLOT in), each on the
 * other side from the one before, so on either side of a street a lamp stands every 2 × SLOT. A
 * lamp stands on the verge, INSET in from the road's edge, so the rest of the verge stays clear to
 * walk on. A slot is left empty where:
 * - its column is not verge (a park or a lot cuts the verge there);
 * - it is within CROSSING of a junction or the plaza (the crossings stay open);
 * - it is within DOORWAY of a lot's front middle (where its building's door is) or a park's way in;
 * - the street steps there (STEEP).
 *
 * The plaza gets a lamp at each corner of its paving. A lamp's glow follows the district behind
 * it: amber in the homes, cyan in the core and the shops, warm white in industry.
 *
 * Every lamp's `delay` (0–1) is its distance from the plaza over half the world: they grow out of
 * the ground outward from it, with the parks' props.
 */

/** A slot every SLOT columns along a street (24 m). */
const SLOT = voxels(24);
/** How far (columns) in from the road's edge a lamp stands. */
const INSET = 2;
/** Kept clear round junctions and the plaza, round a lot's front middle, and round a park's way in (columns). */
const CROSSING = voxels(3);
const DOORWAY = voxels(2);
const WAY_IN = voxels(1.5);
/** A rise over this many voxels within ±STEEP_SPAN samples is a stepped stretch: no prop. */
const STEEP = 1;
const STEEP_SPAN = 4;
/** The plaza's corner lamps stand this far (columns) in from its corners. */
const PLAZA_CORNER = voxels(1);

/** The lamps' glow by district (core, commercial, megablock, industrial, wealthy). */
const LAMP_GLOW = [PAL.cyan, PAL.cyan, PAL.amber, PAL.warm, PAL.amber];

export function planStreetProps(districts: Districts, streets: Streets, parks: Parks, seed: number): ParkProp[] {
  const { n } = parks.ground;
  const ground = parks.ground.height;
  const claim = districts.claims.claim;
  const plaza = streets.plazas[0];
  const props: ParkProp[] = [];
  const delay = (x: number, z: number) => (plaza ? Math.min(1, Math.hypot(x - plaza.x, z - plaza.z) / (n * 0.5)) : 0);
  const at = (x: number, z: number) => Math.min(n - 1, Math.max(0, z | 0)) * n + Math.min(n - 1, Math.max(0, x | 0));

  // Where to keep clear: the lots' front middles (their doors) and the parks' ways in.
  const doors = districts.lots.map((l) => ({ x: (l.corners[0].x + l.corners[1].x) / 2, z: (l.corners[0].z + l.corners[1].z) / 2 }));
  const waysIn: { x: number; z: number }[] = [];
  for (let k = 0; k < n * n; k++) {
    if (!parks.path[k]) continue;
    const x = k % n;
    const z = (k / n) | 0;
    if ([k - 1, k + 1, k - n, k + n].some((j) => claim[j] === CLAIM.verge)) waysIn.push({ x: x + 0.5, z: z + 0.5 });
  }
  const near = (list: { x: number; z: number }[], x: number, z: number, r: number) => list.some((q) => Math.abs(q.x - x) <= r && Math.abs(q.z - z) <= r && Math.hypot(q.x - x, q.z - z) <= r);
  const nearPlaza = (x: number, z: number) => !!plaza && Math.max(Math.abs(x - plaza.x), Math.abs(z - plaza.z)) <= plaza.half + CROSSING;

  // The district behind a verge spot: the lot a little farther out, if there is one.
  const districtBehind = (x: number, z: number, nx: number, nz: number): number | null => {
    for (let d = 2; d <= 10; d += 2) {
      const id = districts.lotId[at(x + nx * d, z + nz * d)];
      if (id) return districts.lots[id - 1].district;
    }
    return null;
  };

  streets.streets.forEach((st, si) => {
    const c = st.curve;
    if (c.length < 3) return;
    // Arc length along the curve, to find the slots.
    const cum = new Float32Array(c.length);
    for (let i = 1; i < c.length; i++) cum[i] = cum[i - 1] + Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z);
    let i = 0;
    let slot = 0;
    for (let s = SLOT / 4; s < cum[c.length - 1]; s += SLOT, slot++) {
      while (i < c.length - 2 && cum[i + 1] < s) i++;
      const a = c[i];
      const b = c[i + 1];
      const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1);
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const dl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      // Each slot on the other side from the last.
      const side = slot % 2 ? 1 : -1;
      const nx = (-(b.z - a.z) / dl) * side;
      const nz = ((b.x - a.x) / dl) * side;
      const off = st.width / 2 + INSET;
      const x = px + nx * off;
      const z = pz + nz * off;
      const k = at(x, z);
      if (claim[k] !== CLAIM.verge) continue;
      if (streets.junctions.some((j) => Math.hypot(j.x - px, j.z - pz) <= CROSSING + st.width) || nearPlaza(px, pz)) continue;
      if (near(doors, x, z, DOORWAY) || near(waysIn, x, z, WAY_IN)) continue;
      const i0 = Math.max(0, i - STEEP_SPAN);
      const i1 = Math.min(c.length - 1, i + STEEP_SPAN);
      if (Math.abs(st.level[i1] - st.level[i0]) > STEEP) continue;
      const district = districtBehind(x, z, nx, nz);
      props.push({
        kind: "streetlamp",
        x,
        z,
        y: ground[k],
        // Its arm reaches out over the road.
        rotation: Math.atan2(-nx, -nz),
        size: 0,
        seed: Math.floor(hash2(slot, si, seed ^ 0x51ee7) * 0x7fffffff),
        delay: delay(x, z),
        color: LAMP_GLOW[district ?? DISTRICT.megablock],
      });
    }
  });

  // The plaza's corners.
  if (plaza) {
    const r = plaza.half - PLAZA_CORNER;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = plaza.x + sx * r;
      const z = plaza.z + sz * r;
      const k = at(x, z);
      if (claim[k] !== CLAIM.plaza) continue;
      props.push({ kind: "streetlamp", x, z, y: ground[k], rotation: Math.atan2(-sx, -sz), size: 0, seed: Math.floor(hash2(sx, sz, seed) * 0x7fffffff), delay: 0, color: PAL.cyan });
    }
  }
  return props;
}
