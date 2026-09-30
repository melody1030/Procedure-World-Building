export type TechniqueType = "ripple" | "flat" | "gradient" | "slope" | "matcap" | "lambert" | "toon" | "fakeAO" | "fresnel" | "fog";

/** Where a technique runs in the shader. Used to group the dropdown and to decide what helpers it needs. */
export type Stage = "shape" | "base" | "lighting" | "surface" | "atmosphere";

export type ParamValue = number | string | boolean;

export type TechniqueParams = Record<string, ParamValue>;

export interface ViewportSettings {
  /** Degrees around the vertical axis. */
  lightAzimuth: number;
  /** Degrees above the horizon. */
  lightElevation: number;
}

export interface StudioState {
  /** The one technique on show. */
  technique: TechniqueType;
  /** Every technique's settings, kept while switching so tweaks are not lost. */
  params: Record<TechniqueType, TechniqueParams>;
  viewport: ViewportSettings;
}
