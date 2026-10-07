import * as THREE from "three";

/**
 * Collects axis-aligned boxes and bakes them into one BufferGeometry with per-vertex colours, so a
 * whole layer is a single draw call. Boxes are in voxel units: (x, y, z) is the minimum corner.
 *
 * This is the simple builder for large blocks (the base, the slab). Terrain voxels get a greedy
 * mesher in Step 3, which only emits the faces that are actually exposed.
 */
export class VoxelBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private readonly color = new THREE.Color();

  get boxCount(): number {
    return this.positions.length / 72;
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, hex: number) {
    // hex is sRGB; THREE.Color stores it in linear space, which is what vertex colours need.
    this.color.setHex(hex);
    const { r, g, b } = this.color;
    const x1 = x + w;
    const y1 = y + h;
    const z1 = z + d;
    // Each face: normal, then four corners counter-clockwise seen from outside.
    const faces: [number[], number[][]][] = [
      [[1, 0, 0], [[x1, y, z1], [x1, y, z], [x1, y1, z], [x1, y1, z1]]],
      [[-1, 0, 0], [[x, y, z], [x, y, z1], [x, y1, z1], [x, y1, z]]],
      [[0, 1, 0], [[x, y1, z1], [x1, y1, z1], [x1, y1, z], [x, y1, z]]],
      [[0, -1, 0], [[x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1]]],
      [[0, 0, 1], [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]]],
      [[0, 0, -1], [[x1, y, z], [x, y, z], [x, y1, z], [x1, y1, z]]],
    ];
    for (const [normal, corners] of faces) {
      const base = this.positions.length / 3;
      for (const corner of corners) {
        this.positions.push(corner[0], corner[1], corner[2]);
        this.normals.push(normal[0], normal[1], normal[2]);
        this.colors.push(r, g, b);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}
