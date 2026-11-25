import { useEffect, useMemo, useState } from "react";
import type { WorldView, GroundHover } from "../render/WorldView";
import type { Terrain } from "../terrain/pipeline";
import { CLAIM, CLAIM_COLORS } from "../terrain/claims";
import { NO_WATER } from "../terrain/voxelize";
import type { Street } from "../terrain/streets";
import type { BuildingPlan } from "../city/placement";
import { CELL } from "../terrain/hubs";
import { DISTRICTS, NO_DISTRICT } from "../terrain/districts";
import { HEIGHT_TIERS, type Zoning } from "../city/zoning";
import { VOXEL_M } from "../scale";
import type { GroundTint } from "../state";
import type { Life } from "../life/agents";
import { describe } from "./Inspector";
import { GLASS } from "./kit";

/**
 * The debug view's hover card: point at the ground and it reads what the active lens shows there,
 * from the data the stages already made (nothing is looked up from the picture). It follows the
 * mouse, and goes away over an agent, a building, or while a button is down.
 */

const TIER_NAMES = ["low", "mid", "high"] as const;
/** The dot for ground nothing has claimed. */
const UNUSED_COLOR = 0x8b95a5;

/** What a card is titled and the rows under it; `color` is the dot beside the title. */
type Reading = { title: string; color: number; rows: [string, string][] };

const meters = (voxels: number) => `${(voxels * VOXEL_M).toFixed(1)} m`;

/** The street whose center line passes nearest a column (road and verge columns belong to one). */
function streetAt(terrain: Terrain, x: number, z: number): Street | null {
  let best: Street | null = null;
  let near = Infinity;
  for (const street of terrain.streets.streets) {
    for (const q of street.curve) {
      const d = (q.x - x) ** 2 + (q.z - z) ** 2;
      if (d < near) [best, near] = [street, d];
    }
  }
  return best;
}

