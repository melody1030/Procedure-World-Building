import type { TechniqueModule } from "../technique";

export const toon: TechniqueModule = {
  type: "toon",
  stage: "lighting",
  name: "Cel / toon",
  summary:
    "The same lighting as Lambert, cut into a few flat bands, like a drawing. Outlines draw every object a second time, slightly inflated and inside out, so only a dark rim shows around it.",
  formula: "band = floor(dot(N, L) * bands) / (bands - 1)",
  params: [
    {
      key: "bands",
      label: "Bands",
      description: "How many flat shades the lighting is cut into.",
      kind: "range",
      min: 2,
      max: 8,
      step: 1,
      decimals: 0,
      default: 4,
    },
    {
      key: "shadowFloor",
      label: "Shadow floor",
      description: "How bright the darkest band is.",
      kind: "range",
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      default: 0.35,
    },
    {
      key: "outlines",
      label: "Outlines",
      description: "Draws a dark rim around every object.",
      kind: "switch",
      default: true,
    },
    {
      key: "outlineWidth",
      label: "Outline width",
      description: "How far the inverted copy is inflated.",
      kind: "range",
      min: 0.005,
      max: 0.06,
      step: 0.005,
      decimals: 3,
      default: 0.02,
      visibleIf: (p) => p.outlines === true,
    },
  ],
  uniforms: ["uniform float uToonBands;", "uniform float uToonFloor;"],
  body: `
// Divide by (bands - 1) so the top band reaches full brightness.
float toonBand = clamp(floor(ndl * uToonBands) / (uToonBands - 1.0), 0.0, 1.0);
light = mix(uToonFloor, 1.0, toonBand);`,
  apply: (p, u) => {
    u.uToonBands.value = p.bands;
    u.uToonFloor.value = p.shadowFloor;
    u.uOutlineWidth.value = p.outlineWidth;
  },
};
