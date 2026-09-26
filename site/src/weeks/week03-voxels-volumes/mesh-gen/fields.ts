export type ScalarField = (x: number, y: number, z: number) => number;

function sdSphere(x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number): number {
  return Math.hypot(x - cx, y - cy, z - cz) - r;
}

function sdBox(x: number, y: number, z: number, half: number): number {
  const qx = Math.abs(x) - half;
  const qy = Math.abs(y) - half;
  const qz = Math.abs(z) - half;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0);
}

/**
 * The lab's single test volume: a cube and a ball unioned together. The cube supplies flat faces
 * and sharp edges, the ball supplies a curved surface, and where they overlap there is a concave
 * crease, so every method's strengths and artifacts show up on one object.
 * Signed-distance-style (negative = inside), in world units.
 */
export const TEST_FIELD: ScalarField = (x, y, z) =>
  Math.min(sdBox(x + 1.3, y + 0.5, z + 0.3, 2.0), sdSphere(x, y, z, 1.5, 0.6, 0.3, 2.4));

/** Unit-length central-difference gradient, the "normal" half of Hermite data. */
export function fieldNormal(field: ScalarField, x: number, y: number, z: number, eps: number): [number, number, number] {
  const gx = field(x + eps, y, z) - field(x - eps, y, z);
  const gy = field(x, y + eps, z) - field(x, y - eps, z);
  const gz = field(x, y, z + eps) - field(x, y, z - eps);
  const len = Math.hypot(gx, gy, gz) || 1;
  return [gx / len, gy / len, gz / len];
}
