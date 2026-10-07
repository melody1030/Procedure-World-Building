import { DEFAULT_PARAMS, type ParamGroup, type WorldParams } from "./params";
import { Rng, hashSeed } from "./rng";
import { SEA_LEVEL, WORLD_SIZE } from "./scale";
import { buildIsland, type IslandData } from "./stages/island";
import { buildTerrain, type TerrainData } from "./stages/terrain";
import { buildVoxels, type VoxelMeshes } from "./stages/voxels";

/**
 * seed → rules → world. `generate` runs the stages in order; each stage reads what earlier stages
 * wrote into the world and adds its own layer. Rendering never generates anything: it only draws
 * the WorldModel, so the same seed (and parameters) always shows the same world.
 *
 * Changing a parameter only reruns the stage that reads it and the stages after it: the earlier
 * layers are taken from the previous world.
 */

export { DEFAULT_PARAMS, type WorldParams };

export interface WorldModel {
  seed: string;
  /** The seed text hashed to a number; every stage's randomness starts here. */
  seedHash: number;
  params: WorldParams;
  /** A generated place name, so each seed feels like its own island. */
  name: string;
  /** Land is WORLD_SIZE × WORLD_SIZE voxels, centred on the origin. */
  size: number;
  seaLevel: number;
  island: IslandData;
  terrain: TerrainData;
  voxels: VoxelMeshes;
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

export type StageId = "base" | "island" | "terrain" | "voxels";

export interface Stage {
  id: StageId;
  label: string;
  /** The class technique this stage puts to work. */
  technique: string;
  /** The parameter group this stage reads, if any. */
  params?: ParamGroup;
  run: (ctx: StageContext) => void;
}

const NAME_START = ["Ka", "Ri", "So", "Lun", "Ve", "Ta", "Mo", "Zen", "Har", "Ku", "No", "Sai", "Ren", "Oru", "Tes"];
const NAME_END = ["ri", "sa", "vel", "ton", "ka", "mura", "hold", "reach", "wan", "shi", "port", "gate", "moor"];
const NAME_PREFIX = ["Port", "New", "Upper", "Neo", "Old", "Lower", "Cape"];

function worldName(rng: Rng): string {
  const core = rng.pick(NAME_START) + rng.pick(NAME_END);
  return rng.chance(0.5) ? `${rng.pick(NAME_PREFIX)} ${core}` : core;
}

/** The stages, in the order they run. */
export const STAGES: Stage[] = [
  {
    id: "base",
    label: "Diorama base",
    technique: "Seeded randomness",
    run: ({ rng, world }) => {
      world.name = worldName(rng);
    },
  },
  {
    id: "island",
    label: "Island shape",
    technique: "Radial falloff, domain warp",
    params: "island",
    run: ({ rng, world }) => {
      world.island = buildIsland(rng, world.params.island);
    },
  },
  {
    id: "terrain",
    label: "Terrain & terraces",
    technique: "fBm, ridged noise, erosion",
    params: "terrain",
    run: ({ rng, world }) => {
      world.terrain = buildTerrain(rng, world.island!, world.params.terrain);
    },
  },
  {
    id: "voxels",
    label: "Voxelise",
    technique: "Greedy meshing",
    run: ({ rng, world }) => {
      world.voxels = buildVoxels(rng, world.terrain!);
    },
  },
];

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
