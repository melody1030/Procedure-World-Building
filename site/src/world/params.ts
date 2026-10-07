/**
 * Every tunable number in the world, grouped by the pipeline stage that reads it. The groups are
 * named after the stages, so the pipeline can tell which stage is the first one a change touches
 * and regenerate only from there.
 */

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
}

export type ParamGroup = keyof WorldParams;
/** One parameter: its group (the stage that reads it) and its name. */
export type ParamKey = { [G in ParamGroup]: [G, keyof WorldParams[G] & string] }[ParamGroup];

export const DEFAULT_PARAMS: WorldParams = {
  island: { size: 1, warp: 0.24, bay: 1 },
  terrain: { terraces: 0, erosion: 20000, ridges: 0.1, plateau: 0.4, wander: 0.25 },
};

export const MAX_EROSION = 60000;

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
export type ParamSpec = RangeSpec | SelectSpec;

const times = (v: number) => `×${v.toFixed(2)}`;
const fixed = (d: number) => (v: number) => v.toFixed(d);

/** What each parameter is, for the panel. Keyed group → key. */
export const PARAM_SPECS: { [G in ParamGroup]: { [K in keyof WorldParams[G]]: ParamSpec } } = {
  island: {
    size: { kind: "range", label: "Island size", description: "Scales the coast radius. Smaller islands leave more open water around the diorama.", min: 0.7, max: 1.15, step: 0.05, format: times },
    warp: { kind: "range", label: "Coast warp", description: "Domain warp: the lookup point is pushed around by two more noise fields, so the coast bends and folds instead of being a wobbly circle.", min: 0, max: 0.5, step: 0.02, format: fixed(2) },
    bay: { kind: "range", label: "Bay", description: "Size of the bay cut into the coast. 0 removes it.", min: 0, max: 1.6, step: 0.1, format: (v) => (v === 0 ? "none" : times(v)) },
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
    plateau: { kind: "range", label: "Plateau", description: "Height of the flat-topped high ground opposite the bay.", min: 0, max: 0.8, step: 0.05, format: fixed(2) },
    wander: { kind: "range", label: "Edge wander", description: "Low-frequency noise added before snapping to a terrace, so terrace edges wander instead of following the contour exactly.", min: 0, max: 0.6, step: 0.05, format: fixed(2) },
  },
};
