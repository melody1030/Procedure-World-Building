/**
 * The one place every size in the world comes from. The world is measured in voxels:
 * 1 world unit = 1 voxel = 0.5 m. Nothing else in the code should invent its own sizes.
 */

/** Metres per voxel. */
export const VOXEL_M = 0.5;

/** One building storey (3 m). Terrace steps are one storey tall too. */
export const STOREY = 6;
/** A standing person (1.75 m), used as the scale reference. */
export const PERSON = 3.5;

/** Voxels per side of one chunk (the unit of meshing and of the chunk grid overlay). */
export const CHUNK = 32;
/** Land area: a square of CHUNKS × CHUNKS chunks (384 voxels ≈ 192 m across). */
export const CHUNKS = 12;
export const WORLD_SIZE = CHUNK * CHUNKS;

/** Water surface height. */
export const SEA_LEVEL = 0;

/** Sea depth at the diorama's edge; the seabed is the plinth's top. */
export const WATER_DEPTH = 8;
export const SEABED = SEA_LEVEL - WATER_DEPTH;

/**
 * Terraces: the lowest level (beaches, docks) sits 1 m above the water; each level above it is
 * one storey higher. Every seed picks a level count in [MIN_TERRACES, MAX_TERRACES].
 */
export const SHORE_TOP = SEA_LEVEL + 2;
export const MIN_TERRACES = 4;
export const MAX_TERRACES = 7;
export const terraceTop = (level: number) => SHORE_TOP + level * STOREY;

/** The coarse grid that island shape, elevation and erosion run on (cells across the land). */
export const FIELD_RES = 128;

/** The diorama's base: open water around the land, and how deep the cut-away plinth goes. */
export const WATER_MARGIN = 40;
export const PLINTH_DEPTH = 40;

/**
 * Height budget for the finished city: share of buildings per band, and storeys in each band.
 * Landmarks are also capped in number (MAX_LANDMARKS) and only stand in the core.
 */
export const HEIGHT_BUDGET = [
  { band: "low", storeys: [1, 3], share: 0.6 },
  { band: "medium", storeys: [4, 8], share: 0.25 },
  { band: "tall", storeys: [9, 15], share: 0.1 },
  { band: "landmark", storeys: [16, 26], share: 0.05 },
] as const;
export type HeightBand = (typeof HEIGHT_BUDGET)[number]["band"];
export const MAX_LANDMARKS = 3;

/** Voxels → metres, for labels. */
export const toMetres = (voxels: number) => voxels * VOXEL_M;
