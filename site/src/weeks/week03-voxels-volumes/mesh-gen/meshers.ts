import { edgeTable, triTable } from "three/examples/jsm/objects/MarchingCubes.js";
import { WORLD_SIZE } from "../constants";
import { fieldNormal } from "./fields";
import type { ScalarField } from "./fields";
import type { MeshOptions } from "./types";

export type MeshMethodId = "culled" | "greedy" | "marching" | "surfacenets" | "dual";

export interface VolumeGrid {
  n: number;
  cell: number;
  origin: number;
  /** Field value at each cell-centered sample: negative = inside. Index = i + n * (j + n * k). */
  values: Float32Array;
  field: ScalarField;
}

/** Intermediate data captured while meshing, for the step-by-step visualization. Flat xyz arrays. */
export interface StepData {
  /** Min corner of every surface-crossing cell. */
  cells: number[];
  /** Edge-crossing points, and (Dual Contouring only) their surface normals. */
  crossings: number[];
  normals: number[];
  /** One vertex per surface cell (Surface Nets / Dual Contouring). */
  vertices: number[];
  /** Greedy only: the unmerged culled-faces mesh the merge starts from. */
  culled: MeshResult | null;
}

export interface MeshResult {
  positions: Float32Array;
  indices: Uint32Array;
  /** Outline segments (vertex index pairs), grouped per face in emission order. */
  lineIndices: Uint32Array;
  faces: number;
  ms: number;
  steps: StepData;
}

function emptySteps(): StepData {
  return { cells: [], crossings: [], normals: [], vertices: [], culled: null };
}

export function samplePos(vol: VolumeGrid, i: number): number {
  return vol.origin + (i + 0.5) * vol.cell;
}

export function buildVolume(field: ScalarField, n: number): VolumeGrid {
  const cell = WORLD_SIZE / n;
  const origin = -WORLD_SIZE / 2;
  const values = new Float32Array(n * n * n);
  const vol: VolumeGrid = { n, cell, origin, values, field };
  for (let k = 0; k < n; k++) {
    const z = samplePos(vol, k);
    for (let j = 0; j < n; j++) {
      const y = samplePos(vol, j);
      for (let i = 0; i < n; i++) {
        values[i + n * (j + n * k)] = field(samplePos(vol, i), y, z);
      }
    }
  }
  return vol;
}

/** Shifts the surface to where the field equals `iso` (a threshold / inflate-erode control). */
export function applyIso(vol: VolumeGrid, iso: number): VolumeGrid {
  if (iso === 0) return vol;
  const base = vol.field;
  const values = vol.values.map((v) => v - iso);
  return { ...vol, values, field: (x, y, z) => base(x, y, z) - iso };
}

class Builder {
  positions: number[] = [];
  indices: number[] = [];
  lines: number[] = [];
  faces = 0;

  vertex(x: number, y: number, z: number): number {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number) {
    this.indices.push(a, b, c);
    this.lines.push(a, b, b, c, c, a);
    this.faces++;
  }

  quad(a: number, b: number, c: number, d: number) {
    this.indices.push(a, b, c, a, c, d);
    this.lines.push(a, b, b, c, c, d, d, a);
    this.faces++;
  }

  finish(startedAt: number, steps: StepData = emptySteps()): MeshResult {
    return {
      positions: new Float32Array(this.positions),
      indices: new Uint32Array(this.indices),
      lineIndices: new Uint32Array(this.lines),
      faces: this.faces,
      ms: performance.now() - startedAt,
      steps,
    };
  }
}

// ---------------------------------------------------------------------------
// Binary voxel meshing: culled faces and greedy merging
// ---------------------------------------------------------------------------

