import type { LightType, MaterialType, ShapeType, Week1BasicsState } from "./types";

export const defaultWeek1BasicsState: Week1BasicsState = {
  shape: "icosahedron",
  color: "#6c8cff",
  materialType: "standard",
  wireframe: false,
  autoRotate: true,
  roughness: 0.4,
  metalness: 0.1,
  shininess: 30,
  lightType: "directional",
  lightIntensity: 2.2,
  shadowsEnabled: false,
};

export const shapeConfig: Record<ShapeType, { label: string }> = {
  box: { label: "Box" },
  sphere: { label: "Sphere" },
  icosahedron: { label: "Icosahedron" },
  torus: { label: "Torus" },
  torusKnot: { label: "Torus Knot" },
  cone: { label: "Cone" },
  cylinder: { label: "Cylinder" },
};

export const materialConfig: Record<MaterialType, { label: string; description: string }> = {
  standard: {
    label: "Standard (PBR)",
    description: "Physically-based material driven by roughness and metalness; reacts to scene lights.",
  },
  physical: {
    label: "Physical (PBR+)",
    description: "Extends Standard with a clearcoat layer for a glossy top coat.",
  },
  phong: {
    label: "Phong",
    description: "Classic specular-highlight shading, controlled by shininess.",
  },
  toon: {
    label: "Toon",
    description: "Flat, banded cel-shaded lighting instead of a smooth gradient.",
  },
  basic: {
    label: "Basic (unlit)",
    description: "Flat color, ignores every light in the scene entirely.",
  },
};

interface LightTypeConfig {
  label: string;
  description: string;
  /** Point/spot lights use physically-based candela units, so a comparable brightness needs a much
   * higher number than a directional light's lux-like intensity — each type gets its own slider range. */
  min: number;
  max: number;
  step: number;
  default: number;
}

export const lightConfig: Record<LightType, LightTypeConfig> = {
  directional: {
    label: "Directional",
    description: "Parallel rays from one direction, like sunlight — even across the whole scene.",
    min: 0,
    max: 10,
    step: 0.1,
    default: 2.2,
  },
  point: {
    label: "Point",
    description: "Radiates outward from a point in space, like a bare bulb — falls off with distance.",
    min: 0,
    max: 500,
    step: 5,
    default: 200,
  },
  spot: {
    label: "Spot",
    description: "A cone of light from a point, like a flashlight — has an angle and a soft penumbra edge.",
    min: 0,
    max: 500,
    step: 5,
    default: 250,
  },
};

export const fieldDescriptions = {
  shape: "The sample geometry rendered in the scene.",
  color: "Base color passed to the material.",
  materialType: "Which THREE.Material subclass shades the geometry.",
  wireframe: "Render only the geometry's edges instead of filled faces.",
  autoRotate: "Continuously spin the geometry on its Y axis.",
  roughness: "0 = mirror-smooth highlight, 1 = fully matte.",
  metalness: "0 = dielectric (plastic-like), 1 = metallic.",
  shininess: "Size/sharpness of the Phong specular highlight.",
  lightType: "Which THREE.Light subclass illuminates the scene.",
  lightIntensity: "Brightness of the light.",
  shadowsEnabled: "Toggle the light casting a shadow onto the ground plane.",
};
