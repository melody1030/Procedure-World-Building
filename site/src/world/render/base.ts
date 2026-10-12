import * as THREE from "three";
import { PLINTH } from "../palette";
import { BASE, PLINTH_DEPTH, voxels } from "../scale";
import { VoxelBatch } from "../voxels";

/**
 * The diorama's frame: the cut-away plinth it stands on.
 */

/** Thickness of one plinth stratum (2 m). */
const STRATUM = voxels(2);

function litMesh(batch: VoxelBatch): THREE.Mesh {
  const mesh = new THREE.Mesh(batch.toGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function lines(points: number[], color: number, opacity: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

/**
 * The table-top block under the world, in strata so its cut edge reads as layers, topped by the
 * terrain, which covers its whole top.
 */
export function buildPlinth(half: number): THREE.Object3D {
  const outer = half;
  const group = new THREE.Group();
  const batch = new VoxelBatch();
  const top = BASE - 1;
  for (let y = BASE - PLINTH_DEPTH, i = 0; y < top; y += STRATUM, i++) {
    batch.box(-outer, y, -outer, outer * 2, Math.min(STRATUM, top - y), outer * 2, PLINTH.strata[i % PLINTH.strata.length]);
  }
  batch.box(-outer, top, -outer, outer * 2, 1, outer * 2, PLINTH.top);
  group.add(litMesh(batch));
  // A faint cyan line around the top edge, at the waterline:
  // the blueprint the world is printed on.
  const o = outer + 0.05;
  for (const y of [0.1, BASE - PLINTH_DEPTH]) {
    group.add(lines([-o, y, -o, o, y, -o, o, y, -o, o, y, o, o, y, o, -o, y, o, -o, y, o, -o, y, -o], PLINTH.rim, y > 0 ? 0.55 : 0.25));
  }
  return group;
}
