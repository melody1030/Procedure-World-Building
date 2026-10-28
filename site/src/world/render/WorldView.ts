import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeometryData } from "../geometry";
import { BLUEPRINT, SKY } from "../palette";
import { CLAIM } from "../terrain/claims";
import type { Hubs } from "../terrain/hubs";
import { NO_DISTRICT, type Districts } from "../terrain/districts";
import type { Streets } from "../terrain/streets";
import type { RiverPath } from "../terrain/river";
import { BASE, WORLD_SIZE, voxels } from "../scale";
import { buildPlinth } from "./base";
import { makePrintable, type PrintableBuilding } from "../buildings/print";
import { buildingMaterials, buildingObject, disposeBuilding } from "../buildings/render";
import { fitBuilding, type BuildingPlan } from "../city/placement";
import type { Parks } from "../city/parks";
import { buildParkModel } from "../city/parkModels";
import { BUILD_PHASES, PAVING_FROM, PAVING_TO, type BuildUp } from "../terrain/buildup";
import { createLookUniforms, createPrintUniforms, printDepthMaterial, printMaterial } from "./print";
import { LifeView } from "./life";
import type { Life } from "../life/agents";

/** Diorama framing: looking down on the whole table-top from a raised corner. */
const VIEW_AZIMUTH = THREE.MathUtils.degToRad(38);
const VIEW_ELEVATION = THREE.MathUtils.degToRad(38);
const FOV = 32;
/** How much of the buildings' phase goes to staggering them, Landmark first, outward from the plaza. */
const RAISE_SPREAD = 0.6;
/** The share of a building's time spent digging its lot level before it starts going up. */
const DIG_SHARE = 0.2;
/** Park props: how much of the buildings' phase one park's props are staggered over (middle first), and how long each takes to grow. */
const PARK_SPREAD = 0.25;
const PARK_GROW = 0.15;


