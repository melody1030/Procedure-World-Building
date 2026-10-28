import { smoothProfile, type P2 } from "../path";
import type { Street } from "../terrain/streets";
import { Rng } from "../rng";
import { voxels } from "../scale";
import { GROUND, nearestWalk, type WalkMap } from "./walk";
import type { Person } from "./agents";

/**
 * Traffic (pure: no three.js; the renderer reads the arrays). Cars, vans, taxis and buses drive the
 * streets, keeping to the right.
 *
 * - The road graph: every street is two lanes, one each way, offset to the right of its center
 *   line and trimmed back from the junctions. At a junction each lane coming in is joined to every
 *   lane going out (not back the way it came) by a link, a smooth curve from one to the other. A
 *   street that ends short of the diorama's edge (at the plaza, which is for people only) turns
 *   round; one that runs off the edge is where traffic leaves the island and comes back on.
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
 *   cruise until someone at the curb hails one; the nearest free taxi comes, takes them aboard and
 *   drops them somewhere else in the city.
 */

export type VehicleKind = "car" | "van" | "taxi" | "bus";

/** Sizes (voxels): small city cars (kei cars), vans, and community buses that fit the 3.5 m streets. */
export const SIZE: Record<VehicleKind, { length: number; width: number }> = {
  car: { length: voxels(3.4), width: voxels(1.4) },
  taxi: { length: voxels(3.4), width: voxels(1.4) },
  van: { length: voxels(4.2), width: voxels(1.6) },
  bus: { length: voxels(6), width: voxels(1.65) },
};
/** Speed limits (voxels per second: 4 is 1 m/s): avenues, side streets; and the most a kind goes. */
const MAIN = 22;
const SIDE = 16;
const TOP: Record<VehicleKind, number> = { car: 24, taxi: 24, van: 20, bus: 17 };
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
/** Dead ends shorter than this (voxels) are kept out of. */
const STUB = 40;
/** Bus: riders, the least and most time at a stop (s), the chance a rider gets off at each stop. */
export const BUS_SEATS = 18;
const DWELL = [3, 18];
const ALIGHT = 0.35;
/** A taxi waits this long (s) for its fare to get in, and drives at least this far (voxels) with one. */
const FARE_WAIT = 20;
const FARE_RIDE = 160;
/** Bus stops: how many shelters, and the shortest lane (voxels) one goes on. */
const SHELTERS = 6;
const SHELTER_LANE = 70;

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
}

interface Halt {
  seg: number;
  s: number;
  kind: "stop" | "pickup" | "drop";
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
  gone: boolean;
  timer: number;
  /** The link granted at the next junction, and the junction it holds; the link it asked for, and when it got to the line. */
  granted: number;
  holds: number;
  asked: number;
  ready: number;
  still: number;
  halt: Halt | null;
  /** Standing at a halt, for this long. */
  dwell: number;
  dwelling: boolean;
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

export interface TrafficHooks {
  /** People near (x, z), for braking. */
  near(x: number, z: number, r: number): Person[];
  /** A rider gets off at (x, z), facing `heading`. */
  alight(p: Person, x: number, z: number, heading: number): void;
}

export class Traffic {
  readonly segs: Seg[] = [];
  readonly nodes: RoadNode[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly stops: Stop[] = [];
  readonly routes: Route[] = [];
  /** Curb columns where people hail taxis, and the lane spot each one is beside. */
  readonly curbs: number[] = [];
  private readonly curbSpot = new Map<number, { seg: number; s: number }>();
  private readonly fares: Fare[] = [];
  private readonly rng: Rng;
  private time = 0;

  constructor(
    private readonly map: WalkMap,
    streets: Street[],
    seed: number,
    count: TrafficCounts,
    private readonly hooks: TrafficHooks,
  ) {
    this.rng = new Rng(seed ^ 0x7aff1c);
    this.buildGraph(streets);
    this.buildCurbs();
    this.buildRoutes();
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
      if (!this.place(v, this.lanes())) v.gone = true;
      this.vehicles.push(v);
    }
    // Buses: spread out round their routes.
    this.routes.forEach((r, i) => {
      for (let b = 0; b < count.buses; b++) {
        const v = this.vehicle("bus");
        v.color = r.color;
        v.route = i;
        const at = Math.floor((b / count.buses) * r.segs.length);
        if (!this.placeOnRoute(v, at)) v.gone = true;
        this.vehicles.push(v);
      }
    });
  }

