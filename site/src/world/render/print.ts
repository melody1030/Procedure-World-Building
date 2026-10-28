import * as THREE from "three";
import { BLUEPRINT, URBAN_GROUND } from "../palette";
import { CLAIM_COLORS } from "../terrain/claims";
import { DISTRICTS } from "../terrain/districts";

/**
 * The print animation: the terrain is "printed" layer by layer from the plinth up, as in the
 * concept's blueprint that prints block by block.
 *
 * It is a vertex-shader patch, so nothing is regenerated per frame. Every vertex above the print
 * height is pulled down to it. A column taller than the current layer therefore shows a flat cap
 * at that layer instead of a hole, and the cap glows cyan: the layer being printed. Shadows use
 * the same patch, so unprinted ground casts none.
 */

export interface PrintUniforms {
  /** Current print height, in voxels. Anything above it is pulled down to it. */
  uPrintY: { value: number };
  uPrintColor: { value: THREE.Color };
}

export function createPrintUniforms(): PrintUniforms {
  return { uPrintY: { value: 1e5 }, uPrintColor: { value: new THREE.Color(BLUEPRINT.cyan) } };
}

/**
 * The voxel look, for the ground only: block outlines, a slight per-block tint and strata on cliff
 * sides, all worked out per pixel from the world position, so merged faces still read as voxels.
 * Grid lines fade out where a voxel covers fewer than about 4 pixels, so the ground never shimmers.
 */
export interface LookUniforms {
  /** Strength of the grid lines and tint, 0 off. */
  uLookGrid: { value: number };
  /** Height of each strata band, in voxels (fixed at 1.75 m). */
  uLookStrata: { value: number };
  /** The claim map, one texel per column (claim value in the red channel). */
  uClaims: { value: THREE.Texture | null };
  /** Columns per side of the claim map. */
  uClaimSize: { value: number };
  /** 1 tints the ground by claim (Show claims), 0 off. */
  uShowClaims: { value: number };
  /** Tint per claim value, index 0 (free) unused. */
  uClaimColors: { value: THREE.Color[] };
  /** Hub suitability, one texel per 2 m cell, smoothly filtered. */
  uSuit: { value: THREE.Texture | null };
  /** 1 tints the ground by suitability (Show network), 0 off. */
  uShowSuit: { value: number };
  /** District per column (district + 1 in the red channel, 0 for paving, water or none). */
  uDistricts: { value: THREE.Texture | null };
  /** 1 tints the ground by district (Show districts), 0 off. */
  uShowDistricts: { value: number };
  /** Tint per district. */
  uDistrictColors: { value: THREE.Color[] };
  /** The lots, one texel per column: district + 1, plus 64 on a lot's edge. */
  uLots: { value: THREE.Texture | null };
  /** 1 tints the ground by lot (Show lots), 0 off. */
  uShowLots: { value: number };
  /** The parks, one texel per column: 1 inside a park, 2 on its edge, 0 elsewhere. */
  uParks: { value: THREE.Texture | null };
  /** 1 tints the parks (Show parks), 0 off. */
  uShowParks: { value: number };
  uParkColor: { value: THREE.Color };
  /** The build animation: when each paved column is built (0–1, 0 for unpaved), and how far the
   * paving has got (below 0 nothing paved, above 1 all). Unbuilt paving shows as the concrete around
   * it, so the streets appear only as they grow; the columns just built glow. */
  uBuild: { value: THREE.Texture | null };
  uBuildT: { value: number };
  uUnbuilt: { value: THREE.Color };
  /** Unbuilt paving's color from the plinth (uUnbuilt) to this at uGroundTop: both the ground's
   * concrete, so it shows as the ground around it. */
  uGrassHigh: { value: THREE.Color };
  uGroundTop: { value: number };
  uBuildGlow: { value: THREE.Color };
}

