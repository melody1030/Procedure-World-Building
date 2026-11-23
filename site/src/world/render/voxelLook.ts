import * as THREE from "three";
import { GRAY, GRAY_FRAGMENT, GRAY_HEAD, grayUniforms } from "./gray";

/**
 * The voxel look on everything but the ground (docs/plans/voxel-look-plan.md): the ground's line
 * round every cube and slight per-cube tint (render/print.ts), on the buildings, the park props,
 * the people, the animals and the vehicles.
 *
 * The ground works its cubes out from the world position. Everything else turns and moves, so
 * each vertex carries where it lies on its cubes instead (`aVoxel`: x, y, z in cubes, and how much
 * each cube's shade varies: 1 as a rule, more for leaves (city/parkModels.ts, LEAFY) so they read as
 * separate cubes; 0 for none):
 * - a building or a park prop, on a grid from its own origin, every box snapped to it
 *   (buildings/kit.ts, `GeometryBuilder.grid`), so neighboring boxes' cubes line up: voxels
 *   (0.25 m) for a box a voxel or more every way, fine voxels (a quarter voxel) for smaller parts;
 * - a part of a person, an animal or a vehicle, from its own box's corner, a whole number of fine
 *   voxels along each axis (`voxelBox` here).
 *
 * On a face, the axis across it doesn't change, so it is skipped. The lines fade out where a
 * cube covers fewer than about 4 pixels, as on the ground, so nothing shimmers from afar.
 */

/** The strength of the lines and tint, 0 off: the Look › Grid setting, shared with the ground. */
export const VOXEL_LOOK = { uVoxelGrid: { value: 0.35 } };

const VERTEX_HEAD = "attribute vec4 aVoxel;\nvarying vec4 vVoxel;";
const FRAGMENT_HEAD = `uniform float uVoxelGrid;\n${GRAY_HEAD}\nvarying vec4 vVoxel;`;
const FRAGMENT = /* glsl */ `
  ${GRAY_FRAGMENT}
  if (vVoxel.w > 0.5) {
    vec3 q = vVoxel.xyz;
    vec3 fw = fwidth(q);
    // The axes along the face (the one across it doesn't change).
    vec3 along = step(vec3(1e-5), fw);
    vec3 w = max(fw, vec3(1e-4));
    vec3 d = abs(fract(q) - 0.5);
    vec3 edge = smoothstep(0.5 - w * 1.5, 0.5 - w * 0.25, d) * along;
    float line = max(edge.x, max(edge.y, edge.z));
    float pixelsPerCube = 1.0 / max(max(fw.x * along.x, fw.y * along.y), max(fw.z * along.z, 1e-4));
    float fade = smoothstep(3.0, 6.0, pixelsPerCube);
    // The cube this pixel is on. Across the face, its coordinate is the face's, on a whole cube (or
    // a layer off it, buildings/kit.ts): rounded, not floored, or it would flip from pixel to pixel
    // between the cubes on either side, and the shade with it.
    vec3 cube = mix(floor(q + 0.5), floor(q), along);
    float h = fract(sin(dot(cube, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    diffuseColor.rgb *= (1.0 - uVoxelGrid * 0.35 * line * fade) * (1.0 + uVoxelGrid * 0.12 * vVoxel.w * (h - 0.5) * fade);
  }`;

/** Adds the voxel look to a lit material's shader (call it from `onBeforeCompile`). */
export function patchVoxelLook(shader: THREE.WebGLProgramParametersWithUniforms) {
  patchLook(shader);
}

/** The same, for the agents: in the Agents lens they keep their state colors instead of going gray. */
export function patchAgentLook(shader: THREE.WebGLProgramParametersWithUniforms) {
  patchLook(shader, GRAY.uKeepAgents);
}

function patchLook(shader: THREE.WebGLProgramParametersWithUniforms, keep?: { value: number }) {
  shader.uniforms.uVoxelGrid = VOXEL_LOOK.uVoxelGrid;
  grayUniforms(shader, keep);
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${VERTEX_HEAD}`).replace("#include <begin_vertex>", "#include <begin_vertex>\nvVoxel = aVoxel;");
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${FRAGMENT_HEAD}`).replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT}`);
}

/** A lit material with the voxel look (for geometry with `aVoxel`). */
export function withVoxelLook<T extends THREE.Material>(material: T, key: string): T {
  material.onBeforeCompile = patchVoxelLook;
  material.customProgramCacheKey = () => key;
  return material;
}

/** Sets `aVoxel` on a box geometry (centered, as THREE.BoxGeometry makes it) of size (w, h, d), in cubes of about `cell`. */
export function voxelBox(geometry: THREE.BufferGeometry, w: number, h: number, d: number, cell: number) {
  const pos = geometry.getAttribute("position");
  const per = [w, h, d].map((s) => Math.max(1, Math.round(s / cell)) / s);
  const out = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    out[i * 4] = (pos.getX(i) + w / 2) * per[0];
    out[i * 4 + 1] = (pos.getY(i) + h / 2) * per[1];
    out[i * 4 + 2] = (pos.getZ(i) + d / 2) * per[2];
    out[i * 4 + 3] = 1;
  }
  geometry.setAttribute("aVoxel", new THREE.BufferAttribute(out, 4));
  return geometry;
}
