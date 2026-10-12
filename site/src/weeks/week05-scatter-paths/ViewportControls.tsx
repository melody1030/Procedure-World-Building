import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Field, FieldNote, PanelButton, RangeInput, Select, glassCardClass } from "../../components/controls";
import { randomSeed } from "../../world/rng";
import { TERRAIN_VIEWS, descriptions } from "./config";
import { DiceIcon, FrameIcon, MountainIcon } from "./icons";
import type { Week05Controller } from "./state";
import type { TerrainView } from "./types";

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

/** Seed text box: typing updates the world once the text is not empty. */
function SeedField({ seed, onChange }: { seed: string; onChange: (seed: string) => void }) {
  const [text, setText] = useState(seed);
  useEffect(() => setText(seed), [seed]);
  return (
    <Field label="Seed" description={descriptions.seed}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2 font-mono text-[13px] text-cyan-300 transition-colors hover:border-slate-500 focus:border-cyan-400/50 focus:outline-none"
          value={text}
          spellCheck={false}
          maxLength={24}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) onChange(e.target.value.trim());
          }}
          onBlur={() => setText(seed)}
          aria-label="Seed"
        />
        <PanelButton className="flex h-[38px] w-[38px] flex-none items-center justify-center !px-0" title="New seed" aria-label="New seed" onClick={() => onChange(randomSeed())}>
          <DiceIcon />
        </PanelButton>
      </div>
    </Field>
  );
}

/** Round buttons in the stage's top-right corner, with a small card for the terrain. */
export default function ViewportControls({ studio, onFrame }: { studio: Week05Controller; onFrame: () => void }) {
  const [terrainOpen, setTerrainOpen] = useState(false);
  const { terrain } = studio.state;

  return (
    <div className="pointer-events-none absolute right-4 top-4 flex items-start gap-3">
      <div className="flex w-[13.5rem] flex-col gap-3">
        {terrainOpen && (
          <div className={glassCardClass + " pointer-events-auto flex flex-col gap-3.5 p-4"}>
            <SeedField seed={terrain.seed} onChange={(seed) => studio.setTerrain({ seed })} />
            <Field label="Relief" description={descriptions.relief} valueLabel={terrain.relief.toFixed(2)}>
              <RangeInput min={0.3} max={2} step={0.05} value={terrain.relief} onChange={(e) => studio.setTerrain({ relief: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Hill scale" description={descriptions.scale} valueLabel={terrain.scale.toFixed(2)}>
              <RangeInput min={0.5} max={2.5} step={0.05} value={terrain.scale} onChange={(e) => studio.setTerrain({ scale: parseFloat(e.target.value) })} />
            </Field>
            <Field label="Colour" description={descriptions.view}>
              <Select value={terrain.view} onChange={(e) => studio.setTerrain({ view: e.target.value as TerrainView })}>
                {(Object.keys(TERRAIN_VIEWS) as TerrainView[]).map((view) => (
                  <option key={view} value={view}>
                    {TERRAIN_VIEWS[view].label}
                  </option>
                ))}
              </Select>
            </Field>
            <FieldNote>{TERRAIN_VIEWS[terrain.view].description}</FieldNote>
          </div>
        )}
      </div>
      <div className="pointer-events-auto flex flex-col gap-2">
        <RoundButton label="Frame the scene" onClick={onFrame}>
          <FrameIcon />
        </RoundButton>
        <RoundButton label="Terrain" active={terrainOpen} onClick={() => setTerrainOpen((v) => !v)}>
          <MountainIcon />
        </RoundButton>
      </div>
    </div>
  );
}
