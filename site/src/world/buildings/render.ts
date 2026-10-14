import * as THREE from "three";
import type { GeometryData } from "../geometry";
import type { BuildingModel } from "./config";

/**
 * Wraps a building's geometry in three.js meshes. The two materials are shared by every building,
 * so a city of them stays at two programs; each building is two draw calls.
 */

let materials: { solid: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial } | null = null;

export function buildingMaterials() {
  materials ??= {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.12 }),
    // Lights are unlit and skip tone mapping, so they stay bright against the dark masses.
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return materials;
}

function geometry(data: GeometryData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  g.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
  g.setIndex(new THREE.BufferAttribute(data.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** A group holding the building's two meshes, its footprint centered on the origin. */
export function buildingObject(model: BuildingModel): THREE.Group {
  const { solid, glow } = buildingMaterials();
  const group = new THREE.Group();
  const body = new THREE.Mesh(geometry(model.solid), solid);
  body.castShadow = true;
  body.receiveShadow = true;
  const lights = new THREE.Mesh(geometry(model.glow), glow);
  for (const mesh of [body, lights]) {
    mesh.position.set(-model.width / 2, 0, -model.depth / 2);
    group.add(mesh);
  }
  group.userData.model = model.id;
  return group;
}

/** Frees a building group's geometry (the shared materials stay). */
export function disposeBuilding(group: THREE.Object3D) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}
