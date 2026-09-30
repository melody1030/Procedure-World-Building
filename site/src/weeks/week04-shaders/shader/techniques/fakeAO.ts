import type { TechniqueModule } from "../technique";

export const fakeAO: TechniqueModule = {
  type: "fakeAO",
  stage: "surface",
  name: "Fake AO",
  summary:
    "Darkens each object near its base, which looks like the soft shadow where it meets the ground (ambient occlusion). It is really a height gradient: no light is traced. The ground itself is left alone.",
  formula: "ao = mix(1 - strength, 1, smoothstep(0, height, aboveBase))\ncol *= ao",
  params: [
    {
      key: "strength",
      label: "Strength",
      description: "How dark the base of each object gets.",
      kind: "range",
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      default: 0.45,
    },
    {
      key: "height",
      label: "Height",
      description: "How far up from the base the darkening reaches.",
      kind: "range",
      min: 0.05,
      max: 2,
      step: 0.05,
      decimals: 2,
      default: 0.6,
    },
  ],
  uniforms: ["uniform float uAoStrength;", "uniform float uAoHeight;"],
  body: `
// Height above the object's own base, from its bounding box. vOcclude is 0 on the ground.
float ao = mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, uAoHeight, vAboveBase));
ao = mix(1.0, ao, vOcclude);
col *= ao;`,
  apply: (p, u) => {
    u.uAoStrength.value = p.strength;
    u.uAoHeight.value = p.height;
  },
};
