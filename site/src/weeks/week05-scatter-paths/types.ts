export type LayerId = "trees" | "bushes" | "rocks" | "windmills";

/** How candidate points are generated before the rules filter them. */
export type ScatterMethod = "random" | "noise" | "poisson";

export interface LayerParams {
  enabled: boolean;
  method: ScatterMethod;
  /** 0 to 1: how many candidate points are thrown (random and noise). */
  density: number;
  /** Minimum distance between points (Poisson disk only). */
  spacing: number;
  /** Noise patch size: larger means bigger clumps and clearings (noise only). */
  patchSize: number;
  /** 0 to 1: how much of the ground the noise patches cover (noise only). */
  patchCover: number;
  /** Allowed height band, 0 = lowest point of the terrain, 1 = highest. */
  heightMin: number;
  heightMax: number;
  /** Allowed slope band in degrees. */
  slopeMin: number;
  slopeMax: number;
  /** 0 = stand straight up, 1 = lean fully with the surface normal. */
  align: number;
  size: number;
  /** 0 to 1: random size spread around `size`. */
  sizeVariation: number;
  /** Tint each copy from the terrain data under it (height, slope). */
  terrainTint: boolean;
  /** Keep clear of the road and river. */
  avoidPaths: boolean;
}

export interface PathParams {
  road: boolean;
  river: boolean;
  /** Flatten the terrain under the road and carve the river bed (spline → mesh). */
  deform: boolean;
  /** How far the curves wander sideways while they look for easy ground. */
  wander: number;
  roadWidth: number;
  /** Width of the embankment that blends the road back into the terrain. */
  falloff: number;
  riverWidth: number;
  riverDepth: number;
  /** Lamp posts along the road every this many units (0 = none). */
  lampSpacing: number;
  /** Extra space scattered assets keep from a path's edge. */
  clearance: number;
}

export type ParticleMode = "off" | "rain" | "wind" | "clouds";

export interface ParticleParams {
  mode: ParticleMode;
  count: number;
  /** Degrees around the vertical axis the base wind blows towards. */
  windDirection: number;
  windStrength: number;
  /** How strongly the curl-noise swirl bends the base wind. */
  swirl: number;
  /** Size of the swirls in the vector field. */
  fieldScale: number;
  trails: boolean;
  trailLength: number;
  showField: boolean;
}

export type TerrainView = "natural" | "height" | "slope" | "mask";

export interface TerrainParams {
  seed: string;
  relief: number;
  /** How many hills fit across the terrain. */
  scale: number;
  view: TerrainView;
}

export interface Week05State {
  terrain: TerrainParams;
  /** The scatter layer shown in the panel and used by the mask view. */
  layer: LayerId;
  layers: Record<LayerId, LayerParams>;
  paths: PathParams;
  particles: ParticleParams;
}
