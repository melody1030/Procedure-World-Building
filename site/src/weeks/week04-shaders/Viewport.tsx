import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildStudyScene } from "./scene";
import { OUTLINE_FRAGMENT } from "./shader/composeShader";
import type { ComposedShader } from "./shader/composeShader";
import { createMatcaps } from "./shader/matcaps";
import type { ShaderUniforms } from "./shader/technique";
import { applyParams, createUniforms } from "./shader/uniforms";
import type { TechniqueParams, TechniqueType, ViewportSettings } from "./types";

const BACKGROUND = "#0a0f17";
const CAMERA_POSITION = new THREE.Vector3(8.2, 6.4, 9.6);
const CAMERA_TARGET = new THREE.Vector3(0, 1, 0);

/** The default view, pulled back on tall (portrait) stages so the whole plinth fits. */
function frameCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  const pullBack = camera.aspect < 1.2 ? Math.min(1.9, 1.2 / camera.aspect) : 1;
  camera.position.copy(CAMERA_POSITION).sub(CAMERA_TARGET).multiplyScalar(pullBack).add(CAMERA_TARGET);
  controls.target.copy(CAMERA_TARGET);
  controls.update();
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  uniforms: ShaderUniforms;
  matcaps: Record<string, THREE.CanvasTexture>;
  meshes: THREE.Mesh[];
  outlines: THREE.Mesh[];
  water: THREE.Mesh;
  material: THREE.ShaderMaterial | null;
  outlineMaterial: THREE.ShaderMaterial | null;
  compiles: number;
}

interface ViewportProps {
  composed: ComposedShader;
  params: Record<TechniqueType, TechniqueParams>;
  viewport: ViewportSettings;
  /** Bumped by the Frame button. */
  frameToken: number;
}

export default function Viewport({ composed, params, viewport, frameToken }: ViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);
  /** The shader clock in seconds: everything animated reads this one value. */
  const timeRef = useRef(0);

  // Mount once: renderer, camera, controls, the scene and the shared uniforms. The effects
  // below swap materials (composition changes) or write uniforms (everything else).
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Drag to orbit, scroll to zoom, right-drag to pan.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(CAMERA_TARGET);
    controls.minDistance = 4;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.48;

    const uniforms = createUniforms();
    const matcaps = createMatcaps();
    const study = buildStudyScene();
    uniforms.uSceneHeight.value = study.sceneHeight;
    uniforms.uCameraNear.value = camera.near;
    uniforms.uCameraFar.value = camera.far;

    // Ripple's contact foam needs the depth of everything behind the water. Each frame the scene
    // is drawn once without the water into this target (depth only), then drawn normally.
    const depthTarget = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
    uniforms.uSceneDepth.value = depthTarget.depthTexture;

    // The outline is each object drawn again, inflated and back faces only, so it shares the geometry.
    const outlines = study.meshes.map((mesh) => {
      const outline = new THREE.Mesh(mesh.geometry);
      outline.visible = false;
      mesh.add(outline);
      return outline;
    });
    scene.add(...study.meshes, study.water);

    refs.current = {
      renderer,
      scene,
      camera,
      controls,
      uniforms,
      matcaps,
      meshes: [...study.meshes, study.water],
      outlines,
      water: study.water,
      material: null,
      outlineMaterial: null,
      compiles: 0,
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      depthTarget.setSize(size.x, size.y);
      (uniforms.uScreenSize.value as THREE.Vector2).copy(size);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    frameCamera(camera, controls);

    const clock = new THREE.Clock();
    let frameId = 0;
    const animate = () => {
      timeRef.current += clock.getDelta();
      uniforms.uTime.value = timeRef.current;
      controls.update();
      if (study.water.visible) {
        study.water.visible = false;
        scene.overrideMaterial = depthOnly;
        renderer.setRenderTarget(depthTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        scene.overrideMaterial = null;
        study.water.visible = true;
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      for (const mesh of [...study.meshes, study.water]) mesh.geometry.dispose();
      depthTarget.depthTexture?.dispose();
      depthTarget.dispose();
      depthOnly.dispose();
      refs.current?.material?.dispose();
      refs.current?.outlineMaterial?.dispose();
      Object.values(matcaps).forEach((texture) => texture.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, []);

  // A new composition: compile a new material and hand it to every object. This is the only
  // place a shader is ever compiled.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const material = new THREE.ShaderMaterial({
      uniforms: r.uniforms,
      vertexShader: composed.vertexShader,
      fragmentShader: composed.fragmentShader,
    });
    const outlineMaterial = new THREE.ShaderMaterial({
      uniforms: r.uniforms,
      vertexShader: composed.vertexShader,
      fragmentShader: OUTLINE_FRAGMENT,
      defines: { OUTLINE: "" },
      side: THREE.BackSide,
    });
    for (const mesh of r.meshes) mesh.material = material;
    for (const outline of r.outlines) outline.material = outlineMaterial;
    r.material?.dispose();
    r.outlineMaterial?.dispose();
    r.material = material;
    r.outlineMaterial = outlineMaterial;
    r.compiles += 1;
    // Exposed for checking that slider moves never recompile.
    if (mountRef.current) mountRef.current.dataset.compiles = String(r.compiles);
  }, [composed.key]);

  // Everything else is uniforms and visibility: cheap to set on every change.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    applyParams(r.uniforms, params);
    r.uniforms.uMatcap.value = r.matcaps[String(params.matcap.preset)] ?? r.matcaps.clay;

    r.water.visible = composed.activeTypes.includes("ripple");
    const showOutlines = composed.activeTypes.includes("toon") && params.toon.outlines === true;
    for (const outline of r.outlines) outline.visible = showOutlines;

    // With fog in the shader, the background becomes the fog color so distant things dissolve into it.
    const fogOn = composed.activeTypes.includes("fog");
    (r.scene.background as THREE.Color).set(fogOn ? String(params.fog.color) : BACKGROUND);
  }, [params, composed]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const azimuth = THREE.MathUtils.degToRad(viewport.lightAzimuth);
    const elevation = THREE.MathUtils.degToRad(viewport.lightElevation);
    (r.uniforms.uLightDir.value as THREE.Vector3).set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
  }, [viewport]);

  useEffect(() => {
    const r = refs.current;
    if (!r || frameToken === 0) return;
    frameCamera(r.camera, r.controls);
  }, [frameToken]);

  return <div className="absolute inset-0 overflow-hidden rounded-2xl bg-stage [&>canvas]:block [&>canvas]:!h-full [&>canvas]:!w-full" ref={mountRef} />;
}
