import * as THREE from "three";
import { TECHNIQUES } from "../config";
import type { TechniqueParams, TechniqueType } from "../types";
import type { ShaderUniforms } from "./technique";

/**
 * One uniforms object shared by every material. It always holds every technique's uniforms, so
 * a recompiled shader picks up the current values straight away, and the helper Lambert
 * has its values even when Lambert is not the selected technique.
 */
export function createUniforms(): ShaderUniforms {
  return {
    uTime: { value: 0 },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uSceneHeight: { value: 1 },
    uFlatColor: { value: new THREE.Vector3() },
    uGradientSpace: { value: 0 },
    uGradientCurve: { value: 0 },
    uGradientRange: { value: 1 },
    uGradientA: { value: new THREE.Vector3() },
    uGradientB: { value: new THREE.Vector3() },
    uSlopeView: { value: 0 },
    uSlopeThreshold: { value: 0.35 },
    uSlopeSoftness: { value: 0.08 },
    uSlopeFlat: { value: new THREE.Vector3() },
    uSlopeSteep: { value: new THREE.Vector3() },
    uMatcap: { value: null },
    uLambertAmbient: { value: 0.3 },
    uToonBands: { value: 4 },
    uToonFloor: { value: 0.35 },
    uOutlineWidth: { value: 0.02 },
    uAoStrength: { value: 0.45 },
    uAoHeight: { value: 0.6 },
    uFresnelPower: { value: 3.2 },
    uFresnelStrength: { value: 0.65 },
    uFresnelColor: { value: new THREE.Vector3() },
    uFogDensity: { value: 0.05 },
    uFogColor: { value: new THREE.Vector3() },
    uRippleAmp: { value: 0.04 },
    uRippleFreq: { value: 3 },
    uRippleSpeed: { value: 1 },
    uFoam: { value: 0.5 },
    uWaterLevel: { value: 0.25 },
    uSceneDepth: { value: null },
    uScreenSize: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 100 },
  };
}

/** Writes every technique's panel values into the uniforms. */
export function applyParams(uniforms: ShaderUniforms, params: Record<TechniqueType, TechniqueParams>) {
  for (const type of Object.keys(TECHNIQUES) as TechniqueType[]) TECHNIQUES[type].apply(params[type], uniforms);
}
