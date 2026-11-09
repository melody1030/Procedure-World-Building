import { createPortal } from "react-dom";
import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";

/**
 * Blueprint City's own controls (the weeks keep theirs in components/controls.tsx). A blueprint:
 * deep navy ink with fine pale-blue rules; cyan for what you can touch (neon), warm amber for
 * values (the lit windows), so a number never looks like a control.
 *
 * Parameters read as rows: the name in sentence case on the left, the value in an amber chip on
 * the right, and under them a thin track filled up to the value, with a tick where the default
 * sits.
 */

/** Panel glass: navy ink that also dims what is behind it, so text keeps its contrast over the bright diorama. */
export const GLASS = "border-[#7db4e6]/15 bg-[#0b1626]/75 shadow-[0_12px_32px_rgba(8,16,30,0.35)] backdrop-blur-xl backdrop-brightness-[0.7]";
/** Section and title type. */
export const HEADING = "font-display text-[13px] font-bold uppercase tracking-[0.14em] text-[#dce8f5]";
/** Small labels (sentence case). */
export const LABEL = "text-[12px] font-medium text-[#9db2c8]";
/** Small print. */
export const NOTE = "text-[11px] leading-snug text-[#6f86a0]";
/** Values: amber mono. */
export const VALUE = "font-mono text-[11px] tabular-nums text-[#ffd27a]";
/** The amber chip a value sits in. */
export const CHIP = VALUE + " rounded-md bg-[#ffd27a]/10 px-1.5 py-0.5";
/** Hairline between parts of the panel. */
export const RULE = "border-[#7db4e6]/10";

const chevron = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** A small count beside a heading, e.g. how many settings in a closed section were changed. */
export function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-[#5ad8ff]/15 px-1.5 py-px font-mono text-[10px] font-normal tracking-normal text-[#5ad8ff]" aria-label={`${count} ${label}`} title={`${count} ${label}`}>
      {count}
    </span>
  );
}

