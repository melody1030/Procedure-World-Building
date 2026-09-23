import { localToWorld } from "./transform";
import type { CSGTreeNode, PrimitiveNode, Quat, Vec3 } from "./types";

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

function primitiveLocalBounds(node: PrimitiveNode): Bounds {
  switch (node.primitiveType) {
    case "cube": {
      const { width, height, depth } = node.params;
      return { min: { x: -width / 2, y: -height / 2, z: -depth / 2 }, max: { x: width / 2, y: height / 2, z: depth / 2 } };
    }
    case "sphere": {
      const { radius } = node.params;
      return { min: { x: -radius, y: -radius, z: -radius }, max: { x: radius, y: radius, z: radius } };
    }
    case "cylinder": {
      const { radiusTop, radiusBottom, height } = node.params;
      const r = Math.max(radiusTop, radiusBottom);
      return { min: { x: -r, y: -height / 2, z: -r }, max: { x: r, y: height / 2, z: r } };
    }
    case "cone": {
      const { radius, height } = node.params;
      return { min: { x: -radius, y: -height / 2, z: -radius }, max: { x: radius, y: height / 2, z: radius } };
    }
    case "torus": {
      const { radius, tube } = node.params;
      const outer = radius + tube;
      // Ring lies in the XY plane (matching THREE.TorusGeometry) — Z is the thin axis.
      return { min: { x: -outer, y: -outer, z: -tube }, max: { x: outer, y: outer, z: tube } };
    }
  }
}

/**
 * Projects a local-space AABB's 8 corners through a node's full position/rotation/scale
 * transform and takes their min/max — the standard way to get a (possibly larger, always
 * correct) axis-aligned world bound for a rotated/scaled box.
 */
function transformBounds(bounds: Bounds, position: Vec3, rotation: Quat, scale: Vec3): Bounds {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const world = localToWorld({ x, y, z }, position, rotation, scale);
        min.x = Math.min(min.x, world.x);
        min.y = Math.min(min.y, world.y);
        min.z = Math.min(min.z, world.z);
        max.x = Math.max(max.x, world.x);
        max.y = Math.max(max.y, world.y);
        max.z = Math.max(max.z, world.z);
      }
    }
  }
  return { min, max };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y), z: Math.min(a.min.z, b.min.z) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y), z: Math.max(a.max.z, b.max.z) },
  };
}

/**
 * Recursively unions per-primitive AABBs to size a voxel sampling grid around a node. Ignores
 * `hidden` — a slightly generous bound for a hidden subtree costs nothing, since over-inclusion
 * just samples a bit of empty space rather than producing a wrong result.
 */
export function computeNodeBounds(node: CSGTreeNode): Bounds {
  if (node.kind === "primitive") {
    return transformBounds(primitiveLocalBounds(node), node.position, node.rotation, node.scale);
  }
  const combined = unionBounds(computeNodeBounds(node.left), computeNodeBounds(node.right));
  return transformBounds(combined, node.position, node.rotation, node.scale);
}

/** The center of a node's world bounds — used as the pivot when combining two roots. */
export function boundsCenter(bounds: Bounds): Vec3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

/**
 * Like `computeNodeBounds`, but without applying the node's own position/rotation/scale — only
 * nested children's transforms. Pairs with `buildLocalSdf` (see sdfEngine.ts) for root-level
 * voxel rendering: the viewport's Group carries the root's own transform directly, so this sizes
 * the grid in the space "underneath" it.
 */
export function computeLocalBounds(node: CSGTreeNode): Bounds {
  if (node.kind === "primitive") {
    return primitiveLocalBounds(node);
  }
  return unionBounds(computeNodeBounds(node.left), computeNodeBounds(node.right));
}
