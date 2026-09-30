import { setColor } from "../technique";
import type { TechniqueModule } from "../technique";

const showsSteepness = (p: Record<string, unknown>) => p.view === "steepness";

export const slope: TechniqueModule = {
  type: "slope",
  stage: "base",
  name: "Slope",
  summary:
    "Colors each surface by how steep it is, from the y part of its normal: 1 on flat ground, 0 on a wall. Past the threshold, the flat color turns into the steep one, like grass giving way to rock on a hillside. Boxes only have flat tops and straight walls, so the hill shows the blend best. Aspect instead colors each slope by the compass direction it faces.",
  formula: "steep = 1 - normal.y\ncolor = mix(flat, steep, smoothstep(t - s, t + s, steep))",
  params: [
    {
      key: "view",
      label: "Show",
      description: "Steepness is how tilted a surface is. Aspect is which compass direction a slope faces.",
      kind: "select",
      options: [
        { value: "steepness", label: "Steepness (flat to steep)" },
        { value: "aspect", label: "Aspect (facing direction)" },
      ],
      default: "steepness",
    },
    { key: "threshold", label: "Threshold", description: "How steep a surface must be before it turns to the steep color.", kind: "range", min: 0.05, max: 0.95, step: 0.01, decimals: 2, default: 0.35, visibleIf: showsSteepness },
    { key: "softness", label: "Softness", description: "How wide the blend between the two colors is.", kind: "range", min: 0.01, max: 0.4, step: 0.01, decimals: 2, default: 0.08, visibleIf: showsSteepness },
    { key: "flatColor", label: "Flat color", description: "The color of level ground.", kind: "color", default: "#5fa391", visibleIf: showsSteepness },
    { key: "steepColor", label: "Steep color", description: "The color of steep slopes and walls.", kind: "color", default: "#8b8394", visibleIf: showsSteepness },
  ],
  uniforms: ["uniform int uSlopeView;", "uniform float uSlopeThreshold;", "uniform float uSlopeSoftness;", "uniform vec3 uSlopeFlat;", "uniform vec3 uSlopeSteep;"],
  functions: `
// A hue from 0 to 1 as a fully saturated color, for the aspect view.
vec3 slopeHue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}`,
  body: `
// 0 on flat ground, 1 on a vertical wall.
float steep = 1.0 - clamp(N.y, 0.0, 1.0);
if (uSlopeView == 0) {
  float rock = smoothstep(uSlopeThreshold - uSlopeSoftness, uSlopeThreshold + uSlopeSoftness, steep);
  albedo = mix(uSlopeFlat, uSlopeSteep, rock);
} else {
  // Aspect: the direction the slope faces around the compass, as a hue. Flat ground faces
  // nowhere, so it stays grey.
  float aspect = atan(N.z, N.x) / 6.28318 + 0.5;
  albedo = mix(vec3(0.55), slopeHue(aspect) * 0.85, smoothstep(0.02, 0.15, steep));
}`,
  apply: (p, u) => {
    u.uSlopeView.value = p.view === "aspect" ? 1 : 0;
    u.uSlopeThreshold.value = p.threshold;
    u.uSlopeSoftness.value = p.softness;
    setColor(u, "uSlopeFlat", p.flatColor);
    setColor(u, "uSlopeSteep", p.steepColor);
  },
};
