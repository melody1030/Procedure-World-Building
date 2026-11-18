import type { BuildingPlan } from "../city/placement";
import { DISTRICT } from "../terrain/districts";
import { Rng } from "../rng";
import type { Building, City } from "./city";
import type { Traffic, Vehicle } from "./traffic";
import type { WalkMap } from "./walk";

/**
 * The city's waste (pure: no three.js; docs/plans/city-simulation-plan.md §1.3). There is no clock:
 * every rule is a rate per second or a wait of so many seconds, and the books are kept once a TICK.
 *
 * - **Bins.** One bin to each group of doors (about six neighbors share it; see city.ts), on the
 *   curb nearest the group, so there are few of them. It fills at a rate set by who is inside its
 *   buildings (PER_PERSON, shops SHOP times as fast) and a little for each building (PER_BUILDING).
 * - **Garbage trucks**, two or three (one to PER_TRUCK bins), each with its side of the city (the
 *   bins split in strips along the city's longer way). A truck's round (traffic.ts drives it):
 *   1. parked in the depot (off the road), by the incinerator, until a bin on its side is past HALF;
 *   2. to the fullest bin on its side, past half or spilled, that no other truck is on its way to;
 *      it empties it, and goes on to the next, until it is nearly full (CAPACITY bins) or no bin
 *      on its side is past half;
 *   3. to the incinerator, where it unloads; then out again, or back to the depot.
 * - **The incinerator** is the tallest industrial grammar building, or in a city with no industry
 *   the one farthest from the plaza (`incineratorPlan`; the renderer gives it a chimney). Its depot
 *   is the curb nearest its door. It burns what it is given.
 * - **A missed bin**, full for SPILL seconds, spills a pile on the sidewalk beside it; at most
 *   MOST_PILES at once in the whole city. A pile draws the nearest flock of pigeons (agents.ts),
 *   and the truck that empties the bin clears it.
 */

/** A bin's fill (a full bin is 1) per second: per person inside its buildings, and per building. */
const PER_PERSON = 1 / 14000;
const PER_BUILDING = 1 / 30000;
/** A shop's people make this much more. */
const SHOP = 1.5;
/** Past this a bin wants emptying. */
const HALF = 0.5;
/** Full this long (s), a bin spills; and the most piles there are at once. */
const SPILL = 90;
const MOST_PILES = 6;
/** A truck holds this many full bins. */
const CAPACITY = 4;
/** Bins to a truck, and the fewest and most trucks. */
const PER_TRUCK = 6;
const TRUCKS = [2, 3];
/** A truck free this near (voxels) its depot parks where it is. */
const AT_DEPOT = 40;
/** The books are kept once a second. */
const TICK = 1;

export interface Bin {
  /** The curb column it stands on, where that is, and the way it faces (to the road). */
  k: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  /** Where a truck pulls up for it. */
  spot: { seg: number; s: number };
  /** The buildings it serves, and the side of the city (the truck) it is on. */
  buildings: Building[];
  side: number;
  /** How full (0–1), how long it has been full (s), whether it has spilled, and the truck on its way. */
  fill: number;
  full: number;
  pile: boolean;
  truck: Vehicle | null;
}

interface Round {
  v: Vehicle;
  side: number;
  /** What it carries, in full bins, and the bin it is on its way to. */
  load: number;
  bin: Bin | null;
}

/**
 * The plan of the incinerator: the industrial grammar building with the most floors; in a city
 * with no industrial district, the grammar building farthest from the plaza (the Landmark). -1 if
 * there is no grammar building.
 */
export function incineratorPlan(plans: BuildingPlan[]): number {
  let best = -1;
  plans.forEach((p, i) => {
    if (p.district !== DISTRICT.industrial || !p.grammar) return;
    if (best < 0 || p.grammar.params.floors > plans[best].grammar!.params.floors) best = i;
  });
  if (best >= 0) return best;
  const center = plans.find((p) => p.archetype === "landmark-tower") ?? plans[0];
  let far = -1;
  plans.forEach((p, i) => {
    if (!p.grammar || !center) return;
    const d = Math.hypot(p.x - center.x, p.z - center.z);
    if (far < 0 || d > far) [best, far] = [i, d];
  });
  return best;
}

export class Waste {
  readonly bins: Bin[] = [];
  readonly rounds: Round[] = [];
  /** Each building's bin, by its plan (the Waste tint reads it). */
  readonly binOf = new Map<number, Bin>();
  /** The incinerator, and where its trucks pull up (null if the city has no curb for it). */
  readonly incinerator: Building | null;
  private readonly depot: { k: number; seg: number; s: number } | null;
  /** Full bins burned so far. */
  burned = 0;
  /** The piles changed since this was last cleared (agents.ts moves the pigeons). */
  changed = false;
  private wait = 0;

