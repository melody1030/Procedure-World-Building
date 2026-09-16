import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { elevationColor } from "./colorRamp";
import { createRng, defaultErosionParams, erodeDroplets, sampleHeightField } from "./erosion";
import type { CameraPreset, MapCell, Week1State } from "./types";

const GRID_SIZE = 14;
const HEIGHT_SCALE = 2.5;
const WIREFRAME_COLOR = 0x9a9a9a;
const WIREFRAME_OPACITY_SUBTLE = 0.1;
const WIREFRAME_OPACITY_BOLD = 0.4;
const TERRAIN_OPACITY_HEIGHTMAP = 1;
const TERRAIN_OPACITY_WIREFRAME = 0.5;
const MARKER_COLOR = 0xffffff;
const CAMERA_MOVE_DURATION_MS = 700;
// Same background/grid/fog treatment as Week 1 — a solid-color backdrop with a GridHelper
// floor and matching fog, instead of Week 2's old gradient-sky + plain ground plane.
const BACKGROUND_COLOR = "#1a1a2e";
const GROUND_SIZE = GRID_SIZE * 8;
const GRID_HELPER_SIZE = 80;
const GRID_HELPER_DIVISIONS = 80;
const FOG_NEAR = 15;
const FOG_FAR = 50;
const EROSION_TICK_MS = 100;
const DROPLETS_PER_TICK = 15;

const CAMERA_PRESETS: Record<CameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  perspective: { position: [0, 7, 13], target: [0, 0, 0] },
  top: { position: [0, 18, 3], target: [0, 0, 0] },
  side: { position: [18, 2, 0], target: [0, 0, 0] },
};

// Fixed direction used only to bake a per-facet shade into vertex colors —
// not a scene light, just a math constant for the faceted "low-poly" look.
const FACET_SHADE_DIR = new THREE.Vector3(0.4, 1, 0.5).normalize();
const FACET_SHADE_MIN = 0.55;

/**
 * Converts a map cell into the matching world-space point on the terrain
 * surface, reading elevation from the (possibly eroded) height field. Map
 * "up" (ny = 0) points into the screen (world -z) so the pin and the
 * terrain's own shape both read in the same direction as the 2D map.
 */
