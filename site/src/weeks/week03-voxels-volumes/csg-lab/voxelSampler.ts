import type { Bounds } from "./nodeBounds";
import type { Vec3 } from "./types";

export interface VoxelCell {
  center: Vec3;
}

/** Fixed internal grid resolution per axis — deliberately not exposed as a UI control; "01 —
 *  Voxels (Resolution)" already owns that concept. */
export const CSG_VOXEL_RESOLUTION = 22;
/** (resolution + 2)^3, the one-cell padding included on every side (see the loop below). */
export const CSG_VOXEL_MAX_INSTANCES = (CSG_VOXEL_RESOLUTION + 2) ** 3;

const MIN_SPAN = 0.5;

/**
 * Samples `isInside` over a grid covering `bounds`, one cell of padding wider on every side so
 * a shape's surface isn't clipped exactly at the bound edge. Returns only the cells that are
 * actually inside — most calls are sparse relative to the full grid.
 */
export function sampleVoxels(bounds: Bounds, isInside: (p: Vec3) => boolean, resolution = CSG_VOXEL_RESOLUTION): { cells: VoxelCell[]; cellSize: Vec3 } {
  const spanX = Math.max(bounds.max.x - bounds.min.x, MIN_SPAN);
  const spanY = Math.max(bounds.max.y - bounds.min.y, MIN_SPAN);
  const spanZ = Math.max(bounds.max.z - bounds.min.z, MIN_SPAN);
  const cellSize: Vec3 = { x: spanX / resolution, y: spanY / resolution, z: spanZ / resolution };

  const cells: VoxelCell[] = [];
  for (let ix = -1; ix <= resolution; ix++) {
    const x = bounds.min.x + (ix + 0.5) * cellSize.x;
    for (let iy = -1; iy <= resolution; iy++) {
      const y = bounds.min.y + (iy + 0.5) * cellSize.y;
      for (let iz = -1; iz <= resolution; iz++) {
        const z = bounds.min.z + (iz + 0.5) * cellSize.z;
        const p = { x, y, z };
        if (isInside(p)) cells.push({ center: p });
      }
    }
  }
  return { cells, cellSize };
}
