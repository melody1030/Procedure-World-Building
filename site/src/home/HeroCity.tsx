import { useEffect, useRef } from "react";
import * as THREE from "three";
import { sampleNoise } from "../weeks/week02-noise-grid/noise";

/**
 * Homepage hero: a small "Blueprint City" (see docs/concept.md). A voxel island of terraced
 * cliffs on dark water grows a neon city. On load the buildings appear as cyan wireframe
 * outlines first, then "print" block by block, waterfront first and downtown towers last;
 * afterwards the outlines stay as a faint holographic trace.
 */

const PAGE_COLOR = 0x070b12; // bg-page, so fog fades the scene into the page
const VOX = 0.32; // voxel size in world units
const GRID_W = 36;
const GRID_D = 26;
const SEED = 11;
const BUILD_SECONDS = 3.2; // spread of building start times during the print animation
const BLOCK_STAGGER = 0.05; // seconds between the blocks of one building
const POP_SECONDS = 0.22; // how long a single block takes to pop in

const WINDOW_PALETTE: [number, number][] = [
  [0x22d3ee, 0.42], // cyan
  [0xcff6ff, 0.26], // ice white
  [0xe879f9, 0.16], // magenta
  [0xfbbf24, 0.16], // amber
];

/** Deterministic random numbers, so the same city grows on every visit. */
function createRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickColor(random: () => number): number {
  let r = random();
  for (const [color, weight] of WINDOW_PALETTE) {
    if ((r -= weight) <= 0) return color;
  }
  return WINDOW_PALETTE[0][0];
}

const noise = (x: number, z: number, scale: number, seed: number) =>
  sampleNoise(x, z, { noiseType: "perlin", scale, octaves: 3, persistence: 0.5, seed });

/** How a building's windows are lit, chosen once per building so façades look consistent. */
interface WindowStyle {
  kind: "bands" | "grid";
  /** Chance that a given window (or band) is lit. */
  lit: number;
  color: number;
  accent: number;
}

function pickWindowStyle(random: () => number): WindowStyle {
  const roll = random();
  const color = pickColor(random);
  const accent = pickColor(random);
  if (roll < 0.3) return { kind: "bands", lit: 0.85, color, accent }; // offices: lit floor strips
  if (roll < 0.8) return { kind: "grid", lit: 0.7, color, accent }; // housing: window per voxel
  return { kind: "grid", lit: 0.25, color, accent }; // mostly dark
}

/** One instance to place: final position and scale, colour, and when it appears. */
interface Block {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  delay: number;
}

interface CityPlan {
  ground: Block[];
  buildings: Block[];
  lights: Block[];
  outlines: number[]; // line-segment vertex positions for the blueprint boxes
  finishTime: number;
}

