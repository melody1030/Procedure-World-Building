import { useEffect, useId, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Shared panel controls for the Week 1, 2 and 4 side panels, written with the same Tailwind
 * recipes Week 3 uses: uppercase slate headings, label + mono cyan value above a slim slider,
 * rounded selects and buttons on translucent slate. See STYLE_GUIDE.md section 7.
 */

/** Share Tech section heading: uppercase, slate-400, 14px icon in slate-500. */
export const headingClass = "flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-slate-400";
export const headingIconClass = "h-3.5 w-3.5 shrink-0 text-slate-500";

/** Floating glass card for overlays on the stage (2D map, simulation player). */
export const glassCardClass = "rounded-2xl border border-slate-700/50 bg-slate-900/70 shadow-2xl shadow-black/40 backdrop-blur-xl";

/**
 * A titled group of controls. With `collapsible`, the heading becomes a button that shows and
 * hides the controls, with a chevron that turns as it opens.
 */
export function Section({
  icon,
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const heading = (
    <>
      <span className="flex h-3.5 w-3.5 shrink-0 text-slate-500 [&>svg]:h-full [&>svg]:w-full">{icon}</span>
      <span className="flex-1">{title}</span>
    </>
  );
  return (
    <section className="shrink-0">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={headingClass + " w-full cursor-pointer text-left transition-colors duration-150 hover:text-slate-200"}
        >
          {heading}
          <ChevronDown className={"h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 " + (open ? "" : "-rotate-90")} />
        </button>
      ) : (
        <div className={headingClass}>{heading}</div>
      )}
      {open && (
        <div id={bodyId} className="mt-3 flex flex-col gap-3.5">
          {children}
        </div>
      )}
    </section>
  );
}

export const labelTextClass = "text-xs font-semibold uppercase tracking-wide text-slate-400";

/** Mono cyan numeric readout that sits on the label row. */
export const valueClass = "font-mono text-xs font-normal normal-case tracking-normal tabular-nums text-cyan-300";

/** Label with a hover tooltip (none when `description` is empty). `inline` puts the control on the same row (used for switches). */
export function Field({
  label,
  description,
  valueLabel,
  inline = false,
  children,
}: {
  label: ReactNode;
  description: string;
  valueLabel?: ReactNode;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={"relative flex gap-1.5 text-xs " + (inline ? "flex-row items-center justify-between" : "flex-col items-stretch")}>
      <span
        className={"group/label relative flex items-baseline justify-between " + (description ? "cursor-help " : "") + labelTextClass + (inline ? "" : " w-full")}
        title={description || undefined}
      >
        {label}
        {valueLabel !== undefined && <span className={"ml-auto " + valueClass}>{valueLabel}</span>}
        {description && <span className="invisible absolute left-0 top-full z-30 mt-1.5 w-[220px] rounded-lg border border-slate-700/50 bg-slate-800 px-2.5 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-slate-400 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.4)] transition-opacity duration-100 group-hover/label:visible group-hover/label:opacity-100">
          {description}
        </span>}
      </span>
      {children}
    </label>
  );
}

/** A plain uppercase label with no tooltip (e.g. Week 1's editable geometry parameters). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className={"relative flex w-full items-baseline justify-between " + labelTextClass}>{children}</span>;
}

export function FieldNote({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[11px] leading-snug text-slate-500">{children}</p>;
}

export function RangeInput({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="range"
      className={"h-1.5 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400 " + className}
      {...props}
    />
  );
}

/** Checkbox drawn as a cyan switch. */
export function Switch(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">) {
  return (
    <input
      type="checkbox"
      className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-slate-700 transition-colors duration-200 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-slate-200 after:transition-transform after:duration-200 checked:bg-cyan-500/70 checked:after:translate-x-4"
      {...props}
    />
  );
}

function ChevronDown({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Rounded select with a chevron, like Week 3's. `compact` is the small variant used in overlays. */
export function Select({
  compact = false,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { compact?: boolean }) {
  return (
    <div className={"relative " + (compact ? "" : "w-full")}>
      <select
        className={
          "w-full cursor-pointer appearance-none border border-slate-700/50 bg-slate-800/60 text-slate-200 outline-none transition-colors hover:border-slate-500 focus:border-cyan-400/50 [&>option]:bg-slate-900 " +
          (compact ? "rounded-lg py-1 pl-2 pr-7 text-xs" : "rounded-xl py-2 pl-3 pr-9 text-sm")
        }
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={"pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 " + (compact ? "right-2 h-3.5 w-3.5" : "right-3 h-4 w-4")}
      />
    </div>
  );
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A swatch (native colour picker) and an editable hex readout, kept separate so the
 * hex text can be typed freely without the swatch fighting an in-progress edit. */
export function ColorField({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    if (HEX_COLOR.test(next)) onChange(next);
  };

  return (
    <Field label={label} description={description}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-[38px] w-[38px] shrink-0 cursor-pointer rounded-xl border border-slate-700/50 bg-slate-800/60 p-[3px] transition-colors hover:border-slate-500 [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-none"
          value={HEX_COLOR.test(text) ? text : value}
          onChange={(e) => commit(e.target.value)}
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2 font-mono text-[13px] text-cyan-300 transition-colors hover:border-slate-500 focus:border-cyan-400/50 focus:outline-none"
          value={text}
          spellCheck={false}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(value)}
          aria-label={`${label} hex value`}
        />
      </div>
    </Field>
  );
}

export function PanelButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={
        "flex-1 cursor-pointer rounded-xl border border-slate-700/50 bg-slate-800/50 px-2.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700/60 " +
        className
      }
      {...props}
    />
  );
}
