/**
 * World colours, from the mood board: a near-black navy base and cold, muted terrain. Values are
 * sRGB hex.
 */

export const SKY = {
  background: 0x0a0f17,
  hemisphereSky: 0x3a4f7a,
  hemisphereGround: 0x0a0f17,
  moon: 0x9fb4d9,
};

export const WATER = {
  deep: 0x0a1726,
  surface: 0x163a5c,
};

/** Cut-away plinth sides: alternating strata so the diorama's cross-section reads as layers. */
export const PLINTH = {
  top: 0x243049,
  strata: [0x1e2638, 0x1a2131, 0x202a3d, 0x171d2b],
  rim: 0x22d3ee,
};

/** Natural terrain stays cold and muted so the city, later, is what glows. */
export const TERRAIN = {
  grassLow: 0x46685a,
  grassHigh: 0x6a8a78,
  sand: 0x8a8272,
  sandSide: 0x625c50,
  cliffTop: 0x7c828e,
  cliffBottom: 0x464b57,
  seabedShallow: 0x3a5566,
  seabedDeep: 0x1c2a38,
  rock: 0x6d7280,
};

/** Terraces overlay: Week 2's terrain ramp, low to high. */
export const LEVEL_RAMP = [0x155e75, 0x06b6d4, 0x67e8f9, 0xf0fdff];
