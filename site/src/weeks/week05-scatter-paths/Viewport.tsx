import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HUB_HEIGHT, HUB_OFFSET, buildRibbon, createAssetGeometries, createSprite, type AssetGeometries } from "./assets";
import { GRID, WORLD_SIZE } from "./config";
import { MAX_PARTICLES, MAX_TRAIL, MODE_STYLE, ParticleSim, windAt } from "./particles";
import type { PathsResult } from "./paths";
import type { Instance, LayerResult } from "./scatter";
import { heightAt, type Heightmap } from "./terrain";
import { writeTerrainColors } from "./terrainColors";
import type { LayerId, Week05State } from "./types";

const BACKGROUND = "#0a0f17";
const CAMERA_POSITION = new THREE.Vector3(17, 15, 19);
const CAMERA_TARGET = new THREE.Vector3(0, 1, 0);
const FIELD_ARROWS = 13;

/** Scene colours for the assets (STYLE_GUIDE section 3.3): low or flat tint, then high or steep tint. */
const TINTS: Record<Exclude<LayerId, "windmills">, [string, string]> = {
  trees: ["#2f6f5e", "#a3b86c"],
  bushes: ["#2f5f50", "#7a9a5a"],
  rocks: ["#5b5866", "#9a96a6"],
};

/** World size of each asset at size 1, relative to its geometry. */
const ASSET_SIZE: Record<LayerId, number> = { trees: 0.6, bushes: 0.65, rocks: 0.8, windmills: 1 };

function frameCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
  const pullBack = camera.aspect < 1.2 ? Math.min(1.9, 1.2 / camera.aspect) : 1;
  camera.position.copy(CAMERA_POSITION).sub(CAMERA_TARGET).multiplyScalar(pullBack).add(CAMERA_TARGET);
  controls.target.copy(CAMERA_TARGET);
  controls.update();
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpQuat = new THREE.Quaternion();
const tmpSpin = new THREE.Quaternion();
const tmpUp = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpMatrix = new THREE.Matrix4();

function instanceMatrix(instance: Instance, size: number, out: THREE.Matrix4): THREE.Matrix4 {
  tmpQuat.setFromUnitVectors(UP, tmpUp.set(...instance.up));
  tmpQuat.multiply(tmpSpin.setFromAxisAngle(UP, instance.spin));
  return out.compose(tmpPos.set(instance.x, instance.y, instance.z), tmpQuat, tmpScale.setScalar(instance.scale * size));
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  assets: AssetGeometries;
  terrain: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  materials: Record<string, THREE.Material>;
  /** Scatter and path meshes, rebuilt when their inputs change. */
  scatterGroup: THREE.Group;
  pathGroup: THREE.Group;
  windmills: { tower: THREE.InstancedMesh; blades: THREE.InstancedMesh; instances: Instance[] } | null;
  sim: ParticleSim;
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  trails: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  arrows: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}

interface ViewportProps {
  state: Week05State;
  map: Heightmap;
  paths: PathsResult;
  scatter: Record<LayerId, LayerResult>;
  /** Bumped by the Frame button. */
  frameToken: number;
}

function disposeGroup(group: THREE.Group, shared: Set<THREE.BufferGeometry>) {
  for (const child of [...group.children]) {
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      if (!shared.has(child.geometry)) child.geometry.dispose();
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
    group.remove(child);
  }
}