export function createLookUniforms(): LookUniforms {
  const colors = [0, ...Object.values(CLAIM_COLORS)].map((c) => new THREE.Color(c));
  return { uLookGrid: { value: 0.35 }, uLookStrata: { value: 7 }, uClaims: { value: null }, uClaimSize: { value: 1 }, uShowClaims: { value: 0 }, uClaimColors: { value: colors }, uSuit: { value: null }, uShowSuit: { value: 0 }, uDistricts: { value: null }, uShowDistricts: { value: 0 }, uDistrictColors: { value: DISTRICTS.map((d) => new THREE.Color(d.color)) }, uLots: { value: null }, uShowLots: { value: 0 }, uParks: { value: null }, uShowParks: { value: 0 }, uParkColor: { value: new THREE.Color(CLAIM_COLORS.park) }, uBuild: { value: null }, uBuildT: { value: 2 }, uUnbuilt: { value: new THREE.Color(URBAN_GROUND.concrete) }, uGrassHigh: { value: new THREE.Color(URBAN_GROUND.concrete) }, uGroundTop: { value: 1 }, uBuildGlow: { value: new THREE.Color(BLUEPRINT.cyan) } };
}

const LOOK_FRAGMENT = /* glsl */ `
  {
    vec3 an = abs(vLookNormal);
    vec3 p = vLookPos;
    // The face's own plane: x–z on tops, the along-axis and y on sides. Block edges sit on whole numbers.
    vec2 uv = an.y > 0.5 ? p.xz : (an.x > 0.5 ? p.zy : p.xy);
    vec2 w = max(fwidth(uv), vec2(1e-4));
    vec2 d = abs(fract(uv) - 0.5);
    vec2 axis = smoothstep(0.5 - w * 1.5, 0.5 - w * 0.25, d);
    float line = max(axis.x, axis.y);
    float pixelsPerVoxel = 1.0 / max(w.x, w.y);
    float fade = smoothstep(3.0, 6.0, pixelsPerVoxel);
    vec2 cell = floor(uv) + (an.y > 0.5 ? vec2(floor(p.y) * 0.37) : vec2(0.0));
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float lookShade = (1.0 - uLookGrid * 0.35 * line * fade) * (1.0 + uLookGrid * 0.12 * (h - 0.5) * fade);
    diffuseColor.rgb *= lookShade;
    // Strata: alternate bands down cliff sides, like the plinth's cut edge.
    if (an.y < 0.5) diffuseColor.rgb *= mix(1.0, 0.86, mod(floor(p.y / uLookStrata), 2.0));
    // The debug tints below skip the diorama's outer walls: those faces would read the edge
    // column and paint it all the way down to the plinth.
    bool outerWall = an.y < 0.5 && max(abs(p.x), abs(p.z)) > uClaimSize * 0.5 - 0.01;
    if (!outerWall) {
    // The build animation: paving not yet built looks like the concrete around it; the newest paving glows.
    if (uBuildT < 1.5) {
      vec2 column = floor(p.xz - vLookNormal.xz * 0.5 + uClaimSize * 0.5);
      float o = texture2D(uBuild, (column + 0.5) / uClaimSize).r;
      if (o > 0.0) {
        // (Ground not printed yet keeps its blueprint tint.)
        vec3 ground = mix(uUnbuilt, uGrassHigh, clamp(p.y / uGroundTop, 0.0, 1.0)) * lookShade;
        // Not built yet: its top is the ground's concrete, its sides keep their own color. Only paving the front
        // has just reached glows (an unbuilt side must not fall through to the glow).
        if (o > uBuildT) {
          if (an.y > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, ground, 1.0 - vPrinting);
        } else if (o > uBuildT - 0.03) diffuseColor.rgb = mix(diffuseColor.rgb, uBuildGlow, 0.65 * (1.0 - vPrinting));
      }
    }
    // Show network: dark where nothing can be built; elsewhere a heat map of suitability for the
    // city center, from violet (0) to amber (1). The texture holds 0 for unbuildable, 1–255 otherwise.
    if (uShowSuit > 0.5) {
      float v = texture2D(uSuit, (p.xz - vLookNormal.xz * 0.5 + uClaimSize * 0.5) / uClaimSize).r * 255.0;
      float built = smoothstep(0.2, 0.8, v);
      float s = clamp((v - 1.0) / 254.0, 0.0, 1.0);
      vec3 heat = mix(diffuseColor.rgb, mix(vec3(0.2, 0.16, 0.42), vec3(1.0, 0.72, 0.18), s), 0.35 + 0.45 * s);
      diffuseColor.rgb = mix(diffuseColor.rgb * 0.35, heat, built);
    }
    // Show districts: tint each column by its district (paving and water stay clear).
    if (uShowDistricts > 0.5) {
      vec2 column = floor(p.xz - vLookNormal.xz * 0.5 + uClaimSize * 0.5);
      float v = floor(texture2D(uDistricts, (column + 0.5) / uClaimSize).r * 255.0 + 0.5);
      if (v > 0.5) {
        vec3 tint = uDistrictColors[0];
        for (int i = 1; i < DISTRICT_COUNT; i++) if (abs(v - 1.0 - float(i)) < 0.5) tint = uDistrictColors[i];
        diffuseColor.rgb = mix(diffuseColor.rgb, tint, 0.55);
      }
    }
    // Show claims: tint each column by what owns it. Sides look half a voxel back along their
    // normal, so they read the column they belong to.
    if (uShowClaims > 0.5) {
      vec2 column = floor(p.xz - vLookNormal.xz * 0.5 + uClaimSize * 0.5);
      float claim = floor(texture2D(uClaims, (column + 0.5) / uClaimSize).r * 255.0 + 0.5);
      if (claim > 0.5) {
        vec3 tint = uClaimColors[0];
        for (int i = 1; i < CLAIM_COUNT; i++) if (abs(claim - float(i)) < 0.5) tint = uClaimColors[i];
        diffuseColor.rgb = mix(diffuseColor.rgb, tint, 0.7);
      }
    }
    // Show lots: each lot filled in its district's color, its edge stronger.
    if (uShowLots > 0.5) {
      vec2 column = floor(p.xz - vLookNormal.xz * 0.5 + uClaimSize * 0.5);
      float v = floor(texture2D(uLots, (column + 0.5) / uClaimSize).r * 255.0 + 0.5);
      if (v > 0.5) {
        float d = mod(v, 64.0) - 1.0;
        vec3 tint = uDistrictColors[0];
        for (int i = 1; i < DISTRICT_COUNT; i++) if (abs(d - float(i)) < 0.5) tint = uDistrictColors[i];
        float edge = step(64.0, v);
        diffuseColor.rgb = mix(diffuseColor.rgb, tint, mix(0.5, 0.9, edge));
      }
    }
    // Show parks: a layer of its own, drawn over everything else, its edge stronger.
    if (uShowParks > 0.5) {
      vec2 column = floor(p.xz - vLookNormal.xz * 0.5 + uClaimSize * 0.5);
      float v = floor(texture2D(uParks, (column + 0.5) / uClaimSize).r * 255.0 + 0.5);
      if (v > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uParkColor, v > 1.5 ? 0.9 : 0.55);
    }
    }
  }
`;

