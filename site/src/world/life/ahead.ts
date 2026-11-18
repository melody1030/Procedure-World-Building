/**
 * Where an agent means to go next, for the renderer to draw when the agent is selected (pure: no
 * three.js). Each agent works out its own (Life's personAhead, pigeonAhead and catAhead, and
 * Traffic.pathAhead for vehicles), from what it will actually do: a person down the field it is walking, a vehicle
 * along the segments it has planned, a cat or a pigeon straight at what it is after.
 */
export interface Path {
  /** Points ahead (columns, as the agents keep them), a step apart, nearest first: x, y, z, x, y, z… */
  pts: number[];
  /** Whether the path reaches where the agent is going (or is cut off at the reach). */
  end: boolean;
}

export const NO_PATH: Path = { pts: [], end: false };

/** A straight path from one point to another, a point every `every` columns, at most `reach` long. */
export function line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, reach: number, every: number): Path {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const go = Math.min(d, reach);
  const pts: number[] = [];
  for (let s = every; s < go; s += every) {
    const t = s / (d || 1);
    pts.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
  }
  const t = go / (d || 1);
  if (go > 0) pts.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
  return { pts, end: d <= reach };
}
