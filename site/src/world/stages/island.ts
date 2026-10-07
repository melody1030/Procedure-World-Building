import { clamp01, fbm, smoothstep } from "../noise";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import { FIELD_RES } from "../scale";

/**
 * Stage 01, island shape. Produces a mask over the land square: 1 well inland, 0 open sea.
 *
 * - Radial falloff gives a single island that never touches the diorama's edge.
 * - The coast radius varies with angle (noise sampled around a circle, so there is no seam).
 * - Domain warp bends the whole shape so the coast is irregular, not a wobbly circle.
 * - A random stretch and rotation stop every island from being round.
 * - One bay is always cut into the coast, and a plateau site is picked on the far side of the
 *   island from it: the concept needs a harbour and high ground on every seed.
 *
 * Coordinates: u, v run from −1 to 1 across the land square.
 */

export interface Feature {
  u: number;
  v: number;
  r: number;
}

export interface IslandData {
  /** (FIELD_RES + 1)² nodes, row-major by v then u. */
  mask: Float32Array;
  bay: Feature;
  plateau: Feature;
}

export const FIELD_NODES = FIELD_RES + 1;
export const nodeCoord = (i: number) => -1 + (2 * i) / FIELD_RES;

export function buildIsland(rng: Rng, params: WorldParams["island"]): IslandData {
  const seedWarp = rng.int(0, 1e6);
  const seedCoast = rng.int(0, 1e6);
  const stretch = rng.range(0.9, 1.12);
  const rotation = rng.range(0, Math.PI);
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  const coastRadius = (angle: number) => params.size * (0.8 + 0.2 * fbm(Math.cos(angle) * 1.6 + 5, Math.sin(angle) * 1.6 + 5, seedCoast, 3));

  const bayAngle = rng.range(0, Math.PI * 2);
  const bayR = rng.range(0.3, 0.38) * Math.max(0.01, params.bay);
  const bayDist = coastRadius(bayAngle) * 0.72;
  const bay: Feature = { u: Math.cos(bayAngle) * bayDist, v: Math.sin(bayAngle) * bayDist, r: bayR };

  const plateauAngle = bayAngle + Math.PI + rng.range(-0.8, 0.8);
  const plateauDist = rng.range(0.12, 0.35);
  const plateau: Feature = { u: Math.cos(plateauAngle) * plateauDist, v: Math.sin(plateauAngle) * plateauDist, r: rng.range(0.32, 0.46) };

  const mask = new Float32Array(FIELD_NODES * FIELD_NODES);
  for (let j = 0; j < FIELD_NODES; j++) {
    for (let i = 0; i < FIELD_NODES; i++) {
      const u = nodeCoord(i);
      const v = nodeCoord(j);
      // Domain warp: offset the lookup point by two more noise fields.
      const wu = u + params.warp * fbm(u * 1.6 + 11.3, v * 1.6 - 4.1, seedWarp, 4);
      const wv = v + params.warp * fbm(u * 1.6 - 7.7, v * 1.6 + 2.9, seedWarp + 7, 4);
      // Rotate, then squash one axis, so the island is elongated in a random direction.
      const ru = (wu * cosR - wv * sinR) * stretch;
      const rv = (wu * sinR + wv * cosR) / stretch;
      const r = Math.hypot(ru, rv);
      const coast = coastRadius(Math.atan2(wv, wu));
      let m = 1 - smoothstep(coast - 0.3, coast + 0.04, r);

      const dBay = Math.hypot(u - bay.u, v - bay.v) / bay.r;
      if (params.bay > 0) m -= 1.4 * Math.exp(-dBay * dBay * 1.2);
      // Whatever the warp and stretch did, fade to sea before the land square's edge. A rounded
      // square (4-norm) rather than a square, so an island that reaches it gets no straight sides.
      const edge = Math.pow(u ** 4 + v ** 4, 0.25);
      m *= 1 - smoothstep(0.86, 0.99, edge);
      mask[j * FIELD_NODES + i] = clamp01(m);
    }
  }
  return { mask, bay, plateau };
}
