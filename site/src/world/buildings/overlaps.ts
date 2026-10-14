import type { GeometryData } from "../geometry";
import type { BuildingModel } from "./config";

/**
 * A development check for flicker (z-fighting): faces that point the same way, lie in the same
 * plane and overlap, where the renderer can't tell which is in front. Overlaps hidden by a face
 * pressed against them from the other side (two boxes touching) are not counted: no camera sees
 * them. A clean building reports 0.
 */

interface Face {
  axis: number;
  sign: number;
  plane: number;
  u0: number;
  u1: number;
  w0: number;
  w1: number;
  glow: boolean;
}

export interface OverlapReport {
  pairs: number;
  /** Total overlapping area, in square meters. */
  area: number;
  /** A few examples: axis and direction, plane (voxels), and the two faces' extents. */
  samples: string[];
}

function faces(data: GeometryData, glow: boolean, out: Face[]) {
  const p = data.position;
  const n = data.normal;
  for (let v = 0; v < p.length / 3; v += 4) {
    const normal = [n[v * 3], n[v * 3 + 1], n[v * 3 + 2]];
    const axis = normal.findIndex((c) => Math.abs(c) > 0.5);
    const [u, w] = [0, 1, 2].filter((i) => i !== axis);
    const along = (i: number) => [0, 1, 2, 3].map((j) => p[(v + j) * 3 + i]);
    out.push({ axis, sign: Math.sign(normal[axis]), plane: p[v * 3 + axis], u0: Math.min(...along(u)), u1: Math.max(...along(u)), w0: Math.min(...along(w)), w1: Math.max(...along(w)), glow });
  }
}

export function findOverlaps(model: BuildingModel, maxSamples = 10): OverlapReport {
  const all: Face[] = [];
  faces(model.solid, false, all);
  faces(model.glow, true, all);
  const planes = new Map<string, Face[]>();
  for (const f of all) {
    const key = `${f.axis}:${f.plane.toFixed(3)}`;
    const list = planes.get(key);
    if (list) list.push(f);
    else planes.set(key, [f]);
  }
  const report: OverlapReport = { pairs: 0, area: 0, samples: [] };
  const eps = 1e-3;
  for (const list of planes.values()) {
    if (list.length < 2) continue;
    for (const sign of [1, -1]) {
      const same = list.filter((f) => f.sign === sign).sort((a, b) => a.u0 - b.u0);
      const opposite = list.filter((f) => f.sign !== sign);
      for (let i = 0; i < same.length; i++) {
        for (let j = i + 1; j < same.length && same[j].u0 < same[i].u1 - eps; j++) {
          const a = same[i];
          const b = same[j];
          const u0 = Math.max(a.u0, b.u0);
          const u1 = Math.min(a.u1, b.u1);
          const w0 = Math.max(a.w0, b.w0);
          const w1 = Math.min(a.w1, b.w1);
          if (u1 - u0 <= eps || w1 - w0 <= eps) continue;
          const cu = (u0 + u1) / 2;
          const cw = (w0 + w1) / 2;
          if (opposite.some((o) => o.u0 <= cu && o.u1 >= cu && o.w0 <= cw && o.w1 >= cw)) continue;
          report.pairs++;
          report.area += (u1 - u0) * (w1 - w0) * 0.0625;
          if (report.samples.length < maxSamples) {
            const box = (f: Face) => `${f.glow ? "glow" : "solid"}[${[f.u0, f.u1, f.w0, f.w1].map((x) => +x.toFixed(2)).join(",")}]`;
            report.samples.push(`${"xyz"[a.axis]}${sign > 0 ? "+" : "-"} @${+a.plane.toFixed(2)} ${box(a)} ${box(b)}`);
          }
        }
      }
    }
  }
  return report;
}

export interface ClashReport {
  /** Clashing pairs by kind, e.g. "ac+sign": 2. */
  pairs: Record<string, number>;
  /** A few examples: the two kinds and where they meet (meters). */
  samples: string[];
}

/** Pairs of kinds that are meant to meet: skybridges plug into the towers they join, entrances are set into walls and shop rows. */
const MEANT = new Set(["bridge+mass", "entrance+mass", "entrance+shopfront"]);

/**
 * Parts that run into each other: every pair of recorded parts (masses, AC units, balconies,
 * billboards, signs, rooftop gear, plants, props, bridges, platforms, pipes, shop rows) whose
 * boxes intersect, beyond touching. A clean building reports none.
 */
export function findClashes(model: BuildingModel, maxSamples = 8): ClashReport {
  const f = model.fixtures;
  const report: ClashReport = { pairs: {}, samples: [] };
  const eps = 0.02;
  for (let i = 0; i < f.length; i++) {
    for (let j = i + 1; j < f.length; j++) {
      const a = f[i].box;
      const b = f[j].box;
      if (!(a[0] < b[3] - eps && a[3] > b[0] + eps && a[1] < b[4] - eps && a[4] > b[1] + eps && a[2] < b[5] - eps && a[5] > b[2] + eps)) continue;
      const key = [f[i].kind, f[j].kind].sort().join("+");
      if (MEANT.has(key)) continue;
      report.pairs[key] = (report.pairs[key] ?? 0) + 1;
      if (report.samples.length < maxSamples) {
        const at = (v: number) => (v * 0.25).toFixed(1);
        report.samples.push(`${key} at x ${at(Math.max(a[0], b[0]))}, y ${at(Math.max(a[1], b[1]))}, z ${at(Math.max(a[2], b[2]))}`);
      }
    }
  }
  return report;
}
