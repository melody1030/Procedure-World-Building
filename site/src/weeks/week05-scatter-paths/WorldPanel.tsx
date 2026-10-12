import { useState } from "react";
import { SidePanel } from "../../components/SidePanel";
import { Field, FieldNote, PanelButton, RangeInput, Section, Select, Switch } from "../../components/controls";
import { LAYERS, LAYER_IDS, METHODS, PARTICLE_FORMULA, PARTICLE_MODES, PATHS_FORMULA, RULES_FORMULA, descriptions } from "./config";
import {
  InfluenceIcon,
  InfoIcon,
  LayersIcon,
  ParticlesIcon,
  PathIcon,
  ResetIcon,
  RiverIcon,
  RoadIcon,
  RulesIcon,
  ScatterIcon,
  StatsIcon,
  VariationIcon,
  WindIcon,
} from "./icons";
import type { LayerResult } from "./scatter";
import type { Week05Controller } from "./state";
import type { LayerId, ParticleMode, ScatterMethod } from "./types";

type PanelTab = "scatter" | "paths" | "particles";

const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "scatter", label: "Scatter" },
  { id: "paths", label: "Paths" },
  { id: "particles", label: "Particles" },
];

interface SliderProps {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function Slider({ label, description, value, min, max, step, decimals = 2, unit = "", onChange }: SliderProps) {
  return (
    <Field label={label} description={description} valueLabel={value.toFixed(decimals) + unit}>
      <RangeInput min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </Field>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Field label={label} description={description} inline>
      <Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </Field>
  );
}

/** "How it works": a short explanation with the core formula behind a toggle (as in Week 4). */
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

function StatsCard({ result }: { result: LayerResult }) {
  const rows: [string, number][] = [
    ["Candidates", result.candidates],
    ["Placed", result.instances.length],
    ["Outside patches", result.rejected.patch],
    ["Too close to a path", result.rejected.path],
    ["Wrong slope", result.rejected.slope],
    ["Wrong height", result.rejected.height],
  ];
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

function ScatterTab({ studio, scatter }: { studio: Week05Controller; scatter: Record<LayerId, LayerResult> }) {
  const { layer: id } = studio.state;
  const layer = studio.state.layers[id];
  const set = studio.setLayer;

  return (
    <>
      <Section icon={<LayersIcon />} title="Layer">
        <Field label="Asset" description={descriptions.layer}>
          <Select value={id} onChange={(e) => studio.selectLayer(e.target.value as LayerId)}>
            {LAYER_IDS.map((layerId) => (
              <option key={layerId} value={layerId}>
                {LAYERS[layerId].name}
              </option>
            ))}
          </Select>
        </Field>
        <FieldNote>{LAYERS[id].summary}</FieldNote>
        <Toggle label="Show layer" description={descriptions.enabled} checked={layer.enabled} onChange={(enabled) => set({ enabled })} />
      </Section>

      <Section icon={<ScatterIcon />} title="Distribution">
        <Field label="Method" description={descriptions.method}>
          <Select value={layer.method} onChange={(e) => set({ method: e.target.value as ScatterMethod })}>
            {(Object.keys(METHODS) as ScatterMethod[]).map((method) => (
              <option key={method} value={method}>
                {METHODS[method].label}
              </option>
            ))}
          </Select>
        </Field>
        {layer.method === "poisson" ? (
          <Slider label="Spacing" description={descriptions.spacing} value={layer.spacing} min={0.3} max={6} step={0.1} decimals={1} onChange={(spacing) => set({ spacing })} />
        ) : (
          <Slider label="Density" description={descriptions.density} value={layer.density} min={0} max={1} step={0.01} onChange={(density) => set({ density })} />
        )}
        {layer.method === "noise" && (
          <>
            <Slider label="Patch size" description={descriptions.patchSize} value={layer.patchSize} min={0.3} max={3} step={0.05} onChange={(patchSize) => set({ patchSize })} />
            <Slider label="Patch cover" description={descriptions.patchCover} value={layer.patchCover} min={0.05} max={0.95} step={0.01} onChange={(patchCover) => set({ patchCover })} />
          </>
        )}
      </Section>

      <Section icon={<RulesIcon />} title="Rules">
        <Slider
          label="Lowest height"
          description={descriptions.height}
          value={layer.heightMin}
          min={0}
          max={1}
          step={0.01}
          onChange={(heightMin) => set({ heightMin, heightMax: Math.max(heightMin, layer.heightMax) })}
        />
        <Slider
          label="Highest height"
          description={descriptions.height}
          value={layer.heightMax}
          min={0}
          max={1}
          step={0.01}
          onChange={(heightMax) => set({ heightMax, heightMin: Math.min(heightMax, layer.heightMin) })}
        />
        <Slider
          label="Min slope"
          description={descriptions.slope}
          value={layer.slopeMin}
          min={0}
          max={90}
          step={1}
          decimals={0}
          unit="°"
          onChange={(slopeMin) => set({ slopeMin, slopeMax: Math.max(slopeMin, layer.slopeMax) })}
        />
        <Slider
          label="Max slope"
          description={descriptions.slope}
          value={layer.slopeMax}
          min={0}
          max={90}
          step={1}
          decimals={0}
          unit="°"
          onChange={(slopeMax) => set({ slopeMax, slopeMin: Math.min(slopeMax, layer.slopeMin) })}
        />
        <Toggle label="Avoid paths" description={descriptions.avoidPaths} checked={layer.avoidPaths} onChange={(avoidPaths) => set({ avoidPaths })} />
        <FieldNote>Set the terrain colour to Layer mask (top right) to see where these rules allow this layer.</FieldNote>
      </Section>

      <Section icon={<VariationIcon />} title="Variation">
        <Slider label="Align to surface" description={descriptions.align} value={layer.align} min={0} max={1} step={0.01} onChange={(align) => set({ align })} />
        <Slider label="Size" description={descriptions.size} value={layer.size} min={0.3} max={2.5} step={0.05} onChange={(size) => set({ size })} />
        <Slider label="Size variation" description={descriptions.sizeVariation} value={layer.sizeVariation} min={0} max={0.9} step={0.01} onChange={(sizeVariation) => set({ sizeVariation })} />
        {id !== "windmills" && <Toggle label="Tint from terrain" description={descriptions.terrainTint} checked={layer.terrainTint} onChange={(terrainTint) => set({ terrainTint })} />}
        <PanelButton className="flex flex-none items-center justify-center gap-2" onClick={studio.resetLayer}>
          <ResetIcon className="h-4 w-4 shrink-0" />
          Reset layer
        </PanelButton>
      </Section>

      <Section icon={<StatsIcon />} title="Result">
        <StatsCard result={scatter[id]} />
      </Section>

      <Section icon={<InfoIcon />} title="How it works">
        <InfoCard summary={METHODS[layer.method].summary} formula={METHODS[layer.method].formula + "\n\n" + RULES_FORMULA} />
      </Section>
    </>
  );
}

function PathsTab({ studio }: { studio: Week05Controller }) {
  const paths = studio.state.paths;
  const set = studio.setPaths;

  return (
    <>
      <Section icon={<PathIcon />} title="Splines">
        <Toggle label="Road" description={descriptions.road} checked={paths.road} onChange={(road) => set({ road })} />
        <Toggle label="River" description={descriptions.river} checked={paths.river} onChange={(river) => set({ river })} />
        <Slider label="Wander" description={descriptions.wander} value={paths.wander} min={0} max={1} step={0.01} onChange={(wander) => set({ wander })} />
      </Section>

      {paths.road && (
        <Section icon={<RoadIcon />} title="Road">
          <Slider label="Width" description={descriptions.roadWidth} value={paths.roadWidth} min={0.3} max={2.5} step={0.05} onChange={(roadWidth) => set({ roadWidth })} />
          <Slider label="Lamp spacing" description={descriptions.lampSpacing} value={paths.lampSpacing} min={0} max={6} step={0.1} decimals={1} onChange={(lampSpacing) => set({ lampSpacing })} />
          <FieldNote>Set the spacing to 0 to remove the lamps.</FieldNote>
        </Section>
      )}

      {paths.river && (
        <Section icon={<RiverIcon />} title="River">
          <Slider label="Width" description={descriptions.riverWidth} value={paths.riverWidth} min={0.4} max={3} step={0.05} onChange={(riverWidth) => set({ riverWidth })} />
          <Slider label="Depth" description={descriptions.riverDepth} value={paths.riverDepth} min={0.1} max={1.5} step={0.05} onChange={(riverDepth) => set({ riverDepth })} />
        </Section>
      )}

      <Section icon={<InfluenceIcon />} title="Influence">
        <Toggle label="Deform terrain" description={descriptions.deform} checked={paths.deform} onChange={(deform) => set({ deform })} />
        <Slider label="Embankment" description={descriptions.falloff} value={paths.falloff} min={0.1} max={4} step={0.05} onChange={(falloff) => set({ falloff })} />
        <Slider label="Scatter clearance" description={descriptions.clearance} value={paths.clearance} min={0} max={2} step={0.05} onChange={(clearance) => set({ clearance })} />
      </Section>

      <Section icon={<InfoIcon />} title="How it works">
        <InfoCard
          summary="The river's control points look for the lowest ground, the road's for the most level ground (mesh → spline). Turn on Deform terrain and the curves flatten a road bed and carve a channel (spline → mesh). The same distance field keeps scatter off the paths and places the lamps (spline → scatter)."
          formula={PATHS_FORMULA}
        />
      </Section>
    </>
  );
}

function ParticlesTab({ studio }: { studio: Week05Controller }) {
  const particles = studio.state.particles;
  const set = studio.setParticles;
  const on = particles.mode !== "off";

  return (
    <>
      <Section icon={<ParticlesIcon />} title="Particles">
        <Field label="Mode" description={descriptions.particleMode}>
          <Select value={particles.mode} onChange={(e) => set({ mode: e.target.value as ParticleMode })}>
            {(Object.keys(PARTICLE_MODES) as ParticleMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {PARTICLE_MODES[mode].label}
              </option>
            ))}
          </Select>
        </Field>
        <FieldNote>{PARTICLE_MODES[particles.mode].summary}</FieldNote>
        {on && (
          <>
            <Slider label="Count" description={descriptions.count} value={particles.count} min={100} max={6000} step={100} decimals={0} onChange={(count) => set({ count })} />
            <Toggle label="Trails" description={descriptions.trails} checked={particles.trails} onChange={(trails) => set({ trails })} />
            {particles.trails && (
              <Slider label="Trail length" description={descriptions.trailLength} value={particles.trailLength} min={2} max={16} step={1} decimals={0} onChange={(trailLength) => set({ trailLength })} />
            )}
          </>
        )}
      </Section>

      <Section icon={<WindIcon />} title="Vector field">
        <Slider label="Wind direction" description={descriptions.windDirection} value={particles.windDirection} min={0} max={360} step={1} decimals={0} unit="°" onChange={(windDirection) => set({ windDirection })} />
        <Slider label="Wind strength" description={descriptions.windStrength} value={particles.windStrength} min={0} max={3} step={0.05} onChange={(windStrength) => set({ windStrength })} />
        <Slider label="Swirl" description={descriptions.swirl} value={particles.swirl} min={0} max={3} step={0.05} onChange={(swirl) => set({ swirl })} />
        <Slider label="Swirl size" description={descriptions.fieldScale} value={particles.fieldScale} min={0.3} max={3} step={0.05} onChange={(fieldScale) => set({ fieldScale })} />
        <Toggle label="Show field" description={descriptions.showField} checked={particles.showField} onChange={(showField) => set({ showField })} />
      </Section>

      <Section icon={<InfoIcon />} title="How it works">
        <InfoCard
          summary="A vector field gives a direction at every point in space. Here it is a base wind plus the curl of a noise field, which swirls without piling particles up. Each particle reads the field where it is, updates its velocity, then moves."
          formula={PARTICLE_FORMULA}
        />
      </Section>
    </>
  );
}

interface WorldPanelProps {
  studio: Week05Controller;
  scatter: Record<LayerId, LayerResult>;
  open: boolean;
  onToggle: () => void;
}

/** The left panel: one tab per part of the lecture (distributions, paths, vector fields). */
export default function WorldPanel({ studio, scatter, open, onToggle }: WorldPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("scatter");

  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={16.2} label="settings panel">
      {/* Sticky segmented tabs, as in Week 2; the negative margins cancel the panel's padding. */}
      <nav className="sticky -top-5 z-20 -mx-5 -mt-5 grid grid-cols-3 gap-2 bg-slate-900/95 px-5 pb-2 pt-5">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={
              "cursor-pointer rounded-xl border px-1 py-2 text-xs transition-colors " +
              (tab.id === activeTab
                ? "border-cyan-400/60 bg-cyan-500/20 font-semibold text-cyan-200"
                : "border-slate-700/50 bg-slate-800/50 font-medium text-slate-400 hover:bg-slate-700/60 hover:text-slate-200")
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "scatter" && <ScatterTab studio={studio} scatter={scatter} />}
      {activeTab === "paths" && <PathsTab studio={studio} />}
      {activeTab === "particles" && <ParticlesTab studio={studio} />}
    </SidePanel>
  );
}
