import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sameSelection, type Selection } from "../render/select";
import { GLASS } from "./kit";

/**
 * The first-visit tour (§4.8 of docs/plans/city-controls-plan.md): four small cards in turn, each
 * pointing at its control. The rest of the page dims a little, leaving the control in a rounded
 * window of light (a spotlight, not an outline). Each card shows its place in the tour, with Back,
 * Next and Skip. The
 * last asks for a click on anyone in the city, and ends when the inspector opens. It starts on its
 * own once the first build has finished, and only once per browser (localStorage); the shortcuts
 * sheet can start it again. Escape skips it.
 */

const SEEN_KEY = "world.tourSeen";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Without storage the tour would come back on every visit; showing it never is kinder.
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Not remembered; nothing else to do.
  }
}

interface Step {
  /** The control the card points at, or null for one about the city itself. */
  target: string | null;
  /** What the card sits clear of, to the right (the whole tab row, not just one tab); the target if none. */
  beside?: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    target: '[data-tour="seed"]',
    title: "Every city grows from a seed",
    text: "Type any word, or roll the dice, and a different island grows: its river, streets, buildings and people.",
  },
  {
    target: '[role="tablist"][aria-label="Panel"] [data-tab="build"]',
    beside: '[role="tablist"][aria-label="Panel"]',
    title: "Build",
    text: "The settings, in the order the city is made: noise, shaping, terraces, the river, surfaces and lots. Change one and the city rebuilds.",
  },
  {
    target: '[role="tablist"][aria-label="Panel"] [data-tab="layers"]',
    beside: '[role="tablist"][aria-label="Panel"]',
    title: "Layers",
    text: "What is drawn, not what is built: tint the ground by district or claim, and show or hide lots, parks, buildings and people.",
  },
  {
    target: null,
    title: "Click anyone in the city",
    text: "A person, a pigeon, a bus or a building: a card tells you what it is doing and why. Try it now.",
  },
];

/** The card's width (px, before the interface's zoom), its gap from its control, and the margin it keeps from the edges. */
const WIDTH = 256;
const GAP = 14;
const EDGE = 10;
/** The spotlight's margin round its control (px). */
const RING = 6;
/** The card stays below the panel's collapse button, which sits at the top beside the panel (px). */
const TOP = 56;

