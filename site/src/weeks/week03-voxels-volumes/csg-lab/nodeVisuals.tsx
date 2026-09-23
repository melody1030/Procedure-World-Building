import {
  IconCone,
  IconCube,
  IconCylinder,
  IconDifferenceOp,
  IconIntersectionOp,
  IconSphere,
  IconTorus,
  IconUnionOp,
} from "../icons";
import type { CSGOp, PrimitiveType } from "./types";

/** Icon + accent color shared by the primitive palette and the scene-tree rows. */
export const PRIMITIVE_VISUALS: Record<PrimitiveType, { icon: JSX.Element; color: string }> = {
  cube: { icon: <IconCube />, color: "text-blue-400" },
  sphere: { icon: <IconSphere />, color: "text-sky-400" },
  cylinder: { icon: <IconCylinder />, color: "text-purple-400" },
  cone: { icon: <IconCone />, color: "text-emerald-400" },
  torus: { icon: <IconTorus />, color: "text-amber-400" },
};

/** Icon + accent color shared by the operation row and the scene-tree rows. */
export const OPERATION_VISUALS: Record<CSGOp, { icon: JSX.Element; color: string }> = {
  union: { icon: <IconUnionOp />, color: "text-blue-400" },
  difference: { icon: <IconDifferenceOp />, color: "text-red-400" },
  intersection: { icon: <IconIntersectionOp />, color: "text-emerald-400" },
};
