import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { WORLD_SIZE } from "../constants";
import { useDebouncedEffect } from "../useDebouncedEffect";
import { buildLocalSdf, buildSdf, combineSdf } from "./sdfEngine";
import { computeLocalBounds, computeNodeBounds, unionBounds } from "./nodeBounds";
import { sampleVoxels } from "./voxelSampler";
import { createVoxelMesh, disposeVoxelMesh, fillVoxelMesh } from "./voxelInstancedMesh";
import type { VoxelMesh } from "./voxelInstancedMesh";
import { findNode } from "./treeLogic";
import type { CSGLabController } from "./state";

const RESULT_COLOR = 0x8fa6c9;
const HIGHLIGHT_COLOR = 0x22d3ee;

// Shapes can be moved anywhere inside this box; translation is clamped so nothing leaves it.
const MOVE_BOUND_XZ = WORLD_SIZE * 1.5;
const MOVE_BOUND_Y_MIN = -WORLD_SIZE / 2 + 0.25;
const MOVE_BOUND_Y_MAX = WORLD_SIZE * 1.2;
// Keeps a shape from being scaled down to (or past) zero, which would divide-by-zero in the SDF.
const MIN_SCALE = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface RootEntry {
  voxel: VoxelMesh;
}

function findRootIdForGroup(rootEntries: Map<string, RootEntry>, object: THREE.Object3D): string | null {
  for (const [id, entry] of rootEntries) {
    if (entry.voxel.group === object) return id;
  }
  return null;
}

interface CSGLabSceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  transformControls: TransformControls;
  rootEntries: Map<string, RootEntry>;
  /** A reusable voxel-only preview of what Apply would produce for the two currently-selected
   *  roots and the armed operation — never tied to a committed root. */
  previewVoxel: VoxelMesh;
}

