import type { Parks } from "../city/parks";
import type { BuildingPlan } from "../city/placement";
import type { Plaza, Street } from "../terrain/streets";
import { Rng } from "../rng";
import { voxels } from "../scale";
import { BUS_SEATS, Traffic, type Fare, type Stop, type TrafficCounts, type Vehicle } from "./traffic";
import { CAT_STEP, FAR, FieldJob, GROUND, STEP, canStep, downhill, forPeople, nearestWalk, walkMap, type WalkMap } from "./walk";

/**
 * The city's inhabitants (pure: no three.js; the renderer reads the arrays). Three kinds, each
 * from one of the agent models, and each reacting to the others:
 *
 * - People, driven by needs (as in The Sims, on Maslow's order). Rest, thirst, company and, the
 *   longer they are out, home grow at each one's own rates. Whenever someone is only strolling,
 *   the most basic need past its threshold wins: thirst, then rest, then company, then home. A
 *   small state machine carries it out: walk there (down the need's flow field), then sit on a
 *   bench, buy a drink at a vending machine, or stand and talk with whoever else came to the
 *   fountain or the plaza; going home, they walk into a door, and someone else comes out of one.
 *   Strolling, they walk to one of a few far points of the city in turn.
 *   They have bodies: no one walks into a wall, a prop or another person. Walkers keep their
 *   distance and step to the right of anyone coming the other way; someone who has made no headway
 *   for a while squeezes past the people in the way, and if even that fails, goes somewhere else.
 * - Pigeons, in flocks (Reynolds' boids). Each flock has its roost, the plaza or a park's court.
 *   On the ground they peck and hop; anyone coming close puts one up, and its alarm spreads to the
 *   flock. In the air they keep apart, match their neighbors' heading and keep together, circling
 *   over the roost clear of the roofs, and land again when it has been quiet for a while.
 * - Cats, hunting them (predator and prey, with perception). A cat prowls its home range and sees
 *   pigeons in a cone in front of it, unless a building or a wall is in the way. It stalks one,
 *   slowly and low, which a pigeon notices only late, then sprints; the pigeon's flock goes up and
 *   the cat sits down to wash. People walking by scare cats off.
 * - Traffic (traffic.ts), which people live alongside: someone about to step off the curb waits
 *   while a vehicle is coming and hurries across, and vehicles brake for anyone in front of them;
 *   no one walks into a vehicle. Going home, some walk to a door, some to a bus shelter to wait
 *   for their bus, and some to the curb to hail a taxi; riders get off at other stops, or wherever
 *   their taxi takes them, and walk on from there. Pigeons go up as a vehicle passes.
 */

/** Walking speeds (voxels per second: 4 is 1 m/s). */
const WALK = [4.4, 6];
const CAT_PROWL = 2.6;
const CAT_STALK = 1.4;
const CAT_SPRINT = 16;
/** How close (columns of path cost: 2 per column) counts as there. */
const ARRIVE = 4;
/** The most people that stand talking in one circle. */
const GROUP = 4;
/** People keep this far apart (voxels), and are never closer than BODY; a person is RADIUS round (walls, props). */
const PERSONAL = 2.4;
const BODY = 1.6;
const RADIUS = 0.75;
const CAT_RADIUS = 0.35;
/** Seconds without getting nearer before a walker squeezes past (for SQUEEZE seconds); after TRIES of those, it goes elsewhere. */
const STUCK = 2.5;
const SQUEEZE = 1.5;
const TRIES = 3;
/** A pigeon walks off from anyone coming within WARY, and flies from closer than SCARE_PERSON (voxels); a cat scares one from: stalking, and sprinting. */
const WARY = 9;
const SCARE_PERSON = 3.5;
const SCARE_STALK = 7;
const SCARE_SPRINT = 20;
/** A cat's sight: range (voxels) and half angle. */
const SIGHT = 44;
const CONE = Math.PI / 3;
/** A cat breaks into its sprint this close, and keeps within its home range. */
const POUNCE = 11;
const RANGE = 48;
/** Boids: neighbor reach, the gap kept, and the flying speeds (voxels per second). */
const FLOCK = 16;
const GAP = 3;
const FLY = [16, 26];
/** Pigeons circle this far out from their roost and this high over it, and keep this far over roofs. */
const ORBIT = 34;
const CRUISE = [36, 70];
const CLEAR = 8;
/** Sky grid cell (columns): the highest roof in each, for the pigeons. */
const SKY_CELL = 8;
/** Strolling targets. */
const STROLLS = 8;
/** A slice of the fields' work per step (ms). */
const SLICE = 3;
/** Going home: the share who take the bus, and who take a taxi (the rest walk to a door). */
const BY_BUS = 0.25;
const BY_TAXI = 0.1;
/** How long someone waits (s) for a bus, for a taxi, and at the curb for a gap in the traffic. */
const BUS_WAIT = 150;
const TAXI_WAIT = 90;
const CROSS_WAIT = 12;
/** Done waiting, how long (s) someone walks on before minding the traffic again (time to cross a street). */
const CROSS_GO = 4;
/** Crossing the road, people walk this much faster; stepping out of a vehicle's way, this fast (voxels per second). */
const HURRY = 1.35;
const MAKE_WAY = 5;

/**
 * A person is three layers deep (after Reynolds: action selection, steering, locomotion):
 * - the goal: the need being met (none while strolling), and the field walked down to it;
 * - the activity, the one state machine (after F.E.A.R.'s "Goto" and "Animate"): walking
 *   somewhere, using something there, riding, or away indoors;
 * - the motion: how it moved this step (reported only; nothing decides on it).
 * What is used says the rest (as The Sims' smart objects): where to stand, for how long, and what
 * ends it.
 */
export type Activity = "walk" | "use" | "ride" | "away";
/** What people use: a seat, a vending machine, a circle of talkers, a bus shelter, the curb (hailing a taxi). */
export type Use = "seat" | "vending" | "circle" | "shelter" | "curb";
/** Walking, the leg: down the goal's field; to the path in front of a seat, onto it and off again; to a vehicle's door. */
export type Leg = "field" | "front" | "onto" | "off" | "door";
export type Motion = "stand" | "walk" | "step" | "wait-to-cross" | "squeeze" | "wander" | "make-way";
export type Need = "thirst" | "rest" | "social" | "home";
/** Needs in order: the more basic first. */
const NEEDS: Need[] = ["thirst", "rest", "social", "home"];
const DUE: Record<Need, string> = { thirst: "thirsty", rest: "tired", social: "wants company", home: "time to go home" };

export interface Person {
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  moving: boolean;
  /** Walk cycle, radians. */
  phase: number;
  activity: Activity;
  /** Walking: the leg; using: what. */
  leg: Leg;
  use: Use | null;
  motion: Motion;
  /** How long (s) in this activity, and why it began. */
  since: number;
  why: string;
  /** The flow field being followed ("rest", "stroll3"…). */
  goal: string;
  need: Need | null;
  needs: Record<Need, number>;
  rates: Record<Need, number>;
  timer: number;
  seat: Seat | null;
  /** Going home: on foot to a door, by bus or by taxi; the shelter, the fare, and the vehicle being boarded or ridden. */
  ride: "door" | "bus" | "taxi";
  stop: Stop | null;
  fare: Fare | null;
  vehicle: Vehicle | null;
  /** How long it has waited at the curb for a gap in the traffic. */
  cross: number;
  /** Getting on: the goal being measured, the nearest it has come, how long since, how long it may still squeeze past people, and how often it has had to. */
  track: string;
  best: number;
  stuck: number;
  squeeze: number;
  tries: number;
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
}

