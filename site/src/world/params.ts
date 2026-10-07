import { MOODS, type MoodId } from "./render/effects";

/**
 * Every tunable number in the world, grouped by the pipeline stage that reads it. The groups are
 * named after the stages, so the pipeline can tell which stage is the first one a change touches
 * and regenerate only from there.
 *
 * Render settings (light, fog, bloom, rain) are separate: they never regenerate anything, the
 * renderer applies them on the next frame.
 */

export type TreeMethod = "grid" | "random" | "poisson";

export interface WorldParams {
  island: {
    /** Coast radius multiplier. */
    size: number;
    /** Domain-warp strength: how irregular the coast is. */
    warp: number;
    /** Bay size multiplier; 0 means no bay. */
    bay: number;
  };
  terrain: {
    /** Terrace levels; 0 lets the seed choose (4–7). */
    terraces: number;
    /** Erosion droplets; 0 turns erosion off. */
    erosion: number;
    /** Weight of the ridged noise (crests). */
    ridges: number;
    /** Height of the flat-topped plateau. */
    plateau: number;
    /** How far terrace edges wander from the contour. */
    wander: number;
  };
  water: {
    river: boolean;
    /** Catchment a stream needs before it counts as the river. */
    riverFlow: number;
    riverWidth: number;
    /** How deep a filled pit must be to become a lake (coarse-field units). */
    lakeDepth: number;
    /** Smallest lake, in columns. */
    lakeSize: number;
  };
  voxels: {
    /** Greedy meshing on, or one quad per voxel face (Week 3's culled faces). */
    greedy: boolean;
    /** Brightness spread between the three grass tones. */
    tones: number;
  };
  suitability: {
    room: number;
    water: number;
    low: number;
  };
  districts: {
    /** Number of cells; 0 lets the seed choose (11–15). */
    count: number;
    /** Minimum distance between cell seeds, in voxels. */
    spacing: number;
    /** Extra distance per terrace level between a column and a seed. */
    terraceCost: number;
  };
  roads: {
    /** A* cost of climbing one terrace. */
    climb: number;
    /** Extra links added to the spanning tree. */
    loops: number;
    /** Cost multiplier along roads already built (lower = more shared trunks). */
    reuse: number;
    /** Chaikin smoothing passes. */
    smooth: number;
  };
  growth: {
    /** Share of lots that end up built. */
    density: number;
    /** Multiplies the share of tall buildings and landmarks. */
    towers: number;
    /** District fill a lot must reach before a tower may rise on it. */
    scarcity: number;
    /** Chance of stacked housing on a crowded low building. */
    stacking: number;
  };
  buildings: {
    /** Multiplies the share of lit windows. */
    windows: number;
    /** Multiplies the chance of signs, billboards and shopfronts. */
    signs: number;
  };
  bridges: {
    skyBridges: number;
    rails: number;
  };
  props: {
    method: TreeMethod;
    /** Multiplies tree probability. */
    trees: number;
    /** Size of a grove in the noise mask, in voxels. */
    groveSize: number;
    /** Road points between street lights. */
    lampSpacing: number;
    /** Multiplies how many people stand on plazas and sidewalks. */
    people: number;
    cables: number;
    piers: number;
  };
}

export type ParamGroup = keyof WorldParams;
/** One parameter: its group (the stage that reads it) and its name. */
export type ParamKey = { [G in ParamGroup]: [G, keyof WorldParams[G] & string] }[ParamGroup];

export const DEFAULT_PARAMS: WorldParams = {
  island: { size: 1, warp: 0.24, bay: 1 },
  terrain: { terraces: 0, erosion: 20000, ridges: 0.1, plateau: 0.4, wander: 0.25 },
  water: { river: true, riverFlow: 22, riverWidth: 1, lakeDepth: 0.003, lakeSize: 60 },
  voxels: { greedy: true, tones: 0.1 },
  suitability: { room: 0.45, water: 0.3, low: 0.25 },
  districts: { count: 0, spacing: 52, terraceCost: 14 },
  roads: { climb: 30, loops: 3, reuse: 0.35, smooth: 2 },
  growth: { density: 0.9, towers: 1, scarcity: 0.45, stacking: 0.32 },
  buildings: { windows: 1, signs: 1 },
  bridges: { skyBridges: 10, rails: 2 },
  props: { method: "grid", trees: 1, groveSize: 33, lampSpacing: 11, people: 1, cables: 45, piers: 6 },
};

