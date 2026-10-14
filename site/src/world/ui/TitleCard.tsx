import { useEffect, useRef, useState } from "react";
import { glassCardClass } from "../../components/controls";
import { linkProps } from "../../router";
import { randomSeed } from "../rng";
import { VOXEL_M, WORLD_SIZE, toMeters } from "../scale";
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

function ChevronRight() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

/** The closed card's button: a seed (a sprout), for the card that holds the seed. */
function SeedIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <path d="M12 20v-8" />
      <path d="M12 12c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6z" />
      <path d="M12 14c0-2.8-2-4.8-5.2-4.8 0 2.8 2 4.8 5.2 4.8z" />
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

/**
 * Top-right card (where the weeks keep their seed card): the title, the seed, the scale, and a way
 * home. Its round button (like the settings panel's) slides it out of the way and back; while it is
 * away, its fields can't be reached with Tab.
 */
export function TitleCard({ seed, onSeed, open, onToggle }: { seed: string; onSeed: (seed: string) => void; open: boolean; onToggle: () => void }) {
  const [draft, setDraft] = useState(seed);
  useEffect(() => setDraft(seed), [seed]);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.toggleAttribute("inert", !open);
  }, [open]);

  return (
    <>
    <button
      onClick={onToggle}
      aria-label={open ? "Close seed panel" : "Open seed panel"}
      title={open ? "Close seed panel" : "Open seed panel"}
      className="pointer-events-auto absolute top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/50 bg-slate-900/70 text-slate-300 shadow-lg shadow-black/30 backdrop-blur-md transition-[right,color] duration-300 ease-in-out hover:text-cyan-300"
      style={{ right: open ? "min(18.5rem, calc(100% - 4rem))" : "1rem" }}
    >
      {open ? <ChevronRight /> : <SeedIcon />}
    </button>
    <div
      ref={card}
      className={glassCardClass + " pointer-events-auto absolute right-4 top-4 w-[17rem] max-w-[calc(100%-5.5rem)] p-5 transition-transform duration-300 ease-in-out " + (open ? "translate-x-0" : "translate-x-[calc(100%+1.5rem)]")}
    >
      <a {...linkProps("/")} className="flex w-fit items-center gap-1.5 text-[11px] uppercase tracking-wider text-slate-500 transition-colors hover:text-cyan-300">
        <BackIcon />
        Home
      </a>
      <h1 className="mt-2 truncate font-display text-2xl font-bold text-slate-100">Blueprint City</h1>

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
            onBlur={() => draft.trim() !== seed && onSeed(draft)}
            aria-label="Terrain seed"
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

      <p className="mt-3 text-[11px] leading-snug text-slate-500">
        {toMeters(WORLD_SIZE)} m across · 1 voxel = {VOXEL_M} m
      </p>
    </div>
    </>
  );
}
