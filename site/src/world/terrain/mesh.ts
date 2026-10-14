import { GeometryBuilder, lin, mix, shade, type GeometryData, type RGB } from "../geometry";
import { TERRAIN, WATER } from "../palette";
import { BASE, CHUNK } from "../scale";
import { SURFACE, type Surfaces } from "./surfaces";
import { NO_WATER, type Columns } from "./voxelize";

/**
 * Stage 8, mesh: greedy meshing of the voxel columns, chunk by chunk, for the ground and for the
 * river water.
 *
 * - Top faces: neighboring columns with the same height, surface and tone are merged into one
 *   rectangle (grow along x as far as possible, then along z while the whole row matches).
 * - Side faces: a column shows a side wherever its neighbor's surface is lower; along a line,
 *   runs with the same top, bottom and kind of side are merged into one quad.
 * - Merging never crosses a chunk border, so each chunk could be rebuilt on its own.
 *
 * Ground color comes from the surface (Stage 7) and its tone. Sides are cliff rock, from dark at
 * the bottom to lighter at the top (the shader adds strata bands). Water is one color on top and a paler one on its sides, so falls show.
 */

export interface TerrainMesh {
  geometry: GeometryData;
  /** River water, or null when there is none. */
  water: GeometryData | null;
  /** Visible ground voxel faces before merging, and quads after. */
  voxelFaces: number;
  quads: number;
}

const C = {
  grassLow: lin(TERRAIN.grassLow),
  grassHigh: lin(TERRAIN.grassHigh),
  dirt: lin(TERRAIN.dirt),
  rock: lin(TERRAIN.rock),
  cliffTop: lin(TERRAIN.cliffTop),
  cliffBottom: lin(TERRAIN.cliffBottom),
  riverbed: lin(TERRAIN.riverbed),
  bank: lin(TERRAIN.bank),
  road: lin(TERRAIN.road),
  curb: lin(TERRAIN.curb),
  plaza: lin(TERRAIN.plaza),
};
const WATER_TOP = lin(WATER.river);
const WATER_SIDE = lin(WATER.fall);
/** Darkening for the water's cut face at the diorama's edge, like the ground's sides. */
const SIDE = 0.68;

/** Top color of a column: its surface, shaded by its tone. */
function topColor(kind: number, tone: number, y: number, top: number, spread: number): RGB {
  const t = 1 + (tone - 1) * spread;
  switch (kind) {
    case SURFACE.riverbed:
      return C.riverbed;
    case SURFACE.bank:
      return shade(C.bank, t);
    case SURFACE.rock:
      return shade(C.rock, t);
    case SURFACE.dirt:
      return shade(C.dirt, t);
    case SURFACE.road:
      return C.road;
    case SURFACE.curb:
      return C.curb;
    case SURFACE.plaza:
      return C.plaza;
    default:
      return shade(mix(C.grassLow, C.grassHigh, Math.min(1, Math.max(0, y / top))), t);
  }
}

/** Side colors (bottom, top) for a run of cliff from `low` to `high`. */
function sideColor(low: number, high: number, top: number): [RGB, RGB] {
  const cliff = (y: number) => mix(C.cliffBottom, C.cliffTop, Math.min(1, Math.max(0, (y - BASE) / (top - BASE))));
  return [cliff(low), cliff(high)];
}

const N4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Greedy top faces. `top(k)` is the surface height of column k, or NO_WATER to skip it; columns
 * merge only when `key(k)` matches too. `color(k, y)` colors a merged face from its first
 * column. Returns the number of quads; adds the merged faces' column count to `faces.count`.
 */
function greedyTops(
  n: number,
  top: (k: number) => number,
  key: (k: number) => number,
  b: GeometryBuilder,
  color: (k: number, y: number) => RGB,
  faces: { count: number },
): number {
  const half = n / 2;
  const done = new Uint8Array(n * n);
  let quads = 0;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (done[k]) continue;
      const h = top(k);
      if (h === NO_WATER) continue;
      const id = key(k);
      const chunkX = Math.min(n, (Math.floor(x / CHUNK) + 1) * CHUNK);
      const chunkZ = Math.min(n, (Math.floor(z / CHUNK) + 1) * CHUNK);
      let w = 1;
      while (x + w < chunkX && !done[k + w] && top(k + w) === h && key(k + w) === id) w++;
      let d = 1;
      grow: while (z + d < chunkZ) {
        for (let i = 0; i < w; i++) {
          const kk = (z + d) * n + x + i;
          if (done[kk] || top(kk) !== h || key(kk) !== id) break grow;
        }
        d++;
      }
      for (let j = 0; j < d; j++) done.fill(1, (z + j) * n + x, (z + j) * n + x + w);
      const x0 = x - half;
      const z0 = z - half;
      b.quad([x0, h, z0 + d, x0 + w, h, z0 + d, x0 + w, h, z0, x0, h, z0], 0, 1, 0, color(k, h));
      faces.count += w * d;
      quads++;
    }
  }
  return quads;
}

/**
 * Side faces, one direction at a time. `top(k)` is column k's surface (NO_WATER to skip) and
 * `below(x, z, k)` the surface of the neighbor at (x, z) that column k looks at; a side is drawn
 * from that up to the top. Runs merge only when `group(k)` matches, and `color` gets that group.
 */
