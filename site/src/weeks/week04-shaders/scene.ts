import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The study scene: a plain square plinth with a few architectural and rounded forms on it.
 * Built for reading shaders, not for mood: one material, no emissive detail, no particles.
 *
 * Every object's geometry has its origin at the centre of its base, so the vertex shader can
 * measure height above it (fake AO, local gradient).
 */

export const GROUND_SIZE = 10;
const GROUND_DEPTH = 0.3;

export interface StudyScene {
  meshes: THREE.Mesh[];
  /** The tallest object's top, for the world-space gradient. */
  sceneHeight: number;
  /** A finely divided water surface covering the floor. Only shown with Ripple. */
  water: THREE.Mesh;
}

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** Moves a geometry so its bounding box sits on y = 0, centred on x and z. */
function toBase(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  return geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
}

/**
 * A smooth hill about 2.8 units across: a gentle mound, a steep-sided mesa with a flat top, and
 * a slightly lobed outline so its slopes face every direction at different angles.
 */
function buildHill(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(2.8, 2.8, 112, 112).rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const angle = Math.atan2(z, x);
    const r = Math.hypot(x, z) * (1 + 0.12 * Math.sin(3 * angle));
    const mound = 0.35 * Math.exp(-(r * r) / 0.45);
    const mesa = 0.5 * THREE.MathUtils.smoothstep(0.62 - r, 0, 0.14);
    const edge = THREE.MathUtils.smoothstep(1.4 - r, 0, 0.35);
    position.setY(i, (mound + mesa) * edge);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** For the outline pass: every vertex gets the average normal of all vertices at its position. */
function addSmoothNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const sums = new Map<string, THREE.Vector3>();
  const keyAt = (i: number) => `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
  for (let i = 0; i < position.count; i++) {
    const key = keyAt(i);
    const sum = sums.get(key) ?? new THREE.Vector3();
    sum.x += normal.getX(i);
    sum.y += normal.getY(i);
    sum.z += normal.getZ(i);
    sums.set(key, sum);
  }
  const smooth = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const n = sums.get(keyAt(i))!.clone().normalize();
    smooth.set([n.x, n.y, n.z], i * 3);
  }
  geometry.setAttribute("aSmoothNormal", new THREE.BufferAttribute(smooth, 3));
}

/** The per-object attributes the shaders read (constant across one object). */
function addObjectAttributes(geometry: THREE.BufferGeometry, water: number, occlude: number) {
  geometry.computeBoundingBox();
  const height = Math.max(0.001, geometry.boundingBox!.max.y);
  const count = geometry.attributes.position.count;
  geometry.setAttribute("aHeight", new THREE.BufferAttribute(new Float32Array(count).fill(height), 1));
  geometry.setAttribute("aWater", new THREE.BufferAttribute(new Float32Array(count).fill(water), 1));
  geometry.setAttribute("aOcclude", new THREE.BufferAttribute(new Float32Array(count).fill(occlude), 1));
  addSmoothNormals(geometry);
}

export function buildStudyScene(): StudyScene {
  const meshes: THREE.Mesh[] = [];
  let sceneHeight = 0;

  const place = (geometry: THREE.BufferGeometry, x: number, z: number, y = 0, rotationY = 0) => {
    toBase(geometry);
    addObjectAttributes(geometry, 0, 1);
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    meshes.push(mesh);
    sceneHeight = Math.max(sceneHeight, y + geometry.boundingBox!.max.y);
  };

  // The plinth. Its origin is its top centre, so "height above base" is never positive and fake
  // AO leaves it alone.
  const ground = new THREE.BoxGeometry(GROUND_SIZE, GROUND_DEPTH, GROUND_SIZE).translate(0, -GROUND_DEPTH / 2, 0);
  addObjectAttributes(ground, 0, 0);
  ground.setAttribute("aHeight", new THREE.BufferAttribute(new Float32Array(ground.attributes.position.count).fill(1), 1));
  meshes.push(new THREE.Mesh(ground));

  // Stepped tower: three setbacks and a mast.
  place(mergeGeometries([box(1.4, 1.3, 1.4), box(1.0, 1.0, 1.0, 0, 1.3), box(0.6, 0.7, 0.6, 0, 2.3), box(0.08, 0.8, 0.08, 0, 3.0)]), -1.3, -0.9);
  // Plain towers and blocks of different heights.
  place(box(0.9, 2.6, 0.9), 0.6, -2.4);
  place(box(1.3, 1.5, 1.0), 2.4, -1.0, 0, 0.3);
  place(box(1.8, 0.6, 1.2), -3.1, 1.6, 0, -0.2);
  // A staircase climbing to a platform.
  const steps = Array.from({ length: 6 }, (_, i) => box(1.2, 0.15 * (i + 1), 0.3, 0, 0, -0.75 + i * 0.3));
  place(mergeGeometries([...steps, box(1.2, 0.9, 1.0, 0, 0, 1.3)]), 2.9, 2.0, 0, -0.5);
  // Rounded forms: a sphere on a round platform, a torus knot, a capsule, a column.
  place(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 48), 0.2, 1.3);
  place(new THREE.SphereGeometry(0.72, 64, 32), 0.2, 1.3, 0.2);
  place(new THREE.TorusKnotGeometry(0.42, 0.14, 160, 20), -1.4, 3.1);
  place(new THREE.CapsuleGeometry(0.34, 0.9, 12, 32), 1.0, 3.6);
  place(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 40), -3.3, -2.4);
  // A hill with a steep-sided mesa on top of a gentle mound, so Slope has every steepness to show.
  place(buildHill(), -3.5, -0.3);
  // A thin mast near the edge.
  place(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 12), 3.8, -3.4);

  // The water: a box 1 unit tall standing on the floor, finely divided on top so Ripple has
  // vertices to move, and marked with aWater = 1. The vertex shader scales its height to the
  // Water level control, so it always fills from the floor up, with sides.
  const waterGeometry = new THREE.BoxGeometry(GROUND_SIZE, 1, GROUND_SIZE, 160, 1, 160).translate(0, 0.5, 0);
  addObjectAttributes(waterGeometry, 1, 0);
  const water = new THREE.Mesh(waterGeometry);
  water.visible = false;

  return { meshes, sceneHeight, water };
}