export const MAX_EROSION = 60000;

/** Renderer settings. A mood sets all of them at once; each can then be tuned. */
export interface RenderParams {
  mood: MoodId;
  /** Key light compass direction and height, in degrees. */
  sunAzimuth: number;
  sunElevation: number;
  sun: number;
  ambient: number;
  exposure: number;
  bloom: number;
  /** Multiplies the haze density the atmosphere stage chose for this skyline. */
  fog: number;
  tiltShift: number;
  /** Share of the rain field that falls (0 = dry). */
  rain: number;
  rainSpeed: number;
  wind: number;
}

export function moodRender(mood: MoodId): RenderParams {
  const m = MOODS[mood];
  return {
    mood,
    sunAzimuth: m.sunAzimuth,
    sunElevation: m.sunElevation,
    sun: m.keyIntensity,
    ambient: m.hemi,
    exposure: m.exposure,
    bloom: m.bloom,
    fog: m.fog,
    tiltShift: 2.2,
    rain: m.rain ? 0.35 : 0,
    rainSpeed: 1,
    wind: 0.15,
  };
}

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
  options: { value: number | string; label: string }[];
}
export interface SwitchSpec extends SpecBase {
  kind: "switch";
}
export type ParamSpec = RangeSpec | SelectSpec | SwitchSpec;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const times = (v: number) => `×${v.toFixed(2)}`;
const fixed = (d: number) => (v: number) => v.toFixed(d);
const int = (v: number) => String(Math.round(v));
const vox = (v: number) => `${v} vox`;

