import { primitiveSdf } from "./sdfPrimitives";
import { worldToLocal } from "./transform";
import type { CSGOp, CSGTreeNode, Vec3 } from "./types";

export const SDF_COMBINATORS: Record<CSGOp, (a: number, b: number) => number> = {
  union: (a, b) => Math.min(a, b),
  difference: (a, b) => Math.max(a, -b),
  intersection: (a, b) => Math.max(a, b),
};

export type SdfFn = (p: Vec3) => number;

/**
 * Combines two (possibly absent) SDFs with the same hidden-operand fallback used throughout
 * this app: if one side is missing, the operation degenerates to "just the other side" rather
 * than blanking the result. Shared by `buildSdf`'s operation-node case and by the viewport's
 * preview overlay (which needs the same "Apply/Result" combination for two arbitrary nodes
 * that aren't necessarily sibling children of one committed operation node yet).
 */
export function combineSdf(operation: CSGOp, left: SdfFn | null, right: SdfFn | null): SdfFn | null {
  if (left && right) {
    const combine = SDF_COMBINATORS[operation];
    return (p) => combine(left(p), right(p));
  }
  return left ?? right;
}

/**
 * Recursively builds a callable pseudo-signed-distance function for a CSG tree node. Mirrors
 * `combineSdf`'s hidden-operand fallback at every level: a hidden node contributes nothing, and
 * a hidden operand of an operation makes it degenerate to "just the other side" rather than
 * blanking the whole result. Returns null when the node contributes nothing to render: it's
 * hidden, or both of its operands are.
 */
export function buildSdf(node: CSGTreeNode): SdfFn | null {
  if (node.hidden) return null;

  if (node.kind === "primitive") {
    const local = primitiveSdf(node);
    const { position, rotation, scale } = node;
    return (p) => local(worldToLocal(p, position, rotation, scale));
  }

  const combined = combineSdf(node.operation, buildSdf(node.left), buildSdf(node.right));
  if (!combined) return null;

  const { position, rotation, scale } = node;
  return (p) => combined(worldToLocal(p, position, rotation, scale));
}

/**
 * Like `buildSdf`, but doesn't apply the node's own position/rotation/scale — only nested
 * children's transforms (which, after `combineRoots`' rebasing, are already expressed relative
 * to this node's local frame). Used for root-level voxel rendering: the viewport's Group carries
 * the root's own transform directly, so the Object Manipulation gizmo (attached to that Group)
 * visually tracks the shape's actual pivot instead of sitting at the origin.
 */
export function buildLocalSdf(node: CSGTreeNode): SdfFn | null {
  if (node.hidden) return null;
  if (node.kind === "primitive") {
    return primitiveSdf(node);
  }
  return combineSdf(node.operation, buildSdf(node.left), buildSdf(node.right));
}