const VERTEX = /* glsl */ `
  #include <begin_vertex>
  // Only the print layer is tinted; a cap (the river being dug) just lowers the ground.
  vPrinting = step(uPrintY, transformed.y);
  transformed.y = min(transformed.y, min(uPrintY, uCapY)) + PRINT_LIFT * vPrinting;
`;

/** Extra clamps for the build animation's meshes. */
export interface PrintExtras {
  /** A second ceiling (voxels), lowered to dig a mesh away from the top down. */
  cap?: { value: number };
  /** Discard columns already built, by the paving order (see LookUniforms.uBuild). */
  reveal?: Pick<LookUniforms, "uBuild" | "uBuildT" | "uClaimSize">;
  /** With `reveal`, the other way round: discard columns not reached yet (the water flowing in). */
  arriving?: boolean;
  /**
   * With `reveal`, one side of the build front for the ground: `built` keeps the columns the
   * paving has reached and the columns it never changes; `unbuilt` keeps only the changed columns
   * it has not reached yet. Two meshes drawn with the two parts show every column exactly once.
   */
  part?: "built" | "unbuilt";
  /** No blueprint tint on what is above the print height (for the rising water). */
  plain?: boolean;
  /** Lift what is flattened onto the print layer a little, so a mesh drawn over the ground (the
   * cut-away ground) never shares that plane with it. */
  lift?: boolean;
  /**
   * Per-lot ceilings (voxels) for the lots' dig: texel i of the texture is the ceiling for the
   * vertices whose `aLot` attribute is i, lowered to dig that lot away from the top down.
   */
  lotCaps?: { value: THREE.Texture | null };
}

const NO_CAP = { value: 1e5 };

