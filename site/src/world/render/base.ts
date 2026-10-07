import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { PLINTH, WATER } from "../palette";
import { PLINTH_DEPTH, SEABED, WATER_MARGIN } from "../scale";
import { VoxelBatch } from "../voxels";

/**
 * The diorama's frame: the cut-away plinth it stands on, the sea (a mirror on top, translucent
 * cut-away sides).
 */

const STRATUM = 4;

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
 * The table-top block under the world, in strata so its cut edge reads as layers. Its body stops
 * one voxel below the seabed; a one-voxel ring brings the open-water margin up to the seabed, so it
 * meets the terrain's edge columns flush.
 */
export function buildPlinth(half: number): THREE.Object3D {
  const outer = half + WATER_MARGIN;
  const group = new THREE.Group();
  const batch = new VoxelBatch();
  const top = SEABED - 1;
  for (let y = SEABED - PLINTH_DEPTH, i = 0; y < top; y += STRATUM, i++) {
    batch.box(-outer, y, -outer, outer * 2, Math.min(STRATUM, top - y), outer * 2, PLINTH.strata[i % PLINTH.strata.length]);
  }
  const ring = outer - half;
  batch.box(-outer, top, -outer, outer * 2, 1, ring, PLINTH.top);
  batch.box(-outer, top, half, outer * 2, 1, ring, PLINTH.top);
  batch.box(-outer, top, -half, ring, 1, half * 2, PLINTH.top);
  batch.box(half, top, -half, ring, 1, half * 2, PLINTH.top);
  group.add(litMesh(batch));
  // A faint cyan line around the top edge, at the waterline so it shows above the sea mirror:
  // the blueprint the world is printed on.
  const o = outer + 0.05;
  for (const y of [0.1, SEABED - PLINTH_DEPTH]) {
    group.add(lines([-o, y, -o, o, y, -o, o, y, -o, o, y, o, o, y, o, -o, y, o, -o, y, o, -o, y, -o], PLINTH.rim, y > 0 ? 0.55 : 0.25));
  }
  return group;
}

export interface Sea {
  object: THREE.Group;
  mirror: Reflector;
}

/** The sea: a dark mirror at sea level, plus see-through sides. */
export function buildSea(half: number, seaLevel: number, renderer: THREE.WebGLRenderer): Sea {
  const outer = half + WATER_MARGIN;
  const group = new THREE.Group();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const mirror = new Reflector(new THREE.PlaneGeometry(outer * 2, outer * 2), {
    clipBias: 0.002,
    textureWidth: Math.round(size.x * 0.6),
    textureHeight: Math.round(size.y * 0.6),
    // Dark, so the mirror reads as water rather than an upside-down copy of the island.
    color: 0x2e3a50,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = seaLevel;
  group.add(mirror);

  const depth = seaLevel - SEABED;
  const sideMaterial = new THREE.MeshStandardMaterial({ color: WATER.surface, roughness: 0.2, transparent: true, opacity: 0.7, depthWrite: false });
  const sides: [number, number, number, number][] = [
    [0, outer, 0, 0],
    [0, -outer, Math.PI, 0],
    [outer, 0, Math.PI / 2, 1],
    [-outer, 0, -Math.PI / 2, 1],
  ];
  for (const [x, z, ry] of sides) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(outer * 2, depth), sideMaterial);
    side.position.set(x, (seaLevel + SEABED) / 2, z);
    side.rotation.y = ry;
    group.add(side);
  }
  return { object: group, mirror };
}
