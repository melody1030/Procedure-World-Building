import { distanceTo } from "./distance";
import type { River } from "./river";

/**
 * The claim map: one byte per column saying what owns it. Stages write it in pipeline order, and
 * a later stage only uses columns that are still free (or that it may share). Beside it are
 * distance fields, so a rule like "at least 2 m from the river" is one lookup.
 *
 * This stage (after the river) claims the channel and the bank, one column either side of it (the
 * same columns the Bank surface uses), and measures every column's distance to the channel.
 * Roads, verges, plazas and lots are claimed by the stages that make them.
 */

export const CLAIM = { free: 0, river: 1, bank: 2, road: 3, verge: 4, plaza: 5, lot: 6 } as const;
export type Claim = (typeof CLAIM)[keyof typeof CLAIM];

/** Debug colors for Show claims, indexed by claim. Free ground is left untinted. */
export const CLAIM_COLORS: Record<Exclude<keyof typeof CLAIM, "free">, number> = {
  river: 0x2f7dff,
  bank: 0x22d3ee,
  road: 0xf59e0b,
  verge: 0xfde047,
  plaza: 0xe879f9,
  lot: 0xfb7185,
};

export interface Claims {
  /** Columns per side. Row-major by z, then x. */
  n: number;
  /** What owns each column (a CLAIM value). */
  claim: Uint8Array<ArrayBuffer>;
  /** Distance to the nearest channel column, in columns: 0 in the channel, Infinity without a river. */
  riverDist: Float32Array;
}

export function buildClaims(n: number, river: River): Claims {
  const claim = new Uint8Array(n * n);
  const channel = river.channel ?? new Uint8Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (channel[k]) claim[k] = CLAIM.river;
      else if ((x > 0 && channel[k - 1]) || (x < n - 1 && channel[k + 1]) || (z > 0 && channel[k - n]) || (z < n - 1 && channel[k + n])) claim[k] = CLAIM.bank;
    }
  }
  return { n, claim, riverDist: distanceTo(channel, n) };
}
