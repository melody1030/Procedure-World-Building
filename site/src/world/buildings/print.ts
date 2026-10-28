import * as THREE from "three";
import { FLOOR } from "./kit";

/**
 * A building's construction: it goes up storey by storey, as a building site would. The frame
 * (raw scaffolding: steel poles, ledgers and bracing over netting, a concrete deck on top, a row of
 * work lights along its edge) rises one storey at a time, a storey ahead of the finished facade,
 * which climbs steadily up behind it; each storey's windows light up once it is clad.
 *
 * Each building gets its own copies of the two shared materials (same shader program, so no cost
 * in programs) with its own two heights: `uFrameTop`, where the frame has reached (every vertex
 * above it is pulled down to it, so the unbuilt part flattens into a deck there), and `uCladTop`,
 * where the finished facade has reached (between the two, the scaffolding look). Unbuilt floors
 * cast no shadow (the body casts none until it is done).
 */

/** The share of a storey's time its frame takes to rise (it then waits for the next one). */
const FRAME_SHARE = 0.5;
/** Scaffold pole spacing along a face and ledger spacing up it, in voxels. */
const POLE = 4;
const LEDGER = FLOOR / 2;

const SCAFFOLD = new THREE.Color(0x34465a);
const STEEL = new THREE.Color(0xe0c068);
const CONCRETE = new THREE.Color(0x737a84);
const WORK_LIGHT = new THREE.Color(0xffb347);

export interface PrintableBuilding {
  /** Sets how far it has been built, 0 (nothing) to 1 (done). */
  setProgress(s: number): void;
  dispose(): void;
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);

function patch(glow: boolean, frame: { value: number }, clad: { value: number }) {
  return (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uFrameTop = frame;
    shader.uniforms.uCladTop = clad;
    shader.uniforms.uScaffold = { value: SCAFFOLD };
    shader.uniforms.uSteel = { value: STEEL };
    shader.uniforms.uWorkLight = { value: WORK_LIGHT };
    shader.uniforms.uConcrete = { value: CONCRETE };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uFrameTop;\nvarying vec3 vSitePos;\nvarying float vUnclad;\nvarying float vDeck;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvUnclad = transformed.y;\nvDeck = step(0.5, normal.y);\ntransformed.y = min(transformed.y, uFrameTop);\nvSitePos = transformed;",
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uFrameTop;\nuniform float uCladTop;\nuniform vec3 uScaffold;\nuniform vec3 uSteel;\nuniform vec3 uWorkLight;\nuniform vec3 uConcrete;\nvarying vec3 vSitePos;\nvarying float vUnclad;\nvarying float vDeck;",
    );
    if (glow) {
      // A window lights up once the facade has been clad up past it.
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\nif (vUnclad > uCladTop + 0.001) discard;");
    } else {
      // Above the cladding: scaffolding, poles along each face (x + z runs along whichever face this
      // is), ledgers up it, a brace on the diagonal; and work lights in a strip under the frame top.
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
float onSite = step(uCladTop + 0.001, vSitePos.y);
float along = vSitePos.x + vSitePos.z;
float pole = 1.0 - step(0.6, mod(along, ${POLE.toFixed(1)}));
float ledger = 1.0 - step(0.5, mod(vSitePos.y, ${LEDGER.toFixed(2)}));
float brace = 1.0 - step(0.5, mod(along - vSitePos.y, ${(FLOOR * 2).toFixed(1)}));
float steel = max(pole, max(ledger, brace));
// The deck at the frame top is bare concrete; the faces are scaffolding.
vec3 site = mix(mix(uScaffold, uSteel, steel), uConcrete, vDeck);
diffuseColor.rgb = mix(diffuseColor.rgb, site, onSite);
float workLight = onSite * (1.0 - vDeck) * (1.0 - smoothstep(0.0, 0.6, uFrameTop - vSitePos.y)) * step(0.5, fract(along * 0.5));`,
        )
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uWorkLight * workLight * 0.9;");
    }
  };
}

export function makePrintable(group: THREE.Group): PrintableBuilding {
  const frame = { value: 1e5 };
  const clad = { value: 1e5 };
  let height = 0;
  const materials: THREE.Material[] = [];
  const bodies: THREE.Mesh[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.computeBoundingBox();
    height = Math.max(height, o.geometry.boundingBox!.max.y);
    const glow = o.material instanceof THREE.MeshBasicMaterial;
    const material = (o.material as THREE.Material).clone();
    material.onBeforeCompile = patch(glow, frame, clad);
    material.customProgramCacheKey = () => (glow ? "building-site-glow" : "building-site-solid");
    o.material = material;
    materials.push(material);
    if (!glow) bodies.push(o);
  });
  // Storeys, the last one taking whatever is left (a roof, a spire).
  const storeys = Math.max(1, Math.round(height / FLOOR));
  const storeyTop = (i: number) => (i >= storeys ? height : i * FLOOR);
  const heightAt = (storey: number) => {
    const i = Math.floor(storey);
    return storeyTop(i) + (storeyTop(i + 1) - storeyTop(i)) * (storey - i);
  };
  let done = true;
  return {
    setProgress(s) {
      const finished = s >= 1;
      if (finished) {
        frame.value = 1e5;
        clad.value = 1e5;
      } else {
        // The frame runs a storey ahead, rising one storey at a time; the cladding climbs steadily behind it.
        const at = s * (storeys + 1);
        const i = Math.floor(at);
        frame.value = Math.min(height, storeyTop(i) + (storeyTop(i + 1) - storeyTop(i)) * ease(Math.min(1, (at - i) / FRAME_SHARE)));
        clad.value = heightAt(Math.max(0, at - 1));
      }
      if (finished !== done) {
        done = finished;
        for (const b of bodies) b.castShadow = finished;
      }
    },
    dispose() {
      for (const m of materials) m.dispose();
    },
  };
}
