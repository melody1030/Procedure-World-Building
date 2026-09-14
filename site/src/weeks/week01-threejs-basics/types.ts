export type ShapeType = "box" | "sphere" | "icosahedron" | "torus" | "torusKnot" | "cone" | "cylinder";
export type MaterialType = "standard" | "physical" | "phong" | "toon" | "basic";
export type LightType = "directional" | "point" | "spot";

export interface Week1BasicsState {
  shape: ShapeType;
  color: string;
  materialType: MaterialType;
  wireframe: boolean;
  autoRotate: boolean;
  roughness: number;
  metalness: number;
  shininess: number;
  lightType: LightType;
  lightIntensity: number;
  shadowsEnabled: boolean;
}