/** What each generation parameter is, for the panel. Keyed group → key. */
export const PARAM_SPECS: { [G in ParamGroup]: { [K in keyof WorldParams[G]]: ParamSpec } } = {
  island: {
    size: { kind: "range", label: "Island size", description: "Scales the coast radius. Smaller islands leave more open water around the diorama.", min: 0.7, max: 1.15, step: 0.05, format: times },
    warp: { kind: "range", label: "Coast warp", description: "Domain warp: the lookup point is pushed around by two more noise fields, so the coast bends and folds instead of being a wobbly circle.", min: 0, max: 0.5, step: 0.02, format: fixed(2) },
    bay: { kind: "range", label: "Bay", description: "Size of the bay cut into the coast, where the harbour goes. 0 removes it.", min: 0, max: 1.6, step: 0.1, format: (v) => (v === 0 ? "none" : times(v)) },
  },
  terrain: {
    terraces: {
      kind: "select",
      label: "Terraces",
      description: "How many levels the ground is cut into, one storey each (Week 2's terrace shaping).",
      options: [{ value: 0, label: "Seed decides (4–7)" }, ...[3, 4, 5, 6, 7, 8].map((v) => ({ value: v, label: `${v} levels` }))],
    },
    erosion: {
      kind: "range",
      label: "Erosion",
      description: "Week 2's hydraulic erosion: droplets run downhill, pick up sediment on steep fast stretches and drop it where they slow. More droplets carve deeper valleys before terracing. 0 turns it off.",
      min: 0,
      max: MAX_EROSION,
      step: 5000,
      format: (v) => (v === 0 ? "off" : `${v / 1000}k drops`),
    },
    ridges: { kind: "range", label: "Ridges", description: "Weight of ridged noise (1 − |noise|), which adds sharp crests to the rolling fBm ground.", min: 0, max: 0.4, step: 0.02, format: fixed(2) },
    plateau: { kind: "range", label: "Plateau", description: "Height of the flat-topped high ground opposite the bay. Higher gives more terrace levels near it and a green highland.", min: 0, max: 0.8, step: 0.05, format: fixed(2) },
    wander: { kind: "range", label: "Edge wander", description: "Low-frequency noise added before snapping to a terrace, so terrace edges wander instead of following the contour exactly.", min: 0, max: 0.6, step: 0.05, format: fixed(2) },
  },
  water: {
    river: { kind: "switch", label: "River", description: "Carve the main river from the flow-accumulation map. Off keeps only lakes." },
    riverFlow: { kind: "range", label: "River source", description: "Catchment (coarse cells draining through a point) a stream needs before it counts as river. Lower starts the river further upstream.", min: 8, max: 80, step: 2, format: int },
    riverWidth: { kind: "range", label: "River width", description: "Multiplies the channel width, which grows from source to mouth.", min: 0.5, max: 2.5, step: 0.1, format: times },
    lakeDepth: { kind: "range", label: "Lake depth", description: "How deep a pit must be after priority-flood fills it before it becomes a lake. Lower = more lakes.", min: 0.0005, max: 0.01, step: 0.0005, format: (v) => (v * 1000).toFixed(1) },
    lakeSize: { kind: "range", label: "Smallest lake", description: "Lakes with fewer columns than this are left dry.", min: 10, max: 300, step: 10, format: (v) => `${v} cols` },
  },
  voxels: {
    greedy: { kind: "switch", label: "Greedy meshing", description: "Week 3: merge neighbouring faces with the same height and colour into one rectangle. Off emits one quad per exposed voxel face (culled faces), so you can compare the counts." },
    tones: { kind: "range", label: "Grass tones", description: "Brightness spread of the three grass tones picked by low-frequency noise. Tones also break up greedy merging, so 0 gives the fewest faces.", min: 0, max: 0.3, step: 0.02, format: fixed(2) },
  },
  suitability: {
    room: { kind: "range", label: "Room", description: "Weight of distance to the nearest terrace edge (breadth-first search): the middle of a wide terrace scores high.", min: 0, max: 1, step: 0.05, format: fixed(2) },
    water: { kind: "range", label: "Near water", description: "Weight of closeness to the sea, river or a lake.", min: 0, max: 1, step: 0.05, format: fixed(2) },
    low: { kind: "range", label: "Low ground", description: "Weight of low terraces: hillside towns grow up from the shore.", min: 0, max: 1, step: 0.05, format: fixed(2) },
  },
  districts: {
    count: {
      kind: "select",
      label: "Districts",
      description: "Worley cells seeded by dart throwing on good ground.",
      options: [{ value: 0, label: "Seed decides (11–15)" }, ...[6, 8, 10, 12, 14, 16, 18, 20].map((v) => ({ value: v, label: `${v} cells` }))],
    },
    spacing: { kind: "range", label: "Seed spacing", description: "Minimum distance between cell seeds (Poisson-style dart throwing).", min: 24, max: 80, step: 4, format: vox },
    terraceCost: { kind: "range", label: "Follow terraces", description: "Each terrace level between a column and a seed counts as this many extra voxels, so cells follow the terraces instead of cutting across cliffs.", min: 0, max: 40, step: 2, format: vox },
  },
  roads: {
    climb: { kind: "range", label: "Climb cost", description: "A* cost of climbing one terrace. Higher makes roads wind along the terraces; lower lets them cut straight up.", min: 0, max: 80, step: 5, format: int },
    loops: { kind: "range", label: "Loops", description: "Extra links on top of the minimum spanning tree, where the tree makes a long detour between close neighbours.", min: 0, max: 8, step: 1, format: int },
    reuse: { kind: "range", label: "Share roads", description: "Cost multiplier along roads already built. Low values make later roads join earlier ones into trunks.", min: 0.1, max: 1, step: 0.05, format: times },
    smooth: { kind: "range", label: "Smoothing", description: "Chaikin corner-cutting passes on each A* path.", min: 0, max: 4, step: 1, format: int },
  },
  growth: {
    density: { kind: "range", label: "Density", description: "Share of the available lots that end up built. Higher density fills districts sooner, and land scarcity pushes the late buildings taller.", min: 0.4, max: 1, step: 0.05, format: pct },
    towers: { kind: "range", label: "Verticality", description: "Multiplies the share of tall buildings and landmarks in the height budget (10 % and 5 % by default).", min: 0, max: 2.5, step: 0.1, format: times },
    scarcity: { kind: "range", label: "Scarcity for towers", description: "How full a district must already be before a tower may rise in it. The land-scarcity rule.", min: 0, max: 0.9, step: 0.05, format: pct },
    stacking: { kind: "range", label: "Stacked housing", description: "Chance that an early low building on crowded ground gets prefab floors stacked on top.", min: 0, max: 1, step: 0.05, format: pct },
  },
  buildings: {
    windows: { kind: "range", label: "Lit windows", description: "Multiplies the share of windows that glow.", min: 0, max: 2, step: 0.1, format: times },
    signs: { kind: "range", label: "Signs", description: "Multiplies the chance of blade signs, billboards and lit shopfronts.", min: 0, max: 2, step: 0.1, format: times },
  },
  bridges: {
    skyBridges: { kind: "range", label: "Sky bridges", description: "Most glass bridges strung between neighbouring towers.", min: 0, max: 24, step: 1, format: int },
    rails: { kind: "range", label: "Rail lines", description: "Elevated rail over the longest main roads.", min: 0, max: 3, step: 1, format: int },
  },
  props: {
    method: {
      kind: "select",
      label: "Tree distribution",
      description: "Week 5: how tree candidates are thrown before the rules filter them.",
      options: [
        { value: "grid", label: "Jittered grid" },
        { value: "random", label: "Random" },
        { value: "poisson", label: "Poisson disk" },
      ],
    },
    trees: { kind: "range", label: "Trees", description: "Multiplies the chance a candidate becomes a tree (dense in green districts, sparse in the city).", min: 0, max: 3, step: 0.1, format: times },
    groveSize: { kind: "range", label: "Grove size", description: "Scale of the fBm noise mask that clusters trees into groves and clearings.", min: 10, max: 100, step: 5, format: vox },
    lampSpacing: { kind: "range", label: "Lamp spacing", description: "Road points between street lights. Each one becomes a post or a wall bracket depending on what is next to it.", min: 6, max: 30, step: 1, format: vox },
    people: { kind: "range", label: "People", description: "Multiplies how many people stand on plazas and sidewalks.", min: 0, max: 4, step: 0.25, format: times },
    cables: { kind: "range", label: "Cables", description: "Most cables with lanterns strung across narrow streets.", min: 0, max: 120, step: 5, format: int },
    piers: { kind: "range", label: "Piers", description: "Most harbour piers, with boats, buoys and cranes.", min: 0, max: 12, step: 1, format: int },
  },
};

