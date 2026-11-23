import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Life } from "../life/agents";
import type { VehicleKind } from "../life/traffic";
import { FINE } from "../buildings/kit";
import { patchAgentLook, patchVoxelLook, voxelBox, withVoxelLook } from "./voxelLook";
import { STATES, catState, personState, pigeonState, vehicleState } from "../life/states";
import { VoxelModel } from "./voxelModel";

/**
 * Draws the inhabitants (life/agents.ts) with instanced meshes: a few draw calls for the whole
 * crowd. Each body part is one mesh with an instance per person (or bird, or cat), colored per
 * instance; the parts' matrices are set from the agent's place and pose every frame. People are
 * drawn to the scale of the streets and vehicles, not to life: those are small (3.5 m streets,
 * 1.4 m-wide cars), so a person is about 1.3 m, a little chunky, with a big head and arms, so they
 * read as people from far off (FIGURE_SCALE in scale.ts; the city's buildings are drawn at it too).
 * A pigeon is 30 cm, a cat 45 cm long.
 *
 * - People: legs and arms swing as they walk; sitting, they bend at the hip with their feet on the
 *   ground and their hands on their knees; hailing a taxi, they hold a glowing phone up.
 * - Pigeons: they bob as they peck; flying, they beat their wings and pitch with the climb.
 * - Cats: they crouch to stalk, stretch out to sprint, and sit up to rest.
 * The animals, vehicles, bins and shelters are voxel models (render/voxelModel.ts) on the fine
 * voxels, colored per cube and tinted per instance; the people are boxes, each drawn as fine voxels.
 *
 * - Vehicles (life/traffic.ts): kei cars, vans, taxis and community buses, pitched with the street.
 *   Headlights always on, tail lights flaring when they brake; a taxi's roof light is lit while it
 *   is free; a bus's windows are lit from inside and its door lights up while it stands open.
 *   Someone hailing a taxi holds up a glowing phone. Bus shelters stand at the stops, signed in
 *   their route's color. Garbage trucks: a cab and a compactor body.
 * - Waste (life/waste.ts): a bin on the curb for each group of doors, from green (empty) to rust
 *   (full); a spilled pile of bags beside a bin that was missed. One instanced mesh each, a few
 *   dozen instances in all.
 */

/**
 * A box of size (w, h, d) whose base center (or, with `top`, top center) is at the origin, moved by
 * (x, y, z); drawn as fine voxels (render/voxelLook.ts).
 */
function box(w: number, h: number, d: number, x = 0, y = 0, z = 0, top = false) {
  return voxelBox(new THREE.BoxGeometry(w, h, d), w, h, d, FINE).translate(x, y + (top ? -h / 2 : h / 2), z);
}

const material = () => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
/** Unlit, for what glows (lights, signs, lit windows). */
const glow = () => new THREE.MeshBasicMaterial();
/** Matte, as the ground and buildings are. */
const paint = () => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
const GLASS = 0x1a2029;
const HEADLIGHT = 0xfff1d0;
const TAIL = 0x6e1414;
const BRAKE = 0xff2b2b;
const TAXI_FREE = 0x5cff9d;
const TAXI_HIRED = 0x3a3f46;
const INTERIOR = 0xffd79a;
const DOOR = 0x23272f;
const PHONE = 0x7ff3ff;
const BIN_EMPTY = new THREE.Color(0x2f6b4a);
const BIN_FULL = new THREE.Color(0xa0522d);
const BAGS = [0x1c1e22, 0x2d3a2a, 0x3a3d44];

/**
 * A vehicle (fine voxels, render/voxelModel.ts; +z is its front, its right is -x): its shell in
 * its paint, with the wheels, bumpers and trim shaded into it; its glass; and for a bus, its lit
 * windows, door and destination sign. `lamp` is where its lights go: across (±x), up, and its
 * front end (the lights stand just out of it), in voxels.
 */
interface Model {
  shell: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  windows?: THREE.BufferGeometry;
  door?: THREE.BufferGeometry;
  sign?: THREE.BufferGeometry;
  lamp: { x: number; y: number; z: number };
}

/** Shades of the paint, and the dark parts every vehicle has. */
const TRIM = 0x6a6a6a;
const SKIRT = 0xb4b4b4;
const TIRE = 0x161616;
const HUB = 0x5a5a5a;

