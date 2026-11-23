import { smoothProfile, type P2 } from "../path";
import type { Street } from "../terrain/streets";
import { Rng } from "../rng";
import { voxels } from "../scale";
import { GROUND, clearOfStreetProps, nearestWalk, type WalkMap } from "./walk";
import type { Person } from "./agents";
import { NO_PATH, type Path } from "./ahead";

/**
 * Traffic (pure: no three.js; the renderer reads the arrays). Cars, vans, taxis and buses drive the
 * streets, keeping to the right.
 *
 * - The road graph: every street is two lanes, one each way, offset to the right of its center
 *   line and trimmed back from the junctions. At a junction each lane coming in is joined to every
 *   lane going out (not back the way it came) by a link, a smooth curve from one to the other. A
 *   street that ends short of the diorama's edge turns round; one that runs off the edge is where
 *   traffic leaves the island and comes back on.
 * - The plaza, where two or more streets meet it, is a roundabout: a one-way ring round the
 *   Landmark (on its left, keeping right), midway between it and the plaza's edge, with a junction
 *   at the middle of each side. Those on the ring go first; one coming on needs room for one more
 *   behind it, so the ring never fills; one whose way off has no room goes round again. Buses and
 *   garbage trucks are too long to turn between the Landmark and the plaza's edge: they turn round
 *   where a street meets the plaza instead. A street too short between the plaza and its next
 *   junction (two junctions that close hold each other up) keeps turning round there too.
 * - Driving: each vehicle follows the one ahead by the Intelligent Driver Model (it keeps a time gap,
 *   brakes harder the faster it closes in), slows for the bends, and stops dead where it means to
 *   (a stop line, a bus stop, a fare). Cars and vans take turns at random (off the island now and
 *   then); taxis and buses route (shortest path over the lanes).
 * - Junctions: a vehicle asks for its link before it gets there. Links that cross or merge, or start
 *   from the same lane, conflict; once at the stop line, the junction lets in whoever asked first,
 *   and anyone else whose link conflicts with no one let in and no one at the line before them.
 *   Everyone else waits at the line; a vehicle holds the junction until its back is out of the link.
 * - People, both ways: a vehicle brakes for anyone its body would pass over (on a turn its corners
 *   sweep the curb), and someone about to step off the curb waits while a vehicle is coming (and
 *   hurries across once on the road). People walk round vehicles and step out of their way; kept
 *   waiting a few seconds, a vehicle creeps on and people make way. Buses go round
 *   their routes and stop at their shelters, where people waiting get on and riders get off. Taxis
 *   cruise until someone at the curb hails one; the free taxi with the shortest drive there comes,
 *   takes them aboard and drops them somewhere else in the city. A free taxi about to pass someone
 *   hailing stops for them.
 * - Garbage trucks (life/waste.ts gives them their rounds): sent to a bin's curb, the incinerator or
 *   their depot, they pull up there, stand while they load or unload, and tell the waste when they
 *   pull up (`serve`). Between orders they drive about; they never leave the island.
 */

export type VehicleKind = "car" | "van" | "taxi" | "bus" | "truck";
/**
 * A vehicle is layered as a person is (agents.ts):
 * - the task, by kind: cars and vans roam; a bus keeps to its route; a taxi cruises, fetches a fare
 *   and carries it; a garbage truck waits at its depot, collects bins and hauls them away;
 * - the activity, the one state machine: driving, standing at its halt with the doors open, or off
 *   the island (gone over the edge, towed, or waiting for room to come back on);
 * - what holds its speed this step (reported only): nothing (free), a bend, the vehicle ahead,
 *   people in the way, edging past them (creep), the stop line, or its halt.
 */
export type VehicleActivity = "drive" | "stand" | "off";
export type Task = "roam" | "route" | "cruise" | "fetch" | "carry" | "depot" | "collect" | "haul";
export type Limit = "free" | "bend" | "lead" | "people" | "creep" | "line" | "halt";

/** Sizes (voxels): small city cars (kei cars), vans, and community buses that fit the 3.5 m streets. */
export const SIZE: Record<VehicleKind, { length: number; width: number }> = {
  car: { length: voxels(3.4), width: voxels(1.4) },
  taxi: { length: voxels(3.4), width: voxels(1.4) },
  van: { length: voxels(4.2), width: voxels(1.6) },
  bus: { length: voxels(6), width: voxels(1.65) },
  truck: { length: voxels(5), width: voxels(1.7) },
};
/** Speed limits (voxels per second: 4 is 1 m/s): avenues, side streets; and the most a kind goes. */
const MAIN = 22;
const SIDE = 16;
const TOP: Record<VehicleKind, number> = { car: 24, taxi: 24, van: 20, bus: 17, truck: 16 };
/** Through a link: straight on, turning, turning round. */
const LINK_STRAIGHT = 15;
const LINK_TURN = 9;
const LINK_ROUND = 5;
/** Intelligent Driver Model: acceleration, comfortable braking (voxels/s²), standstill gap (voxels), time gap (s). */
const ACCEL = 9;
const BRAKE = 14;
const S0 = 5;
const HEADWAY = 1.1;
/** Braking to stop at a point (voxels/s²). */
const STOP_BRAKE = 12;
/** A lane's center is this share of the street's width right of its center line (a little in from
 * the middle of its half, so a car clears the curb). */
const LANE = 0.24;
/** Lanes are trimmed this far (voxels) back from a junction's center, a bend, and a turning point. */
const TRIM_JUNCTION = 5;
const TRIM_BEND = 3;
/** Links closer than this (voxels) anywhere conflict (wide enough for two bodies), except two going
 * straight on in opposite directions, which pass as on the street. */
const CLEARANCE = 7.5;
/** A vehicle asks for its link this far (voxels) before the stop line (so who came first goes
 * first), and is let in once within ENTER (plus a second's travel) of it. */
const ASK = 40;
const ENTER = 8;
/** How far ahead (voxels) a vehicle looks for the next vehicle. */
const LOOK = 90;
/** People within this much of a vehicle's body (voxels) are in its way. */
const MARGIN = 0.5;
/** Kept waiting by people this long (s), a vehicle creeps on at CREEP (voxels per second). */
const PATIENCE = 3;
const CREEP = 2.5;
/** A vehicle that has not moved for this long (s) is towed (taken off and brought back elsewhere). */
const TOW = 45;
/** At the most crowded: lane length (voxels) per vehicle, and vehicles per junction. */
const ROOM = 70;
const PER_JUNCTION = 3;
/** What turning round costs a route, as so many voxels of driving. */
const ROUND_COST = 400;
/** The ring round the Landmark: its lanes' street (none of the streets'), and how far (voxels) they are trimmed back from the plaza's sides. */
const RING = -2;
const RING_TRIM = 6;
/** Coming onto the ring takes room for this much more (voxels: about a car and its gap) on the ring past it. */
const RING_SPARE = 20;
/** A street from the plaza joins the ring only if its lanes would be at least this long (voxels: two vans). */
const RING_JOIN = 34;
/** Dead ends shorter than this (voxels) are kept out of. */
const STUB = 40;
/** Bus: riders, the least and most time at a stop (s), the chance a rider gets off at each stop. */
export const BUS_SEATS = 18;
const DWELL = [3, 18];
const ALIGHT = 0.35;
/** A taxi waits this long (s) for its fare to get in, and drives at least this far (voxels) with one. */
const FARE_WAIT = 20;
const FARE_RIDE = 160;
/** A free taxi stops for someone hailing this far (voxels) ahead on its lane, if it can brake in time. */
const PASS_BY = 90;
/** Bus stops: how many shelters, and the shortest lane (voxels) one goes on. */
const SHELTERS = 6;
const SHELTER_LANE = 70;
/** A garbage truck stands this long (s) at a bin, and at the incinerator. */
/** How far (columns) a bus shelter, and a curb spot (a bin, a taxi's fare), keeps from a street lamp. */
const SHELTER_CLEAR = 6;
const CURB_CLEAR = 3;
const LOAD_TIME = 4;
const UNLOAD_TIME = 6;
const TRUCK = 0x4f7a3c;

export interface Seg {
  pts: P2[];
  /** Ground level at each point (smoothed). */
  y: Float32Array;
  /** Distance along to each point. */
  cum: Float32Array;
  len: number;
  /** A lane: the nodes it leaves and comes to; a link: its node (both). */
  a: number;
  b: number;
  link: boolean;
  /** For a lane, its street and direction (1 along the street's curve, -1 against). */
  street: number;
  dir: number;
  next: number[];
  limit: number;
  /** Links at the same node this one conflicts with. */
  conflicts: Set<number>;
  /** Vehicles on it, rearmost first (rebuilt each step). */
  on: Vehicle[];
  /** Connected part of the road graph (lanes reach each other only within one). */
  part: number;
  /**
   * Who may drive it: everyone; only the small (the ring round the Landmark and the links onto it:
   * a bus or a garbage truck is too long to turn between the Landmark and the plaza's edge); or
   * only the big (turning round where a street meets the plaza, instead of the ring).
   */
  fits: "all" | "small" | "big";
}

export interface RoadNode {
  x: number;
  z: number;
  kind: "junction" | "bend" | "end" | "exit";
  /** Waiting for a link, in the order they asked; and those let in. */
  queue: Vehicle[];
  holders: Vehicle[];
}

