import { GeometryBuilder, lin, shade, type GeometryData } from "../geometry";
import { N4, type P2 } from "../grid";
import { fbm, smoothstep } from "../noise";
import { CITY } from "../palette";
import type { TreeMethod, WorldParams } from "../params";
import { Rng, hash2 } from "../rng";
import { SEA_LEVEL, SHORE_TOP, STOREY } from "../scale";
import type { DistrictData } from "./districts";
import type { Building } from "./growth";
import { ROAD_KIND, type RoadData } from "./roads";
import type { SuitabilityData } from "./suitability";
import type { TerrainData } from "./terrain";
import type { WaterData } from "./water";

/**
 * Stage 11, props and population: scattering by masks, and props that adapt to where they land.
 *
 * - Trees: candidates from a jittered grid, uniform random points or a Poisson disk (Week 5), then
 *   kept on free grass by a noise mask that clusters them into groves and clearings. Dense in green
 *   districts, sparse in the city.
 * - Lights (context-sensitive, like Town to City's lanterns): every lamp spot along a road checks
 *   what is around it. Next to a wall it becomes a wall bracket; on open ground a lamp post. Piers
 *   get buoy lanterns floating on the water.
 * - Harbour: piers out over the sea from waterfront and industrial shores, on stilts, with cranes,
 *   moored boats and buoys.
 * - Cables strung across narrow streets between facing buildings, with hanging lanterns.
 * - People on plazas and sidewalks.
 * - A hero: one glowing cherry tree in the main plaza.
 * - Traffic routes: the roads cars will drive along.
 */

export interface CarPath {
  points: { x: number; y: number; z: number }[];
  birth: number;
  width: number;
}

export interface PropsData {
  lit: GeometryData;
  glow: GeometryData;
  carPaths: CarPath[];
  counts: { trees: number; posts: number; brackets: number; buoys: number; piers: number; cables: number; people: number };
  hero: P2 | null;
}

const glow = (hex: number, s: number) => shade(lin(hex), s);

