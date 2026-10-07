import { useMemo } from "react";
import { RangeInput, glassCardClass, valueClass } from "../../components/controls";
import { LAYERS, type LayerId, type LayerVisibility } from "../layers";
import type { WorldModel } from "../pipeline";

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function PlayIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <path d="M8 5v14M16 5v14" strokeWidth={3} />
    </svg>
  );
}

const chipClass = (on: boolean) =>
  "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-200 " +
  (on ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30" : "border-slate-700/50 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60 hover:text-slate-200");

/**
 * Bottom bar. Top row: the growth timeline (play, scrub, which phase, how many buildings stand).
 * Bottom row: world layers | rule overlays. Everything else is in the settings panel.
 */
export function ControlBar({
  world,
  layers,
  onToggle,
  growth,
  playing,
  onGrowth,
  onPlay,
}: {
  world: WorldModel;
  layers: LayerVisibility;
  onToggle: (id: LayerId) => void;
  growth: number;
  playing: boolean;
  onGrowth: (t: number) => void;
  onPlay: (playing: boolean) => void;
}) {
  const births = useMemo(() => world.growth.buildings.map((b) => b.birth).sort((a, b) => a - b), [world]);
  const standing = births.filter((b) => b <= growth).length;
  const phase = [...world.growth.phases].reverse().find((p) => p.start <= growth) ?? world.growth.phases[0];

  return (
    <div className={glassCardClass + " pointer-events-auto absolute bottom-4 left-1/2 flex w-[44rem] max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col gap-2.5 px-3.5 py-3"}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onPlay(!playing)}
          aria-label={playing ? "Pause growth" : "Play growth"}
          title={playing ? "Pause" : "Watch the city grow"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500/20 text-cyan-200 transition-colors hover:bg-cyan-500/30"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="relative min-w-0 flex-1">
          <RangeInput min={0} max={1000} value={Math.round(growth * 1000)} onChange={(e) => onGrowth(Number(e.target.value) / 1000)} aria-label="Growth timeline" />
          {/* Phase marks under the track. */}
          <div className="pointer-events-none absolute inset-x-0 top-3 h-2">
            {world.growth.phases.slice(1).map((p) => (
              <span key={p.name} className="absolute h-1.5 w-px bg-slate-500" style={{ left: `${p.start * 100}%` }} />
            ))}
          </div>
        </div>
        <div className="w-[9.5rem] shrink-0 text-right leading-tight">
          <div className="font-display text-sm font-bold text-slate-100">{phase.name}</div>
          <div className={valueClass}>{standing} buildings</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {LAYERS.filter((l) => l.kind === "world").map((l) => (
          <button key={l.id} onClick={() => onToggle(l.id)} aria-pressed={layers[l.id]} title={l.description} className={chipClass(layers[l.id])}>
            {l.label}
          </button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-slate-700/70" aria-hidden />
        {LAYERS.filter((l) => l.kind === "overlay").map((l) => (
          <button key={l.id} onClick={() => onToggle(l.id)} aria-pressed={layers[l.id]} title={l.description} className={chipClass(layers[l.id])}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
