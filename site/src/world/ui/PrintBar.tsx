import { useEffect, useRef, useState } from "react";
import { RangeInput, glassCardClass, valueClass } from "../../components/controls";
import { BUILD_PHASES } from "../terrain/buildup";

/** Seconds for the whole build: terrain, river, water, plaza and streets. */
const PRINT_SECONDS = 8;
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
    <svg {...iconProps} className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cyan-300">
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

  const status = busy ? "Generating…" : t >= 1 ? "Built" : (BUILD_PHASES.find((p) => t < p.end) ?? BUILD_PHASES[0]).label;

  return (
    <div className={glassCardClass + " pointer-events-auto flex w-[34rem] max-w-full items-center gap-3 px-3.5 py-3"}>
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500/20 text-cyan-200 transition-colors hover:bg-cyan-500/30"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <RangeInput
        min={0}
        max={1000}
        value={Math.round(t * 1000)}
        onChange={(e) => {
          setPlaying(false);
          setT(Number(e.target.value) / 1000);
        }}
        aria-label="Generation timeline"
      />
      {/* The browser's own arrow can't be moved, so it is hidden and a chevron drawn in from the edge. */}
      <span className="relative shrink-0">
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
          title="Playback speed"
          className={valueClass + " h-7 cursor-pointer appearance-none rounded-full border border-slate-600/60 bg-slate-800/60 pl-3 pr-8 outline-none transition-colors hover:border-cyan-400/60 focus:border-cyan-400/60"}
        >
          {SPEEDS.map((v) => (
            <option key={v} value={v}>
              {v}×
            </option>
          ))}
        </select>
        <ChevronDown />
      </span>
      <span className={valueClass + " w-[9rem] shrink-0"}>{status}</span>
    </div>
  );
}
