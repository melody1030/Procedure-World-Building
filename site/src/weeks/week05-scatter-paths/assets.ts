import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORLD_SIZE } from "./config";
import type { PathCurve } from "./paths";
import { heightAt, type Heightmap } from "./terrain";

/**
 * Low-poly asset geometry. Every piece has its origin at the base of the object, so an instance
 * placed at a terrain point stands on it. One unit of `scale` is roughly a person-sized tree.
 */

function at(geometry: THREE.BufferGeometry, x: number, y: number, z: number) {
  return geometry.translate(x, y, z);
}

export interface AssetGeometries {
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  bush: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  tower: THREE.BufferGeometry;
  /** Three blades around the hub at the origin, turning in the XY plane. */
  blades: THREE.BufferGeometry;
  pole: THREE.BufferGeometry;
  bulb: THREE.BufferGeometry;
}

/** Height of the windmill hub above its base, at scale 1. */
export const HUB_HEIGHT = 2.3;
/** How far in front of the tower the blades turn. */
export const HUB_OFFSET = 0.2;
/** Height of a lamp's bulb above the ground. */
export const LAMP_HEIGHT = 0.9;

export function createAssetGeometries(): AssetGeometries {
  const canopy = mergeGeometries([at(new THREE.ConeGeometry(0.38, 0.8, 7), 0, 0.65, 0), at(new THREE.ConeGeometry(0.28, 0.65, 7), 0, 1.05, 0)]);

  const bush = new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.7, 1).translate(0, 0.16, 0);

  // A dodecahedron with its corners pushed in and out, squashed and sunk a little into the ground.
  const rock = new THREE.DodecahedronGeometry(0.32, 0);
  const position = rock.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const wobble = 0.8 + 0.4 * Math.abs(Math.sin(position.getX(i) * 12.9 + position.getY(i) * 78.2 + position.getZ(i) * 37.7));
    position.setXYZ(i, position.getX(i) * wobble * 1.2, position.getY(i) * wobble * 0.65, position.getZ(i) * wobble);
  }
  rock.translate(0, 0.08, 0);
  rock.computeVertexNormals();

  const tower = mergeGeometries([
    at(new THREE.CylinderGeometry(0.07, 0.15, HUB_HEIGHT, 8), 0, HUB_HEIGHT / 2, 0),
    at(new THREE.BoxGeometry(0.16, 0.16, 0.42), 0, HUB_HEIGHT, 0.04),
  ]);

  const blade = () => new THREE.BoxGeometry(0.07, 0.95, 0.02).translate(0, 0.5, 0);
  const blades = mergeGeometries([0, 1, 2].map((k) => blade().rotateZ((k * Math.PI * 2) / 3)));

  return {
    trunk: new THREE.CylinderGeometry(0.05, 0.07, 0.4, 6).translate(0, 0.2, 0),
    canopy,
    bush,
    rock,
    tower,
    blades,
    pole: new THREE.CylinderGeometry(0.025, 0.035, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0),
    bulb: new THREE.SphereGeometry(0.07, 8, 6).translate(0, LAMP_HEIGHT, 0),
  };
}

const HALF = WORLD_SIZE / 2;

/**
 * A flat strip along a path curve. The road drapes on the terrain (its edges read the height
 * under them); the river's water is level across, at the curve's water height.
 */
export function buildRibbon(curve: PathCurve, map: Heightmap, widthScale: number, flatAcross: boolean, lift: number): THREE.BufferGeometry {
  const { xz, y } = curve;
  const n = y.length;
  const half = curve.halfWidth * widthScale;
  const positions: number[] = [];
  const indices: number[] = [];
  let previous = -1;
  for (let i = 0; i < n; i++) {
    const x = xz[i * 2];
    const z = xz[i * 2 + 1];
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) {
      previous = -1;
      continue;
    }
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = xz[b * 2] - xz[a * 2];
    const tz = xz[b * 2 + 1] - xz[a * 2 + 1];
    const len = Math.hypot(tx, tz) || 1;
    const sx = (-tz / len) * half;
    const sz = (tx / len) * half;
    const clampX = (v: number) => Math.max(-HALF, Math.min(HALF, v));
    const lx = clampX(x + sx);
    const lz = clampX(z + sz);
    const rx = clampX(x - sx);
    const rz = clampX(z - sz);
    const ly = flatAcross ? y[i] : heightAt(map, lx, lz);
    const ry = flatAcross ? y[i] : heightAt(map, rx, rz);
    const index = positions.length / 3;
    positions.push(lx, ly + lift, lz, rx, ry + lift, rz);
    if (previous >= 0) indices.push(previous, index, previous + 1, previous + 1, index, index + 1);
    previous = index;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A soft round dot, used as the sprite every particle is drawn with. */
export function createSprite(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
