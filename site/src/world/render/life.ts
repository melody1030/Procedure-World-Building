import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Life } from "../life/agents";
import type { VehicleKind } from "../life/traffic";

/**
 * Draws the inhabitants (life/agents.ts) with instanced meshes: a few draw calls for the whole
 * crowd. Each body part is one mesh with an instance per person (or bird, or cat), colored per
 * instance; the parts' matrices are set from the agent's place and pose every frame. Sizes are
 * true to the voxel (0.25 m): a person is 1.7 m, a pigeon 30 cm, a cat 45 cm long.
 *
 * - People: legs swing as they walk; sitting, they bend at the hip with their feet on the ground.
 * - Pigeons: they bob as they peck; flying, they beat their wings and pitch with the climb.
 * - Cats: they crouch to stalk, stretch out to sprint, and sit up to rest.
 * - Vehicles (life/traffic.ts): kei cars, vans, taxis and community buses, pitched with the street.
 *   Headlights always on, tail lights flaring when they brake; a taxi's roof light is lit while it
 *   is free; a bus's windows are lit from inside and its door lights up while it stands open.
 *   Someone hailing a taxi holds up a glowing phone. Bus shelters stand at the stops, signed in
 *   their route's color.
 */

/** A box of size (w, h, d) whose base center (or, with `top`, top center) is at the origin, moved by (x, y, z). */
function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, top = false) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + (top ? -h / 2 : h / 2), z);
}

const material = () => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
/** Unlit, for what glows (lights, signs, lit windows). */
const glow = () => new THREE.MeshBasicMaterial();
const paint = () => new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25 });
const GLASS = 0x1a2029;
const HEADLIGHT = 0xfff1d0;
const TAIL = 0x6e1414;
const BRAKE = 0xff2b2b;
const TAXI_FREE = 0x5cff9d;
const TAXI_HIRED = 0x3a3f46;
const INTERIOR = 0xffd79a;
const DOOR = 0x23272f;
const PHONE = 0x7ff3ff;

/** A vehicle's shell and glass (voxels; +z is its front, its right is -x), its wheels (x, z), and its lights' height. */
interface Model {
  shell: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  wheels: [number, number][];
  lights: number;
}

function models(): Record<VehicleKind, Model> {
  // A kei car: low body, a cabin set back, glass round it.
  const car: Model = {
    shell: mergeGeometries([box(5.6, 2.4, 13.6, 0, 0.9, 0), box(5.2, 2.4, 7.4, 0, 3.3, -0.8)]),
    glass: box(5.3, 1.6, 7.5, 0, 3.6, -0.8),
    wheels: [-1, 1].flatMap((x) => [-1, 1].map((z): [number, number] => [x * 2.45, z * 4.3])),
    lights: 2.3,
  };
  return {
    car,
    taxi: car,
    // A box van, windscreen and cab windows at the front.
    van: {
      shell: box(6.4, 6.2, 16.8, 0, 0.9, 0),
      glass: box(6.5, 1.9, 6.2, 0, 4.4, 5.35),
      wheels: [-1, 1].flatMap((x) => [-1, 1].map((z): [number, number] => [x * 2.85, z * 5.6])),
      lights: 2.6,
    },
    // A community bus: a long box with a roof, its windows (lit) drawn separately.
    bus: {
      shell: mergeGeometries([box(6.6, 9.4, 24, 0, 1, 0), box(6.0, 0.6, 19, 0, 10.4, -0.5)]),
      glass: box(6.0, 4.4, 0.2, 0, 4.8, 12.02),
      wheels: [-1, 1].flatMap((x) => [-1, 1].map((z): [number, number] => [x * 2.9, z * 8.2])),
      lights: 2.8,
    },
  };
}

const KINDS: VehicleKind[] = ["car", "taxi", "van", "bus"];

class Part {
  readonly mesh: THREE.InstancedMesh;
  private used = 0;
  private readonly color = new THREE.Color();

