import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GLASS, Segmented } from "./kit";
import { BUILD_PHASES, BUILD_SECONDS } from "../terrain/buildup";

/** Seconds for the whole build: terrain, river, water, plaza, streets and buildings (see PHASE_SECONDS). */
const PRINT_SECONDS = BUILD_SECONDS;
/** Playback speeds offered by the speed control; 1 is PRINT_SECONDS for the whole build. */
const SPEEDS = [
  { value: "0.5", label: "0.5×" },
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
  { value: "4", label: "4×" },
];
/** Each phase's name under the scrubber (the phase's own label is a sentence, for the title). */
const STEP_NAMES: Record<(typeof BUILD_PHASES)[number]["id"], string> = { terrain: "Terrain", river: "River", water: "Water", plaza: "Plaza", streets: "Streets", buildings: "Buildings" };
const startOf = (i: number) => (i === 0 ? 0 : BUILD_PHASES[i - 1].end);
const STEPS = BUILD_PHASES.length;

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
 * The generation timeline at the bottom: the terrain prints layer by layer from the plinth up,
 * then the river carves its channel and fills, the plaza is built and the streets grow from it.
 * It plays by itself when a new seed loads (`replayKey` changes); the slider scrubs it and the
 * button plays or pauses, and the speed control sets the playback speed (it applies at once, even
 * mid-play). Under the scrubber, the phases are named as steps (done, current, to come), each
 * under its stretch of the track; clicking one plays the build from the start of that phase. It owns its own time, so only this bar
 * re-renders while it plays.
 */
export function PrintBar({ replayKey, onChange }: { replayKey: string; onChange: (t: number) => void }) {
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

  // The step names sit under their stretches, which are as long as the phases take. When the bar
  // is too narrow for a name to fit its stretch, the steps give way to one line naming the current
  // step. The steps stay laid out (invisible) so their fit can still be measured.
  const stepsRef = useRef<HTMLOListElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const list = stepsRef.current;
    if (!list) return;
    const check = () => setCompact([...list.querySelectorAll<HTMLElement>("[data-step-name]")].some((n) => n.scrollWidth > n.clientWidth + 0.5));
    check();
    const observer = new ResizeObserver(check);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={"pointer-events-auto flex w-[44rem] max-w-full items-center gap-3 rounded-2xl border px-3 py-2.5 " + GLASS}>
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
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* The scrubber's track is the build's six stages, each as long as its share of the timeline
            (so the thumb moves at a steady pace), with small gaps between them: filled in cyan up
            to now, the current stage's remaining part a shade lighter. The range input lies on top,
            transparent but for its thumb. */}
        <div className="relative flex h-3 min-w-0 items-center">
          <div className="pointer-events-none absolute inset-x-[5px] flex gap-[3px]" aria-hidden>
            {BUILD_PHASES.map((p, i) => {
              const from = startOf(i);
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
            aria-valuetext={t >= 1 ? "Built" : `${BUILD_PHASES[phase].label}, step ${phase + 1} of ${BUILD_PHASES.length}`}
            title={t >= 1 ? "Built" : BUILD_PHASES[phase].label}
            className="world-range relative h-3 w-full min-w-0 cursor-pointer appearance-none bg-transparent"
          />
        </div>
        {/* The phases as steps, each name under its own stretch of the track (same inset, gaps
            and proportions) and starting where the stretch starts. */}
        <div className="relative">
          <ol ref={stepsRef} className={"m-0 flex list-none gap-[3px] px-[5px] py-0 " + (compact ? "invisible absolute inset-x-0 top-0" : "")} aria-label="Build steps" aria-hidden={compact || undefined}>
            {BUILD_PHASES.map((p, i) => {
              const state = i < phase ? "done" : i === phase ? "current" : "todo";
              return (
                <li key={p.id} className="min-w-0" style={{ flexGrow: p.end - startOf(i), flexBasis: 0 }}>
                  <button
                    type="button"
                    tabIndex={compact ? -1 : undefined}
                    onClick={() => {
                      setT(startOf(i));
                      setPlaying(true);
                    }}
                    aria-current={state === "current" ? "step" : undefined}
                    title={`Play from: ${p.label}`}
                    className={
                      "flex w-full min-w-0 rounded text-left text-[10px] leading-none transition-colors " +
                      (state === "current" ? "font-medium text-white" : state === "done" ? "text-[#5ad8ff]/80 hover:text-[#5ad8ff]" : "text-[#6f86a0] hover:text-[#dce8f5]")
                    }
                  >
                    <span data-step-name className="min-w-0 overflow-hidden whitespace-nowrap">
                      {STEP_NAMES[p.id]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {compact && (
            <span className="block truncate px-[5px] text-[10px] leading-none text-white" aria-hidden>
              {t >= 1 ? "Built" : `${STEP_NAMES[BUILD_PHASES[phase].id]} · ${phase + 1}/${STEPS}`}
            </span>
          )}
        </div>
      </div>
      <div className="w-[8rem] shrink-0 max-[560px]:w-[6.75rem]">
        <Segmented label="Playback speed" options={SPEEDS} value={String(speed)} onChange={(v) => setSpeed(Number(v))} />
      </div>
    </div>
  );
}