export function buildProps(
  rng: Rng,
  terrain: TerrainData,
  water: WaterData,
  suit: SuitabilityData,
  districts: DistrictData,
  roads: RoadData,
  buildings: Building[],
  footprint: Int32Array,
  neon: number[],
  params: WorldParams["props"],
): PropsData {
  const { n, height, level } = terrain;
  const half = n / 2;
  const lit = new GeometryBuilder();
  const glw = new GeometryBuilder();
  const counts = { trees: 0, posts: 0, brackets: 0, buoys: 0, piers: 0, cables: 0, people: 0 };
  const taken = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) if (footprint[k] || roads.kind[k] || !suit.buildable[k]) taken[k] = 1;
  const typeAt = (k: number) => (districts.district[k] >= 0 ? districts.list[districts.district[k]].type : null);
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n;

  // Trees.
  const seedGrove = rng.int(0, 1e6);
  for (const { x, z } of treeCandidates(params.method, n, seedGrove)) {
    if (!inside(x, z) || x < 2 || z < 2 || x >= n - 2 || z >= n - 2) continue;
    const k = z * n + x;
    if (suit.edgeDistance[k] < 2) continue;
    let free = true;
    for (let dz = -1; dz <= 1 && free; dz++) for (let dx = -1; dx <= 1; dx++) if (taken[k + dz * n + dx]) free = false;
    if (!free) continue;
    const type = typeAt(k);
    const grove = smoothstep(-0.1, 0.45, fbm(x / params.groveSize, z / params.groveSize, seedGrove, 3));
    const p = type === "green" ? 0.6 * grove : type === "residential" ? 0.14 * grove : type === "core" ? 0.05 : 0.03;
    if (hash2(x, z, 13) > p * params.trees) continue;
    const y = height[k];
    const natural = type === "green";
    const birth = natural ? 0 : 0.3 + 0.4 * hash2(x, z, 14);
    const cx = x - half + 0.5;
    const cz = z - half + 0.5;
    const leaf = lin(CITY.tree[Math.floor(hash2(x, z, 15) * CITY.tree.length)]);
    const tall = hash2(x, z, 16) < 0.35;
    const th = tall ? 2.5 : 2 + hash2(x, z, 17) * 2;
    lit.box(cx - 0.4, y, cz - 0.4, 0.8, th, 0.8, lin(CITY.trunk), birth, y);
    if (tall) {
      lit.box(cx - 1.8, y + th, cz - 1.8, 3.6, 2.2, 3.6, leaf, birth, y);
      lit.box(cx - 1.3, y + th + 2.2, cz - 1.3, 2.6, 2.2, 2.6, shade(leaf, 1.08), birth, y);
      lit.box(cx - 0.7, y + th + 4.4, cz - 0.7, 1.4, 1.8, 1.4, shade(leaf, 1.15), birth, y);
    } else {
      lit.box(cx - 2, y + th, cz - 2, 4, 2.6, 4, leaf, birth, y);
      lit.box(cx - 1.4, y + th + 2.6, cz - 1.4, 2.8, 1.4, 2.8, shade(leaf, 1.1), birth, y);
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) taken[k + dz * n + dx] = 1;
    counts.trees++;
  }

  // Lights along roads: post or wall bracket, decided by what is next to the spot.
  const lampGlow = glow(CITY.lamp, 2.2);
  const metal = lin(CITY.metal);
  for (const road of roads.roads) {
    if (road.width < 6) continue;
    const pts = road.points;
    let side = 1;
    for (let i = 4; i < pts.length - 4; i += params.lampSpacing) {
      side = -side;
      const p = pts[i];
      const tx = pts[i + 1].x - pts[i - 1].x;
      const tz = pts[i + 1].z - pts[i - 1].z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = (-tz / len) * side;
      const nz = (tx / len) * side;
      const off = road.width / 2 + 1;
      const lx = p.x + nx * off;
      const lz = p.z + nz * off;
      const k = Math.round(lz) * n + Math.round(lx);
      if (!inside(Math.round(lx), Math.round(lz))) continue;
      const y = Number.isNaN(roads.deckY[k]) ? height[k] : roads.deckY[k];
      if (Math.abs(y - p.y) > 1.5) continue;
      // Look for a wall within 2.5 voxels further out.
      let wall: Building | null = null;
      let wallAt = 0;
      for (let s = 0.5; s <= 2.5 && !wall; s += 0.5) {
        const wx = Math.round(lx + nx * s);
        const wz = Math.round(lz + nz * s);
        if (!inside(wx, wz)) break;
        const id = footprint[wz * n + wx];
        if (id && buildings[id - 1].storeys >= 1) {
          wall = buildings[id - 1];
          wallAt = s;
        }
      }
      const wx = lx - half;
      const wz = lz - half;
      if (wall) {
        const birth = Math.max(road.birth, wall.birth) + 0.02;
        const ax = wx + nx * (wallAt - 0.5);
        const az = wz + nz * (wallAt - 0.5);
        const hy = y + 4.2;
        lit.box(ax - 0.3, hy - 0.6, az - 0.3, 0.6, 1.2, 0.6, metal, birth, y);
        lit.box(Math.min(ax, ax - nx * 1.4) - 0.1, hy, Math.min(az, az - nz * 1.4) - 0.1, Math.abs(nx) * 1.4 + 0.2, 0.2, Math.abs(nz) * 1.4 + 0.2, metal, birth, y);
        glw.box(ax - nx * 1.4 - 0.35, hy - 0.8, az - nz * 1.4 - 0.35, 0.7, 0.8, 0.7, lampGlow, birth, y);
        counts.brackets++;
      } else {
        const birth = road.birth + 0.03;
        lit.box(wx - 0.2, y, wz - 0.2, 0.4, 5.6, 0.4, metal, birth, y);
        lit.box(Math.min(wx, wx - nx * 1.5) - 0.1, y + 5.4, Math.min(wz, wz - nz * 1.5) - 0.1, Math.abs(nx) * 1.5 + 0.2, 0.2, Math.abs(nz) * 1.5 + 0.2, metal, birth, y);
        glw.box(wx - nx * 1.5 - 0.45, y + 5.0, wz - nz * 1.5 - 0.45, 0.9, 0.4, 0.9, lampGlow, birth, y);
        counts.posts++;
      }
    }
  }

  // Harbour piers.
  const isSea = (k: number) => level[k] < 0 && water.kind[k] === 0;
  const piers: P2[] = [];
  const shore: number[] = [];
  for (let k = 0; k < n * n; k++) {
    if (!suit.buildable[k] || level[k] !== 0 || footprint[k]) continue;
    const type = typeAt(k);
    const x = k % n;
    const z = (k - x) / n;
    const nearHarbour = Math.hypot(x - districts.harbour.x, z - districts.harbour.z) < 70;
    if (type !== "waterfront" && type !== "industrial" && !nearHarbour) continue;
    if (suit.waterDistance[k] !== 1) continue;
    shore.push(k);
  }
  for (let s = shore.length - 1; s > 0; s--) {
    const j = rng.int(0, s);
    [shore[s], shore[j]] = [shore[j], shore[s]];
  }
  const boat = lin(0x2a3038);
  for (const k of shore) {
    if (piers.length >= params.piers) break;
    const x = k % n;
    const z = (k - x) / n;
    if (piers.some((p) => Math.hypot(p.x - x, p.z - z) < 26)) continue;
    const dir = N4.find(([dx, dz]) => inside(x + dx, z + dz) && isSea((z + dz) * n + x + dx));
    if (!dir) continue;
    const [dx, dz] = dir;
    const want = rng.int(14, 28);
    let len = 0;
    while (len < want) {
      const px = x + dx * (len + 1);
      const pz = z + dz * (len + 1);
      let ok = inside(px, pz);
      for (let o = -2; o <= 2 && ok; o++) {
        const ox = px + (dz !== 0 ? o : 0);
        const oz = pz + (dx !== 0 ? o : 0);
        ok = inside(ox, oz) && isSea(oz * n + ox);
      }
      if (!ok) break;
      len++;
    }
    if (len < 8) continue;
    piers.push({ x, z });
    counts.piers++;
    const birth = 0.04 + 0.3 * rng.next();
    const deckTop = SHORE_TOP - 0.4;
    // Deck from the shore column outward, 4 wide.
    const sx = x - half + 0.5 + dx * 0.5;
    const sz = z - half + 0.5 + dz * 0.5;
    const ex = sx + dx * len;
    const ez = sz + dz * len;
    const bx0 = Math.min(sx, ex) - (dz !== 0 ? 2 : 0);
    const bz0 = Math.min(sz, ez) - (dx !== 0 ? 2 : 0);
    const bw = dx !== 0 ? len : 4;
    const bd = dz !== 0 ? len : 4;
    lit.box(bx0, deckTop - 0.6, bz0, bw, 0.6, bd, lin(0x4a4038), birth, deckTop);
    for (let s = 2; s < len; s += 4) {
      for (const o of [-1.8, 1.4]) {
        const px = sx + dx * s + (dz !== 0 ? o : 0);
        const pz = sz + dz * s + (dx !== 0 ? o : 0);
        const kk = Math.round(pz + half) * n + Math.round(px + half);
        const bed = kk >= 0 && kk < n * n ? height[kk] : SEA_LEVEL - 6;
        lit.box(px, bed, pz, 0.4, deckTop - 0.6 - bed, 0.4, lin(0x3a3028), birth, deckTop);
      }
    }
    // Buoy lanterns off the pier's end and sides: on water, a light becomes a buoy.
    for (const s of [len * 0.5, len + 2]) {
      for (const o of s > len ? [0] : [-3.5, 3.5]) {
        const px = sx + dx * s + (dz !== 0 ? o : 0);
        const pz = sz + dz * s + (dx !== 0 ? o : 0);
        lit.box(px - 0.5, SEA_LEVEL - 0.2, pz - 0.5, 1, 0.7, 1, lin(0x8a2e2e), birth, SEA_LEVEL);
        glw.box(px - 0.3, SEA_LEVEL + 0.5, pz - 0.3, 0.6, 0.6, 0.6, glow(0xffb340, 2.4), birth, SEA_LEVEL);
        counts.buoys++;
      }
    }
    // A moored boat alongside.
    if (rng.chance(0.6)) {
      const o = rng.chance(0.5) ? 4.5 : -6.5;
      const bl = Math.min(10, len - 3);
      const px = sx + dx * 3 + (dz !== 0 ? o : 0);
      const pz = sz + dz * 3 + (dx !== 0 ? o : 0);
      const w = dx !== 0 ? bl : 2.6;
      const d = dz !== 0 ? bl : 2.6;
      lit.box(Math.min(px, px + dx * bl) , SEA_LEVEL - 0.4, Math.min(pz, pz + dz * bl), w, 1.6, d, boat, birth, SEA_LEVEL);
      lit.box(Math.min(px, px + dx * bl) + w * 0.3, SEA_LEVEL + 1.2, Math.min(pz, pz + dz * bl) + d * 0.3, w * 0.35, 1.4, d * 0.35, lin(0xc8ccd2), birth, SEA_LEVEL);
      glw.box(Math.min(px, px + dx * bl) + w * 0.3 - 0.05, SEA_LEVEL + 1.7, Math.min(pz, pz + dz * bl) + d * 0.3 - 0.05, w * 0.35 + 0.1, 0.4, d * 0.35 + 0.1, glow(0xffd08a, 1.2), birth, SEA_LEVEL);
    }
    // A crane on the first two piers.
    if (counts.piers <= 2 && len >= 14) {
      const craneBirth = birth + 0.15;
      const ch = 24;
      const legs = [-1.6, 1.6];
      for (const o of legs) {
        const px = sx + dx * 2 + (dz !== 0 ? o : 0);
        const pz = sz + dz * 2 + (dx !== 0 ? o : 0);
        lit.box(px - 0.5, deckTop, pz - 0.5, 1, ch, 1, lin(0xb07a2a), craneBirth, deckTop);
      }
      const reach = len + 6;
      const jx0 = Math.min(sx - dx * 6, sx + dx * reach) - (dz !== 0 ? 0.6 : 0);
      const jz0 = Math.min(sz - dz * 6, sz + dz * reach) - (dx !== 0 ? 0.6 : 0);
      lit.box(jx0, deckTop + ch, jz0, dx !== 0 ? reach + 6 : 1.2, 1.4, dz !== 0 ? reach + 6 : 1.2, lin(0xb07a2a), craneBirth, deckTop);
      lit.box(sx + dx * 2 - 1.5, deckTop + ch - 3, sz + dz * 2 - 1.5, 3, 3, 3, lin(0x3a4048), craneBirth, deckTop);
      glw.box(sx + dx * reach - 0.3, deckTop + ch + 1.4, sz + dz * reach - 0.3, 0.6, 0.6, 0.6, glow(0xff3b3b, 2.4), craneBirth, deckTop);
    }
  }

  // Cables with lanterns across narrow streets.
  const roofAt = (x: number, z: number) => {
    const id = footprint[z * n + x];
    return id ? buildings[id - 1].y + buildings[id - 1].storeys * STOREY : -Infinity;
  };
  const tallEnough = buildings.filter((b) => b.storeys >= 3 && b.type !== "industrial" && b.type !== "green");
  for (const a of tallEnough) {
    if (counts.cables >= params.cables) break;
    for (const b of tallEnough) {
      if (a === b || counts.cables >= params.cables) continue;
      const alongX = a.x + a.w <= b.x && Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z) >= 2;
      const alongZ = a.z + a.d <= b.z && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= 2;
      if (!alongX && !alongZ) continue;
      const gap = alongX ? b.x - (a.x + a.w) : b.z - (a.z + a.d);
      if (gap < 6 || gap > 16 || hash2(a.id, b.id, 21) > 0.5) continue;
      const y = Math.min(a.y + a.storeys * STOREY, b.y + b.storeys * STOREY) - rng.range(2, 6);
      if (y < Math.max(a.y, b.y) + 5) continue;
      const c = alongX ? (Math.max(a.z, b.z) + Math.min(a.z + a.d, b.z + b.d)) / 2 : (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2;
      const from = alongX ? a.x + a.w : a.z + a.d;
      let clear = true;
      for (let s = from; s < from + gap; s++) if (roofAt(alongX ? s : Math.round(c), alongX ? Math.round(c) : s) > y - 3) clear = false;
      if (!clear) continue;
      const birth = Math.max(a.birth, b.birth) + 0.02;
      const sags = [0, 0.9, 1.4, 0.9];
      const seg = gap / 4;
      for (let s = 0; s < 4; s++) {
        const s0 = from + s * seg - half;
        const sy = y - sags[s];
        if (alongX) lit.box(s0, sy, c - half - 0.06, seg, 0.12, 0.12, lin(0x15181e), birth, sy);
        else lit.box(c - half - 0.06, sy, s0, 0.12, 0.12, seg, lin(0x15181e), birth, sy);
      }
      for (let l = 1; l <= 3; l++) {
        const s0 = from + l * seg - half;
        const sy = y - sags[l] - 0.8;
        const colour = l === 2 ? neon[(a.id + b.id) % neon.length] : 0xff4a3a;
        if (alongX) glw.box(s0 - 0.3, sy, c - half - 0.3, 0.6, 0.7, 0.6, glow(colour, 2), birth, sy);
        else glw.box(c - half - 0.3, sy, s0 - 0.3, 0.6, 0.7, 0.6, glow(colour, 2), birth, sy);
      }
      counts.cables++;
    }
  }

  // People on plazas and sidewalks.
  for (let k = 0; k < n * n; k++) {
    const kind = roads.kind[k];
    if (kind !== ROAD_KIND.plaza && kind !== ROAD_KIND.sidewalk) continue;
    const x = k % n;
    const z = (k - x) / n;
    if (hash2(x, z, 31) > (kind === ROAD_KIND.plaza ? 0.025 : 0.006) * params.people) continue;
    const y = roads.deckY[k] + (kind === ROAD_KIND.sidewalk ? 0.25 : 0.1);
    const birth = roads.birth[k] + 0.05;
    const px = x - half + 0.2;
    const pz = z - half + 0.2;
    const clothes = lin(CITY.clothes[Math.floor(hash2(x, z, 32) * CITY.clothes.length)]);
    lit.box(px, y, pz, 0.6, 1.6, 0.6, lin(0x1e222a), birth, y);
    lit.box(px - 0.1, y + 1.6, pz - 0.05, 0.8, 1.3, 0.7, clothes, birth, y);
    lit.box(px + 0.05, y + 2.9, pz + 0.05, 0.5, 0.55, 0.5, lin(CITY.skin), birth, y);
    counts.people++;
  }

  // The hero: a glowing cherry tree in the biggest plaza.
  const plaza = [...roads.plazas].sort((a, b) => b.r - a.r)[0];
  let hero: P2 | null = null;
  if (plaza) {
    hero = { x: plaza.x, z: plaza.z };
    const cx = plaza.x - half;
    const cz = plaza.z - half;
    const y = plaza.y + 0.1;
    const birth = Math.min(0.55, plaza.birth + 0.25);
    const bark = lin(0x3a2a2a);
    lit.box(cx - 3.5, y, cz - 3.5, 7, 0.8, 7, lin(CITY.concrete), birth, y);
    lit.box(cx - 0.9, y, cz - 0.9, 1.8, 9, 1.8, bark, birth, y);
    lit.box(cx - 0.6, y + 6, cz - 4, 1.2, 1.2, 4, bark, birth, y);
    lit.box(cx, y + 7, cz - 0.6, 4, 1.2, 1.2, bark, birth, y);
    const petal = lin(CITY.petal);
    for (let i = 0; i < 260; i++) {
      const a = hash2(i, 1, 41) * Math.PI * 2;
      const r = Math.sqrt(hash2(i, 2, 41)) * 7.5;
      const h = 8 + hash2(i, 3, 41) * 6 - (r * r) / 14;
      const bx = cx + Math.cos(a) * r - 0.9;
      const bz = cz + Math.sin(a) * r - 0.9;
      if (hash2(i, 4, 41) < 0.55) glw.box(bx, y + h, bz, 1.8, 1.8, 1.8, glow(CITY.blossom, 1.2 + hash2(i, 5, 41)), birth, y);
      else lit.box(bx, y + h, bz, 1.8, 1.8, 1.8, petal, birth, y);
    }
    for (let i = 0; i < 70; i++) {
      const a = hash2(i, 6, 41) * Math.PI * 2;
      const r = 2 + hash2(i, 7, 41) * 9;
      lit.box(cx + Math.cos(a) * r, y + 0.02, cz + Math.sin(a) * r, 0.6, 0.06, 0.6, petal, birth, y, { noSides: true });
    }
  }

  const carPaths: CarPath[] = roads.roads.filter((r) => r.width >= 6).map((r) => ({ points: r.points.map((p) => ({ x: p.x - half, y: p.y + 0.1, z: p.z - half })), birth: r.birth, width: r.width }));

  return { lit: lit.finish(), glow: glw.finish(), carPaths, counts, hero };
}

