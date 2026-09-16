import { useState } from "react";
import type { CameraPreset, Week1State, NoiseType, ShapingType, ViewMode } from "./types";
import type { ErosionParams } from "./erosion";
import { noiseConfig, viewModeConfig, cameraPresetConfig, fieldDescriptions } from "./config";
import { shapingConfig } from "./shaping";
import Field from "./Field";
import Section from "./Section";
import { CameraIcon, DropletIcon, GridIcon, MonitorIcon, ShapingIcon, WaveformIcon } from "./icons";

interface ControlsPanelProps {
  state: Week1State;
  onChange: (patch: Partial<Week1State>) => void;
  onResetCamera: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
}

type PanelTab = "noise" | "camera";

const PANEL_TABS: Array<{ id: PanelTab; label: string }> = [
  { id: "noise", label: "Noise" },
  { id: "camera", label: "View" },
];

export default function ControlsPanel({ state, onChange, onResetCamera, onCameraPreset }: ControlsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("noise");
  const shaping = shapingConfig[state.shapingType];

  const updateErosionParam = <K extends keyof ErosionParams>(key: K, value: ErosionParams[K]) => {
    onChange({ erosionParams: { ...state.erosionParams, [key]: value } });
  };

  return (
    <aside className="controls-panel">
      <nav className="panel-tabs">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? "panel-tab active" : "panel-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "noise" && (
        <>
          <Section icon={<WaveformIcon />} title="Noise">
            <Field label="Type" description={fieldDescriptions.noiseType}>
              <select
                value={state.noiseType}
                onChange={(e) => onChange({ noiseType: e.target.value as NoiseType })}
              >
                {Object.entries(noiseConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="field-note">{noiseConfig[state.noiseType].description}</p>

            <Field label="Scale" description={fieldDescriptions.scale}>
              <div className="param-control">
                <input
                  type="range"
                  min={0.5}
                  max={10}
                  step={0.1}
                  value={state.scale}
                  onChange={(e) => onChange({ scale: parseFloat(e.target.value) })}
                />
                <span className="param-value">{state.scale.toFixed(1)}</span>
              </div>
            </Field>

            <Field label="Octaves" description={fieldDescriptions.octaves}>
              <div className="param-control">
                <input
                  type="range"
                  min={1}
                  max={6}
                  step={1}
                  value={state.octaves}
                  onChange={(e) => onChange({ octaves: parseInt(e.target.value, 10) })}
                />
                <span className="param-value">{state.octaves}</span>
              </div>
            </Field>

            <Field label="Persistence" description={fieldDescriptions.persistence}>
              <div className="param-control">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.persistence}
                  onChange={(e) => onChange({ persistence: parseFloat(e.target.value) })}
                />
                <span className="param-value">{state.persistence.toFixed(2)}</span>
              </div>
            </Field>

            <Field label="Seed" description={fieldDescriptions.seed}>
              <div className="param-control">
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={state.seed}
                  onChange={(e) => onChange({ seed: parseInt(e.target.value, 10) })}
                />
                <span className="param-value">{state.seed}</span>
              </div>
            </Field>
          </Section>

          <Section icon={<GridIcon />} title="Grid">
            <Field label="Resolution" description={fieldDescriptions.resolution}>
              <div className="param-control">
                <input
                  type="range"
                  min={4}
                  max={250}
                  step={1}
                  value={state.resolution}
                  onChange={(e) => onChange({ resolution: parseInt(e.target.value, 10) })}
                />
                <span className="param-value">{state.resolution}</span>
              </div>
            </Field>
          </Section>

          <Section icon={<ShapingIcon />} title="Shaping">
            <Field label="Operation" description={fieldDescriptions.shapingType}>
              <select
                value={state.shapingType}
                onChange={(e) => {
                  const shapingType = e.target.value as ShapingType;
                  onChange({ shapingType, amount: shapingConfig[shapingType].default });
                }}
              >
                {Object.entries(shapingConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="field-note">{shaping.description}</p>

            {state.shapingType !== "none" && (
              <Field label={shaping.amountLabel} description={shaping.description}>
                <div className="param-control">
                  <input
                    type="range"
                    min={shaping.min}
                    max={shaping.max}
                    step={shaping.step}
                    value={state.amount}
                    onChange={(e) => onChange({ amount: parseFloat(e.target.value) })}
                  />
                  <span className="param-value">{state.amount.toFixed(2)}</span>
                </div>
              </Field>
            )}
          </Section>
        </>
      )}

      {activeTab === "camera" && (
        <>
          <Section icon={<MonitorIcon />} title="Display">
            <Field label="View" description={fieldDescriptions.viewMode}>
              <select
                value={state.viewMode}
                onChange={(e) => onChange({ viewMode: e.target.value as ViewMode })}
              >
                {Object.entries(viewModeConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="field-note">{viewModeConfig[state.viewMode].description}</p>
          </Section>

          <Section icon={<DropletIcon />} title="Erosion" defaultExpanded={false}>
            <Field label="Inertia" description={fieldDescriptions.inertia}>
              <div className="param-control">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.erosionParams.inertia}
                  onChange={(e) => updateErosionParam("inertia", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.inertia.toFixed(2)}</span>
              </div>
            </Field>

            <Field label="Capacity Factor" description={fieldDescriptions.capacityFactor}>
              <div className="param-control">
                <input
                  type="range"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={state.erosionParams.capacityFactor}
                  onChange={(e) => updateErosionParam("capacityFactor", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.capacityFactor.toFixed(1)}</span>
              </div>
            </Field>

            <Field label="Min Capacity" description={fieldDescriptions.minSedimentCapacity}>
              <div className="param-control">
                <input
                  type="range"
                  min={0}
                  max={0.1}
                  step={0.005}
                  value={state.erosionParams.minSedimentCapacity}
                  onChange={(e) => updateErosionParam("minSedimentCapacity", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.minSedimentCapacity.toFixed(3)}</span>
              </div>
            </Field>

            <Field label="Erode Speed" description={fieldDescriptions.erodeSpeed}>
              <div className="param-control">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.erosionParams.erodeSpeed}
                  onChange={(e) => updateErosionParam("erodeSpeed", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.erodeSpeed.toFixed(2)}</span>
              </div>
            </Field>

            <Field label="Deposit Speed" description={fieldDescriptions.depositSpeed}>
              <div className="param-control">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.erosionParams.depositSpeed}
                  onChange={(e) => updateErosionParam("depositSpeed", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.depositSpeed.toFixed(2)}</span>
              </div>
            </Field>

            <Field label="Evaporate Speed" description={fieldDescriptions.evaporateSpeed}>
              <div className="param-control">
                <input
                  type="range"
                  min={0}
                  max={0.1}
                  step={0.005}
                  value={state.erosionParams.evaporateSpeed}
                  onChange={(e) => updateErosionParam("evaporateSpeed", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.evaporateSpeed.toFixed(3)}</span>
              </div>
            </Field>

            <Field label="Gravity" description={fieldDescriptions.gravity}>
              <div className="param-control">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={state.erosionParams.gravity}
                  onChange={(e) => updateErosionParam("gravity", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.gravity.toFixed(1)}</span>
              </div>
            </Field>

            <Field label="Max Lifetime" description={fieldDescriptions.maxLifetime}>
              <div className="param-control">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={state.erosionParams.maxLifetime}
                  onChange={(e) => updateErosionParam("maxLifetime", parseInt(e.target.value, 10))}
                />
                <span className="param-value">{state.erosionParams.maxLifetime}</span>
              </div>
            </Field>

            <Field label="Initial Water" description={fieldDescriptions.initialWater}>
              <div className="param-control">
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={state.erosionParams.initialWater}
                  onChange={(e) => updateErosionParam("initialWater", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.initialWater.toFixed(1)}</span>
              </div>
            </Field>

            <Field label="Initial Speed" description={fieldDescriptions.initialSpeed}>
              <div className="param-control">
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.1}
                  value={state.erosionParams.initialSpeed}
                  onChange={(e) => updateErosionParam("initialSpeed", parseFloat(e.target.value))}
                />
                <span className="param-value">{state.erosionParams.initialSpeed.toFixed(1)}</span>
              </div>
            </Field>

            <Field label="Erosion Radius" description={fieldDescriptions.erosionRadius}>
              <div className="param-control">
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={state.erosionParams.erosionRadius}
                  onChange={(e) => updateErosionParam("erosionRadius", parseInt(e.target.value, 10))}
                />
                <span className="param-value">{state.erosionParams.erosionRadius}</span>
              </div>
            </Field>
          </Section>

          <Section icon={<CameraIcon />} title="Camera">
            <p className="field-note">Drag to orbit, scroll to zoom, right-drag to pan.</p>
            <div className="button-row">
              {Object.entries(cameraPresetConfig).map(([key, cfg]) => (
                <button
                  key={key}
                  className="panel-button"
                  title={cfg.description}
                  onClick={() => onCameraPreset(key as CameraPreset)}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <button className="panel-button panel-button-full" onClick={onResetCamera}>
              Reset Camera
            </button>
          </Section>
        </>
      )}
    </aside>
  );
}
