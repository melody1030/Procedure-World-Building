import type { GeometryData } from "../geometry";
import { CLAIM } from "./claims";
import { meshCut } from "./mesh";
import type { Terrain } from "./pipeline";
import { NO_WATER } from "./voxelize";

/**
 * The build animation's data. The finished ground is drawn as always; this adds what the later
 * stages changed, so the timeline can replay them in order:
 *
 * 1. the terrain prints from the plinth up, as it was before the river and the streets;
 * 2. the river carves its channel (the cut ground is dug away from the top down);
 * 3. the river fills, its water running down the channel from the source to the mouth;
 * 4. the plaza is paved, from its center out;
 * 5. the streets grow from the plaza along the network, cutting and paving as they go.
 *
 * Nothing here changes the terrain: it is drawn on top of it and cleared as the timeline passes.
 */

/** The timeline's phases, each ending at its share of the whole (0–1). */
export const BUILD_PHASES = [
  { id: "terrain", label: "Printing terrain", end: 0.32 },
  { id: "river", label: "Carving the river", end: 0.5 },
  { id: "water", label: "Filling the river", end: 0.6 },
  { id: "plaza", label: "Building the plaza", end: 0.68 },
  { id: "streets", label: "Growing streets", end: 1 },
] as const;

/** Where paving starts on the timeline, and the plaza's share of the paving that follows. */
export const PAVING_FROM = BUILD_PHASES[2].end;
const PLAZA_SHARE = (BUILD_PHASES[3].end - PAVING_FROM) / (1 - PAVING_FROM);

export interface BuildUp {
  n: number;
  /** The ground the river cut away (null if none), and the ground the plaza and streets cut away. */
  riverCut: GeometryData | null;
  streetCut: GeometryData | null;
  /**
   * When each paved column is built, as a share of the paving (0–1]: the plaza from its center
   * out, then the streets by their distance along the network from the plaza. 0 elsewhere.
   */
  order: Float32Array<ArrayBuffer>;
  /** When the water reaches each channel column, as a share of the fill (0–1], from the source down. */
  flow: Float32Array<ArrayBuffer>;
  /** The highest ground at any point of the build, in voxels. */
  top: number;
  /** The river cut's highest top and lowest floor. */
  riverHigh: number;
  riverLow: number;
}

export function buildUp(t: Terrain): BuildUp {
  const { n, height, water } = t.columns;
  const claim = t.streets.claims.claim;
  const paved = (k: number) => claim[k] === CLAIM.road || claim[k] === CLAIM.verge || claim[k] === CLAIM.plaza;
  const before = (h: number) => Math.max(1, Math.round(h));

  // The two cuts: ground above the finished ground before the river (off the street land) and
  // before the streets (on it).
  const riverTop = new Int16Array(n * n).fill(NO_WATER);
  const streetTop = new Int16Array(n * n).fill(NO_WATER);
  let top = t.columns.max;
  let riverHigh = 0;
  let riverLow = Infinity;
  for (let k = 0; k < n * n; k++) {
    if (paved(k)) {
      const h = before(t.river.h[k]);
      if (h > height[k]) streetTop[k] = h;
      top = Math.max(top, h);
    } else {
      const h = before(t.terraced.h[k]);
      if (h > height[k]) {
        riverTop[k] = h;
        riverHigh = Math.max(riverHigh, h);
        riverLow = Math.min(riverLow, height[k]);
        top = Math.max(top, h);
      }
    }
  }

  // Paving order: the plaza by its distance from the center, then a walk outward along the paved
  // land from the plaza's edge.
  const order = new Float32Array(n * n);
  const dist = new Int32Array(n * n).fill(-1);
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  const plaza = t.streets.plazas[0];
  for (let k = 0; k < n * n; k++) {
    if (claim[k] !== CLAIM.plaza) continue;
    const d = plaza ? Math.max(Math.abs((k % n) - plaza.x), Math.abs(Math.floor(k / n) - plaza.z)) / Math.max(1, plaza.half) : 1;
    order[k] = Math.max(1e-3, PLAZA_SHARE * Math.min(1, d));
    dist[k] = 0;
    queue[tail++] = k;
  }
  let far = 1;
  while (head < tail) {
    const k = queue[head++];
    const x = k % n;
    const z = (k - x) / n;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const j = nz * n + nx;
      if (dist[j] >= 0 || !paved(j)) continue;
      dist[j] = dist[k] + 1;
      far = Math.max(far, dist[j]);
      queue[tail++] = j;
    }
  }
  for (let k = 0; k < n * n; k++) {
    if (!paved(k) || claim[k] === CLAIM.plaza) continue;
    order[k] = dist[k] < 0 ? 1 : PLAZA_SHARE + (1 - PLAZA_SHARE) * (dist[k] / far);
  }

  // Water flow: a walk along the channel from the columns at the river's source.
  const flow = new Float32Array(n * n);
  const channel = t.river.channel;
  const source = t.river.path?.curve[0];
  if (channel && source) {
    const reach = new Int32Array(n * n).fill(-1);
    head = 0;
    tail = 0;
    for (let k = 0; k < n * n; k++) {
      if (!channel[k] || Math.hypot((k % n) - source.x, Math.floor(k / n) - source.z) > 12) continue;
      reach[k] = 0;
      queue[tail++] = k;
    }
    let longest = 1;
    while (head < tail) {
      const k = queue[head++];
      const x = k % n;
      const z = (k - x) / n;
      for (const j of [x + 1 < n ? k + 1 : -1, x > 0 ? k - 1 : -1, z + 1 < n ? k + n : -1, z > 0 ? k - n : -1]) {
        if (j < 0 || reach[j] >= 0 || !channel[j]) continue;
        reach[j] = reach[k] + 1;
        longest = Math.max(longest, reach[j]);
        queue[tail++] = j;
      }
    }
    for (let k = 0; k < n * n; k++) if (water[k] !== NO_WATER) flow[k] = reach[k] < 0 ? 1 : Math.max(1e-3, reach[k] / longest);
  }

  return {
    n,
    riverCut: meshCut(n, riverTop, height, t.columns.top),
    streetCut: meshCut(n, streetTop, height, t.columns.top),
    order,
    flow,
    top,
    riverHigh,
    riverLow: Number.isFinite(riverLow) ? riverLow : 0,
  };
}
