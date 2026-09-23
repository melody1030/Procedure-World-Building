import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { WORLD_SIZE } from "./constants";
import { useDebouncedEffect } from "./useDebouncedEffect";
import { SliderField } from "./SliderField";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconMinusCircle,
  IconOrbit,
  IconPlusCircle,
  IconRefresh,
  IconSliders,
} from "./icons";
import { useCSGLabState } from "./csg-lab/state";
import { CSGLabViewport } from "./csg-lab/CSGLabViewport";
import { CSGLabPanel } from "./csg-lab/CSGLabPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewId = "resolution" | "density" | "csg";

type ResolutionShapeId = "creature" | "sphere" | "torus" | "octahedron" | "cube" | "heart" | "gyroid" | "twisted";

/** "orbit" drags the camera; "carve" removes voxels under the cursor; "paint" adds them onto the clicked face. */
type ResolutionEditMode = "orbit" | "carve" | "paint";

type DensityShapeId = "ground" | "fbm3d" | "ridged" | "terraced" | "islands" | "planet" | "strata";

interface ResolutionParams {
  n: number;
  shapeId: ResolutionShapeId;
}

interface ResolutionShapeMeta {
  id: ResolutionShapeId;
  name: string;
}

interface DensityParams {
  shapeId: DensityShapeId;
  frequency: number;
  amplitude: number;
  octaves: number;
  yOffset: number;
}

