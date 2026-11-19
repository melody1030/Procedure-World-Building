/**
 * A set of cubes on a grid, as in a voxel editor (pure: no three.js): filled in as boxes of cubes,
 * each cube with a color and a kind (what it is drawn as: paint, glass, leaves, wood). `faces`
 * gives one kind's outside: only the faces no other cube (of any kind) covers, merged into as few
 * rectangles as the colors allow. So overlapping boxes draw as one solid, with no face inside it
 * and none in the plane of another (nothing to flicker).
 *
 * Used for the life models (render/voxelModel.ts) and the parks' plants (city/parkModels.ts).
 * Coordinates are whole cubes.
 */
export class VoxelGrid<C = number> {
  private readonly cells = new Map<number, { color: C; kind: string }>();

  /** Fills the cubes x0 ≤ x < x1, y0 ≤ y < y1, z0 ≤ z < z1 (a box of them). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: C, kind = "solid") {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.cells.set(key(x, y, z), { color, kind });
    return this;
  }

  /** Empties the cubes in a box. */
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.cells.delete(key(x, y, z));
    return this;
  }

  /**
   * One kind's outside, as rectangles: each in the plane `at` across `axis` (0 x, 1 y, 2 z), facing
   * `side` (±1), with its four corners (grid points, counter-clockwise seen from outside) and color.
   */
  faces(kind: string, emit: (corners: number[][], axis: number, side: number, color: C) => void) {
    // Faces by direction and slice: each a map of (u, v) → color.
    const slices = new Map<number, Map<number, C>>();
    for (const [k, c] of this.cells) {
      if (c.kind !== kind) continue;
      const p = unkey(k);
      for (let axis = 0; axis < 3; axis++) {
        for (const side of [1, -1]) {
          const q = [...p];
          q[axis] += side;
          if (this.cells.has(key(q[0], q[1], q[2]))) continue;
          const [u, v] = AXES[axis];
          const slice = (axis * 2 + (side > 0 ? 0 : 1)) * 4096 + p[axis] + (side > 0 ? 1 : 0) + 2048;
          let faces = slices.get(slice);
          if (!faces) slices.set(slice, (faces = new Map()));
          faces.set(key2(p[u], p[v]), c.color);
        }
      }
    }
    for (const [slice, faces] of slices) {
      const dir = Math.floor(slice / 4096);
      const axis = dir >> 1;
      const side = dir & 1 ? -1 : 1;
      const at = (slice % 4096) - 2048;
      const [u, v] = AXES[axis];
      // Greedy: from each face not yet taken, as far along u as the color holds, then along v
      // while whole rows of it do.
      const order = [...faces.keys()].sort((a, b) => a - b);
      const taken = new Set<number>();
      const same = (a: number, b: number, c: C) => faces.get(key2(a, b)) === c && !taken.has(key2(a, b));
      for (const k of order) {
        if (taken.has(k)) continue;
        const c = faces.get(k)!;
        const [a0, b0] = unkey2(k);
        let a1 = a0 + 1;
        while (same(a1, b0, c)) a1++;
        let b1 = b0 + 1;
        const row = (b: number) => {
          for (let a = a0; a < a1; a++) if (!same(a, b, c)) return false;
          return true;
        };
        while (row(b1)) b1++;
        for (let a = a0; a < a1; a++) for (let b = b0; b < b1; b++) taken.add(key2(a, b));
        const corners = [
          [a0, b0],
          [a1, b0],
          [a1, b1],
          [a0, b1],
        ].map(([a, b]) => {
          const g = [0, 0, 0];
          g[axis] = at;
          g[u] = a;
          g[v] = b;
          return g;
        });
        if (side < 0) corners.reverse();
        emit(corners, axis, side, c);
      }
    }
  }
}

/** For each axis, the two along a face across it, so that u × v points along the axis. */
const AXES = [
  [1, 2],
  [2, 0],
  [0, 1],
];

const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const unkey = (k: number) => [Math.floor(k / 1048576) - 512, (Math.floor(k / 1024) % 1024) - 512, (k % 1024) - 512];
const key2 = (a: number, b: number) => (b + 1024) * 2048 + (a + 1024);
const unkey2 = (k: number) => [(k % 2048) - 1024, Math.floor(k / 2048) - 1024];