/** A vehicle `w` × `l` fine voxels on four wheels, the axles at `axles` (z), `h` high to the wheel tops. */
function chassis(w: number, l: number, axles: number[], h: number) {
  const v = new VoxelModel();
  /** The wheels (a hub on the outside) and the bumpers, over the body once it is filled in. */
  const wheels = () => {
    for (const z of axles) {
      for (const x of [0, w - 3]) {
        v.fill(x, 0, z - 4, x + 3, h, z + 4, TIRE);
        v.fill(x ? x + 2 : x, Math.floor(h / 2) - 1, z - 1, x ? x + 3 : x + 1, Math.floor(h / 2) + 1, z + 1, HUB);
      }
    }
    v.fill(1, 3, 0, w - 1, 6, 1, TRIM);
    v.fill(1, 3, l - 1, w - 1, 6, l, TRIM);
  };
  return { v, wheels };
}

function models(): Record<VehicleKind, Model> {
  const model = (v: VoxelModel, w: number, l: number, lampY: number, extras = false): Model => {
    const o: [number, number, number] = [w / 2, 0, l / 2];
    return {
      shell: v.mesh("solid", o),
      glass: v.mesh("glass", o),
      ...(extras ? { windows: v.mesh("window", o), door: v.mesh("door", o), sign: v.mesh("sign", o) } : {}),
      lamp: { x: (w / 2 - 3) * FINE, y: lampY * FINE, z: (l / 2) * FINE },
    };
  };

  // A kei car, 22 × 54: a low body, a cabin set back, glass round it.
  const car = (() => {
    const { v, wheels } = chassis(22, 54, [12, 42], 7);
    v.fill(0, 3, 0, 22, 12, 54);
    v.fill(0, 3, 1, 22, 4, 53, SKIRT);
    v.fill(1, 12, 9, 21, 21, 39);
    // Side windows (a pillar in the middle), the windscreen and the back window.
    for (const x of [1, 20]) v.fill(x, 14, 11, x + 1, 20, 23, 0xffffff, "glass").fill(x, 14, 25, x + 1, 20, 37, 0xffffff, "glass");
    v.fill(2, 14, 38, 20, 20, 39, 0xffffff, "glass");
    v.fill(2, 14, 9, 20, 20, 10, 0xffffff, "glass");
    wheels();
    return model(v, 22, 54, 8);
  })();

  // A box van, 26 × 67: windscreen and cab windows at the front, a seam down the back doors.
  const van = (() => {
    const { v, wheels } = chassis(26, 67, [14, 53], 8);
    v.fill(0, 3, 0, 26, 28, 67);
    v.fill(0, 3, 1, 26, 4, 66, SKIRT);
    v.fill(12, 5, 0, 14, 26, 1, TRIM);
    v.fill(2, 17, 66, 24, 24, 67, 0xffffff, "glass");
    v.fill(0, 17, 53, 1, 24, 64, 0xffffff, "glass").fill(25, 17, 53, 26, 24, 64, 0xffffff, "glass");
    wheels();
    return model(v, 26, 67, 10);
  })();

  // A garbage truck, 27 × 80: a cab with its windscreen, the chassis, the compactor body behind.
  const truck = (() => {
    const { v, wheels } = chassis(27, 80, [13, 65], 9);
    v.fill(1, 3, 56, 26, 28, 80);
    v.fill(3, 3, 54, 24, 8, 56, TRIM);
    v.fill(0, 3, 0, 27, 37, 54);
    v.fill(0, 9, 1, 27, 11, 53, SKIRT);
    v.fill(0, 3, 0, 27, 20, 2, TRIM);
    v.fill(3, 17, 79, 24, 25, 80, 0xffffff, "glass");
    v.fill(1, 17, 66, 2, 25, 77, 0xffffff, "glass").fill(25, 17, 66, 26, 25, 77, 0xffffff, "glass");
    wheels();
    return model(v, 27, 80, 10);
  })();

  // A community bus, 26 × 96: a long box with a roof; its windows along both sides and the back,
  // lit from inside, with pillars between; its front door on its right; the windscreen, and the
  // destination sign above it.
  const bus = (() => {
    const { v, wheels } = chassis(26, 96, [15, 81], 9);
    v.fill(0, 4, 0, 26, 42, 96);
    v.fill(2, 42, 6, 24, 44, 90);
    v.fill(0, 4, 1, 26, 5, 95, SKIRT);
    for (const x of [0, 25]) for (let z = 6; z < 86; z += 10) v.fill(x, 22, z + 1, x + 1, 35, z + 10, 0xffffff, "window");
    v.fill(3, 22, 0, 23, 35, 1, 0xffffff, "window");
    v.fill(0, 6, 71, 1, 36, 85, 0xffffff, "door");
    v.fill(2, 18, 95, 24, 34, 96, 0xffffff, "glass");
    v.fill(4, 35, 95, 22, 40, 96, 0xffffff, "sign");
    wheels();
    return model(v, 26, 96, 11, true);
  })();

  return { car, taxi: car, van, bus, truck };
}

