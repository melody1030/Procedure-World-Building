import type { PrimitiveNode, Vec3 } from "./types";

function len3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function len2(x: number, z: number): number {
  return Math.hypot(x, z);
}

/** Exact signed distance to an axis-aligned box centered at the origin (Inigo Quilez's sdBox). */
function box(p: Vec3, halfWidth: number, halfHeight: number, halfDepth: number): number {
  const qx = Math.abs(p.x) - halfWidth;
  const qy = Math.abs(p.y) - halfHeight;
  const qz = Math.abs(p.z) - halfDepth;
  const outside = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

function sphere(p: Vec3, radius: number): number {
  return len3(p.x, p.y, p.z) - radius;
}

/** Exact signed distance to a torus whose main ring lies in the XY plane (matching
 *  THREE.TorusGeometry's own default orientation — the hole runs along Z, not Y). */
function torus(p: Vec3, radius: number, tube: number): number {
  const q = len2(p.x, p.y) - radius;
  return Math.hypot(q, p.z) - tube;
}

/**
 * Cylinder/cone use a simple max-of-(radial excess, vertical excess) pseudo-distance rather
 * than the exact (and considerably fiddlier) capped-cylinder/capped-cone formulas. The sign is
 * exactly correct — negative iff inside — which is all hard voxel classification needs; only
 * the magnitude near the cap edges isn't true Euclidean distance, and nothing here relies on
 * that (no smooth blending is used anywhere in this app).
 */
function cylinder(p: Vec3, radius: number, halfHeight: number): number {
  const radial = len2(p.x, p.z) - radius;
  const vertical = Math.abs(p.y) - halfHeight;
  return Math.max(radial, vertical);
}

/** Apex at +halfHeight, base (radius `baseRadius`) at -halfHeight — matches THREE.ConeGeometry. */
function cone(p: Vec3, baseRadius: number, halfHeight: number): number {
  const t = Math.min(Math.max((p.y + halfHeight) / (2 * halfHeight), 0), 1);
  const radiusAtY = baseRadius * (1 - t);
  const radial = len2(p.x, p.z) - radiusAtY;
  const vertical = Math.abs(p.y) - halfHeight;
  return Math.max(radial, vertical);
}

/** Builds a local-space (node centered at its own origin) pseudo-SDF for a primitive node. */
export function primitiveSdf(node: PrimitiveNode): (p: Vec3) => number {
  switch (node.primitiveType) {
    case "cube": {
      const { width, height, depth } = node.params;
      return (p) => box(p, width / 2, height / 2, depth / 2);
    }
    case "sphere": {
      const { radius } = node.params;
      return (p) => sphere(p, radius);
    }
    case "cylinder": {
      const { radiusTop, radiusBottom, height } = node.params;
      const radius = Math.max(radiusTop, radiusBottom);
      return (p) => cylinder(p, radius, height / 2);
    }
    case "cone": {
      const { radius, height } = node.params;
      return (p) => cone(p, radius, height / 2);
    }
    case "torus": {
      const { radius, tube } = node.params;
      return (p) => torus(p, radius, tube);
    }
  }
}
