import { CLAIM } from "../terrain/claims";
import type { Parks, ParkPropKind } from "../city/parks";
import type { BuildingPlan } from "../city/placement";
import { voxels } from "../scale";

/**
 * Where the city's inhabitants can go (pure: no three.js). People keep to paving where they can:
 * the sidewalks (verges), the plaza and the parks' paths. A road costs more, so they cross it
 * rather than walk down it; open ground and the river bank cost more still, so they are crossed
 * only where there is no paved way (the parks are ringed by open ground, not sidewalk). The parks'
 * lawns are the animals' only. Park props, fences and the Landmark are blocked out, columns next to
 * anything people can't walk on cost a little more (so they keep to the middle of a path), strips
 * a single column wide are closed (no one fits), and no one steps up or down more than a stair at
 * a time.
 *
 * Getting somewhere is a flow field (as in crowd simulations): one search from every place of a
 * kind at once (all benches, all doors…) gives each column its distance to the nearest of them, and
 * an agent only has to walk downhill in it. Many agents share one field, so a crowd costs no more
 * than one walker.
 */

/** The most a walker steps up or down between neighboring columns, in voxels (a curb or a stair is 1). */
export const STEP = 2;
/** Cats jump higher. */
export const CAT_STEP = 4;
/** What a column is to walkers: people walk the road, paving and rough ground; animals the lawns too. */
export const GROUND = { none: 0, road: 1, paving: 2, rough: 3, lawn: 4 } as const;
/** Path cost per column (straight; a diagonal is half as much again): paving, a road, rough ground, and extra beside an edge. */
const COST_PAVED = 2;
const COST_ROAD = 10;
const COST_ROUGH = 11;
const COST_EDGE = 3;
/** Unreached columns in a field. */
export const FAR = 0xffff;

export interface WalkMap {
  n: number;
  /** Ground under each column, in voxels. */
  y: Int16Array;
  /** GROUND per column. */
  walk: Uint8Array;
  /** Per column, a bit per neighbor (N8 order) a person may step to. */
  links: Uint8Array;
  /** 1 for people's columns beside one they can't walk on. */
  edge: Uint8Array;
}

/** True where people walk. */
export const forPeople = (g: number) => g > GROUND.none && g < GROUND.lawn;

/** Footprints walkers keep off, by prop kind: radius (columns), or a [length-wise, depth-wise] half size (0: the prop's length). */
const BLOCK: Partial<Record<ParkPropKind, number | [number, number]>> = {
  fountain: 13,
  pavilion: 13,
  playground: [17, 15],
  picnic: [5, 5],
  bench: [voxels(0.95), voxels(0.4)],
  bin: 1.5,
  lamp: 1,
  vending: [voxels(0.5), voxels(0.4)],
  fence: [0, 0.6],
  flowerbed: [0, voxels(0.65)],
  hedge: [0, voxels(0.5)],
  broadleaf: 1,
  conifer: 1,
  blossom: 1,
  shrub: 1.5,
};

export const N8: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [1, 1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [-1, -1, 1],
];

export function walkMap(claim: Uint8Array, parks: Parks, plans: BuildingPlan[]): WalkMap {
  const { n, height } = parks.ground;
  const walk = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) {
    const c = claim[k];
    if (c === CLAIM.verge || c === CLAIM.plaza || (c === CLAIM.park && parks.path[k])) walk[k] = GROUND.paving;
    else if (c === CLAIM.road) walk[k] = GROUND.road;
    else if (c === CLAIM.free || c === CLAIM.bank) walk[k] = GROUND.rough;
    else if (c === CLAIM.park) walk[k] = GROUND.lawn;
  }
  const block = (cx: number, cz: number, rot: number, hx: number, hz: number, round: boolean) => {
    const r = Math.ceil(Math.hypot(hx, hz)) + 1;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (let z = Math.floor(cz - r); z <= cz + r; z++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        // Into the prop's own frame (its front is +z, turned by `rot`).
        const u = dx * c - dz * s;
        const v = dx * s + dz * c;
        if (round ? Math.hypot(dx, dz) <= hx : Math.abs(u) <= hx && Math.abs(v) <= hz) walk[z * n + x] = GROUND.none;
      }
    }
  };
  for (const park of parks.parks) {
    for (const p of park.props) {
      const b = BLOCK[p.kind];
      if (b === undefined) continue;
      if (typeof b === "number") block(p.x, p.z, 0, b, b, true);
      else block(p.x, p.z, p.rotation, b[0] || p.size / 2, b[1], false);
    }
  }
  const landmark = plans.find((p) => p.lot < 0);
  if (landmark) {
    const half = voxels(landmark.width) / 2 + 1;
    block(landmark.x, landmark.z, 0, half, half, false);
  }
  // A strip one column wide (25 cm, between two lots, say) is too narrow for anyone: closed.
  const closed = (k: number) => !forPeople(walk[k]);
  for (let z = 1; z < n - 1; z++) {
    for (let x = 1; x < n - 1; x++) {
      const k = z * n + x;
      if (forPeople(walk[k]) && ((closed(k - 1) && closed(k + 1)) || (closed(k - n) && closed(k + n)))) walk[k] = GROUND.none;
    }
  }
  const map: WalkMap = { n, y: height, walk, links: new Uint8Array(n * n), edge: new Uint8Array(n * n) };
  const people = (k: number) => forPeople(walk[k]);
  // Straight steps: to an open neighbor no more than STEP up or down.
  const { links } = map;
  const y = height;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (!people(k)) continue;
      let bits = 0;
      if (x < n - 1 && people(k + 1) && Math.abs(y[k + 1] - y[k]) <= STEP) bits |= 1;
      if (x > 0 && people(k - 1) && Math.abs(y[k - 1] - y[k]) <= STEP) bits |= 2;
      if (z < n - 1 && people(k + n) && Math.abs(y[k + n] - y[k]) <= STEP) bits |= 4;
      if (z > 0 && people(k - n) && Math.abs(y[k - n] - y[k]) <= STEP) bits |= 8;
      links[k] = bits;
      if (bits !== 15) map.edge[k] = 1;
    }
  }
  // Diagonals (as canStep): both straight steps open, and the corner itself in reach.
  for (let k = 0; k < n * n; k++) {
    const b = links[k] & 15;
    if (!b) continue;
    const diag = (i: number, sx: number, sz: number, bx: number, bz: number) => {
      if (!(b & bx) || !(b & bz)) return;
      const j = k + sz * n + sx;
      if (people(j) && Math.abs(y[j] - y[k]) <= STEP) links[k] |= 1 << i;
      else map.edge[k] = 1;
    };
    diag(4, 1, 1, 1, 4);
    diag(5, 1, -1, 1, 8);
    diag(6, -1, 1, 2, 4);
    diag(7, -1, -1, 2, 8);
  }
  return map;
}