interface DensityShapeMeta {
  id: DensityShapeId;
  name: string;
  formula: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_INSTANCES = 200_000;
// Resolution shapes can go up to n=100; a solid cube at that resolution fills ~373k cells, so
// its InstancedMesh needs a higher capacity than the density volume's, with headroom to spare.
const RESOLUTION_MAX_INSTANCES = 400_000;
const DEBOUNCE_MS = 90;

const DENSITY_GRID_N = 48; // fixed sampling resolution for the density volume
const DENSITY_HALF = 6; // world-space half-extent of the density grid

const DEFAULT_RESOLUTION_PARAMS: ResolutionParams = { n: 20, shapeId: "creature" };

const RESOLUTION_SHAPES: ResolutionShapeMeta[] = [
  { id: "creature", name: "Creature on a Stand" },
  { id: "sphere", name: "Sphere" },
  { id: "torus", name: "Torus" },
  { id: "octahedron", name: "Octahedron" },
  { id: "cube", name: "Cube" },
  { id: "heart", name: "Heart" },
  { id: "gyroid", name: "Gyroid" },
  { id: "twisted", name: "Twisted Tower" },
];
const DEFAULT_DENSITY_PARAMS: DensityParams = {
  shapeId: "terraced",
  frequency: 1.4,
  amplitude: 1.2,
  octaves: 5,
  yOffset: 0,
};

const DENSITY_SHAPES: DensityShapeMeta[] = [
  {
    id: "ground",
    name: "Ground Plane",
    formula: "h(x,z) − y",
    description: "A single rolling terrain surface — solid below a noise-driven height field.",
  },
  {
    id: "fbm3d",
    name: "3D fBm",
    formula: "fbm3d(p)",
    description: "Fractal 3D noise sampled as a volume — soft, blobby floating masses.",
  },
  {
    id: "ridged",
    name: "Ridged 3D",
    formula: "1 − |fbm3d(p)|",
    description: "Ridged noise concentrates density near zero-crossings, forming thin sheets and walls.",
  },
  {
    id: "terraced",
    name: "Terraced",
    formula: "⌊h/k⌋·k − y",
    description: "Ground height is quantized into discrete steps, like sedimentary terraces.",
  },
  {
    id: "islands",
    name: "Floating Islands",
    formula: "fbm3d(p) − falloff(y)",
    description: "A 3D noise mass minus a height-band falloff isolates chunks floating in a narrow band.",
  },
  {
    id: "planet",
    name: "Planet",
    formula: "r + h(p̂) − |p|",
    description: "A sphere whose radius is perturbed by noise sampled on the unit direction — a diggable little world.",
  },
  {
    id: "strata",
    name: "Strata",
    formula: "h(x,z) + sin(y·k + n(x,z))",
    description: "Ground height plus a vertical sine wave creates layered, wavy sedimentary bands.",
  },
];

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

type ResolutionShapePart = "stand" | "sculpture";

/**
 * Abstract organic "creature on a stand" voxelization test in shape-local units, spanning
 * height ~= n: a squashed ellipsoid pedestal ("stand"), plus an egg-shaped body (wider at
 * the bottom, tapered at the top), a round head, and two small ear bumps (all "sculpture")
 * — each an algebraic ellipsoid inequality (sum-of-squares <= 1), unioned by returning on
 * the first one a cell falls inside. Returns null if the cell is outside every part.
 */
function resolveResolutionShapePart(x: number, y: number, z: number, n: number): ResolutionShapePart | null {
  const half = n / 2;

  // Pedestal: a flattened ellipsoid whose bottom touches the floor of the sampling grid.
  const baseHeight = n * 0.14;
  const baseRX = n * 0.34;
  const baseRY = baseHeight * 0.7;
  const baseRZ = n * 0.34;
  const baseY = -half + baseRY;
  const qBase = (x / baseRX) ** 2 + ((y - baseY) / baseRY) ** 2 + (z / baseRZ) ** 2;
  if (qBase <= 1) return "stand";

  // Body: an egg shape — a taller, narrower ellipsoid above the bottom half, wider below.
  const bodyHeight = n * 0.5;
  const bodyBottomY = -half + baseHeight * 0.7;
  const bodyCenterY = bodyBottomY + bodyHeight * 0.5;
  const bodyRXZ = n * 0.24;
  const bodyRYBottom = bodyHeight * 0.62;
  const bodyRYTop = bodyHeight * 0.42;
  const bodyRY = y >= bodyCenterY ? bodyRYTop : bodyRYBottom;
  const qBody = (x / bodyRXZ) ** 2 + ((y - bodyCenterY) / bodyRY) ** 2 + (z / bodyRXZ) ** 2;
  if (qBody <= 1) return "sculpture";

  // Head: a sphere resting on top of the body.
  const headR = n * 0.16;
  const headY = bodyCenterY + bodyRYTop + n * 0.12;
  const qHead = (x * x + (y - headY) * (y - headY) + z * z) / (headR * headR);
  if (qHead <= 1) return "sculpture";

  // Ears: two small spheres offset in x, perched just above the head.
  const earR = n * 0.055;
  const earY = headY + headR * 0.75;
  const earOffsetX = headR * 0.55;
  const qEarLeft = ((x - earOffsetX) ** 2 + (y - earY) ** 2 + z * z) / (earR * earR);
  if (qEarLeft <= 1) return "sculpture";
  const qEarRight = ((x + earOffsetX) ** 2 + (y - earY) ** 2 + z * z) / (earR * earR);
  if (qEarRight <= 1) return "sculpture";

  return null;
}

/** A simple sphere, centered in the sampling grid. */
function isInsideSphere(x: number, y: number, z: number, n: number): boolean {
  const r = n * 0.42;
  return x * x + y * y + z * z <= r * r;
}

/** A torus: distance from the ring's centerline, in the xz-plane, must be within the tube radius. */
function isInsideTorus(x: number, y: number, z: number, n: number): boolean {
  const majorR = n * 0.32;
  const minorR = n * 0.16;
  const qxz = Math.sqrt(x * x + z * z) - majorR;
  return qxz * qxz + y * y <= minorR * minorR;
}

/** A faceted octahedron (diamond): |x| + |y| + |z| <= r. */
function isInsideOctahedron(x: number, y: number, z: number, n: number): boolean {
  const r = n * 0.42;
  return Math.abs(x) + Math.abs(y) + Math.abs(z) <= r;
}

/** An axis-aligned cube. */
function isInsideCube(x: number, y: number, z: number, n: number): boolean {
  const half = n * 0.36;
  return Math.abs(x) <= half && Math.abs(y) <= half && Math.abs(z) <= half;
}

/**
 * The classic implicit "heart surface" (Taubin's heart): (x² + 9/4 y² + z² - 1)³ ≤ x²z³ + 9/80 y²z³.
 * In the formula's own axes only the third variable is raised to odd powers, which is what makes
 * the shape pointed at one end and lobed at the other — so that axis is mapped to our world "y"
 * (up), and the symmetric "9/4"-scaled axis is mapped to world "z" (front-to-back thickness), so
 * the heart stands upright on its point instead of lying on its side.
 */
function isInsideHeart(x: number, y: number, z: number, n: number): boolean {
  const s = n * 0.36;
  const X = x / s;
  const Y = z / s;
  const Z = y / s;
  const a = X * X + (9 / 4) * Y * Y + Z * Z - 1;
  const f = a * a * a - X * X * Z * Z * Z - (9 / 80) * Y * Y * Z * Z * Z;
  return f <= 0;
}

/**
 * A gyroid — a triply periodic minimal surface (sin x cos y + sin y cos z + sin z cos x = 0) —
 * clipped to a sphere. A genuinely intricate lattice whose fine structure only reads correctly
 * at high resolution, making it a dramatic aliasing demonstration. The frequency is scaled by
 * 1/n so the number of lattice cells stays fixed as n changes — only their voxelized fidelity
 * changes, matching every other shape here (resolution changes sampling, not the shape itself).
 */
function isInsideGyroid(x: number, y: number, z: number, n: number): boolean {
  const boundR = n * 0.4;
  if (x * x + y * y + z * z > boundR * boundR) return false;
  const freq = 20 / n;
  const gx = x * freq;
  const gy = y * freq;
  const gz = z * freq;
  const value = Math.sin(gx) * Math.cos(gy) + Math.sin(gy) * Math.cos(gz) + Math.sin(gz) * Math.cos(gx);
  return value <= 0;
}

/** A square tower whose cross-section rotates progressively with height, like a twisted skyscraper. */
function isInsideTwistedTower(x: number, y: number, z: number, n: number): boolean {
  const halfHeight = n * 0.4;
  if (y < -halfHeight || y > halfHeight) return false;
  const half = n * 0.22;
  const totalTwist = 2.6; // radians of rotation from bottom to top
  const t = (y + halfHeight) / (2 * halfHeight);
  const angle = -t * totalTwist;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rx = x * cos - z * sin;
  const rz = x * sin + z * cos;
  return Math.abs(rx) <= half && Math.abs(rz) <= half;
}

/** Dispatches to the active shape preset, returning which part a cell belongs to (or null if outside). */
function resolveResolutionShape(x: number, y: number, z: number, n: number, shapeId: ResolutionShapeId): ResolutionShapePart | null {
  switch (shapeId) {
    case "creature":
      return resolveResolutionShapePart(x, y, z, n);
    case "sphere":
      return isInsideSphere(x, y, z, n) ? "sculpture" : null;
    case "torus":
      return isInsideTorus(x, y, z, n) ? "sculpture" : null;
    case "octahedron":
      return isInsideOctahedron(x, y, z, n) ? "sculpture" : null;
    case "cube":
      return isInsideCube(x, y, z, n) ? "sculpture" : null;
    case "heart":
      return isInsideHeart(x, y, z, n) ? "sculpture" : null;
    case "gyroid":
      return isInsideGyroid(x, y, z, n) ? "sculpture" : null;
    case "twisted":
      return isInsideTwistedTower(x, y, z, n) ? "sculpture" : null;
    default:
      return null;
  }
}

/** Raw fractal Brownian motion, normalized to roughly [-1, 1]. */
function fbmRaw3d(simplex: SimplexNoise, x: number, y: number, z: number, frequency: number, octaves: number): number {
  let total = 0;
  let amp = 1;
  let freq = frequency;
  let maxAmp = 0;
  for (let o = 0; o < octaves; o++) {
    total += amp * simplex.noise3d(x * freq, y * freq, z * freq);
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return maxAmp > 0 ? total / maxAmp : 0;
}

function fbmRaw2d(simplex: SimplexNoise, x: number, z: number, frequency: number, octaves: number): number {
  let total = 0;
  let amp = 1;
  let freq = frequency;
  let maxAmp = 0;
  for (let o = 0; o < octaves; o++) {
    total += amp * simplex.noise(x * freq, z * freq);
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return maxAmp > 0 ? total / maxAmp : 0;
}

/** fBm scaled by the amplitude slider, roughly in [-amplitude, amplitude]. */
function fbm3d(simplex: SimplexNoise, x: number, y: number, z: number, params: DensityParams): number {
  return fbmRaw3d(simplex, x, y, z, params.frequency, params.octaves) * params.amplitude;
}

function fbm2d(simplex: SimplexNoise, x: number, z: number, frequency: number, amplitude: number, octaves: number): number {
  return fbmRaw2d(simplex, x, z, frequency, octaves) * amplitude;
}

function groundHeight(simplex: SimplexNoise, x: number, z: number, params: DensityParams): number {
  const octaves = Math.min(params.octaves, 4);
  return fbm2d(simplex, x, z, params.frequency * 0.3, params.amplitude * 2.5, octaves) + params.yOffset;
}

function densityAt(simplex: SimplexNoise, x: number, y: number, z: number, params: DensityParams): number {
  switch (params.shapeId) {
    case "ground": {
      return y - groundHeight(simplex, x, z, params);
    }
    case "fbm3d": {
      return -fbm3d(simplex, x, y - params.yOffset, z, params);
    }
    case "ridged": {
      const raw = fbmRaw3d(simplex, x, y - params.yOffset, z, params.frequency, params.octaves);
      const ridged = 1 - Math.abs(raw);
      const thickness = 0.08 + params.amplitude * 0.12;
      return 1 - thickness - ridged;
    }
    case "terraced": {
      const raw = groundHeight(simplex, x, z, params);
      const k = 0.4 + params.amplitude * 0.5;
      const terraceHeight = Math.floor(raw / k) * k;
      const smooth = raw - terraceHeight;
      return y - (terraceHeight + smooth * 0.15);
    }
    case "islands": {
      const mass = fbm3d(simplex, x, y, z, params);
      const bandHalf = 2.5;
      const dy = (y - params.yOffset) / bandHalf;
      const falloff = dy * dy;
      return falloff - mass;
    }
    case "planet": {
      const cy = y - params.yOffset;
      const len = Math.sqrt(x * x + cy * cy + z * z) || 1e-5;
      const nx = x / len;
      const ny = cy / len;
      const nz = z / len;
      const radius = 2.4 + params.amplitude * 1.1;
      const h = fbmRaw3d(simplex, nx * 4, ny * 4, nz * 4, params.frequency, params.octaves) * (params.amplitude * 0.8);
      return len - (radius + h);
    }
    case "strata": {
      const base = groundHeight(simplex, x, z, params);
      const k = 0.6 + params.frequency * 1.2;
      const bandNoise = fbm2d(simplex, x, z, params.frequency * 0.5, 1, Math.min(params.octaves, 3));
      return y - (base + Math.sin(y * k + bandNoise) * (0.3 + params.amplitude * 0.3));
    }
    default:
      return 1;
  }
}

/**
 * MeshLambertMaterial's USE_COLOR shader path multiplies vColor by the geometry's own
 * `color` vertex attribute before applying instanceColor; without one bound, WebGL falls
 * back to (0,0,0), silently zeroing every instance to black. A flat white attribute makes
 * that multiply a no-op so InstancedMesh.setColorAt drives the visible color.
 */
function withWhiteVertexColorAttribute(geometry: THREE.BoxGeometry): THREE.BoxGeometry {
  const count = geometry.attributes.position.count;
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  return geometry;
}

/** Shared slate-to-cyan height gradient — used by both the Resolution and Density views. */
function heightGradientColor(t: number, out: THREE.Color): void {
  out.setRGB(0.16 + t * 0.08, 0.35 + t * 0.4, 0.5 + t * 0.4);
}

/** Warm stone/plinth color for the pedestal, contrasting with the cyan sculpture above it. */
const STAND_COLOR = new THREE.Color(0.5, 0.44, 0.36);

/** Each preset's designated palette — a distinct hue readable at a glance when switching shapes. */
function colorForVoxel(shapeId: ResolutionShapeId, part: ResolutionShapePart, y: number, n: number, out: THREE.Color): void {
  if (part === "stand") {
    out.copy(STAND_COLOR);
    return;
  }
  const t = THREE.MathUtils.clamp((y + n / 2) / n, 0, 1);
  switch (shapeId) {
    case "sphere":
      out.setRGB(0.55 + t * 0.25, 0.16 + t * 0.14, 0.14 + t * 0.08); // deep red -> warm coral
      break;
    case "torus":
      out.setRGB(0.32 + t * 0.26, 0.14 + t * 0.14, 0.52 + t * 0.32); // indigo -> violet
      break;
    case "octahedron":
      out.setRGB(0.55 + t * 0.32, 0.4 + t * 0.32, 0.08 + t * 0.14); // amber -> gold
      break;
    case "cube":
      out.setRGB(0.1 + t * 0.1, 0.42 + t * 0.36, 0.26 + t * 0.2); // forest -> emerald
      break;
    case "heart":
      out.setRGB(0.7 + t * 0.22, 0.08 + t * 0.14, 0.2 + t * 0.18); // crimson -> pink
      break;
    case "gyroid":
      out.setRGB(0.06 + t * 0.14, 0.48 + t * 0.34, 0.46 + t * 0.34); // teal -> aqua
      break;
    case "twisted":
      out.setRGB(0.5 + t * 0.28, 0.3 + t * 0.22, 0.12 + t * 0.08); // bronze -> copper
      break;
    default:
      heightGradientColor(t, out); // creature sculpture: slate -> cyan
  }
}

function colorForDensity(y: number, out: THREE.Color): void {
  const t = THREE.MathUtils.clamp((y + DENSITY_HALF) / (DENSITY_HALF * 2), 0, 1);
  heightGradientColor(t, out);
}

// ---------------------------------------------------------------------------
// ResolutionView — voxelization of a composite body+base shape
// ---------------------------------------------------------------------------

interface ResolutionSceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  color: THREE.Color;
  raycaster: THREE.Raycaster;
  /** Parallel to the mesh's packed instance slots: cellKeys[slot] is that slot's "ix,iy,iz" key. */
  cellKeys: string[];
  cellIndex: Map<string, number>;
  n: number;
  half: number;
  cellSize: number;
  shapeId: ResolutionShapeId;
  mode: ResolutionEditMode;
}

function resolutionCellKey(ix: number, iy: number, iz: number): string {
  return `${ix},${iy},${iz}`;
}

/** Removes the voxel at instance slot `slot`, swapping the last packed instance into its place. */
function removeResolutionVoxel(refs: ResolutionSceneRefs, slot: number): void {
  const { mesh, cellKeys, cellIndex } = refs;
  if (slot < 0 || slot >= mesh.count) return;
  const last = mesh.count - 1;
  const removedKey = cellKeys[slot];
  if (slot !== last) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(last, matrix);
    mesh.setMatrixAt(slot, matrix);
    const movedColor = new THREE.Color();
    mesh.getColorAt(last, movedColor);
    mesh.setColorAt(slot, movedColor);
    cellKeys[slot] = cellKeys[last];
    cellIndex.set(cellKeys[slot], slot);
  }
  cellIndex.delete(removedKey);
  cellKeys.length = last;
  mesh.count = last;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Appends a new voxel at grid cell (ix, iy, iz) if that cell is empty and in bounds. */
function addResolutionVoxel(refs: ResolutionSceneRefs, ix: number, iy: number, iz: number): void {
  const { mesh, dummy, color, cellKeys, cellIndex, n, half, cellSize, shapeId } = refs;
  if (ix < -n || ix > 2 * n || iy < -n || iy > 2 * n || iz < -n || iz > 2 * n) return;
  const key = resolutionCellKey(ix, iy, iz);
  if (cellIndex.has(key)) return;
  if (mesh.count >= RESOLUTION_MAX_INSTANCES) return;

  const x = -half + ix + 0.5;
  const y = -half + iy + 0.5;
  const z = -half + iz + 0.5;
  const slot = mesh.count;
  dummy.position.set(x * cellSize, y * cellSize, z * cellSize);
  dummy.scale.setScalar(cellSize * 0.95);
  dummy.updateMatrix();
  mesh.setMatrixAt(slot, dummy.matrix);
  colorForVoxel(shapeId, "sculpture", y, n, color);
  mesh.setColorAt(slot, color);
  cellKeys[slot] = key;
  cellIndex.set(key, slot);
  mesh.count = slot + 1;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Raycasts the mesh from a screen point and carves or paints the voxel it hits, per the active mode. */
function applyResolutionEditAtPoint(refs: ResolutionSceneRefs, clientX: number, clientY: number): void {
  if (refs.mode === "orbit") return;
  const rect = refs.renderer.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  refs.raycaster.setFromCamera(pointer, refs.camera);
  const hits = refs.raycaster.intersectObject(refs.mesh);
  if (hits.length === 0) return;
  const hit = hits[0];
  if (hit.instanceId === undefined) return;

  if (refs.mode === "carve") {
    removeResolutionVoxel(refs, hit.instanceId);
    return;
  }

  const key = refs.cellKeys[hit.instanceId];
  const normal = hit.face?.normal;
  if (!key || !normal) return;
  const [ix, iy, iz] = key.split(",").map(Number);
  addResolutionVoxel(refs, ix + Math.round(normal.x), iy + Math.round(normal.y), iz + Math.round(normal.z));
}

function ResolutionView({
  params,
  editMode,
  resetToken,
}: {
  params: ResolutionParams;
  editMode: ResolutionEditMode;
  resetToken: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<ResolutionSceneRefs | null>(null);
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f17);
    scene.fog = new THREE.Fog(0x0a0f17, 30, 68);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(13, 13.2825, 13); // 5% higher still (originally y = 11, then +15%, then +5%)

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 0.6;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);

    const directional = new THREE.DirectionalLight(0xffffff, 2);
    directional.position.set(10, 16, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.camera.left = -(WORLD_SIZE / 2 + 2);
    directional.shadow.camera.right = WORLD_SIZE / 2 + 2;
    directional.shadow.camera.top = WORLD_SIZE / 2 + 2;
    directional.shadow.camera.bottom = -(WORLD_SIZE / 2 + 2);
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 50;
    directional.shadow.bias = -0.0004;
    directional.shadow.normalBias = 0.02;
    scene.add(directional.target);

    scene.add(ambient, directional);

    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), new THREE.ShadowMaterial({ opacity: 0.18 }));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -WORLD_SIZE / 2 - 0.01;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const geometry = withWhiteVertexColorAttribute(new THREE.BoxGeometry(1, 1, 1));
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geometry, material, RESOLUTION_MAX_INSTANCES);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const raycaster = new THREE.Raycaster();

