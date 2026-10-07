/**
 * Grid helpers shared by the stages. The world grid is n × n voxel columns, indexed k = z * n + x.
 */

export const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export const N8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * Multi-source breadth-first search: steps (4-neighbour) from every cell to the nearest source.
 * `passable` limits which cells the search may enter (default: all).
 */
export function bfsDistance(n: number, isSource: (k: number) => boolean, passable: (k: number) => boolean = () => true): Uint16Array {
  const dist = new Uint16Array(n * n).fill(0xffff);
  const queue = new Int32Array(n * n);
  let head = 0;
  let tail = 0;
  for (let k = 0; k < n * n; k++) {
    if (isSource(k)) {
      dist[k] = 0;
      queue[tail++] = k;
    }
  }
  while (head < tail) {
    const k = queue[head++];
    const x = k % n;
    const z = (k - x) / n;
    const d = dist[k] + 1;
    for (const [dx, dz] of N4) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const nk = nz * n + nx;
      if (dist[nk] > d && passable(nk)) {
        dist[nk] = d;
        queue[tail++] = nk;
      }
    }
  }
  return dist;
}

/** Binary min-heap of integer items keyed by a number (used by priority-flood and A*). */
export class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number) {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  /** Removes and returns the item with the smallest key. */
  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const size = items.length;
    if (size > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= size) break;
        const r = l + 1;
        const c = r < size && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

export interface P2 {
  x: number;
  z: number;
}

/** Chaikin corner cutting: rounds a polyline's corners, keeping its end points. */
export function chaikin(points: P2[], iterations = 2): P2[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: P2[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Points every `step` units along a polyline (first and last included). */
export function resample(points: P2[], step: number): P2[] {
  if (points.length < 2) return points.slice();
  const out: P2[] = [points[0]];
  let carry = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let t = step - carry;
    while (t <= len) {
      out.push({ x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len });
      t += step;
    }
    carry = len - (t - step);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > step * 0.3) out.push(last);
  return out;
}
