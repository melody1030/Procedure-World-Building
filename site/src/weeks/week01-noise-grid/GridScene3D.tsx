import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { sampleNoise } from "./noise";
import { applyShaping } from "./shaping";
import { elevationColor } from "./colorRamp";
import type { CameraPreset, Week1State } from "./types";

const GRID_SIZE = 14;
const HEIGHT_SCALE = 2.5;
const WIREFRAME_COLOR = 0x9a9a9a;
const WIREFRAME_OPACITY_SUBTLE = 0.1;
const WIREFRAME_OPACITY_BOLD = 0.4;
const TERRAIN_OPACITY_HEIGHTMAP = 1;
const TERRAIN_OPACITY_WIREFRAME = 0.5;

const CAMERA_PRESETS: Record<CameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  perspective: { position: [0, 7, 13], target: [0, 0, 0] },
  top: { position: [0.001, 18, 0.001], target: [0, 0, 0] },
  side: { position: [18, 2, 0], target: [0, 0, 0] },
};

// Fixed direction used only to bake a per-facet shade into vertex colors —
// not a scene light, just a math constant for the faceted "low-poly" look.
const FACET_SHADE_DIR = new THREE.Vector3(0.4, 1, 0.5).normalize();
const FACET_SHADE_MIN = 0.55;

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
}

interface GridScene3DProps {
  state: Week1State;
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
}

const GridScene3D = forwardRef<GridScene3DHandle, GridScene3DProps>(function GridScene3D({ state }, ref) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      resetCamera: () => applyCameraPreset("perspective"),
      setCameraPreset: (preset) => applyCameraPreset(preset),
    }),
    [],
  );

  function applyCameraPreset(preset: CameraPreset) {
    const refs = sceneRefs.current;
    if (!refs) return;
    const { position, target } = CAMERA_PRESETS[preset];
    refs.camera.position.set(...position);
    refs.controls.target.set(...target);
    refs.controls.update();
  }

  // One-time scene setup.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080810);
    scene.fog = new THREE.Fog(0x080810, 12, 30);

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

    let frameId: number;
    const animate = () => {
      controls.update();
      composer.render();
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      geometry.dispose();
      terrainMaterial.dispose();
      wireframeMaterial.dispose();
      wireframe.geometry.dispose();
      ssaoPass.dispose();
      composer.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRefs.current = null;
    };
  }, []);

  // Rebuild geometry when resolution, noise, or shaping params change; swap material on view mode change.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const segments = state.resolution;
    const baseGeometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, segments, segments);
    const positions = baseGeometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const nx = x / GRID_SIZE + 0.5;
      const ny = y / GRID_SIZE + 0.5;
      const raw = sampleNoise(nx, ny, state);
      const value = applyShaping(raw, state.shapingType, state.amount);
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

    const isWireframeMode = state.viewMode === "wireframe";
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
  }, [state]);

  return <div ref={mountRef} className="grid-scene-3d" />;
});

export default GridScene3D;
