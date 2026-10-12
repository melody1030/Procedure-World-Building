import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeometryData } from "../geometry";
import { BLUEPRINT, SKY } from "../palette";
import type { Hubs } from "../terrain/hubs";
import { DISTRICTS, NO_DISTRICT, type Districts } from "../terrain/districts";
import type { Streets } from "../terrain/streets";
import type { RiverPath } from "../terrain/river";
import { BASE, WORLD_SIZE, voxels } from "../scale";
import { buildPlinth } from "./base";
import { createLookUniforms, createPrintUniforms, printDepthMaterial, printMaterial } from "./print";

/** Diorama framing: looking down on the whole table-top from a raised corner. */
const VIEW_AZIMUTH = THREE.MathUtils.degToRad(38);
const VIEW_ELEVATION = THREE.MathUtils.degToRad(38);
const FOV = 32;


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
  /** Lot outlines (Show lots). */
  private lots: THREE.Group | null = null;
  private lotsVisible = false;
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
  private frame = 0;

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
    this.scene.add(buildPlinth(half));

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
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Default view: the whole diorama in frame, pulled back further on tall (portrait) screens. */
  frameCamera() {
    const fit = EXTENT / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const distance = fit * (this.camera.aspect < 1.2 ? Math.min(2.0, 1.05 / this.camera.aspect) : 0.86);
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

  /** Replaces the terrain: the ground, the river water (if any), and `top`, its highest column in voxels. */
  setTerrain(ground: GeometryData, water: GeometryData | null, top: number) {
    this.remove(this.terrain);
    this.remove(this.water);
    this.terrainTop = top;
    this.terrain = new THREE.Mesh(toGeometry(ground), printMaterial(this.print, {}, this.look));
    this.terrain.customDepthMaterial = printDepthMaterial(this.print);
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this.water = null;
    if (water) {
      this.water = new THREE.Mesh(toGeometry(water), printMaterial(this.print, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
      this.water.receiveShadow = true;
      this.scene.add(this.water);
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
      group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, depthTest: false, transparent: true })));
    };
    dots(hubs.hubs.slice(0, 1), 0xffffff, 18, pin);
    dots(network.junctions, BLUEPRINT.cyan, 8, 2);
    // The street tiles the network was collapsed on: a faint square around every road tile.
    const crosses: number[] = [];
    const t = network.tiles.size / 2;
    for (const q of network.tiles.centers) {
      const y = heightAt(q.x, q.z) + 1;
      const x0 = q.x - half - t;
      const x1 = q.x - half + t;
      const z0 = q.z - half - t;
      const z1 = q.z - half + t;
      crosses.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
    }
    const crossGeometry = new THREE.BufferGeometry();
    crossGeometry.setAttribute("position", new THREE.Float32BufferAttribute(crosses, 3));
    group.add(new THREE.LineSegments(crossGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.35 })));
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
    group.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: BLUEPRINT.cyan, depthTest: false, transparent: true, opacity: 0.8 })));
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
   * Districts and lots: the district map as a texture for Show districts, and the lot outlines (in
   * their district's color, with a tick on the street side) for Show lots. `heightAt` gives the
   * ground's top at a column, in voxels.
   */
  setDistricts(districts: Districts, heightAt: (x: number, z: number) => number) {
    const data = Uint8Array.from(districts.district, (d) => (d === NO_DISTRICT ? 0 : d + 1));
    this.look.uDistricts.value?.dispose();
    const texture = new THREE.DataTexture(data, districts.cells, districts.cells, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    this.look.uDistricts.value = texture;

    if (this.lots) {
      this.lots.traverse((o) => {
        if (o instanceof THREE.LineSegments || o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      this.scene.remove(this.lots);
    }
    const half = WORLD_SIZE / 2;
    const position: number[] = [];
    const color: number[] = [];
    // Each lot is also filled, translucent, so the lots read at a glance.
    const fill: number[] = [];
    const fillColor: number[] = [];
    const tint = new THREE.Color();
    for (const lot of districts.lots) {
      tint.set(DISTRICTS[lot.district].color);
      const middle = { x: (lot.corners[0].x + lot.corners[2].x) / 2, z: (lot.corners[0].z + lot.corners[2].z) / 2 };
      const y = heightAt(middle.x, middle.z) + 2;
      const segment = (a: { x: number; z: number }, b: { x: number; z: number }) => {
        position.push(a.x - half, y, a.z - half, b.x - half, y, b.z - half);
        color.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      };
      for (let i = 0; i < 4; i++) segment(lot.corners[i], lot.corners[(i + 1) % 4]);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        fill.push(lot.corners[i].x - half, y - 0.5, lot.corners[i].z - half);
        fillColor.push(tint.r, tint.g, tint.b);
      }
      // The tick: from the middle of the front edge, a little way in.
      const front = { x: (lot.corners[0].x + lot.corners[1].x) / 2, z: (lot.corners[0].z + lot.corners[1].z) / 2 };
      segment(front, { x: front.x + (middle.x - front.x) * 0.3, z: front.z + (middle.z - front.z) * 0.3 });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    const fillGeometry = new THREE.BufferGeometry();
    fillGeometry.setAttribute("position", new THREE.Float32BufferAttribute(fill, 3));
    fillGeometry.setAttribute("color", new THREE.Float32BufferAttribute(fillColor, 3));
    this.lots = new THREE.Group();
    this.lots.add(new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide })));
    this.lots.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })));
    this.lots.traverse((o) => (o.renderOrder = 10));
    this.lots.visible = this.lotsVisible;
    this.scene.add(this.lots);
  }

  setShowDistricts(on: boolean) {
    this.look.uShowDistricts.value = on ? 1 : 0;
  }

  setShowLots(on: boolean) {
    this.lotsVisible = on;
    if (this.lots) this.lots.visible = on;
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
   * How far the terrain is printed, 0 (nothing above the plinth) to 1 (finished). Printing rises
   * one whole voxel layer at a time, so every step shows a real layer of blocks.
   */
  setPrint(t: number) {
    this.print.uPrintY.value = t >= 1 ? 1e5 : Math.floor(BASE + t * (this.terrainTop + 1 - BASE));
  }

  private resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
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