export interface Stop {
  /** The column people wait on, its place, ground, and the way they face (to the road). */
  k: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  /** Where the bus stops (lane and distance along), and the route it is on. */
  seg: number;
  s: number;
  route: number;
  /** People waiting or getting on; the bus standing at it. */
  queue: Person[];
  bus: Vehicle | null;
}

export interface Fare {
  person: Person;
  seg: number;
  s: number;
  taxi: Vehicle | null;
  /** The taxi is standing at the curb for them. */
  ready: boolean;
  /** Where they are going, if they say (else somewhere else in the city). */
  to: P2 | null;
}

export interface Halt {
  seg: number;
  s: number;
  kind: "stop" | "pickup" | "drop" | "bin" | "unload" | "depot";
  stop?: Stop;
}

export interface Vehicle {
  kind: VehicleKind;
  length: number;
  width: number;
  color: number;
  /** Where: the segment, distance along it, and the segments to come. */
  seg: number;
  s: number;
  v: number;
  plan: number[];
  /** Pose, for drawing. */
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  braking: boolean;
  task: Task;
  activity: VehicleActivity;
  limit: Limit;
  /** How long (s) in this activity (standing: at its halt), and why it began. */
  since: number;
  why: string;
  /** Off: until it tries to come back on. */
  timer: number;
  /** The link granted at the next junction, and the junction it holds; the link it asked for, and when it got to the line. */
  granted: number;
  holds: number;
  asked: number;
  ready: number;
  still: number;
  halt: Halt | null;
  riders: Person[];
  /** Bus: its route, where on it its plan has got to, and the next stop on it. */
  route: number;
  leg: number;
  next: number;
  /** Taxi: the fare it is fetching or carrying. */
  fare: Fare | null;
}

interface Route {
  segs: number[];
  stops: Stop[];
  color: number;
}

const CAR_COLORS = [0x2a2f3a, 0x8b1e2d, 0xc7ccd4, 0x1e4a5c, 0x5b5f66, 0xe6e2d8, 0x3c2a4d, 0x15161a, 0x6e7d3a, 0xa9b0b8];
const VAN_COLORS = [0xe8e6df, 0x9aa1a8, 0xd06a2a, 0x2f4f6f];
const TAXI = 0xe8b923;
const ROUTE_COLORS = [0x1aa6b7, 0xd23c77];

export interface TrafficCounts {
  cars: number;
  vans: number;
  taxis: number;
  buses: number;
}

/** The plaza, driven round its Landmark: its center, half its side, and half the Landmark's (columns). */
export interface Roundabout {
  x: number;
  z: number;
  half: number;
  inner: number;
}

export interface TrafficHooks {
  /** People near (x, z), for braking. */
  near(x: number, z: number, r: number): Person[];
  /** A garbage truck pulls up at a bin or the incinerator. */
  serve(v: Vehicle): void;
  /** A rider gets off at (x, z), facing `heading`. */
  alight(p: Person, x: number, z: number, heading: number): void;
  /** Whether a rider gets off the bus at this stop (null: as it likes, by chance). */
  getOff(p: Person, stop: Stop): boolean | null;
}

