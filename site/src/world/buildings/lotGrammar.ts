import type { Tier } from "./config";
import { DEFAULT_GRAMMAR, SIGN_CAP, type Bay, type CrownType, type GrammarParams, type GrammarStyle, type RoofType, type WindowType } from "./grammar";
import type { Shape } from "./massing";
import { Rng, hash2 } from "../rng";
import { DISTRICT, type District } from "../terrain/districts";

/**
 * Each lot's grammar settings, shared by the grammar's Simulation (block.ts) and the city's lots
 * (city/placement.ts; docs/plans/grammar-city-plan.md §1.3). Pure.
 */

/** The ground floor every lot's building gets, and the city's storey, in meters. */
export const LOT_GROUND = DEFAULT_GRAMMAR.groundFloor;
export const STOREY = 3;

/** What a lot's draw reads: its body (meters), its floors and tier, and what seeds it. */
export interface LotDraw {
  /** The lot's id, and a salt the whole layout shares (Simulation's streets seed, the city's seed). */
  id: number;
  salt: number;
  frontage: number;
  depth: number;
  floors: number;
  tier: Tier;
  /**
   * On the city's lots (docs/plans/grammar-city-plan.md §1.5): the lot's district, whether it
   * fronts an avenue, and the side its cross street is on if it is a corner lot. Without a
   * district (Simulation) the draw is the size and tier alone.
   */
  district?: District;
  avenue?: boolean;
  corner?: "left" | "right";
}

const quarter = (v: number) => Math.round(v * 4) / 4;

/** A weighted pick: [value, weight] pairs. */
function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let t = rng.next() * total;
  for (const [v, w] of items) if ((t -= w) < 0) return v;
  return items[items.length - 1][0];
}

/**
 * The lot's own grammar settings, drawn from its seed and suited to its size and tier: courts on
 * wide lots, steps on tall ones, glass and helipads high up, gardens and shops low down.
 */
export function drawGrammar(lot: LotDraw): GrammarParams {
  const rng = new Rng(Math.floor(hash2(lot.id, 0x2c4f, lot.salt) * 2 ** 32));
  const { frontage, depth } = lot;
  const t = lot.tier;
  let shape: Shape = "bar";
  const roll = rng.next();
  if (lot.floors >= 10 && depth >= 14 && roll < 0.3) shape = "stepped";
  else if (frontage >= 20 && depth >= 16 && roll < 0.65) shape = frontage >= 24 && rng.chance(0.5) ? "u" : "l";
  const windowType = weighted<WindowType>(rng, t === "high" ? [["glass", 5], ["ribbon", 3], ["punched", 2]] : t === "mid" ? [["punched", 5], ["ribbon", 3.5], ["glass", 1.5]] : [["punched", 7], ["ribbon", 3]]);
  const bayWidth = rng.pick([1.75, 2, 2, 2.25, 2.5, 3]);
  const windowWidth = quarter(Math.min(bayWidth - 0.75, rng.range(1, 1.75)));
  const roof = weighted<RoofType>(rng, t === "high" ? [["gear", 4], ["helipad", 3.5], ["garden", 1], ["billboard", 1.5]] : t === "mid" ? [["gear", 4.5], ["garden", 2.5], ["billboard", 3]] : [["gear", 4], ["garden", 4.5], ["billboard", 1.5]]);
  const crown = weighted<CrownType>(rng, t === "high" ? [["none", 3], ["band", 3.5], ["cap", 3.5]] : t === "mid" ? [["none", 6], ["band", 3], ["cap", 1]] : [["none", 8.5], ["band", 1.5]]);
  return {
    ...DEFAULT_GRAMMAR,
    shape,
    frontage,
    depth,
    floors: lot.floors,
    groundFloor: LOT_GROUND,
    windowType,
    bayWidth,
    windowWidth: Math.max(0.5, windowWidth),
    windowHeight: quarter(rng.range(1.5, 2)),
    lit: rng.range(0.35, 0.75),
    balconies: t === "high" ? rng.range(0, 0.2) : rng.range(0.1, 0.5),
    roof,
    fill: rng.range(0.3, 0.8),
    padSize: 16,
    parapet: rng.pick([0.75, 0.75, 1]),
    crown,
  };
}

/** A district's weights: by the lot's tier where it matters. */
interface Character {
  windows: [WindowType, number][];
  roof: (t: Tier) => [RoofType, number][];
  crown: [CrownType, number][];
  balconies: [number, number];
  lit: [number, number];
  /** The sign share's range, on an avenue and on a side street, and its cap where the district has its own. */
  signs: { avenue: [number, number]; side: [number, number] };
  signCap?: number;
  /** The bays' slots (see GrammarStyle), where the district has its own. */
  upper?: [Bay, number][];
  ground?: [Bay, number][];
  groundFirst?: Bay;
}

