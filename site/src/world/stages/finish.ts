import type { GeometryData } from "../geometry";
import type { Rng } from "../rng";
import { STOREY, WATER_MARGIN } from "../scale";
import type { Building } from "./growth";

/**
 * Stages 12 and 13: what the renderer needs to set the mood, and packing everything for the GPU.
 */

/** Rain drops generated; the default Rain setting (35 %) draws about 3,500 of them. */
export const RAIN_DROPS = 10000;

export interface AtmosphereData {
  /** Rain drop start positions (x, y, z), spread over the whole diorama. */
  rain: Float32Array;
  /** Height of the tallest roof: fog and the rain column scale to it. */
  tallest: number;
  /** Fog density for the rainy night, thicker for taller cities so towers fade into haze. */
  haze: number;
}

/** Stage 12, atmosphere: a seeded rain field and haze sized to the skyline. */
export function buildAtmosphere(rng: Rng, n: number, buildings: Building[]): AtmosphereData {
  const tallest = buildings.reduce((m, b) => Math.max(m, b.y + (b.storeys + (b.extension?.storeys ?? 0)) * STOREY), 40);
  const extent = n / 2 + WATER_MARGIN;
  // The full field; the renderer's Rain setting decides how much of it falls.
  const drops = RAIN_DROPS;
  const rain = new Float32Array(drops * 3);
  const top = tallest + 80;
  for (let i = 0; i < drops; i++) {
    rain[i * 3] = rng.range(-extent, extent);
    rain[i * 3 + 1] = rng.range(0, top);
    rain[i * 3 + 2] = rng.range(-extent, extent);
  }
  // Exponential-squared fog: at the overview distance (~900 units) this hazes the far side by about
  // a fifth; at street level it is barely there, except between distant towers.
  return { rain, tallest, haze: 0.00042 + Math.min(0.00015, tallest / 1500000) };
}

export interface MeshSet {
  terrain: GeometryData;
  water: GeometryData;
  roads: GeometryData;
  cityLit: GeometryData;
  cityGlow: GeometryData;
}

export interface PerformanceStats {
  meshes: number;
  vertices: number;
  triangles: number;
}

/** Concatenates several geometries into one buffer set, so they draw in one call. */
export function mergeGeometry(parts: GeometryData[]): GeometryData {
  const vertices = parts.reduce((s, p) => s + p.position.length / 3, 0);
  const indices = parts.reduce((s, p) => s + p.index.length, 0);
  const out: GeometryData = {
    position: new Float32Array(vertices * 3),
    normal: new Float32Array(vertices * 3),
    color: new Float32Array(vertices * 3),
    growth: new Float32Array(vertices * 2),
    index: new Uint32Array(indices),
  };
  let v = 0;
  let i = 0;
  for (const p of parts) {
    out.position.set(p.position, v * 3);
    out.normal.set(p.normal, v * 3);
    out.color.set(p.color, v * 3);
    out.growth.set(p.growth, v * 2);
    for (let j = 0; j < p.index.length; j++) out.index[i + j] = p.index[j] + v;
    v += p.position.length / 3;
    i += p.index.length;
  }
  return out;
}

/** Stage 13, performance: one buffer per material, and the numbers that say what it costs. */
export function packMeshes(sets: { terrain: GeometryData; water: GeometryData; roads: GeometryData; lit: GeometryData[]; glow: GeometryData[] }): { meshes: MeshSet; stats: PerformanceStats } {
  const meshes: MeshSet = {
    terrain: sets.terrain,
    water: sets.water,
    roads: sets.roads,
    cityLit: mergeGeometry(sets.lit),
    cityGlow: mergeGeometry(sets.glow),
  };
  const all = Object.values(meshes);
  return {
    meshes,
    stats: {
      meshes: all.length,
      vertices: all.reduce((s, g) => s + g.position.length / 3, 0),
      triangles: all.reduce((s, g) => s + g.index.length / 3, 0),
    },
  };
}