export class Traffic {
  readonly segs: Seg[] = [];
  readonly nodes: RoadNode[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly stops: Stop[] = [];
  readonly routes: Route[] = [];
  /** Curb columns beside the lanes (bins, taxis' fares), and the lane spot each one is beside. */
  readonly curbs: number[] = [];
  /** The curbs where people hail taxis: those on the main part of the graph, where the taxis drive. */
  readonly taxiCurbs: number[] = [];
  private readonly curbSpot = new Map<number, { seg: number; s: number }>();
  private readonly fares: Fare[] = [];
  /** The largest part of the road graph (the buses' and the garbage trucks'), and the garbage trucks' depot on it. */
  main = 0;
  /** True if traffic goes round the Landmark (the plaza is a roundabout). */
  ring = false;
  depot: { seg: number; s: number } | null = null;
  private readonly rng: Rng;
  private time = 0;

  constructor(
    private readonly map: WalkMap,
    streets: Street[],
    seed: number,
    count: TrafficCounts,
    private readonly hooks: TrafficHooks,
    roundabout: Roundabout | null = null,
  ) {
    this.rng = new Rng(seed ^ 0x7aff1c);
    this.buildGraph(streets, roundabout);
    this.buildCurbs();
    this.buildRoutes();
    for (const k of this.curbs) if (this.segs[this.curbSpot.get(k)!.seg].part === this.main) this.taxiCurbs.push(k);
    // The fleet, out already, on the lanes (no more than the lanes have room for, nor the junctions
    // can let through).
    const junctions = this.nodes.filter((N) => N.kind === "junction").length;
    const room = Math.min(this.segs.reduce((t, s) => t + (s.link ? 0 : s.len), 0) / ROOM, junctions * PER_JUNCTION + 4);
    const scale = Math.min(1, room / Math.max(1, count.cars + count.vans + count.taxis + count.buses * 2));
    const fleet: VehicleKind[] = [
      ...Array<VehicleKind>(Math.round(count.cars * scale)).fill("car"),
      ...Array<VehicleKind>(Math.round(count.vans * scale)).fill("van"),
      ...Array<VehicleKind>(Math.round(count.taxis * scale)).fill("taxi"),
    ];
    for (const kind of fleet) {
      const v = this.vehicle(kind);
      // Taxis on the main part, where the people hailing them are.
      if (!this.place(v, this.lanes(kind === "taxi" ? this.main : -1))) into(v, "off", "no room on the lanes");
      this.vehicles.push(v);
    }
    // Buses: spread out round their routes.
    this.routes.forEach((r, i) => {
      for (let b = 0; b < count.buses; b++) {
        const v = this.vehicle("bus");
        v.color = r.color;
        v.route = i;
        const at = Math.floor((b / count.buses) * r.segs.length);
        if (!this.placeOnRoute(v, at)) into(v, "off", "no room on its route");
        this.vehicles.push(v);
      }
    });
  }

  /* ---------- The road graph ---------- */

  private buildGraph(streets: Street[], roundabout: Roundabout | null) {
    const { n } = this.map;
    const nodeAt = (p: P2) => {
      const i = this.nodes.findIndex((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3);
      if (i >= 0) return i;
      this.nodes.push({ x: p.x, z: p.z, kind: "junction", queue: [], holders: [] });
      return this.nodes.length - 1;
    };
    const ends = streets.map((st) => [nodeAt(st.curve[0]), nodeAt(st.curve[st.curve.length - 1])]);
    const degree = this.nodes.map((_, i) => ends.reduce((d, e) => d + (e[0] === i ? 1 : 0) + (e[1] === i ? 1 : 0), 0));
    this.nodes.forEach((N, i) => {
      const edge = N.x < 2 || N.z < 2 || N.x > n - 3 || N.z > n - 3;
      N.kind = degree[i] >= 3 ? "junction" : degree[i] === 2 ? "bend" : edge ? "exit" : "end";
    });
    // The plaza's sides: the middle of each is a junction on the ring round the Landmark, whether
    // a street comes in there or not.
    // The plaza's sides: the middle of each is a junction on the ring round the Landmark, whether
    // a street comes in there or not. A street from the plaza joins the ring only if its lanes
    // would be long enough between the plaza and its other end (two junctions too close each hold
    // the other up); one too short stays a dead end at the plaza, where traffic turns round. With
    // fewer than two streets to join, there is no ring: it would take no one anywhere new.
    const arc = (c: P2[]) => c.reduce((t, p, j) => (j ? t + Math.hypot(p.x - c[j - 1].x, p.z - c[j - 1].z) : 0), 0);
    const apart = (st: Street, N: RoadNode) => (N.kind === "junction" ? st.width / 2 + TRIM_JUNCTION : N.kind === "exit" ? 0 : TRIM_BEND);
    const mids = roundabout ? this.plazaSides(roundabout) : [];
    const atSide = (e: number) => mids.some((p) => Math.hypot(this.nodes[e].x - p.x, this.nodes[e].z - p.z) < 3);
    const short = new Set<number>();
    let joining = 0;
    streets.forEach((st, i) => {
      const at = ends[i].findIndex(atSide);
      if (at < 0 || st.curve.length < 2) return;
      if (arc(st.curve) - (st.width / 2 + TRIM_JUNCTION) - apart(st, this.nodes[ends[i][1 - at]]) < RING_JOIN) short.add(i);
      else joining++;
    });
    const sides = roundabout && joining >= 2 ? mids.map((p) => nodeAt(p)) : [];
    for (const i of sides) this.nodes[i].kind = "junction";
    this.ring = sides.length > 0;
    if (!this.ring) short.clear();
    // Lanes: offset right of the curve, trimmed back from the nodes.
    const trim = (N: RoadNode, width: number) => (N.kind === "junction" ? width / 2 + TRIM_JUNCTION : N.kind === "exit" ? 0 : TRIM_BEND);
    streets.forEach((st, i) => {
      if (st.curve.length < 2) return;
      // (A short one turns round at the plaza: trimmed there as at a dead end.)
      const trimAt = (k: number) => (short.has(i) && sides.includes(k) ? TRIM_BEND : trim(this.nodes[k], st.width));
      for (const dir of [1, -1]) {
        const curve = dir > 0 ? st.curve : [...st.curve].reverse();
        const a = ends[i][dir > 0 ? 0 : 1];
        const b = ends[i][dir > 0 ? 1 : 0];
        const off = st.width * LANE;
        const shifted = curve.map((p, j) => {
          const q = curve[Math.max(0, j - 1)];
          const r = curve[Math.min(curve.length - 1, j + 1)];
          const tx = r.x - q.x;
          const tz = r.z - q.z;
          const m = Math.hypot(tx, tz) || 1;
          return { x: p.x - (tz / m) * off, z: p.z + (tx / m) * off };
        });
        const pts = cut(shifted, trimAt(a), trimAt(b));
        if (pts.length < 2) continue;
        this.addSeg(pts, null, a, b, false, i, dir, st.kind === "main" ? MAIN : SIDE);
      }
    });
    if (roundabout && this.ring) this.buildRing(roundabout, sides);
    // Links: at each node, every lane in to every lane out (not back the same street, except where
    // the street ends and traffic turns round).
    const lanes = this.segs.length;
    for (let L = 0; L < lanes; L++) {
      const into = this.segs[L];
      const N = this.nodes[into.b];
      if (N.kind === "exit") continue;
      for (let M = 0; M < lanes; M++) {
        const out = this.segs[M];
        if (out.a !== into.b) continue;
        // (On round the ring, from one of its lanes to the next; and where a street meets the
        // plaza, turning round for the big, who can't take the ring.)
        const round = out.street === into.street && into.street !== RING;
        const plazaRound = round && sides.includes(into.b);
        if (round !== (N.kind === "end") && !plazaRound) continue;
        // (A street too short for the ring: only turning round, for everyone.)
        const shortHere = (k: number) => k >= 0 && short.has(k) && sides.includes(into.b);
        if ((shortHere(into.street) || shortHere(out.street)) && !round) continue;
        const p0 = into.pts[into.pts.length - 1];
        const p1 = out.pts[0];
        const t0 = tangent(into.pts, into.pts.length - 1);
        const t1 = tangent(out.pts, 0);
        const k = round ? 14 : Math.hypot(p1.x - p0.x, p1.z - p0.z) * 0.55;
        const pts = hermite(p0, t0, p1, t1, k);
        const angle = Math.acos(Math.max(-1, Math.min(1, t0.x * t1.x + t0.z * t1.z)));
        const limit = round ? LINK_ROUND : angle < 0.35 ? LINK_STRAIGHT : LINK_TURN;
        const y0 = into.y[into.y.length - 1];
        const y1 = out.y[0];
        const id = this.addSeg(pts, (t) => y0 + (y1 - y0) * t, into.b, into.b, true, -1, 0, limit);
        this.segs[id].fits = plazaRound && !short.has(into.street) ? "big" : into.street === RING || out.street === RING ? "small" : "all";
        into.next.push(id);
        this.segs[id].next.push(M);
      }
    }
    // Conflicts between the links at each junction: from the same lane, into the same lane, or crossing.
    for (let i = lanes; i < this.segs.length; i++) {
      for (let j = i + 1; j < this.segs.length; j++) {
        const A = this.segs[i];
        const B = this.segs[j];
        if (A.a !== B.a) continue;
        const ta = tangent(A.pts, A.pts.length >> 1);
        const tb = tangent(B.pts, B.pts.length >> 1);
        const passing = A.limit === LINK_STRAIGHT && B.limit === LINK_STRAIGHT && ta.x * tb.x + ta.z * tb.z < -0.9 && A.next[0] !== B.next[0];
        if (!passing && closest(A.pts, B.pts) < CLEARANCE) {
          A.conflicts.add(j);
          B.conflicts.add(i);
        }
      }
    }
    // Connected parts (lanes reach each other only within one).
    const around = this.segs.map((s) => [...s.next]);
    this.segs.forEach((s, i) => s.next.forEach((j) => around[j].push(i)));
    let part = 0;
    this.segs.forEach((s0, i0) => {
      if (s0.part >= 0) return;
      const stack = [i0];
      s0.part = part;
      while (stack.length) {
        for (const j of around[stack.pop()!]) {
          if (this.segs[j].part < 0) {
            this.segs[j].part = part;
            stack.push(j);
          }
        }
      }
      part++;
    });
  }

  /** The middle of each side of the plaza, in the order the ring runs (the Landmark on the left, keeping right). */
  private plazaSides(r: Roundabout): P2[] {
    // +x, −z, −x, +z: counterclockwise seen from above (x right, z toward the viewer), so with
    // the lanes' right at (−tz, tx) the Landmark is on the left.
    return [
      { x: r.x + r.half, z: r.z },
      { x: r.x, z: r.z - r.half },
      { x: r.x - r.half, z: r.z },
      { x: r.x, z: r.z + r.half },
    ];
  }

  /**
   * The ring round the Landmark: one lane each from the middle of a side of the plaza to the next,
   * midway between the Landmark and the plaza's edge, round each corner on a curve about the
   * Landmark's corner (so a vehicle's body clears it), trimmed back from the junctions at the sides.
   */
  private buildRing(r: Roundabout, sides: number[]) {
    const R = (r.inner + r.half) / 2;
    const bend = R - r.inner;
    const mids = this.plazaSides(r);
    for (let i = 0; i < 4; i++) {
      const a = mids[i];
      const b = mids[(i + 1) % 4];
      // From the side's middle (at R) along the side to the corner, round it, and on to the next side's middle.
      const ax = Math.sign(a.x - r.x);
      const az = Math.sign(a.z - r.z);
      const bx = Math.sign(b.x - r.x);
      const bz = Math.sign(b.z - r.z);
      const start = { x: r.x + ax * R, z: r.z + az * R };
      const end = { x: r.x + bx * R, z: r.z + bz * R };
      // The corner between them, and the Landmark's corner the curve goes round.
      const cx = ax || bx;
      const cz = az || bz;
      const pivot = { x: r.x + cx * r.inner, z: r.z + cz * r.inner };
      const pts: P2[] = [];
      // Along the first side to the curve's start.
      const c0 = { x: pivot.x + (ax ? ax * bend : 0), z: pivot.z + (az ? az * bend : 0) };
      const c1 = { x: pivot.x + (bx ? bx * bend : 0), z: pivot.z + (bz ? bz * bend : 0) };
      const line = (p: P2, q: P2) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z)));
        for (let s = 0; s < steps; s++) pts.push({ x: p.x + ((q.x - p.x) * s) / steps, z: p.z + ((q.z - p.z) * s) / steps });
      };
      line(start, c0);
      const t0 = Math.atan2(c0.z - pivot.z, c0.x - pivot.x);
      let t1 = Math.atan2(c1.z - pivot.z, c1.x - pivot.x);
      while (t1 - t0 > Math.PI) t1 -= 2 * Math.PI;
      while (t0 - t1 > Math.PI) t1 += 2 * Math.PI;
      const arc = Math.max(4, Math.ceil(Math.abs(t1 - t0) * bend));
      for (let s = 0; s < arc; s++) {
        const t = t0 + ((t1 - t0) * s) / arc;
        pts.push({ x: pivot.x + Math.cos(t) * bend, z: pivot.z + Math.sin(t) * bend });
      }
      line(c1, end);
      pts.push(end);
      const lane = cut(pts, RING_TRIM, RING_TRIM);
      if (lane.length >= 2) this.segs[this.addSeg(lane, null, sides[i], sides[(i + 1) % 4], false, RING, 1, LINK_STRAIGHT)].fits = "small";
    }
  }

  private addSeg(pts: P2[], level: ((t: number) => number) | null, a: number, b: number, link: boolean, street: number, dir: number, limit: number) {
    const { n, y } = this.map;
    const cum = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const len = cum[pts.length - 1];
    const ground = Float32Array.from(pts, (p, i) => (level ? level(len ? cum[i] / len : 0) : y[Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0))]));
    this.segs.push({ pts, y: level ? ground : ride(ground), cum, len, a, b, link, street, dir, next: [], limit, conflicts: new Set(), on: [], part: -1, fits: "all" });
    return this.segs.length - 1;
  }

  /** Lanes (not links), optionally of one part; not the stubs, nor the ring round the Landmark. */
  private lanes(part = -1) {
    const out: number[] = [];
    this.segs.forEach((s, i) => !s.link && s.street !== RING && !this.stub(s) && (part < 0 || s.part === part) && out.push(i));
    return out;
  }

  /** A short dead end (into or out of a turning point, too short for a bus): kept out of. */
  private stub(s: Seg) {
    return !s.link && s.len < STUB && (this.nodes[s.a].kind === "end" || this.nodes[s.b].kind === "end");
  }

  /** Where people hail taxis: sidewalk columns beside the lanes, each with its spot on the lane. */
  private buildCurbs() {
    const { n } = this.map;
    this.segs.forEach((s, i) => {
      if (s.link || s.street === RING || s.len < 30) return;
      for (let d = 12; d < s.len - 12; d += 6) {
        const p = this.at(s, d);
        const r = right(this.dirAt(s, d));
        const k = nearestWalk(this.map, p.x + r.x * 7, p.z + r.z * 7, 2);
        if (k < 0 || this.curbSpot.has(k) || !clearOfStreetProps(this.map, (k % n) + 0.5, ((k / n) | 0) + 0.5, CURB_CLEAR)) continue;
        // Only the sidewalk beside the road (not across a lot).
        if (Math.hypot((k % n) + 0.5 - p.x, ((k / n) | 0) + 0.5 - p.z) > 9) continue;
        this.curbSpot.set(k, { seg: i, s: d });
        this.curbs.push(k);
      }
    });
  }

  /**
   * The largest set of `lanes` a bus can drive between in both directions (never round the ring,
   * never off the island, as in `path`): from each lane, what it can reach and what can reach it.
   */
  private busReach(lanes: number[]): Set<number> {
    const count = this.segs.length;
    const onward = (i: number) => {
      const s = this.segs[i];
      if ((!s.link && this.nodes[s.b].kind === "exit") || this.stub(s)) return [];
      return s.next.filter((j) => this.segs[j].fits !== "small");
    };
    const back: number[][] = Array.from({ length: count }, () => []);
    for (let i = 0; i < count; i++) for (const j of onward(i)) back[j].push(i);
    const reach = (root: number, edges: (i: number) => number[]) => {
      const seen = new Set([root]);
      const todo = [root];
      while (todo.length) {
        for (const j of edges(todo.pop()!)) if (!seen.has(j)) (seen.add(j), todo.push(j));
      }
      return seen;
    };
    let best = new Set<number>();
    for (const root of lanes) {
      const there = reach(root, onward);
      const home = reach(root, (i) => back[i]);
      const both = new Set([...there].filter((i) => home.has(i)));
      if (both.size > best.size) best = both;
    }
    return best;
  }

  /** Bus routes: shelters on long lanes far apart; one route round them each way. */
  private buildRoutes() {
    // The largest part of the graph.
    const sizes = new Map<number, number>();
    for (const s of this.segs) if (!s.link) sizes.set(s.part, (sizes.get(s.part) ?? 0) + s.len);
    let part = -1;
    let most = 0;
    for (const [p, l] of sizes) if (l > most) [part, most] = [p, l];
    this.main = Math.max(0, part);
    // Streets with a lane each way, long enough, not leaving the island: farthest apart first.
    const streets = new Map<number, number[]>();
    this.segs.forEach((s, i) => {
      if (s.link || s.street === RING || s.part !== part || s.len < SHELTER_LANE || this.nodes[s.a].kind === "exit" || this.nodes[s.b].kind === "exit") return;
      streets.set(s.street, [...(streets.get(s.street) ?? []), i]);
    });
    // Only streets the buses can come back from: with the plaza a roundabout they can't cross it,
    // so some streets (those joined only through the plaza) can be reached but not left, and a
    // route round the city that touched one would have no way on.
    const joined = this.busReach([...streets.values()].flat());
    const pairs = [...streets.values()].filter((l) => l.length === 2 && l.every((i) => joined.has(i)));
    if (pairs.length < 3) return;
    const mid = (l: number) => this.at(this.segs[l], this.segs[l].len / 2);
    const picked: number[][] = [pairs[Math.floor(this.rng.next() * pairs.length)]];
    while (picked.length < Math.min(SHELTERS, pairs.length)) {
      let best = pairs[0];
      let bd = -1;
      for (const pr of pairs) {
        if (picked.includes(pr)) continue;
        const d = Math.min(...picked.map((q) => Math.hypot(mid(q[0]).x - mid(pr[0]).x, mid(q[0]).z - mid(pr[0]).z)));
        if (d > bd) [best, bd] = [pr, d];
      }
      picked.push(best);
    }
    // Round the city's center, one way and the other.
    const cx = picked.reduce((t, p) => t + mid(p[0]).x, 0) / picked.length;
    const cz = picked.reduce((t, p) => t + mid(p[0]).z, 0) / picked.length;
    const angle = (l: number) => Math.atan2(mid(l).z - cz, mid(l).x - cx);
    for (const way of [1, -1]) {
      // The lane on each street that goes round this way.
      const lanes = picked.map((pr) =>
        pr.reduce((a, b) => {
          const turning = (l: number) => {
            const m = mid(l);
            const t = this.dirAt(this.segs[l], this.segs[l].len / 2);
            return ((m.x - cx) * t.z - (m.z - cz) * t.x) * way;
          };
          return turning(a) > turning(b) ? a : b;
        }),
      );
      lanes.sort((a, b) => (angle(a) - angle(b)) * way);
      const route: Route = { segs: [], stops: [], color: ROUTE_COLORS[this.routes.length % ROUTE_COLORS.length] };
      for (let i = 0; i < lanes.length; i++) {
        const from = lanes[i];
        const to = lanes[(i + 1) % lanes.length];
        const path = this.path(from, this.segs[from].len / 2, to, this.segs[to].len / 2, true, true);
        if (!path) {
          route.segs = [];
          break;
        }
        route.segs.push(...path.slice(0, -1));
      }
      if (!route.segs.length) continue;
      const index = this.routes.length;
      for (const l of lanes) {
        const s = this.segs[l];
        // Halfway along the lane, or the nearest spot to it with room for the shelter clear of the
        // street lamps.
        const { n, y } = this.map;
        let at = s.len / 2;
        let k = -1;
        for (let o = 0; o <= s.len / 2 - 12; o = o > 0 ? -o : -o + 4) {
          const d = s.len / 2 + o;
          const p = this.at(s, d);
          const r = right(this.dirAt(s, d));
          const j = nearestWalk(this.map, p.x + r.x * 7, p.z + r.z * 7, 3);
          if (j >= 0 && clearOfStreetProps(this.map, (j % n) + 0.5, ((j / n) | 0) + 0.5, SHELTER_CLEAR)) {
            [at, k] = [d, j];
            break;
          }
        }
        if (k < 0) continue;
        const r = right(this.dirAt(s, at));
        const stop: Stop = { k, x: (k % n) + 0.5, z: ((k / n) | 0) + 0.5, y: y[k], heading: Math.atan2(-r.x, -r.z), seg: l, s: at, route: index, queue: [], bus: null };
        this.stops.push(stop);
        route.stops.push(stop);
      }
      this.routes.push(route);
    }
  }

  /**
   * The shortest way (by length) from distance `fromS` on segment `from` to `toS` on `to`, as the
   * segments in order (both ends included); null if there is none. With `stay`, never off the island;
   * with `big` (a bus or a garbage truck), never round the ring.
   */
  path(from: number, fromS: number, to: number, toS: number, stay = false, big = false): number[] | null {
    const barred = (j: number) => this.segs[j].fits === (big ? "small" : "big");
    if (from === to && toS > fromS + 4) return [from];
    const count = this.segs.length;
    const dist = new Float64Array(count).fill(Infinity);
    const prev = new Int32Array(count).fill(-1);
    const done = new Uint8Array(count);
    for (const j of this.segs[from].next) {
      if (barred(j)) continue;
      dist[j] = this.segs[from].len - fromS;
      prev[j] = from;
    }
    for (;;) {
      let best = -1;
      for (let i = 0; i < count; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
      if (best < 0) return null;
      if (best === to) break;
      done[best] = 1;
      const s = this.segs[best];
      if ((stay && !s.link && this.nodes[s.b].kind === "exit") || this.stub(s)) continue;
      for (const j of s.next) {
        if (barred(j)) continue;
        // (Turning round at a dead end, or where a street meets the plaza, only if there is no other way.)
        const d = dist[best] + s.len + (this.segs[j].link && this.segs[j].limit === LINK_ROUND ? ROUND_COST : 0);
        if (d < dist[j]) {
          dist[j] = d;
          prev[j] = best;
        }
      }
    }
    const out = [to];
    for (let i = to; prev[i] !== from; i = prev[i]) {
      if (prev[i] < 0) return null;
      out.push(prev[i]);
    }
    out.push(from);
    return out.reverse();
  }

  /* ---------- Vehicles ---------- */

  private vehicle(kind: VehicleKind): Vehicle {
    const color = kind === "taxi" ? TAXI : kind === "truck" ? TRUCK : kind === "van" ? this.rng.pick(VAN_COLORS) : this.rng.pick(CAR_COLORS);
    return {
      kind,
      ...SIZE[kind],
      color,
      seg: 0,
      s: 0,
      v: 0,
      plan: [],
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      pitch: 0,
      braking: false,
      task: kind === "bus" ? "route" : kind === "taxi" ? "cruise" : kind === "truck" ? "depot" : "roam",
      activity: "drive",
      limit: "free",
      since: 0,
      why: "out already",
      timer: 0,
      granted: -1,
      holds: -1,
      asked: -1,
      ready: -1,
      still: 0,
      halt: null,
      riders: [],
      route: -1,
      leg: 0,
      next: 0,
      fare: null,
    };
  }

  /** Room at distance `s` on segment `seg` for a vehicle `length` long (no one within `gap` of it, on any segment). */
  private clear(seg: number, s: number, length: number, gap: number) {
    const p = this.at(this.segs[seg], s);
    return !this.vehicles.some((o) => o.activity !== "off" && Math.hypot(o.x - p.x, o.z - p.z) < (o.length + length) / 2 + gap);
  }

  /** Puts a vehicle somewhere free on one of `lanes`; false if there was nowhere. */
  private place(v: Vehicle, lanes: number[], at = -1): boolean {
    for (let t = 0; t < 30 && lanes.length; t++) {
      const seg = lanes[Math.floor(this.rng.next() * lanes.length)];
      const S = this.segs[seg];
      if (S.len < v.length + 4) continue;
      const s = at >= 0 ? at : this.rng.range(v.length / 2 + 1, S.len - v.length / 2 - 1);
      if (!this.clear(seg, s, v.length, 8)) continue;
      Object.assign(v, { seg, s, v: 0, plan: [], activity: "drive", since: 0, granted: -1, holds: -1, asked: -1, still: 0 });
      this.pose(v);
      return true;
    }
    return false;
  }

  private placeOnRoute(v: Vehicle, at: number): boolean {
    const r = this.routes[v.route];
    for (let t = 0; t < r.segs.length; t++) {
      const i = (at + t) % r.segs.length;
      const seg = r.segs[i];
      if (this.segs[seg].link || this.segs[seg].len < v.length + 4) continue;
      const s = this.segs[seg].len / 2;
      if (!this.clear(seg, s, v.length, 12)) continue;
      Object.assign(v, { seg, s, v: 0, plan: [], leg: i, activity: "drive", since: 0, granted: -1, holds: -1, asked: -1, still: 0 });
      this.toNextStop(v);
      this.pose(v);
      return true;
    }
    return false;
  }

  /**
   * A bus halts next at the first of its route's stops it comes to from where it is (one on its
   * own lane only if still ahead), so it never drives past a stop on its way to another.
   */
  private toNextStop(v: Vehicle) {
    const r = this.routes[v.route];
    const n = r.segs.length;
    const at = (((v.leg - v.plan.length) % n) + n) % n;
    let next: Stop | null = null;
    for (const st of r.stops) if (st.seg === v.seg && st.s > v.s + 1 && (!next || st.s < next.s)) next = st;
    for (let d = 1; d <= n && !next; d++) {
      const seg = r.segs[(at + d) % n];
      for (const st of r.stops) if (st.seg === seg && (!next || st.s < next.s)) next = st;
    }
    if (!next) return;
    v.next = r.stops.indexOf(next);
    v.halt = { seg: next.seg, s: next.s, kind: "stop", stop: next };
  }

  /** Back on: in from the island's edge if it can, else anywhere free (a garbage truck: out of its depot). */
  private respawn(v: Vehicle) {
    if (v.kind === "bus") return this.placeOnRoute(v, Math.floor(this.rng.next() * this.routes[v.route].segs.length));
    if (v.kind === "truck" && this.depot && this.place(v, [this.depot.seg], this.depot.s)) return true;
    const entries = this.lanes().filter((i) => this.nodes[this.segs[i].a].kind === "exit");
    if (v.kind !== "taxi" && v.kind !== "truck" && entries.length && this.place(v, entries, v.length / 2 + 1)) return true;
    return this.place(v, this.lanes(v.kind === "truck" || v.kind === "taxi" ? this.main : -1));
  }

  /** The segments to come, at least three. */
  private extend(v: Vehicle) {
    while (v.plan.length < 3) {
      const last = this.segs[v.plan.length ? v.plan[v.plan.length - 1] : v.seg];
      if (!last.next.length) return;
      if (v.kind === "bus") {
        const r = this.routes[v.route];
        v.leg = (v.leg + 1) % r.segs.length;
        v.plan.push(r.segs[v.leg]);
        continue;
      }
      // A turn at random: off the island now and then (cars and vans only), seldom into a dead end.
      const big = v.kind === "truck";
      const weights = last.next.map((j): number => {
        if (this.segs[j].fits === (big ? "small" : "big")) return 0;
        const lane = this.segs[j].link ? this.segs[this.segs[j].next[0]] : this.segs[j];
        const to = this.nodes[lane.b].kind;
        return to === "exit" ? (v.kind === "taxi" || v.kind === "truck" ? 0 : 0.3) : to === "end" ? (this.stub(lane) ? 0.001 : 0.25) : 1;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.rng.next() * total;
      let pick = last.next.find((_, i) => weights[i] > 0) ?? last.next[0];
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) [pick, r] = [last.next[i], Infinity];
      v.plan.push(pick);
    }
  }

  step(dt: number) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    for (const s of this.segs) s.on.length = 0;
    for (const v of this.vehicles) if (v.activity !== "off") this.segs[v.seg].on.push(v);
    for (const s of this.segs) if (s.on.length > 1) s.on.sort((a, b) => a.s - b.s);
    this.grant();
    this.dispatch();
    for (const v of this.vehicles) this.drive(v, dt);
  }

  /** Junctions let vehicles in: first come first served, and anyone not in the way of those before. */
  private grant() {
    this.nodes.forEach((N, id) => {
      if (!N.queue.length) return;
      // Let in only once at the line, so it holds the junction no longer than it must (and until
      // then it keeps no one waiting: it may be stuck behind someone who is), in the order they got there.
      for (const v of N.queue) if (v.ready < 0 && this.segs[v.seg].len - v.s - v.length / 2 < ENTER + v.v) v.ready = this.time;
      // (Round the ring, as at any roundabout: those on it first.)
      const onRing = (v: Vehicle) => this.segs[v.seg].street === RING;
      const ready = N.queue.filter((v) => v.ready >= 0).sort((a, b) => Number(onRing(b)) - Number(onRing(a)) || a.ready - b.ready);
      const ringComing = N.queue.some(onRing);
      // Links in use (following someone onto the same link is fine), and links wanted by those before.
      const taken = new Set(N.holders.map((h) => h.granted));
      const wanted = new Set<number>();
      for (const v of ready) {
        // Off the ring with no room on the street out: round once more instead (as at any
        // roundabout), so it doesn't stand on the ring and hold up everyone behind it.
        if (onRing(v) && this.segs[this.segs[v.asked].next[0]]?.street !== RING && !this.room(v.asked, v.length)) this.goRound(v);
        const link = v.asked;
        const conflicts = this.segs[link].conflicts;
        // Not into the junction unless there is room beyond it (so no one stops in it and blocks it).
        // Onto the ring from a street: only with no one coming round it, and room for one more
        // behind, so the ring never fills (full, everyone on it would wait for everyone else).
        const entering = !onRing(v) && this.segs[this.segs[link].next[0]]?.street === RING;
        if (entering && ringComing) continue;
        if (!this.room(link, v.length + (entering ? RING_SPARE : 0))) continue;
        if ([...taken].some((t) => conflicts.has(t)) || [...wanted].some((t) => t === link || conflicts.has(t))) {
          wanted.add(link);
          continue;
        }
        this.release(v);
        v.granted = link;
        v.holds = id;
        v.ready = -1;
        N.holders.push(v);
        N.queue.splice(N.queue.indexOf(v), 1);
        taken.add(link);
      }
    });
  }

  /** Room for a vehicle `length` long past link `link`: on the lane it leads to, behind whoever is
   * last on it (and anyone still on the link), unless they are moving off. */
  private room(link: number, length: number) {
    const out = this.segs[link].next[0];
    if (out === undefined) return true;
    const L = this.segs[out];
    const last = this.segs[link].on[0] ?? L.on[0];
    const free = last ? (last.seg === link ? last.s - this.segs[link].len : last.s) - last.length / 2 : Infinity;
    return free > Math.min(L.len, length + S0) || (last !== undefined && last.v > 4);
  }

  /** Free taxis to the fares: first any fare an empty taxi is about to pass, then the rest. */
  private dispatch() {
    // A free taxi about to pass someone hailing stops for them, unless their own taxi is nearer
    // (that one cruises on, free again).
    for (const v of this.vehicles) {
      if (v.kind !== "taxi" || v.task !== "cruise" || v.activity !== "drive") continue;
      const brake = (v.v * v.v) / (2 * STOP_BRAKE) + 2;
      for (const f of this.fares) {
        if (f === v.fare || f.seg !== v.seg || f.ready) continue;
        const ahead = f.s - v.s;
        if (ahead < brake || ahead > PASS_BY) continue;
        const u = f.taxi;
        if (u && Math.hypot(u.x - f.person.x, u.z - f.person.z) <= ahead) continue;
        if (u) this.drop(u);
        this.assign(v, f, [v.seg]);
        break;
      }
    }
    // The rest, waiting longest first: the free taxi with the shortest drive there.
    for (const f of this.fares) {
      if (f.taxi) continue;
      const free = this.vehicles
        .filter((v) => v.kind === "taxi" && v.task === "cruise" && v.activity === "drive" && this.segs[v.seg].part === this.segs[f.seg].part)
        .map((v) => ({ v, d: Math.hypot(v.x - f.person.x, v.z - f.person.z) }))
        .sort((a, b) => a.d - b.d);
      let best: Vehicle | null = null;
      let route: number[] | null = null;
      let bl = Infinity;
      for (const { v, d } of free) {
        // A drive is never shorter than the straight line: no one farther can beat the best.
        if (d >= bl) break;
        const p = this.path(v.seg, v.s, f.seg, f.s, true);
        if (!p) continue;
        const l = this.driveLength(v, p, f.s);
        if (l < bl) [best, route, bl] = [v, p, l];
      }
      if (best && route) this.assign(best, f, route);
    }
  }

  /** How far (voxels) `v` drives along `route` (from its segment) to `toS` on the last one. */
  private driveLength(v: Vehicle, route: number[], toS: number): number {
    if (route.length === 1) return toS - v.s;
    let l = this.segs[route[0]].len - v.s + toS;
    for (let i = 1; i < route.length - 1; i++) l += this.segs[route[i]].len;
    return l;
  }

  /** Taxi `v` goes for fare `f` along `route`. */
  private assign(v: Vehicle, f: Fare, route: number[]) {
    f.taxi = v;
    v.fare = f;
    v.task = "fetch";
    this.reroute(v, route);
    v.halt = { seg: f.seg, s: f.s, kind: "pickup" };
  }

  /** Taxi `v` lets its fare go (another taxi takes it, or will) and cruises on. */
  private drop(v: Vehicle) {
    const f = v.fare;
    if (f) {
      f.taxi = null;
      f.ready = false;
    }
    v.fare = null;
    v.halt = null;
    v.task = "cruise";
  }

  /** Follows `route` (from its current segment) from here on. */
  /** A vehicle at the line on the ring: on round it instead of off (if there is room, and, going somewhere, a way there from the next lane). */
  private goRound(v: Vehicle) {
    const on = this.segs[v.seg].next.find((j) => this.segs[this.segs[j].next[0]]?.street === RING);
    if (on === undefined || !this.room(on, v.length)) return;
    const lane = this.segs[on].next[0];
    const plan = [on, lane];
    if (v.halt) {
      const route = this.path(lane, 0, v.halt.seg, v.halt.s, true);
      if (!route) return;
      plan.push(...route.slice(1));
    }
    v.plan = plan;
    v.asked = on;
  }

  private reroute(v: Vehicle, route: number[]) {
    this.leaveQueue(v);
    v.plan = route.slice(1);
    // Keep the junction it was let into only if it still goes that way (or is already through).
    if (v.granted >= 0 && !this.segs[v.seg].link && v.plan[0] !== v.granted && this.segs[v.granted].next[0] !== v.seg) this.release(v);
  }

  private leaveQueue(v: Vehicle) {
    for (const N of this.nodes) {
      const i = N.queue.indexOf(v);
      if (i >= 0) N.queue.splice(i, 1);
    }
    v.asked = -1;
    v.ready = -1;
  }

  private release(v: Vehicle) {
    if (v.holds >= 0) {
      const H = this.nodes[v.holds].holders;
      const i = H.indexOf(v);
      if (i >= 0) H.splice(i, 1);
    }
    v.holds = -1;
    v.granted = -1;
  }

  private drive(v: Vehicle, dt: number) {
    v.since += dt;
    if (v.activity === "off") {
      if ((v.timer -= dt) <= 0) {
        if (!this.respawn(v)) v.timer = 2;
        else {
          v.why = "back on the island";
          if ((v.kind === "taxi" || v.kind === "truck") && v.halt) {
            // Towed with a fare aboard (or on a round): on to where it was going.
            const route = this.path(v.seg, v.s, v.halt.seg, v.halt.s, true, v.kind === "truck");
            if (route) this.reroute(v, route);
            else v.halt = { ...v.halt, seg: v.seg, s: Math.min(this.segs[v.seg].len - 1, v.s + 20) };
          }
        }
      }
      return;
    }
    if (v.activity === "stand") {
      v.v = 0;
      v.braking = true;
      this.atHalt(v);
      return;
    }
    this.extend(v);
    const S = this.segs[v.seg];
    const top = Math.min(S.limit, TOP[v.kind]);
    let v0 = top;
    // Slow for the bends ahead.
    let ahead = S.len - v.s;
    for (const j of v.plan.slice(0, 2)) {
      const lim = this.segs[j].limit;
      v0 = Math.min(v0, Math.sqrt(lim * lim + 2 * BRAKE * 0.6 * Math.max(0, ahead - v.length / 2)));
      ahead += this.segs[j].len;
    }
    // The vehicle ahead.
    let gap = Infinity;
    let lead = 0;
    let base = -v.s;
    for (let d = 0, seg = v.seg; d < 4 && base < LOOK; d++) {
      const T = this.segs[seg];
      const o = d === 0 ? T.on.find((o) => o !== v && o.s > v.s) : T.on[0];
      if (o) {
        gap = base + o.s - (v.length + o.length) / 2;
        lead = o.v;
        break;
      }
      base += T.len;
      if (d >= v.plan.length) break;
      // Out of a lane, anyone just turned onto any of its links is ahead too (they start together).
      if (!T.link) {
        for (const j of T.next) {
          const q = this.segs[j].on[0];
          if (q && j !== v.plan[d] && q.s < q.length) {
            const g = base + q.s - (v.length + q.length) / 2;
            if (g < gap) [gap, lead] = [g, q.v];
          }
        }
      }
      seg = v.plan[d];
    }
    // People in the way: anyone its body would pass over in the next few voxels of travel (the
    // body, not just its path: on a tight turn its corners sweep over the curb). Not those waiting
    // for it or getting on.
    const look = 4 + v.v * 1.2;
    const poses: { x: number; z: number; fx: number; fz: number; d: number }[] = [];
    for (let d = 0; d <= look; d += 2) {
      const [b, c, f] = this.ahead(v, d - v.length / 3, d + v.length / 3, v.length / 3);
      const m = Math.hypot(f.x - b.x, f.z - b.z) || 1;
      poses.push({ x: c.x, z: c.z, fx: (f.x - b.x) / m, fz: (f.z - b.z) / m, d });
    }
    // Kept waiting a while, it creeps on and people step aside: it minds only those right at its
    // bumper, on the road (on a tight turn it cuts over the corner of the sidewalk, and they make way).
    const nudge = v.still > PATIENCE;
    const { n, walk } = this.map;
    let people = false;
    const mid = poses[poses.length >> 1];
    for (const p of this.hooks.near(mid.x, mid.z, look / 2 + v.length / 2 + 3)) {
      if (p.activity === "ride" || p.activity === "away" || (p.activity === "use" ? p.use === "shelter" || p.use === "curb" : p.leg === "door")) continue;
      if (nudge && walk[Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0))] !== GROUND.road) continue;
      for (const q of nudge ? poses.slice(0, 1) : poses) {
        const dx = p.x - q.x;
        const dz = p.z - q.z;
        if (Math.abs(dx * q.fx + dz * q.fz) > v.length / 2 + MARGIN || Math.abs(-dx * q.fz + dz * q.fx) > v.width / 2 + MARGIN) continue;
        gap = Math.min(gap, Math.max(0, q.d - 1));
        lead = 0;
        people = true;
        break;
      }
    }
    // Intelligent Driver Model.
    let a = ACCEL * (1 - Math.pow(v.v / Math.max(1, v0), 4));
    let follow = 0;
    if (gap < Infinity) {
      const want = S0 + v.v * HEADWAY + (v.v * (v.v - lead)) / (2 * Math.sqrt(ACCEL * BRAKE));
      follow = ACCEL * Math.pow(Math.max(0, want) / Math.max(0.5, gap), 2);
      a -= follow;
    }
    let vmax = Infinity;
    let line = Infinity;
    // The stop line, unless let in.
    const next = v.plan[0];
    if (next !== undefined && this.segs[next].link && this.nodes[this.segs[next].a].kind === "junction" && v.granted !== next) {
      const toLine = S.len - v.s - v.length / 2 - 1;
      if (toLine < ASK && v.asked !== next) {
        this.leaveQueue(v);
        v.asked = next;
        this.nodes[this.segs[next].a].queue.push(v);
      }
      line = Math.sqrt(2 * STOP_BRAKE * Math.max(0, toLine));
      vmax = Math.min(vmax, line);
    }
    // A halt ahead (bus stop, fare).
    const h = this.toHalt(v);
    if (h < Infinity) vmax = Math.min(vmax, Math.sqrt(2 * STOP_BRAKE * Math.max(0, h)));
    const before = v.v;
    v.v = Math.max(0, Math.min(v.v + a * dt, vmax, v0 + 1, nudge && people ? CREEP : Infinity));
    if (gap < 0.5) v.v = 0;
    v.braking = v.v < before - 0.5 * dt || v.v < 0.5;
    // What holds it: edging past people; the stop line or the halt, braking to it; whoever is in
    // front, closing in; the bends ahead; or nothing.
    v.limit =
      nudge && people ? "creep"
      : vmax < v0 + 1 && v.v >= vmax - 0.01 ? (vmax === line ? "line" : "halt")
      : gap < 0.5 || follow > ACCEL * 0.25 ? (people ? "people" : "lead")
      : v0 < top - 0.5 ? "bend"
      : "free";
    if (h < 1) {
      v.v = 0;
      v.limit = "halt";
      into(v, "stand", STAND_WHY[v.halt!.kind]);
      this.arrive(v);
      this.pose(v);
      return;
    }
    // Along, onto the next segment at the end.
    v.s += v.v * dt;
    while (v.s > this.segs[v.seg].len) {
      const done = this.segs[v.seg];
      if (!v.plan.length) {
        if (!done.link && this.nodes[done.b].kind === "exit") {
          into(v, "off", "left the island");
          v.timer = this.rng.range(2, 10);
          this.release(v);
          this.leaveQueue(v);
          return;
        }
        v.s = done.len;
        v.v = 0;
        break;
      }
      v.s -= done.len;
      // Out of the lane past its junction (a short one, shorter than itself): let the junction go.
      if (v.holds >= 0 && this.segs[v.granted].next[0] === v.seg) this.release(v);
      v.seg = v.plan.shift()!;
      if (v.asked === v.seg) this.leaveQueue(v);
    }
    // Clear of the junction (its back out of the link): let it go.
    if (v.holds >= 0 && this.segs[v.granted].next[0] === v.seg && v.s > v.length / 2 + 1) this.release(v);
    // Stuck too long (in a knot): towed, riders and all.
    // (Only really under way does it count as moving again: edging past people, it is still kept waiting.)
    if (v.v < 0.3 || (nudge && people)) v.still += dt;
    else if (v.v > CREEP + 0.5) v.still = 0;
    if (v.still > TOW) {
      this.release(v);
      this.leaveQueue(v);
      if (v.fare && !v.riders.length) this.cancel(v.fare);
      into(v, "off", `towed: held up ${TOW} s`);
      v.timer = 1;
      return;
    }
    this.pose(v);
  }

  /** Points along the way ahead of a vehicle's center, from `from` to `to` every `every` voxels. */
  private ahead(v: Vehicle, from: number, to: number, every: number): P2[] {
    const out: P2[] = [];
    let seg = v.seg;
    let base = -v.s;
    let i = 0;
    for (let d = from; d <= to; d += every) {
      while (d - base > this.segs[seg].len && i < v.plan.length) {
        base += this.segs[seg].len;
        seg = v.plan[i++];
      }
      out.push(this.at(this.segs[seg], Math.max(0, Math.min(this.segs[seg].len, d - base))));
    }
    return out;
  }

  /** Distance from a vehicle's center to its halt ahead, if the halt is on its way. */
  private toHalt(v: Vehicle): number {
    const h = v.halt;
    if (!h) return Infinity;
    if (h.seg === v.seg && h.s >= v.s - 0.5) return h.s - v.s;
    let d = this.segs[v.seg].len - v.s;
    for (const j of v.plan.slice(0, 4)) {
      if (j === h.seg) return d + h.s;
      d += this.segs[j].len;
      if (d > LOOK * 2) break;
    }
    return Infinity;
  }

  /** Pulled up at its halt. */
  private arrive(v: Vehicle) {
    const h = v.halt!;
    if (h.kind === "stop") {
      const st = h.stop!;
      st.bus = v;
      // Riders get off.
      const off = v.riders.filter((p) => this.hooks.getOff(p, st) ?? this.rng.chance(ALIGHT));
      for (const p of off) {
        v.riders.splice(v.riders.indexOf(p), 1);
        const d = this.door(v);
        this.hooks.alight(p, d.x, d.z, Math.atan2(right(this.dirAt(this.segs[v.seg], v.s)).x, right(this.dirAt(this.segs[v.seg], v.s)).z));
      }
    } else if (h.kind === "pickup" && v.fare) v.fare.ready = true;
    else if (h.kind === "bin" || h.kind === "unload") this.hooks.serve(v);
    else if (h.kind === "depot") this.park(v);
    else if (h.kind === "drop") {
      const d = this.door(v);
      const f = right(this.dirAt(this.segs[v.seg], v.s));
      for (const p of v.riders.splice(0)) this.hooks.alight(p, d.x, d.z, Math.atan2(f.x, f.z));
    }
  }

  /** Standing at its halt: until everyone is on (or off), then away. */
  private atHalt(v: Vehicle) {
    const h = v.halt!;
    let go = false;
    let why = "";
    if (h.kind === "stop") {
      const st = h.stop!;
      go = (v.since >= DWELL[0] && (!st.queue.length || v.riders.length >= BUS_SEATS)) || v.since >= DWELL[1];
      if (go) {
        st.bus = null;
        this.toNextStop(v);
        why = v.riders.length >= BUS_SEATS ? "full" : st.queue.length ? "kept waiting long enough" : "no one else waiting";
      }
    } else if (h.kind === "pickup") {
      const f = v.fare;
      if (!f) {
        go = true;
        why = "the fare gave up";
      }
      else if (v.riders.length) {
        // Aboard: where they are going (the lane nearest it), or somewhere else in the city.
        const all = this.lanes(this.segs[v.seg].part);
        const lanes = all.filter((i) => this.segs[i].len > 30 && Math.hypot(this.at(this.segs[i], 0).x - v.x, this.at(this.segs[i], 0).z - v.z) > FARE_RIDE);
        const want = f.to;
        const mid = (i: number) => this.at(this.segs[i], this.segs[i].len / 2);
        const to = want ? all.reduce((a, b) => (Math.hypot(mid(a).x - want.x, mid(a).z - want.z) < Math.hypot(mid(b).x - want.x, mid(b).z - want.z) ? a : b)) : lanes.length ? this.rng.pick(lanes) : this.rng.pick(all);
        const s = this.segs[to].len / 2;
        const route = this.path(v.seg, v.s, to, s, true);
        this.fares.splice(this.fares.indexOf(f), 1);
        v.task = "carry";
        why = "the fare is aboard";
        if (route) {
          this.reroute(v, route);
          v.halt = { seg: to, s, kind: "drop" };
        } else v.halt = { seg: v.seg, s: Math.min(this.segs[v.seg].len - 1, v.s + 40), kind: "drop" };
        go = true;
      } else if (v.since > FARE_WAIT) {
        this.cancel(f);
        go = false;
      }
    } else if (h.kind === "bin" || h.kind === "unload") {
      // Loaded or unloaded: away, until the waste sends it on (life/waste.ts).
      go = v.since > (h.kind === "bin" ? LOAD_TIME : UNLOAD_TIME);
      if (go) {
        v.halt = null;
        why = h.kind === "bin" ? "emptied the bin" : "unloaded";
      }
    } else {
      go = v.since > 2;
      if (go) {
        v.halt = null;
        v.fare = null;
        v.task = "cruise";
        why = "dropped the fare off";
      }
    }
    if (go) into(v, "drive", why);
  }

  /* ---------- Garbage trucks ---------- */

  /** A garbage truck, on the main part of the graph (null if there is no room for one). */
  addTruck(): Vehicle | null {
    const v = this.vehicle("truck");
    if (!this.place(v, this.lanes(this.main))) return null;
    this.vehicles.push(v);
    return v;
  }

  /** The curb column nearest (x, z) on the main part, with its spot on the lane; null if none. */
  spotNear(x: number, z: number): { k: number; seg: number; s: number } | null {
    const { n } = this.map;
    let best = -1;
    let bd = Infinity;
    for (const k of this.curbs) {
      if (this.segs[this.curbSpot.get(k)!.seg].part !== this.main) continue;
      const d = Math.hypot((k % n) + 0.5 - x, ((k / n) | 0) + 0.5 - z);
      if (d < bd) [best, bd] = [k, d];
    }
    return best < 0 ? null : { k: best, ...this.curbSpot.get(best)! };
  }

  /** Sends a garbage truck to pull up at a spot, on a task; false if it cannot get there. Out of its depot, it comes out at `depot`. */
  send(v: Vehicle, spot: { seg: number; s: number }, kind: "bin" | "unload" | "depot", task: Task, why: string): boolean {
    if (v.activity === "off") {
      v.halt = { seg: spot.seg, s: spot.s, kind };
      v.task = task;
      v.timer = 0;
      v.why = why;
      return true;
    }
    const route = this.path(v.seg, v.s, spot.seg, spot.s, true, true);
    if (!route) return false;
    this.reroute(v, route);
    v.halt = { seg: spot.seg, s: spot.s, kind };
    v.task = task;
    if (v.activity === "stand") into(v, "drive", why);
    else v.why = why;
    return true;
  }

  /** Parks a garbage truck in its depot (off the road), until it is sent out again; false while it is in a junction. */
  park(v: Vehicle): boolean {
    if (v.activity === "off") return true;
    if (this.segs[v.seg].link) return false;
    this.leaveQueue(v);
    this.release(v);
    v.plan = [];
    v.halt = null;
    v.task = "depot";
    v.v = 0;
    v.timer = Infinity;
    into(v, "off", STAND_WHY.depot);
    return true;
  }

  /** Where people get on and off: beside the front door (a bus) or the back door. */
  door(v: Vehicle): P2 {
    const f = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    const r = right(f);
    const along = v.kind === "bus" ? v.length * 0.32 : -v.length * 0.1;
    return { x: v.x + f.x * along + r.x * (v.width / 2 + 1.4), z: v.z + f.z * along + r.z * (v.width / 2 + 1.4) };
  }

  /** How many fares no taxi is coming for yet, and how many taxis are free (cruising, empty). */
  get waiting() {
    return this.fares.filter((f) => !f.taxi).length;
  }
  get freeTaxis() {
    return this.vehicles.filter((v) => v.kind === "taxi" && v.task === "cruise").length;
  }

  /** How far (voxels of driving along its route) the nearest bus coming to `st` is; Infinity if none. */
  busDue(st: Stop): number {
    const r = this.routes[st.route];
    const n = r.segs.length;
    let best = Infinity;
    for (const v of this.vehicles) {
      if (v.kind !== "bus" || v.route !== st.route || v.activity === "off") continue;
      if (st.bus === v) return 0;
      // The bus is on route segment `leg` less the ones still planned ahead of it.
      const at = (((v.leg - v.plan.length) % n) + n) % n;
      if (r.segs[at] !== v.seg) continue;
      if (v.seg === st.seg && v.s <= st.s) {
        best = Math.min(best, st.s - v.s);
        continue;
      }
      let d = this.segs[v.seg].len - v.s;
      for (let i = 1; i <= n && d < best; i++) {
        const seg = r.segs[(at + i) % n];
        if (seg === st.seg) {
          d += st.s;
          break;
        }
        d += this.segs[seg].len;
      }
      best = Math.min(best, d);
    }
    return best;
  }

  /** Someone at the curb wants a taxi; null if no taxi could get there. */
  hail(p: Person, to: P2 | null = null): Fare | null {
    if (!this.vehicles.some((v) => v.kind === "taxi")) return null;
    const { n } = this.map;
    let best = -1;
    let bd = Infinity;
    for (const k of this.taxiCurbs) {
      const d = Math.hypot((k % n) + 0.5 - p.x, ((k / n) | 0) + 0.5 - p.z);
      if (d < bd) [best, bd] = [k, d];
    }
    if (best < 0 || bd > 8) return null;
    const spot = this.curbSpot.get(best)!;
    const f: Fare = { person: p, seg: spot.seg, s: spot.s, taxi: null, ready: false, to };
    this.fares.push(f);
    return f;
  }

  /** A fare called off (the person gave up, or the taxi could not wait). */
  cancel(f: Fare) {
    const i = this.fares.indexOf(f);
    if (i >= 0) this.fares.splice(i, 1);
    const v = f.taxi;
    if (v && v.fare === f) {
      v.fare = null;
      v.halt = null;
      v.task = "cruise";
      if (v.activity === "stand") into(v, "drive", "the fare never came");
    }
    f.taxi = null;
    f.ready = false;
    if (f.person.fare === f) f.person.fare = null;
  }

  /** Someone gets in. */
  board(v: Vehicle, p: Person) {
    v.riders.push(p);
  }

  /** True if the vehicle is standing at a halt with its doors open. */
  open(v: Vehicle) {
    return v.activity === "stand";
  }

  /** True if a moving vehicle will come within reach of (x, z) in the next few seconds, or one kept waiting is about to edge past. */
  danger(x: number, z: number): boolean {
    for (const v of this.vehicles) {
      if (v.activity === "off") continue;
      const dx = x - v.x;
      const dz = z - v.z;
      // One kept waiting and edging on: let it through first.
      if (v.still > PATIENCE && v.activity === "drive" && Math.hypot(dx, dz) < v.length / 2 + 8) return true;
      if (v.v < 1) continue;
      if (Math.abs(dx) > 60 || Math.abs(dz) > 60) continue;
      const ux = Math.sin(v.heading) * v.v;
      const uz = Math.cos(v.heading) * v.v;
      const t = Math.max(0, Math.min(3, (dx * ux + dz * uz) / (v.v * v.v)));
      if (Math.hypot(dx - ux * t, dz - uz * t) < v.width / 2 + v.length / 2 + 2) return true;
    }
    return false;
  }

  /** True if (x, z) is inside a vehicle (grown by `r`). */
  inside(x: number, z: number, r: number): boolean {
    for (const v of this.vehicles) {
      if (v.activity === "off") continue;
      const dx = x - v.x;
      const dz = z - v.z;
      if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      if (Math.abs(dx * fx + dz * fz) < v.length / 2 + r && Math.abs(-dx * fz + dz * fx) < v.width / 2 + r) return true;
    }
    return false;
  }

  /** Out of the way: the direction away from the side of a vehicle (x, z) is within `r` of, or null. */
  clearOf(x: number, z: number, r: number): P2 | null {
    for (const v of this.vehicles) {
      if (v.activity === "off") continue;
      const dx = x - v.x;
      const dz = z - v.z;
      if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      const along = dx * fx + dz * fz;
      const lat = -dx * fz + dz * fx;
      if (Math.abs(along) >= v.length / 2 + r || Math.abs(lat) >= v.width / 2 + r) continue;
      // Out the nearer way: to the side, or off the back; never ahead of it, along its way.
      if (along < 0 && v.length / 2 + along < v.width / 2 - Math.abs(lat)) return { x: -fx, z: -fz };
      const s = Math.sign(lat) || 1;
      return { x: -fz * s, z: fx * s };
    }
    return null;
  }

  /** A moving vehicle within `r` of (x, z) (for the pigeons). */
  passing(x: number, z: number, r: number): boolean {
    return this.vehicles.some((v) => v.activity !== "off" && v.v > 2 && Math.hypot(v.x - x, v.z - z) < r + v.length / 2);
  }

  /**
   * Where a vehicle means to go (life/ahead.ts): along its segment and the segments it has planned,
   * a point every `every` voxels, at most `reach` voxels, stopping at its halt (a stop, a fare, a
   * bin) if it has one.
   */
  pathAhead(v: Vehicle, reach: number, every: number): Path {
    if (v.activity === "off") return NO_PATH;
    const pts: number[] = [];
    const segs = [v.seg, ...v.plan];
    let gone = 0;
    let s = v.s;
    for (let i = 0; i < segs.length; i++) {
      const S = this.segs[segs[i]];
      // Its halt, on this segment (and ahead of it on the one it is on).
      const halt = v.halt && v.halt.seg === segs[i] && (i > 0 || v.halt.s >= v.s) ? v.halt.s : -1;
      const stop = halt >= 0 ? halt : S.len;
      while (s + every <= stop) {
        s += every;
        gone += every;
        if (gone > reach) return { pts, end: false };
        const at = this.at(S, s);
        pts.push(at.x, this.levelAt(S, s), at.z);
      }
      if (halt >= 0) {
        const at = this.at(S, halt);
        pts.push(at.x, this.levelAt(S, halt), at.z);
        return { pts, end: true };
      }
      // On to the next segment, carrying what is left of the step.
      s -= S.len;
    }
    return { pts, end: false };
  }

  /* ---------- Geometry ---------- */

  /** The point at distance `s` along a segment. */
  at(S: Seg, s: number): P2 {
    const i = this.index(S, s);
    const a = S.pts[i];
    const b = S.pts[Math.min(S.pts.length - 1, i + 1)];
    const span = S.cum[Math.min(S.pts.length - 1, i + 1)] - S.cum[i] || 1;
    const t = Math.max(0, Math.min(1, (s - S.cum[i]) / span));
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }

  private levelAt(S: Seg, s: number) {
    const i = this.index(S, s);
    const j = Math.min(S.pts.length - 1, i + 1);
    const span = S.cum[j] - S.cum[i] || 1;
    const t = Math.max(0, Math.min(1, (s - S.cum[i]) / span));
    return S.y[i] + (S.y[j] - S.y[i]) * t;
  }

  /** The unit direction of travel at distance `s`. */
  dirAt(S: Seg, s: number): P2 {
    const a = this.at(S, Math.max(0, s - 2));
    const b = this.at(S, Math.min(S.len, s + 2));
    const m = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / m, z: (b.z - a.z) / m };
  }

  private index(S: Seg, s: number) {
    let lo = 0;
    let hi = S.pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Its body between its axles: the rear and front axle on the lane, so on a bend neither end swings far off it. */
  private pose(v: Vehicle) {
    const S = this.segs[v.seg];
    const a = this.at(S, Math.max(0, v.s - v.length / 3));
    const b = this.at(S, Math.min(S.len, v.s + v.length / 3));
    v.x = (a.x + b.x) / 2;
    v.z = (a.z + b.z) / 2;
    const target = Math.atan2(b.x - a.x, b.z - a.z);
    v.heading = Number.isFinite(target) && (b.x !== a.x || b.z !== a.z) ? target : v.heading;
    const yb = this.levelAt(S, Math.max(0, v.s - v.length / 3));
    const yf = this.levelAt(S, Math.min(S.len, v.s + v.length / 3));
    v.y = this.levelAt(S, v.s);
    v.pitch = Math.atan2(yf - yb, (v.length * 2) / 3);
  }
}

