import { N4 } from "../grid";
import { smoothstep } from "../noise";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import { HEIGHT_BUDGET, MAX_LANDMARKS, type HeightBand } from "../scale";
import type { DistrictData, DistrictType } from "./districts";
import { ROAD_KIND, type RoadData } from "./roads";
import type { SuitabilityData } from "./suitability";
import type { TerrainData } from "./terrain";

/**
 * Stage 08, lots and growth: the city grows by rules over a timeline from 0 to 1.
 *
 * 1. Lots: walk every road and try a lot on each side every 10–16 voxels, sized by district, facing
 *    the road. Then infill lots behind the first row in the core and residential cells. A lot must
 *    sit on one terrace, clear of roads, water and other lots, with a one-voxel alley around it.
 * 2. Value: suitability × district weight × closeness to the core.
 * 3. Simulation, 240 ticks: a lot can only be built once its road exists. Each tick the most
 *    valuable open lots are built until the built share reaches the growth curve for that time.
 *    Each building remembers how full its district already was when it went up.
 * 4. Land scarcity drives height: the height score is value × how full the district was. Ranks
 *    are then cut into the height budget (60 % low, 25 % medium, 10 % tall, 5 % landmark), with
 *    landmarks only in the core and at most three.
 * 5. Stacked housing: once the city is crowded, some early low buildings get extra floors of
 *    prefab housing added on top, late in the timeline.
 */

export type Facing = "x+" | "x-" | "z+" | "z-";

export interface Building {
  id: number;
  /** Footprint in columns: x, z of the minimum corner, width along x, depth along z. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Ground height. */
  y: number;
  type: DistrictType;
  district: number;
  /** Side facing the road. */
  front: Facing;
  value: number;
  storeys: number;
  band: HeightBand;
  birth: number;
  /** District fill when it was built (0–1): the land-scarcity input. */
  fill: number;
  extension: { storeys: number; birth: number; dx: number; dz: number } | null;
}

export type GrowthParams = WorldParams["growth"];

export interface GrowthPhase {
  name: "Outpost" | "District" | "Sprawl" | "Megacity";
  start: number;
}

export interface GrowthData {
  buildings: Building[];
  lots: number;
  phases: GrowthPhase[];
  /** Building id + 1 per column (0 = free), for props that need to know what stands where. */
  footprint: Int32Array;
}

const TYPE_WEIGHT: Record<DistrictType, number> = { core: 1, waterfront: 0.85, residential: 0.7, industrial: 0.6, green: 0.3 };
const HEIGHT_WEIGHT: Record<DistrictType, number> = { core: 1.35, waterfront: 0.9, residential: 0.8, industrial: 0.45, green: 0.2 };
const LOT_SIZE: Record<DistrictType, [number, number, number, number]> = {
  core: [12, 20, 12, 18],
  residential: [10, 15, 10, 14],
  industrial: [16, 26, 14, 22],
  waterfront: [12, 18, 10, 14],
  green: [9, 11, 9, 11],
};
const TICKS = 240;

