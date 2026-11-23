import * as THREE from "three";

/**
 * The debug view's gray world: every lit material loses its color, so the lenses' colors
 * (render/print.ts) are the only color left on the ground.
 *
 * It arrives as a wave spreading out from the plaza across the screen, with a faint cyan line at
 * its front, and a little darker behind it, so entering the view can't be missed. `uGray` is how
 * far the wave has got (0 none, 1 all); `uGrayCenter` is the plaza on the screen and `uGrayReach`
 * the distance to the farthest corner (both in drawing-buffer pixels, set by WorldView).
 * One value shared by every shader, set by WorldView.setDebug; nothing is rebuilt.
 *
 * The ground and everything with the voxel look take it where they already patch their color
 * (render/print.ts, render/voxelLook.ts); the other lit materials (the water, the plinth) through
 * `installGray`, which patches every material that doesn't patch itself. Unlit ones (the network's
 * lines, the selection ring) and lights (windows, signs) keep their colors.
 */
export const GRAY = { uKeepAgents: { value: 0 }, uGray: { value: 0 }, uGrayRes: { value: new THREE.Vector2(1, 1) }, uGrayCenter: { value: new THREE.Vector2(0, 0) }, uGrayReach: { value: 1 } };

/** How soft the sweep's edge is, as a share of the screen's diagonal. */
const SOFT = 0.11;

export const GRAY_HEAD = "uniform float uGrayKeep;\nuniform float uGray;\nuniform vec2 uGrayCenter;\nuniform float uGrayReach;";
/** Before the lenses' tints: the color gone to its luminance (and a little darker), behind the front. */
export const GRAY_FRAGMENT = `{
    float grayAt = distance(gl_FragCoord.xy, uGrayCenter) / uGrayReach;
    float grayAmount = clamp((uGray * ${(1 + SOFT).toFixed(2)} - grayAt) / ${SOFT.toFixed(2)}, 0.0, 1.0);
    grayAmount *= 1.0 - uGrayKeep;
    float grayLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(grayLuma * 0.78), grayAmount);
    // The front: a cyan line where the gray is arriving.
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.35, 0.85, 1.0), 0.4 * pow(4.0 * grayAmount * (1.0 - grayAmount), 16.0));
  }`;

const NO_KEEP = { value: 0 };

/** Sets the gray's uniforms on a shader. `keep` (0 or 1) lets a material keep its own colors in the debug view (the agents in the Agents lens). */
export function grayUniforms(shader: THREE.WebGLProgramParametersWithUniforms, keep: { value: number } = NO_KEEP) {
  shader.uniforms.uGrayKeep = keep;
  shader.uniforms.uGray = GRAY.uGray;
  shader.uniforms.uGrayCenter = GRAY.uGrayCenter;
  shader.uniforms.uGrayReach = GRAY.uGrayReach;
}

function patchGray(this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
  if (!(this instanceof THREE.MeshStandardMaterial || this instanceof THREE.MeshLambertMaterial || this instanceof THREE.MeshPhongMaterial)) return;
  grayUniforms(shader);
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${GRAY_HEAD}`).replace("#include <color_fragment>", `#include <color_fragment>\n${GRAY_FRAGMENT}`);
}

let installed = false;
/** Patches every lit material that has no `onBeforeCompile` of its own. Once. */
export function installGray() {
  if (installed) return;
  installed = true;
  THREE.Material.prototype.onBeforeCompile = patchGray as unknown as typeof THREE.Material.prototype.onBeforeCompile;
}
