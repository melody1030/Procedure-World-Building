import type { TechniqueModule } from "./shader/technique";
import { fakeAO } from "./shader/techniques/fakeAO";
import { flat } from "./shader/techniques/flat";
import { fog } from "./shader/techniques/fog";
import { fresnel } from "./shader/techniques/fresnel";
import { gradient } from "./shader/techniques/gradient";
import { lambert } from "./shader/techniques/lambert";
import { matcap } from "./shader/techniques/matcap";
import { ripple } from "./shader/techniques/ripple";
import { slope } from "./shader/techniques/slope";
import { toon } from "./shader/techniques/toon";
import type { Stage, StudioState, TechniqueParams, TechniqueType, ViewportSettings } from "./types";

export const TECHNIQUES: Record<TechniqueType, TechniqueModule> = {
  ripple,
  flat,
  gradient,
  slope,
  matcap,
  lambert,
  toon,
  fakeAO,
  fresnel,
  fog,
};

export interface StageInfo {
  id: Stage;
  name: string;
}

/** The pipeline stages, in the order a shader runs them. The dropdown is grouped by these. */
export const STAGES: StageInfo[] = [
  { id: "shape", name: "Shape (vertex shader)" },
  { id: "base", name: "Base color" },
  { id: "lighting", name: "Lighting" },
  { id: "surface", name: "Surface" },
  { id: "atmosphere", name: "Atmosphere" },
];

export function defaultParams(type: TechniqueType): TechniqueParams {
  return Object.fromEntries(TECHNIQUES[type].params.map((p) => [p.key, p.default]));
}

export function allDefaultParams(): Record<TechniqueType, TechniqueParams> {
  return Object.fromEntries((Object.keys(TECHNIQUES) as TechniqueType[]).map((type) => [type, defaultParams(type)])) as Record<TechniqueType, TechniqueParams>;
}

export const DEFAULT_VIEWPORT: ViewportSettings = {
  lightAzimuth: 40,
  lightElevation: 50,
};

export function initialState(): StudioState {
  return {
    technique: "gradient",
    params: allDefaultParams(),
    viewport: DEFAULT_VIEWPORT,
  };
}

export const viewportDescriptions = {
  lightAzimuth: "Turns the light around the scene.",
  lightElevation: "Raises or lowers the light above the horizon.",
};