function sideRuns(
  n: number,
  top: (k: number) => number,
  below: (x: number, z: number, k: number) => number,
  group: (k: number) => number,
  b: GeometryBuilder,
  color: (low: number, high: number, edge: boolean, group: number) => [RGB, RGB],
  faces: { count: number },
): number {
  const half = n / 2;
  let quads = 0;
  for (const [dx, dz] of N4) {
    const alongX = dz !== 0;
    for (let line = 0; line < n; line++) {
      let run = -1;
      let runLow = 0;
      let runTop = 0;
      let runGroup = 0;
      // This side faces out of the diorama when the neighbor line is off the grid.
      const edge = alongX ? line + dz < 0 || line + dz >= n : line + dx < 0 || line + dx >= n;
      const flush = (end: number) => {
        if (run < 0) return;
        const [low, high] = color(runLow, runTop, edge, runGroup);
        const a0 = run - half;
        const a1 = end - half;
        const p = line - half + (dx > 0 || dz > 0 ? 1 : 0);
        if (dx > 0) b.quad([p, runLow, a1, p, runLow, a0, p, runTop, a0, p, runTop, a1], 1, 0, 0, low, high);
        else if (dx < 0) b.quad([p, runLow, a0, p, runLow, a1, p, runTop, a1, p, runTop, a0], -1, 0, 0, low, high);
        else if (dz > 0) b.quad([a0, runLow, p, a1, runLow, p, a1, runTop, p, a0, runTop, p], 0, 0, 1, low, high);
        else b.quad([a1, runLow, p, a0, runLow, p, a0, runTop, p, a1, runTop, p], 0, 0, -1, low, high);
        quads++;
        run = -1;
      };
      for (let a = 0; a < n; a++) {
        const x = alongX ? a : line;
        const z = alongX ? line : a;
        const k = z * n + x;
        const h = top(k);
        const low = h === NO_WATER ? h : below(x + dx, z + dz, k);
        if (h === NO_WATER || low >= h) {
          flush(a);
          continue;
        }
        faces.count += h - low;
        const g = group(k);
        if (run >= 0 && low === runLow && h === runTop && g === runGroup && a % CHUNK !== 0) continue;
        flush(a);
        run = a;
        runLow = low;
        runTop = h;
        runGroup = g;
      }
      flush(n);
    }
  }
  return quads;
}

export function meshColumns(cols: Columns, surfaces: Surfaces, tones: number): TerrainMesh {
  const { n, height, water, top } = cols;
  const { kind, tone } = surfaces;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n;

  // Ground.
  const ground = new GeometryBuilder();
  const faces = { count: 0 };
  let quads = greedyTops(
    n,
    (k) => height[k],
    // Tones only split faces when they change the color.
    (k) => (tones > 0 ? kind[k] * 4 + tone[k] : kind[k] * 4),
    ground,
    (k, y) => topColor(kind[k], tone[k], y, top, tones),
    faces,
  );
  quads += sideRuns(
    n,
    (k) => height[k],
    (x, z) => (inside(x, z) ? height[z * n + x] : BASE),
    () => 0,
    ground,
    (low, high) => sideColor(low, high, top),
    faces,
  );

  // River water: tops, and sides wherever the neighbor's surface (water or ground) is lower. At the diorama's edge the cut shows only the water above its own bed.
  let waterGeometry: GeometryData | null = null;
  if (water.some((w) => w !== NO_WATER)) {
    const wb = new GeometryBuilder();
    const ignore = { count: 0 };
    greedyTops(n, (k) => water[k], () => 0, wb, () => WATER_TOP, ignore);
    sideRuns(
      n,
      (k) => water[k],
      (x, z, own) => {
        if (!inside(x, z)) return height[own];
        const k = z * n + x;
        return water[k] !== NO_WATER ? water[k] : height[k];
      },
      () => 0,
      wb,
      // Falls are pale; the cut where the river meets the diorama's edge is the river's color, darkened like the ground's sides.
      (_low, _high, edge) => (edge ? [shade(WATER_TOP, SIDE), shade(WATER_TOP, SIDE)] : [WATER_SIDE, WATER_SIDE]),
      ignore,
    );
    waterGeometry = wb.finish();
  }

  return { geometry: ground.finish(), water: waterGeometry, voxelFaces: faces.count, quads };
}

/**
 * The ground a later stage cut away, for the build animation: column k stands from `floor[k]`
 * (the finished ground) up to `top[k]` (the ground before the cut), or not at all where `top` is
 * NO_WATER. Grass on top, cliff on the sides; only what stands above the finished ground is drawn.
 */
export function meshCut(n: number, top: Int16Array, floor: Int16Array, maxTop: number): GeometryData | null {
  if (!top.some((h) => h !== NO_WATER)) return null;
  const b = new GeometryBuilder();
  const faces = { count: 0 };
  greedyTops(n, (k) => top[k], () => 0, b, (_k, y) => topColor(SURFACE.grass, 1, y, maxTop, 0), faces);
  sideRuns(
    n,
    (k) => top[k],
    (x, z, own) => {
      if (x < 0 || z < 0 || x >= n || z >= n) return floor[own];
      const j = z * n + x;
      return Math.max(top[j] !== NO_WATER ? top[j] : floor[j], floor[own]);
    },
    () => 0,
    b,
    (low, high) => sideColor(low, high, maxTop),
    faces,
  );
  return b.finish();
}
