import { useReducer } from "react";
import { DEFAULT_VIEWPORT, TECHNIQUES, allDefaultParams, defaultParams, initialState } from "./config";
import { MATCAP_PRESETS } from "./shader/techniques/matcap";
import type { ParamValue, StudioState, TechniqueType, ViewportSettings } from "./types";

type Action =
  | { type: "select"; technique: TechniqueType }
  | { type: "setParam"; key: string; value: ParamValue }
  | { type: "resetParams" }
  | { type: "setViewport"; patch: Partial<ViewportSettings> }
  | { type: "load"; state: StudioState };

function reducer(state: StudioState, action: Action): StudioState {
  switch (action.type) {
    case "select":
      return { ...state, technique: action.technique };
    case "setParam":
      return { ...state, params: { ...state.params, [state.technique]: { ...state.params[state.technique], [action.key]: action.value } } };
    case "resetParams":
      return { ...state, params: { ...state.params, [state.technique]: defaultParams(state.technique) } };
    case "setViewport":
      return { ...state, viewport: { ...state.viewport, ...action.patch } };
    case "load":
      return action.state;
  }
}

/** Rebuilds a saved configuration, dropping anything unknown and filling in missing values. */
export function sanitize(raw: unknown): StudioState {
  const fallback = initialState();
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Partial<StudioState>;
  const params = allDefaultParams();
  if (data.params && typeof data.params === "object") {
    for (const type of Object.keys(params) as TechniqueType[]) params[type] = { ...params[type], ...(data.params[type] ?? {}) };
  }
  // Presets that no longer exist fall back to the default one.
  if (!MATCAP_PRESETS.some((p) => p.value === params.matcap.preset)) params.matcap.preset = defaultParams("matcap").preset;
  return {
    technique: data.technique && data.technique in TECHNIQUES ? data.technique : fallback.technique,
    params,
    viewport: {
      lightAzimuth: data.viewport?.lightAzimuth ?? DEFAULT_VIEWPORT.lightAzimuth,
      lightElevation: data.viewport?.lightElevation ?? DEFAULT_VIEWPORT.lightElevation,
    },
  };
}

export function useStudioState() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return {
    state,
    select: (technique: TechniqueType) => dispatch({ type: "select", technique }),
    setParam: (key: string, value: ParamValue) => dispatch({ type: "setParam", key, value }),
    resetParams: () => dispatch({ type: "resetParams" }),
    setViewport: (patch: Partial<ViewportSettings>) => dispatch({ type: "setViewport", patch }),
    load: (next: StudioState) => dispatch({ type: "load", state: next }),
  };
}

export type StudioController = ReturnType<typeof useStudioState>;
