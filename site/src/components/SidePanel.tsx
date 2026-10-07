import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

const chevronProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, className: "h-4 w-4" };

function ChevronLeft() {
  return (
    <svg {...chevronProps}>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg {...chevronProps}>
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg {...chevronProps}>
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface PanelHandle {
  isOpen: () => boolean;
  toggle: () => void;
}

const panelRegistry = new Set<PanelHandle>();

/** True while the user is typing somewhere the "E" key should type a letter instead. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["range", "checkbox", "radio", "button", "color", "submit", "reset"].includes(target.type);
  }
  return false;
}

/** Pressing E closes every open panel, or, if none is open, opens them all again. */
function handlePanelShortcut(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== "e" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTextEntry(event.target)) return;
  const panels = [...panelRegistry];
  if (panels.length === 0) return;
  event.preventDefault();
  const anyOpen = panels.some((panel) => panel.isOpen());
  for (const panel of panels) {
    if (panel.isOpen() === anyOpen) panel.toggle();
  }
}

function registerPanel(handle: PanelHandle): () => void {
  if (panelRegistry.size === 0) window.addEventListener("keydown", handlePanelShortcut);
  panelRegistry.add(handle);
  return () => {
    panelRegistry.delete(handle);
    if (panelRegistry.size === 0) window.removeEventListener("keydown", handlePanelShortcut);
  };
}

/**
 * Lets something that is not a side panel (a floating overlay, a toolbar) show and hide with the
 * panels when E is pressed. It joins the same group, so "any open → close all" includes it.
 */
export function useShortcutToggle(open: boolean, onToggle: () => void) {
  const latest = useRef({ open, onToggle });
  latest.current = { open, onToggle };
  useEffect(() => registerPanel({ isOpen: () => latest.current.open, toggle: () => latest.current.onToggle() }), []);
}

/**
 * Shared floating side panel used by every week's views. Pressing E toggles every mounted panel together, on either edge. Left and right use the
 * same card style, the same slide-in/out animation and the same round toggle button, so the
 * navigation sidebar and the settings panels behave identically.
 */
export function SidePanel({
  side,
  open,
  onToggle,
  widthRem,
  closedIcon = <SlidersIcon />,
  label,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
  widthRem: number;
  /** Shown on the toggle while the panel is closed. Defaults to a sliders icon. */
  closedIcon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  const isLeft = side === "left";
  useShortcutToggle(open, onToggle);

  return (
    <>
      <button
        onClick={onToggle}
        aria-label={`${open ? "Close" : "Open"} ${label}`}
        title={`${open ? "Close" : "Open"} ${label} (E)`}
        className="pointer-events-auto absolute top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700/50 bg-slate-900/70 text-slate-300 shadow-lg shadow-black/30 backdrop-blur-md transition-[left,right,color] duration-300 ease-in-out hover:text-cyan-300"
        style={{ [side]: open ? `${widthRem + 1.5}rem` : "1rem" }}
      >
        {open ? isLeft ? <ChevronLeft /> : <ChevronRight /> : closedIcon}
      </button>
      <div
        className={
          "pointer-events-auto absolute top-4 flex max-h-[calc(100%-2rem)] max-w-[85vw] flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-900/70 text-slate-200 shadow-2xl shadow-black/40 backdrop-blur-xl transition-transform duration-300 ease-in-out " +
          (isLeft ? "left-4 " : "right-4 ") +
          (open ? "translate-x-0" : isLeft ? "-translate-x-[calc(100%+1.5rem)]" : "translate-x-[calc(100%+1.5rem)]")
        }
        style={{ width: `${widthRem}rem` }}
      >
        <div className="flex flex-col gap-6 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  );
}
