import type { Parks } from "../city/parks";
import type { BuildingPlan } from "../city/placement";
import type { Plaza, Street } from "../terrain/streets";
import { Rng } from "../rng";
import { voxels } from "../scale";
import { City } from "./city";
import { Waste } from "./waste";
import { NO_PATH, line, type Path } from "./ahead";
import { BUS_SEATS, Traffic, type Fare, type Stop, type TrafficCounts, type Vehicle } from "./traffic";
import { CAT_STEP, FAR, FieldJob, GROUND, LocalField, STEP, canStep, downhill, forPeople, nearestWalk, walkMap, type WalkMap } from "./walk";

/**
 * The city's inhabitants (pure: no three.js; the renderer reads the arrays). Three kinds, each
 * from one of the agent models, and each reacting to the others:
 *
 * - People, driven by needs (as in The Sims, on Maslow's order). Rest, thirst, company and, the
 *   longer they are out, home grow at each one's own rates. Whenever someone is only strolling,
 *   the most basic need past its threshold wins: thirst, then rest, then company, then home. A
 *   small state machine carries it out: walk there (down the need's flow field), then sit on a
 *   bench, buy a drink at a vending machine, or stand and talk with whoever else came to the
 *   fountain or the plaza. Strolling, they walk to one of a few far points of the city in turn.
 *   Above the needs is their cycle (city.ts): each lives in one building and works in another,
 *   and goes round on stays of its own (no clock): at home a while, to work, a shift (half of them
 *   come out for a break halfway), out for a stop or two, and home again; the needs run only while
 *   they are out. The city opens with everyone somewhere on the cycle, so it is busy all round.
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
 *   no one walks into a vehicle. Going far (to work, or home), some walk, some go to a bus shelter
 *   to wait for a bus that goes their way, and some to the curb to hail a taxi; riders get off at
 *   the stop nearest where they are going, or where their taxi drops them, and walk on from there.
 *   Pigeons go up as a vehicle passes.
 */

/** Walking speeds (voxels per second: 4 is 1 m/s). */
const WALK = [4.4, 6];
const CAT_PROWL = 2.6;
const CAT_STALK = 1.4;
const CAT_SPRINT = 16;
/** How close (columns of path cost: 2 per column) counts as there; at a door (whose column is against the wall, where a body does not fit), a few steps off. */
const ARRIVE = 4;
const AT_DOOR = 20;
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
/** A pile of rubbish (waste.ts) draws the flock whose roost is within this many columns of it. */
const LURE = 240;
const CRUISE = [36, 70];
const CLEAR = 8;
/** Sky grid cell (columns): the highest roof in each, for the pigeons. */
const SKY_CELL = 8;
/** Strolling targets. */
const STROLLS = 8;
/** A slice of the fields' work per step (ms). */
const SLICE = 3;
/** Going farther than RIDE_FAR (columns): the share who take the bus (if one goes their way), and who take a taxi (the rest walk); farther than TAXI_FAR, everyone takes a taxi if one is free. */
const RIDE_FAR = 200;
const TAXI_FAR = 420;
const BY_BUS = 0.6;
/** The bus goes someone's way if walking to its stop and from the stop it takes them to is less than this share of the straight way. */
const BUS_SAVES = 0.75;
const BY_TAXI = 0.12;
/** A person's stays (s), each drawn from these ranges: at home, and a whole shift at work; the share who take a break halfway through a shift. */
const HOME_STAY = [60, 150];
const SHIFT = [75, 150];
const BREAKS = 0.5;
/** The longest a break and the time out after work last (s). */
const BREAK = 30;
const OUT_AFTER = 45;
/** On a time out, the walk to a seat, a drink or company doesn't count against it for its first OUT_WALK s. */
const OUT_WALK = 60;
/** With every seat at the nearest bench taken: on along the paths to a free one, up to SEAT_WALK columns away (12 m). */
const SEAT_WALK = voxels(12);
/** The share who stop for something on the way out of work (the rest go straight home). */
const AFTER_WORK = 0.7;
/** Its door group's field is asked for this long (s) before someone inside comes out. */
const HINT = 12;
/** Where people are when the city opens (about the shares the cycle settles to): at home, at work, on the way to work, out after work, going home (the rest). */
const START = { home: 0.3, work: 0.31, commute: 0.13, out: 0.08 };
/** Homes are picked by their places, falling off by e for every HOME_REACH columns from the job (a long walk would take up most of a stay). */
const HOME_REACH = 70;
/** A building's local field is followed once its way is at most this times the straight distance (path cost: 2 a column on paving). */
const DETOUR = 3.2;
/** On the way to work or home, people walk this much faster. */
const BRISK = 1.3;
/** How long someone waits (s) for a bus, for a taxi, and at the curb for a gap in the traffic. */
const BUS_WAIT = 30;
/** A bus this near (voxels of driving, about 2 min at a bus's pace) is worth waiting for; with one that near, someone at the shelter waits up to BUS_COMING longer (s). */
const BUS_DUE = 1600;
const BUS_COMING = 120;
const TAXI_WAIT = 25;
/** Once a taxi is on its way, someone at the curb waits for it, up to this much longer (s). */
const TAXI_COMING = 90;
const CROSS_WAIT = 12;
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
/**
 * A person's cycle, the state machine above the needs (docs/techniques/agents.md): at home;
 * commuting to work (or back after a break); working; out (the needs machine: on a break, or after
 * work); going home.
 */
