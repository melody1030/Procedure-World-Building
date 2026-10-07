import * as THREE from "three";
import { CITY } from "../palette";
import { hash2 } from "../rng";
import type { Rail } from "../stages/bridges";
import type { CarPath } from "../stages/props";

/**
 * Traffic: cars on the roads and trains on the elevated rail, as instanced meshes moved every
 * frame. Each vehicle drives back and forth along its route, keeping to its side of the road. A
 * vehicle only appears once its road or rail exists on the growth timeline.
 */

type Point = { x: number; y: number; z: number };

/** A polyline you can sample by distance. */
class Route {
  private readonly lengths: number[] = [0];
  readonly length: number;

  constructor(readonly points: Point[]) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.lengths.push(this.lengths[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.lengths[this.lengths.length - 1];
  }

  /** Position and heading at distance s (clamped). */
  sample(s: number, out: THREE.Vector3): number {
    const d = Math.min(this.length, Math.max(0, s));
    let lo = 0;
    let hi = this.lengths.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.lengths[mid] <= d) lo = mid;
      else hi = mid;
    }
    const a = this.points[lo];
    const b = this.points[hi];
    const t = (d - this.lengths[lo]) / Math.max(1e-6, this.lengths[hi] - this.lengths[lo]);
    out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
}

interface Vehicle {
  route: Route;
  start: number;
  speed: number;
  lane: number;
  birth: number;
}

const TRAIN_CARS = 3;

export class Traffic {
  readonly object = new THREE.Group();
  private readonly cars: Vehicle[] = [];
  private readonly trains: Vehicle[] = [];
  private readonly carBody: THREE.InstancedMesh;
  private readonly carHead: THREE.InstancedMesh;
  private readonly carTail: THREE.InstancedMesh;
  private readonly trainBody: THREE.InstancedMesh;
  private readonly trainGlow: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(paths: CarPath[], rails: Rail[], seed: number) {
    const routes = paths.map((p) => ({ route: new Route(p.points), birth: p.birth, width: p.width }));
    const total = routes.reduce((s, r) => s + r.route.length, 0);
    const count = Math.min(90, Math.floor(total / 22));
    for (let i = 0; i < count; i++) {
      // Pick a route weighted by length.
      let pick = hash2(i, seed, 1) * total;
      const r = routes.find((route) => (pick -= route.route.length) <= 0) ?? routes[routes.length - 1];
      if (!r) break;
      this.cars.push({ route: r.route, start: hash2(i, seed, 2) * r.route.length * 2, speed: 9 + hash2(i, seed, 3) * 7, lane: r.width / 4, birth: r.birth + 0.05 });
    }
    rails.forEach((rail, i) => this.trains.push({ route: new Route(rail.points), start: hash2(i, seed, 4) * 100, speed: 20, lane: 0, birth: rail.birth + 0.04 }));

    const body = new THREE.BoxGeometry(2, 1.3, 4).translate(0, 0.95, 0);
    this.carBody = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 }), Math.max(1, this.cars.length));
    const palette = [0x8a2e3a, 0x2e4a6a, 0xb0b4ba, 0x1e2228, 0xc89a3a, 0x3a6a5a, ...CITY.container];
    for (let i = 0; i < this.cars.length; i++) this.carBody.setColorAt(i, new THREE.Color(palette[Math.floor(hash2(i, seed, 5) * palette.length)]));
    this.carHead = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.35, 0.15).translate(0, 1.05, 2.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(2.2), toneMapped: false }), Math.max(1, this.cars.length));
    this.carTail = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.3, 0.15).translate(0, 1.05, -2.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(2), toneMapped: false }), Math.max(1, this.cars.length));

    const trainCount = Math.max(1, this.trains.length * TRAIN_CARS);
    this.trainBody = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 2.6, 9).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.4, metalness: 0.5 }), trainCount);
    this.trainGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(2.7, 0.7, 8.2).translate(0, 1.7, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfefff).multiplyScalar(1.6), toneMapped: false }), trainCount);

    for (const mesh of [this.carBody, this.carHead, this.carTail, this.trainBody, this.trainGlow]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = mesh === this.carBody || mesh === this.trainBody;
      this.object.add(mesh);
    }
    this.update(0, 1);
  }

  /** Moves everything to time t (seconds) for growth g. */
  update(t: number, growth: number) {
    this.cars.forEach((car, i) => {
      const visible = growth >= car.birth;
      const heading = this.place(car, t, 0, car.lane);
      this.compose(heading, visible);
      this.carBody.setMatrixAt(i, this.matrix);
      this.carHead.setMatrixAt(i, this.matrix);
      this.carTail.setMatrixAt(i, this.matrix);
    });
    this.trains.forEach((train, i) => {
      const visible = growth >= train.birth;
      for (let c = 0; c < TRAIN_CARS; c++) {
        const heading = this.place(train, t, c * 10, 0);
        this.position.y += 1;
        this.compose(heading, visible);
        this.trainBody.setMatrixAt(i * TRAIN_CARS + c, this.matrix);
        this.trainGlow.setMatrixAt(i * TRAIN_CARS + c, this.matrix);
      }
    });
    for (const mesh of [this.carBody, this.carHead, this.carTail, this.trainBody, this.trainGlow]) mesh.instanceMatrix.needsUpdate = true;
  }

  /** Back and forth along the route; returns the heading and leaves the position in this.position. */
  private place(v: Vehicle, t: number, behind: number, lane: number): number {
    const L = v.route.length;
    const u = (((v.start + v.speed * t) % (2 * L)) + 2 * L) % (2 * L);
    const forward = u < L;
    const s = (forward ? u : 2 * L - u) - (forward ? behind : -behind);
    let heading = v.route.sample(s, this.position);
    if (!forward) heading += Math.PI;
    // Keep right: offset to the right of the direction of travel.
    this.position.x += -Math.cos(heading) * lane;
    this.position.z += Math.sin(heading) * lane;
    return heading;
  }

  private compose(heading: number, visible: boolean) {
    this.quaternion.setFromAxisAngle(this.up, heading);
    this.scale.setScalar(visible ? 1 : 0);
    this.matrix.compose(this.position, this.quaternion, this.scale);
  }

  dispose() {
    for (const mesh of [this.carBody, this.carHead, this.carTail, this.trainBody, this.trainGlow]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
  }
}