/** A pigeon, 3 × 8 fine voxels and 6 high: body, folded wings, tail, pink feet, a green sheen at the neck, eyes and beak. */
function pigeon() {
  const v = new VoxelModel();
  v.fill(0, 1, 0, 3, 3, 5);
  for (const x of [0, 2]) v.fill(x, 2, 1, x + 1, 3, 4, 0x9a9a9a).fill(x, 0, 2, x + 1, 1, 3, 0xd07080);
  v.fill(0, 2, -2, 3, 3, 0, 0x8a8a8a);
  v.fill(0, 3, 3, 3, 4, 5, 0x9ad0b0);
  v.fill(0, 4, 3, 3, 6, 5);
  for (const x of [0, 2]) v.fill(x, 4, 4, x + 1, 5, 5, 0x202020);
  v.fill(1, 4, 5, 2, 5, 6, 0x505050);
  return v.mesh("solid", [1.5, 0, 2.5]);
}

/** A pigeon's wing, out from the shoulder along +x, its tip darker. */
function wing() {
  return new VoxelModel().fill(0, 0, 0, 5, 1, 3).fill(3, 0, 0, 5, 1, 3, 0xa0a0a0).mesh("solid", [0, 0.5, 1.5]);
}

/** A cat, 3 × 11 fine voxels: legs, a striped back, the head with ears, eyes and nose, the tail up behind. */
function cat() {
  const v = new VoxelModel();
  for (const x of [0, 2]) for (const z of [1, 5]) v.fill(x, 0, z, x + 1, 2, z + 1);
  v.fill(0, 2, 0, 3, 4, 7);
  for (const z of [1, 3, 5]) v.fill(0, 3, z, 3, 4, z + 1, 0x9a9a9a);
  v.fill(0, 3, 7, 3, 6, 10);
  for (const x of [0, 2]) v.fill(x, 6, 7, x + 1, 7, 8).fill(x, 5, 9, x + 1, 6, 10, 0x262626);
  v.fill(1, 4, 9, 2, 5, 10, 0xd08080);
  v.fill(1, 3, -1, 2, 7, 0).fill(1, 7, -2, 2, 8, -1);
  return v.mesh("solid", [1.5, 0, 3.5]);
}

/** A wheelie bin, 10 × 10 fine voxels and 14 high: a band near the top, the lid over it, two wheels and a handle at the back (-z). */
function bin() {
  const v = new VoxelModel();
  v.fill(0, 0, 0, 10, 12, 10);
  v.fill(0, 10, 0, 10, 11, 10, 0xb4b4b4);
  v.fill(-1, 12, 0, 11, 14, 11, 0xc8c8c8);
  v.fill(1, 12, -1, 9, 13, 0, TRIM);
  for (const x of [0, 8]) v.fill(x, 0, -1, x + 2, 2, 1, TIRE);
  return v.mesh("solid", [5, 0, 5]);
}

/** A pile of three bags, each tied at the top. */
function pile() {
  const v = new VoxelModel();
  v.fill(-9, 0, -4, -1, 7, 4).fill(-6, 7, -1, -4, 8, 1);
  v.fill(0, 0, -3, 8, 6, 6).fill(3, 6, 1, 5, 7, 3);
  v.fill(-4, 5, -3, 3, 11, 4).fill(-1, 11, 0, 1, 12, 2);
  return v.mesh("solid", [0, 0, 0]);
}

const KINDS: VehicleKind[] = ["car", "taxi", "van", "bus", "truck"];

class Part {
  readonly mesh: THREE.InstancedMesh;
  private used = 0;
  private readonly color = new THREE.Color();