    refsRef.current = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      dummy,
      color,
      raycaster,
      cellKeys: [],
      cellIndex: new Map(),
      n: params.n,
      half: params.n / 2,
      cellSize: WORLD_SIZE / params.n,
      shapeId: params.shapeId,
      mode: "orbit",
    };

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    const handlePointerDown = (event: PointerEvent) => {
      const refs = refsRef.current;
      if (!refs || refs.mode === "orbit") return;
      isPointerDownRef.current = true;
      applyResolutionEditAtPoint(refs, event.clientX, event.clientY);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!isPointerDownRef.current) return;
      const refs = refsRef.current;
      if (!refs || refs.mode === "orbit") return;
      applyResolutionEditAtPoint(refs, event.clientX, event.clientY);
    };
    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };
    mount.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      mount.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      refsRef.current = null;
    };
  }, []);

  // Rebuilds from the shape formula — this is also how "Reset" (bumping resetToken) discards edits.
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs) return;
    const { mesh, dummy, color } = refs;
    const { n, shapeId } = params;
    const cellSize = WORLD_SIZE / n;
    const half = n / 2;
    const cellKeys: string[] = [];
    const cellIndex = new Map<string, number>();
    let index = 0;

    outer: for (let iy = 0; iy < n; iy++) {
      const y = -half + iy + 0.5;
      for (let ix = 0; ix < n; ix++) {
        const x = -half + ix + 0.5;
        for (let iz = 0; iz < n; iz++) {
          const z = -half + iz + 0.5;
          const part = resolveResolutionShape(x, y, z, n, shapeId);
          if (part === null) continue;
          if (index >= RESOLUTION_MAX_INSTANCES) break outer;
          dummy.position.set(x * cellSize, y * cellSize, z * cellSize);
          dummy.scale.setScalar(cellSize * 0.95);
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
          colorForVoxel(shapeId, part, y, n, color);
          mesh.setColorAt(index, color);
          const key = resolutionCellKey(ix, iy, iz);
          cellKeys[index] = key;
          cellIndex.set(key, index);
          index++;
        }
      }
    }

    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    refs.cellKeys = cellKeys;
    refs.cellIndex = cellIndex;
    refs.n = n;
    refs.half = half;
    refs.cellSize = cellSize;
    refs.shapeId = shapeId;
    // resetToken has no value of its own — bumping it just forces this rebuild to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, resetToken]);

  // Camera drag vs. carve/paint are mutually exclusive: orbiting is disabled while editing.
  useEffect(() => {
    const refs = refsRef.current;
    const mount = mountRef.current;
    if (!refs || !mount) return;
    refs.mode = editMode;
    refs.controls.enabled = editMode === "orbit";
    refs.controls.autoRotate = editMode === "orbit";
    mount.style.cursor = editMode === "orbit" ? "grab" : "crosshair";
  }, [editMode]);

  return <div ref={mountRef} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// DensityView — implicit-surface volumes driven by simplex noise
