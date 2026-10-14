/**
 * Every tunable terrain number, grouped by the stage that reads it, with the panel's labels and
 * descriptions. The noise controls keep the noise grid's ranges; the rest follow the noise notes
 * (docs/notes/noise-and-maps-notes.md).
 */

export type NoiseType = "perlin" | "ridged" | "billow" | "cellular" | "white";

export interface TerrainParams {
  noise: {
    type: NoiseType;
    /** Base frequency across the land. */
    scale: number;
    octaves: number;
    persistence: number;
    lacunarity: number;
  };
  shaping: {
    /** Exponent applied to the noise: above 1 flattens lowlands. */
    power: number;
    /** How strongly the noise is folded into ridges; 0 is off. */
    ridge: number;
    /** How high the ground can rise, in meters. */
    height: number;
  };
  terraces: {
    /** How strongly the ground snaps to terrace levels, 0–1. */
    strength: number;
    /** Height of each terrace step, in meters. */
    height: number;
    /** How far terrace edges stray from the contours, in terrace levels. */
    wander: number;
    /** Slopes gentler than this (degrees) stay as voxel stairs; steeper ground becomes terraces. 0 terraces everything. */
    slope: number;
  };
  river: {
    enabled: boolean;
    /** Control points the path is built from. */
    points: number;
    /** Channel width, in meters. */
    width: number;
    /** How far the bed sits below the water, in meters. */
    depth: number;
    /** How far the valley reaches beyond the channel, in meters. */
    valleyWidth: number;
    /** 0: V-shaped valley; 1: flat floor with steep sides. */
    valleyShape: number;
    water: boolean;
    /**
     * Control points placed by hand (dragged in the view), in columns; null lets the rules place
     * them. Cleared when the seed or the number of points changes. Not shown as a control.
     */
    control: { x: number; z: number }[] | null;
  };
  surfaces: {
    /** Brightness spread between the ground's three noise tones (grass, dirt, rock…). */
    tones: number;
    /** A rim with a neighbor at least this much lower (meters) is rock. */
    rockCliff: number;
    /** Ground steeper than this (degrees) is dirt. */
    dirtSlope: number;
    /** Grass covers this share of the land, lowest first; the highest ground above it is rock. */
    grassLimit: number;
  };
  /** How the ground is drawn. Read by the renderer only: changing these never regenerates anything. */
  look: {
    /** Strength of the per-voxel grid lines and tint, 0 off. */
    grid: number;
  };
}

/**
 * The river (Stage 6) is built but hidden until the terrain before it is finished: while this is
 * false, nothing is carved, no water is drawn and its panel section is not shown. Set it to true
 * to bring the river back with all its settings.
 */
export const RIVER_VISIBLE = true;

export type ParamGroup = keyof TerrainParams;
/** One parameter: its group (the stage that reads it) and its name. */
export type ParamKey = { [G in ParamGroup]: [G, keyof TerrainParams[G] & string] }[ParamGroup];

export const DEFAULT_PARAMS: TerrainParams = {
  noise: { type: "perlin", scale: 3, octaves: 5, persistence: 0.5, lacunarity: 2 },
  shaping: { power: 1.3, ridge: 0.2, height: 24 },
  terraces: { strength: 0.3, height: 3, wander: 0.25, slope: 10 },
  river: { enabled: true, points: 8, width: 4, depth: 1, valleyWidth: 7, valleyShape: 0.4, water: true, control: null },
  surfaces: { tones: 0.08, rockCliff: 0.75, dirtSlope: 30, grassLimit: 0.85 },
  look: { grid: 0.35 },
};

/* ---------- Panel descriptions ---------- */

interface SpecBase {
  label: string;
  description: string;
}
export interface RangeSpec extends SpecBase {
  kind: "range";
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}
export interface SelectSpec extends SpecBase {
  kind: "select";
  options: { value: string; label: string; summary: string }[];
}
export interface SwitchSpec extends SpecBase {
  kind: "switch";
}
export type ParamSpec = RangeSpec | SelectSpec | SwitchSpec;

const fixed = (d: number) => (v: number) => v.toFixed(d);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const meters = (v: number) => `${v} m`;

export const NOISE_TYPES: SelectSpec["options"] = [
  { value: "perlin", label: "Perlin", summary: "Smooth gradient noise: rolling hills." },
  { value: "ridged", label: "Ridged", summary: "Each octave folded as 1 − |noise|: sharp crests, soft valleys." },
  { value: "billow", label: "Billow", summary: "Each octave taken as |noise|: rounded hills, creased valleys." },
  { value: "cellular", label: "Cellular (Worley)", summary: "Distance to the nearest random point: cell-shaped basins with raised rims." },
  { value: "white", label: "White", summary: "A random value per cell, no smoothing: static." },
];