/**
 * Each district's character (the plan's §1.5): what the draw weights, so the districts read
 * apart from the overview.
 * - Core: glass towers with few balconies, helipads and crowns, signs mostly on the avenues.
 * - Commercial: shops on every ground bay, signs on up to half the front, billboards and neon bands.
 * - Megablock: balconies and more lit windows, gear and gardens, no crown.
 * - Industrial: service bays up the walls, few shops, ribbon windows, few lights, full gear.
 * - Wealthy: wide bays, no signs, a ground floor of windows and doors, gardens and caps.
 */
const CHARACTER: Record<District, Character> = {
  [DISTRICT.core]: {
    windows: [["glass", 6], ["ribbon", 3], ["punched", 1]],
    roof: (t) => (t === "high" ? [["helipad", 4], ["gear", 4], ["billboard", 1], ["garden", 1]] : [["gear", 5], ["billboard", 2], ["garden", 2]]),
    crown: [["band", 4], ["cap", 4], ["none", 2]],
    balconies: [0, 0.1],
    lit: [0.45, 0.75],
    signs: { avenue: [0.1, SIGN_CAP], side: [0, 0.15] },
  },
  [DISTRICT.commercial]: {
    windows: [["punched", 5], ["ribbon", 5]],
    roof: () => [["billboard", 5], ["gear", 3], ["garden", 1]],
    crown: [["band", 5], ["none", 4], ["cap", 1]],
    balconies: [0.05, 0.25],
    lit: [0.5, 0.8],
    // Up to half the front: at 30%, the city's three- and four-bay fronts would get none.
    signs: { avenue: [0.3, 0.5], side: [0.3, 0.5] },
    signCap: 0.5,
    ground: [["S", 1]],
  },
  [DISTRICT.megablock]: {
    windows: [["punched", 1]],
    roof: () => [["gear", 5], ["garden", 4], ["billboard", 1]],
    crown: [["none", 1]],
    balconies: [0.3, 0.55],
    lit: [0.6, 0.85],
    signs: { avenue: [0, 0.15], side: [0, 0.15] },
  },
  [DISTRICT.industrial]: {
    windows: [["ribbon", 7], ["punched", 3]],
    roof: () => [["gear", 1]],
    crown: [["none", 9], ["band", 1]],
    balconies: [0, 0.1],
    lit: [0.2, 0.45],
    signs: { avenue: [0, 0.1], side: [0, 0.1] },
    upper: [["A", 4], ["V", 3], ["B", 2]],
    ground: [["V", 3], ["B", 2], ["C", 1], ["A", 1], ["S", 0.5]],
    groundFirst: "V",
  },
  [DISTRICT.wealthy]: {
    windows: [["punched", 6], ["glass", 4]],
    roof: () => [["garden", 1]],
    crown: [["cap", 4], ["none", 6]],
    balconies: [0.15, 0.35],
    lit: [0.4, 0.65],
    signs: { avenue: [0, 0], side: [0, 0] },
    upper: [["A", 8], ["B", 1]],
    ground: [["A", 4], ["C", 2], ["B", 1]],
    groundFirst: "A",
  },
};

/** An avenue's ground floor, whatever the district: shops and doors, a storey 5 to 6 m high. */
const AVENUE_GROUND: [Bay, number][] = [["S", 4], ["C", 1]];

/**
 * A city lot's settings and facade style: `drawGrammar`'s draw, then its district's weights
 * (CHARACTER) and its frontage. The district's draws come from a stream of their own, so the
 * size-and-tier draw underneath is the one Simulation makes.
 */
export function drawCityGrammar(lot: LotDraw & { district: District }): { params: GrammarParams; style: GrammarStyle } {
  const base = drawGrammar(lot);
  const c = CHARACTER[lot.district];
  const rng = new Rng(Math.floor(hash2(lot.id, 0x51c7, lot.salt) * 2 ** 32));
  const params: GrammarParams = {
    ...base,
    windowType: weighted(rng, c.windows),
    roof: weighted(rng, c.roof(lot.tier)),
    crown: weighted(rng, c.crown),
    balconies: rng.range(...c.balconies),
    lit: rng.range(...c.lit),
  };
  if (lot.district === DISTRICT.industrial) params.fill = rng.range(0.85, 1);
  if (lot.district === DISTRICT.wealthy) {
    // Wide bays, and Stepped more often than the size draw alone gives.
    params.bayWidth = rng.pick([2.5, 2.75, 3]);
    params.windowWidth = quarter(Math.min(params.bayWidth - 0.75, rng.range(1.25, 2)));
    if (lot.floors >= 6 && lot.depth >= 12 && params.shape === "bar" && rng.chance(0.6)) params.shape = "stepped";
  }
  const style: GrammarStyle = {
    upper: c.upper,
    ground: c.ground,
    groundFirst: c.groundFirst,
    signs: lot.avenue ? c.signs.avenue : c.signs.side,
    signCap: c.signCap,
    corner: lot.corner,
  };
  if (lot.district === DISTRICT.commercial || lot.avenue) params.groundFloor = quarter(rng.range(4.75, 5.5));
  if (lot.avenue && lot.district !== DISTRICT.commercial) {
    style.ground = AVENUE_GROUND;
    style.groundFirst = "S";
  }
  return { params, style };
}
