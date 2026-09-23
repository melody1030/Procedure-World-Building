import * as THREE from "three";
import type { Vec3 } from "./types";
import type { VoxelCell } from "./voxelSampler";
import { CSG_VOXEL_MAX_INSTANCES } from "./voxelSampler";

export interface VoxelMesh {
  group: THREE.Group;
  mesh: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
}

/** Creates an (initially empty) voxel InstancedMesh wrapped in a Group — the Group is what
 *  DragControls actually targets. Call `fillVoxelMesh` to populate it. */
export function createVoxelMesh(color: number): VoxelMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, CSG_VOXEL_MAX_INSTANCES);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);
  return { group, mesh };
}

export function disposeVoxelMesh(voxel: VoxelMesh): void {
  voxel.mesh.geometry.dispose();
  voxel.mesh.material.dispose();
}

const dummy = new THREE.Object3D();

/** Repopulates `voxel` in place from freshly-sampled cells — reuses the InstancedMesh rather
 *  than recreating it, so this is cheap to call on every rebuild. */
export function fillVoxelMesh(voxel: VoxelMesh, cells: VoxelCell[], cellSize: Vec3): void {
  cells.forEach((cell, index) => {
    dummy.position.set(cell.center.x, cell.center.y, cell.center.z);
    dummy.scale.set(cellSize.x * 0.95, cellSize.y * 0.95, cellSize.z * 0.95);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    voxel.mesh.setMatrixAt(index, dummy.matrix);
  });
  voxel.mesh.count = cells.length;
  voxel.mesh.instanceMatrix.needsUpdate = true;
}