export function buildGrowth(rng: Rng, terrain: TerrainData, suit: SuitabilityData, districts: DistrictData, roads: RoadData, params: GrowthParams): GrowthData {
  const { n, height } = terrain;
  const taken = new Uint8Array(n * n);
  const typeAt = (k: number): DistrictType | null => (districts.district[k] >= 0 ? districts.list[districts.district[k]].type : null);

  interface Lot {
    x: number;
    z: number;
    w: number;
    d: number;
    y: number;
    front: Facing;
    roadBirth: number;
  }
  const lots: Lot[] = [];

  const fits = (x: number, z: number, w: number, d: number): number | null => {
    if (x < 1 || z < 1 || x + w >= n - 1 || z + d >= n - 1) return null;
    const y = height[z * n + x];
    for (let j = z; j < z + d; j++) {
      for (let i = x; i < x + w; i++) {
        const k = j * n + i;
        if (!suit.buildable[k] || taken[k] || roads.kind[k] || height[k] !== y) return null;
      }
    }
    return y;
  };
  const claim = (lot: Lot) => {
    lots.push(lot);
    for (let j = lot.z - 1; j <= lot.z + lot.d; j++) for (let i = lot.x - 1; i <= lot.x + lot.w; i++) taken[j * n + i] = 1;
  };
  const sizeFor = (type: DistrictType) => {
    const [w0, w1, d0, d1] = LOT_SIZE[type];
    return { w: rng.int(w0, w1), d: rng.int(d0, d1) };
  };
  /** Tries a lot, shrinking it up to twice; returns its frontage length if one was placed. */
  const tryLot = (x: number, z: number, w: number, d: number, front: Facing, roadBirth: number): number => {
    for (let shrink = 0; shrink <= 4; shrink += 2) {
      const ww = w - shrink;
      const dd = d - shrink;
      if (ww < 8 || dd < 8) return 0;
      // Keep the frontage edge against the road while shrinking.
      const xx = front === "x-" ? x : front === "x+" ? x + shrink : x + shrink / 2;
      const zz = front === "z-" ? z : front === "z+" ? z + shrink : z + shrink / 2;
      const y = fits(Math.round(xx), Math.round(zz), ww, dd);
      if (y !== null) {
        claim({ x: Math.round(xx), z: Math.round(zz), w: ww, d: dd, y, front, roadBirth });
        return front[0] === "z" ? ww : dd;
      }
    }
    return 0;
  };

  // 1. Frontage lots, packed along both sides of every road.
  for (const road of roads.roads) {
    const pts = road.points;
    const reach = road.width / 2 + 2.5;
    for (const side of [1, -1]) {
      let i = 2;
      while (i < pts.length - 2) {
        const p = pts[i];
        const tx = pts[i + 1].x - pts[i - 1].x;
        const tz = pts[i + 1].z - pts[i - 1].z;
        const alongX = Math.abs(tx) >= Math.abs(tz);
        const probeX = Math.round(p.x + (alongX ? 0 : side * (reach + 3)));
        const probeZ = Math.round(p.z + (alongX ? side * (reach + 3) : 0));
        const type = probeX >= 0 && probeZ >= 0 && probeX < n && probeZ < n ? typeAt(probeZ * n + probeX) : null;
        if (!type || (type === "green" && rng.chance(0.6))) {
          i += 3;
          continue;
        }
        const { w, d } = sizeFor(type);
        let placed: number;
        if (alongX) {
          const x = p.x - w / 2;
          placed = side > 0 ? tryLot(x, p.z + reach, w, d, "z-", road.birth) : tryLot(x, p.z - reach - d, w, d, "z+", road.birth);
        } else {
          const z = p.z - d / 2;
          placed = side > 0 ? tryLot(p.x + reach, z, w, d, "x-", road.birth) : tryLot(p.x - reach - w, z, w, d, "x+", road.birth);
        }
        i += placed ? Math.max(4, Math.round(placed / 2 + 2)) : 3;
      }
    }
  }

  // Infill behind the first row: scan the whole grid in random order, near roads, in city cells.
  const nearest = nearestRoad(n, roads);
  const starts: number[] = [];
  for (let z = 2; z < n - 8; z += 3) for (let x = 2; x < n - 8; x += 3) starts.push(z * n + x);
  for (let s = starts.length - 1; s > 0; s--) {
    const j = rng.int(0, s);
    [starts[s], starts[j]] = [starts[j], starts[s]];
  }
  for (const k of starts) {
    const type = typeAt(k);
    if (!type || type === "green" || nearest.dist[k] > (type === "industrial" ? 30 : 42)) continue;
    const x = k % n;
    const z = (k - x) / n;
    const { w, d } = sizeFor(type);
    const y = fits(x, z, w, d) ?? fits(x, z, w - 2, d - 2);
    if (y === null) continue;
    const ok = fits(x, z, w, d) !== null;
    claim({ x, z, w: ok ? w : w - 2, d: ok ? d : d - 2, y, front: nearest.facing[k], roadBirth: Math.min(0.95, nearest.birth[k] + 0.06) });
  }

  // 2. Value.
  const coreCells = districts.list.filter((d) => d.type === "core");
  const core = coreCells.length ? coreCells[0].centroid : districts.harbour;
  const value = lots.map((lot) => {
    const k = (lot.z + (lot.d >> 1)) * n + lot.x + (lot.w >> 1);
    const type = typeAt(k) ?? "residential";
    const toCore = Math.hypot(lot.x + lot.w / 2 - core.x, lot.z + lot.d / 2 - core.z);
    return suit.score[k] * TYPE_WEIGHT[type] * (1 / (1 + toCore / 160)) * rng.range(0.85, 1.15);
  });

  // 3. Simulation.
  const districtOf = lots.map((lot) => districts.district[(lot.z + (lot.d >> 1)) * n + lot.x + (lot.w >> 1)]);
  const perDistrict = new Map<number, { lots: number; built: number }>();
  for (const id of districtOf) {
    const e = perDistrict.get(id) ?? { lots: 0, built: 0 };
    e.lots++;
    perDistrict.set(id, e);
  }
  const target = Math.round(lots.length * params.density);
  const order = lots.map((_, i) => i).sort((a, b) => value[b] - value[a]);
  const builtAt = new Float32Array(lots.length).fill(-1);
  const fillAt = new Float32Array(lots.length);
  const phases: GrowthPhase[] = [{ name: "Outpost", start: 0 }];
  let built = 0;
  for (let t = 1; t <= TICKS; t++) {
    const time = t / TICKS;
    const want = Math.round(target * Math.pow(smoothstep(0.02, 0.96, time), 0.9));
    for (const i of order) {
      if (built >= want) break;
      if (builtAt[i] >= 0 || lots[i].roadBirth + 0.015 > time) continue;
      const e = perDistrict.get(districtOf[i])!;
      // Scarcity felt by this building: its own district's fill, blended with the whole city's.
      fillAt[i] = 0.4 * (e.built / e.lots) + 0.6 * (built / Math.max(1, target));
      e.built++;
      builtAt[i] = time;
      built++;
    }
    const share = built / Math.max(1, target);
    const last = phases[phases.length - 1].name;
    if (last === "Outpost" && share >= 0.1) phases.push({ name: "District", start: time });
    else if (last === "District" && share >= 0.4) phases.push({ name: "Sprawl", start: time });
    else if (last === "Sprawl" && share >= 0.75) phases.push({ name: "Megacity", start: time });
  }

  // 4. Heights from land scarcity, cut into the budget.
  const maxValue = Math.max(1e-6, ...value);
  const buildings: Building[] = [];
  lots.forEach((lot, i) => {
    if (builtAt[i] < 0) return;
    const id = districtOf[i];
    const type = id >= 0 ? districts.list[id].type : "residential";
    buildings.push({
      id: buildings.length,
      ...lot,
      type,
      district: id,
      value: value[i],
      storeys: 1,
      band: "low",
      birth: builtAt[i],
      fill: fillAt[i],
      extension: null,
    });
  });
  // Scarcity first: how full the district already was decides most of the height; location only
  // ranks buildings built at similar fill. So the first buildings stay low and towers come late.
  const score = (b: Building) => Math.pow(b.fill, 1.3) * (0.5 + (0.5 * b.value) / maxValue) * HEIGHT_WEIGHT[b.type];
  const ranked = [...buildings].sort((a, b) => score(b) - score(a));
  const towerScale = (band: HeightBand) => (band === "tall" || band === "landmark" ? params.towers : 1);
  const count = (band: HeightBand) => Math.round(buildings.length * HEIGHT_BUDGET.find((h) => h.band === band)!.share * towerScale(band));

  // Landmarks are planned, not stumbled on: the most valuable big plots in the core are held for
  // them, and they go up in the Megacity phase, when the core is full.
  const megacity = phases.find((p) => p.name === "Megacity")?.start ?? 0.7;
  const prime = buildings
    .filter((b) => b.type === "core" && Math.min(b.w, b.d) >= 13)
    .sort((a, b) => b.value - a.value)
    .slice(0, params.towers > 0 ? Math.max(1, Math.min(MAX_LANDMARKS, count("landmark"))) : 0);
  prime.forEach((b, i) => {
    b.band = "landmark";
    b.birth = Math.max(b.birth, Math.min(0.95, megacity + 0.04 + 0.08 * i));
    b.fill = Math.max(b.fill, 0.9);
    const [lo, hi] = HEIGHT_BUDGET.find((h) => h.band === "landmark")!.storeys;
    b.storeys = rng.int(lo, hi);
  });

  let tall = count("tall") + Math.max(0, count("landmark") - prime.length);
  let medium = count("medium");
  for (const b of ranked) {
    if (b.band === "landmark") continue;
    // Slender lots stay low (a tower needs a footprint), and towers only rise once land is scarce.
    const wide = Math.min(b.w, b.d) >= 11;
    if (tall > 0 && wide && b.fill >= params.scarcity && (b.type === "core" || b.type === "waterfront" || b.type === "residential")) {
      b.band = "tall";
      tall--;
    } else if (medium > 0 && b.type !== "green" && b.fill >= 0.15) {
      b.band = "medium";
      medium--;
    } else b.band = "low";
    if (b.type === "industrial" && b.band !== "low") b.band = "medium";
    const [lo, hi] = HEIGHT_BUDGET.find((h) => h.band === b.band)!.storeys;
    b.storeys = b.type === "industrial" ? rng.int(1, b.band === "medium" ? 3 : 2) : rng.int(lo, hi);
  }

  // 5. Stacked housing on crowded ground.
  for (const b of buildings) {
    if ((b.type !== "residential" && b.type !== "core") || b.band === "tall" || b.band === "landmark" || b.birth > 0.6) continue;
    const e = perDistrict.get(b.district);
    if (!e || e.built / e.lots < 0.6 || !rng.chance(params.stacking)) continue;
    b.extension = { storeys: rng.int(2, 5), birth: rng.range(0.72, 0.96), dx: rng.int(-1, 1), dz: rng.int(-1, 1) };
  }

  const footprint = new Int32Array(n * n);
  for (const b of buildings) for (let j = b.z; j < b.z + b.d; j++) for (let i = b.x; i < b.x + b.w; i++) footprint[j * n + i] = b.id + 1;

  return { buildings, lots: lots.length, phases, footprint };
}

/** For every column: steps to the nearest road, that road's birth, and which way it lies. */
function nearestRoad(n: number, roads: RoadData) {
  const dist = new Uint16Array(n * n).fill(0xffff);
  const birth = new Float32Array(n * n).fill(1);
  const facing: Facing[] = new Array(n * n).fill("z-");
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  for (let k = 0; k < n * n; k++) {
    if (roads.kind[k] === ROAD_KIND.road) {
      dist[k] = 0;
      birth[k] = roads.birth[k];
      queue[tail++] = k;
    }
  }
  const towards: Facing[] = ["x-", "x+", "z-", "z+"];
  while (head < tail) {
    const k = queue[head++];
    const x = k % n;
    const z = (k - x) / n;
    N4.forEach(([dx, dz], i) => {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) return;
      const nk = nz * n + nx;
      if (dist[nk] <= dist[k] + 1) return;
      dist[nk] = dist[k] + 1;
      birth[nk] = birth[k];
      // Stepping +x away from the road means the road lies towards −x.
      facing[nk] = dist[k] === 0 ? towards[i] : facing[k];
      queue[tail++] = nk;
    });
  }
  return { dist, birth, facing };
}
