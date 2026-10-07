import { useEffect, useState, type ReactNode } from "react";
import { SidePanel } from "../../components/SidePanel";
import { Field, PanelButton, RangeInput, Section, Select, Switch } from "../../components/controls";
import { DEFAULT_PARAMS, PARAM_SPECS, type ParamKey, type ParamSpec, type RangeSpec, type WorldParams } from "../params";
import type { WorldModel } from "../pipeline";
import { toMetres } from "../scale";
import type { WorldController } from "../state";
import { ErosionIcon, InfoIcon, IslandIcon, NoiseIcon, ResetIcon, StatsIcon, TerraceIcon } from "./icons";

/**
 * The world's settings, laid out like the weekly studios: icon sections, Reset, a Result card and
 * How it works. For now there is one topic, the terrain. Sliders apply when released, since the
 * terrain takes a moment to rebuild.
 */

const SECTIONS: { title: string; icon: ReactNode; keys: ParamKey[] }[] = [
  { title: "Island", icon: <IslandIcon />, keys: [["island", "size"], ["island", "warp"], ["island", "bay"]] },
  { title: "Noise", icon: <NoiseIcon />, keys: [["terrain", "ridges"], ["terrain", "plateau"]] },
  { title: "Erosion", icon: <ErosionIcon />, keys: [["terrain", "erosion"]] },
  { title: "Terraces", icon: <TerraceIcon />, keys: [["terrain", "terraces"], ["terrain", "wander"]] },
];
const ALL_KEYS = SECTIONS.flatMap((s) => s.keys);

const SUMMARY =
  "A radial falloff with a noisy, domain-warped coast makes one island with a bay. fBm, ridged noise and a plateau give it height, Week 2's droplet erosion carves valleys, and the height is cut into terraces one storey tall. The terraced columns are then drawn as voxels, with neighbouring faces merged by greedy meshing.";

const FORMULA = [
  "coast  = size · (0.8 + 0.2 · fBm(angle))",
  "mask   = 1 − smoothstep(coast − 0.3, coast + 0.04, |warp(p)|)",
  "e      = (0.1·mask + inland·(0.22 + 0.28·fBm + ridges·ridged + plateau·high))^1.3",
  "e      → erosion droplets (blurred, deposits × 0.5)",
  "level  = ⌊(e − sea) / (eMax − sea) · terraces + wander · fBm⌋",
].join("\n");

const pct = (v: number) => `${Math.round(v * 100)}%`;
const thousands = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString());

/** "How it works": a short explanation with the core formula behind a toggle, as in the weeks. */
function InfoCard({ summary, formula }: { summary: string; formula: string }) {
  const [showFormula, setShowFormula] = useState(false);
  return (
    <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5">
      <p className="m-0 text-xs leading-snug text-slate-300">{summary}</p>
      <button
        onClick={() => setShowFormula((v) => !v)}
        aria-expanded={showFormula}
        className="mt-2 text-[11px] font-medium text-cyan-300 transition-colors duration-150 hover:text-cyan-200"
      >
        {showFormula ? "Hide formula" : "Show formula"}
      </button>
      {showFormula && <pre className="m-0 mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-cyan-300/80">{formula}</pre>}
    </div>
  );
}

function StatsCard({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 font-mono text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between py-0.5">
          <span className="text-slate-500">{label}</span>
          <span className="tabular-nums text-cyan-300">{value}</span>
        </div>
      ))}
    </div>
  );
}

/** A slider that applies on release: the terrain takes a moment to rebuild, so dragging only moves the number. */
function CommitSlider({ spec, value, onCommit }: { spec: RangeSpec; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <Field label={spec.label} description={spec.description} valueLabel={(spec.format ?? String)(draft)}>
      <RangeInput min={spec.min} max={spec.max} step={spec.step} value={draft} onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </Field>
  );
}

function ParamControl({ spec, value, onChange }: { spec: ParamSpec; value: number; onChange: (v: number) => void }) {
  if (spec.kind === "select")
    return (
      <Field label={spec.label} description={spec.description}>
        <Select value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {spec.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  return <CommitSlider spec={spec} value={value} onCommit={onChange} />;
}

const read = (params: WorldParams, [g, key]: ParamKey) => (params[g] as unknown as Record<string, number>)[key];
const specOf = ([g, key]: ParamKey) => (PARAM_SPECS[g] as Record<string, ParamSpec>)[key];

export function WorldPanel({ world, ctl, open, onToggle }: { world: WorldModel; ctl: WorldController; open: boolean; onToggle: () => void }) {
  const changed = ALL_KEYS.some((k) => read(world.params, k) !== read(DEFAULT_PARAMS, k));
  const ms = world.timings.filter((t) => !t.cached).reduce((sum, t) => sum + t.ms, 0);
  const { terrain, voxels } = world;

  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={16.2} label="settings panel">
      {SECTIONS.map((section) => (
        <Section key={section.title} icon={section.icon} title={section.title}>
          {section.keys.map((k) => (
            <ParamControl key={k.join(".")} spec={specOf(k)} value={read(world.params, k)} onChange={(v) => ctl.setParam(k[0], { [k[1]]: v })} />
          ))}
          {section.title === "Terraces" && (
            <Field label="Colour by level" description="Colours each terrace from the shore (dark) to the top (bright)." inline>
              <Switch checked={ctl.state.terraces} onChange={(e) => ctl.setTerraces(e.target.checked)} />
            </Field>
          )}
        </Section>
      ))}

      <PanelButton className="flex flex-none items-center justify-center gap-2 disabled:cursor-default disabled:opacity-40" disabled={!changed} onClick={() => ctl.resetParams(ALL_KEYS)}>
        <ResetIcon />
        Reset to defaults
      </PanelButton>

      <Section icon={<StatsIcon />} title="Result">
        <StatsCard
          rows={[
            ["Terraces", terrain.levels],
            ["Land", pct(terrain.landShare)],
            ["Highest ground", `${toMetres(terrain.maxHeight)} m`],
            ["Faces drawn", thousands(voxels.mergedFaces)],
            ["Last rebuild", `${Math.round(ms)} ms`],
          ]}
        />
      </Section>

      <Section icon={<InfoIcon />} title="How it works">
        <InfoCard summary={SUMMARY} formula={FORMULA} />
      </Section>
    </SidePanel>
  );
}
