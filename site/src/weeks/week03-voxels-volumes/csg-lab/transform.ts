import * as THREE from "three";
import type { Quat, Vec3 } from "./types";

// Reused scratch objects — worldToLocal/localToWorld are called once per voxel sample (tens of
// thousands of times per rebuild), so avoiding a fresh THREE.Vector3/Quaternion allocation per
// call matters. Safe because every call fully resolves synchronously before the next one starts.
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Maps a world-space point into a node's local space: inverse-translate, then inverse-rotate,
 * then inverse-scale — the exact reverse of how the node's shape is placed into the world
 * (scale, then rotate, then translate). Used by the SDF engine to evaluate a primitive's local
 * shape test at an arbitrary world sample point.
 */
export function worldToLocal(p: Vec3, position: Vec3, rotation: Quat, scale: Vec3): Vec3 {
  _v.set(p.x - position.x, p.y - position.y, p.z - position.z);
  _q.set(rotation.x, rotation.y, rotation.z, rotation.w).invert();
  _v.applyQuaternion(_q);
  _v.set(_v.x / scale.x, _v.y / scale.y, _v.z / scale.z);
  return { x: _v.x, y: _v.y, z: _v.z };
}

/**
 * Maps a local-space point into world space — the forward transform (scale, then rotate, then
 * translate). Used to project a node's local bounding-box corners into world space.
 */
export function localToWorld(p: Vec3, position: Vec3, rotation: Quat, scale: Vec3): Vec3 {
  _v.set(p.x * scale.x, p.y * scale.y, p.z * scale.z);
  _q.set(rotation.x, rotation.y, rotation.z, rotation.w);
  _v.applyQuaternion(_q);
  return { x: _v.x + position.x, y: _v.y + position.y, z: _v.z + position.z };
}
