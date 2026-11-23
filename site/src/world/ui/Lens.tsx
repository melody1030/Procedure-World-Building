import { useEffect, useMemo, useState } from "react";
import type { WorldView, GroundHover } from "../render/WorldView";
import type { Terrain } from "../terrain/pipeline";
import { CLAIM } from "../terrain/claims";
import { CELL } from "../terrain/hubs";
import { DISTRICTS, FRONTAGE_KINDS, NO_DISTRICT, frontageKind } from "../terrain/districts";
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

const CLAIM_NAMES = Object.fromEntries(Object.entries(CLAIM).map(([name, v]) => [v, name])) as Record<number, string>;
const TIER_NAMES = ["low", "mid", "high"] as const;

/** What the card is titled, by lens. */
const TITLES: Record<GroundTint, string> = {
  none: "Ground",
  districts: "District",
  frontage: "Frontage",
  heights: "Height limit",
  claims: "Claim",
  suitability: "Suitability",
  waste: "Ground",
  agents: "Ground",
};

type Reading = { title: string; rows: [string, string][] };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const meters = (voxels: number) => `${(voxels * VOXEL_M).toFixed(1)} m`;

/** What the lens reads at one column. */
export function readColumn(terrain: Terrain, zoning: Zoning, tint: GroundTint, x: number, z: number): Reading {
  const { districts, hubs } = terrain;
  // The ground as drawn: with each lot dug level, once the districts are done.
  const columns = terrain.grading?.ground ?? terrain.columns;
  const n = columns.n;
  const k = z * n + x;
  const claim = districts.claims.claim[k];
  const claimName = cap(CLAIM_NAMES[claim] ?? "free");
  const lot = districts.lotId[k] ? districts.lots[districts.lotId[k] - 1] : null;
  const cell = Math.floor(z / CELL) * districts.cells + Math.floor(x / CELL);
  const title = TITLES[tint];

  const ground = (): [string, string][] => {
    const h = (xx: number, zz: number) => columns.height[Math.min(n - 1, Math.max(0, zz)) * n + Math.min(n - 1, Math.max(0, xx))];
    const slope = Math.hypot(h(x + 1, z) - h(x - 1, z), h(x, z + 1) - h(x, z - 1)) / 2;
    return [
      ["Height", meters(columns.height[k])],
      ["Slope", `${slope.toFixed(2)} · ${Math.round((Math.atan(slope) * 180) / Math.PI)}°`],
    ];
  };

  switch (tint) {
    case "claims":
      return { title, rows: [["Owned by", claimName], ...ground()] };
    case "districts": {
      const d = districts.district[cell];
      const rows: [string, string][] = [["District", d === NO_DISTRICT ? `None (${claimName.toLowerCase()})` : DISTRICTS[d].name]];
      if (lot) rows.push(["Lot", `#${lot.id} · ${Math.round(lot.area)} m²`]);
      return { title, rows };
    }
    case "frontage":
      if (!lot) return { title, rows: [["Lot", "None"]] };
      return { title, rows: [["Kind", FRONTAGE_KINDS[frontageKind(lot)].name], ["Front", `${Math.round(lot.frontage)} m, facing ${lot.street === "avenue" ? "an avenue" : "a side street"}`]] };
    case "heights": {
      const limit = lot ? zoning.lots[districts.lotId[k] - 1].limit : claim === CLAIM.free ? zoning.limit[cell] : 0;
      if (!(limit > 0)) return { title, rows: [["Limit", "None"], ["Owned by", claimName]] };
      const tier = limit < HEIGHT_TIERS[0] ? 0 : limit <= HEIGHT_TIERS[1] ? 1 : 2;
      return { title, rows: [["Limit", `${Math.round(limit)} m`], ["Tier", TIER_NAMES[tier]]] };
    }
    case "suitability": {
      const score = hubs.suitability[cell];
      return { title, rows: [["Score", score.toFixed(2)], ["Center", hubs.buildable[cell] ? "can be built on" : "can't be built on"]] };
    }
    default:
      return { title, rows: [...ground(), ["Owned by", claimName]] };
  }
}

/** The card, following the mouse. `scale` is the interface's zoom, which positions are given in. */
export function HoverCard({ view, terrain, zoning, tint, scale, life }: { view: WorldView | null; terrain: Terrain; zoning: Zoning; tint: GroundTint; scale: number; life: Life | null }) {
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
  const reading = useMemo(() => (hit && !hit.agent && tint !== "waste" ? readColumn(terrain, zoning, tint, hit.x, hit.z) : null), [hit, terrain, zoning, tint]);
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
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#8ba1b8]">{said ? said.name : reading?.title}</div>
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
