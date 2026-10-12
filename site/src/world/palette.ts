/**
 * World colors: cold, muted ground on a navy plinth. Values are sRGB hex.
 */

/**
 * Daytime light: a pale blue sky, a warm white sun high in the south-west, and a soft sky fill.
 * (The night version, from the mood board, had a near-black sky and a dim blue moon.)
 */
export const SKY = {
  background: 0xb9d3e8,
  hemisphereSky: 0xe4f0ff,
  hemisphereGround: 0x6b7466,
  hemisphereIntensity: 1.4,
  sun: 0xfff2dc,
  sunIntensity: 2.6,
  /** Sun direction: compass bearing and height above the horizon, in degrees. */
  sunAzimuth: -40,
  sunElevation: 52,
  exposure: 1,
};

/** River water: its surface color, and a paler one where it drops (falls). */
export const WATER = {
  river: 0x1f5f7a,
  fall: 0x6fb2c8,
};

/** Cut-away plinth sides: alternating strata so the diorama's cross-section reads as layers. */
export const PLINTH = {
  top: 0x243049,
  strata: [0x1e2638, 0x1a2131, 0x202a3d, 0x171d2b],
  rim: 0x22d3ee,
};

/**
 * Terrain, cold and muted so the city, later, is what glows. One color per ground surface; grass
 * runs from `grassLow` on the lowest ground to `grassHigh` at the highest ground, and cliff sides from
 * `cliffBottom` to `cliffTop`.
 */
export const TERRAIN = {
  grassLow: 0x46685a,
  grassHigh: 0x6a8a78,
  dirt: 0x5e5a4e,
  rock: 0x6d7280,
  cliffTop: 0x7c828e,
  cliffBottom: 0x3e434e,
  riverbed: 0x2e4a52,
  bank: 0x7a808a,
  road: 0x3c4049,
  curb: 0x8b9099,
  plaza: 0x77736d,
};

/** The blueprint cyan (the site's accent): the layer being printed glows in it. */
export const BLUEPRINT = {
  cyan: 0x22d3ee,
};
