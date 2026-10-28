import type { GeometryData } from "../geometry";
import type { DISTRICT } from "../terrain/districts";
import type { FixtureKind, Kit } from "./kit";

/**
 * A building's settings. Sizes are in meters; colors are sRGB hex. Every archetype has its own
 * defaults (registry.ts) and keeps its identity across the ranges below; `seed` makes the
 * variation (window lights, props, signs) repeatable.
 */
export interface BuildingConfig {
  /** Footprint (x and z) and total height, in meters, rooftop gear included. */
  width: number;
  depth: number;
  height: number;
  /** Storey height, in meters. */
  floorHeight: number;
  /** Main structure, secondary masses, and the neon accent. */
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;
  /** Share of windows lit, 0–1. */
  windowDensity: number;
  /** Share of window bays with a balcony, 0–1. */
  balconyDensity: number;
  /** Brightness of neon and signs, 0–1. */
  neonIntensity: number;
  rooftopStyle: "service" | "garden" | "mixed";
  /** Amount of small props (AC units, pipes, signs, planters), 0–1. */
  detailDensity: number;
  seed: number;
  /** A diorama base under the building (for showing it on its own; off in the city, where the lot is the base). */
  base: boolean;
}

export type Category = "skyscraper" | "residential";

export interface Archetype {
  id: string;
  name: string;
  category: Category;
  /** One line on what makes it this archetype. */
  summary: string;
  /** The city districts it belongs in, for placing it on lots. */
  districts: (keyof typeof DISTRICT)[];
  defaults: BuildingConfig;
  /** Places the building's boxes into the kit, footprint from (0, 0) to (width, depth) in voxels. */
  build: (k: Kit, c: BuildingConfig) => void;
}

/** A finished building: geometry for the lit body and the glowing parts, and its size in voxels. */
export interface BuildingModel {
  id: string;
  solid: GeometryData;
  glow: GeometryData;
  /** Footprint and the height actually reached, in voxels. */
  width: number;
  depth: number;
  height: number;
  /** Every part's space (masses, fixtures, props), for clash checks and placing things around it. */
  fixtures: { box: number[]; kind: FixtureKind }[];
}

const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Fills missing settings from the archetype's defaults and keeps every value in a sane range. */
export function validate(defaults: BuildingConfig, overrides: Partial<BuildingConfig>): BuildingConfig {
  const c = { ...defaults, ...overrides };
  return {
    ...c,
    width: clamp(c.width, 4, 64, defaults.width),
    depth: clamp(c.depth, 4, 64, defaults.depth),
    height: clamp(c.height, 6, 200, defaults.height),
    floorHeight: clamp(c.floorHeight, 2.5, 5, defaults.floorHeight),
    windowDensity: clamp(c.windowDensity, 0, 1, defaults.windowDensity),
    balconyDensity: clamp(c.balconyDensity, 0, 1, defaults.balconyDensity),
    neonIntensity: clamp(c.neonIntensity, 0, 1, defaults.neonIntensity),
    detailDensity: clamp(c.detailDensity, 0, 1, defaults.detailDensity),
    seed: Number.isFinite(c.seed) ? Math.floor(c.seed) >>> 0 : defaults.seed,
  };
}