// ---------------------------------------------------------------------------

interface DensitySceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  color: THREE.Color;
  simplex: SimplexNoise;
}

function DensityView({ params }: { params: DensityParams }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<DensitySceneRefs | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f17);
    scene.fog = new THREE.Fog(0x0a0f17, 30, 68);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(14, 17, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xaac4dd, 0.28);

    const key = new THREE.DirectionalLight(0xfff4e0, 3.4);
    key.position.set(15, 30, 15);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -DENSITY_HALF - 2;
    key.shadow.camera.right = DENSITY_HALF + 2;
    key.shadow.camera.top = DENSITY_HALF + 2;
    key.shadow.camera.bottom = -DENSITY_HALF - 2;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key.target);

    const fill = new THREE.DirectionalLight(0x8fb8d9, 0.5);
    fill.position.set(-14, 10, -12);

    scene.add(ambient, key, fill);

    const wireGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(DENSITY_HALF * 2, DENSITY_HALF * 2, DENSITY_HALF * 2));
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.2 });
    const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
    scene.add(wireframe);

    const geometry = withWhiteVertexColorAttribute(new THREE.BoxGeometry(1, 1, 1));
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.1 });
    const mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const simplex = new SimplexNoise();

    refsRef.current = { renderer, scene, camera, controls, mesh, dummy, color, simplex };

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      wireGeometry.dispose();
      wireMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      refsRef.current = null;
    };
  }, []);

  useDebouncedEffect(
    () => {
      const refs = refsRef.current;
      if (!refs) return;
      const { mesh, dummy, color, simplex } = refs;
      const cellSize = (DENSITY_HALF * 2) / DENSITY_GRID_N;
      const half = DENSITY_GRID_N / 2;
      let index = 0;

      outer: for (let iy = 0; iy < DENSITY_GRID_N; iy++) {
        const y = (-half + iy + 0.5) * cellSize;
        for (let ix = 0; ix < DENSITY_GRID_N; ix++) {
          const x = (-half + ix + 0.5) * cellSize;
          for (let iz = 0; iz < DENSITY_GRID_N; iz++) {
            const z = (-half + iz + 0.5) * cellSize;
            const d = densityAt(simplex, x, y, z, params);
            if (d > 0) continue;
            if (index >= MAX_INSTANCES) break outer;
            dummy.position.set(x, y, z);
            dummy.scale.setScalar(cellSize * 0.92);
            dummy.updateMatrix();
            mesh.setMatrixAt(index, dummy.matrix);
            colorForDensity(y, color);
            mesh.setColorAt(index, color);
            index++;
          }
        }
      }

      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    [params],
    DEBOUNCE_MS,
  );

  return <div ref={mountRef} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// UI panels
// ---------------------------------------------------------------------------

const RESOLUTION_EDIT_MODES: { id: ResolutionEditMode; label: string; icon: JSX.Element }[] = [
  { id: "orbit", label: "Orbit", icon: <IconOrbit /> },
  { id: "carve", label: "Carve", icon: <IconMinusCircle /> },
  { id: "paint", label: "Paint", icon: <IconPlusCircle /> },
];

function ResolutionPanel({
  params,
  onChange,
  editMode,
  onEditModeChange,
  onReset,
}: {
  params: ResolutionParams;
  onChange: (patch: Partial<ResolutionParams>) => void;
  editMode: ResolutionEditMode;
  onEditModeChange: (mode: ResolutionEditMode) => void;
  onReset: () => void;
}) {
  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 flex w-[36rem] max-w-[92vw] -translate-x-1/2 flex-col items-stretch gap-4 rounded-3xl border border-slate-700/50 bg-slate-900/70 px-8 py-5 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <span className="w-24 shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-slate-400">Shape</span>
        <div className="relative flex-1">
          <select
            value={params.shapeId}
            onChange={(event) => onChange({ shapeId: event.target.value as ResolutionShapeId })}
            className="w-full cursor-pointer appearance-none rounded-xl border border-slate-700/50 bg-slate-800/60 py-1.5 pl-3 pr-10 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
          >
            {RESOLUTION_SHAPES.map((shape) => (
              <option key={shape.id} value={shape.id} className="bg-slate-900 text-slate-200">
                {shape.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
            <IconChevronDown />
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-24 shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-slate-400">Resolution</span>
        <input
          type="range"
          min={8}
          max={100}
          step={1}
          value={params.n}
          onChange={(event) => onChange({ n: Number(event.target.value) })}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
        />
        <span className="w-16 shrink-0 text-right font-mono text-sm text-cyan-300">n = {params.n}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="w-24 shrink-0 whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-slate-400">Mode</span>
        <div className="flex flex-1 gap-2">
          {RESOLUTION_EDIT_MODES.map((option) => (
            <button
              key={option.id}
              onClick={() => onEditModeChange(option.id)}
              className={
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors " +
                (editMode === option.id
                  ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-300"
                  : "border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60")
              }
            >
              {option.icon}
              {option.label}
            </button>
          ))}
          <button
            onClick={onReset}
            title="Undo all edits and rebuild from the shape formula"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700/60"
          >
            <IconRefresh />
            Reset
          </button>
        </div>
      </div>
      {editMode !== "orbit" && (
        <p className="text-center text-xs text-slate-400">
          {editMode === "carve" ? "Click or drag on the model to remove voxels." : "Click or drag on a face to add voxels."}
        </p>
      )}
    </div>
  );
}

function DensityPanel({
  params,
  onChange,
  open,
  onToggleOpen,
}: {
  params: DensityParams;
  onChange: (patch: Partial<DensityParams>) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const selectedShape = DENSITY_SHAPES.find((shape) => shape.id === params.shapeId);

  return (
    <>
      <button
        onClick={onToggleOpen}
        className="pointer-events-auto absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/50 bg-slate-900/70 text-slate-300 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:text-cyan-300"
        aria-label={open ? "Close settings panel" : "Open settings panel"}
      >
        {open ? <IconChevronRight /> : <IconSliders />}
      </button>
      <div
        className={
          "pointer-events-auto absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col gap-6 overflow-y-auto border-l border-slate-700/50 bg-slate-900/70 p-6 pt-16 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-300 " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <section className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Parameters</h3>
          <SliderField
            label="Frequency"
            value={params.frequency}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(value) => onChange({ frequency: value })}
          />
          <SliderField
            label="Amplitude"
            value={params.amplitude}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(value) => onChange({ amplitude: value })}
          />
          <SliderField
            label="Octaves"
            value={params.octaves}
            min={1}
            max={8}
            step={1}
            onChange={(value) => onChange({ octaves: Math.round(value) })}
          />
          <SliderField
            label="Y Offset"
            value={params.yOffset}
            min={-5}
            max={5}
            step={0.1}
            onChange={(value) => onChange({ yOffset: value })}
          />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Shape</h3>
          <select
            value={params.shapeId}
            onChange={(event) => onChange({ shapeId: event.target.value as DensityShapeId })}
            className="w-full cursor-pointer rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
          >
            {DENSITY_SHAPES.map((shape) => (
              <option key={shape.id} value={shape.id} className="bg-slate-900 text-slate-200">
                {shape.name}
              </option>
            ))}
          </select>
          {selectedShape && (
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-cyan-200">
              <div className="font-mono text-xs text-cyan-300/80">{selectedShape.formula}</div>
              <div className="mt-1 text-xs text-slate-400">{selectedShape.description}</div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Sidebar({
  view,
  onChangeView,
  collapsed,
  onToggleCollapsed,
}: {
  view: ViewId;
  onChangeView: (view: ViewId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      className={
        "pointer-events-auto absolute left-4 top-4 flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/60 p-4 text-slate-200 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-300 " +
        (collapsed ? "w-14" : "w-64")
      }
    >
      <div className="flex items-center justify-between gap-2">
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold uppercase tracking-wider text-cyan-400">Design 6197 / 4197</div>
            <div className="text-[11px] text-slate-400">Fall 2026</div>
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-cyan-300"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
        </button>
      </div>
      <nav className="flex flex-col gap-1">
        <button
          onClick={() => onChangeView("resolution")}
          className={
            "rounded-lg px-3 py-2 text-left text-sm transition-colors " +
            (view === "resolution"
              ? "border border-cyan-400/30 bg-cyan-500/15 text-cyan-300"
              : "text-slate-300 hover:bg-slate-800/60 hover:text-cyan-300")
          }
        >
          {collapsed ? "01" : "01 — Voxels (Resolution)"}
        </button>
        <button
          onClick={() => onChangeView("density")}
          className={
            "rounded-lg px-3 py-2 text-left text-sm transition-colors " +
            (view === "density"
              ? "border border-cyan-400/30 bg-cyan-500/15 text-cyan-300"
              : "text-slate-300 hover:bg-slate-800/60 hover:text-cyan-300")
          }
        >
          {collapsed ? "02" : "02 — Volumes (Implicit Surfaces)"}
        </button>
        <button
          onClick={() => onChangeView("csg")}
          className={
            "rounded-lg px-3 py-2 text-left text-sm transition-colors " +
            (view === "csg"
              ? "border border-cyan-400/30 bg-cyan-500/15 text-cyan-300"
              : "text-slate-300 hover:bg-slate-800/60 hover:text-cyan-300")
          }
        >
          {collapsed ? "03" : "03 — CSG (Boolean Ops)"}
        </button>
      </nav>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export default function Week03VoxelsVolumes() {
  const [view, setView] = useState<ViewId>("resolution");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [resolutionParams, setResolutionParams] = useState<ResolutionParams>(DEFAULT_RESOLUTION_PARAMS);
  const [resolutionEditMode, setResolutionEditMode] = useState<ResolutionEditMode>("orbit");
  const [resolutionResetToken, setResolutionResetToken] = useState(0);
  const [densityParams, setDensityParams] = useState<DensityParams>(DEFAULT_DENSITY_PARAMS);
  const [densityPanelOpen, setDensityPanelOpen] = useState(true);
  const csgLab = useCSGLabState();

  const handleResolutionChange = useCallback((patch: Partial<ResolutionParams>) => {
    setResolutionParams((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleDensityChange = useCallback((patch: Partial<DensityParams>) => {
    setDensityParams((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-2xl bg-slate-950">
      <div className="absolute inset-0">
        {view === "resolution" && (
          <ResolutionView params={resolutionParams} editMode={resolutionEditMode} resetToken={resolutionResetToken} />
        )}
        {view === "density" && <DensityView params={densityParams} />}
        {view === "csg" && <CSGLabViewport state={csgLab} />}
      </div>
      <div className="pointer-events-none absolute inset-0">
        <Sidebar
          view={view}
          onChangeView={setView}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        />
        {view === "resolution" && (
          <ResolutionPanel
            params={resolutionParams}
            onChange={handleResolutionChange}
            editMode={resolutionEditMode}
            onEditModeChange={setResolutionEditMode}
            onReset={() => setResolutionResetToken((token) => token + 1)}
          />
        )}
        {view === "density" && (
          <DensityPanel
            params={densityParams}
            onChange={handleDensityChange}
            open={densityPanelOpen}
            onToggleOpen={() => setDensityPanelOpen((prev) => !prev)}
          />
        )}
        {view === "csg" && <CSGLabPanel state={csgLab} />}
      </div>
    </div>
  );
}
