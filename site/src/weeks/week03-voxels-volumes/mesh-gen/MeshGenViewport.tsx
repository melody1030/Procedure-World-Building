import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { WORLD_SIZE } from "../constants";
import { useDebouncedEffect } from "../useDebouncedEffect";
import { TEST_FIELD } from "./fields";
import { applyIso, buildVolume, generateMesh, samplePos } from "./meshers";
import type { MeshResult } from "./meshers";
import { MESH_RESOLUTION, MESH_STEPS } from "./types";
import type { MeshGenParams, MeshStats } from "./types";

const MAX_VOXEL_INSTANCES = 60_000;
const MESH_COLOR = 0x7fb5d6;

interface SceneRefs {
  mesh: THREE.Mesh;
  mainLines: THREE.LineSegments;
  highlight: THREE.Mesh;
  exposedMesh: THREE.Mesh;
  exposedLines: THREE.LineSegments;
  voxels: THREE.InstancedMesh;
  dummy: THREE.Object3D;
  samplePoints: THREE.Points;
  cellLines: THREE.LineSegments;
  crossPoints: THREE.Points;
  normalLines: THREE.LineSegments;
  vertexPoints: THREE.Points;
  /** Set at each rebuild so draw ranges always match the geometry currently on screen. */
  built: { faces: number; indicesPerFace: number; linesPerFace: number };
}

function pointsGeometry(positions: ArrayLike<number>, colors?: ArrayLike<number>): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  if (colors) geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  return geometry;
}

function cellEdgeGeometry(cells: number[], size: number): THREE.BufferGeometry {
  const corners = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const out: number[] = [];
  for (let c = 0; c < cells.length; c += 3) {
    for (const [a, b] of edges) {
      out.push(
        cells[c] + corners[a][0] * size, cells[c + 1] + corners[a][1] * size, cells[c + 2] + corners[a][2] * size,
        cells[c] + corners[b][0] * size, cells[c + 1] + corners[b][1] * size, cells[c + 2] + corners[b][2] * size,
      );
    }
  }
  return pointsGeometry(out);
}

function normalLineGeometry(crossings: number[], normals: number[], length: number): THREE.BufferGeometry {
  const out: number[] = [];
  for (let i = 0; i < normals.length; i += 3) {
    out.push(crossings[i], crossings[i + 1], crossings[i + 2]);
    out.push(crossings[i] + normals[i] * length, crossings[i + 1] + normals[i + 1] * length, crossings[i + 2] + normals[i + 2] * length);
  }
  return pointsGeometry(out);
}

/** Two geometries sharing the same vertex/index buffers but with independent draw ranges. */
function meshGeometries(result: MeshResult): { main: THREE.BufferGeometry; outline: THREE.BufferGeometry; highlight: THREE.BufferGeometry } {
  const position = new THREE.BufferAttribute(result.positions, 3);
  const index = new THREE.BufferAttribute(result.indices, 1);
  const main = new THREE.BufferGeometry();
  main.setAttribute("position", position);
  main.setIndex(index);
  const highlight = new THREE.BufferGeometry();
  highlight.setAttribute("position", position);
  highlight.setIndex(index);
  const outline = new THREE.BufferGeometry();
  outline.setAttribute("position", position);
  outline.setIndex(new THREE.BufferAttribute(result.lineIndices, 1));
  return { main, outline, highlight };
}

function swapGeometry(object: THREE.Mesh | THREE.Points | THREE.LineSegments, geometry: THREE.BufferGeometry) {
  object.geometry.dispose();
  object.geometry = geometry;
}

