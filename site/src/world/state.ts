import { useReducer } from "react";
import { GROUND_OVERLAYS, defaultLayers, type LayerId, type LayerVisibility } from "./layers";
import { DEFAULT_PARAMS, moodRender, type ParamGroup, type ParamKey, type RenderParams, type WorldParams } from "./params";
import type { MoodId } from "./render/effects";

export const DEFAULT_SEED = "blueprint";
export const MAX_SEED_LENGTH = 32;

export interface WorldState {
  seed: string;
  /** Generation parameters: changing one regenerates from the stage that reads it. */
  params: WorldParams;
  /** Renderer settings: applied live, nothing regenerates. */
  render: RenderParams;
  layers: LayerVisibility;
  /** Growth timeline, 0–1. The world opens finished (1); the timeline is there to replay it. */
  growth: number;
  playing: boolean;
}

type Action =
  | { type: "setSeed"; seed: string }
  | { type: "setParam"; group: ParamGroup; patch: Partial<WorldParams[ParamGroup]> }
  | { type: "resetParams"; keys: ParamKey[] }
  | { type: "setRender"; patch: Partial<RenderParams> }
  | { type: "setMood"; mood: MoodId }
  | { type: "toggleLayer"; id: LayerId }
  | { type: "setGrowth"; growth: number }
  | { type: "setPlaying"; playing: boolean };

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
    case "setRender":
      return { ...state, render: { ...state.render, ...action.patch } };
    case "setMood":
      // A mood is a preset: it sets every render setting, which can then be tuned one by one.
      return { ...state, render: moodRender(action.mood) };
    case "toggleLayer": {
      const on = !state.layers[action.id];
      const layers = { ...state.layers, [action.id]: on };
      if (on && GROUND_OVERLAYS.includes(action.id)) for (const other of GROUND_OVERLAYS) if (other !== action.id) layers[other] = false;
      return { ...state, layers };
    }
    case "setGrowth":
      return { ...state, growth: Math.min(1, Math.max(0, action.growth)) };
    case "setPlaying":
      return { ...state, playing: action.playing, growth: action.playing && state.growth >= 1 ? 0 : state.growth };
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
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    (): WorldState => ({
      seed: seedFromUrl(),
      params: DEFAULT_PARAMS,
      render: moodRender("rain"),
      layers: defaultLayers(),
      growth: 1,
      playing: false,
    }),
  );
  return {
    state,
    setSeed: (seed: string) => dispatch({ type: "setSeed", seed: cleanSeed(seed) }),
    setParam: <G extends ParamGroup>(group: G, patch: Partial<WorldParams[G]>) => dispatch({ type: "setParam", group, patch }),
    resetParams: (keys: ParamKey[]) => dispatch({ type: "resetParams", keys }),
    setRender: (patch: Partial<RenderParams>) => dispatch({ type: "setRender", patch }),
    setMood: (mood: MoodId) => dispatch({ type: "setMood", mood }),
    toggleLayer: (id: LayerId) => dispatch({ type: "toggleLayer", id }),
    setGrowth: (growth: number) => dispatch({ type: "setGrowth", growth }),
    setPlaying: (playing: boolean) => dispatch({ type: "setPlaying", playing }),
  };
}

export type WorldController = ReturnType<typeof useWorldState>;
