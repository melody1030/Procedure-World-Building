export type ShapeType = "box" | "sphere" | "icosahedron" | "torus" | "torusKnot" | "cone" | "cylinder";
export type MaterialType = "standard" | "physical" | "phong" | "toon" | "basic";
export type LightType = "directional" | "point" | "spot";
export type PresetKey = "default" | "metallic" | "glass" | "stone" | "neon" | "matte";

/** Shapes whose construction parameters are exposed in the UI. */
export type ParamShapeType = "box" | "sphere" | "icosahedron" | "torus" | "torusKnot" | "cone" | "cylinder";

export interface GeometryParams {
  box: { width: number; height: number; depth: number };
  sphere: { radius: number; widthSegments: number; heightSegments: number };
  icosahedron: { radius: number; detail: number };
  torus: { radius: number; tube: number; radialSegments: number; tubularSegments: number };
  torusKnot: { radius: number; tube: number; radialSegments: number; tubularSegments: number; p: number; q: number };
  cone: { radius: number; height: number; radialSegments: number };
  cylinder: { radiusTop: number; radiusBottom: number; height: number };
}

export interface Week1BasicsState {
  shape: ShapeType;
  geometryParams: GeometryParams;
  color: string;
  materialType: MaterialType;
  wireframe: boolean;
  autoRotate: boolean;
  roughness: number;
  metalness: number;
  shininess: number;
  /** Glass-style see-through refraction (Standard/Physical only). Preset-driven — no manual slider yet. */
  transmission: number;
  /** Self-glow strength, independent of scene lighting (Standard/Physical/Phong/Toon). Preset-driven — no manual slider yet. */
  emissiveIntensity: number;
  lightType: LightType;
  lightIntensity: number;
  lightPosition: [number, number, number];
  shadowsEnabled: boolean;
}
