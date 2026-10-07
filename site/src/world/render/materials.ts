import * as THREE from "three";
import type { GeometryData } from "../geometry";

/**
 * The terrain material. It can tint its top faces from a data texture (the Terraces overlay), lit
 * softly from within so it reads at night.
 */

export function toGeometry(data: GeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
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
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
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
