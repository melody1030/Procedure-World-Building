import * as THREE from "three";
import type { GeometryData } from "../geometry";

/**
 * Materials for the world, plus two shader patches:
 *
 * - Growth: every city vertex carries (birth, base). While the timeline is before its birth it is
 *   collapsed away; just after, it rises from its base over a short moment. Shadows use the same
 *   patch, so a building that does not exist yet casts no shadow.
 * - Overlay: the terrain can tint its top faces from a data texture (terraces, suitability,
 *   districts), lit softly from within so it reads at night.
 */

export interface SharedUniforms {
  uGrowth: { value: number };
}

const GROWTH_VERTEX = /* glsl */ `
  #include <begin_vertex>
  float growthRise = clamp((uGrowth - aGrowth.x) / 0.04, 0.0, 1.0);
  transformed.y = mix(aGrowth.y, transformed.y, growthRise);
  transformed *= step(aGrowth.x, uGrowth);
`;

function patchGrowth(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: SharedUniforms) {
  shader.uniforms.uGrowth = uniforms.uGrowth;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec2 aGrowth;\nuniform float uGrowth;")
    .replace("#include <begin_vertex>", GROWTH_VERTEX);
}

export function withGrowth<T extends THREE.Material>(material: T, uniforms: SharedUniforms): T {
  material.onBeforeCompile = (shader) => patchGrowth(shader, uniforms);
  material.customProgramCacheKey = () => "growth";
  return material;
}

/** Shadow-casting depth material that respects growth. */
export function growthDepth(uniforms: SharedUniforms): THREE.MeshDepthMaterial {
  return withGrowth(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uniforms);
}

export function toGeometry(data: GeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
  geometry.setAttribute("aGrowth", new THREE.BufferAttribute(data.growth, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface OverlayUniforms {
  uOverlay: { value: THREE.Texture | null };
  uOverlayOn: { value: number };
  uOverlaySize: { value: number };
}

export function terrainMaterial(overlay: OverlayUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMapIntensity: 0.25 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, overlay);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vOverlayXZ;\nvarying float vOverlayUp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvOverlayXZ = (modelMatrix * vec4(transformed, 1.0)).xz;\nvOverlayUp = objectNormal.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uOverlay;\nuniform float uOverlayOn;\nuniform float uOverlaySize;\nvarying vec2 vOverlayXZ;\nvarying float vOverlayUp;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec4 overlayColor = vec4(0.0);
        if (uOverlayOn > 0.5 && vOverlayUp > 0.5) {
          overlayColor = texture2D(uOverlay, (vOverlayXZ + uOverlaySize * 0.5) / uOverlaySize);
          diffuseColor.rgb = mix(diffuseColor.rgb, overlayColor.rgb, overlayColor.a);
        }`,
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += overlayColor.rgb * overlayColor.a * 0.55;");
  };
  material.customProgramCacheKey = () => "terrain-overlay";
  return material;
}

export function cityMaterial(uniforms: SharedUniforms): THREE.MeshStandardMaterial {
  return withGrowth(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.35 }), uniforms);
}

/** Wet asphalt: smooth and slightly metallic, so it catches the neon in the environment map. */
export function roadMaterial(uniforms: SharedUniforms): THREE.MeshStandardMaterial {
  return withGrowth(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25, envMapIntensity: 1.3 }), uniforms);
}

/** Light sources: unlit and allowed above 1, so bloom picks them out. */
export function glowMaterial(uniforms: SharedUniforms): THREE.MeshBasicMaterial {
  return withGrowth(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), uniforms);
}

export function riverMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.12,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
    envMapIntensity: 1.2,
    emissive: new THREE.Color(0x0a2a3a),
  });
}
