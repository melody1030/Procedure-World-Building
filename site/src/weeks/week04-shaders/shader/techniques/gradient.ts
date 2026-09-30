import { setColor } from "../technique";
import type { TechniqueModule } from "../technique";

/** In the same order as the `curve` switch in the GLSL below. */
export const GRADIENT_CURVES = [
  { value: "linear", label: "Linear" },
  { value: "smoothstep", label: "Smoothstep" },
  { value: "expo", label: "Expo" },
  { value: "parabola", label: "Parabola" },
  { value: "pulse", label: "Cubic pulse" },
];

/** The same curves in JavaScript, for the plot under the Curve dropdown. */
export function gradientCurve(curve: string, t: number): number {
  if (curve === "smoothstep") return t * t * (3 - 2 * t);
  if (curve === "expo") return Math.pow(t, 5);
  if (curve === "parabola") return 4 * t * (1 - t);
  if (curve === "pulse") {
    const x = Math.abs(t - 0.5) / 0.35;
    return x > 1 ? 0 : 1 - x * x * (3 - 2 * x);
  }
  return t;
}

export const gradient: TechniqueModule = {
  type: "gradient",
  stage: "base",
  name: "Position gradient",
  summary:
    "Takes each pixel's height, remaps it to 0 to 1 and uses it to blend two colors. World space measures height in the scene, so the ramp spans everything. Local space measures it inside each object, so every object gets its own ramp.",
  formula: "t = curve(height / range)\nalbedo = mix(colorA, colorB, t)",
  params: [
    {
      key: "space",
      label: "Space",
      description: "Where the height is measured: across the whole scene, or inside each object.",
      kind: "select",
      options: [
        { value: "world", label: "World (whole scene)" },
        { value: "local", label: "Local (each object)" },
      ],
      default: "world",
    },
    {
      key: "curve",
      label: "Curve",
      description: "Reshapes the 0 to 1 height before it picks a color, which moves where the color changes.",
      kind: "select",
      options: GRADIENT_CURVES,
      default: "smoothstep",
    },
    {
      key: "range",
      label: "Range",
      description: "The height where the ramp reaches color B, as a share of the tallest object.",
      kind: "range",
      min: 0.2,
      max: 2,
      step: 0.05,
      decimals: 2,
      default: 1,
    },
    {
      key: "colorA",
      label: "Color A",
      description: "The color at the bottom.",
      kind: "color",
      default: "#1d3a52",
    },
    {
      key: "colorB",
      label: "Color B",
      description: "The color at the top.",
      kind: "color",
      default: "#a5d4ee",
    },
  ],
  uniforms: [
    "uniform float uSceneHeight;",
    "uniform int uGradientSpace;",
    "uniform int uGradientCurve;",
    "uniform float uGradientRange;",
    "uniform vec3 uGradientA;",
    "uniform vec3 uGradientB;",
  ],
  functions: `
// Shaping curves: each takes 0 to 1 and returns 0 to 1 with a different feel.
float shapeCurve(float t, int curve) {
  if (curve == 1) return smoothstep(0.0, 1.0, t);
  if (curve == 2) return pow(t, 5.0);
  if (curve == 3) return 4.0 * t * (1.0 - t);
  if (curve == 4) {
    float x = abs(t - 0.5) / 0.35;
    return x > 1.0 ? 0.0 : 1.0 - x * x * (3.0 - 2.0 * x);
  }
  return t;
}`,
  body: `
// 0 at the bottom, 1 at the top: of the whole scene (world) or of this object (local).
float gradHeight = uGradientSpace == 0 ? vWorldPos.y / uSceneHeight : vLocalHeight;
float gradT = shapeCurve(clamp(gradHeight / uGradientRange, 0.0, 1.0), uGradientCurve);
albedo = mix(uGradientA, uGradientB, gradT);`,
  apply: (p, u) => {
    u.uGradientSpace.value = p.space === "world" ? 0 : 1;
    u.uGradientCurve.value = Math.max(
      0,
      GRADIENT_CURVES.findIndex((c) => c.value === p.curve),
    );
    u.uGradientRange.value = p.range;
    setColor(u, "uGradientA", p.colorA);
    setColor(u, "uGradientB", p.colorB);
  },
};
