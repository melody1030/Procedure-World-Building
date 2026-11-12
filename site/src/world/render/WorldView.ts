import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeometryData } from "../geometry";
import { BLUEPRINT, SKY } from "../palette";
import { CLAIM } from "../terrain/claims";
import type { Hubs } from "../terrain/hubs";
import { NO_DISTRICT, frontageKind, type Districts } from "../terrain/districts";
import type { Streets } from "../terrain/streets";
import type { RiverPath } from "../terrain/river";
import { BASE, WORLD_SIZE, voxels } from "../scale";
import { buildPlinth } from "./base";
import { makePrintable, type PrintableBuilding } from "../buildings/print";
import { buildingMaterials, buildingObject, disposeBuilding } from "../buildings/render";
import { fitBuilding, type BuildingPlan } from "../city/placement";
import type { Park, Parks } from "../city/parks";
import { buildParkModel } from "../city/parkModels";
import { BUILD_PHASES, PAVING_FROM, PAVING_TO, type BuildUp } from "../terrain/buildup";
import { createLookUniforms, createPrintUniforms, printDepthMaterial, printMaterial } from "./print";
import { LifeView } from "./life";
import { RING_PAD, SelectionMark, locate, pick, sameSelection, type Selection } from "./select";
import type { Life } from "../life/agents";
import type { GroundTint } from "../state";
import { HEIGHT_TINT_ENCODE, type Zoning } from "../city/zoning";

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
/** How deep (columns) the Frontage tint's bright front edge runs into each lot. */
const FRONT_STRIP = voxels(1.5);


function toGeometry(data: GeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(data.color, 3));
  geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The camera presets the toolbar flies to. */
export type CameraPreset = "overview" | "plaza" | "park" | "river" | "street";
interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}
/** How long a flight to a preset takes, in ms. */
const FLIGHT_MS = 700;
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
/** A point `distance` from `target`, at the given elevation and azimuth (the overview's by default). */
function orbit(target: THREE.Vector3, distance: number, elevation: number, azimuth = VIEW_AZIMUTH) {
  return new THREE.Vector3(
    target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
  );
}
/** The Plaza preset's distance from the plaza and its angle above it. */
const PLAZA_DISTANCE = voxels(95);
const PLAZA_ELEVATION = THREE.MathUtils.degToRad(36);
/** The Park preset looks down more steeply, from as far as the park needs to fill the view. */
const PARK_ELEVATION = THREE.MathUtils.degToRad(43);
/** Following a selection: how far the camera trails it, and between which heights (elevation) it looks down. */
const FOLLOW_DISTANCE = voxels(22);
const FOLLOW_ELEVATION_MIN = THREE.MathUtils.degToRad(20);
const FOLLOW_ELEVATION_MAX = THREE.MathUtils.degToRad(55);
/** A building not built yet, for picking (never visible). */
/**
 * How the Plaza and Park views turn from their clearest side, set by eye: the plaza 45°
 * counterclockwise (seen from above), the park 10° clockwise.
 */
const PLAZA_TURN = Math.PI / 4;
const PARK_TURN = THREE.MathUtils.degToRad(-10);
/** The River preset, matched to a view set by hand on seed km8gt7: 108 m out, 27° up, from
 * downstream turned 25° counterclockwise (seen from above) off the river's line. */
const RIVER_DISTANCE = voxels(108);
const RIVER_ELEVATION = THREE.MathUtils.degToRad(27);
const RIVER_TURN = THREE.MathUtils.degToRad(25);
/** The Street preset, matched to a view set by hand on seed km8gt7: 70 m out past the end of a
 * street and 27 m above it, looking back along it 21.5° down (see streetPose for which street). */
