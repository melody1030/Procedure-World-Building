import { DEFAULT_PARAMS, type ParamGroup, type WorldParams } from "./params";
import { Rng, hashSeed } from "./rng";
import { SEA_LEVEL, WORLD_SIZE } from "./scale";
import { buildBridges, type BridgeData } from "./stages/bridges";
import { buildBuildings, type BuildingMeshes } from "./stages/buildings";
import { buildDistricts, type DistrictData } from "./stages/districts";
import { buildAtmosphere, packMeshes, type AtmosphereData, type MeshSet, type PerformanceStats } from "./stages/finish";
import { buildGrowth, type GrowthData } from "./stages/growth";
import { buildIsland, type IslandData } from "./stages/island";
import { buildProps, type PropsData } from "./stages/props";
import { buildRoads, type RoadData } from "./stages/roads";
import { buildSuitability, type SuitabilityData } from "./stages/suitability";
import { buildTerrain, type TerrainData } from "./stages/terrain";
import { buildVoxels, type VoxelMeshes } from "./stages/voxels";
import { buildWater, type WaterData } from "./stages/water";

/**
 * seed → rules → world. `generate` runs the stages in order; each stage reads what earlier stages
 * wrote into the world and adds its own layer. Rendering never generates anything: it only draws
 * the WorldModel, so the same seed (and parameters) always shows the same world.
 *
 * Changing a parameter only reruns the stage that reads it and the stages after it: the earlier
 * layers are taken from the previous world, so tuning the props does not rerun the erosion.
 */

export { DEFAULT_PARAMS, type WorldParams };

export interface WorldModel {
  seed: string;
  /** The seed text hashed to a number; every stage's randomness starts here. */
  seedHash: number;
  params: WorldParams;
  /** A generated place name, so each seed feels like its own city. */
  name: string;
  /** Land is WORLD_SIZE × WORLD_SIZE voxels, centred on the origin. */
  size: number;
  seaLevel: number;
  island: IslandData;
  terrain: TerrainData;
  /** The terrain as the terrain stage left it, before rivers carve into it (for rerunning water). */
  pristineTerrain: TerrainData;
  water: WaterData;
  voxels: VoxelMeshes;
  suitability: SuitabilityData;
  districts: DistrictData;
  roads: RoadData;
  growth: GrowthData;
  buildings: BuildingMeshes;
  bridges: BridgeData;
  props: PropsData;
  atmosphere: AtmosphereData;
  meshes: MeshSet;
  stats: PerformanceStats;
  /** How long each stage took, in pipeline order; `cached` stages were reused from the last world. */
  timings: { id: StageId; ms: number; cached: boolean }[];
}

type Layers = Omit<WorldModel, "seed" | "seedHash" | "params" | "name" | "size" | "seaLevel" | "timings">;
/** The world while stages are still filling it in. */
type WorldDraft = Pick<WorldModel, "seed" | "seedHash" | "params" | "name" | "size" | "seaLevel"> & Partial<Layers>;

interface StageContext {
  rng: Rng;
  world: WorldDraft;
}

export type StageId =
  | "base"
  | "island"
  | "terrain"
  | "water"
  | "voxels"
  | "suitability"
  | "districts"
  | "roads"
  | "growth"
  | "buildings"
  | "bridges"
  | "props"
  | "atmosphere"
  | "performance";

export interface Stage {
  id: StageId;
  label: string;
  /** The class technique this stage puts to work. */
  technique: string;
  /** The parameter group this stage reads, if any. */
  params?: ParamGroup;
  run: (ctx: StageContext) => void;
  /** One line on what the stage produced for this seed. */
  describe: (world: WorldModel) => string;
}

const NAME_START = ["Ka", "Ri", "So", "Lun", "Ve", "Ta", "Mo", "Zen", "Har", "Ku", "No", "Sai", "Ren", "Oru", "Tes"];
const NAME_END = ["ri", "sa", "vel", "ton", "ka", "mura", "hold", "reach", "wan", "shi", "port", "gate", "moor"];
const NAME_PREFIX = ["Port", "New", "Upper", "Neo", "Old", "Lower", "Cape"];

