import * as THREE from "three";
import { FINE } from "../buildings/kit";
import { VoxelGrid } from "../voxelGrid";

/**
 * A small voxel model (docs/plans/voxel-look-plan.md, M3–M4): cubes filled in as boxes, each with a
 * color and a kind (the paint, the glass, a lit window) (voxelGrid.ts). `mesh` draws one kind as a
 * geometry: its outside, merged into as few rectangles as the colors allow, with `aVoxel` on the
 * model's own grid for the voxel look (render/voxelLook.ts).
 *
 * A model's colors are multiplied by its instance's color (a car's paint, a pigeon's gray), so
 * 0xffffff takes that color as it is and darker ones shade it.
 */
export class VoxelModel extends VoxelGrid<number> {
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color = 0xffffff, kind = "solid") {
    return super.fill(x0, y0, z0, x1, y1, z1, color, kind);
  }

  /** The cubes of one kind as a geometry, in cubes of side `cell`, with (ox, oy, oz) (in cubes) at the origin. */
  mesh(kind = "solid", [ox, oy, oz]: [number, number, number] = [0, 0, 0], cell = FINE): THREE.BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const vox: number[] = [];
    const index: number[] = [];
    const color = new THREE.Color();
    this.faces(kind, (corners, axis, side, c) => {
      const base = pos.length / 3;
      color.setHex(c);
      for (const g of corners) {
        pos.push((g[0] - ox) * cell, (g[1] - oy) * cell, (g[2] - oz) * cell);
        nor.push(axis === 0 ? side : 0, axis === 1 ? side : 0, axis === 2 ? side : 0);
        col.push(color.r, color.g, color.b);
        vox.push(g[0], g[1], g[2], 1);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geometry.setAttribute("aVoxel", new THREE.Float32BufferAttribute(vox, 4));
    geometry.setIndex(index);
    return geometry;
  }
}
