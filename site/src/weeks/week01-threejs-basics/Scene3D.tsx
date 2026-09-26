import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createGeometry, createLight, createMaterial, groundedY, updateMaterial } from "./sceneFactories";
import type { ShadowCastingLight } from "./sceneFactories";
import type { Week1BasicsState } from "./types";

const BACKGROUND_COLOR = "#0a0f17";
const GRID_SIZE = 40;
const GRID_DIVISIONS = 40;
const MESH_ROTATION_SPEED = 0.25;
// Nudges the whole composition down by this fraction of the canvas height, so the
// ground plane sits lower in frame instead of near vertical center.
const GROUND_VIEW_SHIFT = 0.1;

function applyGroundViewShift(camera: THREE.PerspectiveCamera, width: number, height: number) {
  camera.setViewOffset(width, height, 0, -GROUND_VIEW_SHIFT * height, width, height);
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  mesh: THREE.Mesh;
  light: ShadowCastingLight;
  ground: THREE.Mesh;
}

interface Scene3DProps {
  state: Week1BasicsState;
}

export default function Scene3D({ state }: Scene3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<SceneRefs | null>(null);
  // The render loop is created once on mount, so it reads auto-rotate through a
  // ref (kept in sync every render) rather than closing over a stale `state`.
  const autoRotateRef = useRef(state.autoRotate);
  autoRotateRef.current = state.autoRotate;

  // Mount once: renderer, scene, camera, controls, ground, grid, and an initial
  // mesh/material/light built from whatever `state` was on first render. The
  // effects below then react to individual state slices and mutate these
  // objects in place instead of tearing the whole scene down on every change.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // A background color plus a matching fog is the idiomatic way to make a
    // GridHelper (which has no built-in distance fade) dissolve into the
    // background as it recedes, instead of ending in a hard edge.
    scene.background = new THREE.Color(BACKGROUND_COLOR);
    scene.fog = new THREE.Fog(BACKGROUND_COLOR, 10, 30);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(6, 4, 8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // A metallic surface has no diffuse color of its own — it only shows a
    // reflection of its surroundings, so without *something* to reflect,
    // high metalness just renders black. A generic room environment gives
    // it soft, reflection-shaped highlights instead.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environmentTexture;
    pmremGenerator.dispose();

    // Orbit controls make the canvas interactive: drag to rotate, scroll to zoom.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);

    const light = createLight(state.lightType, state.lightIntensity, state.lightPosition);
    light.castShadow = state.shadowsEnabled;
    scene.add(light);
    if ("target" in light) scene.add(light.target);

    // A dim, direction-less fill so the unlit side of the mesh reads as a soft
    // shadow instead of dropping straight to black — a gentler lit/dark blend.
    const fillLight = new THREE.HemisphereLight(0xaac4dd, 0x0a0f17, 0.9);
    scene.add(fillLight);

    const geometry = createGeometry(state.shape, state.geometryParams);
    const material = createMaterial(state);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = groundedY(geometry);
    mesh.castShadow = state.shadowsEnabled;
    scene.add(mesh);

    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x64748b, 0x334155);
    scene.add(grid);

    // A ShadowMaterial is transparent everywhere except where a shadow falls
    // on it, so this plane stays invisible until shadows are switched on.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    sceneRefs.current = { renderer, scene, camera, controls, mesh, light, ground };

    const resizeObserver = new ResizeObserver(() => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / height;
      applyGroundViewShift(camera, width, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    camera.aspect = mount.clientWidth / mount.clientHeight;
    applyGroundViewShift(camera, mount.clientWidth, mount.clientHeight);
    camera.updateProjectionMatrix();

    let frameId: number;
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      if (autoRotateRef.current) mesh.rotation.y += delta * MESH_ROTATION_SPEED;
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      light.shadow.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      environmentTexture.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRefs.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shape or its construction parameters changed: swap the mesh's geometry and re-settle
  // it on the ground plane (a param edit reshapes the geometry the same as a shape swap).
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const oldGeometry = refs.mesh.geometry;
    const geometry = createGeometry(state.shape, state.geometryParams);
    refs.mesh.geometry = geometry;
    refs.mesh.position.y = groundedY(geometry);
    oldGeometry.dispose();
  }, [state.shape, state.geometryParams]);

  // Material type or wireframe changed: these aren't just property tweaks — wireframe
  // swaps to a flat unlit material entirely, so both cases rebuild the material.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const oldMaterial = refs.mesh.material as THREE.Material;
    refs.mesh.material = createMaterial(state);
    oldMaterial.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.materialType, state.wireframe]);

  // Same material instance, just its color/roughness/etc — no need to recreate it.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    updateMaterial(refs.mesh.material as THREE.Material, state);
  }, [state.color, state.roughness, state.metalness, state.shininess, state.transmission, state.emissiveIntensity]);

  // Light type changed: THREE.Light subclasses aren't interchangeable, so build a fresh one.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.scene.remove(refs.light);
    if ("target" in refs.light) refs.scene.remove(refs.light.target);
    refs.light.shadow.dispose();

    const light = createLight(state.lightType, state.lightIntensity, state.lightPosition);
    light.castShadow = state.shadowsEnabled;
    refs.scene.add(light);
    if ("target" in light) refs.scene.add(light.target);
    refs.light = light;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lightType]);

  // Same light instance, just intensity/position.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.light.intensity = state.lightIntensity;
    refs.light.position.set(...state.lightPosition);
  }, [state.lightIntensity, state.lightPosition, state.lightType]);

  // Shadows toggled: flip casting/receiving without rebuilding anything.
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;
    refs.light.castShadow = state.shadowsEnabled;
    refs.mesh.castShadow = state.shadowsEnabled;
  }, [state.shadowsEnabled, state.lightType]);

  return <div className="absolute inset-0 overflow-hidden rounded-2xl bg-stage [&>canvas]:block [&>canvas]:!h-full [&>canvas]:!w-full" ref={mountRef} />;
}
