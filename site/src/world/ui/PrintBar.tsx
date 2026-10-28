import { useEffect, useRef, useState } from "react";
import { GLASS, VALUE } from "./kit";
import { BUILD_PHASES, BUILD_SECONDS } from "../terrain/buildup";

/** Seconds for the whole build: terrain, river, water, plaza, streets and buildings (see PHASE_SECONDS). */
const PRINT_SECONDS = BUILD_SECONDS;
/** Playback speeds offered by the speed menu; 1 is PRINT_SECONDS for the whole build. */
const SPEEDS = [0.5, 1, 2, 4];

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function PlayIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg {...iconProps} className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#ffd27a]">
      <path d="M6 9l6 6 6-6" />
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

/**
 * The generation timeline at the bottom: the terrain prints layer by layer from the plinth up,
 * then the river carves its channel and fills, the plaza is built and the streets grow from it.
 * It plays by itself when a new seed loads (`replayKey` changes); the slider scrubs it and the
 * button plays or pauses, and the speed menu sets the playback speed (it applies at once, even
 * mid-play). It owns its own time, so only this bar re-renders while it plays.
 */
export function PrintBar({ replayKey, onChange, busy = false }: { replayKey: string; onChange: (t: number) => void; busy?: boolean }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(t);
  tRef.current = t;
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // A new seed prints from the start.
  useEffect(() => {
    setT(0);
    setPlaying(true);
  }, [replayKey]);

  useEffect(() => onChange(t), [t, onChange]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, tRef.current + ((now - last) / 1000 / PRINT_SECONDS) * speedRef.current);
      last = now;
      setT(next);
      if (next >= 1) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const phase = t >= 1 ? BUILD_PHASES.length : BUILD_PHASES.findIndex((p) => t < p.end);
  const status = busy ? "Generating…" : t >= 1 ? "Built" : `${BUILD_PHASES[phase].label} · ${phase + 1}/${BUILD_PHASES.length}`;

  return (
    <div className={"pointer-events-auto flex w-[38rem] max-w-full items-center gap-3 rounded-2xl border px-3 py-2.5 " + GLASS}>
      <button
        onClick={() => {
          if (playing) setPlaying(false);
          else {
            if (t >= 1) setT(0);
            setPlaying(true);
          }
        }}
        aria-label={playing ? "Pause printing" : "Play printing"}
        title={playing ? "Pause" : t >= 1 ? "Print again" : "Play"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#5ad8ff]/60 bg-[#5ad8ff]/15 text-[#5ad8ff] transition-colors hover:bg-[#5ad8ff]/25"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      {/* The scrubber's track is the build's six stages, each as long as its share of the timeline,
          with small gaps between them: filled in cyan up to now, the current stage's remaining
          part a shade lighter. The range input lies on top, transparent but for its thumb. */}
      <div className="relative flex h-3 min-w-0 flex-1 items-center">
        <div className="pointer-events-none absolute inset-x-[5px] flex gap-[3px]" aria-hidden>
          {BUILD_PHASES.map((p, i) => {
            const from = i === 0 ? 0 : BUILD_PHASES[i - 1].end;
            const fill = Math.min(1, Math.max(0, (t - from) / (p.end - from))) * 100;
            const rest = i === phase ? "#35506e" : "#24384f";
            return <span key={p.id} className="h-[3px] rounded-full" style={{ flexGrow: p.end - from, background: `linear-gradient(to right, #5ad8ff ${fill}%, ${rest} ${fill}%)` }} />;
          })}
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value) / 1000);
          }}
          aria-label="Generation timeline"
          title={t >= 1 ? "Built" : BUILD_PHASES[phase].label}
          className="world-range relative h-3 w-full min-w-0 cursor-pointer appearance-none bg-transparent"
        />
      </div>
      {/* The browser's own arrow can't be moved, so it is hidden and a chevron drawn in from the edge. */}
      <span className="relative shrink-0">
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
          title="Playback speed"
          className={VALUE + " h-6 cursor-pointer appearance-none rounded-md border border-[#7db4e6]/20 bg-[#ffd27a]/10 pl-2 pr-7 outline-none transition-colors hover:border-[#5ad8ff]/50 focus:border-[#5ad8ff]/60 [&>option]:bg-[#0e1c30]"}
        >
          {SPEEDS.map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
        <ChevronDown />
      </span>
      <span className={VALUE + " w-[11.5rem] shrink-0"}>{status}</span>
    </div>
  );
}
