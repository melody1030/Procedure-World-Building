import { hashSeed } from "../rng";
import { buildClaims, type Claims } from "./claims";
import { buildDistricts, type Districts } from "./districts";
import { gradeLots, type Grading } from "./grade";
import { planParks, type Parks } from "../city/parks";
import { paintCity } from "./urban";
import { buildHubs, type Hubs } from "./hubs";
import { buildStreets, type Streets } from "./streets";
import { buildHeights, type HeightMap } from "./heights";
import { meshColumns, type TerrainMesh } from "./mesh";
import { buildNoiseField, type NoiseField } from "./noise";
import { RIVER_VISIBLE, type ParamGroup, type TerrainParams } from "./params";
import { buildRiver, type River } from "./river";
import { shapeField } from "./shape";
import { buildSurfaces, type Surfaces } from "./surfaces";
import { buildTerraces } from "./terraces";
import { voxelize, type Columns } from "./voxelize";

/**
 * seed → terrain. Each stage reads what the earlier ones made and adds its own layer. A change
 * reruns only the stage whose parameters changed and the stages after it; the rest is reused.
 * Rendering never generates anything: it only draws the finished Terrain.
 */

export interface Terrain {
  seed: string;
  params: TerrainParams;
  field: NoiseField;
  /** The noise field after the shaping curves. */
  shaped: NoiseField;
  /** Continuous column heights, before the river and rounding. */
  heights: HeightMap;
  /** The height map after terracing: the finished ground the river carves. */
  terraced: HeightMap;
  river: River;
  /** What owns each column (river, bank; later roads, plazas, lots) and the distance to the river. */
  claims: Claims;
  /** Where the megacity starts (its center) and what is buildable, per 2 m cell. */
  hubs: Hubs;
  /** The plaza and streets, the height map they carved, and the claim map with them added. */
  streets: Streets;
  columns: Columns;
  surfaces: Surfaces;
  mesh: TerrainMesh;
  /** What cyberpunk district belongs where, per 2 m cell, and the lots along the streets. */
  districts: Districts;
  /** The lots dug level (see `gradeLots`), which the mesh shows; null when no lot slopes. */
  grading: Grading | null;
  /** What stands in the parks (paths and props, see `planParks`); null until the districts are done. */
  parks: Parks | null;
  /** The surfaces with the city painted in (see `paintCity`), which the mesh shows; null until the districts are done. */
  urban: Surfaces | null;
  /** How long each stage took; `cached` stages were reused from the previous terrain. */
  timings: { id: StageId; ms: number; cached: boolean }[];
  /** True while `districts` is still the previous terrain's: see `finishTerrain`. */
  pendingDistricts?: boolean;
}

export type StageId = "noise" | "shape" | "heights" | "terraces" | "river" | "claims" | "hubs" | "streets" | "voxelize" | "surfaces" | "mesh" | "districts";

type Draft = Pick<Terrain, "seed" | "params"> & Partial<Omit<Terrain, "seed" | "params" | "timings">>;

interface Stage {
  id: StageId;
  /** The parameter group this stage reads, if any. */
  params?: ParamGroup;
  run: (t: Draft, seed: number) => void;
}

