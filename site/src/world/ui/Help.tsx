import { useEffect, useRef, type ReactNode } from "react";
import { GLASS } from "./kit";

/**
 * The shortcuts sheet (§4.8 of docs/plans/city-controls-plan.md): every key and pointer gesture
 * the city answers to, and a button to take the tour again. It is a native modal <dialog>, so the
 * page behind is inert, Tab stays inside, and Escape closes it; focus goes back to whatever opened
 * it. Keys pressed inside don't reach the page's shortcuts (E, Space, 1–6).
 *
 * It must be mounted outside the interface's zoom: a modal dialog sits in the top layer, and
 * under an ancestor's CSS zoom Chrome draws it in one place but takes its clicks in another.
 */

/** A key cap: one height for every key, wide enough for a single character, a ridge at the bottom. */
function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-b-2 border-[#7db4e6]/25 border-b-[#7db4e6]/40 bg-[#14243a] px-1.5 font-mono text-[11.5px] leading-none text-[#ffd27a]">
      {children}
    </kbd>
  );
}

const KEYS: [ReactNode, string][] = [
  [<Key>E</Key>, "Hide or show the panels"],
  [<Key>Space</Key>, "Play or pause the build"],
  [
    <>
      <Key>1</Key>
      <span className="text-[#6f86a0]">to</span>
      <Key>5</Key>
    </>,
    "Fly to Overview, Plaza, Park, River, Street",
  ],
  [<Key>6</Key>, "Follow what is selected"],
  [<Key>Esc</Key>, "Close the inspector, or this sheet"],
  [<Key>?</Key>, "Open this sheet"],
];

const POINTER: [ReactNode, string][] = [
  ["Click", "Inspect a person, pigeon, cat or vehicle"],
  ["Drag", "Orbit round the city"],
  ["Right-drag", "Pan"],
  ["Scroll", "Zoom"],
];

function List({ title, rows }: { title: string; rows: [ReactNode, string][] }) {
  return (
    <section>
      <h3 className="m-0 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#6f86a0]">{title}</h3>
      <dl className="m-0 mt-1.5">
        {rows.map(([k, v], i) => (
          <div key={i} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 border-b border-[#7db4e6]/10 py-2 last:border-b-0">
            <dt className="flex items-center gap-1.5 text-[13px] font-medium text-[#dce8f5]">{k}</dt>
            <dd className="m-0 text-[13px] leading-snug text-[#9db2c8]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HelpDialog({ open, onClose, onTour }: { open: boolean; onClose: () => void; onTour: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="help-title"
      onClose={() => {
        onClose();
        opener.current?.focus();
      }}
      // Keys typed here stay here: the page's own shortcuts listen on the window.
      onKeyDown={(e) => e.stopPropagation()}
      // A click on the backdrop (the dialog element itself, outside its card) closes it.
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="m-auto w-[24rem] max-w-[calc(100vw-2rem)] bg-transparent p-0 text-[#dce8f5] backdrop:bg-[#050b14]/55 backdrop:backdrop-blur-[2px]"
    >
      <div className={"rounded-2xl border " + GLASS}>
        <header className="flex items-center justify-between py-3 pl-5 pr-3">
          <h2 id="help-title" className="m-0 font-display text-[16px] font-bold text-white">
            Shortcuts
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            title="Close (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9db2c8] transition-colors hover:bg-[#7db4e6]/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ad8ff]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="flex flex-col gap-4 border-t border-[#7db4e6]/10 px-5 pb-1 pt-4">
          <List title="Keys" rows={KEYS} />
          <List title="Mouse" rows={POINTER} />
          <p className="m-0 text-[12px] leading-snug text-[#6f86a0]">On a touch screen, one finger orbits and two pinch to zoom and pan. Keys don't work while typing in the seed.</p>
        </div>
        <footer className="mt-4 flex justify-end border-t border-[#7db4e6]/10 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              ref.current?.close();
              onTour();
            }}
            className="rounded-lg border border-[#5ad8ff]/40 px-3 py-1.5 text-[13px] text-[#5ad8ff] transition-colors hover:bg-[#5ad8ff]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#5ad8ff]"
          >
            Take the tour
          </button>
        </footer>
      </div>
    </dialog>
  );
}
