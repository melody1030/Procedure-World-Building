import { useReducer } from "react";
import { DEFAULT_LAYERS, LAYER_IDS, PARTICLE_MODES, METHODS, TERRAIN_VIEWS, defaults, initialState } from "./config";
import type { LayerId, LayerParams, ParticleParams, PathParams, TerrainParams, Week05State } from "./types";

type Action =
  | { type: "terrain"; patch: Partial<TerrainParams> }
  | { type: "selectLayer"; layer: LayerId }
  | { type: "layer"; patch: Partial<LayerParams> }
  | { type: "resetLayer" }
  | { type: "paths"; patch: Partial<PathParams> }
  | { type: "particles"; patch: Partial<ParticleParams> }
  | { type: "load"; state: Week05State };

function reducer(state: Week05State, action: Action): Week05State {
  switch (action.type) {
    case "terrain":
      return { ...state, terrain: { ...state.terrain, ...action.patch } };
    case "selectLayer":
      return { ...state, layer: action.layer };
    case "layer":
      return { ...state, layers: { ...state.layers, [state.layer]: { ...state.layers[state.layer], ...action.patch } } };
    case "resetLayer":
      return { ...state, layers: { ...state.layers, [state.layer]: { ...DEFAULT_LAYERS[state.layer] } } };
    case "paths":
      return { ...state, paths: { ...state.paths, ...action.patch } };
    case "particles":
      return { ...state, particles: { ...state.particles, ...action.patch } };
    case "load":
      return action.state;
  }
}

const merge = <T extends object>(fallback: T, raw: unknown): T => (raw && typeof raw === "object" ? { ...fallback, ...(raw as Partial<T>) } : { ...fallback });

/** Rebuilds a saved configuration, dropping anything unknown and filling in missing values. */
export function sanitize(raw: unknown): Week05State {
  const fallback = initialState();
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Partial<Week05State>;
  const layers = { ...fallback.layers };
  for (const id of LAYER_IDS) {
    layers[id] = merge(DEFAULT_LAYERS[id], data.layers?.[id]);
    if (!(layers[id].method in METHODS)) layers[id].method = DEFAULT_LAYERS[id].method;
  }
  const terrain = merge(defaults.terrain, data.terrain);
  if (!(terrain.view in TERRAIN_VIEWS)) terrain.view = defaults.terrain.view;
  if (typeof terrain.seed !== "string" || terrain.seed.length === 0) terrain.seed = defaults.terrain.seed;
  const particles = merge(defaults.particles, data.particles);
  if (!(particles.mode in PARTICLE_MODES)) particles.mode = defaults.particles.mode;
  return {
    terrain,
    layer: data.layer && LAYER_IDS.includes(data.layer) ? data.layer : fallback.layer,
    layers,
    paths: merge(defaults.paths, data.paths),
    particles,
  };
}

export function useWeek05State() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  return {
    state,
    setTerrain: (patch: Partial<TerrainParams>) => dispatch({ type: "terrain", patch }),
    selectLayer: (layer: LayerId) => dispatch({ type: "selectLayer", layer }),
    setLayer: (patch: Partial<LayerParams>) => dispatch({ type: "layer", patch }),
    resetLayer: () => dispatch({ type: "resetLayer" }),
    setPaths: (patch: Partial<PathParams>) => dispatch({ type: "paths", patch }),
    setParticles: (patch: Partial<ParticleParams>) => dispatch({ type: "particles", patch }),
    load: (next: Week05State) => dispatch({ type: "load", state: next }),
  };
}

export type Week05Controller = ReturnType<typeof useWeek05State>;