export const RENDER_SPECS: { [K in Exclude<keyof RenderParams, "mood">]: RangeSpec } = {
  sunAzimuth: { kind: "range", label: "Light direction", description: "Compass direction of the key (moon or sun) light.", min: -180, max: 180, step: 5, format: (v) => `${v}°` },
  sunElevation: { kind: "range", label: "Light height", description: "Angle of the key light above the horizon. Low light gives long shadows across the terraces.", min: 5, max: 85, step: 1, format: (v) => `${v}°` },
  sun: { kind: "range", label: "Key light", description: "Intensity of the directional key light (Week 1).", min: 0, max: 5, step: 0.1, format: fixed(1) },
  ambient: { kind: "range", label: "Sky light", description: "Intensity of the hemisphere light: sky colour from above, ground colour from below.", min: 0, max: 4, step: 0.1, format: fixed(1) },
  exposure: { kind: "range", label: "Exposure", description: "Tone-mapping exposure (ACES filmic).", min: 0.4, max: 2, step: 0.05, format: fixed(2) },
  bloom: { kind: "range", label: "Bloom", description: "Glow around emissive windows, signs and lamps. Only values above the threshold bloom, so the terrain stays crisp.", min: 0, max: 2, step: 0.05, format: fixed(2) },
  fog: { kind: "range", label: "Haze", description: "Multiplies the exponential-squared fog the atmosphere stage sized to the skyline (Week 4's distance fog).", min: 0, max: 3, step: 0.05, format: times },
  tiltShift: { kind: "range", label: "Tilt-shift", description: "Blur that grows away from a horizontal band, like a macro lens on a model. 0 turns it off.", min: 0, max: 5, step: 0.1, format: (v) => (v === 0 ? "off" : fixed(1)(v)) },
  rain: { kind: "range", label: "Rain", description: "Share of the seeded rain field that falls. 0 is dry.", min: 0, max: 1, step: 0.05, format: pct },
  rainSpeed: { kind: "range", label: "Rain speed", description: "Fall speed, moved entirely in the vertex shader.", min: 0.2, max: 2.5, step: 0.1, format: times },
  wind: { kind: "range", label: "Wind", description: "Slants the streaks and drifts drops sideways as they fall.", min: -1, max: 1, step: 0.05, format: fixed(2) },
};
