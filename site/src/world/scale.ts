/**
 * The one place every size in the world comes from. The world is measured in voxels:
 * 1 world unit = 1 voxel = 0.25 m. Nothing else in the code should invent its own sizes; lengths
 * people tune are given in meters and converted with `voxels()`.
 */

/** Meters per voxel. */
export const VOXEL_M = 0.25;

/** Meters → voxels (not rounded). */
export const voxels = (meters: number) => meters / VOXEL_M;
/** Voxels → meters, for labels. */
export const toMeters = (v: number) => v * VOXEL_M;

/** Voxels per side of one chunk (the unit the land is divided into, and meshed in). */
export const CHUNK = 32;
/** The terrain: a square of CHUNKS × CHUNKS chunks (928 voxels = 232 m across) filling the whole plinth. */
export const CHUNKS = 29;
export const WORLD_SIZE = CHUNK * CHUNKS;

/** Height 0: the plinth's top, the bottom of every column. */
export const BASE = 0;

/** How deep the cut-away plinth under the terrain goes (20 m). */
export const PLINTH_DEPTH = voxels(20);
