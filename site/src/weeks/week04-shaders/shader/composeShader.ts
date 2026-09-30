import { STAGES, TECHNIQUES } from "../config";
import type { Stage, TechniqueType } from "../types";

/** One line of generated GLSL, tagged with the technique that wrote it (for highlighting). */
export interface CodeLine {
  text: string;
  owner?: TechniqueType;
}

export interface ComposedShader {
  /** Changes only when the GLSL changes. The viewport recompiles on a new key and nothing else. */
  key: string;
  vertexShader: string;
  fragmentShader: string;
  /** The techniques in the shader, in pipeline order (including the helper lighting). */
  activeTypes: TechniqueType[];
  /** True when Matcap is the base color: its picture already contains the light. */
  lightingSkipped: boolean;
}

class Code {
  lines: CodeLine[] = [];

  /** Adds a (possibly multi-line) block, indented, and tagged with its technique. */
  add(block: string, indent = 0, owner?: TechniqueType) {
    const pad = " ".repeat(indent);
    for (const line of block.replace(/^\n/, "").split("\n")) this.lines.push({ text: line ? pad + line : "", owner });
  }

  blank() {
    this.lines.push({ text: "" });
  }

  toString() {
    return this.lines.map((l) => l.text).join("\n");
  }
}

/**
 * The shader is the selected technique, plus plain Lambert light when it needs a lit surface to
 * show on. Flat and Matcap stay unlit (Flat is meant to be, Matcap has its light painted in), and
 * the lighting techniques are the light.
 */
const NEEDS_LIGHT = (type: TechniqueType) => !["flat", "matcap", "lambert", "toon"].includes(type);

function pickTechniques(technique: TechniqueType): { active: TechniqueType[]; helpers: TechniqueType[] } {
  const helpers: TechniqueType[] = NEEDS_LIGHT(technique) ? ["lambert"] : [];
  return { active: sortByStage([technique, ...helpers]), helpers };
}

function sortByStage(types: TechniqueType[]): TechniqueType[] {
  const order = STAGES.map((s) => s.id);
  return [...types].sort((a, b) => order.indexOf(TECHNIQUES[a].stage) - order.indexOf(TECHNIQUES[b].stage));
}

