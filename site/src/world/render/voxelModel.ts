import * as THREE from "three";
import { FINE } from "../buildings/kit";

/**
 * A small voxel model, as in a voxel editor: cubes on a grid, each with a color and a kind (what
 * it is drawn as: the paint, the glass, a lit window), filled in as boxes of cubes
 * (docs/plans/voxel-look-plan.md, M3–M4). `mesh` draws one kind: only the faces no other cube
 * covers, merged into as few rectangles as the colors allow, with `aVoxel` on the model's own grid
 * for the voxel look (render/voxelLook.ts).
 *
 * Coordinates are whole cubes. A model's colors are multiplied by its instance's color (a car's
 * paint, a pigeon's gray), so 0xffffff takes that color as it is and darker ones shade it.
 */
export class VoxelModel {
  private readonly cells = new Map<number, { color: number; kind: string }>();

  /** Fills the cubes x0 ≤ x < x1, y0 ≤ y < y1, z0 ≤ z < z1 (a box of them). */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color = 0xffffff, kind = "solid") {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.cells.set(key(x, y, z), { color, kind });
    return this;
  }

  /** Empties the cubes in a box. */
  clear(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) this.cells.delete(key(x, y, z));
    return this;
  }

  /**
   * The cubes of one kind as a geometry, in cubes of side `cell`, with (ox, oy, oz) (in cubes) at
   * the origin. A face shows where no cube of any kind is next to it, so kinds meet without a face
   * between them.
   */
  mesh(kind = "solid", [ox, oy, oz]: [number, number, number] = [0, 0, 0], cell = FINE): THREE.BufferGeometry {
    // Faces by direction (axis, side) and slice: each a map of (u, v) → color.
    const slices = new Map<number, Map<number, number>>();
    for (const [k, c] of this.cells) {
      if (c.kind !== kind) continue;
      const p = unkey(k);
      for (let axis = 0; axis < 3; axis++) {
        for (const side of [1, -1]) {
          const q = [...p];
          q[axis] += side;
          if (this.cells.has(key(q[0], q[1], q[2]))) continue;
          const [u, v] = AXES[axis];
          const slice = ((axis * 2 + (side > 0 ? 0 : 1)) * 4096 + p[axis] + (side > 0 ? 1 : 0) + 2048) | 0;
          let faces = slices.get(slice);
          if (!faces) slices.set(slice, (faces = new Map()));
          faces.set(key2(p[u], p[v]), c.color);
        }
      }
    }
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const vox: number[] = [];
    const index: number[] = [];
    const color = new THREE.Color();
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
      const same = (a: number, b: number, c: number) => faces.get(key2(a, b)) === c && !taken.has(key2(a, b));
      for (const k of order) {
        if (taken.has(k)) continue;
        const c = faces.get(k)!;
        const [a0, b0] = unkey2(k);
        let a1 = a0 + 1;
        while (same(a1, b0, c)) a1++;
        let b1 = b0 + 1;
        while ([...range(a0, a1)].every((a) => same(a, b1, c))) b1++;
        for (const a of range(a0, a1)) for (const b of range(b0, b1)) taken.add(key2(a, b));
        // The rectangle's corners, turning counter-clockwise seen from outside.
        const corners = [
          [a0, b0],
          [a1, b0],
          [a1, b1],
          [a0, b1],
        ];
        if (side < 0) corners.reverse();
        const base = pos.length / 3;
        color.setHex(c);
        for (const [a, b] of corners) {
          const g = [0, 0, 0];
          g[axis] = at;
          g[u] = a;
          g[v] = b;
          pos.push((g[0] - ox) * cell, (g[1] - oy) * cell, (g[2] - oz) * cell);
          nor.push(axis === 0 ? side : 0, axis === 1 ? side : 0, axis === 2 ? side : 0);
          col.push(color.r, color.g, color.b);
          vox.push(g[0], g[1], g[2], 1);
        }
        index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geometry.setAttribute("aVoxel", new THREE.Float32BufferAttribute(vox, 4));
    geometry.setIndex(index);
    return geometry;
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

function* range(a: number, b: number) {
  for (let i = a; i < b; i++) yield i;
}
