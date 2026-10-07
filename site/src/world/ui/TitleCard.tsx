import { useEffect, useState } from "react";
import { glassCardClass } from "../../components/controls";
import { linkProps } from "../../router";
import type { WorldModel } from "../pipeline";
import { randomSeed } from "../rng";
import { STOREY, VOXEL_M, toMetres } from "../scale";
import { MAX_SEED_LENGTH } from "../state";

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function DiceIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg {...iconProps} className="h-3.5 w-3.5">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

/** Top-right card (where the weeks keep their seed card): the world's name, its seed, and a way home. */
export function TitleCard({ world, onSeed }: { world: WorldModel; onSeed: (seed: string) => void }) {
  const [draft, setDraft] = useState(world.seed);
  useEffect(() => setDraft(world.seed), [world.seed]);

  return (
    <div className={glassCardClass + " pointer-events-auto absolute right-4 top-4 w-[17rem] max-w-[calc(100%-5.5rem)] p-5"}>
      <a {...linkProps("/")} className="flex w-fit items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 transition-colors hover:text-cyan-300">
        <BackIcon />
        Blueprint City
      </a>
      <h1 className="mt-2 truncate font-display text-2xl font-bold text-slate-100" title={world.name}>
        {world.name}
      </h1>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSeed(draft);
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2 transition-colors focus-within:border-cyan-400/50 hover:border-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Seed</span>
          <input
            value={draft}
            maxLength={MAX_SEED_LENGTH}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft.trim() !== world.seed && onSeed(draft)}
            aria-label="World seed"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-cyan-300 outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => onSeed(randomSeed())}
          title="New random seed"
          aria-label="New random seed"
          className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/50 bg-slate-800/50 text-slate-300 transition-colors hover:bg-slate-700/60 hover:text-cyan-300"
        >
          <DiceIcon />
        </button>
      </form>

      <p className="mt-3 text-xs leading-snug text-slate-400">
        {world.growth.buildings.length} buildings · tallest {Math.max(...world.growth.buildings.map((b) => b.storeys + (b.extension?.storeys ?? 0)))} storeys ·{" "}
        {world.roads.roads.length} roads
      </p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        {toMetres(world.size)} m across · 1 voxel = {VOXEL_M} m · 1 storey = {STOREY} voxels
      </p>
    </div>
  );
}
