import { GeometryBuilder, lin, shade, type GeometryData } from "../geometry";
import { CITY, SIGN_NEON, WINDOW } from "../palette";
import type { WorldParams } from "../params";
import type { Rng } from "../rng";
import { STOREY } from "../scale";
import { buildingTop } from "./buildings";
import type { Building } from "./growth";
import type { RoadData } from "./roads";

/**
 * Stage 10, bridges and walkways: how the crowded city reaches across.
 *
 * - Elevated rail: the longest main roads (two by default) get a rail line four storeys above them on pillars,
 *   kept level-ish (it climbs at most 1 in 4) and always above the road. Trains run on it.
 * - Sky bridges: between pairs of towers (7+ storeys) facing each other 3–26 voxels apart with at
 *   least 4 voxels of overlap. Each bridge sits one to three storeys under the lower roof and must
 *   clear every roof and the rail in between. They appear only in the Megacity phase.
 */

export interface Rail {
  /** World-space points (x, y, z), one per voxel along the line. */
  points: { x: number; y: number; z: number }[];
  birth: number;
}

export interface BridgeData {
  lit: GeometryData;
  glow: GeometryData;
  rails: Rail[];
  skyBridges: number;
}

const RAIL_HEIGHT = 4 * STOREY;
const RAIL_BIRTH = 0.76;

export function buildBridges(rng: Rng, n: number, buildings: Building[], roads: RoadData, neon: number[], params: WorldParams["bridges"]): BridgeData {
  const half = n / 2;
  const lit = new GeometryBuilder();
  const glowB = new GeometryBuilder();
  const concrete = lin(CITY.concrete);
  const railGlow = shade(lin(SIGN_NEON.cyan), 1.6);

  // Roof height per column, to keep everything clear.
  const roof = new Float32Array(n * n);
  for (const b of buildings) {
    const top = buildingTop(b);
    for (let j = b.z; j < b.z + b.d; j++) for (let i = b.x; i < b.x + b.w; i++) roof[j * n + i] = Math.max(roof[j * n + i], top);
  }
  const railY = new Float32Array(n * n).fill(NaN);

  // Elevated rail over the two longest main roads.
  const rails: Rail[] = [];
  const mains = roads.roads.filter((r) => r.main && r.points.length > 60).sort((a, b) => b.points.length - a.points.length).slice(0, params.rails);
  for (const road of mains) {
    const ys = road.points.map((p) => p.y + RAIL_HEIGHT);
    for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] - 0.25);
    for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.max(ys[i], ys[i + 1] - 0.25);
    const points = road.points.map((p, i) => ({ x: p.x - half, y: ys[i], z: p.z - half }));
    rails.push({ points, birth: RAIL_BIRTH });
    points.forEach((p, i) => {
      lit.box(p.x - 1.5, p.y, p.z - 1.5, 3, 1, 3, concrete, RAIL_BIRTH, p.y);
      glowB.box(p.x - 0.3, p.y - 0.25, p.z - 0.3, 0.6, 0.25, 0.6, railGlow, RAIL_BIRTH, p.y);
      if (i % 14 === 7) {
        const ground = road.points[i].y + 0.1;
        lit.box(p.x - 0.8, ground, p.z - 0.8, 1.6, p.y - ground, 1.6, concrete, RAIL_BIRTH, ground);
      }
      const k = Math.round(p.z + half) * n + Math.round(p.x + half);
      if (k >= 0 && k < n * n) railY[k] = p.y;
    });
  }

  // Sky bridges.
  const towers = buildings.filter((b) => b.storeys >= 7 && b.type !== "industrial" && b.type !== "green");
  type Candidate = { a: Building; b: Building; alongX: boolean; lo: number; hi: number; gap: number; c: number };
  const candidates: Candidate[] = [];
  for (const a of towers) {
    for (const b of towers) {
      if (a === b) continue;
      if (a.x + a.w <= b.x) {
        const lo = Math.max(a.z, b.z);
        const hi = Math.min(a.z + a.d, b.z + b.d);
        const gap = b.x - (a.x + a.w);
        if (hi - lo >= 4 && gap >= 3 && gap <= 26) candidates.push({ a, b, alongX: true, lo, hi, gap, c: (lo + hi) / 2 });
      }
      if (a.z + a.d <= b.z) {
        const lo = Math.max(a.x, b.x);
        const hi = Math.min(a.x + a.w, b.x + b.w);
        const gap = b.z - (a.z + a.d);
        if (hi - lo >= 4 && gap >= 3 && gap <= 26) candidates.push({ a, b, alongX: false, lo, hi, gap, c: (lo + hi) / 2 });
      }
    }
  }
  candidates.sort((p, q) => (p.a.type === "core" ? 0 : 1) - (q.a.type === "core" ? 0 : 1) || p.gap - q.gap);
  const used = new Set<number>();
  let skyBridges = 0;
  for (const cand of candidates) {
    if (skyBridges >= params.skyBridges) break;
    const { a, b } = cand;
    if (used.has(a.id) || used.has(b.id)) continue;
    const topA = a.y + a.storeys * STOREY;
    const topB = b.y + b.storeys * STOREY;
    const y = Math.min(topA, topB) - STOREY * rng.int(1, 3);
    if (y < Math.max(a.y, b.y) + 3 * STOREY) continue;
    const from = cand.alongX ? a.x + a.w : a.z + a.d;
    const to = cand.alongX ? b.x : b.z;
    let clear = true;
    for (let s = from; s < to && clear; s++) {
      for (let o = -2; o <= 2; o++) {
        const x = cand.alongX ? s : Math.round(cand.c) + o;
        const z = cand.alongX ? Math.round(cand.c) + o : s;
        const k = z * n + x;
        if (roof[k] > y - 1 || Math.abs(railY[k] - y) < 8) clear = false;
      }
    }
    if (!clear) continue;
    used.add(a.id);
    used.add(b.id);
    skyBridges++;
    const birth = Math.max(0.74, Math.max(a.birth, b.birth) + 0.03);
    const len = to - from;
    const glass = lin(CITY.glass);
    const strip = shade(lin(neon[skyBridges % neon.length]), 1.8);
    const light = shade(lin(WINDOW.cool[skyBridges % 4]), 0.9);
    if (cand.alongX) {
      const x0 = from - half;
      const z0 = cand.c - 1.5 - half;
      lit.box(x0, y, z0, len, 3, 3, glass, birth, y, { bottom: true });
      glowB.box(x0, y - 0.25, z0 + 1.2, len, 0.25, 0.6, strip, birth, y);
      glowB.panel("z+", z0 + 3.05, x0 + 0.5, x0 + len - 0.5, y + 1, y + 2, light, birth, y);
      glowB.panel("z-", z0 - 0.05, x0 + 0.5, x0 + len - 0.5, y + 1, y + 2, light, birth, y);
    } else {
      const x0 = cand.c - 1.5 - half;
      const z0 = from - half;
      lit.box(x0, y, z0, 3, 3, len, glass, birth, y, { bottom: true });
      glowB.box(x0 + 1.2, y - 0.25, z0, 0.6, 0.25, len, strip, birth, y);
      glowB.panel("x+", x0 + 3.05, z0 + 0.5, z0 + len - 0.5, y + 1, y + 2, light, birth, y);
      glowB.panel("x-", x0 - 0.05, z0 + 0.5, z0 + len - 0.5, y + 1, y + 2, light, birth, y);
    }
  }

  return { lit: lit.finish(), glow: glowB.finish(), rails, skyBridges };
}