const STREET_BACK = voxels(70);
const STREET_HEIGHT = voxels(27);
const STREET_ELEVATION = THREE.MathUtils.degToRad(21.5);
/** A street's last stretch, the line the Street camera stands on (curve samples), and how far in from the island's edge it must stay. */
const STREET_RUN = 20;
const ISLAND_MARGIN = voxels(4);
/** How much closer the camera may come when the turned side is blocked (fractions of its distance). */
const CLOSER = [1, 0.85, 0.7, 0.55];
/** A side score at or above this has the camera inside a building or a hill. */
const RULED_OUT = 100;
/** 0, 1, −1, 2, −2…: steps out from a direction, nearest first. */
const fan = (i: number) => (i % 2 ? (i + 1) / 2 : -i / 2);

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
  /** The buildings by plan (null until built), with their bounds, for picking. */
  /** Each building's bounds in the scene, once built: they hide the agents behind them from a click. */
  private buildingBoxes: (THREE.Box3 | null)[] = [];
  /** The buildings' plans, so the Plaza preset can look from the side with the fewest in the way. */
  private plans: BuildingPlan[] = [];
  /** The parks, for the Park preset. */
  private parkData: Parks | null = null;
  private cityQueue: { plan: BuildingPlan; index: number; delay: number }[] = [];
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
  /** What the presets aim at: the river's course, the streets and plaza, and the ground's height. */
  private riverPath: RiverPath | null = null;
  private streetData: Streets | null = null;
  private heightAt: ((x: number, z: number) => number) | null = null;
  /** The flight to a preset under way, if any. */
  private flight: { from: Pose; to: Pose; start: number } | null = null;
  private onView: ((preset: CameraPreset | null) => void) | null = null;
  /** What is selected (clicked), its mark, and whether the camera follows it. */
  private selection: Selection | null = null;
  private onSelect: ((selection: Selection | null) => void) | null = null;
  private readonly mark = new SelectionMark();
  private following = false;
  private onFollow: ((on: boolean) => void) | null = null;
  /** Where a press began, to tell a click (pick) from a drag (orbit). */
  private press: { x: number; y: number; id: number } | null = null;

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
    // Grabbing the view ends a flight and leaves the preset.
    this.controls.addEventListener("start", () => {
      this.flight = null;
      this.onView?.(null);
    });

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
    this.scene.add(buildPlinth(half), this.city, this.parks, this.mark.group);

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
      const dt = this.clock.getDelta();
      if (this.life) {
        this.life.group.visible = this.lifeShown && this.built;
        if (this.life.group.visible) this.life.update(dt);
      }
      this.track();
      this.fly();
      this.controls.update();
      this.fitNear();
      this.mark.update(this.selection, this.lifeNow(), WORLD_SIZE / 2, this.clock.elapsedTime);
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
    const pose = this.overviewPose();
    this.controls.target.copy(pose.target);
    this.camera.position.copy(pose.position);
    this.controls.update();
  }

  private overviewPose(): Pose {
    const fit = EXTENT / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    const aspect = width && height ? Math.max(0.3, (width - this.insetTarget) / height) : this.camera.aspect;
    const distance = fit * (aspect < 1.2 ? Math.min(2.0, 1.05 / aspect) : 0.86);
    return { target: new THREE.Vector3(0, 0, 0), position: orbit(new THREE.Vector3(0, 0, 0), distance, VIEW_ELEVATION) };
  }

  /** Tells React which preset the view is at (null once the user moves it). */
  setViewHandler(handler: (preset: CameraPreset | null) => void) {
    this.onView = handler;
  }

  /** Tells React what was clicked (null: empty ground, or the selection went away). */
  setSelectHandler(handler: (selection: Selection | null) => void) {
    this.onSelect = handler;
  }

  /** Tells React whether the camera follows the selection. */
  setFollowHandler(handler: (on: boolean) => void) {
    this.onFollow = handler;
  }

  /** Selects something (or nothing), from React (the inspector's close button, Escape). */
  select(selection: Selection | null) {
    if (sameSelection(selection, this.selection)) return;
    this.selection = selection;
    if (!selection) this.setFollowing(false);
    else if (this.following) {
      // Following someone else: fly over to them rather than jump.
      this.following = false;
      this.setFollowing(true);
    }
    this.onSelect?.(selection);
  }

  private clearSelection() {
    this.select(null);
  }

  private lifeNow(): Life | null {
    return this.life && this.life.group.visible ? this.life.life : null;
  }

  /**
   * Follows the selected agent with the camera (or stops): the camera flies to it, keeping the
   * view's direction, then trails it, still free to orbit and zoom round it (not to pan).
   */
  setFollowing(on: boolean) {
    const sel = this.selection;
    const can = !!sel;
    on = on && can;
    if (on === this.following) return;
    this.following = on;
    this.controls.enablePan = !on;
    this.onFollow?.(on);
    if (!on) return;
    this.onView?.(null);
    const at = this.followPoint();
    if (!at) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const elevation = THREE.MathUtils.clamp(Math.asin(offset.y / offset.length()), FOLLOW_ELEVATION_MIN, FOLLOW_ELEVATION_MAX);
    const distance = sel!.kind === "vehicle" ? FOLLOW_DISTANCE * 1.4 : FOLLOW_DISTANCE;
    // Keep the view's direction if nothing stands between, else the nearest side that is clear
    // (the first of 0, +15°, −15°, +30°… with nothing in the way), else the least blocked.
    const half = WORLD_SIZE / 2;
    const place = { x: at.x + half - 0.5, z: at.z + half - 0.5 };
    const from = Math.atan2(offset.x, offset.z);
    let azimuth = from;
    let best = Infinity;
    for (let i = 0; i < 24 && best > 0; i++) {
      const a = from + (fan(i) * Math.PI) / 12;
      const s = this.sideScore(place, voxels(1), at.y, distance, elevation, 0, a);
      if (s < best) {
        best = s;
        azimuth = a;
      }
    }
    this.flight = { from: { position: this.camera.position.clone(), target: this.controls.target.clone() }, to: { target: at, position: orbit(at, distance, elevation, azimuth) }, start: performance.now() };
  }

  /** The point the camera follows: a little above the selection's feet (null if it can't be seen). */
  private followPoint(): THREE.Vector3 | null {
    if (!this.selection) return null;
    const at = locate(this.selection, this.lifeNow(), WORLD_SIZE / 2);
    return at ? new THREE.Vector3(at.x, at.y + Math.min(at.height, voxels(1.5)), at.z) : null;
  }

  /** Each frame while following: the target and camera move with the agent (mid-flight, the flight's end does). */
  private track() {
    if (!this.following) return;
    const at = this.followPoint();
    if (!at) return;
    if (this.flight) {
      const offset = this.flight.to.position.clone().sub(this.flight.to.target);
      this.flight.to.target.copy(at);
      this.flight.to.position.copy(at).add(offset);
      return;
    }
    const step = at.sub(this.controls.target);
    this.controls.target.add(step);
    this.camera.position.add(step);
  }

  /**
   * Where the selection is on screen (client pixels): a point just above it, for the inspector to
   * sit beside, and how wide it (with its ring) is there, so the card keeps clear of it. Null when
   * it can't be seen or is behind the camera.
   */
  selectionOnScreen(): { x: number; y: number; reach: number } | null {
    if (!this.selection) return null;
    const at = locate(this.selection, this.lifeNow(), WORLD_SIZE / 2);
    if (!at) return null;
    // Just above the agent.
    const top = new THREE.Vector3(at.x, at.y + at.height, at.z);
    const v = top.clone().project(this.camera);
    if (v.z > 1) return null;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const side = top.addScaledVector(right, at.radius + RING_PAD).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, reach: (Math.abs(side.x - v.x) / 2) * rect.width };
  }

  /** What is under the pointer (see render/select.ts), or null. */
  private pickAt(e: PointerEvent): Selection | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    // How wide a pixel is per unit of distance, to pad small things by a few pixels.
    const pixel = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / rect.height;
    // The nearest solid thing along the ray: the ground, or a building in front of it.
    let wall = this.groundAlong(ray);
    if (this.city.visible && this.built) {
      const hit = new THREE.Vector3();
      for (const box of this.buildingBoxes) if (box && ray.intersectBox(box, hit)) wall = Math.min(wall, hit.distanceTo(ray.origin));
    }
    return pick(ray, this.lifeNow(), WORLD_SIZE / 2, pixel, wall);
  }

  /** How far along the ray it first meets the ground (Infinity if it doesn't), marching a voxel at a time. */
  private groundAlong(ray: THREE.Ray): number {
    const height = this.heightAt;
    if (!height) return Infinity;
    const half = WORLD_SIZE / 2;
    const p = new THREE.Vector3();
    for (let t = 0; t < EXTENT * 8; t += 1) {
      ray.at(t, p);
      if (p.y > this.terrainTop + 2) continue;
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
        if (p.y < BASE) return t;
        continue;
      }
      if (p.y <= height(p.x + half - 0.5, p.z + half - 0.5)) return t;
    }
    return Infinity;
  }

  /** Flies the camera to a preset, easing in and out. Does nothing if the preset has nothing to show. */
  flyTo(preset: CameraPreset) {
    this.setFollowing(false);
    const to = this.poseFor(preset);
    if (!to) return;
    this.flight = { from: { position: this.camera.position.clone(), target: this.controls.target.clone() }, to, start: performance.now() };
    this.onView?.(preset);
  }

  private fly() {
    if (!this.flight) return;
    const { from, to, start } = this.flight;
    const k = Math.min(1, (performance.now() - start) / FLIGHT_MS);
    const e = easeInOut(k);
    this.camera.position.lerpVectors(from.position, to.position, e);
    this.controls.target.lerpVectors(from.target, to.target, e);
    if (k >= 1) this.flight = null;
  }

  /**
   * The azimuth to look at a place from (the plaza, a park): of 24 directions round it, the one
   * whose line of sight passes through the fewest buildings and hills, the overview's side on a
   * tie. A building blocks when it stands in the corridor from the whole place (`half` columns
   * round its center) to the camera and rises above the line of sight there; a building or ground
   * at the camera's own spot rules the side out. Buildings within `skip`
   * columns of the center (the Landmark on the plaza) don't count.
   */
  private openSide(place: { x: number; z: number }, half: number, groundY: number, distance: number, elevation: number, skip = 0, turn = 0): { azimuth: number; distance: number } {
    const score = (azimuth: number) => this.sideScore(place, half, groundY, distance, elevation, skip, azimuth);
    let best = VIEW_AZIMUTH;
    let bestScore = Infinity;
    // Directions in order of nearness to the overview's: 0, +15°, −15°, +30°…
    for (let i = 0; i < 24; i++) {
      const azimuth = VIEW_AZIMUTH + (fan(i) * Math.PI) / 12;
      const s = score(azimuth);
      // Ties keep the earlier direction, the one nearer the overview's.
      if (s < bestScore) {
        bestScore = s;
        best = azimuth;
      }
    }
    if (!turn) return { azimuth: best, distance };
    // Then turned by `turn` (a framing chosen by eye). If something stands in the way from there,
    // the camera first comes closer (in front of it), then tries the sides next to the turned one,
    // nearest first and up to 90° off: the first clear one, else the least blocked; never one with
    // the camera inside a building or a hill.
    let pick = { azimuth: best, distance };
    let pickScore = RULED_OUT;
    for (let i = 0; i < 13; i++) {
      const azimuth = best + turn + (fan(i) * Math.PI) / 12;
      for (const k of CLOSER) {
        const s = this.sideScore(place, half, groundY, distance * k, elevation, skip, azimuth);
        if (s === 0) return { azimuth, distance: distance * k };
        if (s < pickScore) {
          pickScore = s;
          pick = { azimuth, distance: distance * k };
        }
      }
    }
    return pick;
  }

  /** How badly buildings and hills block the view of a place from one side (see openSide). */
  private sideScore(place: { x: number; z: number }, half: number, groundY: number, distance: number, elevation: number, skip: number, azimuth: number): number {
    const reach = distance * Math.cos(elevation);
    const rise = distance * Math.sin(elevation);
    const others = this.plans.filter((b) => Math.max(Math.abs(b.x - place.x), Math.abs(b.z - place.z)) > skip);
    {
      const dx = Math.sin(azimuth);
      const dz = Math.cos(azimuth);
      let score = 0;
      for (const b of others) {
        // How far out along the line (0 at the place, 1 at the camera), and how far off it.
        const radius = voxels(Math.max(b.width, b.depth) / 2);
        const along = ((b.x - place.x) * dx + (b.z - place.z) * dz) / reach;
        if (along <= 0 || along >= 1 + radius / reach) continue;
        const off = Math.abs((b.x - place.x) * dz - (b.z - place.z) * dx);
        const sightY = groundY + rise * Math.min(1, along);
        if (sightY >= b.base + voxels(b.height)) continue;
        // A building round the camera rules the side out; otherwise the corridor is as wide as
        // the place there and narrows to nothing at the camera.
        if (along > 1 - radius / reach && off < radius) score += RULED_OUT;
        else if (off < radius + half * Math.max(0, 1 - along)) score += 1;
      }
      // Ground (a hill) above the line of sight blocks too, and rules the side out at the camera.
      if (this.heightAt) {
        for (let t = 0.1; t <= 1.001; t += 0.1) {
          const y = this.heightAt(place.x + dx * reach * t, place.z + dz * reach * t);
          if (y > groundY + rise * t - voxels(1)) score += t > 0.95 ? RULED_OUT : 2;
        }
      }
      return score;
    }
  }

  /**
   * The park to show: a full park (trees, pavilion, play and picnic areas) rather than a flower
   * garden when there is one, the one with the most in it; and how far its props reach (columns).
   */
  private mainPark(): { x: number; z: number; reach: number; ground: number } | null {
    const parks = this.parkData?.parks.filter((p) => p.props.length > 0) ?? [];
    const pool = parks.some((p) => !p.garden) ? parks.filter((p) => !p.garden) : parks;
    const park = pool.reduce<Park | null>((best, p) => (!best || p.props.length > best.props.length ? p : best), null);
    if (!park || park.props.length === 0) return null;
    const reach = Math.max(...park.props.map((q) => Math.hypot(q.x - park.x, q.z - park.z)));
    const ground = park.props.reduce((sum, q) => sum + q.y, 0) / park.props.length;
    return { x: park.x, z: park.z, reach, ground };
  }

  /** Where each preset puts the camera, from the current city (null if it has nothing to show). */
  private poseFor(preset: CameraPreset): Pose | null {
    const half = WORLD_SIZE / 2;
    const at = (q: { x: number; z: number }, y: number) => new THREE.Vector3(q.x - half + 0.5, y, q.z - half + 0.5);
    if (preset === "overview") return this.overviewPose();
    if (preset === "plaza") {
      // Close on the plaza and the Landmark's base, looking down on the paving so the whole square
      // shows, from whichever side has the fewest buildings in the way.
      const plaza = this.streetData?.plazas[0];
      if (!plaza) return null;
      const target = at(plaza, plaza.level + voxels(4));
      const side = this.openSide(plaza, plaza.half, target.y, PLAZA_DISTANCE, PLAZA_ELEVATION, plaza.half, PLAZA_TURN);
      return { target, position: orbit(target, side.distance, PLAZA_ELEVATION, side.azimuth) };
    }
    if (preset === "park") {
      // Down into the park, close enough to see its people, benches and trees (the middle of it
      // fills the view), from the side with the fewest buildings in the way.
      const park = this.mainPark();
      if (!park) return null;
      const distance = THREE.MathUtils.clamp(park.reach * 2.2, voxels(40), voxels(60));
      const target = at(park, park.ground);
      const side = this.openSide(park, park.reach, target.y, distance, PARK_ELEVATION, 0, PARK_TURN);
      return { target, position: orbit(target, side.distance, PARK_ELEVATION, side.azimuth) };
    }
    if (preset === "river") {
      // A long look up the river from downstream of a point on the water a little past halfway
      // (a third of the way down plus 60 m), turned a little off the line of the river so its
      // banks and the town beside it show.
      const path = this.riverPath;
      if (!path || path.curve.length < 40) return null;
      const n = path.curve.length;
      const j = Math.min(n - 1, Math.floor(n * 0.3) + voxels(60));
      const target = at(path.curve[j], Math.max(path.level[j], 0));
      const up = path.curve[Math.max(0, j - 20)];
      const down = path.curve[Math.min(n - 1, j + 20)];
      const downstream = Math.atan2(down.x - up.x, down.z - up.z);
      return { target, position: orbit(target, RIVER_DISTANCE, RIVER_ELEVATION, downstream + RIVER_TURN) };
    }
    // Street: down a street from beyond one of its ends, on the line of its last stretch and above
    // the rooftops, looking back along it. The target is where that look meets the street's level,
    // so the view orbits round it.
    return this.streetPose(at);
  }

  /**
   * The Street preset's pose: the first clear one of these, in order: the main streets (longest
   * first), then the other streets (longest first); of each, the end away from the plaza first
   * (looking back toward it); from each end, the camera at its full distance, then closer
   * (CLOSER). A pose is clear when no building or hill stands between the camera and the street's
   * end (sideScore), and the camera stays over the island. With none clear, the least blocked.
   */
  private streetPose(at: (q: { x: number; z: number }, y: number) => THREE.Vector3): Pose | null {
    const data = this.streetData;
    if (!data) return null;
    const plaza = data.plazas[0];
    const fromPlaza = (q: { x: number; z: number }) => (plaza ? Math.hypot(q.x - plaza.x, q.z - plaza.z) : 0);
    const streets = data.streets
      .filter((st) => st.curve.length > 2 * STREET_RUN)
      .sort((a, b) => Number(b.kind === "main") - Number(a.kind === "main") || b.curve.length - a.curve.length);
    const ahead = STREET_BACK - STREET_HEIGHT / Math.tan(STREET_ELEVATION);
    const distance = STREET_HEIGHT / Math.sin(STREET_ELEVATION);
    const inside = (v: number) => v > ISLAND_MARGIN && v < WORLD_SIZE - ISLAND_MARGIN;
    let best: Pose | null = null;
    let bestScore = Infinity;
    for (const st of streets) {
      const n = st.curve.length;
      const ends = fromPlaza(st.curve[0]) > fromPlaza(st.curve[n - 1]) ? [0, n - 1] : [n - 1, 0];
      for (const e of ends) {
        const end = st.curve[e];
        const from = st.curve[e === 0 ? STREET_RUN : n - 1 - STREET_RUN];
        const out = Math.atan2(end.x - from.x, end.z - from.z);
        const place = { x: end.x + Math.sin(out) * ahead, z: end.z + Math.cos(out) * ahead };
        for (const k of CLOSER) {
          const reach = distance * k * Math.cos(STREET_ELEVATION);
          if (!inside(place.x + Math.sin(out) * reach) || !inside(place.z + Math.cos(out) * reach)) continue;
          const score = this.sideScore(place, st.width / 2, st.level[e], distance * k, STREET_ELEVATION, 0, out);
          if (score < bestScore) {
            bestScore = score;
            const target = at(place, st.level[e]);
            best = { target, position: orbit(target, distance * k, STREET_ELEVATION, out) };
          }
          if (score === 0) return best;
        }
      }
    }
    return best;
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
    this.plans = plans;
    this.buildingBoxes = plans.map(() => null);
    this.clearSelection();
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
      .map((plan, index) => ({ plan, index, delay: plan.archetype === "landmark-tower" || !plaza ? 0 : RAISE_SPREAD * (Math.hypot(plan.x - plaza.x, plan.z - plaza.z) / far) }))
      .sort((a, b) => a.delay - b.delay);
    this.lotDelay = new Map(this.cityQueue.map(({ plan, delay }) => [plan.lot, delay]));
    const step = () => {
      const start = performance.now();
      while (this.cityQueue.length && performance.now() - start < 10) {
        const { plan, index, delay } = this.cityQueue.shift()!;
        // All of it within its lot, less a gap all round.
        const group = buildingObject(fitBuilding(plan));
        group.position.set(plan.x - half, plan.base, plan.z - half);
        group.rotation.y = plan.rotation;
        // Its bounds in the scene, once placed, so it hides what stands behind it from a click
        // (the city group stays at the origin).
        group.updateMatrixWorld(true);
        this.buildingBoxes[index] = new THREE.Box3().setFromObject(group);
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
    this.parkData = parks;
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
    this.clearSelection();
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
    this.riverPath = path;
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
    this.streetData = network;
    this.heightAt = heightAt;
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
   * - Frontage: the lot's frontage kind + 1 per lot column, plus 64 on its front edge (the strip
   *   FRONT_STRIP deep along the side facing its street).
   */
  setDistricts(districts: Districts) {
    const { lotId, lots, cells, district } = districts;
    const claim = districts.claims.claim;
    const n = districts.claims.n;
    const cell = n / cells;
    const areas = new Uint8Array(n * n);
    const marks = new Uint8Array(n * n);
    const parks = new Uint8Array(n * n);
    const fronts = new Uint8Array(n * n);
    // Each lot's front-left corner and the unit vector from its front toward its back.
    const backward = lots.map((lot) => {
      const [a, , , d] = lot.corners;
      const deep = Math.hypot(d.x - a.x, d.z - a.z) || 1;
      return { a, mx: (d.x - a.x) / deep, mz: (d.z - a.z) / deep, kind: frontageKind(lot) + 1 };
    });
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
        const f = backward[id - 1];
        const behind = (x + 0.5 - f.a.x) * f.mx + (z + 0.5 - f.a.z) * f.mz;
        fronts[k] = f.kind + (behind < FRONT_STRIP ? 64 : 0);
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
    this.look.uFrontage.value = upload(fronts, this.look.uFrontage.value);
    this.look.uParks.value = upload(parks, this.look.uParks.value);
  }

  /**
   * The Height limit tint's texture, one texel per column: each lot's limit on its columns (plus
   * 128), and the zoning map's cell limit, fainter, on the unclaimed land between them. Limits are
   * 1–127 for 0–HEIGHT_TINT_ENCODE m; 0 where there is none (paving, water, parks).
   */
  setZoning(zoning: Zoning, districts: Districts) {
    const { lotId } = districts;
    const claim = districts.claims.claim;
    const n = districts.claims.n;
    const cell = n / zoning.cells;
    const code = (m: number) => 1 + Math.round((Math.min(m, HEIGHT_TINT_ENCODE) / HEIGHT_TINT_ENCODE) * 126);
    const lotCodes = zoning.lots.map((z) => 128 + code(z.limit));
    const data = new Uint8Array(n * n);
    for (let z = 0; z < n; z++) {
      const row = Math.floor(z / cell) * zoning.cells;
      for (let x = 0; x < n; x++) {
        const k = z * n + x;
        const id = lotId[k];
        if (id) data[k] = lotCodes[id - 1];
        else if (claim[k] === CLAIM.free) {
          const m = zoning.limit[row + Math.floor(x / cell)];
          if (m > 0) data[k] = code(m);
        }
      }
    }
    this.look.uHeights.value?.dispose();
    const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    this.look.uHeights.value = texture;
  }

  setShowParks(on: boolean) {
    this.look.uShowParks.value = on ? 1 : 0;
  }

  /** Color the ground by one thing at a time: districts, frontage, claims, city-center suitability, or nothing. */
  setGroundTint(tint: GroundTint) {
    this.look.uShowDistricts.value = tint === "districts" ? 1 : 0;
    this.look.uShowFrontage.value = tint === "frontage" ? 1 : 0;
    this.look.uShowHeights.value = tint === "heights" ? 1 : 0;
    this.look.uShowClaims.value = tint === "claims" ? 1 : 0;
    this.look.uShowSuit.value = tint === "suitability" ? 1 : 0;
  }

  setShowLots(on: boolean) {
    this.look.uShowLots.value = on ? 1 : 0;
  }

  setNetworkVisible(visible: boolean) {
    this.networkVisible = visible;
    if (this.network) this.network.visible = visible;
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
    if (i < 0) {
      // Maybe a click: picked on release if the pointer hardly moved.
      this.press = e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
      return;
    }
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
      // Over something that can be clicked: a pointer (not while a button is down, orbiting).
      canvas.style.cursor = this.pickDot(e) >= 0 ? "grab" : e.buttons === 0 && e.pointerType === "mouse" && this.pickAt(e) ? "pointer" : "";
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
    if (this.dragging < 0) {
      const press = this.press;
      this.press = null;
      // A click (moved under 4 px): select what is under it, or nothing.
      if (e.type === "pointerup" && press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) this.select(this.pickAt(e));
      return;
    }
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
    this.mark.dispose();
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