/** Generates the whole city: terrain columns, buildings, lights and blueprint outlines. */
function planCity(): CityPlan {
  const random = createRandom(SEED);
  const worldX = (i: number) => (i - GRID_W / 2 + 0.5) * VOX;
  const worldZ = (j: number) => (j - GRID_D / 2 + 0.5) * VOX;

  // Terrain: an island (noisy ellipse) of terraces two blocks tall, higher towards the back,
  // split by a winding canal at the front.
  const heights: number[][] = [];
  for (let i = 0; i < GRID_W; i++) {
    heights[i] = [];
    for (let j = 0; j < GRID_D; j++) {
      const nx = (i / (GRID_W - 1)) * 2 - 1;
      const nz = (j / (GRID_D - 1)) * 2 - 1;
      const r = Math.sqrt(nx * nx + nz * nz * 1.15);
      const coast = 0.8 + (noise(i, j, 0.12, SEED) - 0.5) * 0.4;
      const canal = nz > -0.5 && Math.abs(nx - 0.2 - Math.sin(nz * 2.2) * 0.14) < 0.075;
      if (r > coast || canal) {
        heights[i][j] = 0;
        continue;
      }
      const back = (1 - nz) / 2; // 1 at the back, 0 at the front
      const e = 0.3 + back * 1.0 + (noise(i + 50, j + 50, 0.18, SEED) - 0.5) * 0.7 - Math.max(0, r - coast + 0.25) * 2;
      heights[i][j] = Math.max(1, Math.min(4, Math.round(e * 3))) * 2;
    }
  }

  const ground: Block[] = [];
  for (let i = 0; i < GRID_W; i++) {
    for (let j = 0; j < GRID_D; j++) {
      const h = heights[i][j];
      for (let k = 0; k < h; k++) {
        const top = k === h - 1;
        const shade = 0.85 + random() * 0.3;
        const base = new THREE.Color(top ? 0x44587a : 0x2c3b56).multiplyScalar(shade);
        ground.push({ x: worldX(i), y: (k + 0.5) * VOX, z: worldZ(j), sx: VOX, sy: VOX, sz: VOX, color: base.getHex(), delay: 0 });
      }
    }
  }

  // Buildings grow outward from the waterfront, then upward towards downtown (concept §4).
  const start = { i: GRID_W * 0.25, j: GRID_D * 0.92 };
  const downtown = { i: GRID_W * 0.45, j: GRID_D * 0.4 };
  const maxStartDist = Math.hypot(GRID_W, GRID_D) * 0.75;
  const buildings: Block[] = [];
  const lights: Block[] = [];
  const outlines: number[] = [];
  const towers: { ci: number; cj: number; w: number; d: number; ground: number; top: number; delay: number }[] = [];
  let finishTime = 0;

  const isStreet = (i: number, j: number) => i % 5 === 0 || j % 4 === 0;
  const occupied = heights.map((column) => column.map(() => false));
  // A footprint fits if every column in it is free, not a street, and on the same terrace.
  const fits = (i0: number, j0: number, w: number, d: number, g: number) => {
    for (let i = i0; i < i0 + w; i++) {
      for (let j = j0; j < j0 + d; j++) {
        if (i >= GRID_W || j >= GRID_D || heights[i][j] !== g || isStreet(i, j) || occupied[i][j]) return false;
      }
    }
    return true;
  };

  const addOutline = (x: number, z: number, hx: number, hz: number, y0: number, y1: number) => {
    const corners = [
      [x - hx, z - hz],
      [x + hx, z - hz],
      [x + hx, z + hz],
      [x - hx, z + hz],
    ];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c];
      const [bx, bz] = corners[(c + 1) % 4];
      outlines.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz, ax, y0, az, ax, y1, az);
    }
  };

  /** One box of voxel columns (i0..i0+w, j0..j0+d) from level k0 to k1 above its terrace (ground g). */
  interface Segment {
    i0: number;
    j0: number;
    w: number;
    d: number;
    g: number;
    k0: number;
    k1: number;
    delay: number;
    style: WindowStyle;
  }
  const segments: Segment[] = [];
  // Highest level of whatever stands on each column: the terrace, then any building on it.
  const columnTop = heights.map((column) => column.slice());
  const planSegment = (segment: Segment) => {
    segments.push(segment);
    for (let a = segment.i0; a < segment.i0 + segment.w; a++) {
      for (let b = segment.j0; b < segment.j0 + segment.d; b++) {
        columnTop[a][b] = Math.max(columnTop[a][b], segment.g + segment.k1);
      }
    }
  };
  // A wall is exposed at a level unless the neighbouring column (another building, a podium or a
  // cliff) rises past it there.
  const exposed = (i: number, j: number, level: number) =>
    i < 0 || j < 0 || i >= GRID_W || j >= GRID_D || columnTop[i][j] <= level;

  const emitSegment = ({ i0, j0, w, d, g, k0, k1, delay, style }: Segment) => {
    const groundTop = g * VOX;
    const x = worldX(i0) + ((w - 1) * VOX) / 2;
    const z = worldZ(j0) + ((d - 1) * VOX) / 2;
    const hx = (w * VOX) / 2;
    const hz = (d * VOX) / 2;
    addOutline(x, z, hx, hz, groundTop + k0 * VOX, groundTop + k1 * VOX);

    // Each wall: its direction, its length in voxels, and the neighbouring column beside slot u.
    const faces: { fx: number; fz: number; length: number; neighbour: (u: number) => [number, number] }[] = [
      { fx: 1, fz: 0, length: d, neighbour: (u) => [i0 + w, j0 + u] },
      { fx: -1, fz: 0, length: d, neighbour: (u) => [i0 - 1, j0 + u] },
      { fx: 0, fz: 1, length: w, neighbour: (u) => [i0 + u, j0 + d] },
      { fx: 0, fz: -1, length: w, neighbour: (u) => [i0 + u, j0 - 1] },
    ];
    const wallX = hx - VOX * 0.03 + 0.004; // the block is inset by 0.03 voxels on each side
    const wallZ = hz - VOX * 0.03 + 0.004;
    const colorOf = () => (random() < 0.85 ? style.color : style.accent);

    for (let k = k0; k < k1; k++) {
      const blockDelay = delay + k * BLOCK_STAGGER;
      const y = groundTop + (k + 0.5) * VOX;
      const shade = 0.8 + random() * 0.4;
      // One merged block per level, slightly inset so neighbouring buildings stay distinct.
      buildings.push({ x, y, z, sx: w * VOX - VOX * 0.06, sy: VOX, sz: d * VOX - VOX * 0.06, color: new THREE.Color(0x1c2944).multiplyScalar(shade).getHex(), delay: blockDelay });
      finishTime = Math.max(finishTime, blockDelay + POP_SECONDS);

      // Windows: one tidy row per floor, flush on the wall, one slot per voxel of façade, and only
      // where the wall is open to the outside. Bands light a whole floor; grids light single windows.
      for (const { fx, fz, length, neighbour } of faces) {
        const bandLit = random() < style.lit;
        for (let u = 0; u < length; u++) {
          if (!exposed(...neighbour(u), g + k)) continue;
          if (style.kind === "bands" ? !bandLit : random() > style.lit) continue;
          const along = (u - (length - 1) / 2) * VOX;
          const width = style.kind === "bands" ? VOX * 0.86 : VOX * 0.5;
          lights.push({
            x: x + fx * wallX + (fz ? along : 0),
            y,
            z: z + fz * wallZ + (fx ? along : 0),
            sx: fx ? 0.008 : width,
            sy: style.kind === "bands" ? VOX * 0.14 : VOX * 0.22,
            sz: fz ? 0.008 : width,
            color: style.kind === "bands" ? style.color : colorOf(),
            delay: blockDelay + 0.1,
          });
        }
      }
    }
  };

  for (let i = 0; i < GRID_W; i++) {
    for (let j = 0; j < GRID_D; j++) {
      const g = heights[i][j];
      if (g === 0 || occupied[i][j] || isStreet(i, j)) continue;
      const startDist = Math.hypot(i - start.i, j - start.j) / maxStartDist;

      const dist = Math.min(1, Math.hypot((i - downtown.i) / GRID_W, (j - downtown.j) / GRID_D) * 2.2);
      if (random() > 0.9 - dist * 0.5) continue; // leave some gaps: yards, plazas

      // Footprint: combined voxel columns, larger ones more likely downtown.
      const options: [number, number][] =
        random() < 0.3 + (1 - dist) * 0.35
          ? ([[3, 2], [2, 3], [2, 2], [2, 1], [1, 2]] as [number, number][]).sort(() => random() - 0.5)
          : random() < 0.3
            ? [[2, 1], [1, 2]]
            : [];
      const [w, d] = options.find(([fw, fd]) => fits(i, j, fw, fd, g)) ?? [1, 1];
      for (let a = i; a < i + w; a++) for (let b = j; b < j + d; b++) occupied[a][b] = true;

      const height = Math.max(1, Math.min(13, Math.round((1 + (1 - dist) ** 2 * 12) * (0.45 + random() * 0.75))));
      const delay = startDist * BUILD_SECONDS + (1 - dist) * 0.6 + random() * 0.25;
      const style = pickWindowStyle(random);

      // Large, tall buildings step back: a wide podium with a slimmer tower rising from a corner.
      let top = { i0: i, j0: j, w, d };
      if (w * d >= 4 && height >= 6 && random() < 0.65) {
        const podium = 2 + Math.floor(random() * 2);
        planSegment({ i0: i, j0: j, w, d, g, k0: 0, k1: podium, delay, style });
        const tw = Math.max(1, w - 1);
        const td = Math.max(1, d - 1);
        top = { i0: i + (random() < 0.5 ? 0 : w - tw), j0: j + (random() < 0.5 ? 0 : d - td), w: tw, d: td };
        planSegment({ ...top, g, k0: podium, k1: height, delay, style });
      } else {
        planSegment({ i0: i, j0: j, w, d, g, k0: 0, k1: height, delay, style });
      }

      const doneAt = delay + height * BLOCK_STAGGER;
      if (height >= 6) {
        towers.push({ ci: top.i0 + (top.w - 1) / 2, cj: top.j0 + (top.d - 1) / 2, w: top.w, d: top.d, ground: g, top: g + height, delay: doneAt });
      }
      // Red beacon on top of tall buildings.
      if (height >= 7) {
        const bx = worldX(top.i0) + ((top.w - 1) * VOX) / 2;
        const bz = worldZ(top.j0) + ((top.d - 1) * VOX) / 2;
        lights.push({ x: bx, y: (g + height) * VOX + 0.05, z: bz, sx: 0.07, sy: 0.07, sz: 0.07, color: 0xff4d6d, delay: doneAt + 0.2 });
      }
    }
  }

  // Windows are added only now, once every building exists, so walls against a neighbour stay dark.
  segments.forEach(emitSegment);

  // Sky bridges between nearby tall towers lined up in the same row or column.
  const bridgeBlocks: Block[] = [];
  let bridges = 0;
  for (let a = 0; a < towers.length && bridges < 6; a++) {
    for (let b = a + 1; b < towers.length && bridges < 6; b++) {
      const A = towers[a];
      const B = towers[b];
      const alongX = Math.abs(A.cj - B.cj) < 0.6; // same row: the bridge runs along x
      const alongZ = Math.abs(A.ci - B.ci) < 0.6;
      if (alongX === alongZ || random() > 0.5) continue;
      const gap = alongX ? Math.abs(A.ci - B.ci) - (A.w + B.w) / 2 : Math.abs(A.cj - B.cj) - (A.d + B.d) / 2;
      if (gap < 2 || gap > 6) continue;
      const level = Math.min(A.top, B.top) - 2;
      if (level <= Math.max(A.ground, B.ground) + 1) continue;
      // Centre the bridge between the two facing walls (towers may differ in width).
      const [near, far] = (alongX ? A.ci < B.ci : A.cj < B.cj) ? [A, B] : [B, A];
      const x = alongX ? worldX((near.ci + near.w / 2 + far.ci - far.w / 2) / 2) : worldX((A.ci + B.ci) / 2);
      const z = alongX ? worldZ((A.cj + B.cj) / 2) : worldZ((near.cj + near.d / 2 + far.cj - far.d / 2) / 2);
      const length = gap * VOX;
      const y = (level + 0.5) * VOX;
      const delay = Math.max(A.delay, B.delay) + 0.3;
      const bridge = { x, y, z, sx: alongX ? length : VOX * 0.5, sy: VOX * 0.35, sz: alongX ? VOX * 0.5 : length, color: 0x24324f, delay };
      buildings.push(bridge);
      bridgeBlocks.push(bridge);
      lights.push({ x, y: y - VOX * 0.2, z, sx: alongX ? length : 0.03, sy: 0.025, sz: alongX ? 0.03 : length, color: 0x22d3ee, delay: delay + 0.1 });
      finishTime = Math.max(finishTime, delay + POP_SECONDS);
      bridges++;
    }
  }

  // Drop windows where a bridge meets a tower wall, like any other wall with something against it.
  const coveredByBridge = (light: Block) =>
    bridgeBlocks.some((b) => Math.abs(light.x - b.x) < b.sx / 2 + 0.02 && Math.abs(light.y - b.y) < b.sy / 2 + light.sy / 2 && Math.abs(light.z - b.z) < b.sz / 2 + 0.02);
  const visibleLights = lights.filter((light) => !((light.sx === 0.008 || light.sz === 0.008) && coveredByBridge(light)));

  return { ground, buildings, lights: visibleLights, outlines, finishTime: Math.max(finishTime, BUILD_SECONDS) + 0.4 };
}

