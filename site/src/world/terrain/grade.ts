import { CLAIM } from "./claims";
import type { Districts } from "./districts";
import type { Columns } from "./voxelize";

/** How far past its lot a lot's dig reaches, in columns: a building's edge can stand a fraction of a column outside the lot's raster. */
const MARGIN = 1;

export interface Grading {
  /** The graded ground. */
  ground: Columns;
  /** Per column, the lot (from 1) whose site it is: the lot's own columns, and the margin its dig lowered; 0 elsewhere. */
  dugBy: Int32Array;
}

/**
 * Site grading: every lot is cut and filled level to its floor (the median of its ground: as much
 * cut as fill), the floor its building stands on, and a MARGIN of ground around it (not streets,
 * sidewalks, the plaza or the river) is cut down to it, so no ground pokes into a building or
 * flickers against its floor. On a slope this leaves a low bank on the uphill side and a low
 * retaining wall on the downhill side, half as high as digging down to the lot's lowest ground
 * left. Null when there are no lots.
 */
export function gradeLots(cols: Columns, districts: Districts): Grading | null {
  const { lots, lotId, claims } = districts;
  if (!lots.length) return null;
  const { n } = cols;
  const height = cols.height.slice();
  const dugBy = new Int32Array(n * n);
  const keep = (k: number) => {
    const c = claims.claim[k];
    return c === CLAIM.road || c === CLAIM.verge || c === CLAIM.plaza || c === CLAIM.river || c === CLAIM.bank;
  };
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const id = lotId[z * n + x];
      if (id === 0) continue;
      const floor = lots[id - 1].floor;
      for (let dz = -MARGIN; dz <= MARGIN; dz++) {
        for (let dx = -MARGIN; dx <= MARGIN; dx++) {
          const X = x + dx;
          const Z = z + dz;
          if (X < 0 || Z < 0 || X >= n || Z >= n) continue;
          const k = Z * n + X;
          if ((dx || dz) && (lotId[k] !== 0 || keep(k))) continue;
          if (!dx && !dz) {
            dugBy[k] = id;
            // Filled up to the floor.
            height[k] = Math.max(height[k], floor);
          }
          if (height[k] > floor) {
            height[k] = floor;
            dugBy[k] = id;
          }
        }
      }
    }
  }
  let min = Infinity;
  for (let k = 0; k < height.length; k++) if (height[k] < min) min = height[k];
  return { ground: { ...cols, height, min }, dugBy };
}
