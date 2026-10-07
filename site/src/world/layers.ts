/**
 * Layers the viewer can switch on and off. The world layers make up the finished diorama; the
 * overlay layers show the rules behind it. Terraces, Suitability and Districts all colour the
 * ground, so only one of them is on at a time.
 */

export type LayerId = "terrain" | "water" | "city" | "weather" | "levels" | "suitability" | "districts";

export interface LayerInfo {
  id: LayerId;
  label: string;
  description: string;
  kind: "world" | "overlay";
  defaultOn: boolean;
}

export const LAYERS: LayerInfo[] = [
  { id: "terrain", label: "Terrain", description: "The island: terraced voxel ground, one storey per step.", kind: "world", defaultOn: true },
  { id: "water", label: "Water", description: "The sea (a mirror for the city's lights), the river, its waterfalls and any lakes.", kind: "world", defaultOn: true },
  { id: "city", label: "City", description: "Roads, buildings, bridges, the rail, props and traffic.", kind: "world", defaultOn: true },
  { id: "weather", label: "Weather", description: "Rain and haze.", kind: "world", defaultOn: true },
  { id: "levels", label: "Terraces", description: "Colours the ground by terrace level, from the shore (dark) to the top (bright).", kind: "overlay", defaultOn: false },
  {
    id: "suitability",
    label: "Suitability",
    description: "The planning scanner: how good each spot is to build on (room on the terrace, near water, low ground). Bright = best.",
    kind: "overlay",
    defaultOn: false,
  },
  {
    id: "districts",
    label: "Districts",
    description: "Worley cells and their roles: core (pink), residential (cyan), industrial (amber), waterfront (blue), green (mint).",
    kind: "overlay",
    defaultOn: false,
  },
];

/** Overlays that colour the ground: turning one on turns the others off. */
export const GROUND_OVERLAYS: LayerId[] = ["levels", "suitability", "districts"];

export type LayerVisibility = Record<LayerId, boolean>;

export function defaultLayers(): LayerVisibility {
  return Object.fromEntries(LAYERS.map((layer) => [layer.id, layer.defaultOn])) as LayerVisibility;
}