/** A collapsible section (an accordion item). `changed` puts a count badge on its header. */
export function Section({ icon, title, changed = 0, children }: { icon: ReactNode; title: string; changed?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <section className={"shrink-0 border-t pt-3.5 " + RULE}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className={"group flex w-full items-center gap-2 text-left " + HEADING}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 text-[#5ad8ff]/70 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
        <span className="flex-1 transition-colors group-hover:text-white">{title}</span>
        <Badge count={changed} label={changed === 1 ? "setting changed" : "settings changed"} />
        <svg {...chevron} className={"h-3.5 w-3.5 shrink-0 text-[#6f86a0] transition-transform duration-200 " + (open ? "" : "-rotate-90")}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={bodyId} className="mt-3.5 flex flex-col gap-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

/** A heading inside a tab, smaller than a section's. */
export function Subheading({ children, info }: { children: string; info?: string }) {
  const { row, zone, bubble } = useHoverTip(info);
  return (
    <div ref={row.ref}>
      <h3 className={"m-0 w-fit font-display text-[11px] font-bold uppercase tracking-[0.14em] text-[#6f86a0]" + (info ? " cursor-help" : "")} {...zone}>
        {children}
      </h3>
      {bubble}
    </div>
  );
}

/**
 * A hover explanation: hovering a setting's name (or reaching its control with the keyboard)
 * shows the text in a speech bubble just right of the panel, its tail pointing at the name, so it
 * never covers the panel. The bubble is portaled to <body> so the panel's scrolling box can't clip it. Spread
 * `row` on the row, `zone` on the name, and render `bubble` anywhere.
 */
/** How far down the bubble its tail sits, when the bubble isn't pushed by the window's edge. */
const TAIL_AT = 15;

export function useHoverTip(text: ReactNode) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; tail: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = (hover || focus) && !!text;
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const row = rowRef.current;
      const bubble = bubbleRef.current;
      if (!row || !bubble) return;
      // The tail points at the middle of the name; the panel's outer edge is the scroll box's parent.
      const name = (zoneRef.current ?? row).getBoundingClientRect();
      const y = name.top + name.height / 2;
      const scroller = row.closest(".overflow-y-auto");
      const edge = (scroller?.parentElement ?? scroller ?? row).getBoundingClientRect().right;
      const { offsetWidth: w, offsetHeight: h } = bubble;
      const top = Math.max(8, Math.min(y - TAIL_AT, window.innerHeight - h - 8));
      setPos({ left: Math.min(edge + 9, window.innerWidth - w - 8), top, tail: Math.max(10, Math.min(y - top, h - 10)) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setHover(false);
      setFocus(false);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const row = {
    ref: rowRef,
    // Only keyboard focus shows it: a click on a slider shouldn't leave the bubble up.
    onFocus: (e: FocusEvent) => (e.target as HTMLElement).matches(":focus-visible") && setFocus(true),
    onBlur: () => setFocus(false),
  };
  const zone = text ? { ref: zoneRef as never, onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } : {};
  const bubble =
    open &&
    createPortal(
      <div
        ref={bubbleRef}
        id={id}
        role="tooltip"
        style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
        className="pointer-events-none fixed z-50 w-[220px] rounded-xl border border-[#7db4e6]/25 bg-[#0e1c30]/75 px-2.5 py-2 text-[11px] leading-snug text-[#9db2c8] shadow-[0_8px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm"
      >
        {/* The speech-bubble tail: a square turned 45°, showing only its left and bottom edges and
            clipped to the half outside the bubble, so the see-through fill doesn't double up. */}
        <span
          aria-hidden
          className="absolute -left-[5px] h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-l border-[#7db4e6]/25 bg-[#0e1c30]/75 [clip-path:polygon(0_0,0_100%,100%_100%)]"
          style={{ top: pos?.tail ?? TAIL_AT }}
        />
        {text}
      </div>,
      document.body,
    );
  return { row, zone, bubble, describedBy: open ? id : undefined };
}

/**
 * Tabs (the ARIA tabs pattern): a row of tabs over one panel. Arrow keys, Home and End move
 * between tabs; only the open tab's panel is mounted.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; panel: ReactNode }[]; value: T; onChange: (id: T) => void; label: string }) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const next = (to + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label={label} className={"flex shrink-0 border-b " + RULE} onKeyDown={onKey}>
        {tabs.map((t, i) => {
          const on = i === index;
          return (
            <button
              key={t.id}
              ref={(el) => (refs.current[i] = el)}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={
                "-mb-px flex-1 border-b-2 pb-2 pt-1 font-display text-[12px] font-bold uppercase tracking-[0.14em] transition-colors " +
                (on ? "border-[#5ad8ff] text-[#5ad8ff]" : "border-transparent text-[#6f86a0] hover:text-[#dce8f5]")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel-${tabs[index].id}`} aria-labelledby={`${base}-tab-${tabs[index].id}`} className="flex flex-col gap-3.5">
        {tabs[index].panel}
      </div>
    </>
  );
}

/**
 * A segmented control: a few mutually exclusive options side by side. Built on native radio
 * buttons, so arrow keys move the choice and the group reads as one question.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30]/70 p-0.5">
      {options.map((o) => (
        <label key={o.value} className="min-w-0 flex-auto cursor-pointer">
          <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} className="peer sr-only" />
          <span className="block whitespace-nowrap rounded-md border border-transparent px-1 py-1 text-center text-[11px] text-[#9db2c8] transition-colors hover:text-[#dce8f5] peer-checked:border-[#5ad8ff]/40 peer-checked:bg-[#5ad8ff]/15 peer-checked:text-[#5ad8ff] peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-[#5ad8ff]">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * A parameter row: the name (hover it for the explanation) and, on the right, the value or a
 * switch. The control (the one child) gets an id so clicking the name still reaches it.
 */
export function Row({ label, description, value, children, inline = false }: { label: ReactNode; description: string; value?: ReactNode; children: ReactNode; inline?: boolean }) {
  const id = useId();
  const { row, zone, bubble, describedBy } = useHoverTip(description);
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, { id, "aria-describedby": describedBy }) : children;
  return (
    <div {...row} className={"flex gap-2 " + (inline ? "items-center justify-between" : "flex-col")}>
      <span className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={LABEL + (description ? " cursor-help" : " cursor-pointer")} {...zone}>
          {label}
        </label>
        {value !== undefined && <span className={CHIP}>{value}</span>}
      </span>
      {control}
      {bubble}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={"m-0 " + NOTE}>{children}</p>;
}

/**
 * A thin track filled (cyan) up to the value, with a small pale tick where `defaultValue` sits, so
 * a changed setting shows how far it has moved. The thumb is styled by `.world-range` in styles.css.
 */
export function Slider({ min, max, value, defaultValue, className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max" | "defaultValue"> & { min: number; max: number; value: number; defaultValue?: number }) {
  const at = (v: number) => (max > min ? ((v - min) / (max - min)) * 100 : 0);
  const fill = at(value);
  return (
    <span className="relative flex h-3 items-center">
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        className={"world-range h-[3px] w-full min-w-0 cursor-pointer appearance-none rounded-full " + className}
        style={{ background: `linear-gradient(to right, #5ad8ff ${fill}%, #24384f ${fill}%)` }}
        {...props}
      />
      {defaultValue !== undefined && (
        <span
          className="pointer-events-none absolute top-1/2 h-2 w-px -translate-y-1/2 bg-[#dce8f5]/45"
          style={{ left: `calc(5px + ${at(defaultValue)} * (100% - 10px) / 100)` }}
          aria-hidden
        />
      )}
    </span>
  );
}

export function Switch(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return (
    <input
      type="checkbox"
      className="relative h-4 w-7 shrink-0 cursor-pointer appearance-none rounded-full bg-[#24384f] transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-[#dce8f5] after:transition-transform after:duration-200 checked:bg-[#5ad8ff] checked:after:translate-x-3"
      {...props}
    />
  );
}

export function Select({ children, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  return (
    <span className="relative w-full">
      <select
        className="w-full cursor-pointer appearance-none rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30]/70 py-1.5 pl-2.5 pr-8 text-[12px] text-[#dce8f5] outline-none transition-colors hover:border-[#7db4e6]/40 focus:border-[#5ad8ff]/60 [&>option]:bg-[#0e1c30]"
        {...props}
      >
        {children}
      </select>
      <svg {...chevron} className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6f86a0]">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30]/60 px-2.5 py-1.5 text-[12px] font-medium text-[#dce8f5] transition-colors hover:border-[#5ad8ff]/50 hover:text-white " +
        className
      }
      {...props}
    />
  );
}

/** A row of color swatches with labels (a map legend). */
export function Legend({ items }: { items: [string, number][] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map(([label, color]) => (
        <span key={label} className={"flex items-center gap-1.5 " + NOTE}>
          <span className="h-2 w-2 rounded-sm" style={{ background: `#${color.toString(16).padStart(6, "0")}` }} />
          {label}
        </span>
      ))}
    </div>
  );
}
