import { GeometryBuilder, lin, mix, shade, type GeometryData, type RGB } from "../geometry";
import { TERRAIN, URBAN_GROUND, WATER } from "../palette";
import { BASE, CHUNK } from "../scale";
import { NATURAL_SIDES, SURFACE, TILES, type Surfaces } from "./surfaces";
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
  sidewalk: lin(URBAN_GROUND.sidewalk),
  pavement: lin(URBAN_GROUND.pavement),
  concrete: lin(URBAN_GROUND.concrete),
  lawn: lin(URBAN_GROUND.lawn),
  paving: lin(URBAN_GROUND.paving),
  planter: lin(URBAN_GROUND.planter),
  path: lin(URBAN_GROUND.path),
  stone: lin(URBAN_GROUND.plaza),
  wallTop: lin(URBAN_GROUND.wallTop),
  wallBottom: lin(URBAN_GROUND.wallBottom),
  ledge: lin(URBAN_GROUND.ledge),
  stairs: lin(URBAN_GROUND.stairs),
};
const WATER_TOP = lin(WATER.river);
const WATER_SIDE = lin(WATER.fall);
/** Darkening for the water's cut face at the diorama's edge, like the ground's sides. */
const SIDE = 0.68;

/** How far apart alternate slabs are shaded. */
const SLAB = 0.07;

/** Top color of a column: its surface, shaded by its tone (slabs by their own spread). */
function topColor(kind: number, tone: number, y: number, top: number, spread: number): RGB {
  const t = 1 + (tone - 1) * (TILES.has(kind) ? SLAB : spread);
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
      // Before the city is painted (the build's first stages) the plaza is plain; then dark slabs.
      return tone === 1 ? C.plaza : shade(C.stone, t);
    case SURFACE.sidewalk:
      return shade(C.sidewalk, t);
    case SURFACE.paving:
      return shade(C.paving, t);
    // Asphalt keeps half its tone patches: worn and patched.
    case SURFACE.pavement:
      return shade(C.pavement, 1 + (t - 1) * 0.5);
    case SURFACE.concrete:
      return shade(C.concrete, t);
    case SURFACE.lawn:
      return shade(C.lawn, t);
    case SURFACE.planter:
      return shade(C.planter, t);
    case SURFACE.path:
      return shade(C.path, t);
    case SURFACE.ledge:
      return shade(C.ledge, t);
    // A tread every voxel up: alternate steps a little lighter.
    case SURFACE.stairs:
      return shade(C.stairs, t * (Math.round(y) % 2 ? 1.06 : 0.96));
    default:
      return shade(mix(C.grassLow, C.grassHigh, Math.min(1, Math.max(0, y / top))), t);
  }
}

/** Side colors (bottom, top) for a run of cliff from `low` to `high`; under city ground (`wall`), a concrete retaining wall. */
function sideColor(low: number, high: number, top: number, wall = false): [RGB, RGB] {
  const [bottom, upper] = wall ? [C.wallBottom, C.wallTop] : [C.cliffBottom, C.cliffTop];
  const cliff = (y: number) => mix(bottom, upper, Math.min(1, Math.max(0, (y - BASE) / (top - BASE))));
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
  const { n, height, top } = cols;
  const { kind, tone } = surfaces;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n;

  // Ground.
  const ground = new GeometryBuilder();
  const faces = { count: 0 };
  let quads = greedyTops(
    n,
    (k) => height[k],
    // Tones only split faces when they change the color.
    (k) => (tones > 0 || TILES.has(kind[k]) ? kind[k] * 4 + tone[k] : kind[k] * 4),
    ground,
    (k, y) => topColor(kind[k], tone[k], y, top, tones),
    faces,
  );
  quads += sideRuns(
    n,
    (k) => height[k],
    (x, z) => (inside(x, z) ? height[z * n + x] : BASE),
    (k) => (NATURAL_SIDES.has(kind[k]) ? 0 : 1),
    ground,
    (low, high, _edge, wall) => sideColor(low, high, top, wall === 1),
    faces,
  );

  return { geometry: ground.finish(), water: meshWater(cols), voxelFaces: faces.count, quads };
}

/** River water: tops, and sides wherever the neighbor's surface (water or ground) is lower. At the diorama's edge the cut shows only the water above its own bed. Null when there is none. */
export function meshWater(cols: Columns): GeometryData | null {
  const { n, height, water } = cols;
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n;
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
  return waterGeometry;
}

/**
 * The ground a later stage cut away, for the build animation: column k stands from `floor[k]`
 * (the finished ground) up to `top[k]` (the ground before the cut), or not at all where `top` is
 * NO_WATER. Concrete on top, walls on the sides; only what stands above the finished ground is drawn.
 */
export function meshCut(n: number, top: Int16Array, floor: Int16Array, maxTop: number): GeometryData | null {
  if (!top.some((h) => h !== NO_WATER)) return null;
  const b = new GeometryBuilder();
  const faces = { count: 0 };
  greedyTops(n, (k) => top[k], () => 0, b, (_k, y) => topColor(SURFACE.concrete, 1, y, maxTop, 0), faces);
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
    (low, high) => sideColor(low, high, maxTop, true),
    faces,
  );
  return b.finish();
}

/**
 * The ground the site grading digs out of the lots, for the build animation: column k stands from
 * `floor[k]` (the graded ground) up to `top[k]` (the ground before), or not at all where `top` is
 * NO_WATER. Tops keep their own surface; sides are cliff. `lot[k]` (the lot that dug it, from 1)
 * keeps each lot's faces apart, and is returned per vertex (`lots`), so each lot can be dug on its
 * own clock.
 */
export function meshDig(n: number, top: Int16Array, floor: Int16Array, lot: Int32Array, surfaces: Surfaces, tones: number, maxTop: number): { geometry: GeometryData; lots: Float32Array } | null {
  if (!top.some((h) => h !== NO_WATER)) return null;
  const { kind, tone } = surfaces;
  const b = new GeometryBuilder();
  const faces = { count: 0 };
  greedyTops(n, (k) => top[k], (k) => lot[k], b, (k, y) => topColor(kind[k], tone[k], y, maxTop, tones), faces);
  sideRuns(
    n,
    (k) => top[k],
    (x, z, own) => {
      if (x < 0 || z < 0 || x >= n || z >= n) return floor[own];
      const j = z * n + x;
      return Math.max(top[j] !== NO_WATER ? top[j] : floor[j], floor[own]);
    },
    (k) => lot[k],
    b,
    (low, high) => sideColor(low, high, maxTop, true),
    faces,
  );
  const geometry = b.finish();
  // Each face's lot: the column just inside it from its middle (faces never span two lots).
  const half = n / 2;
  const lots = new Float32Array(geometry.position.length / 3);
  const { position: p, normal: nm, index } = geometry;
  for (let i = 0; i < index.length; i += 3) {
    const [a, c, d] = [index[i], index[i + 1], index[i + 2]];
    const x = Math.floor((p[a * 3] + p[c * 3] + p[d * 3]) / 3 - nm[a * 3] * 0.5 + half);
    const z = Math.floor((p[a * 3 + 2] + p[c * 3 + 2] + p[d * 3 + 2]) / 3 - nm[a * 3 + 2] * 0.5 + half);
    const id = x >= 0 && z >= 0 && x < n && z < n ? lot[z * n + x] : 0;
    lots[a] = lots[c] = lots[d] = id;
  }
  return { geometry, lots };
}