function applyStep(refs: SceneRefs, params: MeshGenParams) {
  const steps = MESH_STEPS[params.method];
  const kind = params.stepMode ? steps[Math.min(params.step, steps.length - 1)].kind : null;
  const full = kind === null;
  const { faces, indicesPerFace, linesPerFace } = refs.built;

  const built = full ? faces : Math.round(params.progress * faces);
  const showBuild = full || kind === "build";
  refs.mesh.visible = showBuild && built > 0;
  refs.mesh.geometry.setDrawRange(0, built * indicesPerFace);
  refs.mainLines.visible = !full && kind === "build" && built > 0;
  refs.mainLines.geometry.setDrawRange(0, built * linesPerFace);
  refs.highlight.visible = !full && kind === "build" && built > 0 && built < faces;
  refs.highlight.geometry.setDrawRange(Math.max(built - 1, 0) * indicesPerFace, indicesPerFace);

  refs.exposedMesh.visible = kind === "exposed";
  refs.exposedLines.visible = kind === "exposed";
  refs.samplePoints.visible = kind === "samples";
  refs.cellLines.visible = kind === "cells";
  refs.crossPoints.visible = kind === "crossings" || kind === "vertices";
  refs.normalLines.visible = kind === "crossings";
  refs.vertexPoints.visible = kind === "vertices" || kind === "build";
}