  /* ---------- The road graph ---------- */

  private buildGraph(streets: Street[]) {
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
    // Lanes: offset right of the curve, trimmed back from the nodes.
    const trim = (N: RoadNode, width: number) => (N.kind === "junction" ? width / 2 + TRIM_JUNCTION : N.kind === "exit" ? 0 : TRIM_BEND);
    streets.forEach((st, i) => {
      if (st.curve.length < 2) return;
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
        const pts = cut(shifted, trim(this.nodes[a], st.width), trim(this.nodes[b], st.width));
        if (pts.length < 2) continue;
        this.addSeg(pts, null, a, b, false, i, dir, st.kind === "main" ? MAIN : SIDE);
      }
    });
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
        const round = out.street === into.street;
        if (round !== (N.kind === "end")) continue;
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

  private addSeg(pts: P2[], level: ((t: number) => number) | null, a: number, b: number, link: boolean, street: number, dir: number, limit: number) {
    const { n, y } = this.map;
    const cum = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const len = cum[pts.length - 1];
    const ground = Float32Array.from(pts, (p, i) => (level ? level(len ? cum[i] / len : 0) : y[Math.min(n - 1, Math.max(0, p.z | 0)) * n + Math.min(n - 1, Math.max(0, p.x | 0))]));
    this.segs.push({ pts, y: level ? ground : ride(ground), cum, len, a, b, link, street, dir, next: [], limit, conflicts: new Set(), on: [], part: -1 });
    return this.segs.length - 1;
  }

