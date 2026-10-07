import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { LayerVisibility } from "../layers";
import { moodRender, type RenderParams } from "../params";
import type { WorldModel } from "../pipeline";
import { WATER_MARGIN, WORLD_SIZE } from "../scale";
import { buildPlinth, buildSea, type Sea } from "./base";
import { MOODS, TiltShiftShader, createRain, neonEnvironment } from "./effects";
import { cityMaterial, glowMaterial, growthDepth, riverMaterial, roadMaterial, terrainMaterial, toGeometry, type OverlayUniforms, type SharedUniforms } from "./materials";
import { buildOverlay, type OverlayMode } from "./overlays";
import { Traffic } from "./traffic";

/** Diorama framing: looking down on the whole table-top from a raised corner. */
const VIEW_AZIMUTH = THREE.MathUtils.degToRad(38);
const VIEW_ELEVATION = THREE.MathUtils.degToRad(38);
const FOV = 32;

interface LayerObject {
  object: THREE.Object3D;
  visible: (layers: LayerVisibility) => boolean;
}

/**
 * Owns the renderer, camera, lights, post-processing and everything drawn from the current
 * WorldModel. React hands it worlds, layer settings, the growth time and the render settings; it
 * never generates anything.
 */
export class WorldView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly tiltH: ShaderPass;
  private readonly tiltV: ShaderPass;
  private readonly resizeObserver: ResizeObserver;
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly fog = new THREE.FogExp2(0x000000, 0.001);
  private readonly worldRoot = new THREE.Group();
  private readonly clock = new THREE.Clock();
  private readonly uniforms: SharedUniforms = { uGrowth: { value: 1 } };
  private readonly overlayUniforms: OverlayUniforms = { uOverlay: { value: null }, uOverlayOn: { value: 0 }, uOverlaySize: { value: WORLD_SIZE } };
  private layerObjects: LayerObject[] = [];
  private visibility: LayerVisibility | null = null;
  private world: WorldModel | null = null;
  private sea: Sea | null = null;
  private traffic: Traffic | null = null;
  private rain: ReturnType<typeof createRain> | null = null;
  private environment: THREE.Texture | null = null;
  private overlays = new Map<OverlayMode, THREE.Texture>();
  private render: RenderParams = moodRender("rain");
  private time = 0;
  private frame = 0;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(this.renderer.domElement);
    this.scene.add(this.worldRoot);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
    this.controls.minDistance = 4;
    this.controls.maxDistance = 2600;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.castShadow = true;
    const extent = WORLD_SIZE / 2 + WATER_MARGIN;
    Object.assign(this.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 2400 });
    this.key.shadow.mapSize.set(4096, 4096);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.key, this.key.target);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.tiltH = new ShaderPass(TiltShiftShader);
    this.tiltV = new ShaderPass(TiltShiftShader);
    this.tiltV.uniforms.uDirection.value = new THREE.Vector2(0, 1);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
    this.frameCamera();
    this.applyRender();

    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.time += Math.min(0.05, this.clock.getDelta());
      if (this.rain) this.rain.uniforms.uTime.value = this.time * this.render.rainSpeed;
      this.traffic?.update(this.time, this.uniforms.uGrowth.value);
      this.controls.update();
      this.composer.render();
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
    const u = this.uniforms;
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) => {
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = shadows;
      m.receiveShadow = true;
      m.customDepthMaterial = growthDepth(u);
      return m;
    };

    const terrain = mesh(toGeometry(world.meshes.terrain), terrainMaterial(this.overlayUniforms));
    const river = mesh(toGeometry(world.meshes.water), riverMaterial(), false);
    const roads = mesh(toGeometry(world.meshes.roads), roadMaterial(u));
    const lit = mesh(toGeometry(world.meshes.cityLit), cityMaterial(u));
    const glow = mesh(toGeometry(world.meshes.cityGlow), glowMaterial(u), false);
    this.sea = buildSea(half, world.seaLevel, this.renderer);
    this.traffic = new Traffic(world.props.carPaths, world.bridges.rails, world.seedHash % 100000);
    this.rain = createRain(world.atmosphere.rain, world.atmosphere.tallest + 80);
    const city = new THREE.Group();
    city.add(roads, lit, glow, this.traffic.object);

    this.worldRoot.add(buildPlinth(half));
    this.layerObjects = [
      { object: terrain, visible: (l) => l.terrain },
      { object: river, visible: (l) => l.water },
      { object: this.sea.object, visible: (l) => l.water },
      { object: city, visible: (l) => l.city },
      { object: this.rain.object, visible: (l) => l.weather && this.render.rain > 0 },
    ];
    for (const layer of this.layerObjects) this.worldRoot.add(layer.object);

    this.environment = neonEnvironment(this.renderer, world.buildings.neon);
    this.scene.environment = this.environment;
    this.applyRender();
    if (this.visibility) this.setLayers(this.visibility);
  }

  setLayers(visibility: LayerVisibility) {
    this.visibility = visibility;
    for (const layer of this.layerObjects) layer.object.visible = layer.visible(visibility);
    this.scene.fog = visibility.weather ? this.fog : null;
    const mode: OverlayMode | null = visibility.districts ? "districts" : visibility.suitability ? "suitability" : visibility.levels ? "levels" : null;
    this.setOverlay(mode);
  }

  private setOverlay(mode: OverlayMode | null) {
    if (!mode || !this.world) {
      this.overlayUniforms.uOverlayOn.value = 0;
      return;
    }
    let texture = this.overlays.get(mode);
    if (!texture) {
      texture = buildOverlay(this.world, mode);
      this.overlays.set(mode, texture);
    }
    this.overlayUniforms.uOverlay.value = texture;
    this.overlayUniforms.uOverlayOn.value = 1;
  }

  /** Growth timeline position, 0 (bare island) to 1 (finished city). */
  setGrowth(t: number) {
    this.uniforms.uGrowth.value = t;
  }

  /** Light, haze, bloom, tilt-shift and rain. Applied on the next frame; nothing regenerates. */
  setRender(params: RenderParams) {
    this.render = params;
    this.applyRender();
    if (this.visibility) this.setLayers(this.visibility);
  }

  private applyRender() {
    const r = this.render;
    const m = MOODS[r.mood];
    const background = new THREE.Color(m.background);
    this.scene.background = background;
    this.fog.color.copy(background);
    this.fog.density = (this.world?.atmosphere.haze ?? 0.001) * r.fog;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.hemiGround);
    this.hemi.intensity = r.ambient;
    this.key.color.set(m.key);
    this.key.intensity = r.sun;
    const az = THREE.MathUtils.degToRad(r.sunAzimuth);
    const el = THREE.MathUtils.degToRad(r.sunElevation);
    this.key.position.set(Math.cos(el) * Math.sin(az) * 700, Math.sin(el) * 700, Math.cos(el) * Math.cos(az) * 700);
    this.bloom.strength = r.bloom;
    this.renderer.toneMappingExposure = r.exposure;
    for (const pass of [this.tiltH, this.tiltV]) {
      pass.uniforms.uAmount.value = r.tiltShift;
      pass.enabled = r.tiltShift > 0;
    }
    if (this.rain) {
      this.rain.object.geometry.setDrawRange(0, Math.round(this.rain.drops * r.rain) * 2);
      this.rain.uniforms.uWind.value = r.wind;
    }
    if (this.sea) (this.sea.mirror.material as THREE.ShaderMaterial).uniforms.color.value.set(m.mirror);
  }

  private clearWorld() {
    this.worldRoot.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => m.dispose());
        if (object instanceof THREE.Mesh) object.customDepthMaterial?.dispose();
      }
    });
    this.sea?.mirror.dispose();
    this.traffic?.dispose();
    this.environment?.dispose();
    this.overlays.forEach((t) => t.dispose());
    this.overlays.clear();
    this.worldRoot.clear();
    this.layerObjects = [];
    this.sea = null;
    this.traffic = null;
    this.rain = null;
  }

  private resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width === 0 || height === 0) return;
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    for (const pass of [this.tiltH, this.tiltV]) pass.uniforms.uResolution.value.set(width * ratio, height * ratio);
    this.sea?.mirror.getRenderTarget().setSize(Math.round(width * ratio * 0.6), Math.round(height * ratio * 0.6));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearWorld();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