export function Tour({
  selection,
  scale,
  panelOpen,
  setPanelOpen,
  onClose,
}: {
  selection: Selection | null;
  /** The interface's zoom (UI_SCALE), to place the card in screen pixels. */
  scale: number;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const { target, beside, title, text } = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = () => {
    markSeen();
    onClose();
  };

  // The panel holds the first three steps' controls: open it for them. On a phone it covers much
  // of the city, so it closes again for the last.
  useEffect(() => {
    if (target && !panelOpen) setPanelOpen(true);
    if (!target && panelOpen && window.innerWidth < 640) setPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Each step takes the focus, so Enter goes on and the screen reader reads the card.
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), [step]);

  // The last step ends when something new is selected.
  const atLast = useRef<Selection | null>(null);
  useEffect(() => {
    if (last) atLast.current = selection;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);
  useEffect(() => {
    if (last && selection && !sameSelection(selection, atLast.current)) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every frame: beside the control (to its right, or below it if there's no room), the spotlight
  // on it and the arrow pointing at it. The panel slides in, so its controls move for a moment.
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const card = cardRef.current;
      const ring = spotRef.current;
      const arrow = arrowRef.current;
      if (card && ring && arrow) {
        const w = Math.min(WIDTH * scale, window.innerWidth - 2 * EDGE);
        const h = card.offsetHeight * scale;
        const el = target ? document.querySelector<HTMLElement>(target) : null;
        const r = el?.getBoundingClientRect();
        let x: number;
        let y: number;
        if (r && r.width > 0) {
          ring.style.opacity = "1";
          ring.style.transform = `translate(${(r.left - RING) / scale}px, ${(r.top - RING) / scale}px)`;
          ring.style.width = `${(r.width + 2 * RING) / scale}px`;
          ring.style.height = `${(r.height + 2 * RING) / scale}px`;
          const clear = (beside && document.querySelector(beside)?.getBoundingClientRect().right) || r.right;
          const right = Math.max(r.right, clear) + RING + GAP * scale;
          if (right + w <= window.innerWidth - EDGE) {
            x = right;
            y = r.top + r.height / 2 - h / 2;
            y = Math.min(Math.max(TOP * scale, y), window.innerHeight - h - EDGE);
            arrow.dataset.side = "left";
            arrow.style.top = `${(r.top + r.height / 2 - y) / scale - 6}px`;
            arrow.style.left = "";
          } else {
            x = Math.min(Math.max(EDGE, r.left), window.innerWidth - w - EDGE);
            y = r.bottom + RING + GAP * scale;
            arrow.dataset.side = "top";
            arrow.style.left = `${Math.min(Math.max(14, (r.left + r.width / 2 - x) / scale - 6), w / scale - 26)}px`;
            arrow.style.top = "";
          }
          arrow.style.display = "block";
        } else {
          // About the city: at the top, in the middle of what the panel leaves.
          // The city must stay clear to click: no dimming.
          ring.style.opacity = "0";
          arrow.style.display = "none";
          x = (window.innerWidth - w) / 2;
          y = 64 * scale;
        }
        x = Math.min(Math.max(EDGE, x), window.innerWidth - w - EDGE);
        card.style.width = `${w / scale}px`;
        card.style.transform = `translate(${x / scale}px, ${y / scale}px)`;
        card.style.visibility = "visible";
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [target, beside, scale]);

  const button = "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5ad8ff]";

  return (
    <>
      {/* The spotlight: a clear window over the control; its huge shadow is the dimmed page. */}
      <div
        ref={spotRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-20 rounded-xl opacity-0 shadow-[0_0_0_200vmax_rgba(4,9,17,0.5)] transition-[transform,width,height,opacity] duration-300 ease-out"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        className={"pointer-events-auto invisible absolute left-0 top-0 z-20 rounded-2xl border px-4 pb-3 pt-3.5 text-[#dce8f5] " + GLASS}
      >
        <span
          ref={arrowRef}
          aria-hidden
          className="absolute hidden h-3 w-3 rotate-45 border-[#7db4e6]/15 bg-[#0b1626] data-[side=left]:-left-[7px] data-[side=left]:border-b data-[side=left]:border-l data-[side=top]:-top-[7px] data-[side=top]:border-l data-[side=top]:border-t"
        />
        <div className="flex items-center gap-3">
          <ol className="m-0 flex flex-1 list-none gap-1 p-0" aria-hidden>
            {STEPS.map((_, i) => (
              <li key={i} className={"h-[3px] flex-1 rounded-full transition-colors " + (i <= step ? "bg-[#5ad8ff]" : "bg-[#7db4e6]/20")} />
            ))}
          </ol>
          <span className="font-mono text-[11px] tabular-nums text-[#6f86a0]">
            {step + 1} of {STEPS.length}
          </span>
        </div>
        <h2 id="tour-title" className="m-0 mt-3 font-display text-[15px] font-bold leading-tight text-white">
          {title}
        </h2>
        <p id="tour-text" className="mb-0 mt-1.5 text-[12.5px] leading-relaxed text-[#b8c9db]">
          {text}
        </p>
        <div className="-mx-1 mt-3.5 flex items-center gap-1.5">
          {!last && (
            <button type="button" onClick={finish} className={button + " px-1 text-[#6f86a0] hover:text-[#dce8f5]"}>
              Skip tour
            </button>
          )}
          <span className="flex-1" />
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} className={button + " text-[#9db2c8] hover:bg-[#7db4e6]/10 hover:text-white"}>
              Back
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            className={button + " border border-[#5ad8ff]/40 bg-[#5ad8ff]/15 text-[#5ad8ff] hover:bg-[#5ad8ff]/25"}
          >
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