/** True if a walker may step from column k to its neighbor (dx, dz); diagonals need both sides open. */
export function canStep(map: WalkMap, k: number, dx: number, dz: number, step = STEP, open: (k: number) => boolean = (i) => forPeople(map.walk[i])): boolean {
  const { n, y } = map;
  const x = k % n;
  const z = (k / n) | 0;
  const X = x + dx;
  const Z = z + dz;
  if (X < 0 || Z < 0 || X >= n || Z >= n) return false;
  const j = Z * n + X;
  if (!open(j) || Math.abs(y[j] - y[k]) > step) return false;
  if (dx && dz) {
    const a = z * n + X;
    const b = Z * n + x;
    if (!open(a) || !open(b) || Math.abs(y[a] - y[k]) > step || Math.abs(y[b] - y[k]) > step) return false;
  }
  return true;
}

/** What entering column j costs (straight). */
function cost(map: WalkMap, j: number) {
  const g = map.walk[j];
  return (g === GROUND.paving ? COST_PAVED : g === GROUND.road ? COST_ROAD : COST_ROUGH) + (map.edge[j] ? COST_EDGE : 0);
}

/**
 * Distance (in path cost) from every column walkers can reach to the nearest of `sources`, by
 * Dial's algorithm (the costs being small integers), worked out a slice at a time: `run` goes on
 * for about `budget` ms and returns the field once it is done.
 */
export class FieldJob {
  private readonly dist: Uint16Array;
  private readonly buckets: number[][] = Array.from({ length: 32 }, () => []);
  private d = 0;
  private pending = 0;

  constructor(
    private readonly map: WalkMap,
    sources: number[],
  ) {
    const { n, walk } = map;
    this.dist = new Uint16Array(n * n).fill(FAR);
    for (const s of sources) {
      if (!forPeople(walk[s]) || this.dist[s] === 0) continue;
      this.dist[s] = 0;
      this.buckets[0].push(s);
      this.pending++;
    }
  }

  run(budget: number): Uint16Array | null {
    const { n, links } = this.map;
    const { dist, buckets } = this;
    const start = performance.now();
    let work = 0;
    while (this.pending > 0) {
      const bucket = buckets[this.d % buckets.length];
      while (bucket.length) {
        const k = bucket.pop()!;
        this.pending--;
        if (dist[k] !== this.d) continue;
        const bits = links[k];
        for (let i = 0; i < 8; i++) {
          if (!(bits & (1 << i))) continue;
          const [dx, dz, diag] = N8[i];
          const j = k + dz * n + dx;
          const c = cost(this.map, j);
          const nd = this.d + (diag ? c + (c >> 1) : c);
          if (nd < dist[j] && nd < FAR) {
            dist[j] = nd;
            buckets[nd % buckets.length].push(j);
            this.pending++;
          }
        }
        if (++work % 2048 === 0 && performance.now() - start > budget) return null;
      }
      this.d++;
    }
    return dist;
  }
}

/** The whole field at once. */
export function flowField(map: WalkMap, sources: number[]): Uint16Array {
  return new FieldJob(map, sources).run(Infinity)!;
}

/** The column a walker at k should head for next: the lowest of its neighbors, or -1 if none is lower. */
export function downhill(map: WalkMap, field: Uint16Array, k: number): number {
  const { n, links } = map;
  let best = -1;
  let low = field[k];
  const bits = links[k];
  for (let i = 0; i < 8; i++) {
    if (!(bits & (1 << i))) continue;
    const j = k + N8[i][1] * n + N8[i][0];
    if (field[j] < low) {
      low = field[j];
      best = j;
    }
  }
  return best;
}

/** The nearest paved column within `reach` of (x, z), or -1. */
export function nearestWalk(map: WalkMap, x: number, z: number, reach = 6): number {
  const { n, walk } = map;
  let best = -1;
  let bd = Infinity;
  for (let Z = Math.floor(z - reach); Z <= z + reach; Z++) {
    for (let X = Math.floor(x - reach); X <= x + reach; X++) {
      if (X < 0 || Z < 0 || X >= n || Z >= n || walk[Z * n + X] !== GROUND.paving) continue;
      const d = Math.hypot(X + 0.5 - x, Z + 0.5 - z);
      if (d < bd) {
        bd = d;
        best = Z * n + X;
      }
    }
  }
  return best;
}