function meshBlocky(vol: VolumeGrid, greedy: boolean, cullHidden: boolean, maxQuad: number): MeshResult {
  const startedAt = performance.now();
  const { n, cell, origin, values } = vol;
  const builder = new Builder();
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n && values[x + n * (y + n * z)] < 0;

  const mask = new Uint8Array(n * n);
  const c = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    for (const sign of [1, -1]) {
      for (let s = 0; s < n; s++) {
        mask.fill(0);
        let any = false;
        for (let bv = 0; bv < n; bv++) {
          for (let au = 0; au < n; au++) {
            c[d] = s;
            c[u] = au;
            c[v] = bv;
            if (!filled(c[0], c[1], c[2])) continue;
            c[d] = s + sign;
            if (!cullHidden || !filled(c[0], c[1], c[2])) {
              mask[bv * n + au] = 1;
              any = true;
            }
          }
        }
        if (!any) continue;

        for (let bv = 0; bv < n; bv++) {
          for (let au = 0; au < n; au++) {
            if (!mask[bv * n + au]) continue;
            let w = 1;
            let h = 1;
            if (greedy) {
              while (au + w < n && w < maxQuad && mask[bv * n + au + w]) w++;
              grow: while (bv + h < n && h < maxQuad) {
                for (let x = 0; x < w; x++) {
                  if (!mask[(bv + h) * n + au + x]) break grow;
                }
                h++;
              }
            }
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) mask[(bv + y) * n + au + x] = 0;
            }

            const plane = origin + (s + (sign > 0 ? 1 : 0)) * cell;
            const u0 = origin + au * cell;
            const u1 = origin + (au + w) * cell;
            const v0 = origin + bv * cell;
            const v1 = origin + (bv + h) * cell;
            const make = (uc: number, vc: number) => {
              const p = [0, 0, 0];
              p[d] = plane;
              p[u] = uc;
              p[v] = vc;
              return builder.vertex(p[0], p[1], p[2]);
            };
            const a = make(u0, v0);
            const b = make(u1, v0);
            const cc = make(u1, v1);
            const dd = make(u0, v1);
            if (sign > 0) builder.quad(a, b, cc, dd);
            else builder.quad(a, dd, cc, b);
          }
        }
      }
    }
  }
  return builder.finish(startedAt);
}

// ---------------------------------------------------------------------------
// Marching cubes
// ---------------------------------------------------------------------------

/** Bourke's corner ordering, which matches the lookup tables shipped with three.js. */
const CORNERS: [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

const EDGE_CORNERS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

// three.js types the tables as Int32Array[] but they're flat: 16 entries per case.
const TRI_TABLE = triTable as unknown as Int32Array;
const EDGE_TABLE = edgeTable as unknown as Int32Array;

function meshMarchingCubes(vol: VolumeGrid, interpolate: boolean): MeshResult {
  const startedAt = performance.now();
  const { n, values } = vol;
  const total = n * n * n;
  const builder = new Builder();
  const edgeVertex = new Map<number, number>();
  const steps = emptySteps();

  const cornerIdx = new Int32Array(8);
  const cornerVal = new Float32Array(8);
  const edgeVerts = new Int32Array(12);

  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const [dx, dy, dz] = CORNERS[c];
          const idx = i + dx + n * (j + dy + n * (k + dz));
          cornerIdx[c] = idx;
          cornerVal[c] = values[idx];
          // The tables expect "higher = inside", so a corner is flagged when it lies outside.
          if (values[idx] >= 0) cubeIndex |= 1 << c;
        }
        const edgeBits = EDGE_TABLE[cubeIndex];
        if (edgeBits === 0) continue;
        steps.cells.push(samplePos(vol, i), samplePos(vol, j), samplePos(vol, k));

        for (let e = 0; e < 12; e++) {
          if (!(edgeBits & (1 << e))) continue;
          const [ca, cb] = EDGE_CORNERS[e];
          const sa = cornerIdx[ca];
          const sb = cornerIdx[cb];
          const key = sa < sb ? sa * total + sb : sb * total + sa;
          let vi = edgeVertex.get(key);
          if (vi === undefined) {
            const fa = cornerVal[ca];
            const fb = cornerVal[cb];
            const t = interpolate ? fa / (fa - fb) : 0.5;
            const pa = CORNERS[ca];
            const pb = CORNERS[cb];
            vi = builder.vertex(
              samplePos(vol, i + pa[0] + (pb[0] - pa[0]) * t),
              samplePos(vol, j + pa[1] + (pb[1] - pa[1]) * t),
              samplePos(vol, k + pa[2] + (pb[2] - pa[2]) * t),
            );
            edgeVertex.set(key, vi);
          }
          edgeVerts[e] = vi;
        }

        const base = cubeIndex << 4;
        for (let t = 0; TRI_TABLE[base + t] !== -1; t += 3) {
          builder.tri(edgeVerts[TRI_TABLE[base + t]], edgeVerts[TRI_TABLE[base + t + 1]], edgeVerts[TRI_TABLE[base + t + 2]]);
        }
      }
    }
  }
  return builder.finish(startedAt, steps);
}

