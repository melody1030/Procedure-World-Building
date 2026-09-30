import { setColor } from "../technique";
import type { TechniqueModule } from "../technique";

export const fresnel: TechniqueModule = {
  type: "fresnel",
  stage: "surface",
  name: "Fresnel rim",
  summary:
    "Brightens surfaces near the silhouette. The more a surface turns away from the camera, the stronger the rim. It shows best on round shapes: a flat face turns away all at once.",
  formula: "rim = pow(1 - dot(N, V), power)\ncol += color * rim * strength",
  params: [
    {
      key: "power",
      label: "Power",
      description: "Higher power gives a thinner, sharper rim.",
      kind: "range",
      min: 0.5,
      max: 8,
      step: 0.1,
      decimals: 2,
      default: 3.2,
    },
    {
      key: "strength",
      label: "Strength",
      description: "Controls how strongly the rim appears.",
      kind: "range",
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      default: 0.65,
    },
    {
      key: "color",
      label: "Color",
      description: "The color added at the rim.",
      kind: "color",
      default: "#22d3ee",
    },
  ],
  uniforms: ["uniform float uFresnelPower;", "uniform float uFresnelStrength;", "uniform vec3 uFresnelColor;"],
  body: `
// 0 where the surface faces the camera, 1 where it is seen edge-on.
float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), uFresnelPower);
col += uFresnelColor * rim * uFresnelStrength;`,
  apply: (p, u) => {
    u.uFresnelPower.value = p.power;
    u.uFresnelStrength.value = p.strength;
    setColor(u, "uFresnelColor", p.color);
  },
};
