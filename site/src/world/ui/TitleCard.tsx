import { useEffect, useState } from "react";
import { LABEL, NOTE, VALUE } from "./kit";
import { linkProps } from "../../router";
import { randomSeed } from "../rng";
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

/**
 * The top of the world's panel: a way home, the title and the seed (typed or rolled).
 * It used to be a card of its own on the right; it lives in the left panel now, so only one side
 * of the view is covered.
 */
export function TitleBlock({ seed, onSeed }: { seed: string; onSeed: (seed: string) => void }) {
  const [draft, setDraft] = useState(seed);
  useEffect(() => setDraft(seed), [seed]);

  return (
    <div className="shrink-0 pb-1">
      <a {...linkProps("/")} className={"flex w-fit items-center gap-1.5 transition-colors hover:text-[#5ad8ff] " + NOTE}>
        <BackIcon />
        Home
      </a>
      <h1 className="mt-1.5 truncate font-display text-xl font-bold tracking-wide text-white">Blueprint City</h1>

      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSeed(draft);
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30]/70 px-2.5 py-1.5 transition-colors focus-within:border-[#5ad8ff]/60 hover:border-[#7db4e6]/40">
          <span className={LABEL}>Seed</span>
          <input
            value={draft}
            maxLength={MAX_SEED_LENGTH}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft.trim() !== seed && onSeed(draft)}
            aria-label="Terrain seed"
            className={"min-w-0 flex-1 bg-transparent outline-none " + VALUE}
          />
        </label>
        <button
          type="button"
          onClick={() => onSeed(randomSeed())}
          title="New random seed"
          aria-label="New random seed"
          className="flex w-8 shrink-0 items-center justify-center rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30]/70 text-[#9db2c8] transition-colors hover:border-[#5ad8ff]/50 hover:text-[#5ad8ff]"
        >
          <DiceIcon />
        </button>
      </form>
    </div>
  );
}
