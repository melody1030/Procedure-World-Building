import { N4, type P2 } from "../grid";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import type { IslandData } from "./island";
import type { SuitabilityData } from "./suitability";
import type { TerrainData } from "./terrain";

/**
 * Stage 06, districts: Worley (Voronoi) cells, then rules.
 *
 * 1. Seeds: dart throwing over good ground (suitability > 0.35), at least 52 voxels apart.
 * 2. Cells: every buildable column joins its nearest seed. Distance counts terrace changes as 14
 *    extra voxels each, so cells follow the terraces instead of cutting across cliffs.
 * 3. Rules, in order:
 *    - core: the best-scoring large cell close to the harbour, plus its best neighbour on a
 *      similar level;
 *    - waterfront: low cells on the coast near the harbour (up to two);
 *    - industrial: low coastal cells far from the core;
 *    - green: the high plateau and poor ground;
 *    - residential: everything else.
 */

export type DistrictType = "core" | "residential" | "industrial" | "waterfront" | "green";

export interface District {
  id: number;
  type: DistrictType;
  seed: P2;
  centroid: P2;
  size: number;
  meanLevel: number;
  meanScore: number;
  /** Share of the cell's columns within 3 steps of water. */
  coast: number;
}

export interface DistrictData {
  /** District id per column; −1 where nothing can be built. */
  district: Int16Array;
  list: District[];
  /** Shore point nearest the bay: where the city starts. */
  harbour: P2;
}

export function buildDistricts(rng: Rng, terrain: TerrainData, island: IslandData, suit: SuitabilityData, params: WorldParams["districts"]): DistrictData {
  const { n, level } = terrain;

  // Harbour: the low shore column nearest the bay's centre.
  const bay = { x: ((island.bay.u + 1) / 2) * n, z: ((island.bay.v + 1) / 2) * n };
  let harbour: P2 = { x: n / 2, z: n / 2 };
  let best = Infinity;
  for (let k = 0; k < n * n; k++) {
    if (!suit.buildable[k] || level[k] !== 0 || suit.waterDistance[k] > 2) continue;
    const x = k % n;
    const z = (k - x) / n;
    const d = (x - bay.x) ** 2 + (z - bay.z) ** 2;
    if (d < best) {
      best = d;
      harbour = { x, z };
    }
  }

  // 1. Seeds by dart throwing.
  const candidates: number[] = [];
  for (let k = 0; k < n * n; k++) if (suit.buildable[k] && suit.score[k] > 0.35) candidates.push(k);
  const seeded = rng.int(11, 15);
  const target = params.count > 0 ? params.count : seeded;
  const seeds: P2[] = [];
  for (let tries = 0; tries < (params.count > 0 ? 8000 : 4000) && seeds.length < target && candidates.length; tries++) {
    const k = candidates[rng.int(0, candidates.length - 1)];
    const p = { x: k % n, z: Math.floor(k / n) };
    if (seeds.every((s) => (s.x - p.x) ** 2 + (s.z - p.z) ** 2 >= params.spacing ** 2)) seeds.push(p);
  }
  const seedLevel = seeds.map((s) => level[s.z * n + s.x]);

  // 2. Cells.
  const district = new Int16Array(n * n).fill(-1);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (!suit.buildable[k]) continue;
      let bestD = Infinity;
      let id = -1;
      for (let s = 0; s < seeds.length; s++) {
        const d = Math.hypot(seeds[s].x - x, seeds[s].z - z) + params.terraceCost * Math.abs(seedLevel[s] - level[k]);
        if (d < bestD) {
          bestD = d;
          id = s;
        }
      }
      district[k] = id;
    }
  }

  // Cell statistics and adjacency.
  const acc = seeds.map(() => ({ size: 0, x: 0, z: 0, level: 0, score: 0, coast: 0 }));
  const adjacent = seeds.map(() => new Set<number>());
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      const id = district[k];
      if (id < 0) continue;
      const a = acc[id];
      a.size++;
      a.x += x;
      a.z += z;
      a.level += level[k];
      a.score += suit.score[k];
      if (suit.waterDistance[k] <= 3) a.coast++;
      for (const [dx, dz] of N4) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const other = district[nz * n + nx];
        if (other >= 0 && other !== id) adjacent[id].add(other);
      }
    }
  }
  const list: District[] = seeds.map((seed, id) => {
    const a = acc[id];
    const size = Math.max(1, a.size);
    return {
      id,
      type: "residential",
      seed,
      centroid: { x: a.x / size, z: a.z / size },
      size: a.size,
      meanLevel: a.level / size,
      meanScore: a.score / size,
      coast: a.coast / size,
    };
  });

  // 3. Rules.
  const distTo = (d: District, p: P2) => Math.hypot(d.centroid.x - p.x, d.centroid.z - p.z);
  const free = () => list.filter((d) => d.type === "residential");
  const coreScore = (d: District) => d.meanScore - (0.8 * distTo(d, harbour)) / n;

  const core = list.filter((d) => d.size > 600).sort((a, b) => coreScore(b) - coreScore(a))[0] ?? list[0];
  if (core) {
    core.type = "core";
    const partner = [...adjacent[core.id]]
      .map((id) => list[id])
      .filter((d) => Math.abs(d.meanLevel - core.meanLevel) <= 1.2)
      .sort((a, b) => coreScore(b) - coreScore(a))[0];
    if (partner) partner.type = "core";
  }
  const coreCentre = core ? core.centroid : harbour;

  for (const d of free()
    .filter((d) => d.coast > 0.08 && d.meanLevel < 1.3 && distTo(d, harbour) < n * 0.45)
    .sort((a, b) => distTo(a, harbour) - distTo(b, harbour))
    .slice(0, 2))
    d.type = "waterfront";

  for (const d of free()
    .filter((d) => d.coast > 0.05 && d.meanLevel < 1.6)
    .sort((a, b) => distTo(b, coreCentre) - distTo(a, coreCentre))
    .slice(0, list.length >= 13 ? 2 : 1))
    d.type = "industrial";

  for (const d of free()) if (d.meanLevel >= terrain.levels - 1.6 || d.meanScore < 0.3) d.type = "green";
  // Keep at least two residential cells for the city to live in.
  const greens = list.filter((d) => d.type === "green").sort((a, b) => b.meanScore - a.meanScore);
  while (list.filter((d) => d.type === "residential").length < 2 && greens.length) greens.shift()!.type = "residential";

  return { district, list, harbour };
}