function worldName(rng: Rng): string {
  const core = rng.pick(NAME_START) + rng.pick(NAME_END);
  return rng.chance(0.5) ? `${rng.pick(NAME_PREFIX)} ${core}` : core;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Every stage in the plan (docs/plans/procedural-world-plan.md), in the order they run. */
export const STAGES: Stage[] = [
  {
    id: "base",
    label: "Diorama base",
    technique: "Seeded randomness",
    run: ({ rng, world }) => {
      world.name = worldName(rng);
    },
    describe: (w) => `“${w.name}”`,
  },
  {
    id: "island",
    params: "island",
    label: "Island shape",
    technique: "Radial falloff, domain warp",
    run: ({ rng, world }) => {
      world.island = buildIsland(rng, world.params.island);
    },
    describe: () => "One bay, one plateau site",
  },
  {
    id: "terrain",
    params: "terrain",
    label: "Terrain & terraces",
    technique: "fBm, ridged noise, erosion",
    run: ({ rng, world }) => {
      world.terrain = buildTerrain(rng, world.island!, world.params.terrain);
      world.pristineTerrain = cloneTerrain(world.terrain);
    },
    describe: (w) => `${w.terrain.levels} terraces · ${Math.round(w.terrain.landShare * 100)}% land`,
  },
  {
    id: "water",
    params: "water",
    label: "Water & rivers",
    technique: "Priority-flood, flow accumulation",
    run: ({ rng, world }) => {
      world.water = buildWater(rng, world.terrain!, world.params.water);
    },
    describe: (w) => (w.water.riverPath.length ? `1 river · ${plural(w.water.falls, "waterfall")} · ${plural(w.water.lakes, "lake")}` : `No river · ${plural(w.water.lakes, "lake")}`),
  },
  {
    id: "voxels",
    params: "voxels",
    label: "Voxelise",
    technique: "Greedy meshing",
    run: ({ rng, world }) => {
      world.voxels = buildVoxels(rng, world.terrain!, world.water!, world.params.voxels);
    },
    describe: (w) => `${Math.round(w.voxels.naiveFaces / 1000)}k faces → ${Math.round(w.voxels.mergedFaces / 1000)}k`,
  },
  {
    id: "suitability",
    params: "suitability",
    label: "Suitability map",
    technique: "Weighted scoring, BFS distance",
    run: ({ world }) => {
      world.suitability = buildSuitability(world.terrain!, world.water!, world.params.suitability);
    },
    describe: (w) => {
      const { room, water, low } = w.params.suitability;
      const t = room + water + low || 1;
      return `Room ${Math.round((room / t) * 100)} · water ${Math.round((water / t) * 100)} · low ${Math.round((low / t) * 100)}`;
    },
  },
  {
    id: "districts",
    params: "districts",
    label: "Districts",
    technique: "Worley / Voronoi cells",
    run: ({ rng, world }) => {
      world.districts = buildDistricts(rng, world.terrain!, world.island!, world.suitability!, world.params.districts);
    },
    describe: (w) => {
      const count = (t: string) => w.districts.list.filter((d) => d.type === t).length;
      return `${w.districts.list.length} cells · ${count("core")} core · ${count("industrial")} industrial`;
    },
  },
  {
    id: "roads",
    params: "roads",
    label: "Road network",
    technique: "Spanning tree, A*",
    run: ({ rng, world }) => {
      world.roads = buildRoads(rng, world.terrain!, world.water!, world.suitability!, world.districts!, world.params.roads);
    },
    describe: (w) => `${plural(w.roads.roads.length, "road")} · ${plural(w.roads.plazas.length, "plaza")}`,
  },
  {
    id: "growth",
    params: "growth",
    label: "Lots & growth",
    technique: "Growth simulation, land scarcity",
    run: ({ rng, world }) => {
      world.growth = buildGrowth(rng, world.terrain!, world.suitability!, world.districts!, world.roads!, world.params.growth);
    },
    describe: (w) => `${w.growth.buildings.length} of ${w.growth.lots} lots built`,
  },
  {
    id: "buildings",
    params: "buildings",
    label: "Buildings",
    technique: "Voxel shape grammar",
    run: ({ rng, world }) => {
      world.buildings = buildBuildings(rng, world.size, world.growth!.buildings, world.params.buildings);
    },
    describe: (w) => `${w.growth.buildings.filter((b) => b.band === "tall" || b.band === "landmark").length} towers · ${Math.round(w.buildings.litWindows / 100) / 10}k lit windows`,
  },
  {
    id: "bridges",
    params: "bridges",
    label: "Bridges & walkways",
    technique: "Graph connections",
    run: ({ rng, world }) => {
      world.bridges = buildBridges(rng, world.size, world.growth!.buildings, world.roads!, world.buildings!.neon, world.params.bridges);
    },
    describe: (w) => `${plural(w.bridges.rails.length, "rail line")} · ${plural(w.bridges.skyBridges, "sky bridge")}`,
  },
  {
    id: "props",
    params: "props",
    label: "Props & population",
    technique: "Scatter by mask, context props",
    run: ({ rng, world }) => {
      world.props = buildProps(
        rng,
        world.terrain!,
        world.water!,
        world.suitability!,
        world.districts!,
        world.roads!,
        world.growth!.buildings,
        world.growth!.footprint,
        world.buildings!.neon,
        world.params.props,
      );
    },
    describe: (w) => `${w.props.counts.trees} trees · ${w.props.counts.posts + w.props.counts.brackets + w.props.counts.buoys} lights · ${plural(w.props.counts.piers, "pier")}`,
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    technique: "Emissive light, fog, rain",
    run: ({ rng, world }) => {
      world.atmosphere = buildAtmosphere(rng, world.size, world.growth!.buildings);
    },
    describe: (w) => `${Math.round(w.atmosphere.rain.length / 3000)}k raindrops · haze for a ${Math.round(w.atmosphere.tallest / 2)} m skyline`,
  },
  {
    id: "performance",
    label: "Performance",
    technique: "Merged buffers, culled faces",
    run: ({ world }) => {
      const packed = packMeshes({
        terrain: world.voxels!.terrain,
        water: world.voxels!.water,
        roads: world.roads!.geometry,
        lit: [world.buildings!.lit, world.bridges!.lit, world.props!.lit],
        glow: [world.buildings!.glow, world.bridges!.glow, world.props!.glow],
      });
      world.meshes = packed.meshes;
      world.stats = packed.stats;
    },
    describe: (w) => `${w.stats.meshes} meshes · ${Math.round(w.stats.triangles / 1000)}k triangles`,
  },
];

/** A copy of the terrain arrays the water and voxel stages write into. */
function cloneTerrain(t: TerrainData): TerrainData {
  return { ...t, height: t.height.slice(), level: t.level.slice(), surface: t.surface.slice() };
}

const sameGroup = (a: WorldParams, b: WorldParams, group: ParamGroup) => JSON.stringify(a[group]) === JSON.stringify(b[group]);

/**
 * Runs the pipeline. With `previous` (same seed), stages before the first one whose parameters
 * changed are reused as they are.
 */
export function generate(seed: string, params: WorldParams = DEFAULT_PARAMS, previous: WorldModel | null = null): WorldModel {
  const seedHash = hashSeed(seed);
  const root = new Rng(seedHash);
  // Each stage gets its own generator, so changing one stage never changes the random numbers that
  // the stages after it receive. All are forked up front, in order, so reuse never shifts them.
  const rngs = STAGES.map((stage) => root.fork(stage.id));

  let start = 0;
  if (previous && previous.seed === seed) {
    start = STAGES.findIndex((stage) => stage.params !== undefined && !sameGroup(previous.params, params, stage.params));
    if (start < 0) return { ...previous, params };
  }

  const timings: WorldModel["timings"] = [];
  let world: WorldDraft;
  if (start > 0 && previous) {
    const { timings: before, ...layers } = previous;
    world = { ...layers, params };
    // The river carves into the terrain, so rerunning water starts from the uncarved copy.
    if (STAGES[start].id === "water") world.terrain = cloneTerrain(previous.pristineTerrain);
    timings.push(...before.slice(0, start).map((t) => ({ ...t, cached: true })));
  } else {
    world = { seed, seedHash, params, name: "", size: WORLD_SIZE, seaLevel: SEA_LEVEL };
  }

  for (let i = start; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const begin = performance.now();
    stage.run({ rng: rngs[i], world });
    timings.push({ id: stage.id, ms: performance.now() - begin, cached: false });
  }

  return { ...(world as Omit<WorldModel, "timings">), timings };
}
