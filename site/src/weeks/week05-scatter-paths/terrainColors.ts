import * as THREE from "three";
import { smoothstep } from "../../world/noise";
import { GRID } from "./config";
import type { PathsResult } from "./paths";
import { checkRules, layerSeed, patchChance } from "./scatter";
import { gridCoord, normalAt, normalizedHeight, type Heightmap } from "./terrain";
import type { Week05State } from "./types";

/** Scene colours (STYLE_GUIDE section 3.3). */
const NATURAL = ["#22382f", "#3f5c45", "#6d7a5a", "#9a9aa6"].map((c) => new THREE.Color(c));
const NATURAL_ROCK = new THREE.Color("#5b5866");
const RIVER_BANK = new THREE.Color("#1f2d33");
const HEIGHT_RAMP = ["#0f1e33", "#155e75", "#06b6d4", "#67e8f9", "#f0fdff"].map((c) => new THREE.Color(c));
const SLOPE_FLAT = new THREE.Color("#5fa391");
const SLOPE_STEEP = new THREE.Color("#8b8394");
const MASK_ALLOWED = new THREE.Color("#22d3ee");
const MASK_BASE = new THREE.Color("#12202b");
const MASK_SLOPE = new THREE.Color("#fbbf24").multiplyScalar(0.55);
const MASK_HEIGHT = new THREE.Color("#334155");
const MASK_PATH = new THREE.Color("#f472b6").multiplyScalar(0.55);

function ramp(stops: THREE.Color[], t: number, out: THREE.Color): THREE.Color {
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return out.copy(stops[i]).lerp(stops[i + 1], x - i);
}

/** Vertex colours for the terrain in the chosen view, written into `out` (GRID * GRID * 3). */
export function writeTerrainColors(out: Float32Array, map: Heightmap, paths: PathsResult, state: Week05State) {
  const color = new THREE.Color();
  const normal = [0, 1, 0];
  const view = state.terrain.view;
  const layer = state.layers[state.layer];
  // The layer's own seed, so the mask shows the patches the layer really uses.
  const seed = layerSeed(state.layer, state.terrain.seed);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const v = j * GRID + i;
      const x = gridCoord(i);
      const z = gridCoord(j);
      normalAt(map, x, z, normal);
      const slope = (Math.acos(Math.min(1, normal[1])) * 180) / Math.PI;
      const h = normalizedHeight(map, map.heights[v]);

      if (view === "height") ramp(HEIGHT_RAMP, h, color);
      else if (view === "slope") color.copy(SLOPE_FLAT).lerp(SLOPE_STEEP, Math.min(1, slope / 50));
      else if (view === "mask") {
        const reason = checkRules(layer, map, paths, state.paths, x, z, normal);
        if (reason === "path") color.copy(MASK_PATH);
        else if (reason === "slope") color.copy(MASK_SLOPE);
        else if (reason === "height") color.copy(MASK_HEIGHT);
        else {
          const chance = layer.method === "noise" ? patchChance(layer, seed, x, z) : 1;
          color.copy(MASK_BASE).lerp(MASK_ALLOWED, 0.25 + 0.75 * chance);
        }
      } else {
        ramp(NATURAL, h, color);
        color.lerp(NATURAL_ROCK, smoothstep(26, 42, slope));
        if (paths.river) color.lerp(RIVER_BANK, 1 - smoothstep(paths.river.halfWidth, paths.river.halfWidth + state.paths.falloff, paths.riverDist[v]));
      }
      out[v * 3] = color.r;
      out[v * 3 + 1] = color.g;
      out[v * 3 + 2] = color.b;
    }
  }
}
