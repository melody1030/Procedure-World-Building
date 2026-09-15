import * as THREE from "three";
import type { GeometryParams, LightType, ShapeType, Week1BasicsState } from "./types";

const SHADOW_MAP_SIZE = 1024;

export type ShadowCastingLight = THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;

export function createGeometry(shape: ShapeType, params: GeometryParams): THREE.BufferGeometry {
  switch (shape) {
    case "box": {
      const { width, height, depth } = params.box;
      return new THREE.BoxGeometry(width, height, depth);
    }
    case "sphere": {
      const { radius, widthSegments, heightSegments } = params.sphere;
      return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    }
    case "icosahedron": {
      const { radius, detail } = params.icosahedron;
      return new THREE.IcosahedronGeometry(radius, detail);
    }
    case "torus": {
      const { radius, tube, radialSegments, tubularSegments } = params.torus;
      return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
    }
    case "torusKnot": {
      const { radius, tube, tubularSegments, radialSegments, p, q } = params.torusKnot;
      return new THREE.TorusKnotGeometry(radius, tube, tubularSegments, radialSegments, p, q);
    }
    case "cone": {
      const { radius, height, radialSegments } = params.cone;
      return new THREE.ConeGeometry(radius, height, radialSegments);
    }
    case "cylinder": {
      const { radiusTop, radiusBottom, height } = params.cylinder;
      return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32);
    }
  }
}

// A glowing preset (e.g. Neon) sets emissive to match the base color rather than exposing
// a separate emissive-color control — "glowing" just means the surface's own color, lit from within.
const GLASS_IOR = 1.5;
const GLASS_THICKNESS = 0.5;

export function createMaterial(state: Week1BasicsState): THREE.Material {
  const { materialType, color, wireframe, roughness, metalness, shininess, transmission, emissiveIntensity } = state;
  // Wireframe is a diagnostic overlay, not a lighting mode: it always renders as
  // flat, unlit edges so the wireframe itself never shows a bright/dark split.
  if (wireframe) return new THREE.MeshBasicMaterial({ color, wireframe: true });
  switch (materialType) {
    case "standard":
      return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: color, emissiveIntensity });
    case "physical":
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness,
        metalness,
        clearcoat: 0.6,
        transmission,
        ior: GLASS_IOR,
        thickness: GLASS_THICKNESS,
        emissive: color,
        emissiveIntensity,
      });
    case "phong":
      return new THREE.MeshPhongMaterial({ color, shininess, emissive: color, emissiveIntensity });
    case "toon":
      return new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity });
    case "basic":
      return new THREE.MeshBasicMaterial({ color });
  }
}

/** Materials expose different lit-shading knobs — apply only the ones the current type has, in place. */
export function updateMaterial(material: THREE.Material, state: Week1BasicsState): void {
  const { color, roughness, metalness, shininess, transmission, emissiveIntensity } = state;
  const anyMaterial = material as THREE.Material & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
    shininess?: number;
    transmission?: number;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
  };
  anyMaterial.color?.set(color);
  if ("roughness" in anyMaterial) anyMaterial.roughness = roughness;
  if ("metalness" in anyMaterial) anyMaterial.metalness = metalness;
  if ("shininess" in anyMaterial) anyMaterial.shininess = shininess;
  if ("transmission" in anyMaterial) anyMaterial.transmission = transmission;
  if ("emissiveIntensity" in anyMaterial) {
    anyMaterial.emissive?.set(color);
    anyMaterial.emissiveIntensity = emissiveIntensity;
  }
}

/** Sits any geometry's lowest point exactly on the ground plane (y = 0) instead of a fixed, shape-agnostic height. */
export function groundedY(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  return -(geometry.boundingBox?.min.y ?? 0);
}

const LIGHT_COLOR = 0xffffff;

/** Each light type needs its own shadow-camera tuning, set once at creation; position is shared and freely movable. */
export function createLight(type: LightType, intensity: number, position: [number, number, number]): ShadowCastingLight {
  switch (type) {
    case "directional": {
      const light = new THREE.DirectionalLight(LIGHT_COLOR, intensity);
      light.position.set(...position);
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
      light.position.set(...position);
      light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      return light;
    }
    case "spot": {
      const light = new THREE.SpotLight(LIGHT_COLOR, intensity, 20, Math.PI / 6, 0.3, 2);
      light.position.set(...position);
      light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      return light;
    }
  }
}
