import { useEffect, type ReactNode } from "react";
import { isTextEntry } from "../../components/SidePanel";
import type { CameraPreset } from "../render/WorldView";
import { GLASS } from "./kit";

/**
 * The camera toolbar, pinned to the view's right edge: a button group of camera presets (keys
 * 1–5). Each button names itself in a tooltip to its left on hover or keyboard focus. The preset
 * the view is at is lit; moving the view by hand clears it. It hides with the panels (E).
 */

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", className: "h-4 w-4" } as const;

const ICONS: Record<CameraPreset, ReactNode> = {
  overview: (
    <svg {...iconProps}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </svg>
  ),
  plaza: (
    <svg {...iconProps}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  park: (
    <svg {...iconProps}>
      <path d="M12 3l5 7h-3l4 6H6l4-6H7z" />
      <path d="M12 16v5" />
    </svg>
  ),
  river: (
    <svg {...iconProps}>
      <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </svg>
  ),
  street: (
    <svg {...iconProps}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 8v7M8 21l4-6 4 6M8 11h8" />
    </svg>
  ),
};

export const PRESETS: { id: CameraPreset; label: string; key: string }[] = [
  { id: "overview", label: "Overview", key: "1" },
  { id: "plaza", label: "Plaza", key: "2" },
  { id: "park", label: "Park", key: "3" },
  { id: "river", label: "River", key: "4" },
  { id: "street", label: "Street", key: "5" },
];

/** A toolbar button with its tooltip to the left: the name, the key, and a tail pointing back. */
function ToolButton({ label, keyName, icon, active = false, disabled = false, onClick }: { label: string; keyName: string; icon: ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <span className="group relative flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-keyshortcuts={keyName}
        aria-pressed={active || undefined}
        className={
          "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:cursor-default disabled:opacity-30 " +
          (active ? "border-[#5ad8ff]/40 bg-[#5ad8ff]/15 text-[#5ad8ff]" : "border-transparent text-[#9db2c8] hover:text-white enabled:hover:bg-[#0e1c30]/70")
        }
      >
        {icon}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-full top-1/2 mr-2.5 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg border border-[#7db4e6]/25 bg-[#0e1c30]/75 px-2 py-1 text-[11px] text-[#dce8f5] opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.4)] backdrop-blur-sm transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-has-[:focus-visible]:visible group-has-[:focus-visible]:opacity-100"
      >
        {label}
        <kbd className="rounded bg-[#ffd27a]/10 px-1 font-mono text-[10px] text-[#ffd27a]">{keyName}</kbd>
        <span aria-hidden className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-r border-t border-[#7db4e6]/25 bg-[#0e1c30]/75 [clip-path:polygon(0_0,100%_0,100%_100%)]" />
      </span>
    </span>
  );
}

export function CameraBar({ view, available, onFly, shown }: { view: CameraPreset | null; available: Record<CameraPreset, boolean>; onFly: (preset: CameraPreset) => void; shown: boolean }) {
  // Keys 1–5 fly to the presets (not while typing, e.g. in the seed field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTextEntry(e.target)) return;
      const preset = PRESETS.find((p) => p.key === e.key);
      if (!preset || !available[preset.id]) return;
      e.preventDefault();
      onFly(preset.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [available, onFly]);

  if (!shown) return null;

  return (
    <div role="toolbar" aria-label="Camera" aria-orientation="vertical" className={"pointer-events-auto absolute right-4 top-4 flex flex-col gap-0.5 rounded-xl border p-1 " + GLASS}>
      {PRESETS.map((p) => (
        <ToolButton key={p.id} label={p.label} keyName={p.key} icon={ICONS[p.id]} active={view === p.id} disabled={!available[p.id]} onClick={() => onFly(p.id)} />
      ))}
    </div>
  );
}
