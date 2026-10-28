import { CLAIM } from "./claims";
import type { Districts } from "./districts";
import type { Grading } from "./grade";
import type { Parks } from "../city/parks";
import type { Columns } from "./voxelize";
import { SURFACE, TILES, type Surfaces } from "./surfaces";

/**
 * The city's paint: once the districts and lots are known, what the city laid on its concrete
 * (see surfaces.ts) is painted in. In this order (first match wins):
 *
 *   (kept)     riverbed, road and curb
 *   plaza      dark stone slabs
 *   concrete   the river's bank: a quay
 *   sidewalk   the verge between a street and its lots
 *   concrete   a lot, and the margin its grading dug: the building's pad, of the same concrete
 *   path       a park's paths (see city/parks.ts): pale stone setts
 *   lawn       the rest of a park
 *   (kept)     the rest: concrete, ledges and stairs
 *
 * Slabbed kinds (TILES) are laid in a grid of square tiles, alternate tiles darker and lighter;
 * where the ground steps, the mesh draws concrete retaining walls (all but lawn and riverbed).
 */
export function paintCity(surfaces: Surfaces, districts: Districts, grading: Grading | null, parks: Parks | null, cols: Columns): Surfaces {
  const n = cols.n;
  const kind = surfaces.kind.slice();
  const tone = surfaces.tone.slice();
  const { claim } = districts.claims;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const s = kind[k];
      if (s === SURFACE.riverbed || s === SURFACE.road || s === SURFACE.curb) continue;
      const c = claim[k];
      let paint: number;
      if (s === SURFACE.plaza) paint = SURFACE.plaza;
      else if (s === SURFACE.bank) paint = SURFACE.concrete;
      else if (c === CLAIM.verge) paint = SURFACE.sidewalk;
      else if (c === CLAIM.lot || grading?.dugBy[k]) paint = SURFACE.concrete;
      else if (c === CLAIM.park) paint = parks?.path[k] ? SURFACE.path : SURFACE.lawn;
      else continue;
      kind[k] = paint;
      const tile = TILES.get(paint);
      if (tile) tone[k] = (Math.floor(x / tile) + Math.floor(z / tile)) % 2 ? 2 : 0;
    }
  }
  return { kind, tone };
}
