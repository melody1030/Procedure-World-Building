import type { GeometryParams, LightType, MaterialType, ParamShapeType, PresetKey, ShapeType, Week1BasicsState } from "./types";

export const defaultGeometryParams: GeometryParams = {
  box: { width: 3.2, height: 3.2, depth: 3.2 },
  sphere: { radius: 2.4, widthSegments: 32, heightSegments: 32 },
  icosahedron: { radius: 2.4, detail: 0 },
  torus: { radius: 2, tube: 0.8, radialSegments: 16, tubularSegments: 100 },
  torusKnot: { radius: 1.6, tube: 0.5, radialSegments: 16, tubularSegments: 100, p: 2, q: 3 },
  cone: { radius: 2.2, height: 4, radialSegments: 32 },
  cylinder: { radiusTop: 1.8, radiusBottom: 1.8, height: 3.6 },
};

export const defaultWeek1BasicsState: Week1BasicsState = {
  shape: "icosahedron",
  geometryParams: defaultGeometryParams,
  color: "#6c8cff",
  materialType: "standard",
  wireframe: false,
  autoRotate: true,
  roughness: 0.4,
  metalness: 0.1,
  shininess: 30,
  transmission: 0,
  emissiveIntensity: 0,
  lightType: "directional",
  lightIntensity: 2.2,
  lightPosition: [5, 8, 4],
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

interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Decimal places to display — 0 for integer params like segment counts. */
  decimals: number;
}

/** Which construction parameters each shape exposes, and the slider range/precision for each. */
export const geometryParamsConfig: Record<ParamShapeType, ParamDef[]> = {
  box: [
    { key: "width", label: "Width", min: 0.5, max: 6, step: 0.1, decimals: 1 },
    { key: "height", label: "Height", min: 0.5, max: 6, step: 0.1, decimals: 1 },
    { key: "depth", label: "Depth", min: 0.5, max: 6, step: 0.1, decimals: 1 },
  ],
  sphere: [
    { key: "radius", label: "Radius", min: 0.5, max: 5, step: 0.1, decimals: 1 },
    { key: "widthSegments", label: "Width Segments", min: 3, max: 40, step: 1, decimals: 0 },
    { key: "heightSegments", label: "Height Segments", min: 2, max: 40, step: 1, decimals: 0 },
  ],
  icosahedron: [{ key: "radius", label: "Radius", min: 0.5, max: 5, step: 0.1, decimals: 1 }],
  torus: [
    { key: "radius", label: "Radius", min: 0.5, max: 4, step: 0.1, decimals: 1 },
    { key: "tube", label: "Tube Radius", min: 0.1, max: 2, step: 0.05, decimals: 2 },
    { key: "radialSegments", label: "Radial Segments", min: 3, max: 40, step: 1, decimals: 0 },
    { key: "tubularSegments", label: "Tubular Segments", min: 3, max: 100, step: 1, decimals: 0 },
  ],
  torusKnot: [
    { key: "radius", label: "Radius", min: 0.5, max: 4, step: 0.1, decimals: 1 },
    { key: "tube", label: "Tube Radius", min: 0.1, max: 1.5, step: 0.05, decimals: 2 },
    { key: "tubularSegments", label: "Tubular Segments", min: 3, max: 100, step: 1, decimals: 0 },
    { key: "p", label: "P (winds)", min: 1, max: 10, step: 1, decimals: 0 },
    { key: "q", label: "Q (winds)", min: 1, max: 10, step: 1, decimals: 0 },
  ],
  cone: [
    { key: "radius", label: "Radius", min: 0.5, max: 5, step: 0.1, decimals: 1 },
    { key: "height", label: "Height", min: 0.5, max: 8, step: 0.1, decimals: 1 },
    { key: "radialSegments", label: "Radial Segments", min: 3, max: 64, step: 1, decimals: 0 },
  ],
  cylinder: [
    { key: "radiusTop", label: "Top Radius", min: 0, max: 4, step: 0.1, decimals: 1 },
    { key: "radiusBottom", label: "Bottom Radius", min: 0, max: 4, step: 0.1, decimals: 1 },
    { key: "height", label: "Height", min: 0.5, max: 8, step: 0.1, decimals: 1 },
  ],
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

interface PresetConfig {
  emoji: string;
  label: string;
  /** Material + lighting only — shape, its parameters, and auto-rotate are left as the user set them. */
  patch: Omit<Partial<Week1BasicsState>, "shape" | "geometryParams" | "autoRotate">;
}

export const presetConfig: Record<PresetKey, PresetConfig> = {
  default: {
    emoji: "🔵",
    label: "Default",
    patch: {
      materialType: "standard",
      color: "#6c8cff",
      wireframe: false,
      roughness: 0.4,
      metalness: 0.1,
      transmission: 0,
      emissiveIntensity: 0,
      lightType: "directional",
      lightIntensity: 2.2,
      lightPosition: [5, 8, 4],
      shadowsEnabled: false,
    },
  },
  metallic: {
    emoji: "⚙️",
    label: "Metallic",
    patch: {
      materialType: "physical",
      color: "#d5d8de",
      wireframe: false,
      roughness: 0.15,
      metalness: 1,
      transmission: 0,
      emissiveIntensity: 0,
      lightType: "directional",
      lightIntensity: 3.5,
      lightPosition: [5, 8, 4],
      shadowsEnabled: true,
    },
  },
  glass: {
    emoji: "🔷",
    label: "Glass",
    patch: {
      // Near-zero roughness/metalness plus high transmission is what actually reads as
      // "glass" — a bright glossy opaque surface (the old version of this preset) just
      // looks like white plastic. Transmission refracts whatever is behind the object.
      materialType: "physical",
      color: "#eaf6ff",
      wireframe: false,
      roughness: 0.02,
      metalness: 0,
      transmission: 0.95,
      emissiveIntensity: 0,
      lightType: "spot",
      lightIntensity: 350,
      lightPosition: [5, 8, 5],
      shadowsEnabled: true,
    },
  },
  stone: {
    emoji: "🪨",
    label: "Stone",
    patch: {
      materialType: "standard",
      color: "#8f8577",
      wireframe: false,
      roughness: 0.95,
      metalness: 0,
      transmission: 0,
      emissiveIntensity: 0,
      lightType: "directional",
      lightIntensity: 2,
      lightPosition: [5, 8, 4],
      shadowsEnabled: true,
    },
  },
  neon: {
    emoji: "💡",
    label: "Neon",
    patch: {
      // Emissive (self-glow) reads as "lit from within" while still catching highlights
      // and shadow shaping — a flat unlit color (the old version) just looks like a
      // solid-color cutout, not a light source.
      materialType: "standard",
      color: "#ff2ec4",
      wireframe: false,
      roughness: 0.3,
      metalness: 0,
      transmission: 0,
      emissiveIntensity: 1.8,
      lightType: "point",
      lightIntensity: 150,
      lightPosition: [5, 6, 5],
      shadowsEnabled: false,
    },
  },
  matte: {
    emoji: "⬜",
    label: "Matte",
    patch: {
      // Same base color and light as Default, roughness maxed out — isolates "what does
      // roughness alone change" instead of also swapping the hue, which muddied the comparison.
      materialType: "standard",
      color: "#6c8cff",
      wireframe: false,
      roughness: 1,
      metalness: 0,
      transmission: 0,
      emissiveIntensity: 0,
      lightType: "directional",
      lightIntensity: 2.2,
      lightPosition: [5, 8, 4],
      shadowsEnabled: true,
    },
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
