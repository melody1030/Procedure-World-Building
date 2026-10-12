import type { NoiseField } from "./noise";
import type { TerrainParams } from "./params";

/**
 * Stage 3, shaping: Week 2's shaping curves applied to the noise field, before it becomes heights.
 *
 *   ridge:  v ← mix(v, (1 − |2v − 1|)^(1 + 3r), r)     fold the middle of the range into crests
 *   power:  v ← v^p                                     p > 1 flattens lowlands into shelves
 *
 * The ridge goes first so Power always has the last word on the lowlands. Week 2's Ridge always
 * folded; here it is blended in by its own amount, so 0 leaves the noise alone. Week 2's third
 * curve, Terrace, is Stage 4 (terraces.ts), blended with voxel stairs by slope.
 *
 * The Height control is read when the field becomes voxels.
 */

export function shapeField(field: NoiseField, p: TerrainParams["shaping"]): NoiseField {
  const values = new Float32Array(field.values.length);
  for (let k = 0; k < values.length; k++) {
    let v = Math.min(1, Math.max(0, field.values[k]));
    if (p.ridge > 0) v += (Math.pow(1 - Math.abs(2 * v - 1), 1 + 3 * p.ridge) - v) * p.ridge;
    values[k] = Math.pow(Math.min(1, Math.max(0, v)), p.power);
  }
  return { res: field.res, values };
}
