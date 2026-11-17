import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * The grammar pages' view (Building and Simulation): the city's night light and bloom, a key light
 * casting shadows over `shadow` (its camera's box, or half its size, in voxels), and orbit controls. `onFrame`
 * runs before each render. Returns the parts and a function that tears it all down.
 *
 * A large scene (Simulation) can trade a little for speed:
 * - `staticShadows`: the shadow map is drawn only when `refreshShadows` is called (the light never
 *   moves, so it only changes with the buildings), not every frame;
 * - `logDepth: false`: a plain depth buffer, so the GPU can skip hidden pixels early (a logarithmic
 *   one writes each pixel's depth itself, which turns that off), with `near` raised to keep its
 *   precision;
 * - `pixelRatio`: the most device pixels per CSS pixel it renders at.
 */
export function createNightStage(
  el: HTMLElement,
  opts: { shadow: number | { left: number; right: number; top: number; bottom: number }; camera: [number, number, number]; target: [number, number, number]; fog: [number, number]; onFrame?: () => void; staticShadows?: boolean; logDepth?: boolean; near?: number; pixelRatio?: number },
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: opts.logDepth ?? true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.pixelRatio ?? 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = !opts.staticShadows;
  const refreshShadows = () => {
    renderer.shadowMap.needsUpdate = true;
  };
  refreshShadows();
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f1d);
  scene.fog = new THREE.Fog(0x0b0f1d, opts.fog[0], opts.fog[1]);
  scene.add(new THREE.HemisphereLight(0x9aa3c4, 0x1c1a26, 2.0));
  const key = new THREE.DirectionalLight(0xdfe4ff, 2.6);
  // The key light stands back along the same line however large the shadowed area is.
  const box = typeof opts.shadow === "number" ? { left: -opts.shadow, right: opts.shadow, top: opts.shadow, bottom: -opts.shadow } : opts.shadow;
  const reach = Math.max(1200, box.right - box.left, box.top - box.bottom);
  key.position.set(-500, 900, 600).setLength(reach);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { ...box, near: 10, far: reach * 2.5 });
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc06bff, 1.1);
  rim.position.set(700, 300, -700);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, opts.near ?? 10, Math.max(8000, opts.fog[1] * 1.5));
  camera.position.set(...opts.camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...opts.target);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.update();

  // Only the lights cross the bloom's threshold, so windows and neon glow and the walls stay dark.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.72));
  composer.addPass(new OutputPass());

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = el;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(el);

  let frame = 0;
  const tick = () => {
    frame = requestAnimationFrame(tick);
    opts.onFrame?.();
    controls.update();
    composer.render();
  };
  tick();

  const dispose = () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    controls.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
  return { renderer, scene, camera, controls, key, refreshShadows, dispose };
}
