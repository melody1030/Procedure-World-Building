import * as THREE from "three";
import type { ParamValue, Stage, TechniqueType } from "../types";

export type ShaderUniforms = Record<string, THREE.IUniform>;

interface ParamBase {
  key: string;
  label: string;
  description: string;
  /** Hide the control unless this returns true (e.g. outline width only with outlines on). */
  visibleIf?: (params: Record<string, ParamValue>) => boolean;
}

export type ParamDef =
  | (ParamBase & {
      kind: "range";
      min: number;
      max: number;
      step: number;
      decimals: number;
      default: number;
    })
  | (ParamBase & {
      kind: "select";
      options: { value: string; label: string }[];
      default: string;
    })
  | (ParamBase & { kind: "color"; default: string })
  | (ParamBase & { kind: "switch"; default: boolean });

/**
 * One shader technique: its panel copy, its controls, the GLSL it adds, and how its controls
 * reach the uniforms. `composeShader` stitches the GLSL of the active techniques together.
 */
export interface TechniqueModule {
  type: TechniqueType;
  stage: Stage;
  name: string;
  /** "How it works": two or three plain sentences. */
  summary: string;
  /** The core line, shown under "Show formula". */
  formula: string;
  params: ParamDef[];
  /** GLSL uniform declarations. */
  uniforms: string[];
  /** Helper functions, placed above main() in the shader the technique runs in. */
  functions?: string;
  /** Lines inside main(). Shape techniques run in the vertex shader, the rest in the fragment shader. */
  body: string;
  /** Extra fragment code for a shape technique that also colors what it moved (Ripple's water). */
  fragment?: { uniforms: string[]; functions?: string; body: string };
  /** Copies the panel values into the shared uniforms. */
  apply: (params: Record<string, ParamValue>, uniforms: ShaderUniforms) => void;
}

/** `#rrggbb` to a raw 0..1 vector. No color-space conversion, so the shader shows the hex as typed. */
export function hexToVec3(hex: string, out: THREE.Vector3): THREE.Vector3 {
  const n = parseInt(hex.slice(1), 16);
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function setColor(uniforms: ShaderUniforms, name: string, hex: ParamValue) {
  hexToVec3(String(hex), uniforms[name].value as THREE.Vector3);
}
