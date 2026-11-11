import { useReducer } from "react";
import { DEFAULT_PARAMS, type ParamGroup, type ParamKey, type TerrainParams } from "./terrain/params";

export const DEFAULT_SEED = "blueprint";
export const MAX_SEED_LENGTH = 32;

/**
 * The ground tints: by district, by what each lot fronts (avenue, side street, corner, through),
 * by what owns each column (river, bank, roads…), or by how well each column suits a city center.
 */
export const GROUND_TINTS = ["none", "districts", "frontage", "heights", "claims", "suitability"] as const;
export type GroundTint = (typeof GROUND_TINTS)[number];

export interface WorldState {
  seed: string;
  /** Changing a parameter regenerates from the stage that reads it. */
  params: TerrainParams;
  /** Draw the river's control points and curve over the terrain. */
  showPath: boolean;
  /** What the ground is colored by: one tint at a time, since they all paint the same columns. */
  groundTint: GroundTint;
  /** Draw the street network: the city center's pin, the junctions and the streets' center lines. */
  showNetwork: boolean;
  /** Outline the lots. */
  showLots: boolean;
  showParks: boolean;
  /** Stand the building library's models on the lots. */
  showBuildings: boolean;
  /** Let the people, pigeons and cats out. */
  showLife: boolean;
}

type Action =
  | { type: "setSeed"; seed: string }
  | { type: "setParam"; group: ParamGroup; patch: Partial<TerrainParams[ParamGroup]> }
  | { type: "resetParams"; keys: ParamKey[] }
  | { type: "setShowPath"; on: boolean }
  | { type: "setGroundTint"; tint: GroundTint }
  | { type: "setShowNetwork"; on: boolean }
  | { type: "setShowLots"; on: boolean }
  | { type: "setShowParks"; on: boolean }
  | { type: "setShowBuildings"; on: boolean }
  | { type: "setShowLife"; on: boolean }
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
    case "setGroundTint":
      return { ...state, groundTint: action.tint };
    case "setShowNetwork":
      return { ...state, showNetwork: action.on };
    case "setShowLots":
      return { ...state, showLots: action.on };
    case "setShowParks":
      return { ...state, showParks: action.on };
    case "setShowBuildings":
      return { ...state, showBuildings: action.on };
    case "setShowLife":
      return { ...state, showLife: action.on };
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

/**
 * Overlays to start with, also from the URL (`/world?show=districts,lots,parks`), so a view can be
 * linked. A tint's name (districts, claims, suitability) picks the ground tint; the first one wins.
 */
function shownFromUrl(name: string): boolean {
  return (new URLSearchParams(window.location.search).get("show") ?? "").split(",").includes(name);
}

export function useWorldState() {
  const [state, dispatch] = useReducer(reducer, undefined, (): WorldState => ({
    seed: seedFromUrl(),
    params: DEFAULT_PARAMS,
    showPath: shownFromUrl("path"),
    groundTint: GROUND_TINTS.find((t) => t !== "none" && shownFromUrl(t)) ?? "none",
    showNetwork: shownFromUrl("network"),
    showLots: shownFromUrl("lots"),
    showParks: shownFromUrl("parks"),
    showBuildings: !(new URLSearchParams(window.location.search).get("hide") ?? "").split(",").includes("buildings"),
    showLife: !(new URLSearchParams(window.location.search).get("hide") ?? "").split(",").includes("life"),
  }));
  return {
    state,
    setSeed: (seed: string) => dispatch({ type: "setSeed", seed: cleanSeed(seed) }),
    setParam: <G extends ParamGroup>(group: G, patch: Partial<TerrainParams[G]>) => dispatch({ type: "setParam", group, patch }),
    resetParams: (keys: ParamKey[]) => dispatch({ type: "resetParams", keys }),
    setShowPath: (on: boolean) => dispatch({ type: "setShowPath", on }),
    setGroundTint: (tint: GroundTint) => dispatch({ type: "setGroundTint", tint }),
    setShowNetwork: (on: boolean) => dispatch({ type: "setShowNetwork", on }),
    setShowLots: (on: boolean) => dispatch({ type: "setShowLots", on }),
    setShowParks: (on: boolean) => dispatch({ type: "setShowParks", on }),
    setShowBuildings: (on: boolean) => dispatch({ type: "setShowBuildings", on }),
    setShowLife: (on: boolean) => dispatch({ type: "setShowLife", on }),
    setRiverControl: (control: TerrainParams["river"]["control"]) => dispatch({ type: "setRiverControl", control }),
  };
}

export type WorldController = ReturnType<typeof useWorldState>;