export interface Seat {
  /** The path column in front, where sitters come from and get up to. */
  k: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  taken: boolean;
}

/** A pigeon is on the ground (pecking and hopping about its roost), flying with its flock, or coming down to land. */
export type PigeonActivity = "ground" | "fly" | "land";

export interface Pigeon {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  flock: number;
  activity: PigeonActivity;
  /** How long (s) in this activity, and why it began. */
  since: number;
  why: string;
  /** Ground: time to the next hop or peck; air: time to land. */
  timer: number;
  /** Hop: where to, and how far along (1 is done). */
  hop: [number, number, number, number, number] | null;
  hopT: number;
  peck: number;
  flap: number;
  color: number;
}

/**
 * A cat prowls its home range, rests, hunts a pigeon it has seen, or flees from people; a hunt has
 * two stages, stalking (slow and low) and the sprint.
 */
export type CatActivity = "prowl" | "rest" | "hunt" | "flee";

export interface Cat {
  x: number;
  z: number;
  y: number;
  heading: number;
  homeX: number;
  homeZ: number;
  activity: CatActivity;
  stage: "stalk" | "sprint";
  /** How long (s) in this activity, and why it began. */
  since: number;
  why: string;
  timer: number;
  /** Hunting: the pigeon. */
  prey: number;
  speed: number;
  phase: number;
  color: number;
}

interface Roost {
  x: number;
  z: number;
  y: number;
  /** Ground the flock lands on. */
  spots: number[];
  angle: number;
  quiet: number;
}

interface Spot {
  k: number;
  x: number;
  z: number;
  y: number;
  heading: number;
}

const SHIRTS = [0x2b3a55, 0x8a2e3b, 0xc9c2b3, 0x3f6b5a, 0xd08a2e, 0x1d1f26, 0x5a4a8a, 0xe2e4e8, 0x2e7d8a, 0xb5483a, 0x6b6f78, 0xe0b040];
const PANTS = [0x22252e, 0x2f3b52, 0x4a4036, 0x15171c, 0x5c6170, 0x7a6a52];
const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc68863, 0x8d5a3b, 0x5e3a26, 0xf6d7bd];
const HAIRS = [0x1b1714, 0x3b2a1e, 0x6b4a2b, 0xb08a52, 0x9a9a9a, 0x2a2a35, 0xc4572e];
const PIGEONS = [0x7d8590, 0x7d8590, 0x6c7480, 0x8e96a0, 0xd8d8d4, 0x6a5444];
const CATS = [0xd9822b, 0x222224, 0x8a8a8e, 0xeeeae2, 0x6b5440, 0xc9a26b];

export interface LifeCounts extends TrafficCounts {
  people: number;
  pigeons: number;
  cats: number;
}

export class Life {
  readonly map: WalkMap;
  readonly traffic: Traffic;
  readonly people: Person[] = [];
  readonly pigeons: Pigeon[] = [];
  readonly cats: Cat[] = [];
  private readonly rng: Rng;
  private readonly sources = new Map<string, number[]>();
  private readonly fields = new Map<string, Uint16Array>();
  private readonly wanted: string[] = [];
  private job: { name: string; job: FieldJob } | null = null;
  private readonly seats: Seat[] = [];
  private readonly vending: Spot[] = [];
  private readonly doors: number[] = [];
  private readonly roosts: Roost[] = [];
  private readonly sky: Int16Array;
  private readonly skyN: number;
  /** People by grid cell, rebuilt each step, for keeping apart and for scaring animals. */
  private readonly grid = new Map<number, Person[]>();