export function MeshGenViewport({ params, onStats }: { params: MeshGenParams; onStats: (stats: MeshStats) => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<SceneRefs | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f17);
    scene.fog = new THREE.Fog(0x0a0f17, 30, 68);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(12, 10, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xaac4dd, 0.45));
    const key = new THREE.DirectionalLight(0xfff4e0, 3.0);
    key.position.set(15, 30, 15);
    const fill = new THREE.DirectionalLight(0x8fb8d9, 0.9);
    fill.position.set(-14, 10, -12);
    scene.add(key, fill);

    const boxGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(WORLD_SIZE, WORLD_SIZE, WORLD_SIZE));
    const boxMaterial = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.2 });
    scene.add(new THREE.LineSegments(boxGeometry, boxMaterial));

    const meshMaterial = new THREE.MeshStandardMaterial({
      color: MESH_COLOR,
      roughness: 0.7,
      metalness: 0.05,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x0a1220, transparent: true, opacity: 0.6 });
    const cellMaterial = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.4 });
    const normalMaterial = new THREE.LineBasicMaterial({ color: 0xfb923c });
    const samplePointMaterial = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.9 });
    const crossPointMaterial = new THREE.PointsMaterial({ size: 0.2, color: 0xf472b6 });
    const vertexPointMaterial = new THREE.PointsMaterial({ size: 0.26, color: 0xa3e635 });

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), meshMaterial);
    const mainLines = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMaterial);
    const highlight = new THREE.Mesh(new THREE.BufferGeometry(), highlightMaterial);
    const exposedMesh = new THREE.Mesh(new THREE.BufferGeometry(), meshMaterial);
    const exposedLines = new THREE.LineSegments(new THREE.BufferGeometry(), outlineMaterial);
    const samplePoints = new THREE.Points(new THREE.BufferGeometry(), samplePointMaterial);
    const cellLines = new THREE.LineSegments(new THREE.BufferGeometry(), cellMaterial);
    const crossPoints = new THREE.Points(new THREE.BufferGeometry(), crossPointMaterial);
    const normalLines = new THREE.LineSegments(new THREE.BufferGeometry(), normalMaterial);
    const vertexPoints = new THREE.Points(new THREE.BufferGeometry(), vertexPointMaterial);
    scene.add(mesh, mainLines, highlight, exposedMesh, exposedLines, samplePoints, cellLines, crossPoints, normalLines, vertexPoints);

    const voxelGeometry = new THREE.BoxGeometry(1, 1, 1);
    const voxelMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1, depthWrite: false });
    const voxels = new THREE.InstancedMesh(voxelGeometry, voxelMaterial, MAX_VOXEL_INSTANCES);
    voxels.count = 0;
    scene.add(voxels);

    const geometryOwners = [mesh, mainLines, highlight, exposedMesh, exposedLines, samplePoints, cellLines, crossPoints, normalLines, vertexPoints];
    const materials = [
      meshMaterial, highlightMaterial, outlineMaterial, cellMaterial, normalMaterial,
      samplePointMaterial, crossPointMaterial, vertexPointMaterial, voxelMaterial,
    ];

    refsRef.current = {
      mesh, mainLines, highlight, exposedMesh, exposedLines, voxels, dummy: new THREE.Object3D(),
      samplePoints, cellLines, crossPoints, normalLines, vertexPoints,
      built: { faces: 0, indicesPerFace: 6, linesPerFace: 8 },
    };

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      for (const object of geometryOwners) object.geometry.dispose();
      for (const material of materials) material.dispose();
      voxelGeometry.dispose();
      voxels.dispose();
      boxGeometry.dispose();
      boxMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      refsRef.current = null;
    };
  }, []);

  useDebouncedEffect(
    () => {
      const refs = refsRef.current;
      if (!refs) return;
      const { voxels, dummy } = refs;

      const vol = applyIso(buildVolume(TEST_FIELD, MESH_RESOLUTION), params.options.iso);
      const result = generateMesh(params.method, vol, params.options);
      const isTriangles = params.method === "marching";

      const main = meshGeometries(result);
      swapGeometry(refs.mesh, main.main);
      swapGeometry(refs.mainLines, main.outline);
      swapGeometry(refs.highlight, main.highlight);
      refs.built = { faces: result.faces, indicesPerFace: isTriangles ? 3 : 6, linesPerFace: isTriangles ? 6 : 8 };

      const culled = result.steps.culled;
      if (culled) {
        const exposed = meshGeometries(culled);
        swapGeometry(refs.exposedMesh, exposed.main);
        swapGeometry(refs.exposedLines, exposed.outline);
        exposed.highlight.dispose();
      } else {
        swapGeometry(refs.exposedMesh, new THREE.BufferGeometry());
        swapGeometry(refs.exposedLines, new THREE.BufferGeometry());
      }

      const samplePositions: number[] = [];
      const sampleColors: number[] = [];
      let filled = 0;
      const isInside = (i: number, j: number, k: number) =>
        i >= 0 && j >= 0 && k >= 0 && i < MESH_RESOLUTION && j < MESH_RESOLUTION && k < MESH_RESOLUTION &&
        vol.values[i + MESH_RESOLUTION * (j + MESH_RESOLUTION * k)] < 0;
      for (let k = 0; k < MESH_RESOLUTION; k++) {
        for (let j = 0; j < MESH_RESOLUTION; j++) {
          for (let i = 0; i < MESH_RESOLUTION; i++) {
            const x = samplePos(vol, i);
            const y = samplePos(vol, j);
            const z = samplePos(vol, k);
            const inside = isInside(i, j, k);
            // Outside samples far from the volume are omitted so the boundary stays readable.
            if (inside) {
              samplePositions.push(x, y, z);
              sampleColors.push(0.13, 0.83, 0.93);
            } else if (isInside(i - 1, j, k) || isInside(i + 1, j, k) || isInside(i, j - 1, k) || isInside(i, j + 1, k) || isInside(i, j, k - 1) || isInside(i, j, k + 1)) {
              samplePositions.push(x, y, z);
              sampleColors.push(0.5, 0.56, 0.66);
            }
            if (!inside) continue;
            if (filled < MAX_VOXEL_INSTANCES) {
              dummy.position.set(x, y, z);
              dummy.scale.setScalar(vol.cell);
              dummy.updateMatrix();
              voxels.setMatrixAt(filled, dummy.matrix);
            }
            filled++;
          }
        }
      }
      voxels.count = Math.min(filled, MAX_VOXEL_INSTANCES);
      voxels.instanceMatrix.needsUpdate = true;

      swapGeometry(refs.samplePoints, pointsGeometry(samplePositions, sampleColors));
      swapGeometry(refs.cellLines, cellEdgeGeometry(result.steps.cells, vol.cell));
      swapGeometry(refs.crossPoints, pointsGeometry(result.steps.crossings));
      swapGeometry(refs.normalLines, normalLineGeometry(result.steps.crossings, result.steps.normals, vol.cell));
      swapGeometry(refs.vertexPoints, pointsGeometry(result.steps.vertices));

      applyStep(refs, paramsRef.current);

      onStats({
        vertices: result.positions.length / 3,
        triangles: result.indices.length / 3,
        faces: result.faces,
        faceKind: isTriangles ? "triangles" : "quads",
        ms: result.ms,
        voxels: filled,
      });
    },
    [params.method, params.options],
    90,
  );

  useEffect(() => {
    const refs = refsRef.current;
    if (refs) applyStep(refs, params);
  }, [params.stepMode, params.step, params.progress, params.method]);

  return <div ref={mountRef} className="h-full w-full" />;
}