function worldFromCell(cell: MapCell, resolution: number, heightField: Float32Array) {
  const value = sampleHeightField(heightField, resolution, cell.nx, cell.ny);
  return {
    x: (cell.nx - 0.5) * GRID_SIZE,
    y: value * HEIGHT_SCALE,
    z: (cell.ny - 0.5) * GRID_SIZE,
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Bakes flat, per-triangle shading into a non-indexed geometry's vertex colors. */
function bakeFacetShading(geometry: THREE.BufferGeometry) {
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  const colors = geometry.attributes.color as THREE.BufferAttribute;
  const normal = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) {
    normal.fromBufferAttribute(normals, i);
    const shade = FACET_SHADE_MIN + (1 - FACET_SHADE_MIN) * Math.max(0, normal.dot(FACET_SHADE_DIR));
    colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
  }
  colors.needsUpdate = true;
}

/**
 * Builds a row/column grid of line segments from a PlaneGeometry — unlike
 * THREE.WireframeGeometry, this skips the diagonal edge each grid cell's
 * triangulation adds, leaving a clean rectangular grid.
 */
function buildGridLines(planeGeometry: THREE.PlaneGeometry, segments: number): THREE.BufferGeometry {
  const positions = planeGeometry.attributes.position;
  const cols = segments + 1;
  const rows = segments + 1;
  const linePositions: number[] = [];

  const pushSegment = (i0: number, i1: number) => {
    linePositions.push(positions.getX(i0), positions.getY(i0), positions.getZ(i0));
    linePositions.push(positions.getX(i1), positions.getY(i1), positions.getZ(i1));
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      pushSegment(r * cols + c, r * cols + c + 1);
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      pushSegment(r * cols + c, (r + 1) * cols + c);
    }
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
  return lineGeometry;
}

export interface GridScene3DHandle {
  resetCamera: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  centerOn: (cell: MapCell) => void;
}

interface GridScene3DProps {
  state: Week1State;
  heightField: Float32Array;
  hoverCell: MapCell | null;
  selectedCell: MapCell | null;
  isSimulating: boolean;
  speed: number;
  dropletCount: number;
  maxDropletCount: number;
  onDropletCountChange: (count: number) => void;
  onReachMaxDropletCount: () => void;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  ssaoPass: SSAOPass;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  terrain: THREE.Mesh;
  wireframe: THREE.LineSegments;
  hoverMarker: THREE.Mesh;
  selectedMarker: THREE.Group;
}

const GridScene3D = forwardRef<GridScene3DHandle, GridScene3DProps>(function GridScene3D(
  {
    state,
    heightField,
    hoverCell,
    selectedCell,
    isSimulating,
    speed,
    dropletCount,
    maxDropletCount,
    onDropletCountChange,
    onReachMaxDropletCount,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const heightFieldRef = useRef(heightField);
  heightFieldRef.current = heightField;
  const isSimulatingRef = useRef(isSimulating);
  isSimulatingRef.current = isSimulating;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  // Mirrors the external droplet count (which the timeline scrubber and
  // reset can change independently of this component) so a resumed
  // simulation continues counting from wherever the count actually is.
  const dropletCountRef = useRef(dropletCount);
  dropletCountRef.current = dropletCount;
  const maxDropletCountRef = useRef(maxDropletCount);
  maxDropletCountRef.current = maxDropletCount;
  const onDropletCountChangeRef = useRef(onDropletCountChange);
  onDropletCountChangeRef.current = onDropletCountChange;
  const onReachMaxDropletCountRef = useRef(onReachMaxDropletCount);
  onReachMaxDropletCountRef.current = onReachMaxDropletCount;
  const cameraAnimationRef = useRef<number | null>(null);
  const erosionRngRef = useRef(createRng(1337));

  useImperativeHandle(
    ref,
    () => ({
      resetCamera: () => applyCameraPreset("perspective"),
      setCameraPreset: (preset) => applyCameraPreset(preset),
      centerOn: (cell) => centerOn(cell),
    }),
    [],
  );

  /**
   * Runs one batch of droplets (scaled by the current speed) and rebuilds the mesh from the
   * result. Stops advancing once maxDropletCount is reached — past that point the terrain has
   * reached the same eroded-but-still-detailed equilibrium the timeline caps out at, and
   * running indefinitely more droplets would just keep wearing it down toward a flat plane.
   */
  function runErosionTick() {
    const field = heightFieldRef.current;
    if (!field || dropletCountRef.current >= maxDropletCountRef.current) return;
    const remaining = maxDropletCountRef.current - dropletCountRef.current;
    const dropletsThisTick = Math.min(remaining, Math.max(1, Math.round(DROPLETS_PER_TICK * speedRef.current)));
    erodeDroplets(field, stateRef.current.resolution, dropletsThisTick, defaultErosionParams, erosionRngRef.current);
    const newCount = dropletCountRef.current + dropletsThisTick;
    dropletCountRef.current = newCount;
    onDropletCountChangeRef.current(newCount);
    rebuildGeometryRef.current();
    if (newCount >= maxDropletCountRef.current) onReachMaxDropletCountRef.current();
  }

  /** Smoothly moves the camera position + orbit target to their new values. */
  function animateCameraTo(targetPosition: THREE.Vector3, targetTarget: THREE.Vector3) {
    const refs = sceneRefs.current;
    if (!refs) return;

    if (cameraAnimationRef.current !== null) {
      cancelAnimationFrame(cameraAnimationRef.current);
      cameraAnimationRef.current = null;
    }

    const startPosition = refs.camera.position.clone();
    const startTarget = refs.controls.target.clone();
    const startTime = performance.now();
    refs.controls.enabled = false;

    const step = (now: number) => {
      const liveRefs = sceneRefs.current;
      if (!liveRefs) return;
      const t = Math.min(1, (now - startTime) / CAMERA_MOVE_DURATION_MS);
      const eased = easeInOutCubic(t);
      liveRefs.camera.position.lerpVectors(startPosition, targetPosition, eased);
      liveRefs.controls.target.lerpVectors(startTarget, targetTarget, eased);
      liveRefs.controls.update();

      if (t < 1) {
        cameraAnimationRef.current = requestAnimationFrame(step);
      } else {
        cameraAnimationRef.current = null;
        liveRefs.controls.enabled = true;
      }
    };
    cameraAnimationRef.current = requestAnimationFrame(step);
  }

  function applyCameraPreset(preset: CameraPreset) {
    const { position, target } = CAMERA_PRESETS[preset];
    animateCameraTo(new THREE.Vector3(...position), new THREE.Vector3(...target));
  }

  function centerOn(cell: MapCell) {
    const refs = sceneRefs.current;
    if (!refs) return;
    const { x, y, z } = worldFromCell(cell, stateRef.current.resolution, heightFieldRef.current);
    const newTarget = new THREE.Vector3(x, y, z);
    const delta = newTarget.clone().sub(refs.controls.target);
    const newPosition = refs.camera.position.clone().add(delta);
    animateCameraTo(newPosition, newTarget);
  }

  /** Rebuilds the terrain + wireframe geometry from the current height field. */
  function rebuildGeometry() {
    const refs = sceneRefs.current;
    const field = heightFieldRef.current;
    if (!refs || !field) return;

    const resolution = stateRef.current.resolution;
    const viewMode = stateRef.current.viewMode;
    const segments = resolution;
    const baseGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, segments, segments);
    const positions = baseGeometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const value = field[i];
      positions.setZ(i, value * HEIGHT_SCALE);
      elevationColor(value, color);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    positions.needsUpdate = true;
    baseGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    baseGeometry.computeVertexNormals();

    refs.wireframe.geometry.dispose();
    refs.wireframe.geometry = buildGridLines(baseGeometry, segments);

    const isWireframeMode = viewMode === "wireframe";
    let terrainGeometry: THREE.BufferGeometry;
    if (isWireframeMode) {
      // Non-indexed so each triangle owns its vertices, giving a faceted (flat) look
      // once we bake a per-facet shade into the colors below.
      terrainGeometry = baseGeometry.toNonIndexed();
      bakeFacetShading(terrainGeometry);
      baseGeometry.dispose();
    } else {
      terrainGeometry = baseGeometry;
    }

    refs.terrain.geometry.dispose();
    refs.terrain.geometry = terrainGeometry;
    refs.terrain.visible = true;
    (refs.terrain.material as THREE.MeshBasicMaterial).opacity = isWireframeMode
      ? TERRAIN_OPACITY_WIREFRAME
      : TERRAIN_OPACITY_HEIGHTMAP;

    const wireframeMaterial = refs.wireframe.material as THREE.LineBasicMaterial;
    wireframeMaterial.opacity = isWireframeMode ? WIREFRAME_OPACITY_BOLD : WIREFRAME_OPACITY_SUBTLE;
  }
  const rebuildGeometryRef = useRef(rebuildGeometry);
  rebuildGeometryRef.current = rebuildGeometry;
  const runErosionTickRef = useRef(runErosionTick);
  runErosionTickRef.current = runErosionTick;

  // One-time scene setup.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND_COLOR);
    // GridHelper has no built-in distance fade, so fog (same color as the background) is what
    // dissolves it into the backdrop toward the horizon instead of ending in a hard edge.
    scene.fog = new THREE.Fog(BACKGROUND_COLOR, FOG_NEAR, FOG_FAR);

    const groundGeometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: BACKGROUND_COLOR });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(GRID_HELPER_SIZE, GRID_HELPER_DIVISIONS, 0x8888aa, 0x44445a);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.perspective.position);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const geometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, 1, 1);
    const terrainMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    scene.add(terrain);

    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: WIREFRAME_COLOR,
      transparent: true,
      opacity: WIREFRAME_OPACITY_SUBTLE,
    });
    const wireframe = new THREE.LineSegments(buildGridLines(geometry, 1), wireframeMaterial);
    wireframe.rotation.x = -Math.PI / 2;
    scene.add(wireframe);

    const hoverMarkerMaterial = new THREE.MeshBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.6 });
    const hoverMarker = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 20), hoverMarkerMaterial);
    hoverMarker.rotation.x = -Math.PI / 2;
    hoverMarker.visible = false;
    scene.add(hoverMarker);

    const selectedMarker = new THREE.Group();
    const pinSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 16),
      new THREE.MeshBasicMaterial({ color: MARKER_COLOR }),
    );
    pinSphere.position.set(0, 1.1, 0);
    const pinLineMaterial = new THREE.LineBasicMaterial({ color: MARKER_COLOR, transparent: true, opacity: 0.8 });
    const pinLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.1, 0)]),
      pinLineMaterial,
    );
    selectedMarker.add(pinSphere, pinLine);
    selectedMarker.visible = false;
    scene.add(selectedMarker);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const ssaoPass = new SSAOPass(scene, camera, mount.clientWidth || 1, mount.clientHeight || 1);
    ssaoPass.kernelRadius = 0.6;
    ssaoPass.minDistance = 0.0005;
    ssaoPass.maxDistance = 0.15;
    composer.addPass(ssaoPass);
    composer.addPass(new OutputPass());

    sceneRefs.current = {
      renderer,
      composer,
      ssaoPass,
      scene,
      camera,
      controls,
      terrain,
      wireframe,
      hoverMarker,
      selectedMarker,
    };

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      ssaoPass.setSize(width, height);
    });
    resizeObserver.observe(mount);

    let lastErosionTick = 0;
    let frameId: number;
    const animate = (now: number) => {
      controls.update();
      if (isSimulatingRef.current && heightFieldRef.current && now - lastErosionTick > EROSION_TICK_MS) {
        lastErosionTick = now;
        runErosionTickRef.current();
      }
      composer.render();
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      if (cameraAnimationRef.current !== null) cancelAnimationFrame(cameraAnimationRef.current);
      resizeObserver.disconnect();
      controls.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      gridHelper.geometry.dispose();
      (gridHelper.material as THREE.Material).dispose();
      geometry.dispose();
      terrainMaterial.dispose();
      wireframeMaterial.dispose();
      wireframe.geometry.dispose();
      hoverMarker.geometry.dispose();
      hoverMarkerMaterial.dispose();
      pinSphere.geometry.dispose();
      (pinSphere.material as THREE.Material).dispose();
      pinLine.geometry.dispose();
      pinLineMaterial.dispose();
      ssaoPass.dispose();
      composer.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRefs.current = null;
    };
  }, []);

  // Rebuild geometry when resolution, noise, shaping, view mode, or the height field itself change.
  useEffect(() => {
    rebuildGeometry();
  }, [state, heightField]);

  // Keep the hover ring glued to the terrain surface under the hovered map cell.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    if (hoverCell) {
      const { x, y, z } = worldFromCell(hoverCell, state.resolution, heightField);
      refs.hoverMarker.position.set(x, y + 0.05, z);
      refs.hoverMarker.visible = true;
    } else {
      refs.hoverMarker.visible = false;
    }
  }, [state, heightField, hoverCell]);

  // Keep the selection pin glued to the terrain surface under the selected map cell.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    if (selectedCell) {
      const { x, y, z } = worldFromCell(selectedCell, state.resolution, heightField);
      refs.selectedMarker.position.set(x, y, z);
      refs.selectedMarker.visible = true;
    } else {
      refs.selectedMarker.visible = false;
    }
  }, [state, heightField, selectedCell]);

  return <div ref={mountRef} className="grid-scene-3d" />;
});

export default GridScene3D;