  /** `agent`: a person, animal or vehicle, which keeps its colors in the debug view's Agents lens. */
  constructor(geometry: THREE.BufferGeometry, max: number, shadow = true, look: THREE.Material = material(), agent = false) {
    // Lit parts drawn as voxels; the lights stay clean.
    if (look instanceof THREE.MeshStandardMaterial) {
      look.onBeforeCompile = agent ? patchAgentLook : patchVoxelLook;
      look.customProgramCacheKey = () => (agent ? "life-voxel-agent" : "life-voxel");
    }
    // A voxel model's colors, times the instance's.
    if (geometry.getAttribute("color")) (look as THREE.MeshStandardMaterial).vertexColors = true;
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

/** A person (voxels): hip height, torso height, the shoulders' half width and the arm's length. */
const HIP = 2.3;
const TORSO = 1.9;
const SHOULDER = 0.86;
const ARM = 1.7;

export class LifeView {
  readonly group = new THREE.Group();
  private readonly torso: Part;
  private readonly head: Part;
  private readonly hair: Part;
  private readonly leg: Part;
  private readonly arm: Part;
  private readonly seatedLeg: Part;
  private readonly pigeon: Part;
  private readonly wing: Part;
  private readonly cat: Part;
  private readonly phone: Part;
  private readonly shells = {} as Record<VehicleKind, Part>;
  private readonly glasses = {} as Record<VehicleKind, Part>;
  private readonly models = models();
  private readonly lamp: Part;
  private readonly taxiSign: Part;
  private readonly windows: Part;
  private readonly door: Part;
  private readonly destination: Part;
  private readonly bin: Part;
  private readonly pile: Part;
  private readonly tint = new THREE.Color();
  /** The Agents lens: everyone is colored by what they are doing (life/states.ts). */
  private stateLens = false;
  private readonly shelters = new THREE.Group();
  private readonly m = new THREE.Matrix4();
  private readonly base = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly r = new THREE.Matrix4();

  constructor(
    readonly life: Life,
    private readonly half: number,
  ) {
    const people = life.people.length;
    this.torso = new Part(box(1.3, TORSO, 0.8, 0, 0, 0), people, true, material(), true);
    this.head = new Part(box(0.95, 0.95, 0.95), people, true, material(), true);
    this.hair = new Part(mergeGeometries([box(1.05, 0.3, 1.05, 0, 0.8, -0.02), box(1.05, 0.65, 0.28, 0, 0.3, -0.4)]), people, true, material(), true);
    this.leg = new Part(box(0.58, HIP, 0.68, 0, 0, 0, true), people * 2, true, material(), true);
    // An arm hangs from the shoulder (its top at the origin).
    this.arm = new Part(box(0.42, ARM, 0.48, 0, 0, 0, true), people * 2, true, material(), true);
    // Seated: the thigh forward along the seat, the shin down to the ground (a seat is about 1.9
    // voxels up) clear of the seat's front edge.
    this.seatedLeg = new Part(mergeGeometries([box(0.58, 0.6, 1.7, 0, 0, 0.6), box(0.56, 2.5, 0.6, 0, 0.6, 1.2, true)]), people * 2, true, material(), true);
    const birds = life.pigeons.length;
    this.pigeon = new Part(pigeon(), birds, true, material(), true);
    this.wing = new Part(wing(), birds * 2, true, material(), true);
    this.cat = new Part(cat(), life.cats.length, true, material(), true);
    this.phone = new Part(box(0.4, 0.65, 0.12), people, false, glow());
    // Vehicles: a shell and glass per kind; wheels, lamps and the rest shared.
    const traffic = life.traffic;
    const count = (k: VehicleKind) => traffic.vehicles.filter((v) => v.kind === k).length;
    for (const k of KINDS) {
      this.shells[k] = new Part(this.models[k].shell, count(k), true, paint(), true);
      this.glasses[k] = new Part(this.models[k].glass, count(k), false, new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.15, metalness: 0.6 }));
    }
    const fleet = traffic.vehicles.length;
    const buses = count("bus");
    // A light, 3 × 2 fine voxels and one deep, standing out of the vehicle's end from the origin.
    this.lamp = new Part(new VoxelModel().fill(0, 0, 0, 3, 2, 1).mesh("solid", [1.5, 0, 0]), fleet * 4, false, glow());
    this.taxiSign = new Part(new VoxelModel().fill(0, 0, 0, 8, 3, 4).mesh("solid", [4, 0, 2]), count("taxi"), false, glow());
    // The bus's windows, lit from inside, its front door and its destination sign (in the bus's model).
    const bus = this.models.bus;
    this.windows = new Part(bus.windows!, buses, false, glow());
    this.door = new Part(bus.door!, buses, false, glow());
    this.destination = new Part(bus.sign!, buses, false, glow());
    this.bin = new Part(bin(), life.waste.bins.length);
    this.pile = new Part(pile(), Math.min(life.waste.bins.length, 6));
    this.buildShelters(life);
    for (const p of [this.torso, this.head, this.hair, this.leg, this.arm, this.seatedLeg, this.pigeon, this.wing, this.cat, ...this.vehicleParts()]) this.group.add(p.mesh);
    this.group.add(this.shelters);
  }

