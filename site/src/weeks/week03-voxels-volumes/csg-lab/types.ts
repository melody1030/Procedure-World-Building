export type PrimitiveType = "cube" | "sphere" | "cylinder" | "cone" | "torus";

export type CSGOp = "union" | "difference" | "intersection";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A rotation, stored as a quaternion rather than Euler angles so repeated interactive rotations
 *  compose correctly (no gimbal lock, no axis-order ambiguity) via straightforward multiplication. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const IDENTITY_QUATERNION: Quat = { x: 0, y: 0, z: 0, w: 1 };
export const UNIT_SCALE: Vec3 = { x: 1, y: 1, z: 1 };

export interface PrimitiveParamsMap {
  cube: { width: number; height: number; depth: number };
  sphere: { radius: number; widthSegments: number; heightSegments: number };
  cylinder: { radiusTop: number; radiusBottom: number; height: number; radialSegments: number };
  cone: { radius: number; height: number; radialSegments: number };
  torus: { radius: number; tube: number; radialSegments: number; tubularSegments: number };
}

// A mapped type indexed by PrimitiveType, rather than a single generic interface with a
// defaulted type param, so this actually distributes into a real discriminated union —
// switching on `primitiveType` then correctly narrows `params` at every call site.
export type PrimitiveNode<T extends PrimitiveType = PrimitiveType> = {
  [K in T]: {
    kind: "primitive";
    id: string;
    primitiveType: K;
    position: Vec3;
    rotation: Quat;
    scale: Vec3;
    params: PrimitiveParamsMap[K];
    /** Excluded from its parent operation while true (see evaluateNode's hidden-operand fallback). */
    hidden: boolean;
  };
}[T];

export interface OperationNode {
  kind: "operation";
  id: string;
  operation: CSGOp;
  /** Order matters: "difference" is left − right, not symmetric. */
  left: CSGTreeNode;
  right: CSGTreeNode;
  /** Transform applied after the boolean result is computed, so a combined shape can be moved,
   *  rotated, and scaled as a whole rigid body. */
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  /** Excluded from its parent operation while true (see evaluateNode's hidden-operand fallback). */
  hidden: boolean;
}

export type CSGTreeNode = PrimitiveNode | OperationNode;

export type TransformMode = "translate" | "rotate" | "scale";

export interface CSGLabState {
  roots: CSGTreeNode[];
  selectedRootIds: string[];
  inspectedNodeId: string | null;
  panelOpen: boolean;
  /** Monotonically increasing, never reused (even across removals) so new placements never collide with survivors. */
  nextSlot: number;
  /** The operation armed for the two currently-selected roots — null until one is picked, and
   *  cleared again on commit or when the selection changes away from a full pair. */
  previewOperation: CSGOp | null;
  /** Which gizmo the Object Manipulation section's transform controls currently show/use. */
  transformMode: TransformMode;
}

export interface PrimitiveMeta {
  id: PrimitiveType;
  name: string;
}

export const PRIMITIVE_META: PrimitiveMeta[] = [
  { id: "cube", name: "Cube" },
  { id: "sphere", name: "Sphere" },
  { id: "cylinder", name: "Cylinder" },
  { id: "cone", name: "Cone" },
  { id: "torus", name: "Torus" },
];

export interface CSGOperationMeta {
  id: CSGOp;
  name: string;
  formula: string;
  use: string;
  explanation: string;
}

export const CSG_LAB_OPERATIONS: CSGOperationMeta[] = [
  {
    id: "union",
    name: "Union",
    formula: "A ∪ B",
    use: "add two shapes together",
    explanation: "Every point inside either shape is kept — the result is the combined volume of both.",
  },
  {
    id: "difference",
    name: "Difference",
    formula: "A − B",
    use: "carve B out of A",
    explanation: "Keeps A, then removes any part of A that overlaps B — like cutting a hole with a drill bit.",
  },
  {
    id: "intersection",
    name: "Intersection",
    formula: "A ∩ B",
    use: "keep only the overlap",
    explanation: "Only the region where both shapes overlap survives — everything else is discarded.",
  },
];
