import type { LayerId, LayerParams, ParticleMode, ParticleParams, PathParams, ScatterMethod, TerrainParams, TerrainView, Week05State } from "./types";

/** The terrain is a square this many units across, centred on the origin. */
export const WORLD_SIZE = 24;
/** Vertices along each side of the terrain grid. */
export const GRID = 161;
/** Height of the terrain's highest point at relief 1. */
export const MAX_HEIGHT = 5;

export const LAYERS: Record<LayerId, { name: string; color: string; summary: string }> = {
  trees: { name: "Trees", color: "#5fa391", summary: "Clumped forests on gentle, mid-height ground. Tinted lighter and yellower higher up." },
  bushes: { name: "Bushes", color: "#3f7f6a", summary: "Low growth that fills the valleys and the edges of the forest." },
  rocks: { name: "Rocks", color: "#8b8394", summary: "The opposite rule: rocks only appear on steep slopes, and lean with the ground." },
  windmills: { name: "Windmills", color: "#cbd5e1", summary: "Rare and evenly spaced on flat hilltops. Their blades turn with the wind on the Particles tab." },
};

export const LAYER_IDS = Object.keys(LAYERS) as LayerId[];

const BASE_LAYER: LayerParams = {
  enabled: true,
  method: "random",
  density: 0.5,
  spacing: 0.8,
  patchSize: 1,
  patchCover: 0.5,
  heightMin: 0,
  heightMax: 1,
  slopeMin: 0,
  slopeMax: 33,
  align: 0,
  size: 1,
  sizeVariation: 0.3,
  terrainTint: true,
  avoidPaths: true,
};

export const DEFAULT_LAYERS: Record<LayerId, LayerParams> = {
  trees: { ...BASE_LAYER, method: "noise", density: 0.5, patchSize: 1.2, patchCover: 0.5, heightMin: 0.12, heightMax: 0.75, slopeMax: 33, align: 0.15 },
  bushes: { ...BASE_LAYER, method: "random", density: 0.35, heightMin: 0.02, heightMax: 0.45, slopeMax: 25, align: 0.6, size: 0.9, sizeVariation: 0.4 },
  rocks: { ...BASE_LAYER, method: "random", density: 0.45, heightMin: 0.1, heightMax: 1, slopeMin: 28, slopeMax: 70, align: 1, size: 0.9, sizeVariation: 0.6 },
  windmills: { ...BASE_LAYER, method: "poisson", spacing: 4, heightMin: 0.6, heightMax: 1, slopeMax: 12, align: 0, size: 1, sizeVariation: 0.1, terrainTint: false },
};

export const METHODS: Record<ScatterMethod, { label: string; summary: string; formula: string }> = {
  random: {
    label: "Random",
    summary: "Every candidate gets a uniform random position. Simple, but it clumps in some places and leaves gaps in others, and copies can overlap.",
    formula: "p = (rand() * size, rand() * size)\nkeep p if it passes the rules",
  },
  noise: {
    label: "Noise distribution",
    summary: "A noise field is used as a density map. Each candidate survives with a probability read from the noise, so copies gather in patches with clearings between them.",
    formula: "density = fbm(p / patchSize)\nkeep p if rand() < smoothstep(cover)",
  },
  poisson: {
    label: "Poisson disk",
    summary: "Points are thrown around existing ones and rejected if any neighbour is closer than the spacing. The spread is even but still organic, and nothing overlaps.",
    formula: "q = p + random offset in [r, 2r]\nkeep q if every neighbour is ≥ r away",
  },
};

export const RULES_FORMULA =
  "h = (height − min) / (max − min)\nslope = acos(normal · up) in degrees\nup = lerp(worldUp, normal, align)\nkeep if h, slope in band and away from paths";

export const PATHS_FORMULA =
  "d = distance(vertex, curve)\nw = 1 − smoothstep(width/2, width/2 + falloff, d)\nroad:  y = lerp(y, roadY, w)\nriver: y = min(y, lerp(y, bedY, w))";

export const PARTICLE_MODES: Record<ParticleMode, { label: string; summary: string }> = {
  off: { label: "Off", summary: "No particles. Pick a mode to drop point data into the vector field." },
  rain: { label: "Rain", summary: "Drops fall under gravity while the wind field pushes them sideways. A drop that reaches the ground respawns at the top." },
  wind: { label: "Wind", summary: "Particles hover over the ground and simply follow the vector field. Their trails draw the field's flow lines." },
  clouds: { label: "Clouds", summary: "Large, soft sprites drift slowly high above the terrain. No geometry, just many transparent points." },
};