function patchVertex(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: PrintUniforms, cap: { value: number } = NO_CAP, lift = false, lotCaps?: { value: THREE.Texture | null }) {
  shader.uniforms.uPrintY = uniforms.uPrintY;
  shader.uniforms.uCapY = cap;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\nuniform float uPrintY;\nuniform float uCapY;\nvarying float vPrinting;\n#define PRINT_LIFT ${lift ? "0.15" : "0.0"}`)
    .replace("#include <begin_vertex>", VERTEX);
  if (lotCaps) {
    shader.uniforms.uLotCaps = lotCaps;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uLotCaps;\nattribute float aLot;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y = min(transformed.y, texelFetch(uLotCaps, ivec2(int(aLot + 0.5), 0), 0).r);");
  }
}

/**
 * Lit vertex colors with the print clamp and the glowing layer. `options` tune it (e.g. for
 * water); `look` adds the voxel look (the ground).
 */
export function printMaterial(uniforms: PrintUniforms, options: THREE.MeshStandardMaterialParameters = {}, look?: LookUniforms, extras: PrintExtras = {}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, ...options });
  material.onBeforeCompile = (shader) => {
    patchVertex(shader, uniforms, extras.cap, extras.lift, extras.lotCaps);
    if (extras.reveal) {
      Object.assign(shader.uniforms, extras.reveal);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRevealPos;\nvarying vec3 vRevealNormal;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvRevealPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRevealNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);");
      shader.fragmentShader = shader.fragmentShader
        // (With the look, its uniforms are already declared; GLSL won't take them twice.)
        .replace("#include <common>", "#include <common>\n" + (look ? "" : "uniform sampler2D uBuild;\nuniform float uBuildT;\nuniform float uClaimSize;\n") + "varying vec3 vRevealPos;\nvarying vec3 vRevealNormal;")
        .replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>\n{ vec2 column = floor(vRevealPos.xz - vRevealNormal.xz * 0.5 + uClaimSize * 0.5); float o = texture2D(uBuild, (column + 0.5) / uClaimSize).r; if (${
            extras.part === "built" ? "o > 0.0 && o > uBuildT" : extras.part === "unbuilt" ? "o <= 0.0 || o <= uBuildT" : extras.arriving ? "o > uBuildT" : "o <= uBuildT"
          }) discard; }`,
        );
    }
    shader.uniforms.uPrintColor = uniforms.uPrintColor;
    if (look) {
      Object.assign(shader.uniforms, look);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLookPos;\nvarying vec3 vLookNormal;")
        .replace(
          "#include <project_vertex>",
          "#include <project_vertex>\nvLookPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLookNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform float uLookGrid;\nuniform float uLookStrata;\nuniform sampler2D uClaims;\nuniform float uClaimSize;\nuniform float uShowClaims;\nuniform sampler2D uSuit;\nuniform float uShowSuit;\nuniform sampler2D uDistricts;\nuniform float uShowDistricts;\nuniform sampler2D uLots;\nuniform float uShowLots;\nuniform sampler2D uParks;\nuniform float uShowParks;\nuniform vec3 uParkColor;\nuniform sampler2D uBuild;\nuniform float uBuildT;\nuniform vec3 uUnbuilt;\nuniform vec3 uGrassHigh;\nuniform float uGroundTop;\nuniform vec3 uBuildGlow;\n#define DISTRICT_COUNT ${look.uDistrictColors.value.length}\nuniform vec3 uDistrictColors[DISTRICT_COUNT];\n#define CLAIM_COUNT ${look.uClaimColors.value.length}\nuniform vec3 uClaimColors[CLAIM_COUNT];\nvarying vec3 vLookPos;\nvarying vec3 vLookNormal;`)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + LOOK_FRAGMENT);
    }
    if (extras.plain) return;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uPrintColor;\nvarying float vPrinting;")
      // Unprinted ground: a dark blueprint plate with a faint cyan glow, so the printed terrain reads against it.
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.03, 0.06), vPrinting * 0.85);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPrintColor * vPrinting * 0.12;");
  };
  material.customProgramCacheKey = () => (look ? "print-look" : "print") + (extras.cap ? "-cap" : "") + (extras.reveal ? "-reveal" : "") + (extras.plain ? "-plain" : "") + (extras.arriving ? "-arriving" : "") + (extras.part ? "-" + extras.part : "") + (extras.lift ? "-lift" : "") + (extras.lotCaps ? "-lots" : "");
  return material;
}

/** Shadow depth with the same clamp, so the shadow matches what has been printed. */
export function printDepthMaterial(uniforms: PrintUniforms): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => patchVertex(shader, uniforms);
  material.customProgramCacheKey = () => "terrain-print-depth";
  return material;
}