/** What a vehicle rides on along a stepped street: over the top of each step (never into one), smoothed. */
function ride(ground: Float32Array): Float32Array {
  const top = Float32Array.from(ground, (_, i) => Math.max(...ground.subarray(Math.max(0, i - 3), i + 4)));
  return Float32Array.from(smoothProfile(top, 3, 2), (y, i) => Math.max(y, ground[i]));
}

/** The right of a direction of travel. */
function right(f: P2): P2 {
  return { x: -f.z, z: f.x };
}

function tangent(pts: P2[], i: number): P2 {
  const a = pts[Math.max(0, i - 2)];
  const b = pts[Math.min(pts.length - 1, i + 2)];
  const m = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / m, z: (b.z - a.z) / m };
}

/** A curve from p0 (heading t0) to p1 (heading t1), about one point per voxel. */
function hermite(p0: P2, t0: P2, p1: P2, t1: P2, k: number): P2[] {
  const c0 = { x: p0.x + t0.x * k, z: p0.z + t0.z * k };
  const c1 = { x: p1.x - t1.x * k, z: p1.z - t1.z * k };
  const steps = Math.max(2, Math.ceil(Math.hypot(p1.x - p0.x, p1.z - p0.z) + k));
  const out: P2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x,
      z: u * u * u * p0.z + 3 * u * u * t * c0.z + 3 * u * t * t * c1.z + t * t * t * p1.z,
    });
  }
  return out;
}

