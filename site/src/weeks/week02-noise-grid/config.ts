import type { CameraPreset, NoiseType, ViewMode, Week1State } from "./types";

export const noiseConfig: Record<NoiseType, { label: string; description: string }> = {
  white: {
    label: "White Noise",
    description: "A random value per grid cell with no interpolation — pure static, no spatial structure.",
  },
  perlin: {
    label: "Perlin Noise",
    description: "Smooth gradient noise — the classic organic-looking terrain noise.",
  },
  cellular: {
    label: "Cellular (Worley) Noise",
    description: "Distance to the nearest random feature point per cell — produces cracked, cell-like patterns.",
  },
};

export const viewModeConfig: Record<ViewMode, { label: string; description: string }> = {
  heightmap: {
    label: "Heightmap",
    description: "Flat, height-colored terrain surface — the most readable view of shape and elevation.",
  },
  wireframe: {
    label: "Wireframe",
    description: "Faceted low-poly terrain with a bold grid overlay — useful for inspecting resolution and triangulation.",
  },
};

export const cameraPresetConfig: Record<CameraPreset, { label: string; description: string }> = {
  perspective: {
    label: "Perspective",
    description: "Default elevated three-quarter view of the terrain.",
  },
  top: {
    label: "Top",
    description: "Straight overhead view — good for comparing shape against the 2D noise map.",
  },
  side: {
    label: "Side",
    description: "Horizontal profile view — good for reading height differences.",
  },
};

export const fieldDescriptions = {
  viewMode: "How the 3D terrain surface is rendered.",
  noiseType: "Which noise algorithm generates the underlying pattern.",
  scale: "How zoomed-in the pattern is. Higher values pack in smaller, more frequent features; lower values give broad, sweeping shapes.",
  octaves: "Number of noise layers summed at increasing frequency. More octaves layer finer detail on top of the broad shape.",
  persistence: "How much each added octave contributes relative to the last. Higher persistence keeps fine detail more visible.",
  seed: "Changes the random pattern without changing its overall character — same settings, different result.",
  resolution: "Number of grid subdivisions in the 3D view. Higher resolution shows finer detail but costs more to compute.",
  shapingType: "An optional curve applied to the noise values after generation, to reshape the terrain.",
};

export const defaultWeek1State: Week1State = {
  noiseType: "perlin",
  scale: 3,
  octaves: 4,
  persistence: 0.5,
  seed: 42,
  resolution: 48,
  shapingType: "none",
  amount: 0,
  viewMode: "heightmap",
};