/** Writes every block's matrix (scaled by its current growth) and colour into an instanced mesh. */
function createInstanced(blocks: Block[], material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, blocks.length);
  // Instances span the whole island, far from the base box at the origin, so skip culling.
  mesh.frustumCulled = false;
  const color = new THREE.Color();
  blocks.forEach((block, index) => mesh.setColorAt(index, color.setHex(block.color)));
  return mesh;
}

const dummy = new THREE.Object3D();
function setGrowth(mesh: THREE.InstancedMesh, blocks: Block[], time: number) {
  for (let index = 0; index < blocks.length; index++) {
    const b = blocks[index];
    const t = Math.min(1, Math.max(0, (time - b.delay) / POP_SECONDS));
    const grow = t * t * (3 - 2 * t);
    dummy.position.set(b.x, b.y - (1 - grow) * b.sy * 0.5, b.z);
    dummy.scale.set(b.sx * grow || 1e-5, b.sy * grow || 1e-5, b.sz * grow || 1e-5);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export default function HeroCity() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const plan = planCity();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(PAGE_COLOR, 18, 34);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(-2.4, 7.4, 15.5);
    camera.lookAt(0.4, 1.9, -0.4);

    const world = new THREE.Group();
    world.rotation.y = -0.38; // three-quarter view of the island
    scene.add(world);

    const groundMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05, flatShading: true });
    const buildingMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2 });
    // Unlit, so windows and neon read as light sources against the dark city.
    const lightMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });

    const groundMesh = createInstanced(plan.ground, groundMaterial);
    const buildingMesh = createInstanced(plan.buildings, buildingMaterial);
    const lightMesh = createInstanced(plan.lights, lightMaterial);
    setGrowth(groundMesh, plan.ground, Infinity);
    world.add(groundMesh, buildingMesh, lightMesh);

    // Blueprint outlines of every building, bright while the city prints, faint afterwards.
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(plan.outlines, 3));
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    world.add(new THREE.LineSegments(outlineGeometry, outlineMaterial));

    // Dark, glossy water around the island, with the grid fading out beneath.
    const waterGeometry = new THREE.PlaneGeometry(40, 40);
    waterGeometry.rotateX(-Math.PI / 2);
    const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x06111e, roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0.92 });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.position.y = VOX * 0.7;
    world.add(water);
    const grid = new THREE.GridHelper(40, 60, 0x155e75, 0x0f2a3d);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.35;
    grid.position.y = VOX * 0.71;
    world.add(grid);

    scene.add(new THREE.AmbientLight(0x3a5282, 1.3));
    const moon = new THREE.DirectionalLight(0xb4d4ff, 1.8);
    moon.position.set(-6, 10, 7);
    scene.add(moon);
    const neonRim = new THREE.DirectionalLight(0xd946ef, 0.5);
    neonRim.position.set(8, 3, -6);
    scene.add(neonRim);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    // Window flicker: a few random windows dim briefly, then come back.
    const baseColors = plan.lights.map((light) => new THREE.Color(light.color));
    const dimmed = new Set<number>();
    let lastFlicker = 0;
    const flicker = (now: number) => {
      if (now - lastFlicker < 140) return;
      lastFlicker = now;
      for (const index of dimmed) lightMesh.setColorAt(index, baseColors[index]);
      dimmed.clear();
      for (let n = 0; n < 3; n++) {
        const index = Math.floor(Math.random() * plan.lights.length);
        dimmed.add(index);
        lightMesh.setColorAt(index, baseColors[index].clone().multiplyScalar(0.15));
      }
      if (lightMesh.instanceColor) lightMesh.instanceColor.needsUpdate = true;
    };

    let visible = true;
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    visibilityObserver.observe(mount);

    let frameId = 0;
    let built = false;
    const clock = new THREE.Clock();

    const showFinished = () => {
      setGrowth(buildingMesh, plan.buildings, Infinity);
      setGrowth(lightMesh, plan.lights, Infinity);
      outlineMaterial.opacity = 0.1;
      built = true;
    };

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!visible) return;
      const t = clock.getElapsedTime();
      if (!built) {
        setGrowth(buildingMesh, plan.buildings, t);
        setGrowth(lightMesh, plan.lights, t);
        // Outlines fade from blueprint-bright to a faint trace over the last second of the build.
        const fade = Math.min(1, Math.max(0, (t - plan.finishTime + 1) / 1));
        outlineMaterial.opacity = 0.5 - fade * 0.4;
        if (t > plan.finishTime) showFinished();
      } else {
        flicker(performance.now());
      }
      world.rotation.y = -0.38 + Math.sin(t * 0.07) * 0.1;
      renderer.render(scene, camera);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      renderer.render(scene, camera);
    });
    resizeObserver.observe(mount);
    resize();

    if (reducedMotion) {
      showFinished();
      renderer.render(scene, camera);
    } else {
      setGrowth(buildingMesh, plan.buildings, 0);
      setGrowth(lightMesh, plan.lights, 0);
      animate();
    }

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      for (const mesh of [groundMesh, buildingMesh, lightMesh]) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      [outlineGeometry, waterGeometry, grid.geometry].forEach((g) => g.dispose());
      [groundMaterial, buildingMaterial, lightMaterial, outlineMaterial, waterMaterial, gridMaterial].forEach((m) => m.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      // Soft edges so the scene dissolves into the page instead of ending in a box.
      className="h-full w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_55%,transparent_100%)]"
    />
  );
}