export type Day = "home" | "commute" | "working" | "out" | "homeward";
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
  /** Its home and its job (indices into the city's buildings), the building it is in (or -1), and the one it is on its way to (or -1). */
  home: number;
  job: number;
  inside: number;
  dest: number;
  /** Its cycle: the step it is on, the seconds left of its stay (at home, at work, out), whether this time out is a break (back to work after), and whether it is on its way back from one. */
  day: Day;
  left: number;
  pause: boolean;
  back: boolean;
  /** Its own stays (s): at home and a whole shift; and whether it takes a break halfway through. */
  stays: { home: number; shift: number; breaks: boolean };
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
  /** A pile of rubbish the flock has taken for its roost while it lies there (waste.ts). */
  lure: Roost | null;
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
  readonly city: City;
  /** The bins, the garbage trucks' rounds and the piles. */
  readonly waste: Waste;
  private readonly rng: Rng;
  private readonly sources = new Map<string, number[]>();
  private readonly fields = new Map<string, Uint16Array>();
  private readonly wanted: string[] = [];
  private job: { name: string; job: FieldJob } | null = null;
  private readonly seats: Seat[] = [];
  private readonly vending: Spot[] = [];
  /** Each building's local field, for the last steps to its door (made when first needed). */
  private readonly locals = new Map<number, LocalField>();
  /** A field round each bench's path column, for walking on to it from a full one nearby (made when first needed). */
  private readonly seatFields = new Map<number, LocalField>();
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
      getOff: (p, st) => (p.dest >= 0 ? this.bestStop(st.route, p.dest) === st : null),
      serve: (v) => this.waste.serve(v),
    });
    this.city = new City(plans, map);
    this.waste = new Waste(this.city, plans, this.traffic, map, seed);

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
    this.sources.set("rest", rest);
    this.sources.set("thirst", drink);
    this.sources.set("social", social);
    this.city.groups.forEach((doors, g) => this.sources.set(`door${g}`, doors));
    this.sources.set("bus", this.traffic.stops.map((s) => s.k));
    this.sources.set("curb", this.traffic.taxiCurbs);
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

    // People: each given a home and a job, and their own stays, and started somewhere on the cycle.
    const homes = this.city.withRole("home");
    const jobs = this.city.withRole("office", "shop", "works");
    const all = this.city.buildings;
    for (let i = 0; i < count.people && paving.length && all.length; i++) {
      const k = paving[Math.floor(this.rng.next() * paving.length)];
      const p = this.person(k);
      // The job first (by its places), then a home near it: there are homes to spare.
      const job = this.weighted(jobs, (b) => b.places);
      const J = all[job];
      p.job = job;
      p.home = this.weighted(homes, (b) => (b === J && homes.length > 1 ? 0 : b.places * Math.exp(-Math.hypot(b.x - J.x, b.z - J.z) / HOME_REACH)));
      const r = this.rng;
      p.stays = { home: r.range(HOME_STAY[0], HOME_STAY[1]), shift: r.range(SHIFT[0], SHIFT[1]), breaks: r.chance(BREAKS) };
      this.people.push(p);
      this.start(p);
    }
    // Every group's field, worked out while the city is printed: the jobs' groups first (the
    // morning needs them), then the homes'.
    for (const p of this.people) this.hint(`door${all[p.job].group}`);
    for (const p of this.people) this.hint(`door${all[p.home].group}`);
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
    this.roosts.push(this.makeRoost(x, z, reach));
  }

  private makeRoost(x: number, z: number, reach: number): Roost {
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
    return { x, z, y: y[k], spots, angle: this.rng.range(0, Math.PI * 2), quiet: 0, lure: null };
  }

  /**
   * Each pile of rubbish (waste.ts) draws the flock whose roost is nearest it, within LURE: the
   * flock takes the pile for its roost while it lies there, and goes up to fly to it; once it is
   * cleared, back to its own.
   */
  private lure() {
    const flocks = new Set(this.pigeons.map((b) => b.flock));
    const want = new Map<number, Roost | null>();
    for (const i of flocks) want.set(i, null);
    for (const bin of this.waste.piles) {
      let best = -1;
      let bd = LURE;
      for (const i of flocks) {
        const r = this.roosts[i];
        const d = Math.hypot(r.x - bin.x, r.z - bin.z);
        if (d < bd && !want.get(i)) [best, bd] = [i, d];
      }
      if (best < 0) continue;
      const pile = this.makeRoost(bin.x, bin.z, 5);
      if (pile.spots.length >= 4) want.set(best, pile);
    }
    for (const [i, pile] of want) {
      const r = this.roosts[i];
      const was = r.lure;
      if (!was && !pile) continue;
      if (was && pile && was.x === pile.x && was.z === pile.z) continue;
      r.lure = pile;
      // Up, to fly to the pile (or home again).
      const one = this.pigeons.find((b) => b.flock === i && b.activity === "ground");
      if (one) this.alarm(one, pile ? "a pile of rubbish" : "the rubbish was cleared", Infinity);
    }
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
      home: -1,
      job: -1,
      inside: -1,
      dest: -1,
      day: "out",
      left: Infinity,
      pause: false,
      back: false,
      stays: { home: HOME_STAY[0], shift: SHIFT[0], breaks: false },
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

  /** A field, or null while it waits its turn to be worked out (one per step); someone is waiting for it, so it goes first. */
  private field(name: string): Uint16Array | null {
    const f = this.fields.get(name);
    if (f) return f;
    if (this.job?.name === name) return null;
    const i = this.wanted.indexOf(name);
    if (i !== 0) {
      if (i > 0) this.wanted.splice(i, 1);
      this.wanted.unshift(name);
    }
    return null;
  }

  /** Asks for a field that will be wanted soon, after any already asked for. */
  private hint(name: string) {
    if (!this.fields.has(name) && this.job?.name !== name && !this.wanted.includes(name)) this.wanted.push(name);
  }

  /** Works on the fields without moving anyone (while the city is still being printed). */
  prepare() {
    this.work();
  }

  /** How many fields are still to be worked out. */
  get pending() {
    return this.wanted.length + (this.job ? 1 : 0);
  }

  /** A slice of the fields' work: the fields asked for, and, when none is, the next building's local field. */
  private work() {
    if (!this.job && !this.wanted.length && this.locals.size < this.city.buildings.length) {
      for (let b = 0; b < this.city.buildings.length; b++) {
        if (this.locals.has(b)) continue;
        this.local(b);
        return;
      }
    }
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
    this.waste.step(dt);
    if (this.waste.changed) {
      this.waste.changed = false;
      this.lure();
    }
    this.traffic.step(dt);
    for (const r of this.roosts) {
      r.angle += dt * 0.35;
      r.quiet += dt;
      if (r.lure) [r.lure.angle, r.lure.quiet] = [r.angle, r.quiet];
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
    p.moving = false;
    p.motion = "stand";
    p.timer -= dt;
    p.since += dt;
    // A time out waits while it walks to a seat, a drink or company (up to OUT_WALK s of the walk):
    // the nearest is often across the city, and it would give up on the way.
    if (!(p.day === "out" && p.activity === "walk" && p.leg === "field" && p.need && p.need !== "home" && p.since < OUT_WALK)) p.left -= dt;
    if (p.activity === "away") {
      this.indoors(p);
      return;
    }
    if (p.day === "out") {
      for (const need of NEEDS) p.needs[need] = Math.min(1.5, p.needs[need] + p.rates[need] * dt);
      // The break is over: cut short whatever it is doing (getting up off a seat first).
      if (p.left <= 0) {
        if (p.activity === "use" && p.use === "seat") p.timer = Math.min(p.timer, 0);
        else if ((p.activity === "walk" && p.leg === "field") || (p.activity === "use" && (p.use === "circle" || p.use === "vending"))) this.endBreak(p);
      }
    }
    // Right beside a vehicle (or caught by its corner on a turn): step out of its way (unless seated,
    // getting on or aboard).
    const settled = p.activity === "ride" || (p.activity === "use" ? p.use === "seat" : p.leg === "onto" || p.leg === "door");
    const away = settled ? null : this.traffic.clearOf(p.x, p.z, RADIUS + 0.8);
    if (away) this.move(p, away.x * MAKE_WAY * dt, away.z * MAKE_WAY * dt);
    if (p.activity === "walk") this.walking(p, dt);
    else if (p.activity === "use") this.using(p, dt);
    if (away) p.motion = "make-way";
  }

  /* People, the cycle. */

  /**
   * Somewhere on its cycle (START shares), at a random point of its stay, so the city opens busy
   * in every part of its loop instead of all at home.
   */
  private start(p: Person) {
    const u = this.rng.next();
    const r = this.rng.next();
    if (u < START.home) {
      p.day = "homeward";
      this.enter(p, p.home, "at home");
      p.left *= r;
    } else if (u < START.home + START.work) {
      p.day = "commute";
      this.enter(p, p.job, "at work");
      p.left *= r;
    } else if (u < START.home + START.work + START.commute) {
      // On the way: just out of the door it comes from.
      this.emerge(p, p.home);
      p.day = "commute";
      this.trip(p, p.job, "off to work");
    } else if (u < START.home + START.work + START.commute + START.out) {
      this.emerge(p, p.job);
      p.day = "out";
      p.needs.home = 0;
      p.left = r * OUT_AFTER;
      this.wantOne(p);
      this.decide(p, "out after work");
    } else {
      this.emerge(p, p.job);
      this.goHome(p, "going home");
    }
  }

  /** Inside a building: until its stay is over (asking for the field it will walk down a little before). */
  private indoors(p: Person) {
    const all = this.city.buildings;
    if (p.left <= HINT && p.day !== "out") this.hint(`door${all[p.day === "home" ? p.job : p.home].group}`);
    if (p.left > 0) return;
    if (p.day === "home") {
      this.emerge(p, p.home);
      p.day = "commute";
      this.trip(p, p.job, "time for work");
    } else if (p.day === "working") {
      this.emerge(p, p.job);
      p.day = "out";
      p.needs.home = 0;
      if (p.pause) {
        // A break: out to the nearest drink, seat or circle (whichever it wants most), then back.
        p.left = BREAK;
        this.wantOne(p);
        this.decide(p, "a break");
      } else {
        // After work: out for a drink, a seat or company first (most do), then home.
        p.left = OUT_AFTER;
        if (this.rng.chance(AFTER_WORK)) this.wantOne(p);
        this.decide(p, "work is over");
      }
    }
  }

  /** The time out is over: back to work after a break, or home. */
  private endBreak(p: Person) {
    if (p.seat) {
      p.seat.taken = false;
      p.seat = null;
    }
    if (p.pause) {
      p.day = "commute";
      p.back = true;
      this.trip(p, p.job, "the break is over");
    } else this.goHome(p, "time to go home");
  }

  private goHome(p: Person, why: string) {
    p.day = "homeward";
    this.trip(p, p.home, why);
  }

  /** Out of building b's door, onto the street. */
  private emerge(p: Person, b: number) {
    const B = this.city.buildings[b];
    const { n, y } = this.map;
    if (p.inside >= 0) this.city.buildings[p.inside].inside--;
    p.inside = -1;
    Object.assign(p, { x: (B.door % n) + 0.5, z: ((B.door / n) | 0) + 0.5, y: y[B.door], seat: null, stop: null, fare: null, vehicle: null, cross: 0, track: "" });
  }

  /** In through building b's door: at work until its break or the end of its shift, or at home for its stay. */
  private enter(p: Person, b: number, why: string) {
    leave(p);
    const B = this.city.buildings[b];
    const { n, y } = this.map;
    Object.assign(p, { x: (B.door % n) + 0.5, z: ((B.door / n) | 0) + 0.5, y: y[B.door], fare: null, vehicle: null, dest: -1, need: null, use: null, leg: "field", ride: "door" });
    if (p.seat) p.seat.taken = false;
    p.seat = null;
    p.inside = b;
    B.inside++;
    if (p.day === "commute") {
      p.day = "working";
      // Back from a break: the second half of the shift. Else a whole shift, with a break halfway for some.
      const half = p.stays.shift / 2;
      if (p.back) [p.back, p.pause, p.left] = [false, false, half];
      else [p.pause, p.left] = p.stays.breaks ? [true, half] : [false, p.stays.shift];
    } else {
      p.day = "home";
      p.pause = false;
      p.left = p.stays.home;
    }
    into(p, "away", why);
  }

  /** Off to building b's door: on foot, or, far away, by a bus that goes that way or by taxi. */
  private trip(p: Person, b: number, why: string) {
    const B = this.city.buildings[b];
    p.dest = b;
    p.need = null;
    p.use = null;
    p.leg = "field";
    p.ride = "door";
    p.timer = 0;
    const d = Math.hypot(B.x - p.x, B.z - p.z);
    if (d > RIDE_FAR) {
      const r = this.rng.next();
      if (r < BY_BUS && this.busGoes(p, b)) p.ride = "bus";
      // A taxi (always, very far) while one is free for them.
      else if ((r < BY_BUS + BY_TAXI || d > TAXI_FAR) && this.traffic.taxiCurbs.length && this.taxiFree()) p.ride = "taxi";
    }
    p.goal = p.ride === "bus" ? "bus" : p.ride === "taxi" ? "curb" : `door${B.group}`;
    into(p, "walk", p.ride === "door" ? why : `${why} (by ${p.ride})`);
  }

  /**
   * A taxi is free for one more: more free taxis than fares no taxi is coming for yet and people
   * on their way to the curb. Otherwise they go by bus or on foot, rather than wait at the curb in
   * vain.
   */
  private taxiFree(): boolean {
    let want = this.traffic.waiting;
    for (const q of this.people) if (q.goal === "curb" && !q.fare && !q.vehicle) want++;
    return want < this.traffic.freeTaxis;
  }

  /** On foot the rest of the way. */
  private walkOn(p: Person, why: string) {
    leave(p);
    p.fare = null;
    p.vehicle = null;
    p.ride = "door";
    p.use = null;
    p.leg = "field";
    p.goal = `door${this.city.buildings[p.dest].group}`;
    into(p, "walk", why);
  }

  /** The field round a bench's path column k. */
  private seatField(k: number): LocalField {
    let f = this.seatFields.get(k);
    if (!f) {
      f = new LocalField(this.map, k, SEAT_WALK);
      this.seatFields.set(k, f);
    }
    return f;
  }

  /** The column a person walking to the seat at path column k heads for next on its bench's field, or -1 (none made, or none lower). */
  private seatStep(p: Person, k: number): number {
    const f = this.seatFields.get(k);
    if (!f) return -1;
    const { n } = this.map;
    const here = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
    return f.at(here) < FAR ? f.downhill(here) : -1;
  }

  /** Building b's local field. */
  private local(b: number): LocalField {
    let f = this.locals.get(b);
    if (!f) {
      const B = this.city.buildings[b];
      f = new LocalField(this.map, B.door, B.reach);
      this.locals.set(b, f);
    }
    return f;
  }

  /**
   * Where a person on foot means to go next (life/ahead.ts): down the field they are walking (the
   * group's field, then their building's own for the last steps), or straight to a seat or a
   * vehicle's door; a point every `every` columns, at most `reach`. Nothing while they stand,
   * sit, wait, ride or are indoors.
   */
  personAhead(p: Person, reach: number, every: number): Path {
    if (p.activity !== "walk") return NO_PATH;
    const { n, y } = this.map;
    if (p.leg === "door" && p.vehicle) {
      const d = this.traffic.door(p.vehicle);
      return line(p.x, p.y, p.z, d.x, p.vehicle.y, d.z, reach, every);
    }
    if (p.leg !== "field") {
      const st = p.seat;
      if (!st) return NO_PATH;
      const k = p.leg === "onto" ? -1 : st.k;
      // Walking on to a seat at another bench: along its bench's field, as in walking.
      const sf = p.leg === "front" ? this.seatFields.get(st.k) : undefined;
      if (sf) {
        const pts: number[] = [];
        let j = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
        let x = p.x;
        let z = p.z;
        let gone = 0;
        let since = 0;
        while (sf.at(j) < FAR && j !== st.k) {
          const next = sf.downhill(j);
          if (next < 0) break;
          const nx = (next % n) + 0.5;
          const nz = ((next / n) | 0) + 0.5;
          const d = Math.hypot(nx - x, nz - z);
          if (gone + d > reach) return { pts, end: false };
          gone += d;
          since += d;
          x = nx;
          z = nz;
          j = next;
          if (since >= every) {
            since = 0;
            pts.push(x, y[j], z);
          }
        }
        pts.push(x, y[j], z);
        return { pts, end: j === st.k };
      }
      return k < 0 ? line(p.x, p.y, p.z, st.x, st.y, st.z, reach, every) : line(p.x, p.y, p.z, (k % n) + 0.5, y[k], ((k / n) | 0) + 0.5, reach, every);
    }
    let k = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
    // As followField: the building's own field once it has a short way there, the group's till then.
    const local = p.dest >= 0 && p.ride === "door" ? (this.locals.get(p.dest) ?? null) : null;
    const lv = local ? local.at(k) : FAR;
    let near = !!local && lv < FAR && (p.track === `local${p.dest}` || lv <= DETOUR * Math.hypot(this.city.buildings[p.dest].x - p.x, this.city.buildings[p.dest].z - p.z) + 40);
    const field = this.fields.get(p.goal) ?? null;
    const pts: number[] = [];
    let x = p.x;
    let z = p.z;
    let gone = 0;
    let since = 0;
    for (;;) {
      const here = near ? local!.at(k) : field ? field[k] : FAR;
      if (here === FAR) return { pts, end: false };
      if (here <= (near ? AT_DOOR : ARRIVE)) {
        // At the group's door: round to its own on its field.
        if (!near && local && local.at(k) < FAR) {
          near = true;
          continue;
        }
        if (since > 0) pts.push(x, y[k], z);
        return { pts, end: true };
      }
      const next = near ? local!.downhill(k) : downhill(this.map, field!, k);
      if (next < 0) return { pts, end: false };
      const nx = (next % n) + 0.5;
      const nz = ((next / n) | 0) + 0.5;
      const d = Math.hypot(nx - x, nz - z);
      if (gone + d > reach) return { pts, end: false };
      gone += d;
      since += d;
      x = nx;
      z = nz;
      k = next;
      if (since >= every) {
        since = 0;
        pts.push(x, y[k], z);
      }
    }
  }

  /** Where a pigeon means to go: the spot it hops or lands on, or its roost while it flies. */
  pigeonAhead(b: Pigeon, reach: number, every: number): Path {
    const own = this.roosts[b.flock];
    const r = own?.lure ?? own;
    if (b.hop && b.activity === "land") return line(b.x, b.y, b.z, b.hop[0], b.hop[4], b.hop[1], reach, every);
    if (b.hop) return line(b.x, b.y, b.z, b.hop[2], b.hop[4], b.hop[3], reach, every);
    if (b.activity === "ground" || !r) return NO_PATH;
    return line(b.x, b.y, b.z, r.x, r.y, r.z, reach, every);
  }

  /**
   * Where a cat means to go: at its pigeon while it hunts; straight on, while it prowls or flees,
   * for as long as it keeps its heading (till its next turn, or a wall).
   */
  catAhead(c: Cat, reach: number, every: number): Path {
    const { n, y, walk } = this.map;
    if (c.activity === "hunt") {
      const b = this.pigeons[c.prey];
      return b ? line(c.x, c.y, c.z, b.x, b.y, b.z, reach, every) : NO_PATH;
    }
    if (c.activity === "rest") return NO_PATH;
    const go = Math.min(reach, Math.max(0, c.timer) * (c.activity === "flee" ? 9 : CAT_PROWL));
    const pts: number[] = [];
    const dx = Math.sin(c.heading);
    const dz = Math.cos(c.heading);
    for (let s = every; s <= go; s += every) {
      const x = c.x + dx * s;
      const z = c.z + dz * s;
      const k = Math.min(n - 1, Math.max(0, z | 0)) * n + Math.min(n - 1, Math.max(0, x | 0));
      if (walk[k] <= GROUND.none) break;
      pts.push(x, y[k], z);
    }
    return { pts, end: false };
  }

  /** The stop on a route nearest building b. */
  private bestStop(route: number, b: number): Stop | null {
    const B = this.city.buildings[b];
    const stops = this.traffic.routes[route]?.stops ?? [];
    let best: Stop | null = null;
    let bd = Infinity;
    for (const st of stops) {
      const d = Math.hypot(st.x - B.x, st.z - B.z);
      if (d < bd) [best, bd] = [st, d];
    }
    return best;
  }

  /** True if the bus from the shelter nearest the walker would take it much nearer building b. */
  private busGoes(p: Person, b: number): boolean {
    const stops = this.traffic.stops;
    if (!stops.length) return false;
    const from = stops.reduce((a, c) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(c.x - p.x, c.z - p.z) ? a : c));
    const to = this.bestStop(from.route, b);
    const B = this.city.buildings[b];
    return !!to && to !== from && Math.hypot(from.x - p.x, from.z - p.z) + Math.hypot(to.x - B.x, to.z - B.z) < Math.hypot(B.x - p.x, B.z - p.z) * BUS_SAVES;
  }

  /** A pick among `items`, each as likely as its weight; returns its index in the city's buildings. */
  private weighted<T>(items: T[], weight: (t: T) => number): number {
    const w = items.map(weight);
    const total = w.reduce((a, b) => a + b, 0);
    let r = this.rng.next() * total;
    let i = 0;
    while (i < items.length - 1 && (r -= w[i]) > 0) i++;
    return this.city.buildings.indexOf(items[i] as never);
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
        } else if (p.timer <= 0 && (p.timer <= -BUS_COMING || this.traffic.busDue(st) > BUS_DUE)) this.giveUp(p, "no bus came");
        return;
      }
      case "curb": {
        // Until a taxi pulls up for them (or the taxi gives up); with one on its way, a while longer.
        const f = p.fare;
        if (f?.ready && f.taxi && this.traffic.open(f.taxi)) {
          p.vehicle = f.taxi;
          this.startLeg(p, "door", "the taxi is here");
        } else if (!f || p.timer <= (f.taxi ? -TAXI_COMING : 0)) {
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
        // To the path in front of the seat (as any walker): along the paths from afar (its bench's
        // field, if it walked on from a full one), straight for the last steps.
        const d = Math.hypot(tx - p.x, tz - p.z);
        const next = d > 3 ? this.seatStep(p, s.k) : -1;
        if (d < 0.5) this.startLeg(p, "onto", "at the seat");
        else if (p.timer <= 0) {
          // Can't get there: rest later.
          s.taken = false;
          p.seat = null;
          p.needs.rest *= 0.5;
          this.decide(p, "could not reach the seat");
        } else if (next >= 0) {
          const nx = (next % n) + 0.5 - p.x;
          const nz = ((next / n) | 0) + 0.5 - p.z;
          const nd = Math.hypot(nx, nz) || 1;
          this.walkToward(p, nx / nd, nz / nd, p.speed, dt);
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
    if (!p.need && p.dest < 0 && p.timer <= 0) this.decide(p, "strolling on", false);
    const k = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
    // On foot to a building: its own local field once that has a short way there (its window may
    // give only a long way round), its group's field till then.
    const local = p.dest >= 0 && p.ride === "door" ? this.local(p.dest) : null;
    const lv = local ? local.at(k) : FAR;
    // (Once on it, it stays on it.)
    const onLocal = p.track === `local${p.dest}`;
    const near = lv < FAR && (onLocal || lv <= DETOUR * Math.hypot(this.city.buildings[p.dest].x - p.x, this.city.buildings[p.dest].z - p.z) + 40);
    const field = near ? null : this.field(p.goal);
    if (!near && !field) return;
    const at = near ? (j: number) => local!.at(j) : (j: number) => field![j];
    const down = near ? (j: number) => local!.downhill(j) : (j: number) => downhill(this.map, field!, j);
    const here = at(k);
    if (here <= (near ? AT_DOOR : ARRIVE) || here === FAR) {
      if (p.dest >= 0 && p.ride === "door") {
        // At a neighbor's door: round to its own, on its own field.
        if (!near && lv < FAR && here <= ARRIVE) {
          p.track = `local${p.dest}`;
          p.best = lv;
          p.stuck = 0;
          p.tries = 0;
          return;
        }
        this.enter(p, p.dest, here === FAR ? "could not get there on foot: went in nearby" : near ? this.arrived(p) : "went in next door");
      } else this.reach(p, here === FAR);
      // Nowhere it wants to go can be reached from here: wander.
      if (p.goal === "wander") this.wander(p, dt);
      return;
    }
    let tx = p.x;
    let tz = p.z;
    const a = down(k);
    if (a >= 0) {
      const b = down(a);
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
    if (!onRoad) p.cross = 0;
    // Headway: nearer the goal than ever, or stuck. Stuck a while, squeeze past people; stuck
    // through that again and again, give up and go elsewhere.
    const track = near ? `local${p.dest}` : p.goal;
    if (p.track !== track) {
      p.track = track;
      p.best = here;
      p.stuck = 0;
      p.tries = 0;
    } else if (here < p.best) {
      p.best = here;
      p.stuck = 0;
      p.tries = 0;
    } else if ((p.stuck += dt) > STUCK) {
      p.stuck = 0;
      p.squeeze = SQUEEZE;
      if (++p.tries > TRIES) {
        // On the way somewhere it must go: in at the nearest door (it is lost in the crowd).
        if (p.dest >= 0) {
          this.enter(p, p.dest, "stuck in the crowd: went in nearby");
          return;
        }
        // Put the need off, and go somewhere else.
        if (p.need) p.needs[p.need] *= 0.5;
        this.stroll(p, "stuck: going elsewhere");
        return;
      }
    }
    this.walkToward(p, (tx - p.x) / fd, (tz - p.z) / fd, p.speed * (p.dest >= 0 ? BRISK : p.need ? 1.1 : 1) * (onRoad ? HURRY : 1), dt);
  }

  /** Why it went in, at its own door. */
  private arrived(p: Person) {
    return p.day === "commute" ? (p.back ? "back from the break" : "arrived at work") : "home";
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
    const k = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
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
      // Never off the grid: `at` clamps to the edge cell, so a step past the edge would look like
      // staying put.
      if (x < 0 || z < 0 || x >= n || z >= n) return false;
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
    // On a break with nothing more it needs: back to work early. Past the end of its time out: back, or home.
    if (p.day === "out" && (p.left <= 0 || (p.pause && done && p.activity !== "away" && !NEEDS.some((n) => n !== "home" && p.needs[n] >= 0.7)))) {
      this.endBreak(p);
      return;
    }
    const was = p.activity === "walk" && p.leg === "field" ? p.need : undefined;
    p.need = null;
    p.use = null;
    p.leg = "field";
    p.timer = this.rng.range(2, 5);
    for (const need of NEEDS) {
      if (p.needs[need] < (need === "home" ? 1 : 0.7)) continue;
      // Home, only once work is over (on a break it waits).
      if (need === "home") {
        if (p.day === "out" && !p.pause) {
          this.goHome(p, done ? `${why}, ${DUE.home}` : DUE.home);
          return;
        }
        continue;
      }
      if (!this.sources.get(need)?.length) continue;
      p.need = need;
      p.goal = need;
      // Why, with what led to it (unless just strolling on).
      into(p, "walk", done ? `${why}, ${DUE[need]}` : DUE[need]);
      return;
    }
    if (done && this.doneForTheDay(p)) {
      this.goHome(p, `${why}: going home`);
      return;
    }
    if (done || !p.goal.startsWith("stroll")) p.goal = this.reachableStroll(p);
    if (was !== null) into(p, "walk", why);
  }

  /** Out after work with nothing more it needs: home (a stroll across the city would take far longer than its time out). */
  private doneForTheDay(p: Person) {
    return p.day === "out" && !p.pause;
  }

  /** Out on a break: a drink, a seat or company, whichever it wants most, is due now. */
  private wantOne(p: Person) {
    const want = (["thirst", "rest", "social"] as Need[]).reduce((a, b) => (p.needs[a] >= p.needs[b] ? a : b));
    p.needs[want] = Math.max(p.needs[want], 0.75);
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
    if (p.dest >= 0) {
      this.reachRide(p, lost);
      return;
    }
    if (!lost && !p.need && this.doneForTheDay(p)) {
      this.goHome(p, "strolled there: going home");
      return;
    }
    if (lost || !p.need) {
      // Unreachable from here (across the river, say): put the need off and stroll somewhere reachable.
      if (lost && p.need) p.needs[p.need] *= 0.3;
      this.stroll(p, lost ? "can't get there from here" : "strolled there");
      return;
    }
    switch (p.need) {
      case "rest": {
        const free = this.seats.filter((s) => !s.taken && Math.hypot(s.x - p.x, s.z - p.z) < 10);
        if (free.length) {
          const s = free.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
          s.taken = true;
          p.seat = s;
          p.timer = 8;
          this.startLeg(p, "front", "found a free seat");
          return;
        }
        // All taken here: on along the paths to the nearest free seat not far off, else rest later.
        const { n } = this.map;
        const here = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
        let best: Seat | null = null;
        let low = FAR;
        for (const s of this.seats) {
          if (s.taken || Math.hypot(s.x - p.x, s.z - p.z) > SEAT_WALK) continue;
          const d = this.seatField(s.k).at(here);
          if (d < low) {
            low = d;
            best = s;
          }
        }
        if (!best) {
          p.needs.rest *= 0.5;
          this.decide(p, "every seat taken");
          return;
        }
        best.taken = true;
        p.seat = best;
        p.timer = 8 + (2 * Math.hypot(best.x - p.x, best.z - p.z)) / p.speed;
        this.startLeg(p, "front", "every seat taken: on to a free one");
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
    }
  }

  /** On a trip, at the shelter or the curb: wait for the bus (if it goes that way) or hail a taxi. */
  private reachRide(p: Person, lost: boolean) {
    if (lost) {
      this.walkOn(p, p.ride === "bus" ? "no shelter it can get to: walking" : "no curb it can get to: walking");
      return;
    }
    if (p.ride === "bus") {
      const st = this.traffic.stops.reduce((a, b) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
      if (Math.hypot(st.x - p.x, st.z - p.z) >= 12) {
        this.giveUp(p, "no shelter here");
        return;
      }
      if (this.bestStop(st.route, p.dest) === st) {
        this.giveUp(p, "the bus from here doesn't go that way");
        return;
      }
      if (this.traffic.busDue(st) > BUS_DUE) {
        this.giveUp(p, "no bus coming soon");
        return;
      }
      p.stop = st;
      st.queue.push(p);
      this.startUse(p, "shelter", BUS_WAIT, "waiting for the bus");
      return;
    }
    const B = this.city.buildings[p.dest];
    const f = this.traffic.hail(p, { x: B.x, z: B.z });
    if (!f) {
      this.giveUp(p, "no taxi to hail");
      return;
    }
    p.fare = f;
    this.startUse(p, "curb", TAXI_WAIT, "hailed a taxi");
  }

  /** No ride after all: on foot the rest of the way. */
  private giveUp(p: Person, why: string) {
    if (p.dest < 0) {
      leave(p);
      p.fare = null;
      p.vehicle = null;
      this.stroll(p, why);
      return;
    }
    this.walkOn(p, `${why}: walking`);
  }

  /** A rider gets off at (x, z) and walks on from there. */
  private alight(p: Person, x: number, z: number, heading: number) {
    const k = nearestWalk(this.map, x, z, 6);
    if (k < 0) {
      if (p.dest >= 0) this.enter(p, p.dest, "got off where there is no path: went in");
      return;
    }
    const { n, y } = this.map;
    Object.assign(p, { x: (k % n) + 0.5, z: ((k / n) | 0) + 0.5, y: y[k], heading, vehicle: null, stop: null, fare: null, cross: 0 });
    if (p.dest >= 0) this.walkOn(p, "got off: walking on");
    else {
      p.ride = "door";
      this.decide(p, "got off");
    }
  }

  /** A stroll whose field reaches the walker's column (from a random one on), or "wander". */
  private reachableStroll(p: Person): string {
    const { n } = this.map;
    const k = Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0));
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
    c.y += (y[Math.min(n - 1, Math.max(0, c.z | 0)) * n + Math.min(n - 1, Math.max(0, c.x | 0))] - c.y) * Math.min(1, dt * 14);
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
    const own = this.roosts[b.flock];
    const r = own.lure ?? own;
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
  private alarm(b: Pigeon, why: string, reach = 14) {
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
    for (const o of this.pigeons) if (o.activity === "ground" && o.flock === b.flock && Math.hypot(o.x - b.x, o.z - b.z) < reach) up(o, "the flock went up");
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
