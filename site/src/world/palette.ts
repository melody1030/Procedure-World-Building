/**
 * World colours, from the mood board: a near-black navy base, cold muted terrain, and neon that
 * belongs to the city (cyan first, magenta and amber as secondaries). Values are sRGB hex.
 */

export const SKY = {
  background: 0x0a0f17,
  fog: 0x0d1626,
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
  riverbed: 0x2e4a52,
  bank: 0x7a808a,
  water: 0x1f6380,
  foamLow: 0x7fc4d8,
  foamHigh: 0xe0f6ff,
};

/** Terraces overlay: Week 2's terrain ramp, low to high. */
export const LEVEL_RAMP = [0x155e75, 0x06b6d4, 0x67e8f9, 0xf0fdff];
export const LEVEL_SIDE = 0x243049;

export const NEON = {
  cyan: 0x22d3ee,
  magenta: 0xf0abfc,
  amber: 0xfbbf24,
  window: 0xffd89a,
};

/** Glowing colours for signs and strips. Cyan is always the main neon; each seed adds two of the rest. */
export const SIGN_NEON = {
  cyan: 0x3ee8ff,
  secondary: [0xff4fd8, 0xffb340, 0x9d7bff, 0xff5a6e, 0x5dffb0],
};

/** Window light: warm homes, cooler offices, amber industry. */
export const WINDOW = {
  warm: [0xffd08a, 0xffbe73, 0xffe2a8, 0xffa860],
  cool: [0xd8f4ff, 0xa8e6ff, 0xf2f6ff, 0xbfd8ff],
  dark: 0x161c27,
};

export const CITY = {
  asphalt: 0x23262e,
  sidewalk: 0x4b505a,
  plaza: 0x5d5866,
  plazaAlt: 0x524e5a,
  embankment: 0x4a4e57,
  marking: 0xb8a25a,
  walls: {
    core: [0x2a3140, 0x1f2733, 0x333a48, 0x262c38],
    residential: [0x4a4f5c, 0x5a5048, 0x3f4a55, 0x6b5a50, 0x4d5560, 0x5c4f58],
    industrial: [0x6a4a3a, 0x5a4a40, 0x4f5254, 0x5e5143],
    waterfront: [0x3d4a55, 0x55606a, 0x4a5058],
    green: [0x5a5a52, 0x625a50],
  },
  /** Stacked housing added late: prefab, rust and patched panels. */
  extension: [0x7a4e3a, 0x5d6b6e, 0x6e5a3e, 0x4f5f58],
  roof: 0x2a2f38,
  metal: 0x5f6670,
  rust: 0x7a4a30,
  glass: 0x1a2533,
  concrete: 0x5a5e66,
  container: [0x8a3a2e, 0x2e6a6e, 0xb06a2a, 0x4a5a6a, 0x6a2e4a],
  tree: [0x2f4f3f, 0x355944, 0x2a4636, 0x3b5a40],
  trunk: 0x3a2e28,
  blossom: 0xff8fd0,
  petal: 0xc9709f,
  lamp: 0xffc070,
  skin: 0xd9a37a,
  clothes: [0x2b3a55, 0x553040, 0x2f4a3a, 0x4a4a4a, 0x6a5030],
};

export const REFERENCE = {
  skin: 0xd9a37a,
  shirt: 0x3b82f6,
  trousers: 0x1e293b,
};