/** Spacing of the jittered grid, and the Poisson disk radius: a tree crown is about 4 voxels wide. */
const TREE_CELL = 3;
const TREE_RADIUS = 4.5;

/**
 * Where trees may be tried, before any rule (Week 5's distributions):
 * - grid: one point per 3 × 3 cell, jittered inside it, so coverage is even but not regular;
 * - random: the same number of points, uniform anywhere, so they clump and leave gaps;
 * - poisson: dart throwing with a minimum distance, so no two candidates are closer than a crown.
 */
function treeCandidates(method: TreeMethod, n: number, seed: number): P2[] {
  const out: P2[] = [];
  if (method === "grid") {
    for (let gz = 0; gz < n; gz += TREE_CELL) {
      for (let gx = 0; gx < n; gx += TREE_CELL) out.push({ x: gx + Math.floor(hash2(gx, gz, 11) * TREE_CELL), z: gz + Math.floor(hash2(gx, gz, 12) * TREE_CELL) });
    }
    return out;
  }
  const rng = new Rng(seed ^ 0x5bd1e995);
  const count = Math.ceil(n / TREE_CELL) ** 2;
  if (method === "random") {
    for (let i = 0; i < count; i++) out.push({ x: rng.int(0, n - 1), z: rng.int(0, n - 1) });
    return out;
  }
  // Poisson disk by dart throwing, with a background grid so each test only looks at nearby points.
  const cell = TREE_RADIUS / Math.SQRT2;
  const cells = Math.ceil(n / cell);
  const grid = new Int32Array(cells * cells).fill(-1);
  for (let t = 0; t < count * 3; t++) {
    const x = rng.range(0, n);
    const z = rng.range(0, n);
    const ci = Math.floor(x / cell);
    const cj = Math.floor(z / cell);
    let ok = true;
    for (let j = Math.max(0, cj - 2); j <= Math.min(cells - 1, cj + 2) && ok; j++) {
      for (let i = Math.max(0, ci - 2); i <= Math.min(cells - 1, ci + 2); i++) {
        const o = grid[j * cells + i];
        if (o >= 0 && (out[o].x - x) ** 2 + (out[o].z - z) ** 2 < TREE_RADIUS ** 2) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    grid[cj * cells + ci] = out.length;
    out.push({ x, z });
  }
  return out.map((p) => ({ x: Math.floor(p.x), z: Math.floor(p.z) }));
}
