import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The incinerator's chimney (life/waste.ts): a square concrete stack rising from the back of the
 * building, well above its roof, with two red bands near the top and a glowing throat. Added to
 * the building's group before it is made printable (buildings/print.ts), so it goes up with it.
 * Three meshes; the materials are shared (print.ts clones them per building).
 */

const STACK = new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.9 });
const BAND = new THREE.MeshStandardMaterial({ color: 0xa3262a, roughness: 0.7 });
const THROAT = new THREE.MeshBasicMaterial({ color: 0xff7a2e });

/** Width of the stack (voxels), and how far it rises above the roof: a share of the building's height, at least RISE_MIN. */
const WIDTH = 12;
const RISE = 0.45;
const RISE_MIN = 48;

/** Adds the chimney to a building's group (still at the origin, unturned). */
export function addChimney(group: THREE.Group) {
  const box = new THREE.Box3().setFromObject(group);
  const height = box.max.y;
  const top = height + Math.max(RISE_MIN, height * RISE);
  // At the back, in the middle: its foot is hidden in the building.
  const x = (box.min.x + box.max.x) / 2;
  const z = box.min.z + WIDTH;
  const block = (w: number, h: number, y: number) => new THREE.BoxGeometry(w, h, w).translate(x, y + h / 2, z);
  const stack = new THREE.Mesh(mergeGeometries([block(WIDTH, top, 0), block(WIDTH + 2, 3, top - 3)]), STACK);
  const bands = new THREE.Mesh(mergeGeometries([block(WIDTH + 0.6, 4, top - 12), block(WIDTH + 0.6, 4, top - 22)]), BAND);
  const throat = new THREE.Mesh(block(WIDTH - 3, 0.5, top), THROAT);
  for (const m of [stack, bands]) m.castShadow = m.receiveShadow = true;
  group.add(stack, bands, throat);
}
