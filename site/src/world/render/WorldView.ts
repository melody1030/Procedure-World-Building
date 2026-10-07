import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SKY } from "../palette";
import type { WorldModel } from "../pipeline";
import { WATER_MARGIN, WORLD_SIZE } from "../scale";
import { buildPlinth, buildSea, type Sea } from "./base";
import { terrainMaterial, toGeometry, type OverlayUniforms } from "./materials";
import { buildTerraceOverlay } from "./overlays";

/** Diorama framing: looking down on the whole table-top from a raised corner. */
const VIEW_AZIMUTH = THREE.MathUtils.degToRad(38);
const VIEW_ELEVATION = THREE.MathUtils.degToRad(38);
const FOV = 32;

/** Moonlight: compass direction and height above the horizon, in degrees. */
const MOON_AZIMUTH = -55;
const MOON_ELEVATION = 56;

/**
 * Owns the renderer, camera, lights and everything drawn from the current WorldModel. React hands
 * it worlds and the overlay switch; it never generates anything.
 */
export class WorldView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly worldRoot = new THREE.Group();
  private readonly overlayUniforms: OverlayUniforms = { uOverlay: { value: null }, uOverlayOn: { value: 0 }, uOverlaySize: { value: WORLD_SIZE } };
  private world: WorldModel | null = null;
  private sea: Sea | null = null;
  private terraces: THREE.Texture | null = null;
  private showTerraces = false;
  private frame = 0;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(SKY.background);
    this.scene.add(this.worldRoot);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 2600;

    const hemi = new THREE.HemisphereLight(SKY.hemisphereSky, SKY.hemisphereGround, 2.1);
    const moon = new THREE.DirectionalLight(SKY.moon, 1.5);
    const az = THREE.MathUtils.degToRad(MOON_AZIMUTH);
    const el = THREE.MathUtils.degToRad(MOON_ELEVATION);
    moon.position.set(Math.cos(el) * Math.sin(az) * 700, Math.sin(el) * 700, Math.cos(el) * Math.cos(az) * 700);
    moon.castShadow = true;
    const extent = WORLD_SIZE / 2 + WATER_MARGIN;
    Object.assign(moon.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 2400 });
    moon.shadow.mapSize.set(4096, 4096);
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.6;
    this.scene.add(hemi, moon, moon.target);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
    this.frameCamera();

    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Default view: the whole diorama in frame, pulled back further on tall (portrait) screens. */
  frameCamera() {
    const radius = WORLD_SIZE / 2 + WATER_MARGIN;
    const fit = radius / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const distance = fit * (this.camera.aspect < 1.2 ? Math.min(2.0, 1.05 / this.camera.aspect) : 0.86);
    this.controls.target.set(0, 12, 0);
    this.camera.position.set(
      distance * Math.cos(VIEW_ELEVATION) * Math.sin(VIEW_AZIMUTH),
      12 + distance * Math.sin(VIEW_ELEVATION),
      distance * Math.cos(VIEW_ELEVATION) * Math.cos(VIEW_AZIMUTH),
    );
    this.controls.update();
  }

  setWorld(world: WorldModel) {
    this.clearWorld();
    this.world = world;
    const half = world.size / 2;

    const terrain = new THREE.Mesh(toGeometry(world.voxels.terrain), terrainMaterial(this.overlayUniforms));
    terrain.castShadow = true;
    terrain.receiveShadow = true;
    this.sea = buildSea(half, world.seaLevel, this.renderer);
    this.worldRoot.add(buildPlinth(half), this.sea.object, terrain);
    this.setTerraces(this.showTerraces);
  }

  /** The Terraces overlay: colours each level from the shore (dark) to the top (bright). */
  setTerraces(on: boolean) {
    this.showTerraces = on;
    if (on && this.world && !this.terraces) this.terraces = buildTerraceOverlay(this.world);
    this.overlayUniforms.uOverlay.value = this.terraces;
    this.overlayUniforms.uOverlayOn.value = on ? 1 : 0;
  }

  private clearWorld() {
    this.worldRoot.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => m.dispose());
      }
    });
    this.sea?.mirror.dispose();
    this.terraces?.dispose();
    this.terraces = null;
    this.worldRoot.clear();
    this.sea = null;
  }

  private resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width === 0 || height === 0) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(width, height);
    this.sea?.mirror.getRenderTarget().setSize(Math.round(width * ratio * 0.6), Math.round(height * ratio * 0.6));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearWorld();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