export const PARTICLE_FORMULA =
  "wind = baseDir * strength + curl(noise) * swirl\nv += (wind − v) * drag * dt   (+ gravity for rain)\np += v * dt\nrespawn when age > life or p hits the ground";

export const TERRAIN_VIEWS: Record<TerrainView, { label: string; description: string }> = {
  natural: { label: "Natural", description: "Muted ground colours: grass on gentle ground, rock on steep slopes." },
  height: { label: "Height", description: "Low ground is dark blue, high ground is pale cyan." },
  slope: { label: "Slope", description: "Flat ground is green, steep ground is grey. This is what the slope rules read." },
  mask: { label: "Layer mask", description: "Where the selected layer may grow. Cyan is allowed; amber fails the slope rule, slate the height rule, pink is too close to a path." },
};

const DEFAULT_TERRAIN: TerrainParams = { seed: "harbor", relief: 1, scale: 1, view: "natural" };

const DEFAULT_PATHS: PathParams = {
  road: true,
  river: true,
  deform: true,
  wander: 0.6,
  roadWidth: 0.9,
  falloff: 1.4,
  riverWidth: 1.2,
  riverDepth: 0.5,
  lampSpacing: 2.5,
  clearance: 0.4,
};

const DEFAULT_PARTICLES: ParticleParams = {
  mode: "rain",
  count: 1200,
  windDirection: 30,
  windStrength: 1.2,
  swirl: 1,
  fieldScale: 1,
  trails: true,
  trailLength: 5,
  showField: false,
};

export function initialState(): Week05State {
  return {
    terrain: { ...DEFAULT_TERRAIN },
    layer: "trees",
    layers: structuredClone(DEFAULT_LAYERS),
    paths: { ...DEFAULT_PATHS },
    particles: { ...DEFAULT_PARTICLES },
  };
}

export const defaults = { terrain: DEFAULT_TERRAIN, paths: DEFAULT_PATHS, particles: DEFAULT_PARTICLES };

/** Hover text for every control. No em dashes (STYLE_GUIDE section 11). */
export const descriptions = {
  seed: "The text every random choice grows from. The same seed always gives the same terrain, paths and scatter.",
  relief: "How tall the hills are. Higher relief means steeper slopes, so the slope rules reject more ground.",
  scale: "How many hills fit across the terrain.",
  view: "What the terrain colour shows. Layer mask paints where the selected layer is allowed to grow.",
  layer: "The scatter layer to edit. Each asset type has its own layer with its own rules.",
  enabled: "Show or hide this layer.",
  method: "How candidate points are generated before the rules filter them.",
  density: "How many candidate points are thrown. The rules then remove the ones that do not fit.",
  spacing: "No two points of this layer can be closer than this.",
  patchSize: "Size of the noise patches. Larger patches mean bigger forests and wider clearings.",
  patchCover: "How much of the ground the patches cover.",
  height: "Points are kept only between these heights, from the lowest point of the terrain (0) to the highest (1).",
  slope: "Points are kept only where the ground's slope is inside this band. 0° is flat, 90° is a cliff.",
  align: "0 stands every copy straight up. 1 leans it fully with the surface normal, like a rock resting on a hillside.",
  size: "Average size of each copy.",
  sizeVariation: "Random spread of sizes around the average.",
  terrainTint: "Colour each copy from the terrain under it: lighter higher up, darker on slopes.",
  avoidPaths: "Keep this layer off the road and the river.",
  road: "A road laid along a spline that looks for level ground.",
  river: "A river laid along a spline that follows the valleys downhill.",
  deform: "Let the curves change the mesh: flatten the ground under the road and carve a bed for the river.",
  wander: "How far the curves may swing sideways to find easier ground.",
  roadWidth: "Width of the flat road surface.",
  falloff: "Width of the embankment that blends the road and river banks back into the terrain.",
  riverWidth: "Width of the river channel.",
  riverDepth: "How deep the river bed is carved.",
  lampSpacing: "Distance between lamp posts along the road. The curve itself is used to scatter them.",
  clearance: "Extra space scattered assets keep from a path's edge.",
  particleMode: "What the particles represent. Each mode sets its own forces and look.",
  count: "How many particles are alive at once.",
  windDirection: "The direction the base wind blows towards.",
  windStrength: "How fast the base wind is. Windmill blades turn with it.",
  swirl: "How strongly the curl-noise swirls bend the wind.",
  fieldScale: "Size of the swirls in the vector field.",
  trails: "Draw each particle's last few positions as a fading line.",
  trailLength: "How many past positions each trail keeps.",
  showField: "Draw the vector field as small arrows above the terrain.",
};
