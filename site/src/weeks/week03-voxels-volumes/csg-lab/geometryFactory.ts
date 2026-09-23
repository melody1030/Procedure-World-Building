import { WORLD_SIZE } from "../constants";
import type { PrimitiveParamsMap } from "./types";

export const DEFAULT_PRIMITIVE_PARAMS: PrimitiveParamsMap = {
  cube: { width: WORLD_SIZE * 0.3, height: WORLD_SIZE * 0.3, depth: WORLD_SIZE * 0.3 },
  sphere: { radius: WORLD_SIZE * 0.18, widthSegments: 24, heightSegments: 16 },
  cylinder: { radiusTop: WORLD_SIZE * 0.15, radiusBottom: WORLD_SIZE * 0.15, height: WORLD_SIZE * 0.32, radialSegments: 24 },
  cone: { radius: WORLD_SIZE * 0.16, height: WORLD_SIZE * 0.32, radialSegments: 24 },
  torus: { radius: WORLD_SIZE * 0.16, tube: WORLD_SIZE * 0.06, radialSegments: 20, tubularSegments: 40 },
};
