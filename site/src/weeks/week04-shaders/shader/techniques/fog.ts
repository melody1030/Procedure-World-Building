import { setColor } from "../technique";
import type { TechniqueModule } from "../technique";

export const fog: TechniqueModule = {
  type: "fog",
  stage: "atmosphere",
  name: "Distance fog",
  summary:
    "Fades each pixel towards the fog color the further it is from the camera. It runs last, so it covers everything the stages before it did. The background switches to the fog color so far things dissolve into it.",
  formula: "f = 1 - exp(-distance * density)\ncol = mix(col, fogColor, f)",
  params: [
    {
      key: "density",
      label: "Density",
      description: "How quickly things fade with distance.",
      kind: "range",
      min: 0,
      max: 0.25,
      step: 0.005,
      decimals: 3,
      default: 0.05,
    },
    {
      key: "color",
      label: "Color",
      description: "The color everything fades towards. The background matches it.",
      kind: "color",
      default: "#0a0f17",
    },
  ],
  uniforms: ["uniform float uFogDensity;", "uniform vec3 uFogColor;"],
  body: `
// Exponential fog: 0 at the camera, approaching 1 far away.
float fogF = 1.0 - exp(-length(cameraPosition - vWorldPos) * uFogDensity);
col = mix(col, uFogColor, fogF);`,
  apply: (p, u) => {
    u.uFogDensity.value = p.density;
    setColor(u, "uFogColor", p.color);
  },
};