  private vehicleParts(): Part[] {
    return [this.phone, ...KINDS.flatMap((k) => [this.shells[k], this.glasses[k]]).filter((p, i, a) => a.indexOf(p) === i), this.lamp, this.taxiSign, this.windows, this.door, this.destination, this.bin, this.pile];
  }

  /** A bus shelter at each stop (fine voxels): a canopy on two posts, a bench, a glass back, and a sign in the route's color. */
  private buildShelters(life: Life) {
    const v = new VoxelModel();
    for (const x of [-14, 12]) v.fill(x, 0, -7, x + 2, 36, -5);
    v.fill(-15, 36, -10, 15, 38, 5);
    v.fill(-12, 8, -9, 12, 10, -4);
    for (const x of [-11, 10]) v.fill(x, 0, -8, x + 1, 8, -7);
    v.fill(-12, 12, -7, 12, 34, -6, 0xffffff, "pane");
    v.fill(13, 38, -10, 14, 45, -3, 0xffffff, "sign");
    const frame = v.mesh("solid");
    const pane = v.mesh("pane");
    const sign = v.mesh("sign");
    const dark = withVoxelLook(new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.6, metalness: 0.4 }), "shelter-voxel");
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

  /** Colors the people, animals and vehicles by their state (the debug view's Agents lens), or by themselves. */
  setStateLens(on: boolean) {
    this.stateLens = on;
  }

  /** Steps the simulation and poses everything. */
  update(dt: number) {
    this.life.step(dt);
    const { m, base, t, r, half } = this;
    const parts = [this.torso, this.head, this.hair, this.leg, this.arm, this.seatedLeg, this.pigeon, this.wing, this.cat, ...this.vehicleParts()];
    for (const p of parts) p.begin();

    for (const p of this.life.people) {
      if (p.activity === "away" || p.activity === "ride") continue;
      const seated = p.activity === "use" && p.use === "seat";
      const lens = this.stateLens ? STATES[personState(p)].color : -1;
      const bob = p.moving ? Math.abs(Math.sin(p.phase)) * 0.18 : 0;
      base.makeRotationY(p.heading).setPosition(p.x - half, p.y + bob, p.z - half);
      if (seated) {
        // On the seat: the body from the seat up, a little back; legs bent forward and down, hands
        // on the knees.
        this.torso.add(m.multiplyMatrices(base, t.makeTranslation(0, 0, -0.3)), lens < 0 ? p.shirt : lens);
        this.head.add(m.multiplyMatrices(base, t.makeTranslation(0, TORSO + 0.05, -0.3)), lens < 0 ? p.skin : lens);
        this.hair.add(m.multiplyMatrices(base, t.makeTranslation(0, TORSO + 0.05, -0.3)), lens < 0 ? p.hair : lens);
        for (const s of [-1, 1]) {
          this.seatedLeg.add(m.multiplyMatrices(base, t.makeTranslation(s * 0.33, 0, -0.3)), lens < 0 ? p.pants : lens);
          m.multiplyMatrices(base, t.makeTranslation(s * SHOULDER, TORSO - 0.1, -0.3)).multiply(r.makeRotationX(-0.75));
          this.arm.add(m, lens < 0 ? p.shirt : lens);
        }
        continue;
      }
      this.torso.add(m.multiplyMatrices(base, t.makeTranslation(0, HIP, 0)), lens < 0 ? p.shirt : lens);
      this.head.add(m.multiplyMatrices(base, t.makeTranslation(0, HIP + TORSO + 0.05, 0)), lens < 0 ? p.skin : lens);
      this.hair.add(m.multiplyMatrices(base, t.makeTranslation(0, HIP + TORSO + 0.05, 0)), lens < 0 ? p.hair : lens);
      // Legs swing as they walk, arms the other way; hailing a taxi, the right arm holds a glowing
      // phone up (the right is -x).
      const swing = p.moving ? Math.sin(p.phase) * 0.55 : 0;
      const hailing = p.activity === "use" && p.use === "curb";
      for (const s of [-1, 1]) {
        m.multiplyMatrices(base, t.makeTranslation(s * 0.33, HIP, 0)).multiply(r.makeRotationX(swing * s));
        this.leg.add(m, lens < 0 ? p.pants : lens);
        const raised = hailing && s < 0;
        m.multiplyMatrices(base, t.makeTranslation(s * SHOULDER, HIP + TORSO - 0.1, 0)).multiply(r.makeRotationX(raised ? -2.5 : -swing * s * 0.8));
        this.arm.add(m, lens < 0 ? p.shirt : lens);
        if (raised) this.phone.add(m.multiply(t.makeTranslation(0, -ARM - 0.6, 0.05)), PHONE);
      }
    }

    for (const b of this.life.pigeons) {
      const color = this.stateLens ? STATES[pigeonState(b)].color : b.color;
      base.makeRotationY(b.heading).setPosition(b.x - half, b.y, b.z - half);
      if (b.activity !== "ground") {
        const pitch = -Math.atan2(b.vy, Math.hypot(b.vx, b.vz) || 1) * 0.6;
        base.multiply(r.makeRotationX(pitch));
        this.pigeon.add(base, color);
        const beat = Math.sin(b.flap) * (b.activity === "land" ? 0.5 : 0.9);
        for (const s of [-1, 1]) {
          m.multiplyMatrices(base, t.makeTranslation(s * 0.375, 0.6, 0.1)).multiply(r.makeRotationZ(s > 0 ? beat : Math.PI - beat));
          this.wing.add(m, color);
        }
      } else {
        // Pecking: the body tips forward.
        this.pigeon.add(m.multiplyMatrices(base, r.makeRotationX(b.peck * 0.7)), color);
      }
    }

    for (const c of this.life.cats) {
      base.makeRotationY(c.heading).setPosition(c.x - half, c.y, c.z - half);
      if (c.activity === "rest") m.multiplyMatrices(base, r.makeRotationX(-0.55)).multiply(t.makeScale(1, 1, 0.8));
      else if (c.activity === "hunt" && c.stage === "stalk") m.multiplyMatrices(base, t.makeScale(1, 0.7, 1.08));
      else if (c.activity === "hunt" || c.activity === "flee") m.multiplyMatrices(base, t.makeTranslation(0, Math.abs(Math.sin(c.phase)) * 0.4, 0)).multiply(r.makeScale(1, 0.85, 1.2));
      else m.copy(base).multiply(t.makeTranslation(0, Math.abs(Math.sin(c.phase)) * 0.08, 0));
      this.cat.add(m, this.stateLens ? STATES[catState(c)].color : c.color);
    }

    for (const v of this.life.traffic.vehicles) {
      if (v.activity === "off") continue;
      const model = this.models[v.kind];
      base.makeRotationY(v.heading).setPosition(v.x - half, v.y, v.z - half).multiply(r.makeRotationX(-v.pitch));
      this.shells[v.kind].add(base, this.stateLens ? STATES[vehicleState(v)].color : v.color);
      this.glasses[v.kind].add(base, GLASS);
      const { x: lx, y: ly, z: lz } = model.lamp;
      for (const s of [-1, 1]) {
        this.lamp.add(m.multiplyMatrices(base, t.makeTranslation(s * lx, ly, lz)), HEADLIGHT);
        this.lamp.add(m.multiplyMatrices(base, t.makeTranslation(s * lx, ly, -lz - FINE)), v.braking ? BRAKE : TAIL);
      }
      // On the cabin's roof.
      if (v.kind === "taxi") this.taxiSign.add(m.multiplyMatrices(base, t.makeTranslation(0, 5.25, -0.75)), v.fare ? TAXI_HIRED : TAXI_FREE);
      if (v.kind === "bus") {
        this.windows.add(base, INTERIOR);
        this.door.add(base, v.activity === "stand" ? INTERIOR : DOOR);
        this.destination.add(base, v.color);
      }
    }

    // The bins, tinted by how full they are, and the piles beside them (behind, away from the road).
    let bag = 0;
    for (const b of this.life.waste.bins) {
      base.makeRotationY(b.heading).setPosition(b.x - half, b.y, b.z - half);
      this.bin.add(base, this.tint.copy(BIN_EMPTY).lerp(BIN_FULL, b.fill).getHex());
      if (b.pile) this.pile.add(m.multiplyMatrices(base, t.makeTranslation(2.6, 0, -2.2)), BAGS[bag++ % BAGS.length]);
    }

    for (const p of parts) p.end();
  }

  dispose() {
    for (const p of [this.torso, this.head, this.hair, this.leg, this.arm, this.seatedLeg, this.pigeon, this.wing, this.cat]) p.dispose();
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