function toGeometry(data: GeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Half the diorama's width, in voxels: everything about the camera and light scales from it. */
const EXTENT = WORLD_SIZE / 2;
/** Everything there is to see: the plinth and terrain, and the tallest building (the Landmark, under 200 m, on high ground). */
const NEAR_BOX = new THREE.Box3(new THREE.Vector3(-EXTENT, -EXTENT, -EXTENT), new THREE.Vector3(EXTENT, 1200, EXTENT));

/**
 * The diorama: renderer, camera, sunlight, the plinth, and the terrain React hands it (ground,
 * and river).
 * It never generates anything.
 */
export class WorldView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private terrain: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  /** The river's control points and curve, drawn over everything when switched on. */
  private path: THREE.Group | null = null;
  private pathVisible = false;
  /** The town overlay (Show network): hub pins; the heat map is a ground tint. */
  private network: THREE.Group | null = null;
  private networkVisible = false;
  /** One dot per control point, in control-point order, so a dot can be dragged on its own. */
  private dots: THREE.Points[] = [];
  /** Index of the dot being dragged, or −1. */
  private dragging = -1;
  private readonly dragPlane = new THREE.Plane();
  private readonly raycaster = new THREE.Raycaster();
  private onPathEdit: ((index: number, point: { x: number; z: number }) => void) | null = null;
  private readonly pointerHandlers: [keyof HTMLElementEventMap, (e: PointerEvent) => void, boolean][];
  /** Highest column of the current terrain, in voxels: where printing ends. */
  private terrainTop = 0;
  private readonly print = createPrintUniforms();
  private readonly look = createLookUniforms();
  /** The build animation: the cut ground of the river and the streets, the river cut's digging
   * ceiling, the water (unclamped; it flows in by `flow`), and the numbers that pace them. */
  private riverCut: THREE.Mesh | null = null;
  private beforeStreets: THREE.Mesh | null = null;
  private streetCut: THREE.Mesh | null = null;
  /** The ground the site grading digs out of the lots, and its per-lot ceilings (see `applyRaise`). */
  private dig: THREE.Mesh | null = null;
  private readonly lotCaps = { value: null as THREE.DataTexture | null };
  private lotCapData = new Float32Array(0);
  /** When each lot's building starts (its `delay`), by lot id. */
  private lotDelay = new Map<number, number>();
  private readonly carve = { value: 1e5 };
  private readonly fill = createPrintUniforms();
  private readonly flow = { uBuild: { value: null as THREE.Texture | null }, uBuildT: { value: 2 }, uClaimSize: { value: 1 } };
  private build: BuildUp | null = null;
  /** The buildings on the lots: built a few per frame, each raised in turn in the timeline's last
   * phase (`delay` 0–RAISE_SPREAD, the Landmark first, then outward from the plaza). */
  private readonly city = new THREE.Group();
  private cityItems: { group: THREE.Group; delay: number; print: PrintableBuilding }[] = [];
  private cityQueue: { plan: BuildingPlan; delay: number }[] = [];
  private cityFrame = 0;
  /** The parks' props, grown out of the ground in turn as `raise` passes each one's start (see setParks). */
  private readonly parks = new THREE.Group();
  private readonly parkRaise = { value: 1 };
  private parkMaterials: { solid: THREE.Material; glow: THREE.Material } | null = null;
  /** How far the buildings have risen, 0–1 (the timeline's last phase). */
  private raise = 1;
  /** Makes the build animation's data for the current terrain; called the first time it plays. */
  private makeBuild: (() => BuildUp) | null = null;
  private groundTop = 0;
  private frame = 0;
  /** The inhabitants: out once the city is built (the print at its end), while shown. */
  private life: LifeView | null = null;
  private lifeShown = true;
  private built = true;
  private readonly clock = new THREE.Clock();

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = SKY.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(SKY.background);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, EXTENT * 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
    this.controls.minDistance = 8;
    this.controls.maxDistance = EXTENT * 5.5;

    const hemi = new THREE.HemisphereLight(SKY.hemisphereSky, SKY.hemisphereGround, SKY.hemisphereIntensity);
    const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunIntensity);
    const az = THREE.MathUtils.degToRad(SKY.sunAzimuth);
    const el = THREE.MathUtils.degToRad(SKY.sunElevation);
    const reach = EXTENT * 1.6;
    sun.position.set(Math.cos(el) * Math.sin(az) * reach, Math.sin(el) * reach, Math.cos(el) * Math.cos(az) * reach);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -EXTENT, right: EXTENT, top: EXTENT, bottom: -EXTENT, near: 1, far: reach * 2.2 });
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.2;
    this.scene.add(hemi, sun, sun.target);

    const half = WORLD_SIZE / 2;
    this.scene.add(buildPlinth(half), this.city, this.parks);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(mount);
    this.resize();
    this.frameCamera();

    // Dragging river control points. Pointer-down listens in the capture phase so it runs before
    // the orbit controls and can stop them when it picks up a dot.
    this.pointerHandlers = [
      ["pointerdown", (e) => this.onPointerDown(e), true],
      ["pointermove", (e) => this.onPointerMove(e), false],
      ["pointerup", (e) => this.onPointerUp(e), false],
      ["pointercancel", (e) => this.onPointerUp(e), false],
    ];
    for (const [type, handler, capture] of this.pointerHandlers) this.renderer.domElement.addEventListener(type, handler as EventListener, capture);

    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.easeInset();
      this.controls.update();
      this.fitNear();
      const dt = this.clock.getDelta();
      if (this.life) {
        this.life.group.visible = this.lifeShown && this.built;
        if (this.life.group.visible) this.life.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /**
   * Pushes the near plane out to just short of the diorama (its box, up to the Landmark's top), so
   * the depth buffer's precision is spent where things are: with it fixed at 1 voxel, details a
   * tenth of a voxel apart (a billboard's pixels on its frame, sign glyphs) flickered from afar.
   */
  private fitNear() {
    const near = Math.max(1, NEAR_BOX.distanceToPoint(this.camera.position) * 0.8);
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.05) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Pixels of the view's left side covered by the settings panel, as set and as currently drawn (eased). */
  private insetTarget = 0;
  private insetNow = 0;
  private insetSet = false;

  /**
   * Tells the view how much of its left side a panel covers. The picture slides right by half of
   * that (a view offset: the camera itself doesn't move), so the city sits in the middle of the
   * part you can see; it eases there as the panel opens or closes.
   */
  setInsetLeft(px: number) {
    this.insetTarget = px;
    if (!this.insetSet) {
      // The first time (at load), jump there and frame the camera for the space left.
      this.insetSet = true;
      this.insetNow = px;
      this.applyInset();
      this.frameCamera();
    }
  }

  private easeInset() {
    if (Math.abs(this.insetTarget - this.insetNow) < 0.5) {
      if (this.insetNow !== this.insetTarget) {
        this.insetNow = this.insetTarget;
        this.applyInset();
      }
      return;
    }
    this.insetNow += (this.insetTarget - this.insetNow) * 0.15;
    this.applyInset();
  }

  private applyInset() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width === 0 || height === 0) return;
    if (this.insetNow < 0.5) this.camera.clearViewOffset();
    else this.camera.setViewOffset(width, height, -this.insetNow / 2, 0, width, height);
  }

  /**
   * Default view: the whole diorama in frame, pulled back further on tall (portrait) screens. It
   * fits the part of the view a panel doesn't cover.
   */
  frameCamera() {
    const fit = EXTENT / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    const aspect = width && height ? Math.max(0.3, (width - this.insetTarget) / height) : this.camera.aspect;
    const distance = fit * (aspect < 1.2 ? Math.min(2.0, 1.05 / aspect) : 0.86);
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(
      distance * Math.cos(VIEW_ELEVATION) * Math.sin(VIEW_AZIMUTH),
      distance * Math.sin(VIEW_ELEVATION),
      distance * Math.cos(VIEW_ELEVATION) * Math.cos(VIEW_AZIMUTH),
    );
    this.controls.update();
  }

  private remove(mesh: THREE.Mesh | null) {
    if (!mesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.customDepthMaterial?.dispose();
    this.scene.remove(mesh);
  }

  /**
   * Replaces the terrain: the ground, the river water (if any), `top` (its highest column in
   * voxels) and how to make the build animation's data. That data takes a while, so it is made
   * only when the timeline first plays or is scrubbed (a settings change doesn't replay it).
   */
  setTerrain(ground: GeometryData, water: GeometryData | null, top: number, makeBuild: (() => BuildUp) | null = null) {
    this.remove(this.terrain);
    this.remove(this.water);
    this.remove(this.riverCut);
    this.remove(this.streetCut);
    this.remove(this.beforeStreets);
    this.remove(this.dig);
    this.dig = null;
    this.riverCut = null;
    this.streetCut = null;
    this.beforeStreets = null;
    this.build = null;
    this.makeBuild = makeBuild;
    this.groundTop = top;
    this.terrainTop = top;
    // The finished ground keeps the columns the paving front has reached and those it never changes.
    this.terrain = new THREE.Mesh(toGeometry(ground), printMaterial(this.print, {}, this.look, { reveal: this.look, part: "built" }));
    this.terrain.customDepthMaterial = printDepthMaterial(this.print);
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.water = null;
    if (water) {
      this.water = new THREE.Mesh(toGeometry(water), printMaterial(this.fill, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }, undefined, { plain: true, reveal: this.flow, arriving: true }));
      this.water.receiveShadow = true;
      this.scene.add(this.water);
    }
  }

  /**
   * Replaces the buildings: one per plan, positioned on its lot (columns → world, base on the lot's
   * lowest ground, entrance to the street).
   * Models are built a few per frame so the page stays responsive.
   */
  setBuildings(plans: BuildingPlan[], n: number) {
    cancelAnimationFrame(this.cityFrame);
    for (const { group, print } of this.cityItems) {
      print.dispose();
      disposeBuilding(group);
      this.city.remove(group);
    }
    this.cityItems = [];
    const half = n / 2;
    const plaza = plans.find((p) => p.archetype === "landmark-tower");
    const far = Math.max(1, ...plans.map((p) => (plaza ? Math.hypot(p.x - plaza.x, p.z - plaza.z) : 0)));
    this.cityQueue = plans
      .map((plan) => ({ plan, delay: plan.archetype === "landmark-tower" || !plaza ? 0 : RAISE_SPREAD * (Math.hypot(plan.x - plaza.x, plan.z - plaza.z) / far) }))
      .sort((a, b) => a.delay - b.delay);
    this.lotDelay = new Map(this.cityQueue.map(({ plan, delay }) => [plan.lot, delay]));
    const step = () => {
      const start = performance.now();
      while (this.cityQueue.length && performance.now() - start < 10) {
        const { plan, delay } = this.cityQueue.shift()!;
        // All of it within its lot, less a gap all round.
        const group = buildingObject(fitBuilding(plan));
        group.position.set(plan.x - half, plan.base, plan.z - half);
        group.rotation.y = plan.rotation;
        this.city.add(group);
        this.cityItems.push({ group, delay, print: makePrintable(group) });
      }
      this.applyRaise();
      if (this.cityQueue.length) this.cityFrame = requestAnimationFrame(step);
    };
    this.cityFrame = requestAnimationFrame(step);
  }

  /**
   * Replaces the parks' props: per park, one solid and one glow mesh. Each prop grows out of its
   * base in turn: the parks start outward from the plaza (as the buildings do), and within a park
   * the middle first (the props' `delay`).
   */
  setParks(parks: Parks | null) {
    for (const o of [...this.parks.children]) {
      (o as THREE.Mesh).geometry.dispose();
      this.parks.remove(o);
    }
    if (!parks) return;
    const n = parks.ground.n;
    const half = n / 2;
    const far = Math.max(n * 0.5, ...parks.parks.map((p) => p.fromPlaza));
    const { solid, glow } = this.parkMaterialsFor();
    parks.parks.forEach((park, i) => {
      const model = buildParkModel(park, i + 1);
      const start = RAISE_SPREAD * (park.fromPlaza / far);
      for (const [data, grow, material, shadow] of [
        [model.solid, model.solidGrow, solid, true],
        [model.glow, model.glowGrow, glow, false],
      ] as const) {
        if (!data.index.length) continue;
        const geometry = toGeometry(data);
        const g = grow.slice();
        for (let v = 0; v < g.length; v += 4) {
          g[v] -= half;
          g[v + 2] -= half;
          g[v + 3] = start + g[v + 3] * PARK_SPREAD;
        }
        geometry.setAttribute("aGrow", new THREE.BufferAttribute(g, 4));
        geometry.translate(-half, 0, -half);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = shadow;
        mesh.userData.shadow = shadow;
        this.parks.add(mesh);
      }
    });
    this.applyRaise();
  }

  /** The buildings' two materials, patched to grow each park prop out of its base (`aGrow`: base xyz, start). */
  private parkMaterialsFor() {
    if (this.parkMaterials) return this.parkMaterials;
    const patch = (material: THREE.Material, key: string) => {
      const m = material.clone();
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uParkRaise = this.parkRaise;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nuniform float uParkRaise;\nattribute vec4 aGrow;")
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
float grow = clamp((uParkRaise - aGrow.w) / ${PARK_GROW.toFixed(3)}, 0.0, 1.0);
// Ease out with a little overshoot, so each prop pops up.
float popped = grow <= 0.0 ? 0.0 : 1.0 + 2.2 * pow(grow - 1.0, 3.0) + 1.2 * pow(grow - 1.0, 2.0);
transformed = aGrow.xyz + (transformed - aGrow.xyz) * popped;`,
          );
      };
      m.customProgramCacheKey = () => key;
      return m;
    };
    const { solid, glow } = buildingMaterials();
    this.parkMaterials = { solid: patch(solid, "park-solid"), glow: patch(glow, "park-glow") };
    return this.parkMaterials;
  }

  /** Replaces the inhabitants. */
  setLife(life: Life | null) {
    if (this.life) {
      this.scene.remove(this.life.group);
      this.life.dispose();
    }
    this.life = life ? new LifeView(life, life.map.n / 2) : null;
    if (this.life) this.scene.add(this.life.group);
  }

  setShowLife(on: boolean) {
    this.lifeShown = on;
  }

  setShowBuildings(on: boolean) {
    this.city.visible = on;
  }

  /**
   * As `raise` passes a building's delay, its lot is first dug level (the graded ground sinks from
   * its top down, DIG_SHARE of the building's time), then the building goes up out of it, storey
   * by storey (frame, then cladding). A lot with no building is dug at the start.
   */
  private applyRaise() {
    this.parkRaise.value = this.raise >= 1 ? 2 : this.raise;
    for (const o of this.parks.children) o.castShadow = this.raise >= 1 && o.userData.shadow;
    const progress = (delay: number) => Math.min(1, Math.max(0, (this.raise - delay) / (1 - RAISE_SPREAD)));
    for (const { group, delay, print } of this.cityItems) {
      const s = Math.max(0, (progress(delay) - DIG_SHARE) / (1 - DIG_SHARE));
      group.visible = s > 0;
      print.setProgress(s);
    }
    const caps = this.lotCaps.value;
    const dig = this.build?.dig;
    if (caps && dig) {
      const data = this.lotCapData;
      for (let i = 1; i < data.length; i++) {
        const p = Math.min(1, progress(this.lotDelay.get(i - 1) ?? 0) / DIG_SHARE);
        data[i] = p <= 0 ? 1e5 : Math.floor(dig.high[i] - p * (dig.high[i] - dig.low[i] + 1));
      }
      caps.needsUpdate = true;
    }
  }

  /** Makes and uploads the build animation's data, once per terrain. */
  private ensureBuild() {
    if (this.build || !this.makeBuild) return;
    const build = this.makeBuild();
    this.build = build;
    this.terrainTop = Math.max(this.groundTop, build.top);
    this.look.uGroundTop.value = build.groundTop;
    // The old ground for the columns the paving front hasn't reached; the finished ground keeps the
    // rest (see `part`), so every column is drawn once. It casts no shadow of its own.
    this.beforeStreets = new THREE.Mesh(toGeometry(build.beforeStreets), printMaterial(this.print, {}, this.look, { reveal: this.look, part: "unbuilt" }));
    this.beforeStreets.receiveShadow = true;
    this.beforeStreets.visible = false;
    this.scene.add(this.beforeStreets);
    {
      this.look.uBuild.value?.dispose();
      const texture = new THREE.DataTexture(build.order, build.n, build.n, THREE.RedFormat, THREE.FloatType);
      texture.needsUpdate = true;
      this.look.uBuild.value = texture;
      this.look.uClaimSize.value = build.n;
      this.flow.uBuild.value?.dispose();
      const flow = new THREE.DataTexture(build.flow, build.n, build.n, THREE.RedFormat, THREE.FloatType);
      flow.needsUpdate = true;
      this.flow.uBuild.value = flow;
      this.flow.uClaimSize.value = build.n;
      if (build.dig) {
        const geometry = toGeometry(build.dig.geometry);
        geometry.setAttribute("aLot", new THREE.BufferAttribute(build.dig.lots, 1));
        this.lotCaps.value?.dispose();
        this.lotCapData = new Float32Array(build.dig.high.length).fill(1e5);
        const caps = new THREE.DataTexture(this.lotCapData, build.dig.high.length, 1, THREE.RedFormat, THREE.FloatType);
        caps.needsUpdate = true;
        this.lotCaps.value = caps;
        this.dig = new THREE.Mesh(geometry, printMaterial(this.print, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, this.look, { lift: true, lotCaps: this.lotCaps }));
        // A flat lot's old ground lies exactly on its new floor: drawn in front of it until dug.
        this.dig.receiveShadow = true;
        this.scene.add(this.dig);
      }
      if (build.riverCut) {
        this.riverCut = new THREE.Mesh(toGeometry(build.riverCut), printMaterial(this.print, {}, this.look, { cap: this.carve, lift: true }));
        this.riverCut.receiveShadow = true;
        this.scene.add(this.riverCut);
      }
    }
  }

  /**
   * The river path overlay: the curve as a line and every control point as a dot, a little above
   * the water. Dots can be dragged.
   */
  setPath(path: RiverPath | null) {
    if (this.path) {
      this.path.traverse((o) => {
        if (o instanceof THREE.Line || o instanceof THREE.Points) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.scene.remove(this.path);
      this.path = null;
    }
    this.dots = [];
    if (!path) return;
    const half = WORLD_SIZE / 2;
    const lift = 3;
    const line: number[] = [];
    path.curve.forEach((q, i) => line.push(q.x - half + 0.5, Math.max(path.level[i], 0) + lift, q.z - half + 0.5));
    const levelAt = (q: { x: number; z: number }) => {
      let best = 0;
      let bestD = Infinity;
      path.curve.forEach((c, i) => {
        const d = (c.x - q.x) ** 2 + (c.z - q.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = path.level[i];
        }
      });
      return Math.max(best, 0);
    };
    const color = new THREE.Color(BLUEPRINT.cyan);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(line, 3));
    const group = new THREE.Group();
    group.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: color, depthTest: false, transparent: true, opacity: 0.9 })));
    path.control.forEach((q) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
      const dot = new THREE.Points(geometry, new THREE.PointsMaterial({ color: color, size: 12, sizeAttenuation: false, depthTest: false, transparent: true }));
      dot.position.set(q.x - half + 0.5, levelAt(q) + lift, q.z - half + 0.5);
      this.dots.push(dot);
      group.add(dot);
    });
    group.traverse((o) => (o.renderOrder = 10));
    group.visible = this.pathVisible;
    this.path = group;
    this.scene.add(group);
  }

  /**
   * The city overlay: a pin over the city center (large, white) and a dot on every junction, each
   * street's center line, the street tiles the network was collapsed on (faint squares), and a
   * ground tint: dark where nothing can be built, violet to
   * amber by suitability elsewhere. `heightAt` gives the ground's top at a column, in voxels.
   */
  setNetwork(hubs: Hubs, network: Streets, heightAt: (x: number, z: number) => number) {
    if (this.network) {
      this.network.traverse((o) => {
        if (o instanceof THREE.LineSegments || o instanceof THREE.Points) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.scene.remove(this.network);
    }
    const half = WORLD_SIZE / 2;
    const pin = voxels(6);
    const group = new THREE.Group();
    const lines: number[] = [];
    const dots = (points: { x: number; z: number }[], color: number, size: number, lift: number) => {
      const position: number[] = [];
      for (const q of points) {
        const y = heightAt(q.x, q.z);
        position.push(q.x - half, y + lift, q.z - half);
        if (lift > 2) lines.push(q.x - half, y, q.z - half, q.x - half, y + lift, q.z - half);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
      group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true })));
    };
    dots(hubs.hubs.slice(0, 1), 0xffffff, 18, pin);
    dots(network.junctions, BLUEPRINT.cyan, 8, 2);
    // The street tiles the network was collapsed on: a faint square around every road tile, laid
    // over the ground a meter at a time so it follows the slopes.
    const crosses: number[] = [];
    const t = network.tiles.size / 2;
    const step = voxels(1);
    const drape = (ax: number, az: number, bx: number, bz: number) => {
      const parts = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
      for (let i = 0; i < parts; i++) {
        const x0 = ax + ((bx - ax) * i) / parts;
        const z0 = az + ((bz - az) * i) / parts;
        const x1 = ax + ((bx - ax) * (i + 1)) / parts;
        const z1 = az + ((bz - az) * (i + 1)) / parts;
        crosses.push(x0 - half, heightAt(x0, z0) + 1, z0 - half, x1 - half, heightAt(x1, z1) + 1, z1 - half);
      }
    };
    for (const q of network.tiles.centers) {
      drape(q.x - t, q.z - t, q.x + t, q.z - t);
      drape(q.x + t, q.z - t, q.x + t, q.z + t);
      drape(q.x + t, q.z + t, q.x - t, q.z + t);
      drape(q.x - t, q.z + t, q.x - t, q.z - t);
    }
    const crossGeometry = new THREE.BufferGeometry();
    crossGeometry.setAttribute("position", new THREE.Float32BufferAttribute(crosses, 3));
    group.add(new THREE.LineSegments(crossGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));
    // Each street's center line, a little above its surface.
    for (const street of network.streets) {
      street.curve.forEach((q, i) => {
        if (i === 0) return;
        const p = street.curve[i - 1];
        lines.push(p.x - half + 0.5, street.level[i - 1] + 2, p.z - half + 0.5, q.x - half + 0.5, street.level[i] + 2, q.z - half + 0.5);
      });
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(lines, 3));
    group.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: BLUEPRINT.cyan, transparent: true, opacity: 0.8 })));
    group.traverse((o) => (o.renderOrder = 10));
    group.visible = this.networkVisible;
    this.network = group;
    this.scene.add(group);

    // The heat map texture, one texel per cell, smoothly filtered.
    const data = new Uint8Array(hubs.suitability.length);
    // 0 is unbuildable; buildable cells are 1–255 by suitability.
    hubs.suitability.forEach((s, c) => (data[c] = hubs.buildable[c] ? 1 + Math.round(s * 254) : 0));
    this.look.uSuit.value?.dispose();
    const texture = new THREE.DataTexture(data, hubs.cells, hubs.cells, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    this.look.uSuit.value = texture;
  }

  /**
   * Districts and lots, both as ground tints with one texel per column, drawn by the ground
   * shader so they follow the terrain and hide behind hills like the ground itself.
   * - Districts: each unpaved column takes its 2 m cell's district. A cell that is mostly road has
   *   none, so its unpaved columns (the strip beside the street) take the nearest district around
   *   them. Paving and water stay clear. Parks are ignored here: they are a layer of their own.
   * - Parks: 1 per park column, 2 on its edge (Show parks).
   * - Lots: district + 1 per lot column, plus 64 on columns at a lot's edge.
   */
  setDistricts(districts: Districts) {
    const { lotId, lots, cells, district } = districts;
    const claim = districts.claims.claim;
    const n = districts.claims.n;
    const cell = n / cells;
    const areas = new Uint8Array(n * n);
    const marks = new Uint8Array(n * n);
    const parks = new Uint8Array(n * n);
    const isPark = (x: number, z: number) => x >= 0 && z >= 0 && x < n && z < n && claim[z * n + x] === CLAIM.park;
    for (let z = 0; z < n; z++) {
      const cz = Math.floor(z / cell);
      for (let x = 0; x < n; x++) {
        const k = z * n + x;
        const what = claim[k];
        if (what === CLAIM.park) parks[k] = isPark(x - 1, z) && isPark(x + 1, z) && isPark(x, z - 1) && isPark(x, z + 1) ? 1 : 2;
        if (what !== CLAIM.road && what !== CLAIM.plaza && what !== CLAIM.river && what !== CLAIM.bank) {
          const cx = Math.floor(x / cell);
          let d = district[cz * cells + cx];
          if (d === NO_DISTRICT) {
            // The nearest cell with a district within two cells, by distance to its edge.
            let best = Infinity;
            for (let dz = -2; dz <= 2; dz++) {
              for (let dx = -2; dx <= 2; dx++) {
                const nx = cx + dx;
                const nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= cells || nz >= cells) continue;
                const nd = district[nz * cells + nx];
                if (nd === NO_DISTRICT) continue;
                const ex = Math.max(nx * cell - x - 0.5, 0, x + 0.5 - (nx + 1) * cell);
                const ez = Math.max(nz * cell - z - 0.5, 0, z + 0.5 - (nz + 1) * cell);
                const gap = ex * ex + ez * ez;
                if (gap < best) {
                  best = gap;
                  d = nd;
                }
              }
            }
          }
          if (d !== NO_DISTRICT) areas[k] = d + 1;
        }
        const id = lotId[k];
        if (!id) continue;
        const edge = x === 0 || z === 0 || x === n - 1 || z === n - 1 || lotId[k - 1] !== id || lotId[k + 1] !== id || lotId[k - n] !== id || lotId[k + n] !== id;
        marks[k] = lots[id - 1].district + 1 + (edge ? 64 : 0);
      }
    }
    const upload = (data: Uint8Array<ArrayBuffer>, old: THREE.Texture | null) => {
      old?.dispose();
      const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      return texture;
    };
    this.look.uDistricts.value = upload(areas, this.look.uDistricts.value);
    this.look.uLots.value = upload(marks, this.look.uLots.value);
    this.look.uParks.value = upload(parks, this.look.uParks.value);
  }

  setShowParks(on: boolean) {
    this.look.uShowParks.value = on ? 1 : 0;
  }

  setShowDistricts(on: boolean) {
    this.look.uShowDistricts.value = on ? 1 : 0;
  }

  setShowLots(on: boolean) {
    this.look.uShowLots.value = on ? 1 : 0;
  }

  setNetworkVisible(visible: boolean) {
    this.networkVisible = visible;
    if (this.network) this.network.visible = visible;
    this.look.uShowSuit.value = visible ? 1 : 0;
  }

  setPathVisible(visible: boolean) {
    this.pathVisible = visible;
    if (this.path) this.path.visible = visible;
  }

  /** Called when a control point is dropped, with its index and new position in columns. */
  setPathEditHandler(handler: ((index: number, point: { x: number; z: number }) => void) | null) {
    this.onPathEdit = handler;
  }

  /** The dot under the pointer (within 14 px on screen), or −1. */
  private pickDot(e: PointerEvent): number {
    if (!this.path?.visible) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    let best = -1;
    let bestD = 14;
    const v = new THREE.Vector3();
    this.dots.forEach((dot, i) => {
      v.copy(dot.position).project(this.camera);
      const d = Math.hypot(((v.x + 1) / 2) * rect.width - ex, ((1 - v.y) / 2) * rect.height - ey);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private onPointerDown(e: PointerEvent) {
    const i = this.pickDot(e);
    if (i < 0) return;
    e.stopImmediatePropagation();
    this.controls.enabled = false;
    this.dragging = i;
    this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), this.dots[i].position);
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.renderer.domElement.style.cursor = "grabbing";
  }

  private onPointerMove(e: PointerEvent) {
    const canvas = this.renderer.domElement;
    if (this.dragging < 0) {
      canvas.style.cursor = this.pickDot(e) >= 0 ? "grab" : "";
      return;
    }
    // Move the dot across a flat plane at its own height; the river is rebuilt on release.
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, hit)) return;
    const limit = WORLD_SIZE / 2 - 0.5;
    this.dots[this.dragging].position.x = Math.min(limit, Math.max(-limit, hit.x));
    this.dots[this.dragging].position.z = Math.min(limit, Math.max(-limit, hit.z));
  }

  private onPointerUp(e: PointerEvent) {
    if (this.dragging < 0) return;
    const i = this.dragging;
    this.dragging = -1;
    this.controls.enabled = true;
    const canvas = this.renderer.domElement;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "";
    const half = WORLD_SIZE / 2;
    const { x, z } = this.dots[i].position;
    this.onPathEdit?.(i, { x: x + half - 0.5, z: z + half - 0.5 });
  }

  /** The voxel grid's strength (0 off). Live: nothing is rebuilt. */
  setLook(grid: number) {
    this.look.uLookGrid.value = grid;
  }

  /** The claim map for Show claims: one byte per column, `n` columns per side. */
  setClaims(claim: Uint8Array<ArrayBuffer>, n: number) {
    this.look.uClaims.value?.dispose();
    const texture = new THREE.DataTexture(claim, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    this.look.uClaims.value = texture;
    this.look.uClaimSize.value = n;
  }

  setShowClaims(on: boolean) {
    this.look.uShowClaims.value = on ? 1 : 0;
  }

  /**
   * Where the build timeline is, 0 (nothing above the plinth) to 1 (finished), in the phases of
   * BUILD_PHASES: the terrain prints one whole voxel layer at a time, the river cut is dug away
   * layer by layer, the water runs down the channel from the source, then the paving spreads
   * from the plaza.
   */
  setPrint(t: number) {
    const [terrain, river, water] = BUILD_PHASES;
    const share = (from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));
    const done = t >= 1;
    this.built = done;
    if (!done) this.ensureBuild();
    const b = this.build;
    // 1. The terrain, as it was before the river and the streets.
    const printed = share(0, terrain.end);
    this.print.uPrintY.value = done || printed >= 1 ? 1e5 : Math.floor(BASE + printed * (this.terrainTop + 1 - BASE));
    // 2. The river cut, dug from its top down to the channel floor.
    const dug = share(terrain.end, river.end);
    this.carve.value = dug <= 0 || !b ? 1e5 : Math.floor(b.riverHigh - dug * (b.riverHigh - b.riverLow + 1));
    if (this.riverCut) this.riverCut.visible = !done && dug < 1;
    if (this.dig) this.dig.visible = !done;
    // 3. The water, running down the channel from the source.
    const filled = share(river.end, water.end);
    if (this.water) this.water.visible = done || filled > 0 || !b;
    this.flow.uBuildT.value = done || !b ? 2 : filled;
    // 4–5. Paving, from the plaza out along the streets; the street cuts go as the paving reaches them.
    const paving = done || !b ? 2 : t < PAVING_FROM ? -1 : (t - PAVING_FROM) / (PAVING_TO - PAVING_FROM);
    this.look.uBuildT.value = paving;
    // Until the front reaches a changed column, it shows the ground before the streets.
    if (this.beforeStreets) this.beforeStreets.visible = !!b && !done;
    // 6. The buildings rise.
    this.raise = done ? 1 : share(PAVING_TO, 1);
    this.applyRaise();
  }

  private resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.applyInset();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.setLife(null);
    cancelAnimationFrame(this.cityFrame);
    for (const [type, handler, capture] of this.pointerHandlers) this.renderer.domElement.removeEventListener(type, handler as EventListener, capture);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
