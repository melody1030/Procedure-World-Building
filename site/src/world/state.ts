import { useReducer } from "react";
import { DEFAULT_PARAMS, type ParamGroup, type ParamKey, type TerrainParams } from "./terrain/params";

export const DEFAULT_SEED = "blueprint";
export const MAX_SEED_LENGTH = 32;

export interface WorldState {
  seed: string;
  /** Changing a parameter regenerates from the stage that reads it. */
  params: TerrainParams;
  /** Draw the river's control points and curve over the terrain. */
  showPath: boolean;
  /** Tint the ground by what owns each column (river, bank, roads…). */
  showClaims: boolean;
  /** Draw the town's hubs (and later its streets) and tint the ground by hub suitability. */
  showNetwork: boolean;
  /** Tint the ground by district. */
  showDistricts: boolean;
  /** Outline the lots. */
  showLots: boolean;
  showParks: boolean;
}

type Action =
  | { type: "setSeed"; seed: string }
  | { type: "setParam"; group: ParamGroup; patch: Partial<TerrainParams[ParamGroup]> }
  | { type: "resetParams"; keys: ParamKey[] }
  | { type: "setShowPath"; on: boolean }
  | { type: "setShowClaims"; on: boolean }
  | { type: "setShowNetwork"; on: boolean }
  | { type: "setShowDistricts"; on: boolean }
  | { type: "setShowLots"; on: boolean }
  | { type: "setShowParks"; on: boolean }
  | { type: "setRiverControl"; control: TerrainParams["river"]["control"] };

function reducer(state: WorldState, action: Action): WorldState {
  switch (action.type) {
    case "setSeed":
      // Hand-placed river points belong to one terrain, so a new seed starts from the rules again.
      return action.seed === state.seed ? state : { ...state, seed: action.seed, params: { ...state.params, river: { ...state.params.river, control: null } } };
    case "setParam": {
      const group = { ...state.params[action.group], ...action.patch };
      // A different number of river points can't keep the dragged ones.
      if (action.group === "river" && "points" in action.patch) (group as TerrainParams["river"]).control = null;
      return { ...state, params: { ...state.params, [action.group]: group } };
    }
    case "resetParams": {
      const params = { ...state.params } as Record<ParamGroup, Record<string, unknown>>;
      for (const [g, key] of action.keys) params[g] = { ...params[g], [key]: (DEFAULT_PARAMS[g] as unknown as Record<string, unknown>)[key] };
      return { ...state, params: params as unknown as TerrainParams };
    }
    case "setShowPath":
      return { ...state, showPath: action.on };
    case "setShowClaims":
      return { ...state, showClaims: action.on };
    case "setShowNetwork":
      return { ...state, showNetwork: action.on };
    case "setShowDistricts":
      return { ...state, showDistricts: action.on };
    case "setShowLots":
      return { ...state, showLots: action.on };
    case "setShowParks":
      return { ...state, showParks: action.on };
    case "setRiverControl":
      return { ...state, params: { ...state.params, river: { ...state.params.river, control: action.control } } };
  }
}

/** Cleans typed seed text; empty falls back to the default seed. */
export function cleanSeed(raw: string): string {
  return raw.trim().slice(0, MAX_SEED_LENGTH) || DEFAULT_SEED;
}

/** The seed lives in the URL (`/world?seed=harbor`) so any terrain can be shared as a link. */
function seedFromUrl(): string {
  return cleanSeed(new URLSearchParams(window.location.search).get("seed") ?? "");
}

/** Overlays to start with, also from the URL (`/world?show=districts,lots,parks`), so a view can be linked. */
function shownFromUrl(name: string): boolean {
  return (new URLSearchParams(window.location.search).get("show") ?? "").split(",").includes(name);
}

export function useWorldState() {
  const [state, dispatch] = useReducer(reducer, undefined, (): WorldState => ({
    seed: seedFromUrl(),
    params: DEFAULT_PARAMS,
    showPath: shownFromUrl("path"),
    showClaims: shownFromUrl("claims"),
    showNetwork: shownFromUrl("network"),
    showDistricts: shownFromUrl("districts"),
    showLots: shownFromUrl("lots"),
    showParks: shownFromUrl("parks"),
  }));
  return {
    state,
    setSeed: (seed: string) => dispatch({ type: "setSeed", seed: cleanSeed(seed) }),
    setParam: <G extends ParamGroup>(group: G, patch: Partial<TerrainParams[G]>) => dispatch({ type: "setParam", group, patch }),
    resetParams: (keys: ParamKey[]) => dispatch({ type: "resetParams", keys }),
    setShowPath: (on: boolean) => dispatch({ type: "setShowPath", on }),
    setShowClaims: (on: boolean) => dispatch({ type: "setShowClaims", on }),
    setShowNetwork: (on: boolean) => dispatch({ type: "setShowNetwork", on }),
    setShowDistricts: (on: boolean) => dispatch({ type: "setShowDistricts", on }),
    setShowLots: (on: boolean) => dispatch({ type: "setShowLots", on }),
    setShowParks: (on: boolean) => dispatch({ type: "setShowParks", on }),
    setRiverControl: (control: TerrainParams["river"]["control"]) => dispatch({ type: "setRiverControl", control }),
  };
}

export type WorldController = ReturnType<typeof useWorldState>;