  constructor(geometry: THREE.BufferGeometry, max: number, shadow = true, look: THREE.Material = material()) {
    this.mesh = new THREE.InstancedMesh(geometry, look, Math.max(1, max));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.color);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
  }

  begin() {
    this.used = 0;
  }

  add(m: THREE.Matrix4, color: number) {
    if (this.used >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.used, m);
    this.mesh.setColorAt(this.used, this.color.setHex(color));
    this.used++;
  }

  end() {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Hip height, torso and head (voxels). */
const HIP = 3.2;
const TORSO = 2.4;

export class LifeView {
  readonly group = new THREE.Group();
  private readonly torso: Part;
  private readonly head: Part;
  private readonly hair: Part;
  private readonly leg: Part;
  private readonly seatedLeg: Part;
  private readonly pigeon: Part;
  private readonly wing: Part;
  private readonly cat: Part;
  private readonly phone: Part;
  private readonly shells = {} as Record<VehicleKind, Part>;
  private readonly glasses = {} as Record<VehicleKind, Part>;
  private readonly models = models();
  private readonly wheel: Part;
  private readonly lamp: Part;
  private readonly taxiSign: Part;
  private readonly windows: Part;
  private readonly door: Part;
  private readonly destination: Part;
  private readonly shelters = new THREE.Group();
  private readonly m = new THREE.Matrix4();
  private readonly base = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly r = new THREE.Matrix4();

  constructor(
    private readonly life: Life,
    private readonly half: number,
  ) {
    const people = life.people.length;
    this.torso = new Part(box(1.5, TORSO, 0.9, 0, 0, 0), people);
    this.head = new Part(box(1, 1, 1), people);
    this.hair = new Part(mergeGeometries([box(1.1, 0.35, 1.1, 0, 0.85, -0.02), box(1.1, 0.7, 0.3, 0, 0.3, -0.42)]), people);
    this.leg = new Part(box(0.66, HIP, 0.8, 0, 0, 0, true), people * 2);
    // Seated: the thigh forward along the seat, the shin down to the ground clear of the seat's front edge.
    this.seatedLeg = new Part(mergeGeometries([box(0.66, 0.8, 2.3, 0, 0, 0.85), box(0.64, 2.7, 0.7, 0, 0.78, 1.65, true)]), people * 2);
    const birds = life.pigeons.length;
    // Body, head and tail; and a wing, out from the shoulder along +x.
    this.pigeon = new Part(mergeGeometries([box(0.55, 0.5, 1, 0, 0.25, 0), box(0.38, 0.4, 0.4, 0, 0.6, 0.55), box(0.4, 0.12, 0.5, 0, 0.45, -0.7)]), birds);
    this.wing = new Part(box(1.3, 0.08, 0.6, 0.65, 0, 0), birds * 2);
    // Legs, body, head with ears, and the tail up behind.
    this.cat = new Part(
      mergeGeometries([
        ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.22, 0.6, 0.22, sx * 0.22, 0, sz * 0.65))),
        box(0.7, 0.55, 1.8, 0, 0.55, 0),
        box(0.7, 0.6, 0.6, 0, 0.9, 1.05),
        box(0.16, 0.22, 0.16, -0.22, 1.5, 1.0),
        box(0.16, 0.22, 0.16, 0.22, 1.5, 1.0),
        box(0.16, 1.1, 0.16, 0, 0.9, -0.95),
      ]),
      life.cats.length,
    );
    this.phone = new Part(box(0.4, 0.65, 0.12), people, false, glow());
    // Vehicles: a shell and glass per kind; wheels, lamps and the rest shared.
    const traffic = life.traffic;
    const count = (k: VehicleKind) => traffic.vehicles.filter((v) => v.kind === k).length;
    for (const k of KINDS) {
      this.shells[k] = new Part(this.models[k].shell, count(k), true, paint());
      this.glasses[k] = new Part(this.models[k].glass, count(k), false, new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.6 }));
    }
    const fleet = traffic.vehicles.length;
    const buses = count("bus");
    this.wheel = new Part(box(1, 2, 2), fleet * 4, true, new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 }));
    this.lamp = new Part(box(1.1, 0.6, 0.15), fleet * 4, false, glow());
    this.taxiSign = new Part(box(2.2, 0.8, 1), count("taxi"), false, glow());
    // The bus's windows, lit from inside, along both sides and the back; its front door, on its right.
    this.windows = new Part(box(6.66, 3.2, 20, 0, 5.6, -0.6), buses, false, glow());
    this.door = new Part(box(0.12, 7.4, 3.4, -3.32, 1.4, 7.6), buses, false, glow());
    this.destination = new Part(box(4.4, 1, 0.15, 0, 8.4, 12.05), buses, false, glow());
    this.buildShelters(life);
    for (const p of [this.torso, this.head, this.hair, this.leg, this.seatedLeg, this.pigeon, this.wing, this.cat, ...this.vehicleParts()]) this.group.add(p.mesh);
    this.group.add(this.shelters);
  }

  private vehicleParts(): Part[] {
    return [this.phone, ...KINDS.flatMap((k) => [this.shells[k], this.glasses[k]]).filter((p, i, a) => a.indexOf(p) === i), this.wheel, this.lamp, this.taxiSign, this.windows, this.door, this.destination];
  }

  /** A bus shelter at each stop: a canopy on two posts, a glass back, and a sign in the route's color. */
  private buildShelters(life: Life) {
    const frame = mergeGeometries([box(0.4, 9, 0.4, -3.4, 0, -1.6), box(0.4, 9, 0.4, 3.4, 0, -1.6), box(7.6, 0.4, 3.6, 0, 9, -0.6), box(6.4, 0.6, 1.2, 0, 2, -1.6)]);
    const pane = box(6.4, 5.4, 0.15, 0, 3.2, -1.75);
    const sign = box(0.3, 1.8, 1.8, 3.4, 9.6, -1.6);
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.6, metalness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d6, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35 });
    const half = this.half;
    for (const st of life.traffic.stops) {
      const color = life.traffic.routes[st.route].color;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(frame, dark), new THREE.Mesh(pane, glass), new THREE.Mesh(sign, new THREE.MeshBasicMaterial({ color })));
      for (const c of g.children) c.castShadow = c.receiveShadow = true;
      // Behind the people waiting, facing the road.
      g.position.set(st.x - Math.sin(st.heading) * 1.5 - half, st.y, st.z - Math.cos(st.heading) * 1.5 - half);
      g.rotation.y = st.heading;
      this.shelters.add(g);
    }
  }

  /** Steps the simulation and poses everything. */
  update(dt: number) {
    this.life.step(dt);
    const { m, base, t, r, half } = this;
    const parts = [this.torso, this.head, this.hair, this.leg, this.seatedLeg, this.pigeon, this.wing, this.cat, ...this.vehicleParts()];
    for (const p of parts) p.begin();

    for (const p of this.life.people) {
      if (p.state === "gone" || p.state === "ride") continue;
      const seated = p.state === "sit";
      const bob = p.moving ? Math.abs(Math.sin(p.phase)) * 0.25 : 0;
      base.makeRotationY(p.heading).setPosition(p.x - half, p.y + bob, p.z - half);
      if (seated) {
        // On the seat: the body from the seat up, a little back; legs bent forward and down.
        this.torso.add(m.multiplyMatrices(base, t.makeTranslation(0, 0, -0.35)), p.shirt);
        this.head.add(m.multiplyMatrices(base, t.makeTranslation(0, TORSO + 0.05, -0.35)), p.skin);
        this.hair.add(m.multiplyMatrices(base, t.makeTranslation(0, TORSO + 0.05, -0.35)), p.hair);
        for (const s of [-1, 1]) this.seatedLeg.add(m.multiplyMatrices(base, t.makeTranslation(s * 0.37, 0, -0.35)), p.pants);
        continue;
      }
      this.torso.add(m.multiplyMatrices(base, t.makeTranslation(0, HIP, 0)), p.shirt);
      // Hailing a taxi: a phone held up, glowing.
      if (p.state === "hail") this.phone.add(m.multiplyMatrices(base, t.makeTranslation(0.45, HIP + TORSO + 0.6, 0.75)), PHONE);
      this.head.add(m.multiplyMatrices(base, t.makeTranslation(0, HIP + TORSO + 0.05, 0)), p.skin);
      this.hair.add(m.multiplyMatrices(base, t.makeTranslation(0, HIP + TORSO + 0.05, 0)), p.hair);
      const swing = p.moving ? Math.sin(p.phase) * 0.55 : 0;
      for (const s of [-1, 1]) {
        m.multiplyMatrices(base, t.makeTranslation(s * 0.37, HIP, 0)).multiply(r.makeRotationX(swing * s));
        this.leg.add(m, p.pants);
      }
    }

    for (const b of this.life.pigeons) {
      base.makeRotationY(b.heading).setPosition(b.x - half, b.y, b.z - half);
      if (b.flying) {
        const pitch = -Math.atan2(b.vy, Math.hypot(b.vx, b.vz) || 1) * 0.6;
        base.multiply(r.makeRotationX(pitch));
        this.pigeon.add(base, b.color);
        const beat = Math.sin(b.flap) * (b.landing ? 0.5 : 0.9);
        for (const s of [-1, 1]) {
          m.multiplyMatrices(base, t.makeTranslation(s * 0.25, 0.5, 0.05)).multiply(r.makeRotationZ(s > 0 ? beat : Math.PI - beat));
          this.wing.add(m, b.color);
        }
      } else {
        // Pecking: the body tips forward.
        this.pigeon.add(m.multiplyMatrices(base, r.makeRotationX(b.peck * 0.7)), b.color);
      }
    }

    for (const c of this.life.cats) {
      base.makeRotationY(c.heading).setPosition(c.x - half, c.y, c.z - half);
      if (c.state === "rest") m.multiplyMatrices(base, r.makeRotationX(-0.55)).multiply(t.makeScale(1, 1, 0.8));
      else if (c.state === "stalk") m.multiplyMatrices(base, t.makeScale(1, 0.7, 1.08));
      else if (c.state === "sprint" || c.state === "flee") m.multiplyMatrices(base, t.makeTranslation(0, Math.abs(Math.sin(c.phase)) * 0.4, 0)).multiply(r.makeScale(1, 0.85, 1.2));
      else m.copy(base).multiply(t.makeTranslation(0, Math.abs(Math.sin(c.phase)) * 0.08, 0));
      this.cat.add(m, c.color);
    }

    for (const v of this.life.traffic.vehicles) {
      if (v.gone) continue;
      const model = this.models[v.kind];
      base.makeRotationY(v.heading).setPosition(v.x - half, v.y, v.z - half).multiply(r.makeRotationX(-v.pitch));
      this.shells[v.kind].add(base, v.color);
      this.glasses[v.kind].add(base, GLASS);
      for (const [x, z] of model.wheels) this.wheel.add(m.multiplyMatrices(base, t.makeTranslation(x, 0, z)), 0x15161a);
      const lx = v.width / 2 - 1;
      for (const s of [-1, 1]) {
        this.lamp.add(m.multiplyMatrices(base, t.makeTranslation(s * lx, model.lights, v.length / 2 + 0.02)), HEADLIGHT);
        this.lamp.add(m.multiplyMatrices(base, t.makeTranslation(s * lx, model.lights, -v.length / 2 - 0.02)), v.braking ? BRAKE : TAIL);
      }
      if (v.kind === "taxi") this.taxiSign.add(m.multiplyMatrices(base, t.makeTranslation(0, 5.7, -0.8)), v.fare ? TAXI_HIRED : TAXI_FREE);
      if (v.kind === "bus") {
        this.windows.add(base, INTERIOR);
        this.door.add(base, v.dwelling ? INTERIOR : DOOR);
        this.destination.add(base, v.color);
      }
    }

    for (const p of parts) p.end();
  }

  dispose() {
    for (const p of [this.torso, this.head, this.hair, this.leg, this.seatedLeg, this.pigeon, this.wing, this.cat]) p.dispose();
    // (Car and taxi share a model.)
    const seen = new Set<THREE.BufferGeometry>();
    for (const p of this.vehicleParts()) {
      if (seen.has(p.mesh.geometry)) {
        (p.mesh.material as THREE.Material).dispose();
        p.mesh.dispose();
      } else p.dispose();
      seen.add(p.mesh.geometry);
    }
    this.shelters.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        (o.material as THREE.Material).dispose();
      }
    });
    const geometries = new Set<THREE.BufferGeometry>();
    this.shelters.traverse((o) => o instanceof THREE.Mesh && geometries.add(o.geometry));
    for (const g of geometries) g.dispose();
  }
}
