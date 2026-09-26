import { useEffect, useRef, useState } from "react";
import { MESH_METHODS, MESH_STEPS } from "./types";
import type { MeshGenParams } from "./types";

export function MeshGenStepper({
  params,
  onChange,
}: {
  params: MeshGenParams;
  onChange: (patch: Partial<MeshGenParams>) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const progressRef = useRef(params.progress);
  progressRef.current = params.progress;

  const steps = MESH_STEPS[params.method];
  const stepIndex = Math.min(params.step, steps.length - 1);
  const stepDef = steps[stepIndex];
  const isBuild = stepDef.kind === "build";

  useEffect(() => {
    if (!playing || !isBuild) return;
    const id = window.setInterval(() => {
      const next = Math.min(1, progressRef.current + 0.01);
      onChange({ progress: next });
      if (next >= 1) setPlaying(false);
    }, 40);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, isBuild]);

  const goToStep = (index: number) => {
    setPlaying(false);
    onChange({ step: index, progress: steps[index].kind === "build" ? 0 : 1 });
  };


  const navButton = "rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:border-slate-800/50 disabled:bg-slate-800/20 disabled:text-slate-600";

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-400">
        {MESH_METHODS.find((m) => m.id === params.method)?.name} · Step {stepIndex + 1} of {steps.length}
      </h3>
      <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5">
        <div className="text-sm font-semibold text-amber-200">{stepDef.title}</div>
        <p className="mt-1 text-xs text-slate-300">{stepDef.text}</p>
      </div>

      {isBuild && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5 text-xs text-slate-300">
            <span className="flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wide text-slate-400">Built (%)</span>
              <span className="font-mono text-cyan-300">{Math.round(params.progress * 100)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(params.progress * 100)}
              onChange={(event) => {
                setPlaying(false);
                onChange({ progress: Number(event.target.value) / 100 });
              }}
              className="h-1.5 cursor-pointer appearance-none rounded-full bg-slate-700 accent-cyan-400"
            />
          </label>
          <button
            onClick={() => {
              if (!playing && params.progress >= 1) onChange({ progress: 0 });
              setPlaying((prev) => !prev);
            }}
            className="rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700/60"
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          onClick={() => goToStep(stepIndex - 1)}
          disabled={stepIndex === 0}
          className={navButton + " w-[90%] justify-self-start border-slate-700/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/60"}
        >
          Back
        </button>
        <div className="flex items-center justify-center gap-1">
          {steps.map((step, index) => (
            <button
              key={step.title}
              onClick={() => goToStep(index)}
              aria-label={`Go to step ${index + 1}: ${step.title}`}
              className={"h-2 w-2 rounded-full transition-colors " + (index === stepIndex ? "bg-amber-300" : "bg-slate-600 hover:bg-slate-400")}
            />
          ))}
        </div>
        <button
          onClick={() => goToStep(stepIndex + 1)}
          disabled={stepIndex === steps.length - 1}
          className={navButton + " w-[90%] justify-self-end border-cyan-400/50 bg-cyan-500/20 font-semibold text-cyan-200 hover:bg-cyan-500/30"}
        >
          Next
        </button>
      </div>
    </section>
  );
}
