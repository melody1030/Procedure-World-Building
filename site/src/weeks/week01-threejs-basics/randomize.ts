import { materialConfig, shapeConfig } from "./config";
import type { MaterialType, ShapeType, Week1BasicsState } from "./types";

const SHAPES = Object.keys(shapeConfig) as ShapeType[];
const MATERIAL_TYPES = Object.keys(materialConfig) as MaterialType[];

function randomShape(): ShapeType {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

function randomMaterialType(): MaterialType {
  return MATERIAL_TYPES[Math.floor(Math.random() * MATERIAL_TYPES.length)];
}

function randomColor(): string {
  const hex = Math.floor(Math.random() * 0xffffff).toString(16);
  return `#${hex.padStart(6, "0")}`;
}

/** Random point in a shell around the object — never too close (blown-out highlight) or
 * too far (dim), and always above the ground so the light doesn't shine up from below. */
function randomLightPosition(): [number, number, number] {
  const angle = Math.random() * Math.PI * 2;
  const radius = 5 + Math.random() * 5;
  const height = 4 + Math.random() * 6;
  return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
}

export function randomizePatch(): Partial<Week1BasicsState> {
  return {
    shape: randomShape(),
    color: randomColor(),
    materialType: randomMaterialType(),
    roughness: Math.random(),
    metalness: Math.random(),
    shininess: Math.round(Math.random() * 200),
    // Transmission/emissive are preset-only looks (Glass/Neon) — reset them so a leftover
    // preset doesn't produce a confusing combination with the newly randomized material.
    transmission: 0,
    emissiveIntensity: 0,
    lightPosition: randomLightPosition(),
  };
}