export default function Viewport({ state, map, paths, scatter, frameToken }: ViewportProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const refs = useRef<SceneRefs | null>(null);
  // The animation loop reads the latest inputs from here, so it never restarts.
  const live = useRef({ state, map });
  live.current = { state, map };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    scene.fog = new THREE.Fog(BACKGROUND, 38, 75);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Drag to orbit, scroll to zoom, right-drag to pan.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI * 0.48;

    scene.add(new THREE.HemisphereLight("#aac4dd", "#0a0f17", 1.1));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(10, 14, 6);
    scene.add(sun);

    // Terrain: one vertex per heightmap sample, coloured per vertex by the chosen view.
    const terrainGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, GRID - 1, GRID - 1).rotateX(-Math.PI / 2);
    terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(GRID * GRID * 3), 3));
    const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }));
    scene.add(terrain);

    const materials: Record<string, THREE.Material> = {
      trunk: new THREE.MeshStandardMaterial({ color: "#4a3f3a", roughness: 1 }),
      foliage: new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      windmill: new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.6, flatShading: true }),
      road: new THREE.MeshStandardMaterial({ color: "#253041", roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
      water: new THREE.MeshStandardMaterial({ color: "#1a528c", emissive: "#0b2440", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 }),
      pole: new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.7 }),
      bulb: new THREE.MeshBasicMaterial({ color: "#22d3ee" }),
    };

    const scatterGroup = new THREE.Group();
    const pathGroup = new THREE.Group();
    scene.add(scatterGroup, pathGroup);

    // Particles: positions are shared with the simulation's typed array, so a step is one upload.
    const sim = new ParticleSim();
    const sprite = createSprite();
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(sim.positions, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(
      pointsGeometry,
      new THREE.PointsMaterial({ map: sprite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }),
    );
    points.frustumCulled = false;

    const trailVertices = MAX_PARTICLES * (MAX_TRAIL - 1) * 2;
    const trailsGeometry = new THREE.BufferGeometry();
    trailsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(trailVertices * 3), 3).setUsage(THREE.DynamicDrawUsage));
    trailsGeometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(trailVertices * 3), 3));
    const trails = new THREE.LineSegments(
      trailsGeometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    trails.frustumCulled = false;

    // Field arrows: a shaft and two head strokes each.
    const arrowsGeometry = new THREE.BufferGeometry();
    arrowsGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FIELD_ARROWS * FIELD_ARROWS * 6 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const arrows = new THREE.LineSegments(arrowsGeometry, new THREE.LineBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.55 }));
    arrows.frustumCulled = false;
    scene.add(points, trails, arrows);

    const r: SceneRefs = {
      renderer,
      scene,
      camera,
      controls,
      assets: createAssetGeometries(),
      terrain,
      materials,
      scatterGroup,
      pathGroup,
      windmills: null,
      sim,
      points,
      trails,
      arrows,
    };
    refs.current = r;

    const resize = () => {
      camera.aspect = Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight));
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();
    frameCamera(camera, controls);

    const clock = new THREE.Clock();
    const wind = [0, 0];
    let time = 0;
    let bladeAngle = 0;
    let frameId = 0;
    const animate = () => {
      const dt = Math.min(0.05, clock.getDelta());
      time += dt;
      const { state: s, map: m } = live.current;
      const p = s.particles;

      // Particles.
      const on = p.mode !== "off";
      points.visible = on;
      trails.visible = on && p.trails;
      if (on) {
        sim.step(dt, time, p, m);
        const count = Math.min(p.count, MAX_PARTICLES);
        pointsGeometry.setDrawRange(0, count);
        pointsGeometry.attributes.position.needsUpdate = true;
        if (p.trails) {
          const used = sim.writeTrails(trailsGeometry.attributes.position.array as Float32Array, count, p.trailLength);
          trailsGeometry.setDrawRange(0, used);
          trailsGeometry.attributes.position.needsUpdate = true;
        }
      }

      // The vector field, sampled on a grid above the terrain.
      arrows.visible = p.showField;
      if (p.showField) {
        const out = arrowsGeometry.attributes.position.array as Float32Array;
        let k = 0;
        const put = (x: number, y: number, z: number) => {
          out[k++] = x;
          out[k++] = y;
          out[k++] = z;
        };
        for (let j = 0; j < FIELD_ARROWS; j++) {
          for (let i = 0; i < FIELD_ARROWS; i++) {
            const x = -WORLD_SIZE / 2 + ((i + 0.5) * WORLD_SIZE) / FIELD_ARROWS;
            const z = -WORLD_SIZE / 2 + ((j + 0.5) * WORLD_SIZE) / FIELD_ARROWS;
            const y = heightAt(m, x, z) + 1.4;
            windAt(p, x, z, time, wind);
            const speed = Math.hypot(wind[0], wind[1]) || 1;
            const len = Math.min(1.3, 0.35 + speed * 0.35);
            const dx = (wind[0] / speed) * len;
            const dz = (wind[1] / speed) * len;
            const tx = x + dx;
            const tz = z + dz;
            put(x, y, z);
            put(tx, y, tz);
            // Head strokes: back from the tip, turned ±30°.
            put(tx, y, tz);
            put(tx - (dx * 0.87 - dz * 0.5) * 0.3, y, tz - (dz * 0.87 + dx * 0.5) * 0.3);
            put(tx, y, tz);
            put(tx - (dx * 0.87 + dz * 0.5) * 0.3, y, tz - (dz * 0.87 - dx * 0.5) * 0.3);
          }
        }
        arrowsGeometry.attributes.position.needsUpdate = true;
      }

      // Windmills turn to face the base wind and spin with its strength.
      const mills = r.windmills;
      if (mills) {
        const angle = (p.windDirection * Math.PI) / 180;
        const yaw = Math.atan2(Math.cos(angle), Math.sin(angle));
        bladeAngle -= dt * p.windStrength * 2.2;
        const facing = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
        const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bladeAngle);
        const hub = new THREE.Vector3();
        mills.instances.forEach((mill, i) => {
          tmpScale.setScalar(mill.scale);
          tmpPos.set(mill.x, mill.y, mill.z);
          mills.tower.setMatrixAt(i, tmpMatrix.compose(tmpPos, facing, tmpScale));
          hub.set(0, HUB_HEIGHT, HUB_OFFSET + 0.06).multiplyScalar(mill.scale).applyQuaternion(facing).add(tmpPos);
          mills.blades.setMatrixAt(i, tmpMatrix.compose(hub, tmpQuat.copy(facing).multiply(spin), tmpScale));
        });
        mills.tower.instanceMatrix.needsUpdate = true;
        mills.blades.instanceMatrix.needsUpdate = true;
      }

      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      const shared = new Set(Object.values(r.assets));
      disposeGroup(scatterGroup, shared);
      disposeGroup(pathGroup, shared);
      shared.forEach((g) => g.dispose());
      terrainGeometry.dispose();
      terrain.material.dispose();
      Object.values(materials).forEach((m) => m.dispose());
      pointsGeometry.dispose();
      points.material.dispose();
      trailsGeometry.dispose();
      trails.material.dispose();
      arrowsGeometry.dispose();
      arrows.material.dispose();
      sprite.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      refs.current = null;
    };
  }, []);

  // Terrain shape: heights straight from the (deformed) heightmap.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const position = r.terrain.geometry.attributes.position;
    for (let v = 0; v < GRID * GRID; v++) position.setY(v, map.heights[v]);
    position.needsUpdate = true;
    r.terrain.geometry.computeVertexNormals();
    r.terrain.geometry.computeBoundingSphere();
  }, [map]);

  // Terrain colour: depends on the view and, for the mask, on the selected layer's rules.
  const mask = state.terrain.view === "mask";
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const color = r.terrain.geometry.attributes.color;
    writeTerrainColors(color.array as Float32Array, map, paths, state);
    color.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, paths, state.terrain.view, mask && state.layer, mask && state.layers[state.layer], mask && state.paths]);

  // Paths: road deck, river water and the lamp posts scattered along the road.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const shared = new Set(Object.values(r.assets));
    disposeGroup(r.pathGroup, shared);
    const deformed = state.paths.deform;
    if (paths.river) r.pathGroup.add(new THREE.Mesh(buildRibbon(paths.river, map, deformed ? 1.25 : 1, deformed, deformed ? 0 : 0.04), r.materials.water));
    if (paths.road) r.pathGroup.add(new THREE.Mesh(buildRibbon(paths.road, map, 1, false, 0.04), r.materials.road));
    if (paths.lamps.length > 0) {
      const poles = new THREE.InstancedMesh(r.assets.pole, r.materials.pole, paths.lamps.length);
      const bulbs = new THREE.InstancedMesh(r.assets.bulb, r.materials.bulb, paths.lamps.length);
      paths.lamps.forEach((lamp, i) => {
        tmpMatrix.makeTranslation(lamp.x, lamp.y, lamp.z);
        poles.setMatrixAt(i, tmpMatrix);
        bulbs.setMatrixAt(i, tmpMatrix);
      });
      r.pathGroup.add(poles, bulbs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, map]);

  // Scatter: one instanced mesh per asset part, tinted per copy from the terrain data.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const shared = new Set(Object.values(r.assets));
    disposeGroup(r.scatterGroup, shared);
    r.windmills = null;
    const color = new THREE.Color();
    const low = new THREE.Color();
    const high = new THREE.Color();

    const add = (layer: LayerId, geometry: THREE.BufferGeometry, material: THREE.Material, tint?: [string, string]) => {
      const instances = scatter[layer].instances;
      if (instances.length === 0) return null;
      const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
      if (tint) {
        low.set(tint[0]);
        high.set(tint[1]);
      }
      instances.forEach((instance, i) => {
        mesh.setMatrixAt(i, instanceMatrix(instance, ASSET_SIZE[layer], tmpMatrix));
        if (tint) mesh.setColorAt(i, color.copy(low).lerp(high, instance.tint).multiplyScalar(0.85 + instance.jitter * 0.3));
      });
      mesh.computeBoundingSphere();
      r.scatterGroup.add(mesh);
      return mesh;
    };

    add("trees", r.assets.trunk, r.materials.trunk);
    add("trees", r.assets.canopy, r.materials.foliage, TINTS.trees);
    add("bushes", r.assets.bush, r.materials.foliage, TINTS.bushes);
    add("rocks", r.assets.rock, r.materials.rock, TINTS.rocks);
    const mills = scatter.windmills.instances;
    const tower = add("windmills", r.assets.tower, r.materials.windmill);
    const blades = add("windmills", r.assets.blades, r.materials.windmill);
    if (tower && blades) {
      // The animation loop sets their matrices every frame, so skip culling on stale bounds.
      tower.frustumCulled = false;
      blades.frustumCulled = false;
      r.windmills = { tower, blades, instances: mills };
    }
  }, [scatter]);

  // Particles: a new mode or terrain starts the simulation over.
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    r.sim.reset(state.particles.mode, map);
    if (state.particles.mode === "off") return;
    const style = MODE_STYLE[state.particles.mode];
    r.points.material.color.set(style.color);
    r.points.material.size = style.size;
    r.points.material.opacity = style.opacity;
    r.trails.material.opacity = { rain: 0.4, wind: 0.7, clouds: 0.15 }[state.particles.mode];
  }, [state.particles.mode, map]);

  // Trail colours fade from the particle's colour to black (invisible with additive blending).
  useEffect(() => {
    const r = refs.current;
    if (!r || state.particles.mode === "off") return;
    const base = new THREE.Color(MODE_STYLE[state.particles.mode].color);
    const colors = r.trails.geometry.attributes.color.array as Float32Array;
    const length = state.particles.trailLength;
    const count = Math.min(state.particles.count, MAX_PARTICLES);
    let v = 0;
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < length - 1; k++) {
        for (const fade of [1 - k / (length - 1), 1 - (k + 1) / (length - 1)]) {
          colors[v * 3] = base.r * fade;
          colors[v * 3 + 1] = base.g * fade;
          colors[v * 3 + 2] = base.b * fade;
          v++;
        }
      }
    }
    r.trails.geometry.attributes.color.needsUpdate = true;
  }, [state.particles.mode, state.particles.count, state.particles.trailLength]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    frameCamera(r.camera, r.controls);
  }, [frameToken]);

  return <div className="absolute inset-0 overflow-hidden rounded-2xl bg-stage [&>canvas]:block [&>canvas]:!h-full [&>canvas]:!w-full" ref={mountRef} />;
}
