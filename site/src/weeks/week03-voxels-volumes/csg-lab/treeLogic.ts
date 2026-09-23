import { WORLD_SIZE } from "../constants";
import { DEFAULT_PRIMITIVE_PARAMS } from "./geometryFactory";
import { boundsCenter, computeNodeBounds, unionBounds } from "./nodeBounds";
import { IDENTITY_QUATERNION, UNIT_SCALE } from "./types";
import type { CSGOp, CSGTreeNode, OperationNode, PrimitiveNode, PrimitiveType, Quat, Vec3 } from "./types";

let idCounter = 0;

export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

const SLOT_SPACING = WORLD_SIZE * 0.55;

/** Outward-alternating slot sequence: 0, +1, -1, +2, -2, ... so early additions stay centered. */
function slotOffset(slot: number): number {
  if (slot === 0) return 0;
  const pairIndex = Math.ceil(slot / 2);
  const sign = slot % 2 === 1 ? 1 : -1;
  return pairIndex * sign;
}

export function slotPosition(slot: number): Vec3 {
  return { x: slotOffset(slot) * SLOT_SPACING, y: 0, z: 0 };
}

/** Recursively searches every root's subtree for a node with the given id. */
export function findNode(roots: CSGTreeNode[], id: string | null): CSGTreeNode | null {
  if (!id) return null;
  function search(node: CSGTreeNode): CSGTreeNode | null {
    if (node.id === id) return node;
    if (node.kind === "operation") {
      return search(node.left) ?? search(node.right);
    }
    return null;
  }
  for (const root of roots) {
    const found = search(root);
    if (found) return found;
  }
  return null;
}

export function isRoot(roots: CSGTreeNode[], id: string): boolean {
  return roots.some((root) => root.id === id);
}

export function addPrimitiveRoot(roots: CSGTreeNode[], type: PrimitiveType, slot: number): CSGTreeNode[] {
  // The cast is safe: DEFAULT_PRIMITIVE_PARAMS[type] is structurally guaranteed to match
  // PrimitiveParamsMap[type] by construction — TS just can't prove it across a non-literal union.
  const node = {
    kind: "primitive",
    id: makeId(type),
    primitiveType: type,
    position: slotPosition(slot),
    rotation: IDENTITY_QUATERNION,
    scale: UNIT_SCALE,
    params: { ...DEFAULT_PRIMITIVE_PARAMS[type] },
    hidden: false,
  } as PrimitiveNode;
  return [...roots, node];
}

/** Combines two top-level roots into a new operation-node root; order matters for "difference".
 *
 *  The new node's `position` becomes the combined shape's centroid — not {0,0,0} — so it always
 *  represents the pivot rotation/scale apply around and where the Object Manipulation gizmo
 *  visually attaches (rather than the origin, which is wrong the moment the two source shapes
 *  weren't already centered there). `left`/`right` are rebased by the same offset so the
 *  absolute geometry doesn't jump: buildSdf/buildLocalSdf's split (see sdfEngine.ts) means this
 *  offset exactly cancels out through the recursive transform composition. */
export function combineRoots(roots: CSGTreeNode[], idA: string, idB: string, operation: CSGOp): CSGTreeNode[] {
  const left = roots.find((root) => root.id === idA);
  const right = roots.find((root) => root.id === idB);
  if (!left || !right) return roots;
  const remaining = roots.filter((root) => root.id !== idA && root.id !== idB);

  const centroid = boundsCenter(unionBounds(computeNodeBounds(left), computeNodeBounds(right)));
  const rebase = (node: CSGTreeNode): CSGTreeNode => ({
    ...node,
    position: { x: node.position.x - centroid.x, y: node.position.y - centroid.y, z: node.position.z - centroid.z },
  });

  const node: OperationNode = {
    kind: "operation",
    id: makeId("op"),
    operation,
    left: rebase(left),
    right: rebase(right),
    position: centroid,
    rotation: IDENTITY_QUATERNION,
    scale: UNIT_SCALE,
    hidden: false,
  };
  return [...remaining, node];
}

export function removeRoot(roots: CSGTreeNode[], id: string): CSGTreeNode[] {
  return roots.filter((root) => root.id !== id);
}

export interface TransformPatch {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

/** Applies a move/rotate/scale patch to a top-level root — used when the Object Manipulation
 *  gizmo commits an interactive transform in the viewport. */
export function updateRootTransform(roots: CSGTreeNode[], id: string, patch: TransformPatch): CSGTreeNode[] {
  return roots.map((root) => (root.id === id ? { ...root, ...patch } : root));
}

/** Only mutates a node that is both a top-level root AND still a bare primitive (pre-combine). */
export function updatePrimitiveParams(roots: CSGTreeNode[], id: string, patch: Record<string, number>): CSGTreeNode[] {
  return roots.map((root) => {
    if (root.id === id && root.kind === "primitive") {
      return { ...root, params: { ...root.params, ...patch } } as CSGTreeNode;
    }
    return root;
  });
}

/**
 * Flips `hidden` on any node, root or nested — unlike position/param edits, visibility is
 * meaningful at every depth (see evaluateNode's hidden-operand fallback), so this recurses.
 */
export function toggleNodeHidden(roots: CSGTreeNode[], id: string): CSGTreeNode[] {
  function walk(node: CSGTreeNode): CSGTreeNode {
    if (node.id === id) return { ...node, hidden: !node.hidden } as CSGTreeNode;
    if (node.kind === "operation") {
      return { ...node, left: walk(node.left), right: walk(node.right) };
    }
    return node;
  }
  return roots.map(walk);
}
