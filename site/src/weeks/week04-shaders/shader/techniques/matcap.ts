import type { TechniqueModule } from "../technique";

export const MATCAP_PRESETS = [
  { value: "clay", label: "Clay" },
  { value: "glossy", label: "Glossy plastic" },
  { value: "toon", label: "Toon" },
  { value: "pearl", label: "Pearl" },
];

export const matcap: TechniqueModule = {
  type: "matcap",
  stage: "base",
  name: "Matcap",
  summary:
    "Looks up each pixel's color in a picture of a lit sphere, using the direction its surface faces on screen. The light is already painted into the picture, so the lighting stage is skipped. Orbit the camera: the light turns with you.",
  formula: "uv = viewNormal.xy * 0.5 + 0.5\nalbedo = texture(matcap, uv)",
  params: [
    {
      key: "preset",
      label: "Preset",
      description: "The lit-sphere picture used for the lookup.",
      kind: "select",
      options: MATCAP_PRESETS,
      default: "clay",
    },
  ],
  uniforms: ["uniform sampler2D uMatcap;"],
  body: `
// The view-space normal points at a spot on the lit-sphere picture.
vec2 matcapUv = normalize(vViewNormal).xy * 0.5 + 0.5;
albedo = texture2D(uMatcap, matcapUv).rgb;`,
  // The texture is swapped by the viewport, which owns the matcap textures.
  apply: () => {},
};