/** A polyline with `from` cut off its start and `to` off its end (by length). */
function cut(pts: P2[], from: number, to: number): P2[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const len = cum[cum.length - 1];
  if (len - from - to < 4) return [];
  const at = (s: number): P2 => {
    let i = 0;
    while (i < pts.length - 2 && cum[i + 1] < s) i++;
    const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1);
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t };
  };
  const out = [at(from)];
  for (let i = 0; i < pts.length; i++) if (cum[i] > from + 0.5 && cum[i] < len - to - 0.5) out.push(pts[i]);
  out.push(at(len - to));
  return out;
}

/** The closest two polylines come. */
function closest(a: P2[], b: P2[]) {
  let d = Infinity;
  for (let i = 0; i < a.length; i += 2) for (let j = 0; j < b.length; j += 2) d = Math.min(d, Math.hypot(a[i].x - b[j].x, a[i].z - b[j].z));
  return d;
}

/** Into an activity, saying why. */
const STAND_WHY: Record<Halt["kind"], string> = {
  stop: "at its stop",
  pickup: "at the fare's curb",
  drop: "dropping off",
  bin: "at a bin",
  unload: "unloading at the incinerator",
  depot: "parked at the depot",
};

function into(v: Vehicle, activity: VehicleActivity, why: string) {
  v.activity = activity;
  v.since = 0;
  v.why = why;
}
