import type { TechniqueModule } from "../technique";

export const lambert: TechniqueModule = {
  type: "lambert",
  stage: "lighting",
  name: "Lambert",
  summary:
    "Plain diffuse lighting. A surface facing the light is fully lit, and it darkens smoothly as it turns away. Ambient is a floor of light, so the shadow side never goes black.",
  formula: "light = ambient + (1 - ambient) * dot(N, L)",
  params: [
    {
      key: "ambient",
      label: "Ambient",
      description: "How bright the side facing away from the light stays.",
      kind: "range",
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      default: 0.3,
    },
  ],
  uniforms: ["uniform float uLambertAmbient;"],
  body: `
light = uLambertAmbient + (1.0 - uLambertAmbient) * ndl;`,
  apply: (p, u) => {
    u.uLambertAmbient.value = p.ambient;
  },
};
