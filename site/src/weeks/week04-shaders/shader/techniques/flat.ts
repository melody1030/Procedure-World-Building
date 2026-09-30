import { setColor } from "../technique";
import type { TechniqueModule } from "../technique";

export const flat: TechniqueModule = {
  type: "flat",
  stage: "base",
  name: "Flat",
  summary:
    "Every pixel gets the same color. With no lighting after it, shapes read only as silhouettes. It is the baseline to compare every other technique against.",
  formula: "albedo = uColor",
  params: [
    {
      key: "color",
      label: "Color",
      description: "The one color every surface gets.",
      kind: "color",
      default: "#7fb5d6",
    },
  ],
  uniforms: ["uniform vec3 uFlatColor;"],
  body: `
albedo = uFlatColor;`,
  apply: (p, u) => setColor(u, "uFlatColor", p.color),
};