export function CSGLabViewport({ state }: { state: CSGLabController }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<CSGLabSceneRefs | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f17);
    scene.fog = new THREE.Fog(0x0a0f17, 30, 68);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(13, 12, 13);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);

    const directional = new THREE.DirectionalLight(0xffffff, 2);
    directional.position.set(10, 16, 8);
    directional.castShadow = true;
    directional.shadow.mapSize.set(2048, 2048);
    directional.shadow.camera.left = -(WORLD_SIZE / 2 + 2);
    directional.shadow.camera.right = WORLD_SIZE / 2 + 2;
    directional.shadow.camera.top = WORLD_SIZE / 2 + 2;
    directional.shadow.camera.bottom = -(WORLD_SIZE / 2 + 2);
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 50;
    directional.shadow.bias = -0.0004;
    directional.shadow.normalBias = 0.02;
    scene.add(directional.target);

    scene.add(ambient, directional);

    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4), new THREE.ShadowMaterial({ opacity: 0.18 }));
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -WORLD_SIZE / 2 - 0.01;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Visualizes the box shapes can be moved within, so the boundary reads as intentional.
    const boundaryBoxGeometry = new THREE.BoxGeometry(MOVE_BOUND_XZ * 2, MOVE_BOUND_Y_MAX - MOVE_BOUND_Y_MIN, MOVE_BOUND_XZ * 2);
    const boundaryEdges = new THREE.EdgesGeometry(boundaryBoxGeometry);
    boundaryBoxGeometry.dispose();
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.6 });
    const boundaryLines = new THREE.LineSegments(boundaryEdges, boundaryMaterial);
    boundaryLines.position.y = (MOVE_BOUND_Y_MIN + MOVE_BOUND_Y_MAX) / 2;
    scene.add(boundaryLines);

    const rootEntries = new Map<string, RootEntry>();

    const previewVoxel = createVoxelMesh(RESULT_COLOR);
    previewVoxel.group.visible = false;
    scene.add(previewVoxel.group);

    const transformControls = new TransformControls(camera, renderer.domElement);
    scene.add(transformControls.getHelper());

    // TransformControls only listens for pointer events on its own domElement (same as
    // OrbitControls), so releasing a gizmo drag outside the canvas (e.g. over the side panel)
    // would otherwise never fire its pointerup handler and leave OrbitControls disabled forever.
    // Capturing the pointer on down guarantees the canvas keeps receiving move/up events no
    // matter where the cursor ends up.
    const capturePointer = (event: PointerEvent) => {
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    renderer.domElement.addEventListener("pointerdown", capturePointer);

    // Belt-and-suspenders: unconditionally restore orbiting on any pointer release, even if the
    // above capture somehow doesn't apply (e.g. touch) and the controls' own handler doesn't fire.
    const handleGlobalPointerUp = () => {
      controls.enabled = true;
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);

    // Live-clamps translation to the boundary box while dragging (translate mode only). Each
    // root's Group carries its real position/rotation/scale directly (see the rebuild effect
    // below), so TransformControls composes a drag against that starting transform and
    // `object.position` is already the absolute new value — no base/delta bookkeeping needed.
    const handleObjectChange = () => {
      if (transformControls.mode !== "translate") return;
      const object = transformControls.object;
      if (!object) return;
      object.position.set(
        clamp(object.position.x, -MOVE_BOUND_XZ, MOVE_BOUND_XZ),
        clamp(object.position.y, MOVE_BOUND_Y_MIN, MOVE_BOUND_Y_MAX),
        clamp(object.position.z, -MOVE_BOUND_XZ, MOVE_BOUND_XZ),
      );
    };
    transformControls.addEventListener("objectChange", handleObjectChange);

    // Commits the gizmo's current (already-absolute) transform when a drag ends.
    const handleDraggingChanged = (event: { value: unknown }) => {
      controls.enabled = !event.value;
      if (event.value) return;

      const object = transformControls.object;
      if (!object) return;
      const id = findRootIdForGroup(rootEntries, object);
      if (!id) return;

      if (transformControls.mode === "translate") {
        state.transformRoot(id, { position: { x: object.position.x, y: object.position.y, z: object.position.z } });
      } else if (transformControls.mode === "rotate") {
        state.transformRoot(id, {
          rotation: { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
        });
      } else if (transformControls.mode === "scale") {
        state.transformRoot(id, {
          scale: {
            x: Math.max(object.scale.x, MIN_SCALE),
            y: Math.max(object.scale.y, MIN_SCALE),
            z: Math.max(object.scale.z, MIN_SCALE),
          },
        });
      }
    };
    transformControls.addEventListener("dragging-changed", handleDraggingChanged);

    refsRef.current = { renderer, scene, camera, controls, transformControls, rootEntries, previewVoxel };

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
      renderer.domElement.removeEventListener("pointerdown", capturePointer);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      transformControls.removeEventListener("objectChange", handleObjectChange);
      transformControls.removeEventListener("dragging-changed", handleDraggingChanged);
      // Not transformControls.dispose(): the installed three version's implementation calls
      // `this.traverse(...)`, but TransformControls extends Controls (not Object3D) and has no
      // such method — it throws every time. disconnect() alone removes its DOM listeners; the
      // helper's own geometries/materials are disposed manually via traversal instead.
      transformControls.disconnect();
      transformControls.getHelper().traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      controls.dispose();
      for (const entry of rootEntries.values()) disposeVoxelMesh(entry.voxel);
      rootEntries.clear();
      disposeVoxelMesh(previewVoxel);
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();
      boundaryEdges.dispose();
      boundaryMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      refsRef.current = null;
    };
  }, []);

  // Rebuild: diff root ids against the live entries, dispose stale ones, resample the rest into
  // fresh voxel grids. Debounced so rapid tree edits don't re-run this on every intermediate value.
  //
  // Voxels are sampled with buildLocalSdf/computeLocalBounds — i.e. excluding the root's own
  // position/rotation/scale, only nested children's transforms — and the Group's own transform
  // is set to the root's values directly. That's what makes the Object Manipulation gizmo (which
  // visualizes whatever it's attached to) track the shape's actual pivot instead of the origin.
  useDebouncedEffect(
    () => {
      const refs = refsRef.current;
      if (!refs) return;
      const { scene, rootEntries } = refs;
      const currentIds = new Set(state.roots.map((root) => root.id));

      for (const [id, entry] of rootEntries) {
        if (!currentIds.has(id)) {
          scene.remove(entry.voxel.group);
          disposeVoxelMesh(entry.voxel);
          rootEntries.delete(id);
        }
      }

      for (const root of state.roots) {
        const sdf = buildLocalSdf(root);
        let entry = rootEntries.get(root.id);

        // Hidden (or fully hidden-out) roots have nothing to render — drop any existing entry.
        if (!sdf) {
          if (entry) {
            scene.remove(entry.voxel.group);
            disposeVoxelMesh(entry.voxel);
            rootEntries.delete(root.id);
          }
          continue;
        }

        if (!entry) {
          const voxel = createVoxelMesh(RESULT_COLOR);
          scene.add(voxel.group);
          entry = { voxel };
          rootEntries.set(root.id, entry);
        }

        entry.voxel.group.position.set(root.position.x, root.position.y, root.position.z);
        entry.voxel.group.quaternion.set(root.rotation.x, root.rotation.y, root.rotation.z, root.rotation.w);
        entry.voxel.group.scale.set(root.scale.x, root.scale.y, root.scale.z);

        const bounds = computeLocalBounds(root);
        const { cells, cellSize } = sampleVoxels(bounds, (p) => sdf(p) <= 0);
        fillVoxelMesh(entry.voxel, cells, cellSize);
      }
    },
    [state.roots],
    90,
  );

  // Selection highlight, which roots are temporarily suppressed (replaced by the
  // preview-before-commit overlay below), and which single selected root (if any) the Object
  // Manipulation gizmo is attached to — cheap visibility/color/attach flips, so this runs
  // immediately rather than piggybacking on the debounced geometry rebuild.
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs) return;

    const previewActive = state.selectedRootIds.length === 2 && !!state.previewOperation;

    for (const [id, entry] of refs.rootEntries) {
      const suppressed = previewActive && state.selectedRootIds.includes(id);
      entry.voxel.group.visible = !suppressed;
      entry.voxel.mesh.material.color.setHex(state.selectedRootIds.includes(id) ? HIGHLIGHT_COLOR : RESULT_COLOR);
    }

    const soleSelectedId = !previewActive && state.selectedRootIds.length === 1 ? state.selectedRootIds[0] : null;
    const target = soleSelectedId ? refs.rootEntries.get(soleSelectedId) : undefined;
    if (target) {
      refs.transformControls.attach(target.voxel.group);
    } else {
      refs.transformControls.detach();
    }
  }, [state.roots, state.selectedRootIds, state.previewOperation]);

  // Which gizmo (move/rotate/scale) the Object Manipulation section has selected.
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs) return;
    refs.transformControls.setMode(state.transformMode);
  }, [state.transformMode]);

  // Preview-before-commit: while two roots are selected and an operation is armed, show what
  // Apply would produce in place of the two individual shapes. Not debounced — should feel
  // instant, and this grid is cheap (simple algebra, no boolean-mesh evaluation).
  useEffect(() => {
    const refs = refsRef.current;
    if (!refs) return;

    if (!(state.selectedRootIds.length === 2 && state.previewOperation)) {
      refs.previewVoxel.group.visible = false;
      return;
    }

    const [idA, idB] = state.selectedRootIds;
    const nodeA = findNode(state.roots, idA);
    const nodeB = findNode(state.roots, idB);
    const sdfResult = nodeA && nodeB ? combineSdf(state.previewOperation, buildSdf(nodeA), buildSdf(nodeB)) : null;
    if (!nodeA || !nodeB || !sdfResult) {
      refs.previewVoxel.group.visible = false;
      return;
    }

    const bounds = unionBounds(computeNodeBounds(nodeA), computeNodeBounds(nodeB));
    const { cells, cellSize } = sampleVoxels(bounds, (p) => sdfResult(p) <= 0);
    fillVoxelMesh(refs.previewVoxel, cells, cellSize);
    refs.previewVoxel.group.visible = true;
  }, [state.roots, state.selectedRootIds, state.previewOperation]);

  return <div ref={mountRef} className="h-full w-full" />;
}