  constructor(
    city: City,
    plans: BuildingPlan[],
    private readonly traffic: Traffic,
    map: WalkMap,
    seed: number,
  ) {
    const rng = new Rng(seed ^ 0x6a57e);
    const { n } = map;
    // A bin to each group of doors, on the curb nearest the group (groups that share a curb share it).
    const byCurb = new Map<number, Bin>();
    city.groups.forEach((_, g) => {
      const members = city.buildings.filter((b) => b.group === g);
      if (!members.length) return;
      const cx = members.reduce((s, b) => s + b.x, 0) / members.length;
      const cz = members.reduce((s, b) => s + b.z, 0) / members.length;
      const spot = traffic.spotNear(cx, cz);
      if (!spot) return;
      const had = byCurb.get(spot.k);
      if (had) {
        had.buildings.push(...members);
        return;
      }
      const x = (spot.k % n) + 0.5;
      const z = ((spot.k / n) | 0) + 0.5;
      const lane = traffic.at(traffic.segs[spot.seg], spot.s);
      const bin: Bin = { k: spot.k, x, z, y: map.y[spot.k], heading: Math.atan2(lane.x - x, lane.z - z), spot: { seg: spot.seg, s: spot.s }, buildings: members, side: 0, fill: rng.range(0, 0.6), full: 0, pile: false, truck: null };
      byCurb.set(spot.k, bin);
      this.bins.push(bin);
    });
    for (const bin of this.bins) for (const b of bin.buildings) this.binOf.set(b.plan, bin);
    const plan = incineratorPlan(plans);
    this.incinerator = city.buildings.find((b) => b.plan === plan) ?? null;
    this.depot = this.incinerator ? traffic.spotNear(this.incinerator.x, this.incinerator.z) : null;
    if (!this.depot || !this.bins.length) return;
    traffic.depot = { seg: this.depot.seg, s: this.depot.s };
    // The trucks, and their sides: the bins in strips along the city's longer way.
    const count = Math.min(TRUCKS[1], Math.max(TRUCKS[0], Math.round(this.bins.length / PER_TRUCK)));
    const span = (f: (b: Bin) => number) => Math.max(...this.bins.map(f)) - Math.min(...this.bins.map(f));
    const along = span((b) => b.x) >= span((b) => b.z) ? (b: Bin) => b.x : (b: Bin) => b.z;
    [...this.bins].sort((a, b) => along(a) - along(b)).forEach((b, i, all) => (b.side = Math.floor((i * count) / all.length)));
    for (let side = 0; side < count; side++) {
      const v = traffic.addTruck();
      if (v) this.rounds.push({ v, side, load: 0, bin: null });
    }
    // (A side with no truck, if one found no room, goes to the others.)
    for (const b of this.bins) b.side = Math.min(b.side, this.rounds.length - 1);
  }

  /** The piles on the sidewalks now. */
  get piles(): Bin[] {
    return this.bins.filter((b) => b.pile);
  }

  /** A truck's round (null if it is not a garbage truck). */
  roundOf(v: Vehicle): Round | null {
    return this.rounds.find((r) => r.v === v) ?? null;
  }

  /** The most a truck holds, in full bins. */
  get capacity() {
    return CAPACITY;
  }

  step(dt: number) {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait += TICK;
    let piles = this.bins.reduce((c, b) => c + (b.pile ? 1 : 0), 0);
    for (const bin of this.bins) {
      let rate = 0;
      for (const b of bin.buildings) rate += PER_BUILDING + b.inside * PER_PERSON * (b.role === "shop" ? SHOP : 1);
      bin.fill = Math.min(1, bin.fill + rate * TICK);
      bin.full = bin.fill >= 1 ? bin.full + TICK : 0;
      if (bin.full >= SPILL && !bin.pile && piles < MOST_PILES) {
        bin.pile = true;
        piles++;
        this.changed = true;
      }
    }
    for (const r of this.rounds) this.order(r);
  }

  /** A truck pulls up at a bin (empties it, and clears its pile) or the incinerator (unloads). */
  serve(v: Vehicle) {
    const r = this.roundOf(v);
    if (!r) return;
    if (v.halt?.kind === "bin" && r.bin) {
      const bin = r.bin;
      r.load += bin.fill;
      bin.fill = 0;
      bin.full = 0;
      if (bin.pile) {
        bin.pile = false;
        this.changed = true;
      }
      bin.truck = null;
      r.bin = null;
    } else if (v.halt?.kind === "unload") {
      this.burned += r.load;
      r.load = 0;
    }
  }

  /** What a truck does next, when it is free or parked. */
  private order(r: Round) {
    const { v } = r;
    const depot = this.depot!;
    // On its way somewhere, or standing at a bin or the incinerator.
    if (v.halt) return;
    const parked = v.activity === "off" && v.task === "depot";
    let next: Bin | null = null;
    for (const b of this.bins) if (b.side === r.side && !b.truck && (b.fill >= HALF || b.pile) && (!next || b.fill > next.fill)) next = b;
    if (r.load >= CAPACITY - 0.5 || (!next && r.load > 0)) {
      if (!this.traffic.send(v, depot, "unload", "haul", r.load >= CAPACITY - 0.5 ? "full" : "no bin on its side past half")) this.park(r);
    } else if (next) this.collect(r, next);
    else if (!parked) {
      const at = this.traffic.at(this.traffic.segs[depot.seg], depot.s);
      if (Math.hypot(at.x - v.x, at.z - v.z) < AT_DEPOT || !this.traffic.send(v, depot, "depot", "depot", "nothing to collect")) this.park(r);
    }
  }

  private collect(r: Round, bin: Bin) {
    if (!this.traffic.send(r.v, bin.spot, "bin", "collect", bin.pile ? "a bin spilled" : `a bin ${Math.round(bin.fill * 100)}% full`)) return;
    bin.truck = r.v;
    r.bin = bin;
  }

  /** Parks a truck in its depot (it is near it, or cannot get there). */
  private park(r: Round) {
    this.traffic.park(r.v);
  }
}
