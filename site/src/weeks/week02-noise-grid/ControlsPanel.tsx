import { useState } from "react";
import type { CameraPreset, Week1State, NoiseType, ShapingType, ViewMode } from "./types";
import { noiseConfig, viewModeConfig, cameraPresetConfig, fieldDescriptions } from "./config";
import { shapingConfig } from "./shaping";
import Field from "./Field";

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
          <section>
            <h3>Noise</h3>

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

            <Field label="Scale" description={fieldDescriptions.scale} valueLabel={state.scale.toFixed(1)}>
              <input
                type="range"
                min={0.5}
                max={10}
                step={0.1}
                value={state.scale}
                onChange={(e) => onChange({ scale: parseFloat(e.target.value) })}
              />
            </Field>

            <Field label="Octaves" description={fieldDescriptions.octaves} valueLabel={String(state.octaves)}>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={state.octaves}
                onChange={(e) => onChange({ octaves: parseInt(e.target.value, 10) })}
              />
            </Field>

            <Field
              label="Persistence"
              description={fieldDescriptions.persistence}
              valueLabel={state.persistence.toFixed(2)}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={state.persistence}
                onChange={(e) => onChange({ persistence: parseFloat(e.target.value) })}
              />
            </Field>

            <Field label="Seed" description={fieldDescriptions.seed} valueLabel={String(state.seed)}>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={state.seed}
                onChange={(e) => onChange({ seed: parseInt(e.target.value, 10) })}
              />
            </Field>
          </section>

          <section>
            <h3>Grid</h3>
            <Field
              label="Resolution"
              description={fieldDescriptions.resolution}
              valueLabel={`${state.resolution}×${state.resolution}`}
            >
              <input
                type="range"
                min={4}
                max={100}
                step={1}
                value={state.resolution}
                onChange={(e) => onChange({ resolution: parseInt(e.target.value, 10) })}
              />
            </Field>
          </section>

          <section>
            <h3>Shaping</h3>
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
              <Field
                label={shaping.amountLabel}
                description={shaping.description}
                valueLabel={state.amount.toFixed(2)}
              >
                <input
                  type="range"
                  min={shaping.min}
                  max={shaping.max}
                  step={shaping.step}
                  value={state.amount}
                  onChange={(e) => onChange({ amount: parseFloat(e.target.value) })}
                />
              </Field>
            )}
          </section>
        </>
      )}

      {activeTab === "camera" && (
        <>
          <section>
            <h3>Display</h3>
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
          </section>

          <section>
            <h3>Camera</h3>
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
          </section>
        </>
      )}
    </aside>
  );
}
