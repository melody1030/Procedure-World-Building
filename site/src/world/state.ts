import { useReducer } from "react";
import { DEFAULT_PARAMS, type ParamGroup, type ParamKey, type WorldParams } from "./params";

export const DEFAULT_SEED = "blueprint";
export const MAX_SEED_LENGTH = 32;

export interface WorldState {
  seed: string;
  /** Generation parameters: changing one regenerates from the stage that reads it. */
  params: WorldParams;
  /** Colour the ground by terrace level. */
  terraces: boolean;
}

type Action =
  | { type: "setSeed"; seed: string }
  | { type: "setParam"; group: ParamGroup; patch: Partial<WorldParams[ParamGroup]> }
  | { type: "resetParams"; keys: ParamKey[] }
  | { type: "setTerraces"; on: boolean };

function reducer(state: WorldState, action: Action): WorldState {
  switch (action.type) {
    case "setSeed":
      return action.seed === state.seed ? state : { ...state, seed: action.seed };
    case "setParam":
      return { ...state, params: { ...state.params, [action.group]: { ...state.params[action.group], ...action.patch } } };
    case "resetParams": {
      const params = { ...state.params } as Record<ParamGroup, Record<string, unknown>>;
      for (const [g, key] of action.keys) params[g] = { ...params[g], [key]: (DEFAULT_PARAMS[g] as unknown as Record<string, unknown>)[key] };
      return { ...state, params: params as unknown as WorldParams };
    }
    case "setTerraces":
      return { ...state, terraces: action.on };
  }
}

/** Cleans typed seed text; empty falls back to the default seed. */
export function cleanSeed(raw: string): string {
  return raw.trim().slice(0, MAX_SEED_LENGTH) || DEFAULT_SEED;
}

/** The seed lives in the URL (`/world?seed=harbor`) so any world can be shared as a link. */
function seedFromUrl(): string {
  return cleanSeed(new URLSearchParams(window.location.search).get("seed") ?? "");
}

export function useWorldState() {
  const [state, dispatch] = useReducer(reducer, undefined, (): WorldState => ({ seed: seedFromUrl(), params: DEFAULT_PARAMS, terraces: false }));
  return {
    state,
    setSeed: (seed: string) => dispatch({ type: "setSeed", seed: cleanSeed(seed) }),
    setParam: <G extends ParamGroup>(group: G, patch: Partial<WorldParams[G]>) => dispatch({ type: "setParam", group, patch }),
    resetParams: (keys: ParamKey[]) => dispatch({ type: "resetParams", keys }),
    setTerraces: (on: boolean) => dispatch({ type: "setTerraces", on }),
  };
}

export type WorldController = ReturnType<typeof useWorldState>;