export const STAGES: Stage[] = [
  { id: "noise", params: "noise", run: (t, seed) => (t.field = buildNoiseField(seed, t.params.noise)) },
  { id: "shape", params: "shaping", run: (t) => (t.shaped = shapeField(t.field!, t.params.shaping)) },
  // Reads Shaping's height; it runs after that stage, so a change reaches it.
  { id: "heights", run: (t) => (t.heights = buildHeights(t.shaped!, t.params.shaping)) },
  { id: "terraces", params: "terraces", run: (t, seed) => (t.terraced = buildTerraces(seed, t.heights!, t.params.terraces)) },
  // Hidden for now (see RIVER_VISIBLE): the stage still runs, as a river that is switched off.
  { id: "river", params: "river", run: (t, seed) => (t.river = buildRiver(seed, t.terraced!, RIVER_VISIBLE ? t.params.river : { ...t.params.river, enabled: false })) },
  { id: "claims", run: (t) => (t.claims = buildClaims(t.terraced!.n, t.river!)) },
  { id: "hubs", run: (t) => (t.hubs = buildHubs({ n: t.terraced!.n, h: t.river!.h, top: t.terraced!.top }, t.claims!)) },
  { id: "streets", run: (t, seed) => (t.streets = buildStreets(seed, { n: t.terraced!.n, h: t.river!.h }, t.hubs!, t.claims!)) },
  { id: "voxelize", run: (t) => (t.columns = voxelize(t.terraced!, t.streets!.h, t.river!)) },
  { id: "surfaces", params: "surfaces", run: (t, seed) => (t.surfaces = buildSurfaces(seed, t.columns!, t.river!, t.streets!.claims, t.streets!.curb, t.heights!, t.params.surfaces)) },
  // Also reads the surfaces group (ground tones); it runs after that stage, so a change reaches it.
  // The look group (voxel grid) is for the renderer only, so no stage reads it.
  {
    id: "mesh",
    run: (t) => {
      t.mesh = meshColumns(t.columns!, t.surfaces!, t.params.surfaces.tones);
      t.grading = null;
      t.parks = null;
      t.urban = null;
    },
  },
  // Districts and lots come after the mesh, so the ground can be drawn first; then the lots are
  // dug level (site grading), the parks laid out and regraded, the city's ground is painted, and the
  // mesh is redone from all of it. `columns` stays ungraded, the ground the lots were laid out on.
  {
    id: "districts",
    run: (t, seed) => {
      t.districts = buildDistricts(seed, t.columns!, t.streets!, t.hubs!, t.streets!.claims);
      t.grading = gradeLots(t.columns!, t.districts);
      t.parks = planParks(t.districts, t.grading?.ground ?? t.columns!, t.streets!.plazas[0], seed, t.grading?.dugBy ?? null);
      t.urban = paintCity(t.surfaces!, t.districts, t.grading, t.parks, t.columns!);
      t.mesh = meshColumns(t.parks.ground, t.urban, t.params.surfaces.tones);
    },
  },
];

const same = (a: TerrainParams, b: TerrainParams, group: ParamGroup) => JSON.stringify(a[group]) === JSON.stringify(b[group]);

/**
 * Runs the pipeline. With `deferDistricts` (and a previous terrain to borrow from), the last stage
 * is left out: the ground can be drawn first, `districts` stays the previous terrain's for a moment
 * (`pendingDistricts`), and `finishTerrain` runs it afterward.
 */
export function generateTerrain(seed: string, params: TerrainParams, previous: Terrain | null = null, options: { deferDistricts?: boolean } = {}): Terrain {
  let start = 0;
  if (previous && previous.seed === seed) {
    start = STAGES.findIndex((s) => s.params !== undefined && !same(previous.params, params, s.params));
    if (start < 0) return { ...previous, params };
  }
  const draft: Draft = start > 0 && previous ? { ...previous, params } : { seed, params };
  const timings: Terrain["timings"] = start > 0 && previous ? previous.timings.slice(0, start).map((t) => ({ ...t, cached: true })) : [];
  const seedHash = hashSeed(seed);
  const defer = options.deferDistricts && previous?.districts !== undefined;
  for (let i = start; i < STAGES.length; i++) {
    if (defer && STAGES[i].id === "districts") {
      draft.districts = previous!.districts;
      return { ...(draft as Omit<Terrain, "timings">), timings, pendingDistricts: true };
    }
    const begin = performance.now();
    STAGES[i].run(draft, seedHash);
    timings.push({ id: STAGES[i].id, ms: performance.now() - begin, cached: false });
  }
  return { ...(draft as Omit<Terrain, "timings">), timings, pendingDistricts: false };
}

/** Runs the stage `generateTerrain` deferred (districts), giving the finished terrain. */
export function finishTerrain(t: Terrain): Terrain {
  if (!t.pendingDistricts) return t;
  const stage = STAGES.find((s) => s.id === "districts")!;
  const draft: Draft = { ...t };
  const begin = performance.now();
  stage.run(draft, hashSeed(t.seed));
  return { ...(draft as Omit<Terrain, "timings">), timings: [...t.timings, { id: "districts", ms: performance.now() - begin, cached: false }], pendingDistricts: false };
}
