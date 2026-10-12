/**
 * Distance from every column to the nearest marked column, in columns: a two-pass chamfer
 * transform (steps of 1 straight and √2 diagonal), within about 8% of the true distance.
 * Marked columns are 0; with nothing marked, every column is Infinity.
 */
export function distanceTo(marked: Uint8Array, n: number): Float32Array {
  const d = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = marked[k] ? 0 : Infinity;
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      let v = d[k];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[k - 1] + 1);
      if (z > 0) {
        v = Math.min(v, d[k - n] + 1);
        if (x > 0) v = Math.min(v, d[k - n - 1] + Math.SQRT2);
        if (x < n - 1) v = Math.min(v, d[k - n + 1] + Math.SQRT2);
      }
      d[k] = v;
    }
  }
  for (let z = n - 1; z >= 0; z--) {
    for (let x = n - 1; x >= 0; x--) {
      const k = z * n + x;
      let v = d[k];
      if (v === 0) continue;
      if (x < n - 1) v = Math.min(v, d[k + 1] + 1);
      if (z < n - 1) {
        v = Math.min(v, d[k + n] + 1);
        if (x < n - 1) v = Math.min(v, d[k + n + 1] + Math.SQRT2);
        if (x > 0) v = Math.min(v, d[k + n - 1] + Math.SQRT2);
      }
      d[k] = v;
    }
  }
  return d;
}