export function composeShader(technique: TechniqueType): ComposedShader {
  const { active, helpers } = pickTechniques(technique);
  const inStage = (stage: Stage) => active.filter((type) => TECHNIQUES[type].stage === stage);
  const lightingSkipped = active.includes("matcap");
  const hasToon = active.includes("toon");
  const note = (type: TechniqueType) => (helpers.includes(type) ? " (added so the effect has light to show on)" : "");

  // ---------------------------------------------------------------- vertex shader
  const v = new Code();
  v.add("// Vertex shader: runs once for every vertex and decides where it lands.");
  v.add("uniform float uTime;");
  for (const type of inStage("shape")) v.add(TECHNIQUES[type].uniforms.join("\n"), 0, type);
  if (hasToon) {
    v.add(
      "#ifdef OUTLINE\n  attribute vec3 aSmoothNormal;  // corner normals averaged, so the hull stays closed\n  uniform float uOutlineWidth;\n#endif",
      0,
      "toon",
    );
  }
  v.blank();
  v.add(`attribute float aHeight;   // the object's height, from its bounding box
attribute float aOcclude;  // 1 on objects, 0 on the floor (for fake AO)
attribute float aWater;    // 1 on the floor, which Ripple turns into water

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying float vLocalHeight;
varying float vAboveBase;
varying float vOcclude;
varying float vWater;`);
  for (const type of inStage("shape")) {
    if (TECHNIQUES[type].functions) v.add(TECHNIQUES[type].functions!, 0, type);
  }
  v.blank();
  v.add(`void main() {
  // Measured on the untouched object, before anything moves.
  vLocalHeight = position.y / aHeight;
  vAboveBase = position.y;
  vOcclude = aOcclude;
  vWater = aWater;

  vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;  // each object's origin is its base
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);

  // 1. Shape`);
  if (inStage("shape").length === 0) v.add("// (none)", 2);
  for (const type of inStage("shape")) {
    v.add(`// ${TECHNIQUES[type].name}`, 2, type);
    v.add(TECHNIQUES[type].body, 2, type);
  }
  if (hasToon) {
    v.blank();
    v.add(
      "#ifdef OUTLINE\n  // Outline pass: push the copy outwards. Only its back faces draw, leaving a rim.\n  world += normalize(mat3(modelMatrix) * aSmoothNormal) * uOutlineWidth;\n#endif",
      2,
      "toon",
    );
  }
  v.blank();
  v.add(`  vWorldPos = world;
  vWorldNormal = worldNormal;
  vViewNormal = normalize(mat3(viewMatrix) * worldNormal);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`);

  // ---------------------------------------------------------------- fragment shader
  const f = new Code();
  const fragmentTypes = active.filter((type) => TECHNIQUES[type].stage !== "shape" && !(lightingSkipped && TECHNIQUES[type].stage === "lighting"));
  // Shape techniques that also color what they moved (Ripple's water and foam).
  const shapeFragments = inStage("shape").filter((type) => TECHNIQUES[type].fragment);
  f.add("// Fragment shader: runs once for every pixel and decides its color.");
  f.add("uniform vec3 uLightDir;");
  for (const type of fragmentTypes) f.add(TECHNIQUES[type].uniforms.join("\n"), 0, type);
  for (const type of shapeFragments) f.add(TECHNIQUES[type].fragment!.uniforms.join("\n"), 0, type);
  f.blank();
  f.add(`varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying float vLocalHeight;
varying float vAboveBase;
varying float vOcclude;
varying float vWater;`);
  for (const type of fragmentTypes) {
    if (TECHNIQUES[type].functions) f.add(TECHNIQUES[type].functions!, 0, type);
  }
  for (const type of shapeFragments) {
    if (TECHNIQUES[type].fragment!.functions) f.add(TECHNIQUES[type].fragment!.functions!, 0, type);
  }
  f.blank();
  f.add(`void main() {
  vec3 N = normalize(vWorldNormal);                // which way the surface faces
  vec3 L = normalize(uLightDir);                   // towards the light
  vec3 V = normalize(cameraPosition - vWorldPos);  // towards the camera
  float ndl = max(dot(N, L), 0.0);                 // 1 facing the light, 0 facing away

  // 2. Base color
  vec3 albedo = vec3(0.55);  // neutral grey until a base color is added`);
  for (const type of inStage("base")) {
    f.add(`// ${TECHNIQUES[type].name}`, 2, type);
    f.add(TECHNIQUES[type].body, 2, type);
  }
  f.blank();
  f.add(`  // 3. Lighting
  float light = 1.0;  // unlit until a lighting technique is added`);
  if (lightingSkipped) {
    f.add("// Skipped: the matcap picture already contains its light.", 2, "matcap");
  } else {
    for (const type of inStage("lighting")) {
      f.add(`// ${TECHNIQUES[type].name}${note(type)}`, 2, type);
      f.add(TECHNIQUES[type].body, 2, type);
    }
  }
  f.add("  vec3 col = albedo * light;");
  for (const type of shapeFragments) {
    f.blank();
    f.add(`// ${TECHNIQUES[type].name}, in the fragment shader`, 2, type);
    f.add(TECHNIQUES[type].fragment!.body, 2, type);
  }
  for (const [label, stage] of [
    ["4. Surface", "surface"],
    ["5. Atmosphere", "atmosphere"],
  ] as const) {
    f.blank();
    f.add(`// ${label}`, 2);
    if (inStage(stage).length === 0) f.add("// (none)", 2);
    for (const type of inStage(stage)) {
      f.add(`// ${TECHNIQUES[type].name}`, 2, type);
      f.add(TECHNIQUES[type].body, 2, type);
    }
  }
  f.blank();
  f.add("  gl_FragColor = vec4(col, 1.0);");
  f.add("}");

  return {
    key: active.join(","),
    vertexShader: v.toString(),
    fragmentShader: f.toString(),
    activeTypes: active,
    lightingSkipped,
  };
}

/** The fragment shader of the outline pass: a flat dark rim. */
export const OUTLINE_FRAGMENT = /* glsl */ `
void main() {
  gl_FragColor = vec4(0.02, 0.03, 0.05, 1.0);
}
`;