  /** Lanes (not links), optionally of one part; not the stubs. */
  private lanes(part = -1) {
    const out: number[] = [];
    this.segs.forEach((s, i) => !s.link && !this.stub(s) && (part < 0 || s.part === part) && out.push(i));
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
      if (s.link || s.len < 30) return;
      for (let d = 12; d < s.len - 12; d += 6) {
        const p = this.at(s, d);
        const r = right(this.dirAt(s, d));
        const k = nearestWalk(this.map, p.x + r.x * 7, p.z + r.z * 7, 2);
        if (k < 0 || this.curbSpot.has(k)) continue;
        // Only the sidewalk beside the road (not across a lot).
        if (Math.hypot((k % n) + 0.5 - p.x, ((k / n) | 0) + 0.5 - p.z) > 9) continue;
        this.curbSpot.set(k, { seg: i, s: d });
        this.curbs.push(k);
      }
    });
  }

  /** Bus routes: shelters on long lanes far apart; one route round them each way. */
  private buildRoutes() {
    // The largest part of the graph.
    const sizes = new Map<number, number>();
    for (const s of this.segs) if (!s.link) sizes.set(s.part, (sizes.get(s.part) ?? 0) + s.len);
    let part = -1;
    let most = 0;
    for (const [p, l] of sizes) if (l > most) [part, most] = [p, l];
    // Streets with a lane each way, long enough, not leaving the island: farthest apart first.
    const streets = new Map<number, number[]>();
    this.segs.forEach((s, i) => {
      if (s.link || s.part !== part || s.len < SHELTER_LANE || this.nodes[s.a].kind === "exit" || this.nodes[s.b].kind === "exit") return;
      streets.set(s.street, [...(streets.get(s.street) ?? []), i]);
    });
    const pairs = [...streets.values()].filter((l) => l.length === 2);
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
        const path = this.path(from, this.segs[from].len / 2, to, this.segs[to].len / 2, true);
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
        const at = s.len / 2;
        const p = this.at(s, at);
        const r = right(this.dirAt(s, at));
        const k = nearestWalk(this.map, p.x + r.x * 7, p.z + r.z * 7, 3);
        if (k < 0) continue;
        const { n, y } = this.map;
        const stop: Stop = { k, x: (k % n) + 0.5, z: ((k / n) | 0) + 0.5, y: y[k], heading: Math.atan2(-r.x, -r.z), seg: l, s: at, route: index, queue: [], bus: null };
        this.stops.push(stop);
        route.stops.push(stop);
      }
      this.routes.push(route);
    }
  }

  /**
   * The shortest way (by length) from distance `fromS` on segment `from` to `toS` on `to`, as the
   * segments in order (both ends included); null if there is none. With `stay`, never off the island.
   */
  path(from: number, fromS: number, to: number, toS: number, stay = false): number[] | null {
    if (from === to && toS > fromS + 4) return [from];
    const count = this.segs.length;
    const dist = new Float64Array(count).fill(Infinity);
    const prev = new Int32Array(count).fill(-1);
    const done = new Uint8Array(count);
    for (const j of this.segs[from].next) {
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
        const d = dist[best] + s.len;
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
    const color = kind === "taxi" ? TAXI : kind === "van" ? this.rng.pick(VAN_COLORS) : this.rng.pick(CAR_COLORS);
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
      gone: false,
      timer: 0,
      granted: -1,
      holds: -1,
      asked: -1,
      ready: -1,
      still: 0,
      halt: null,
      dwell: 0,
      dwelling: false,
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
    return !this.vehicles.some((o) => !o.gone && Math.hypot(o.x - p.x, o.z - p.z) < (o.length + length) / 2 + gap);
  }

  /** Puts a vehicle somewhere free on one of `lanes`; false if there was nowhere. */
  private place(v: Vehicle, lanes: number[], at = -1): boolean {
    for (let t = 0; t < 30 && lanes.length; t++) {
      const seg = lanes[Math.floor(this.rng.next() * lanes.length)];
      const S = this.segs[seg];
      if (S.len < v.length + 4) continue;
      const s = at >= 0 ? at : this.rng.range(v.length / 2 + 1, S.len - v.length / 2 - 1);
      if (!this.clear(seg, s, v.length, 8)) continue;
      Object.assign(v, { seg, s, v: 0, plan: [], gone: false, granted: -1, holds: -1, asked: -1, still: 0, dwell: 0, dwelling: false });
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
      Object.assign(v, { seg, s, v: 0, plan: [], leg: i, gone: false, granted: -1, holds: -1, asked: -1, still: 0, dwell: 0, dwelling: false });
      // The next stop along.
      for (let d = 1; d <= r.segs.length; d++) {
        const j = r.stops.findIndex((st) => st.seg === r.segs[(i + d) % r.segs.length]);
        if (j >= 0) {
          v.next = j;
          break;
        }
      }
      v.halt = { seg: r.stops[v.next].seg, s: r.stops[v.next].s, kind: "stop", stop: r.stops[v.next] };
      this.pose(v);
      return true;
    }
    return false;
  }

  /** Back on: in from the island's edge if it can, else anywhere free. */
  private respawn(v: Vehicle) {
    if (v.kind === "bus") return this.placeOnRoute(v, Math.floor(this.rng.next() * this.routes[v.route].segs.length));
    const entries = this.lanes().filter((i) => this.nodes[this.segs[i].a].kind === "exit");
    if (v.kind !== "taxi" && entries.length && this.place(v, entries, v.length / 2 + 1)) return true;
    return this.place(v, this.lanes());
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
      const weights = last.next.map((j): number => {
        const lane = this.segs[j].link ? this.segs[this.segs[j].next[0]] : this.segs[j];
        const to = this.nodes[lane.b].kind;
        return to === "exit" ? (v.kind === "taxi" ? 0 : 0.3) : to === "end" ? (this.stub(lane) ? 0.001 : 0.25) : 1;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.rng.next() * total;
      let pick = last.next[0];
      for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) [pick, r] = [last.next[i], Infinity];
      v.plan.push(pick);
    }
  }

  step(dt: number) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    for (const s of this.segs) s.on.length = 0;
    for (const v of this.vehicles) if (!v.gone) this.segs[v.seg].on.push(v);
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
      const ready = N.queue.filter((v) => v.ready >= 0).sort((a, b) => a.ready - b.ready);
      // Links in use (following someone onto the same link is fine), and links wanted by those before.
      const taken = new Set(N.holders.map((h) => h.granted));
      const wanted = new Set<number>();
      for (const v of ready) {
        const link = v.asked;
        const conflicts = this.segs[link].conflicts;
        // Not into the junction unless there is room beyond it (so no one stops in it and blocks it).
        if (!this.room(link, v.length)) continue;
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

  /** Free taxis to the fares waiting longest. */
  private dispatch() {
    for (const f of this.fares) {
      if (f.taxi) continue;
      let best: Vehicle | null = null;
      let route: number[] | null = null;
      let bd = Infinity;
      for (const v of this.vehicles) {
        if (v.kind !== "taxi" || v.gone || v.fare || v.dwelling || this.segs[v.seg].part !== this.segs[f.seg].part) continue;
        const d = Math.hypot(v.x - f.person.x, v.z - f.person.z);
        if (d >= bd) continue;
        const p = this.path(v.seg, v.s, f.seg, f.s, true);
        if (!p) continue;
        [best, route, bd] = [v, p, d];
      }
      if (!best || !route) continue;
      f.taxi = best;
      best.fare = f;
      this.reroute(best, route);
      best.halt = { seg: f.seg, s: f.s, kind: "pickup" };
    }
  }

  /** Follows `route` (from its current segment) from here on. */
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
    if (v.gone) {
      if ((v.timer -= dt) <= 0) {
        if (!this.respawn(v)) v.timer = 2;
        else if (v.kind === "taxi" && v.halt) {
          // Towed with a fare aboard: on to where it was going.
          const route = this.path(v.seg, v.s, v.halt.seg, v.halt.s, true);
          if (route) this.reroute(v, route);
          else v.halt = { ...v.halt, seg: v.seg, s: Math.min(this.segs[v.seg].len - 1, v.s + 20) };
        }
      }
      return;
    }
    if (v.dwelling) {
      v.v = 0;
      v.braking = true;
      v.dwell += dt;
      this.atHalt(v);
      return;
    }
    this.extend(v);
    const S = this.segs[v.seg];
    let v0 = Math.min(S.limit, TOP[v.kind]);
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
      if (p.state === "ride" || p.state === "gone" || p.state === "board" || p.state === "wait" || p.state === "hail") continue;
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
    if (gap < Infinity) {
      const want = S0 + v.v * HEADWAY + (v.v * (v.v - lead)) / (2 * Math.sqrt(ACCEL * BRAKE));
      a -= ACCEL * Math.pow(Math.max(0, want) / Math.max(0.5, gap), 2);
    }
    let vmax = Infinity;
    // The stop line, unless let in.
    const next = v.plan[0];
    if (next !== undefined && this.segs[next].link && this.nodes[this.segs[next].a].kind === "junction" && v.granted !== next) {
      const toLine = S.len - v.s - v.length / 2 - 1;
      if (toLine < ASK && v.asked !== next) {
        this.leaveQueue(v);
        v.asked = next;
        this.nodes[this.segs[next].a].queue.push(v);
      }
      vmax = Math.min(vmax, Math.sqrt(2 * STOP_BRAKE * Math.max(0, toLine)));
    }
    // A halt ahead (bus stop, fare).
    const h = this.toHalt(v);
    if (h < Infinity) vmax = Math.min(vmax, Math.sqrt(2 * STOP_BRAKE * Math.max(0, h)));
    const before = v.v;
    v.v = Math.max(0, Math.min(v.v + a * dt, vmax, v0 + 1, nudge ? CREEP : Infinity));
    if (gap < 0.5) v.v = 0;
    v.braking = v.v < before - 0.5 * dt || v.v < 0.5;
    if (h < 1) {
      v.v = 0;
      v.dwelling = true;
      v.dwell = 0;
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
          v.gone = true;
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
    v.still = v.v < 0.3 || (nudge && people) ? v.still + dt : 0;
    if (v.still > TOW) {
      this.release(v);
      this.leaveQueue(v);
      if (v.fare && !v.riders.length) this.cancel(v.fare);
      v.gone = true;
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
      const off = v.riders.filter(() => this.rng.chance(ALIGHT));
      for (const p of off) {
        v.riders.splice(v.riders.indexOf(p), 1);
        const d = this.door(v);
        this.hooks.alight(p, d.x, d.z, Math.atan2(right(this.dirAt(this.segs[v.seg], v.s)).x, right(this.dirAt(this.segs[v.seg], v.s)).z));
      }
    } else if (h.kind === "pickup" && v.fare) v.fare.ready = true;
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
    if (h.kind === "stop") {
      const st = h.stop!;
      go = (v.dwell >= DWELL[0] && (!st.queue.length || v.riders.length >= BUS_SEATS)) || v.dwell >= DWELL[1];
      if (go) {
        st.bus = null;
        const r = this.routes[v.route];
        v.next = (v.next + 1) % r.stops.length;
        const nx = r.stops[v.next];
        v.halt = { seg: nx.seg, s: nx.s, kind: "stop", stop: nx };
      }
    } else if (h.kind === "pickup") {
      const f = v.fare;
      if (!f) go = true;
      else if (v.riders.length) {
        // Aboard: somewhere else in the city.
        const lanes = this.lanes(this.segs[v.seg].part).filter((i) => this.segs[i].len > 30 && Math.hypot(this.at(this.segs[i], 0).x - v.x, this.at(this.segs[i], 0).z - v.z) > FARE_RIDE);
        const to = lanes.length ? this.rng.pick(lanes) : this.rng.pick(this.lanes(this.segs[v.seg].part));
        const s = this.segs[to].len / 2;
        const route = this.path(v.seg, v.s, to, s, true);
        this.fares.splice(this.fares.indexOf(f), 1);
        if (route) {
          this.reroute(v, route);
          v.halt = { seg: to, s, kind: "drop" };
        } else v.halt = { seg: v.seg, s: Math.min(this.segs[v.seg].len - 1, v.s + 40), kind: "drop" };
        go = true;
      } else if (v.dwell > FARE_WAIT) {
        this.cancel(f);
        go = true;
      }
    } else {
      go = v.dwell > 2;
      if (go) {
        v.halt = null;
        v.fare = null;
      }
    }
    if (go) {
      v.dwelling = false;
      v.dwell = 0;
    }
  }

  /** Where people get on and off: beside the front door (a bus) or the back door. */
  door(v: Vehicle): P2 {
    const f = { x: Math.sin(v.heading), z: Math.cos(v.heading) };
    const r = right(f);
    const along = v.kind === "bus" ? v.length * 0.32 : -v.length * 0.1;
    return { x: v.x + f.x * along + r.x * (v.width / 2 + 1.4), z: v.z + f.z * along + r.z * (v.width / 2 + 1.4) };
  }

  /** Someone at the curb wants a taxi; null if no taxi could get there. */
  hail(p: Person): Fare | null {
    if (!this.vehicles.some((v) => v.kind === "taxi")) return null;
    const { n } = this.map;
    let best = -1;
    let bd = Infinity;
    for (const k of this.curbs) {
      const d = Math.hypot((k % n) + 0.5 - p.x, ((k / n) | 0) + 0.5 - p.z);
      if (d < bd) [best, bd] = [k, d];
    }
    if (best < 0 || bd > 8) return null;
    const spot = this.curbSpot.get(best)!;
    const f: Fare = { person: p, seg: spot.seg, s: spot.s, taxi: null, ready: false };
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
      v.dwelling = false;
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
    return !v.gone && v.dwelling;
  }

  /** True if a moving vehicle will come within reach of (x, z) in the next few seconds. */
  danger(x: number, z: number): boolean {
    for (const v of this.vehicles) {
      if (v.gone || v.v < 1) continue;
      const dx = x - v.x;
      const dz = z - v.z;
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
      if (v.gone) continue;
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
      if (v.gone) continue;
      const dx = x - v.x;
      const dz = z - v.z;
      if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      const along = dx * fx + dz * fz;
      const lat = -dx * fz + dz * fx;
      if (Math.abs(along) >= v.length / 2 + r || Math.abs(lat) >= v.width / 2 + r) continue;
      // Out the nearer way: to the side, or off the front or back.
      if (v.length / 2 - Math.abs(along) < v.width / 2 - Math.abs(lat)) return { x: fx * Math.sign(along), z: fz * Math.sign(along) };
      const s = Math.sign(lat) || 1;
      return { x: -fz * s, z: fx * s };
    }
    return null;
  }

  /** A moving vehicle within `r` of (x, z) (for the pigeons). */
  passing(x: number, z: number, r: number): boolean {
    return this.vehicles.some((v) => !v.gone && v.v > 2 && Math.hypot(v.x - x, v.z - z) < r + v.length / 2);
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