// ---------------------------------------------------------------------------
// Surface nets and dual contouring: one vertex per sign-changing cell, quads across sign-changing edges
// ---------------------------------------------------------------------------

/** Solves (Σ nnᵀ + λI) x = Σ n (n·(p − c)), the regularized least-squares "QEF" for one cell. */
function solveQef(points: number[][], normals: number[][], center: number[], lambda: number): [number, number, number] {
  const a = [
    [lambda, 0, 0],
    [0, lambda, 0],
    [0, 0, lambda],
  ];
  const b = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const n = normals[i];
    const d = n[0] * (points[i][0] - center[0]) + n[1] * (points[i][1] - center[1]) + n[2] * (points[i][2] - center[2]);
    for (let r = 0; r < 3; r++) {
      b[r] += n[r] * d;
      for (let c = 0; c < 3; c++) a[r][c] += n[r] * n[c];
    }
  }
  const det =
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  if (Math.abs(det) < 1e-12) return [0, 0, 0];
  const solveCol = (col: number) => {
    const m = a.map((row) => row.slice());
    for (let r = 0; r < 3; r++) m[r][col] = b[r];
    return (
      (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
        m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
        m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])) /
      det
    );
  };
  return [solveCol(0), solveCol(1), solveCol(2)];
}

function meshDual(vol: VolumeGrid, hermite: boolean, options: MeshOptions): MeshResult {
  const startedAt = performance.now();
  const { n, cell, values, field } = vol;
  const builder = new Builder();
  const steps = emptySteps();
  const cellVertex = new Int32Array(n * n * n).fill(-1);
  const normalEps = cell * 0.05;
  // sharpness 1 -> lambda 0.01 (near-exact QEF); 0 -> lambda 100 (collapses to the average crossing).
  const lambda = Math.pow(10, 2 - 4 * options.sharpness);

  const pts: number[][] = [];
  const nrm: number[][] = [];

  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        pts.length = 0;
        nrm.length = 0;
        for (const [ca, cb] of EDGE_CORNERS) {
          const pa = CORNERS[ca];
          const pb = CORNERS[cb];
          const fa = values[i + pa[0] + n * (j + pa[1] + n * (k + pa[2]))];
          const fb = values[i + pb[0] + n * (j + pb[1] + n * (k + pb[2]))];
          if (fa < 0 === fb < 0) continue;

          const ax = samplePos(vol, i + pa[0]);
          const ay = samplePos(vol, j + pa[1]);
          const az = samplePos(vol, k + pa[2]);
          const bx = samplePos(vol, i + pb[0]);
          const by = samplePos(vol, j + pb[1]);
          const bz = samplePos(vol, k + pb[2]);

          let px: number;
          let py: number;
          let pz: number;
          if (hermite) {
            // Hermite data wants the true crossing (bisected on the real field), not a linear guess.
            let inside: number[] = fa < 0 ? [ax, ay, az] : [bx, by, bz];
            let outside: number[] = fa < 0 ? [bx, by, bz] : [ax, ay, az];
            for (let it = 0; it < 10; it++) {
              const mx = (inside[0] + outside[0]) / 2;
              const my = (inside[1] + outside[1]) / 2;
              const mz = (inside[2] + outside[2]) / 2;
              if (field(mx, my, mz) < 0) inside = [mx, my, mz];
              else outside = [mx, my, mz];
            }
            px = (inside[0] + outside[0]) / 2;
            py = (inside[1] + outside[1]) / 2;
            pz = (inside[2] + outside[2]) / 2;
            nrm.push(fieldNormal(field, px, py, pz, normalEps));
          } else {
            const t = fa / (fa - fb);
            px = ax + (bx - ax) * t;
            py = ay + (by - ay) * t;
            pz = az + (bz - az) * t;
          }
          pts.push([px, py, pz]);
        }
        if (pts.length === 0) continue;
        steps.cells.push(samplePos(vol, i), samplePos(vol, j), samplePos(vol, k));
        for (let q = 0; q < pts.length; q++) {
          steps.crossings.push(pts[q][0], pts[q][1], pts[q][2]);
          if (hermite) steps.normals.push(nrm[q][0], nrm[q][1], nrm[q][2]);
        }

        const center = [0, 0, 0];
        for (const p of pts) {
          center[0] += p[0];
          center[1] += p[1];
          center[2] += p[2];
        }
        center[0] /= pts.length;
        center[1] /= pts.length;
        center[2] /= pts.length;

        let vx = center[0];
        let vy = center[1];
        let vz = center[2];
        if (hermite) {
          const offset = solveQef(pts, nrm, center, lambda);
          const x0 = samplePos(vol, i);
          const y0 = samplePos(vol, j);
          const z0 = samplePos(vol, k);
          vx = center[0] + offset[0];
          vy = center[1] + offset[1];
          vz = center[2] + offset[2];
          if (options.clampToCell) {
            vx = Math.min(Math.max(vx, x0), x0 + cell);
            vy = Math.min(Math.max(vy, y0), y0 + cell);
            vz = Math.min(Math.max(vz, z0), z0 + cell);
          }
        } else if (options.vertexPlacement === "center") {
          vx = samplePos(vol, i) + cell / 2;
          vy = samplePos(vol, j) + cell / 2;
          vz = samplePos(vol, k) + cell / 2;
        }
        steps.vertices.push(vx, vy, vz);
        cellVertex[i + n * (j + n * k)] = builder.vertex(vx, vy, vz);
      }
    }
  }

  const s = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    // Cyclic (axis, b, c) so a CCW loop in the (b, c) plane faces +axis.
    const b = (axis + 1) % 3;
    const c = (axis + 2) % 3;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          s[0] = i;
          s[1] = j;
          s[2] = k;
          if (s[axis] >= n - 1 || s[b] < 1 || s[c] < 1 || s[b] > n - 2 || s[c] > n - 2) continue;
          const here = values[i + n * (j + n * k)];
          const next = values[i + (axis === 0 ? 1 : 0) + n * (j + (axis === 1 ? 1 : 0) + n * (k + (axis === 2 ? 1 : 0)))];
          if (here < 0 === next < 0) continue;

          const loop: [number, number][] = [
            [-1, -1],
            [0, -1],
            [0, 0],
            [-1, 0],
          ];
          const verts: number[] = [];
          for (const [db, dc] of loop) {
            const cc = [s[0], s[1], s[2]];
            cc[b] += db;
            cc[c] += dc;
            verts.push(cellVertex[cc[0] + n * (cc[1] + n * cc[2])]);
          }
          if (verts.some((v) => v < 0)) continue;
          if (here < 0) builder.quad(verts[0], verts[1], verts[2], verts[3]);
          else builder.quad(verts[0], verts[3], verts[2], verts[1]);
        }
      }
    }
  }
  return builder.finish(startedAt, steps);
}

export function generateMesh(method: MeshMethodId, vol: VolumeGrid, options: MeshOptions): MeshResult {
  switch (method) {
    case "culled":
      return meshBlocky(vol, false, options.cullHidden, Infinity);
    case "greedy": {
      const merged = meshBlocky(vol, true, true, options.maxQuad);
      merged.steps.culled = meshBlocky(vol, false, true, Infinity);
      return merged;
    }
    case "marching":
      return meshMarchingCubes(vol, options.interpolate);
    case "surfacenets":
      return meshDual(vol, false, options);
    case "dual":
      return meshDual(vol, true, options);
  }
}
