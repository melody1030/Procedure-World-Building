/**
 * Path helpers shared by the world's river and streets and Week 5's paths
 * (docs/notes/distribution-and-paths-notes.md): a centripetal Catmull-Rom curve, the profile tools
 * that make water only flow downhill, and the distance field that carves a path into the ground.
 * Plain arrays, no three.js, so generation stays pure.
 */

export interface P2 {
  x: number;
  z: number;
}

/** One point on a centripetal Catmull-Rom segment (Barry–Goldman, alpha = 0.5) between p1 and p2. */
function catmullRom(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const knot = (a: P2, b: P2) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: P2, b: P2, ta: number, tb: number): P2 => {
    const w = (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w };
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/**
 * A centripetal Catmull-Rom curve through `points`, sampled about every `spacing` units. Centripetal
 * parameterization never loops or cusps between close control points. The end points are
 * extended in a straight line, so the curve starts and ends exactly on the first and last point.
 */
export function centripetalCurve(points: P2[], spacing: number): P2[] {
  if (points.length < 2) return points.slice();
  const ext = (a: P2, b: P2): P2 => ({ x: 2 * a.x - b.x, z: 2 * a.z - b.z });
  const pts = [ext(points[0], points[1]), ...points, ext(points[points.length - 1], points[points.length - 2])];
  const out: P2[] = [points[0]];
  for (let i = 1; i < pts.length - 2; i++) {
    const steps = Math.max(1, Math.ceil(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / spacing));
    for (let s = 1; s <= steps; s++) out.push(catmullRom(pts[i - 1], pts[i], pts[i + 1], pts[i + 2], s / steps));
  }
  return out;
}

/** Moving average along a profile, `passes` times, over `radius` samples each side. */
export function smoothProfile(y: Float32Array, radius: number, passes: number): Float32Array {
  let current = y;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(current.length);
    for (let i = 0; i < current.length; i++) {
      let sum = 0;
      let count = 0;
      for (let k = -radius; k <= radius; k++) {
        sum += current[Math.min(current.length - 1, Math.max(0, i + k))];
        count++;
      }
      next[i] = sum / count;
    }
    current = next;
  }
  return current;
}

/** Water only flows downhill: walking from the start, the level can only go down (a running minimum). */
export function neverRising(y: Float32Array, fromStart = true): Float32Array {
  const n = y.length;
  const level = new Float32Array(n);
  let current = Infinity;
  for (let k = 0; k < n; k++) {
    const i = fromStart ? k : n - 1 - k;
    current = Math.min(current, y[i]);
    level[i] = current;
  }
  return level;
}

/** Curve samples per distance-field segment. */
const STRIDE = 4;

/**
 * Distance from every column within `reach` of a curve (sampled about every column, in columns)
 * to the curve, and the profile `level` interpolated at the nearest point: the distance field a
 * path carves the ground with. Columns out of reach stay at Infinity. The curve is split into
 * short segments, and each one only visits the columns around it, so wide reaches stay fast.
 */
export function distanceToCurve(curve: P2[], level: Float32Array, reach: number, n: number): { dist: Float32Array; levelAt: Float32Array } {
  return stamp(curve, level, reach, n, n);
}

/** The distance field over a w × d grid (entry x + z · w); curve points are in that grid's coordinates. */
function stamp(curve: P2[], level: Float32Array, reach: number, w: number, d: number): { dist: Float32Array; levelAt: Float32Array } {
  const dist = new Float32Array(w * d).fill(Infinity);
  const levelAt = new Float32Array(w * d);
  const samples = curve.length;
  for (let s = 0; s < samples - 1; s += STRIDE) {
    const e = Math.min(samples - 1, s + STRIDE);
    const A = curve[s];
    const B = curve[e];
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const len2 = dx * dx + dz * dz || 1;
    const x0 = Math.max(0, Math.floor(Math.min(A.x, B.x) - reach));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(A.x, B.x) + reach));
    const z0 = Math.max(0, Math.floor(Math.min(A.z, B.z) - reach));
    const z1 = Math.min(d - 1, Math.ceil(Math.max(A.z, B.z) + reach));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / len2));
        const ex = x - (A.x + dx * t);
        const ez = z - (A.z + dz * t);
        const dd = Math.sqrt(ex * ex + ez * ez);
        const k = z * w + x;
        if (dd < dist[k]) {
          dist[k] = dd;
          levelAt[k] = level[s] + (level[e] - level[s]) * t;
        }
      }
    }
  }
  return { dist, levelAt };
}

/**
 * The same distance field as `distanceToCurve`, but only over the bounding box of the curve grown
 * by `reach` (clipped to the map): `x0`, `z0` and `w` × `d` give the box, and entry (x − x0) +
 * (z − z0) · w belongs to column (x, z). Much cheaper for short curves on a big map.
 */
export function distanceToCurveLocal(curve: P2[], level: Float32Array, reach: number, n: number) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const q of curve) {
    minX = Math.min(minX, q.x);
    minZ = Math.min(minZ, q.z);
    maxX = Math.max(maxX, q.x);
    maxZ = Math.max(maxZ, q.z);
  }
  const x0 = Math.max(0, Math.floor(minX - reach));
  const z0 = Math.max(0, Math.floor(minZ - reach));
  const x1 = Math.min(n - 1, Math.ceil(maxX + reach));
  const z1 = Math.min(n - 1, Math.ceil(maxZ + reach));
  const w = x1 - x0 + 1;
  const d = z1 - z0 + 1;
  const local = curve.map((q) => ({ x: q.x - x0, z: q.z - z0 }));
  return { x0, z0, w, d, ...stamp(local, level, reach, w, d) };
}
