import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

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

export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
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

/** A parameter row: the name (with its explanation on hover) and, on the right, the value or a switch. */
export function Row({ label, description, value, children, inline = false }: { label: ReactNode; description: string; value?: ReactNode; children: ReactNode; inline?: boolean }) {
  return (
    <label className={"relative flex gap-2 " + (inline ? "items-center justify-between" : "flex-col")}>
      <span className="group/label relative flex items-center justify-between gap-2">
        <span className={LABEL + (description ? " cursor-help" : "")}>{label}</span>
        {value !== undefined && <span className={CHIP}>{value}</span>}
        {description && (
          <span className="invisible absolute left-0 top-full z-30 mt-1.5 w-[220px] rounded-lg border border-[#7db4e6]/20 bg-[#0e1c30] px-2.5 py-2 text-[11px] leading-snug text-[#9db2c8] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.4)] transition-opacity duration-100 group-hover/label:visible group-hover/label:opacity-100">
            {description}
          </span>
        )}
      </span>
      {children}
    </label>
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
