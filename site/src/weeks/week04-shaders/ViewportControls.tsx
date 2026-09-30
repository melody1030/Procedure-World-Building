import { useState } from "react";
import type { ReactNode } from "react";
import { Field, RangeInput, glassCardClass } from "../../components/controls";
import { viewportDescriptions } from "./config";
import { FrameIcon, SunIcon } from "./icons";
import type { StudioController } from "./state";

function RoundButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={
        "flex h-10 w-10 items-center justify-center rounded-full border shadow-lg shadow-black/30 backdrop-blur-md transition-colors duration-150 " +
        (active
          ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30"
          : "border-slate-700/50 bg-slate-900/70 text-slate-300 hover:text-cyan-300")
      }
    >
      {children}
    </button>
  );
}

/** Round buttons in the stage's top-right corner, with a small card for the light. */
export default function ViewportControls({ studio, onFrame }: { studio: StudioController; onFrame: () => void }) {
  const [lightOpen, setLightOpen] = useState(false);
  const { viewport } = studio.state;

  return (
    <div className="pointer-events-none absolute right-4 top-4 flex items-start gap-3">
      <div className="flex w-[13.5rem] flex-col gap-3">
        {lightOpen && (
          <div className={glassCardClass + " pointer-events-auto flex flex-col gap-3.5 p-4"}>
            <Field label="Light direction" description={viewportDescriptions.lightAzimuth} valueLabel={`${viewport.lightAzimuth.toFixed(0)}°`}>
              <RangeInput
                min={0}
                max={360}
                step={1}
                value={viewport.lightAzimuth}
                onChange={(e) =>
                  studio.setViewport({
                    lightAzimuth: parseFloat(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Light height" description={viewportDescriptions.lightElevation} valueLabel={`${viewport.lightElevation.toFixed(0)}°`}>
              <RangeInput
                min={5}
                max={90}
                step={1}
                value={viewport.lightElevation}
                onChange={(e) =>
                  studio.setViewport({
                    lightElevation: parseFloat(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        )}
      </div>
      <div className="pointer-events-auto flex flex-col gap-2">
        <RoundButton label="Frame the scene" onClick={onFrame}>
          <FrameIcon />
        </RoundButton>
        <RoundButton label="Light direction" active={lightOpen} onClick={() => setLightOpen((v) => !v)}>
          <SunIcon />
        </RoundButton>
      </div>
    </div>
  );
}
