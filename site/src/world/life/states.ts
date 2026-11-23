import type { Cat, Person, Pigeon } from "./agents";
import type { Vehicle } from "./traffic";

/**
 * The Agents lens (debug view): everyone sorted into five broad states, each a color, so the whole
 * city reads at a glance by what it is up to. The detailed states (docs/techniques/agents.md) are
 * folded into these; the reason for each (`why`) is shown on hover.
 */
export const STATES = [
  { name: "Moving", color: 0x5ad8ff },
  { name: "Using or resting", color: 0x4ade80 },
  { name: "Waiting", color: 0xffd27a },
  { name: "On a task", color: 0xc084fc },
  { name: "Alarmed", color: 0xff5a5a },
] as const;

export const MOVING = 0;
export const USING = 1;
export const WAITING = 2;
export const TASK = 3;
export const ALARMED = 4;

export function personState(p: Person): number {
  if (p.activity === "use") return p.use === "shelter" || p.use === "curb" ? WAITING : USING;
  return p.motion === "wait-to-cross" ? WAITING : MOVING;
}

export function pigeonState(b: Pigeon): number {
  if (b.activity === "ground") return USING;
  // In the air: scared off (a person, a vehicle, a cat, or its flock) or just flying about.
  return /startl|scar|alarm|flush|fled|flee/i.test(b.why) ? ALARMED : MOVING;
}

export function catState(c: Cat): number {
  if (c.activity === "rest") return USING;
  if (c.activity === "hunt") return TASK;
  if (c.activity === "flee") return ALARMED;
  return MOVING;
}

export function vehicleState(v: Vehicle): number {
  // A vehicle with a job stays "on a task" however often traffic stops it: judged by its stops
  // (the stop line, a person crossing, its halt) it would flip with every brake.
  if (v.task === "collect" || v.task === "haul" || v.task === "fetch" || v.task === "carry") return TASK;
  return v.activity === "stand" || v.limit === "people" || v.limit === "line" || v.limit === "halt" ? WAITING : MOVING;
}