/** What stands in the park a column is in: its seats, vending machines and plants. */
function parkRows(terrain: Terrain, x: number, z: number): [string, string][] {
  const rect = terrain.districts.parkRects.find((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
  const parks = terrain.parks?.parks ?? [];
  const park = rect && parks.find((p) => p.x >= rect.x0 && p.x < rect.x1 && p.z >= rect.z0 && p.z < rect.z1);
  if (!rect || !park) return [];
  const count = (...kinds: string[]) => String(park.props.filter((p) => kinds.includes(p.kind)).length);
  const size: [string, string] = ["Size", `${Math.round((rect.x1 - rect.x0) * VOXEL_M)} × ${Math.round((rect.z1 - rect.z0) * VOXEL_M)} m`];
  const kind: [string, string] = ["Kind", park.garden ? "Flower garden" : "Park"];
  return park.garden
    ? [kind, size, ["Flower beds", count("flowerbed")], ["Benches", count("bench")]]
    : [kind, size, ["Benches", count("bench")], ["Vending machines", count("vending")], ["Trees", count("broadleaf", "conifer", "blossom")]];
}

/**
 * What is at one column: the title says what it is (a river, a street, a lot…), and the rows say
 * what the active lens knows about it, or with no lens of its own, what matters for that kind.
 */
export function readColumn(terrain: Terrain, zoning: Zoning, plans: BuildingPlan[], tint: GroundTint, x: number, z: number): Reading {
  const { districts, hubs } = terrain;
  // The ground as drawn: with each lot dug level, once the districts are done.
  const columns = terrain.grading?.ground ?? terrain.columns;
  const n = columns.n;
  const k = z * n + x;
  const claim = districts.claims.claim[k];
  const index = districts.lotId[k] - 1;
  const lot = index >= 0 ? districts.lots[index] : null;
  const cell = Math.floor(z / CELL) * districts.cells + Math.floor(x / CELL);
  const district = districts.district[cell];
  const height: [string, string] = ["Height", meters(columns.height[k])];

  let title = "Open ground";
  let color: number = UNUSED_COLOR;
  let rows: [string, string][] = [height];
  if (lot) {
    title = `Lot #${lot.id}`;
    color = DISTRICTS[lot.district].color;
    const built = plans.find((p) => p.lot === lot.id);
    const limit = zoning.lots[index].limit;
    rows = [
      ["District", DISTRICTS[lot.district].name],
      ["Area", `${Math.round(lot.area)} m²`],
      ["Height limit", limit > 0 ? `${Math.round(limit)} m` : "None"],
      ["Built", built ? `${Math.round(built.height)} m` : "Empty"],
    ];
  } else if (claim === CLAIM.river) {
    title = "River";
    color = CLAIM_COLORS.river;
    const water = columns.water[k];
    rows = water === NO_WATER ? [height] : [["Water level", meters(water)], ["Depth", meters(Math.max(0, water - columns.height[k]))]];
  } else if (claim === CLAIM.bank) {
    title = "River bank";
    color = CLAIM_COLORS.bank;
  } else if (claim === CLAIM.road || claim === CLAIM.verge) {
    const street = streetAt(terrain, x, z);
    const main = street?.kind === "main";
    title = claim === CLAIM.verge ? "Verge" : main ? "Main street" : "Side street";
    color = CLAIM_COLORS[claim === CLAIM.verge ? "verge" : "road"];
    if (street) rows = [claim === CLAIM.verge ? ["Beside", main ? "a main street" : "a side street"] : ["Width", meters(street.width)], height];
  } else if (claim === CLAIM.plaza) {
    title = "Plaza";
    color = CLAIM_COLORS.plaza;
    const plaza = terrain.streets.plazas[0];
    if (plaza) rows = [["Size", `${Math.round(plaza.half * 2 * VOXEL_M)} m square`], height];
  } else if (claim === CLAIM.park) {
    title = "Park";
    color = CLAIM_COLORS.park;
    const found = parkRows(terrain, x, z);
    if (found.length) rows = found;
  } else if (district !== NO_DISTRICT) {
    rows = [["District", DISTRICTS[district].name], height];
  }

  // A lens that knows something of its own replaces the rows.
  if (tint === "districts") {
    rows = [["District", district === NO_DISTRICT ? "None" : DISTRICTS[lot ? lot.district : district].name]];
    if (lot) rows.push(["Area", `${Math.round(lot.area)} m²`]);
  } else if (tint === "heights") {
    const limit = lot ? zoning.lots[index].limit : claim === CLAIM.free ? zoning.limit[cell] : 0;
    if (!(limit > 0)) rows = [["Height limit", "None"]];
    else {
      const tier = limit < HEIGHT_TIERS[0] ? 0 : limit <= HEIGHT_TIERS[1] ? 1 : 2;
      rows = [["Height limit", `${Math.round(limit)} m`], ["Tier", TIER_NAMES[tier]]];
      const built = lot && plans.find((p) => p.lot === lot.id);
      if (built) rows.push(["Built", `${Math.round(built.height)} m`]);
    }
  } else if (tint === "suitability") {
    rows = [["Score", hubs.suitability[cell].toFixed(2)], ["Center", hubs.buildable[cell] ? "can be built on" : "can't be built on"]];
  }
  return { title, color, rows };
}

/** The card, following the mouse. `scale` is the interface's zoom, which positions are given in. */
export function HoverCard({ view, terrain, zoning, plans, tint, scale, life }: { view: WorldView | null; terrain: Terrain; zoning: Zoning; plans: BuildingPlan[]; tint: GroundTint; scale: number; life: Life | null }) {
  const [hit, setHit] = useState<GroundHover | null>(null);
  useEffect(() => {
    view?.setHoverHandler(setHit);
    return () => {
      view?.setHoverHandler(null);
      setHit(null);
    };
  }, [view]);
  // An agent under the mouse: its state and the reason, refreshed a few times a second.
  const [, setTick] = useState(0);
  const agent = hit?.agent ?? null;
  useEffect(() => {
    if (!agent) return;
    const timer = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(timer);
  }, [agent]);
  const said = agent ? describe(agent, life) : null;
  // On the ground: not over a lot's building walls, and not while the waste lens colors buildings only.
  const reading = useMemo(() => (hit && !hit.agent && tint !== "waste" ? readColumn(terrain, zoning, plans, tint, hit.x, hit.z) : null), [hit, terrain, zoning, plans, tint]);
  if (!hit || (!reading && !said)) return null;
  const flipX = hit.px > window.innerWidth - 240;
  const flipY = hit.py > window.innerHeight - 140;
  return (
    <div
      role="status"
      className={"pointer-events-none fixed z-40 w-max max-w-[15rem] rounded-xl border px-3 py-2 " + GLASS}
      style={{
        zoom: scale,
        left: hit.px / scale + (flipX ? -16 : 16),
        top: hit.py / scale + (flipY ? -16 : 16),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      <div className="flex items-center gap-1.5 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#dce8f5]">
        {!said && reading && <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: `#${reading.color.toString(16).padStart(6, "0")}` }} />}
        {said ? said.name : reading?.title}
      </div>
      {said && (
        <div className="mt-1.5 grid gap-1 text-[12px]">
          <span className="text-[#ffd27a]">{said.badges.join(" · ")}</span>
          {said.why && <span className="leading-snug text-[#dce8f5]">{said.why}</span>}
        </div>
      )}
      <dl className="m-0 mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
        {(reading?.rows ?? []).map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-[#9db2c8]">{name}</dt>
            <dd className="m-0 text-right font-mono text-[11px] tabular-nums text-[#ffd27a]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * What says "you are in the debug view": a cyan frame round the whole view and a badge at the top
 * with a pulsing dot and the key to leave. Both fade in as the gray sweep reaches them, and out
 * again on the way back; neither takes clicks.
 */
export function DebugMarks({ on, scale }: { on: boolean; scale: number }) {
  return (
    <>
      <div
        aria-hidden
        className={"pointer-events-none fixed inset-0 z-30 transition-opacity duration-700 motion-reduce:transition-none " + (on ? "opacity-100 delay-500" : "opacity-0")}
        style={{ boxShadow: "inset 0 0 0 2px rgba(90,216,255,0.55), inset 0 0 90px rgba(90,216,255,0.2)" }}
      />
      <div
        role="status"
        aria-live="polite"
        className={"pointer-events-none fixed left-1/2 top-4 z-30 -translate-x-1/2 transition-[opacity,transform] duration-500 motion-reduce:transition-none " + (on ? "translate-y-0 opacity-100 delay-500" : "-translate-y-2 opacity-0")}
        style={{ zoom: scale }}
      >
        <div className={"flex items-center gap-2.5 rounded-full border px-4 py-1.5 " + GLASS}>
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#5ad8ff] motion-reduce:animate-none" />
            <span className="relative h-2 w-2 rounded-full bg-[#5ad8ff]" />
          </span>
          <span className="font-display text-[12px] font-bold uppercase tracking-[0.14em] text-[#5ad8ff]">{on ? "Debug view" : ""}</span>
          <span className="text-[11px] text-[#8ba1b8]">press</span>
          <kbd className="rounded bg-[#ffd27a]/10 px-1.5 font-mono text-[11px] text-[#ffd27a]">D</kbd>
          <span className="text-[11px] text-[#8ba1b8]">to leave</span>
        </div>
      </div>
    </>
  );
}
