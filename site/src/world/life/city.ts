import type { BuildingPlan } from "../city/placement";
import { DISTRICT, type District } from "../terrain/districts";
import { voxels } from "../scale";
import { nearestWalk, type WalkMap } from "./walk";

/**
 * What the city's buildings are for (pure: no three.js). Every building with a door on a street
 * gets a role from its district (docs/plans/city-simulation-plan.md §1.2): the megablocks and the
 * wealthy lots are homes, the core is offices, the commercial lots are shops and the industrial
 * lots are works. Its places (homes, or jobs) come from its storeys. The Landmark is offices and
 * the Corporate Megatower homes. A building counts who is inside it now: its occupancy.
 *
 * Getting to one building's door is two fields (see walk.ts): the doors are put in GROUPS of
 * neighbors, each with one field over the whole city (to the nearest of its doors), and each door
 * has a LocalField round it for the last steps, wide enough to reach every door of its group.
 */

export type Role = "home" | "office" | "shop" | "works";

export interface Building {
  /** Its plan (index into the plans). */
  plan: number;
  district: District;
  role: Role;
  /** The city's two signature buildings, or null for a grammar building. */
  signature: "landmark" | "megatower" | null;
  storeys: number;
  /** Homes or jobs in it. */
  places: number;
  /** The walking column in front of its door, and where that is (columns). */
  door: number;
  x: number;
  z: number;
  /** Its group of doors, and how far round its door (columns) its local field reaches. */
  group: number;
  reach: number;
  /** Who is inside now. */
  inside: number;
}

/** Places per storey, by role (a wealthy home and the works take two storeys a place). */
const PER_STOREY: Record<District, number> = {
  [DISTRICT.megablock]: 1,
  [DISTRICT.wealthy]: 0.5,
  [DISTRICT.core]: 1,
  [DISTRICT.commercial]: 1,
  [DISTRICT.industrial]: 0.5,
};
const ROLE: Record<District, Role> = {
  [DISTRICT.megablock]: "home",
  [DISTRICT.wealthy]: "home",
  [DISTRICT.core]: "office",
  [DISTRICT.commercial]: "shop",
  [DISTRICT.industrial]: "works",
};
/** About this many doors to a group, and the margin (columns) a local field reaches past its group's farthest door. */
const PER_GROUP = 6;
const MARGIN = 24;
const REACH = [32, 140];
/** A storey (meters), for buildings with no grammar (the Landmark and the Megatower). */
const STOREY_M = 3;

export class City {
  readonly buildings: Building[] = [];
  /** Each group's door columns. */
  readonly groups: number[][] = [];

  constructor(plans: BuildingPlan[], map: WalkMap) {
    plans.forEach((plan, i) => {
      const fx = Math.sin(plan.rotation);
      const fz = Math.cos(plan.rotation);
      // The Landmark stands in the plaza: its door is on the plaza in front of it.
      const out = voxels(plan.depth) / 2 + 2;
      const door = nearestWalk(map, plan.x + fx * out, plan.z + fz * out, plan.lot < 0 ? 10 : 6);
      if (door < 0) return;
      const storeys = plan.grammar ? plan.grammar.params.floors : Math.max(1, Math.round(plan.height / STOREY_M));
      const signature = plan.lot < 0 ? "landmark" : plan.archetype === "corporate-megatower" ? "megatower" : null;
      const role: Role = signature === "landmark" ? "office" : signature === "megatower" ? "home" : ROLE[plan.district];
      const per = signature === "megatower" ? 1 : PER_STOREY[plan.district];
      this.buildings.push({
        plan: i,
        district: plan.district,
        role,
        signature,
        storeys,
        places: Math.max(1, Math.round(storeys * per)),
        door,
        x: (door % map.n) + 0.5,
        z: ((door / map.n) | 0) + 0.5,
        group: 0,
        reach: REACH[0],
        inside: 0,
      });
    });
    this.group();
  }

  /** Buildings of the roles given (all of them, if none has those roles). */
  withRole(...roles: Role[]): Building[] {
    const some = this.buildings.filter((b) => roles.includes(b.role));
    return some.length ? some : this.buildings;
  }

  /**
   * Puts the doors in groups of neighbors (k-means, from far-apart starting points, so it is the
   * same for the same city), and sizes each door's local field to reach its whole group.
   */
  private group() {
    const bs = this.buildings;
    if (!bs.length) return;
    const k = Math.max(1, Math.min(bs.length, Math.round(bs.length / PER_GROUP)));
    const centers: { x: number; z: number }[] = [{ x: bs[0].x, z: bs[0].z }];
    while (centers.length < k) {
      let best = bs[0];
      let bd = -1;
      for (const b of bs) {
        const d = Math.min(...centers.map((c) => Math.hypot(c.x - b.x, c.z - b.z)));
        if (d > bd) [best, bd] = [b, d];
      }
      centers.push({ x: best.x, z: best.z });
    }
    for (let round = 0; round < 12; round++) {
      for (const b of bs) {
        let bd = Infinity;
        centers.forEach((c, i) => {
          const d = Math.hypot(c.x - b.x, c.z - b.z);
          if (d < bd) [b.group, bd] = [i, d];
        });
      }
      centers.forEach((c, i) => {
        const members = bs.filter((b) => b.group === i);
        if (!members.length) return;
        c.x = members.reduce((s, b) => s + b.x, 0) / members.length;
        c.z = members.reduce((s, b) => s + b.z, 0) / members.length;
      });
    }
    // Drop empty groups, renumbering the rest.
    const used = [...new Set(bs.map((b) => b.group))].sort((a, b) => a - b);
    for (const b of bs) b.group = used.indexOf(b.group);
    for (let g = 0; g < used.length; g++) this.groups.push(bs.filter((b) => b.group === g).map((b) => b.door));
    for (const b of bs) {
      const far = Math.max(...bs.filter((o) => o.group === b.group).map((o) => Math.max(Math.abs(o.x - b.x), Math.abs(o.z - b.z))));
      b.reach = Math.round(Math.min(REACH[1], Math.max(REACH[0], far + MARGIN)));
    }
  }
}