/** Panel descriptions for every parameter except the hand-placed river points. */
export const PARAM_SPECS: { [G in ParamGroup]: { [K in Exclude<keyof TerrainParams[G], "control">]: ParamSpec } } = {
  noise: {
    type: { kind: "select", label: "Type", description: "", options: NOISE_TYPES },
    scale: {
      kind: "range",
      label: "Scale",
      description: "Noise frequency across the land. Higher: more, smaller hills. Lower: fewer, broader ones.",
      min: 0.5,
      max: 10,
      step: 0.1,
      format: fixed(1),
    },
    octaves: {
      kind: "range",
      label: "Octaves",
      description: "Layers of noise added together, each finer than the last. More layers add smaller detail.",
      min: 1,
      max: 8,
      step: 1,
      format: fixed(0),
    },
    persistence: {
      kind: "range",
      label: "Persistence",
      description: "Strength of each layer compared with the one before. Higher keeps fine detail stronger.",
      min: 0,
      max: 1,
      step: 0.05,
      format: fixed(2),
    },
    lacunarity: {
      kind: "range",
      label: "Lacunarity",
      description: "Frequency of each layer compared with the one before. Higher makes the fine layers finer.",
      min: 1.5,
      max: 3,
      step: 0.05,
      format: fixed(2),
    },
  },
  shaping: {
    power: {
      kind: "range",
      label: "Power",
      description: "Raises each noise value to this power. Above 1: flatter lowlands, sharper peaks. Below 1: raised lowlands, flatter peaks.",
      min: 0.2,
      max: 4,
      step: 0.1,
      format: fixed(1),
    },
    ridge: {
      kind: "range",
      label: "Ridge sharpness",
      description: "Folds mid-height noise into crests, blended in by this amount. Higher: stronger, narrower crests. 0 turns it off.",
      min: 0,
      max: 1,
      step: 0.05,
      format: fixed(2),
    },
    height: {
      kind: "range",
      label: "Height",
      description: "The highest the ground can rise. Most ground stays lower.",
      min: 6,
      max: 48,
      step: 1,
      format: meters,
    },
  },
  terraces: {
    strength: {
      kind: "range",
      label: "Terrace strength",
      description: "How strongly the ground snaps to terrace levels. 1: flat shelves and cliffs. 0: no terraces.",
      min: 0,
      max: 1,
      step: 0.05,
      format: fixed(2),
    },
    height: {
      kind: "range",
      label: "Terrace height",
      description: "Height of each step between shelves.",
      min: 1,
      max: 12,
      step: 1,
      format: meters,
    },
    wander: {
      kind: "range",
      label: "Edge wander",
      description: "How far terrace edges stray from the contours. 0 follows them exactly.",
      min: 0,
      max: 0.6,
      step: 0.05,
      format: fixed(2),
    },
    slope: {
      kind: "range",
      label: "Slope threshold",
      description: "Slopes gentler than this stay as walkable voxel stairs; steeper ground becomes shelves and cliffs. 0 terraces everything.",
      min: 0,
      max: 45,
      step: 1,
      format: (v) => `${v}°`,
    },
  },
  river: {
    enabled: { kind: "switch", label: "River", description: "" },
    points: {
      kind: "range",
      label: "Control points",
      description: "Points the path is built from, evenly spaced from source to mouth, each on the lowest ground nearby. Changing the number resets dragged points.",
      min: 3,
      max: 16,
      step: 1,
      format: fixed(0),
    },
    width: { kind: "range", label: "Channel width", description: "Width of the riverbed.", min: 1, max: 12, step: 0.5, format: meters },
    depth: { kind: "range", label: "Channel depth", description: "How far the bed sits below the water.", min: 0.25, max: 4, step: 0.25, format: meters },
    valleyWidth: {
      kind: "range",
      label: "Valley width",
      description: "How far the valley sides reach beyond the channel before meeting the original ground.",
      min: 0,
      max: 20,
      step: 1,
      format: meters,
    },
    valleyShape: {
      kind: "range",
      label: "Valley shape",
      description: "0: V-shaped sides. 1: a flat floor with steep sides.",
      min: 0,
      max: 1,
      step: 0.05,
      format: fixed(2),
    },
    water: { kind: "switch", label: "Water", description: "Fill the channel with water." },
  },
  surfaces: {
    tones: {
      kind: "range",
      label: "Ground tones",
      description: "How much the ground's color varies in large patches. 0 is one flat color per surface.",
      min: 0,
      max: 0.3,
      step: 0.01,
      format: fixed(2),
    },
    rockCliff: {
      kind: "range",
      label: "Rock cliff",
      description: "A rim with a neighbor at least this much lower turns to rock. Lower values make more rock.",
      min: 0.5,
      max: 6,
      step: 0.25,
      format: meters,
    },
    dirtSlope: {
      kind: "range",
      label: "Dirt slope",
      description: "Ground steeper than this is dirt. Lower values make more dirt.",
      min: 10,
      max: 60,
      step: 1,
      format: (v) => `${v}°`,
    },
    grassLimit: {
      kind: "range",
      label: "Grass limit",
      description: "Grass covers this share of the land, lowest ground first; the highest ground above it is bare rock. 100% keeps grass everywhere.",
      min: 0.3,
      max: 1,
      step: 0.05,
      format: pct,
    },
  },
  look: {
    grid: {
      kind: "range",
      label: "Voxel grid",
      description: "Lines and a slight tint on every block, so merged faces still read as voxels. They fade out from far away. 0 turns them off.",
      min: 0,
      max: 1,
      step: 0.05,
      format: fixed(2),
    },
  },
};