  constructor(claim: Uint8Array, parks: Parks, plans: BuildingPlan[], plaza: Plaza | undefined, streets: Street[], seed: number, count: LifeCounts) {
    this.rng = new Rng(seed ^ 0x11fe);
    const map = (this.map = walkMap(claim, parks, plans));
    const { n, y, walk } = map;
    this.traffic = new Traffic(map, streets, seed, count, {
      near: (x, z, r) => this.near(x, z, r, this.ahead),
      alight: (p, x, z, heading) => this.alight(p, x, z, heading),
    });

    // Where things are: benches (two seats each), vending machines, doors, places to meet, roosts.
    const social: number[] = [];
    const ring = (cx: number, cz: number, r0: number, r1: number, every: number) => {
      for (let z = Math.floor(cz - r1); z <= cz + r1; z += every) {
        for (let x = Math.floor(cx - r1); x <= cx + r1; x += every) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d >= r0 && d <= r1 && x >= 0 && z >= 0 && x < n && z < n && walk[z * n + x] === GROUND.paving) social.push(z * n + x);
        }
      }
    };
    const rest: number[] = [];
    const drink: number[] = [];
    for (const park of parks.parks) {
      for (const p of park.props) {
        const fx = Math.sin(p.rotation);
        const fz = Math.cos(p.rotation);
        if (p.kind === "bench") {
          const k = nearestWalk(map, p.x + fx * 3, p.z + fz * 3, 3);
          if (k < 0) continue;
          rest.push(k);
          // The seats: either side of the bench's middle, on the seat (its top), facing the path.
          for (const s of [-1, 1]) {
            const u = s * voxels(0.45);
            this.seats.push({ k, x: p.x + u * Math.cos(p.rotation) + fx * 0.15, z: p.z - u * Math.sin(p.rotation) + fz * 0.15, y: p.y + voxels(0.42) + 0.25, heading: p.rotation, taken: false });
          }
        } else if (p.kind === "vending") {
          const k = nearestWalk(map, p.x + fx * 3, p.z + fz * 3, 3);
          if (k < 0) continue;
          drink.push(k);
          this.vending.push({ k, x: p.x + fx * 3.2, z: p.z + fz * 3.2, y: p.y, heading: p.rotation + Math.PI });
        } else if (p.kind === "fountain" || p.kind === "pavilion") ring(p.x, p.z, 14, 20, 2);
      }
      this.addRoost(park.x, park.z, 22);
    }
    if (plaza) {
      const landmark = plans.find((p) => p.lot < 0);
      const inner = landmark ? voxels(landmark.width) / 2 + 3 : 4;
      ring(plaza.x, plaza.z, inner, plaza.half - 2, 3);
      this.addRoost(plaza.x, plaza.z, plaza.half);
    }
    for (const plan of plans) {
      if (plan.lot < 0) continue;
      const fx = Math.sin(plan.rotation);
      const fz = Math.cos(plan.rotation);
      const k = nearestWalk(map, plan.x + fx * (voxels(plan.depth) / 2 + 2), plan.z + fz * (voxels(plan.depth) / 2 + 2), 6);
      if (k >= 0) this.doors.push(k);
    }
    this.sources.set("rest", rest);
    this.sources.set("thirst", drink);
    this.sources.set("social", social);
    this.sources.set("home", this.doors);
    this.sources.set("bus", this.traffic.stops.map((s) => s.k));
    this.sources.set("curb", this.traffic.curbs);
    // Strolls: far apart points on the sidewalks, each the farthest from those picked so far.
    const paving: number[] = [];
    // (Clear of edges, so no one starts against a wall.)
    for (let k = 0; k < n * n; k += 7) if (walk[k] === GROUND.paving && !map.edge[k]) paving.push(k);
    const picked: number[] = [];
    for (let i = 0; i < STROLLS && paving.length; i++) {
      let best = paving[Math.floor(this.rng.next() * paving.length)];
      if (picked.length) {
        let bd = -1;
        for (let t = 0; t < 200; t++) {
          const k = paving[Math.floor(this.rng.next() * paving.length)];
          const d = Math.min(...picked.map((q) => Math.hypot((q % n) - (k % n), ((q / n) | 0) - ((k / n) | 0))));
          if (d > bd) {
            bd = d;
            best = k;
          }
        }
      }
      picked.push(best);
      this.sources.set(`stroll${i}`, [best]);
    }

    // The sky: the highest roof (or ground) per cell.
    this.skyN = Math.ceil(n / SKY_CELL);
    this.sky = new Int16Array(this.skyN * this.skyN);
    for (let k = 0; k < n * n; k++) {
      const c = ((k / n) / SKY_CELL | 0) * this.skyN + ((k % n) / SKY_CELL | 0);
      this.sky[c] = Math.max(this.sky[c], y[k]);
    }
    for (const p of plans) {
      const r = Math.hypot(voxels(p.width), voxels(p.depth)) / 2;
      const top = p.base + voxels(p.height);
      for (let cz = Math.floor((p.z - r) / SKY_CELL); cz <= (p.z + r) / SKY_CELL; cz++) {
        for (let cx = Math.floor((p.x - r) / SKY_CELL); cx <= (p.x + r) / SKY_CELL; cx++) {
          if (cx >= 0 && cz >= 0 && cx < this.skyN && cz < this.skyN) this.sky[cz * this.skyN + cx] = Math.max(this.sky[cz * this.skyN + cx], top);
        }
      }
    }

    // People, out already, on the paving.
    for (let i = 0; i < count.people && paving.length; i++) {
      const k = paving[Math.floor(this.rng.next() * paving.length)];
      this.people.push(this.person(k));
    }
    // Pigeons: one flock per roost, sharing the count.
    const roosts = this.roosts.filter((r) => r.spots.length > 10);
    for (let i = 0; i < count.pigeons && roosts.length; i++) {
      const flock = i % roosts.length;
      const r = roosts[flock];
      const k = r.spots[Math.floor(this.rng.next() * r.spots.length)];
      this.pigeons.push({
        x: (k % n) + this.rng.next(),
        z: ((k / n) | 0) + this.rng.next(),
        y: y[k],
        vx: 0,
        vy: 0,
        vz: 0,
        heading: this.rng.range(0, Math.PI * 2),
        flock: this.roosts.indexOf(r),
        activity: "ground",
        since: 0,
        why: "at its roost",
        timer: this.rng.range(0, 2),
        hop: null,
        hopT: 1,
        peck: 0,
        flap: this.rng.range(0, 6),
        color: this.rng.pick(PIGEONS),
      });
    }
    // Cats: a home range around the roosts, one or two each.
    for (let i = 0; i < count.cats && roosts.length; i++) {
      const r = roosts[i % roosts.length];
      const k = r.spots[Math.floor(this.rng.next() * r.spots.length)];
      const x = (k % n) + 0.5;
      const z = ((k / n) | 0) + 0.5;
      this.cats.push({ x, z, y: y[k], heading: this.rng.range(0, Math.PI * 2), homeX: r.x, homeZ: r.z, activity: "prowl", stage: "stalk", since: 0, why: "out prowling", timer: this.rng.range(2, 6), prey: -1, speed: 0, phase: 0, color: this.rng.pick(CATS) });
    }
  }

  private addRoost(x: number, z: number, reach: number) {
    const { n, walk, y } = this.map;
    const spots: number[] = [];
    for (let Z = Math.floor(z - reach); Z <= z + reach; Z++) {
      for (let X = Math.floor(x - reach); X <= x + reach; X++) {
        if (X < 0 || Z < 0 || X >= n || Z >= n) continue;
        const k = Z * n + X;
        if ((walk[k] === GROUND.paving || walk[k] === GROUND.lawn) && Math.hypot(X - x, Z - z) <= reach) spots.push(k);
      }
    }
    const k = Math.min(n * n - 1, Math.max(0, Math.round(z) * n + Math.round(x)));
    this.roosts.push({ x, z, y: y[k], spots, angle: this.rng.range(0, Math.PI * 2), quiet: 0 });
  }

  private person(k: number): Person {
    const { n, y } = this.map;
    const r = this.rng;
    return {
      x: (k % n) + 0.5,
      z: ((k / n) | 0) + 0.5,
      y: y[k],
      heading: r.range(0, Math.PI * 2),
      speed: r.range(WALK[0], WALK[1]),
      moving: false,
      phase: r.range(0, 6),
      activity: "walk",
      leg: "field",
      use: null,
      motion: "stand",
      since: 0,
      why: "out for a stroll",
      goal: `stroll${r.int(0, STROLLS - 1)}`,
      need: null,
      needs: { thirst: r.range(0, 0.5), rest: r.range(0, 0.6), social: r.range(0, 0.6), home: r.range(0, 0.5) },
      // Per second: a need takes one to five minutes to come due.
      rates: { thirst: r.range(1 / 300, 1 / 120), rest: r.range(1 / 300, 1 / 120), social: r.range(1 / 360, 1 / 150), home: r.range(1 / 400, 1 / 150) },
      timer: 0,
      seat: null,
      ride: "door",
      stop: null,
      fare: null,
      vehicle: null,
      cross: 0,
      track: "",
      best: FAR,
      stuck: 0,
      squeeze: 0,
      tries: 0,
      shirt: r.pick(SHIRTS),
      pants: r.pick(PANTS),
      skin: r.pick(SKINS),
      hair: r.pick(HAIRS),
    };
  }

  /** A field, or null while it waits its turn to be worked out (one per step). */
  private field(name: string): Uint16Array | null {
    const f = this.fields.get(name);
    if (f) return f;
    if (!this.wanted.includes(name)) this.wanted.push(name);
    return null;
  }

  /** How many fields are still to be worked out. */
  get pending() {
    return this.wanted.length + (this.job ? 1 : 0);
  }

  /** A slice of the fields' work. */
  private work() {
    if (!this.job && this.wanted.length) {
      const name = this.wanted.shift()!;
      this.job = { name, job: new FieldJob(this.map, this.sources.get(name) ?? []) };
    }
    if (this.job) {
      const done = this.job.job.run(SLICE);
      if (done) {
        this.fields.set(this.job.name, done);
        this.job = null;
      }
    }
  }

  step(dt: number) {
    dt = Math.min(dt, 0.1);
    this.work();
    this.grid.clear();
    for (const p of this.people) {
      if (p.activity === "away" || p.activity === "ride") continue;
      const c = this.cell(p.x, p.z);
      const list = this.grid.get(c);
      if (list) list.push(p);
      else this.grid.set(c, [p]);
    }
    for (const p of this.people) this.stepPerson(p, dt);
    this.traffic.step(dt);
    for (const r of this.roosts) {
      r.angle += dt * 0.35;
      r.quiet += dt;
    }
    for (const c of this.cats) this.stepCat(c, dt);
    for (const b of this.pigeons) this.stepPigeon(b, dt);
  }

  private cell(x: number, z: number) {
    return ((z / 8) | 0) * 1024 + ((x / 8) | 0);
  }

  /** People within `r` of (x, z). */
  private near(x: number, z: number, r: number, out: Person[] = []): Person[] {
    out.length = 0;
    for (let cz = Math.floor((z - r) / 8); cz <= (z + r) / 8; cz++) {
      for (let cx = Math.floor((x - r) / 8); cx <= (x + r) / 8; cx++) {
        for (const p of this.grid.get(cz * 1024 + cx) ?? []) if (Math.hypot(p.x - x, p.z - z) < r) out.push(p);
      }
    }
    return out;
  }

  private readonly around: Person[] = [];
  private readonly ahead: Person[] = [];

  /* ---------- People ---------- */

  private stepPerson(p: Person, dt: number) {
    for (const need of NEEDS) p.needs[need] = Math.min(1.5, p.needs[need] + p.rates[need] * dt);
    p.moving = false;
    p.motion = "stand";
    p.timer -= dt;
    p.since += dt;
    // Right beside a vehicle (or caught by its corner on a turn): step out of its way (unless seated,
    // getting on or aboard).
    const settled = p.activity === "ride" || p.activity === "away" || (p.activity === "use" ? p.use === "seat" : p.leg === "onto" || p.leg === "door");
    const away = settled ? null : this.traffic.clearOf(p.x, p.z, RADIUS + 0.8);
    if (away) this.move(p, away.x * MAKE_WAY * dt, away.z * MAKE_WAY * dt);
    if (p.activity === "walk") this.walking(p, dt);
    else if (p.activity === "use") this.using(p, dt);
    // Away: someone else comes out of a door.
    else if (p.activity === "away" && p.timer <= 0 && this.doors.length) {
      Object.assign(p, this.person(this.doors[Math.floor(this.rng.next() * this.doors.length)]), { needs: { thirst: 0.2, rest: 0, social: 0.2, home: 0 }, why: "came out of a door" });
    }
    if (away) p.motion = "make-way";
  }

  /* People, the activities. */

  /** Off to use something, for `seconds` (or, waiting for a ride, until it comes). */
  private startUse(p: Person, use: Use, seconds: number, why: string) {
    p.use = use;
    p.timer = seconds;
    into(p, "use", why);
  }

  /** Walking the last steps: to a seat, off it, or to a vehicle's door. */
  private startLeg(p: Person, leg: Leg, why: string) {
    p.leg = leg;
    into(p, "walk", why);
  }

  /** Using something: until done with it, or (waiting for a ride) until the ride comes or it has been too long. */
  private using(p: Person, dt: number) {
    switch (p.use) {
      case "shelter": {
        // Facing the road, until the bus pulls up with a seat free.
        const st = p.stop!;
        p.heading = turn(p.heading, st.heading, dt * 3);
        this.spread(p, dt);
        if (st.bus && this.traffic.open(st.bus) && st.bus.riders.length < BUS_SEATS) {
          p.vehicle = st.bus;
          this.startLeg(p, "door", "the bus is here");
        } else if (p.timer <= 0) this.giveUp(p, "no bus came");
        return;
      }
      case "curb": {
        // Until a taxi pulls up for them (or the taxi gives up).
        const f = p.fare;
        if (f?.ready && f.taxi && this.traffic.open(f.taxi)) {
          p.vehicle = f.taxi;
          this.startLeg(p, "door", "the taxi is here");
        } else if (!f || p.timer <= 0) {
          if (f) this.traffic.cancel(f);
          this.giveUp(p, f ? "no taxi came" : "the taxi gave up");
        } else if (f.taxi) p.heading = turn(p.heading, Math.atan2(f.taxi.x - p.x, f.taxi.z - p.z), dt * 3);
        return;
      }
      case "circle":
        this.faceCompany(p, dt);
        this.spread(p, dt);
        break;
      case "vending":
        this.spread(p, dt);
        break;
    }
    if (p.timer > 0) return;
    if (p.need) p.needs[p.need] = 0;
    if (p.use === "seat") {
      p.seat!.taken = false;
      this.startLeg(p, "off", "rested");
      return;
    }
    this.decide(p, `done at the ${p.use}`);
  }

  private walking(p: Person, dt: number) {
    const { n } = this.map;
    switch (p.leg) {
      case "field":
        this.followField(p, dt);
        return;
      case "door": {
        // To the door, and in; if the vehicle leaves first, back to waiting.
        const v = p.vehicle!;
        if (!this.traffic.open(v)) {
          p.vehicle = null;
          if (p.stop) this.startUse(p, "shelter", p.timer, "the bus left");
          else this.giveUp(p, "the taxi left");
          return;
        }
        const d = this.traffic.door(v);
        if (this.straight(p, d.x, d.z, v.y, dt)) {
          leave(p);
          p.fare = null;
          into(p, "ride", "got on");
          this.traffic.board(v, p);
        }
        return;
      }
    }
    const s = p.seat!;
    const tx = (s.k % n) + 0.5;
    const tz = ((s.k / n) | 0) + 0.5;
    switch (p.leg) {
      case "front": {
        // To the path in front of the seat (as any walker).
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (d < 0.5) this.startLeg(p, "onto", "at the seat");
        else if (p.timer <= 0) {
          // Can't get there: rest later.
          s.taken = false;
          p.seat = null;
          p.needs.rest *= 0.5;
          this.decide(p, "could not reach the seat");
        } else this.walkToward(p, (tx - p.x) / d, (tz - p.z) / d, Math.min(p.speed, d * 4), dt);
        return;
      }
      case "onto":
        // Straight onto it.
        if (this.straight(p, s.x, s.z, s.y, dt)) {
          p.y = s.y;
          p.heading = s.heading;
          this.startUse(p, "seat", this.rng.range(20, 60), "sat down");
        }
        return;
      case "off":
        // Up, and back onto the path.
        if (this.straight(p, tx, tz, this.map.y[s.k], dt)) {
          p.seat = null;
          this.decide(p, "got up");
        }
        return;
    }
  }

  /** Down the goal's field: strolling, or to what meets the need. */
  private followField(p: Person, dt: number) {
    const { n } = this.map;
    if (!p.need && p.timer <= 0) this.decide(p, "strolling on", false);
    const field = this.field(p.goal);
    const k = Math.min(n - 1, p.z | 0) * n + Math.min(n - 1, p.x | 0);
    if (!field) return;
    if (field[k] <= ARRIVE || field[k] === FAR) {
      this.reach(p, field[k] === FAR);
      // Nowhere it wants to go can be reached from here: wander.
      if (p.goal === "wander") this.wander(p, dt);
      return;
    }
    let tx = p.x;
    let tz = p.z;
    const a = downhill(this.map, field, k);
    if (a >= 0) {
      const b = downhill(this.map, field, a);
      const t = b >= 0 ? b : a;
      tx = (t % n) + 0.5;
      tz = ((t / n) | 0) + 0.5;
    }
    // At the curb: wait for a gap in the traffic (not for ever); once on the road, hurry.
    const { walk } = this.map;
    const fd = Math.hypot(tx - p.x, tz - p.z) || 1;
    const ahead = Math.min(n - 1, Math.max(0, (p.z + ((tz - p.z) / fd) * 2) | 0)) * n + Math.min(n - 1, Math.max(0, (p.x + ((tx - p.x) / fd) * 2) | 0));
    const onRoad = walk[k] === GROUND.road;
    if (!onRoad && walk[ahead] === GROUND.road && p.cross < CROSS_WAIT && this.traffic.danger(p.x, p.z)) {
      p.cross += dt;
      p.motion = "wait-to-cross";
      return;
    }
    // Waited long enough: it goes, and minds the traffic again only CROSS_GO seconds on (reset at
    // once, one step along the curb would start the wait again, and it could wait there for ever).
    if (p.cross >= CROSS_WAIT) {
      if ((p.cross += dt) > CROSS_WAIT + CROSS_GO) p.cross = 0;
    } else if (!onRoad) p.cross = 0;
    // Headway: nearer the goal than ever, or stuck. Stuck a while, squeeze past people; stuck
    // through that again and again, give up and go elsewhere.
    if (p.track !== p.goal) {
      p.track = p.goal;
      p.best = field[k];
      p.stuck = 0;
      p.tries = 0;
    } else if (field[k] < p.best) {
      p.best = field[k];
      p.stuck = 0;
      p.tries = 0;
    } else if ((p.stuck += dt) > STUCK) {
      p.stuck = 0;
      p.squeeze = SQUEEZE;
      if (++p.tries > TRIES) {
        // Put the need off, and go somewhere else.
        if (p.need) p.needs[p.need] *= 0.5;
        this.stroll(p, "stuck: going elsewhere");
        return;
      }
    }
    this.walkToward(p, (tx - p.x) / fd, (tz - p.z) / fd, p.speed * (p.need ? 1.1 : 1) * (onRoad ? HURRY : 1), dt);
  }

  /**
   * A step toward (dx, dz) (a unit vector): keeping a distance from the people around, to the right
   * of anyone coming the other way, never into them (unless squeezing past) and never into a wall.
   */
  private walkToward(p: Person, dx: number, dz: number, speed: number, dt: number) {
    p.squeeze = Math.max(0, p.squeeze - dt);
    const fx = dx;
    const fz = dz;
    if (!p.squeeze) {
      for (const o of this.near(p.x, p.z, PERSONAL * 1.6, this.around)) {
        if (o === p) continue;
        const ox = p.x - o.x;
        const oz = p.z - o.z;
        const od = Math.hypot(ox, oz) || 0.01;
        if (od < PERSONAL) {
          const push = (PERSONAL - od) / PERSONAL;
          dx += (ox / od) * push * 1.2;
          dz += (oz / od) * push * 1.2;
        }
        // Someone ahead, coming this way: bear right.
        const ahead = -(ox * fx + oz * fz) / od;
        if (ahead > 0.5 && o.moving && Math.sin(o.heading) * fx + Math.cos(o.heading) * fz < 0) {
          dx += -fz * 0.8;
          dz += fx * 0.8;
        }
      }
    }
    // Round a vehicle, not into it.
    const away = this.traffic.clearOf(p.x + fx * 2, p.z + fz * 2, 2.5);
    if (away) {
      dx += away.x * 1.5;
      dz += away.z * 1.5;
    }
    const m = Math.hypot(dx, dz) || 1;
    p.heading = turn(p.heading, Math.atan2(dx, dz), dt * 6);
    const v = speed * dt * Math.min(1, m);
    const sx = Math.sin(p.heading) * v;
    const sz = Math.cos(p.heading) * v;
    // Never into a vehicle (one caught against a vehicle is stepped clear before it walks on).
    if (this.traffic.inside(p.x + sx, p.z + sz, RADIUS)) return;
    this.move(p, sx, sz, STEP, undefined, p.squeeze ? RADIUS * 0.5 : RADIUS);
    p.motion = p.squeeze ? "squeeze" : "walk";
    if (!p.squeeze) {
      this.unstack(p);
      this.unwall(p, dt);
    }
    this.walked(p, dt, speed);
  }

  /** Eases a walker off a wall or prop its body reaches into. */
  private unwall(p: Person, dt: number) {
    const { n, walk } = this.map;
    let dx = 0;
    let dz = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ox = Math.sin(a);
      const oz = Math.cos(a);
      const x = p.x + ox * RADIUS;
      const z = p.z + oz * RADIUS;
      if (!forPeople(walk[Math.min(n - 1, Math.max(0, z | 0)) * n + Math.min(n - 1, Math.max(0, x | 0))])) {
        dx -= ox;
        dz -= oz;
      }
    }
    const m = Math.hypot(dx, dz);
    if (m) this.move(p, (dx / m) * 2 * dt, (dz / m) * 2 * dt);
  }

  /** Steps a walker back out of anyone it has come closer to than BODY. */
  private unstack(p: Person) {
    for (const o of this.near(p.x, p.z, BODY, this.around)) {
      if (o === p) continue;
      const ox = p.x - o.x;
      const oz = p.z - o.z;
      const od = Math.hypot(ox, oz) || 0.01;
      const out = BODY - od;
      this.move(p, (ox / od) * out, (oz / od) * out);
    }
  }

  /** After a step: settle on the ground. */
  private walked(p: Person, dt: number, speed: number) {
    const { n, y } = this.map;
    const k = Math.min(n - 1, p.z | 0) * n + Math.min(n - 1, p.x | 0);
    p.y += (y[k] - p.y) * Math.min(1, dt * 12);
    p.moving = true;
    p.phase += speed * dt * 1.4;
  }

  /** Walking about with no field to follow: on, turning now and then, and away from what it can't step onto. */
  private wander(p: Person, dt: number) {
    if (this.rng.chance(dt * 0.4)) p.heading += this.rng.range(-1, 1);
    const bx = p.x;
    const bz = p.z;
    this.move(p, Math.sin(p.heading) * p.speed * dt, Math.cos(p.heading) * p.speed * dt);
    if (p.x === bx && p.z === bz) p.heading += this.rng.range(1, 2.5);
    this.walked(p, dt, p.speed);
    p.motion = "wander";
  }

  /** A few steps straight to (x, z), off the walking grid (onto a seat, or back off it); true once there. */
  private straight(p: Person, x: number, z: number, y: number, dt: number) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 0.3) {
      p.x = x;
      p.z = z;
      return true;
    }
    const v = Math.min(d, p.speed * 0.6 * dt);
    p.heading = turn(p.heading, Math.atan2(x - p.x, z - p.z), dt * 8);
    p.x += ((x - p.x) / d) * v;
    p.z += ((z - p.z) / d) * v;
    p.y += (y - p.y) * Math.min(1, dt * 4);
    p.moving = true;
    p.motion = "step";
    p.phase += v * 1.4;
    return false;
  }

  /**
   * Moves a walker, sliding along what it can't step onto: its center may only step where a walker
   * can, and its body (`radius` round) only overlap columns it could stand on. (If it is already
   * against something, as after squeezing past people, it keeps what clearance it has.)
   */
  private move(p: { x: number; z: number }, dx: number, dz: number, step = STEP, open?: (k: number) => boolean, radius = RADIUS) {
    const { n, y, walk } = this.map;
    const free = open ?? ((j: number) => forPeople(walk[j]));
    const at = (x: number, z: number) => Math.min(n - 1, Math.max(0, z | 0)) * n + Math.min(n - 1, Math.max(0, x | 0));
    const k = at(p.x, p.z);
    const D = 0.7071;
    const body = (x: number, z: number, r: number) => {
      for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * D, r * D], [r * D, -r * D], [-r * D, r * D], [-r * D, -r * D]]) {
        const j = at(x + ox, z + oz);
        if (j !== k && (!free(j) || Math.abs(y[j] - y[k]) > step)) return false;
      }
      return true;
    };
    // The most of its body that is clear now (after squeezing past, say), kept at least that clear.
    let r = radius;
    while (r > 0.05 && !body(p.x, p.z, r)) r -= radius / 4;
    r = Math.max(0, r);
    const ok = (x: number, z: number) => {
      const j = at(x, z);
      if (j !== k && !canStep(this.map, k, (j % n) - (k % n), ((j / n) | 0) - ((k / n) | 0), step, open)) return false;
      return !r || body(x, z, r);
    };
    if (ok(p.x + dx, p.z + dz)) {
      p.x += dx;
      p.z += dz;
    } else if (ok(p.x + dx, p.z)) p.x += dx;
    else if (ok(p.x, p.z + dz)) p.z += dz;
  }

  /**
   * What next: the most basic need that is due, or (if none) on with the stroll (to another of the
   * far points if `done`, the end of something). Strolling on, it is still the same walk.
   */
  private decide(p: Person, why: string, done = true) {
    const was = p.activity === "walk" && p.leg === "field" ? p.need : undefined;
    p.need = null;
    p.use = null;
    p.leg = "field";
    p.timer = this.rng.range(2, 5);
    for (const need of NEEDS) {
      if (p.needs[need] < (need === "home" ? 1 : 0.7) || !this.sources.get(need)?.length) continue;
      p.need = need;
      p.goal = need;
      if (need === "home") {
        // On foot, by bus or by taxi.
        const r = this.rng.next();
        p.ride = r < BY_BUS && this.traffic.stops.length ? "bus" : r < BY_BUS + BY_TAXI && this.traffic.curbs.length ? "taxi" : "door";
        p.goal = p.ride === "bus" ? "bus" : p.ride === "taxi" ? "curb" : "home";
      }
      // Why, with what led to it (unless just strolling on).
      const due = p.ride !== "door" && need === "home" ? `${DUE.home} (by ${p.ride})` : DUE[need];
      into(p, "walk", done ? `${why}, ${due}` : due);
      return;
    }
    if (done || !p.goal.startsWith("stroll")) p.goal = this.reachableStroll(p);
    if (was !== null) into(p, "walk", why);
  }

  /** On to a stroll somewhere it can get to. */
  private stroll(p: Person, why: string) {
    p.need = null;
    p.use = null;
    p.leg = "field";
    p.goal = this.reachableStroll(p);
    into(p, "walk", why);
  }

  /** At the end of the field (or nowhere near one): use what is there. */
  private reach(p: Person, lost: boolean) {
    if (lost || !p.need) {
      // Unreachable from here (across the river, say): put the need off and stroll somewhere reachable.
      if (lost && p.need) p.needs[p.need] *= 0.3;
      this.stroll(p, lost ? "can't get there from here" : "strolled there");
      return;
    }
    switch (p.need) {
      case "rest": {
        const free = this.seats.filter((s) => !s.taken && Math.hypot(s.x - p.x, s.z - p.z) < 10);
        if (!free.length) {
          // All taken: rest later.
          p.needs.rest *= 0.5;
          this.decide(p, "every seat taken");
          return;
        }
        const s = free.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
        s.taken = true;
        p.seat = s;
        p.timer = 8;
        this.startLeg(p, "front", "found a free seat");
        return;
      }
      case "thirst": {
        const v = this.vending.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
        p.heading = v.heading;
        this.startUse(p, "vending", this.rng.range(3, 7), "buying a drink");
        return;
      }
      case "social":
        // A full circle already: on, and try later.
        if (this.near(p.x, p.z, 8, this.around).filter(talking).length >= GROUP) {
          p.needs.social *= 0.6;
          this.stroll(p, "the circle is full");
          return;
        }
        this.startUse(p, "circle", this.rng.range(15, 45), "joined a circle");
        return;
      case "home": {
        if (p.ride === "bus") {
          const st = this.traffic.stops.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
          if (Math.hypot(st.x - p.x, st.z - p.z) >= 12) {
            this.giveUp(p, "no shelter here");
            return;
          }
          p.stop = st;
          st.queue.push(p);
          this.startUse(p, "shelter", BUS_WAIT, "waiting for the bus");
          return;
        }
        if (p.ride === "taxi") {
          const f = this.traffic.hail(p);
          if (!f) {
            this.giveUp(p, "no taxi to hail");
            return;
          }
          p.fare = f;
          this.startUse(p, "curb", TAXI_WAIT, "hailed a taxi");
          return;
        }
        p.timer = this.rng.range(2, 12);
        into(p, "away", "went in");
        return;
      }
    }
  }

  /** No ride after all: home on foot, to a door. */
  private giveUp(p: Person, why: string) {
    leave(p);
    p.fare = null;
    p.vehicle = null;
    p.need = "home";
    p.use = null;
    p.ride = "door";
    p.goal = "home";
    p.leg = "field";
    into(p, "walk", `${why}: walking home`);
  }

  /** A rider gets off at (x, z) and walks on from there. */
  private alight(p: Person, x: number, z: number, heading: number) {
    const k = nearestWalk(this.map, x, z, 6);
    if (k < 0) {
      p.timer = this.rng.range(2, 12);
      into(p, "away", "got off where there is no path");
      return;
    }
    const { n, y } = this.map;
    Object.assign(p, { x: (k % n) + 0.5, z: ((k / n) | 0) + 0.5, y: y[k], heading, vehicle: null, stop: null, fare: null, ride: "door", cross: 0 });
    p.needs.home = 0;
    this.decide(p, "got off");
  }

  /** A stroll whose field reaches the walker's column (from a random one on), or "wander". */
  private reachableStroll(p: Person): string {
    const { n } = this.map;
    const k = Math.min(n - 1, p.z | 0) * n + Math.min(n - 1, p.x | 0);
    const from = this.rng.int(0, STROLLS - 1);
    for (let i = 0; i < STROLLS; i++) {
      const name = `stroll${(from + i) % STROLLS}`;
      const f = this.field(name);
      if (!f) return name;
      if (f[k] > ARRIVE && f[k] < FAR) return name;
    }
    return "wander";
  }

  /** Someone standing steps aside from anyone closer than arm's length. */
  private spread(p: Person, dt: number) {
    let dx = 0;
    let dz = 0;
    for (const o of this.near(p.x, p.z, PERSONAL * 1.3, this.around)) {
      if (o === p) continue;
      const ox = p.x - o.x;
      const oz = p.z - o.z;
      const d = Math.hypot(ox, oz) || 0.01;
      dx += ox / d;
      dz += oz / d;
    }
    if (dx || dz) {
      const m = Math.hypot(dx, dz);
      this.move(p, (dx / m) * 1.5 * dt, (dz / m) * 1.5 * dt);
    }
  }

  /** Turns a talker toward the others standing around. */
  private faceCompany(p: Person, dt: number) {
    let cx = 0;
    let cz = 0;
    let c = 0;
    for (const o of this.near(p.x, p.z, 10, this.around)) {
      if (o === p || !talking(o)) continue;
      cx += o.x;
      cz += o.z;
      c++;
    }
    if (c) p.heading = turn(p.heading, Math.atan2(cx / c - p.x, cz / c - p.z), dt * 3);
    else p.needs.social = Math.max(p.needs.social, 0.4);
  }

  /* ---------- Cats ---------- */

  private stepCat(c: Cat, dt: number) {
    const { n, y, walk } = this.map;
    const open = (k: number) => walk[k] > GROUND.none;
    c.timer -= dt;
    c.since += dt;
    // People walking by scare it off.
    const person = this.near(c.x, c.z, 6, this.around).find((p) => p.moving);
    if (person && c.activity !== "flee") {
      into(c, "flee", "a person came by");
      c.timer = this.rng.range(1.5, 3);
      c.heading = Math.atan2(c.x - person.x, c.z - person.z);
    }
    let speed = 0;
    switch (c.activity) {
      case "rest":
        if (c.timer <= 0) {
          into(c, "prowl", "rested");
          c.timer = this.rng.range(4, 10);
        }
        break;
      case "flee":
        speed = 9;
        if (c.timer <= 0) {
          into(c, "rest", "safe again");
          c.timer = this.rng.range(5, 15);
        }
        break;
      case "prowl": {
        speed = CAT_PROWL;
        // Wander, kept within its range.
        if (c.timer <= 0) {
          c.timer = this.rng.range(2, 6);
          if (this.rng.chance(0.25)) {
            into(c, "rest", "sat down");
            c.timer = this.rng.range(6, 18);
          } else c.heading += this.rng.range(-1.2, 1.2);
        }
        if (Math.hypot(c.x - c.homeX, c.z - c.homeZ) > RANGE) c.heading = turn(c.heading, Math.atan2(c.homeX - c.x, c.homeZ - c.z), dt * 2);
        const prey = this.spot(c);
        if (prey >= 0) {
          into(c, "hunt", "saw a pigeon");
          c.stage = "stalk";
          c.prey = prey;
        }
        break;
      }
      case "hunt": {
        const b = this.pigeons[c.prey];
        if (!b || b.activity !== "ground" || (c.stage === "stalk" && !this.sees(c, b))) {
          // Gone up (or out of sight): sit and wash.
          into(c, "rest", b && b.activity !== "ground" ? (c.stage === "sprint" ? "missed: the pigeon flew off" : "the pigeon flew off") : "lost sight of it");
          c.timer = this.rng.range(8, 20);
          break;
        }
        const d = Math.hypot(b.x - c.x, b.z - c.z);
        if (c.stage === "stalk" && d < POUNCE) c.stage = "sprint";
        speed = c.stage === "sprint" ? CAT_SPRINT : CAT_STALK;
        c.heading = turn(c.heading, Math.atan2(b.x - c.x, b.z - c.z), dt * (c.stage === "sprint" ? 10 : 3));
        break;
      }
    }
    c.speed += (speed - c.speed) * Math.min(1, dt * 6);
    if (c.speed > 0.05) {
      const bx = c.x;
      const bz = c.z;
      this.move(c, Math.sin(c.heading) * c.speed * dt, Math.cos(c.heading) * c.speed * dt, CAT_STEP, open, CAT_RADIUS);
      // Blocked: turn away.
      if (c.x === bx && c.z === bz) c.heading += this.rng.range(1, 2.5);
      c.phase += c.speed * dt * 2.2;
    }
    c.y += (y[Math.min(n - 1, c.z | 0) * n + Math.min(n - 1, c.x | 0)] - c.y) * Math.min(1, dt * 14);
  }

  /** The nearest grounded pigeon the cat sees: in its cone, in range, nothing in the way. */
  private spot(c: Cat): number {
    let best = -1;
    let bd = SIGHT;
    this.pigeons.forEach((b, i) => {
      if (b.activity !== "ground") return;
      const d = Math.hypot(b.x - c.x, b.z - c.z);
      if (d >= bd) return;
      if (this.sees(c, b)) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private sees(c: Cat, b: Pigeon): boolean {
    const dx = b.x - c.x;
    const dz = b.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > SIGHT) return false;
    if (Math.abs(angleDiff(Math.atan2(dx, dz), c.heading)) > CONE) return false;
    // Line of sight: nothing it can't walk on (a building's lot) and no wall above its eye.
    const { n, y, walk } = this.map;
    for (let t = 1; t < d; t += 1) {
      const k = Math.min(n - 1, (c.z + (dz / d) * t) | 0) * n + Math.min(n - 1, (c.x + (dx / d) * t) | 0);
      if (!walk[k] || y[k] > Math.max(c.y, b.y) + 3) return false;
    }
    return true;
  }

  /* ---------- Pigeons ---------- */

  private stepPigeon(b: Pigeon, dt: number) {
    const { n, y } = this.map;
    const r = this.roosts[b.flock];
    b.since += dt;
    b.flap += dt * (b.activity !== "ground" ? 22 : 0);
    if (b.activity === "ground") {
      // What comes close puts it up: anyone walking, a stalking cat late, a sprinting one early.
      const walkers = this.near(b.x, b.z, WARY, this.around).filter((p) => p.moving);
      const person = walkers.some((p) => Math.hypot(p.x - b.x, p.z - b.z) < SCARE_PERSON);
      const cat = this.cats.some((c) => {
        const d = Math.hypot(c.x - b.x, c.z - b.z);
        return c.activity === "hunt" && c.stage === "sprint" ? d < SCARE_SPRINT : c.activity === "flee" || c.activity === "prowl" ? d < SCARE_STALK + 2 : d < SCARE_STALK * 0.6;
      });
      const vehicle = !person && !cat && this.traffic.passing(b.x, b.z, 4);
      if (person || cat || vehicle) {
        this.alarm(b, person ? "a person came close" : cat ? "a cat came close" : "a vehicle went by");
        return;
      }
      b.timer -= dt;
      b.peck = Math.max(0, b.peck - dt * 3);
      if (b.hop) {
        b.hopT = Math.min(1, b.hopT + dt * 5);
        b.x = b.hop[0] + (b.hop[2] - b.hop[0]) * b.hopT;
        b.z = b.hop[1] + (b.hop[3] - b.hop[1]) * b.hopT;
        b.y = b.hop[4] + Math.sin(b.hopT * Math.PI) * 0.6;
        if (b.hopT >= 1) b.hop = null;
      } else if (b.timer <= 0 || walkers.length) {
        b.timer = this.rng.range(0.4, 2.2);
        if (!walkers.length && this.rng.chance(0.55)) b.peck = 1;
        else {
          // A hop, onto open ground within the roost: away from whoever is coming, if anyone is.
          const w = walkers[0];
          const a = w ? Math.atan2(b.x - w.x, b.z - w.z) + this.rng.range(-0.6, 0.6) : b.heading + this.rng.range(-1.4, 1.4);
          const tx = b.x + Math.sin(a) * this.rng.range(0.6, 1.8);
          const tz = b.z + Math.cos(a) * this.rng.range(0.6, 1.8);
          const k = Math.min(n - 1, Math.max(0, tz | 0)) * n + Math.min(n - 1, Math.max(0, tx | 0));
          const home = Math.hypot(tx - r.x, tz - r.z) < Math.max(ORBIT, 24);
          if (this.map.walk[k] > GROUND.road && Math.abs(y[k] - b.y) <= 1 && home) {
            b.heading = a;
            b.hop = [b.x, b.z, tx, tz, y[k]];
            b.hopT = 0;
          } else b.heading += Math.PI * 0.6;
        }
      }
      return;
    }
    // Flying: boids.
    let sx = 0, sy = 0, sz = 0;
    let ax = 0, ay = 0, az = 0;
    let cx = 0, cy = 0, cz = 0;
    let count = 0;
    for (const o of this.pigeons) {
      if (o === b || o.activity === "ground" || o.flock !== b.flock) continue;
      const dx = b.x - o.x;
      const dy = b.y - o.y;
      const dz = b.z - o.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > FLOCK) continue;
      if (d < GAP && d > 0) {
        sx += dx / d / d;
        sy += dy / d / d;
        sz += dz / d / d;
      }
      ax += o.vx;
      ay += o.vy;
      az += o.vz;
      cx += o.x;
      cy += o.y;
      cz += o.z;
      count++;
    }
    let fx = sx * 30;
    let fy = sy * 30;
    let fz = sz * 30;
    if (count) {
      fx += (ax / count - b.vx) * 1.2 + (cx / count - b.x) * 0.5;
      fy += (ay / count - b.vy) * 1.2 + (cy / count - b.y) * 0.5;
      fz += (az / count - b.vz) * 1.2 + (cz / count - b.z) * 0.5;
    }
    const ground = y[Math.min(n - 1, Math.max(0, b.z | 0)) * n + Math.min(n - 1, Math.max(0, b.x | 0))];
    b.timer -= dt;
    if (b.activity === "fly" && b.timer <= 0 && r.quiet > 4) into(b, "land", "quiet again");
    if (b.activity === "land") {
      // Down to a free spot on the roost.
      if (!b.hop) {
        const k = r.spots[Math.floor(this.rng.next() * r.spots.length)];
        b.hop = [(k % n) + 0.5, ((k / n) | 0) + 0.5, 0, 0, y[k]];
      }
      const [tx, tz, , , ty] = b.hop;
      const dx = tx - b.x;
      const dy = ty - b.y;
      const dz = tz - b.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.2) {
        Object.assign(b, { x: tx, z: tz, y: ty, vx: 0, vy: 0, vz: 0, hop: null, hopT: 1, timer: this.rng.range(1, 3) });
        into(b, "ground", "landed");
        return;
      }
      const want = Math.min(FLY[0], d * 1.5 + 2);
      fx = ((dx / d) * want - b.vx) * 3;
      fy = ((dy / d) * want - b.vy) * 3;
      fz = ((dz / d) * want - b.vz) * 3;
    } else {
      // Round the roost, at cruising height, and over the roofs.
      const tx = r.x + Math.cos(r.angle + b.flock) * ORBIT;
      const tz = r.z + Math.sin(r.angle + b.flock) * ORBIT;
      const ty = r.y + CRUISE[0] + ((b.flock * 13) % (CRUISE[1] - CRUISE[0]));
      fx += (tx - b.x) * 0.25;
      fz += (tz - b.z) * 0.25;
      fy += (ty - b.y) * 0.4;
      const roof = this.roof(b.x + b.vx * 0.8, b.z + b.vz * 0.8);
      if (b.y < roof + CLEAR) fy += (roof + CLEAR - b.y) * 6;
      if (b.y < ground + 4) fy += 30;
    }
    b.vx += fx * dt;
    b.vy += fy * dt;
    b.vz += fz * dt;
    const s = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const lim = b.activity === "land" ? Math.min(s, FLY[1]) : Math.min(FLY[1], Math.max(FLY[0], s));
    b.vx = (b.vx / s) * lim;
    b.vy = (b.vy / s) * lim;
    b.vz = (b.vz / s) * lim;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (Math.hypot(b.vx, b.vz) > 0.5) b.heading = Math.atan2(b.vx, b.vz);
  }

  /** Puts a pigeon up, and with it every grounded one of its flock near enough to see it go. */
  private alarm(b: Pigeon, why: string) {
    const r = this.roosts[b.flock];
    r.quiet = 0;
    const up = (o: Pigeon, why: string) => {
      into(o, "fly", why);
      o.hop = null;
      o.vx = this.rng.range(-4, 4);
      o.vz = this.rng.range(-4, 4);
      o.vy = this.rng.range(10, 16);
      o.timer = this.rng.range(5, 14);
    };
    up(b, why);
    for (const o of this.pigeons) if (o.activity === "ground" && o.flock === b.flock && Math.hypot(o.x - b.x, o.z - b.z) < 14) up(o, "the flock went up");
  }

  private roof(x: number, z: number) {
    const cx = Math.min(this.skyN - 1, Math.max(0, (x / SKY_CELL) | 0));
    const cz = Math.min(this.skyN - 1, Math.max(0, (z / SKY_CELL) | 0));
    return this.sky[cz * this.skyN + cx];
  }
}

/** Into an activity (a person's, a pigeon's or a cat's), saying why. */
function into<A extends string>(a: { activity: A; since: number; why: string }, activity: A, why: string) {
  a.activity = activity;
  a.since = 0;
  a.why = why;
}

/** Standing in a circle, talking. */
function talking(p: Person) {
  return p.activity === "use" && p.use === "circle";
}

/** Off the shelter's queue. */
function leave(p: Person) {
  const i = p.stop ? p.stop.queue.indexOf(p) : -1;
  if (i >= 0) p.stop!.queue.splice(i, 1);
  p.stop = null;
}

function angleDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turns `from` toward `to` by at most `rate` radians. */
function turn(from: number, to: number, rate: number) {
  const d = angleDiff(to, from);
  return from + Math.max(-rate, Math.min(rate, d));
}
