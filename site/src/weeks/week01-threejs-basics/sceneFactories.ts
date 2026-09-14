import * as THREE from "three";
import type { LightType, ShapeType, Week1BasicsState } from "./types";

const SHADOW_MAP_SIZE = 1024;

export type ShadowCastingLight = THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;

export function createGeometry(shape: ShapeType): THREE.BufferGeometry {
  switch (shape) {
    case "box":
      return new THREE.BoxGeometry(3.2, 3.2, 3.2);
    case "sphere":
      return new THREE.SphereGeometry(2.4, 32, 32);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(2.4, 0);
    case "torus":
      return new THREE.TorusGeometry(2, 0.8, 16, 100);
    case "torusKnot":
      return new THREE.TorusKnotGeometry(1.6, 0.5, 100, 16);
    case "cone":
      return new THREE.ConeGeometry(2.2, 4, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(1.8, 1.8, 3.6, 32);
  }
}

export function createMaterial(state: Week1BasicsState): THREE.Material {
  const { materialType, color, wireframe, roughness, metalness, shininess } = state;
  // Wireframe is a diagnostic overlay, not a lighting mode: it always renders as
  // flat, unlit edges so the wireframe itself never shows a bright/dark split.
  if (wireframe) return new THREE.MeshBasicMaterial({ color, wireframe: true });
  switch (materialType) {
    case "standard":
      return new THREE.MeshStandardMaterial({ color, roughness, metalness });
    case "physical":
      return new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat: 0.6 });
    case "phong":
      return new THREE.MeshPhongMaterial({ color, shininess });
    case "toon":
      return new THREE.MeshToonMaterial({ color });
    case "basic":
      return new THREE.MeshBasicMaterial({ color });
  }
}

/** Materials expose different lit-shading knobs — apply only the ones the current type has, in place. */
export function updateMaterial(material: THREE.Material, state: Week1BasicsState): void {
  const { color, roughness, metalness, shininess } = state;
  const anyMaterial = material as THREE.Material & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
    shininess?: number;
  };
  anyMaterial.color?.set(color);
  if ("roughness" in anyMaterial) anyMaterial.roughness = roughness;
  if ("metalness" in anyMaterial) anyMaterial.metalness = metalness;
  if ("shininess" in anyMaterial) anyMaterial.shininess = shininess;
}

/** Sits any geometry's lowest point exactly on the ground plane (y = 0) instead of a fixed, shape-agnostic height. */
export function groundedY(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  return -(geometry.boundingBox?.min.y ?? 0);
}

const LIGHT_COLOR = 0xffffff;

/** Each light type needs its own shadow-camera frustum tuned to the scene scale, set once at creation. */
export function createLight(type: LightType, intensity: number): ShadowCastingLight {
  switch (type) {
    case "directional": {
      const light = new THREE.DirectionalLight(LIGHT_COLOR, intensity);
      light.position.set(5, 8, 4);
      light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      light.shadow.camera.left = -8;
      light.shadow.camera.right = 8;
      light.shadow.camera.top = 8;
      light.shadow.camera.bottom = -8;
      light.shadow.camera.near = 1;
      light.shadow.camera.far = 25;
      return light;
    }
    case "point": {
      const light = new THREE.PointLight(LIGHT_COLOR, intensity, 0, 2);
      light.position.set(5, 6, 5);
      light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      return light;
    }
    case "spot": {
      const light = new THREE.SpotLight(LIGHT_COLOR, intensity, 20, Math.PI / 6, 0.3, 2);
      light.position.set(5, 8, 5);
      light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      return light;
    }
  }
}
