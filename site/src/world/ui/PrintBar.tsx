import { useEffect, useRef, useState } from "react";
import { RangeInput, glassCardClass, valueClass } from "../../components/controls";
import { BASE, toMeters } from "../scale";

/** Seconds for a whole print, plinth to the highest column. */
const PRINT_SECONDS = 1.5;

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

/**
 * The generation timeline at the bottom: the terrain prints layer by layer from the plinth up.
 * It plays by itself when a new seed loads (`replayKey` changes); the slider scrubs it and the
 * button plays or pauses. It owns its own time, so only this bar re-renders while it plays.
 */
export function PrintBar({ replayKey, top, onChange }: { replayKey: string; top: number; onChange: (t: number) => void }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const tRef = useRef(t);
  tRef.current = t;

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
      const next = Math.min(1, tRef.current + (now - last) / 1000 / PRINT_SECONDS);
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

  const layer = Math.floor(BASE + t * (top + 1 - BASE));
  const status = t >= 1 ? "Printed" : `Layer ${toMeters(layer).toFixed(2)} m`;

  return (
    <div className={glassCardClass + " pointer-events-auto flex w-[30rem] max-w-full items-center gap-3 px-3.5 py-3"}>
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
      <span className={valueClass + " w-[7.5rem] shrink-0 text-right"}>{status}</span>
    </div>
  );
}
