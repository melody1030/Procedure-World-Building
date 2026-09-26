import { useState } from "react";
import { SidePanel } from "../../components/SidePanel";
import { Field, FieldNote, PanelButton, RangeInput, Section, Select } from "../../components/controls";
import type { CameraPreset, Week1State, NoiseType, ShapingType, ViewMode } from "./types";
import type { ErosionParams } from "./erosion";
import { noiseConfig, viewModeConfig, cameraPresetConfig, fieldDescriptions } from "./config";
import { shapingConfig } from "./shaping";
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
  const [open, setOpen] = useState(true);
  const shaping = shapingConfig[state.shapingType];

  const updateErosionParam = <K extends keyof ErosionParams>(key: K, value: ErosionParams[K]) => {
    onChange({ erosionParams: { ...state.erosionParams, [key]: value } });
  };

  return (
    <SidePanel side="left" open={open} onToggle={() => setOpen((prev) => !prev)} widthRem={16.2} label="settings panel">
      {/* Sticky segmented tabs; the negative margins cancel the side panel's 1.25rem padding so the
          strip spans the card and hides content scrolling underneath. */}
      <nav className="sticky -top-5 z-20 -mx-5 -mt-5 grid grid-cols-2 gap-2 bg-slate-900/95 px-5 pb-2 pt-5">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            className={
              "cursor-pointer rounded-xl border px-3 py-2 text-xs transition-colors " +
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

      {activeTab === "noise" && (
        <>
          <Section icon={<WaveformIcon />} title="Noise">
            <Field label="Type" description={fieldDescriptions.noiseType}>
              <Select
                value={state.noiseType}
                onChange={(e) => onChange({ noiseType: e.target.value as NoiseType })}
              >
                {Object.entries(noiseConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </Select>
            </Field>
            <FieldNote>{noiseConfig[state.noiseType].description}</FieldNote>

            <Field label="Scale" description={fieldDescriptions.scale} valueLabel={state.scale.toFixed(1)}>
              <RangeInput
                min={0.5}
                max={10}
                step={0.1}
                value={state.scale}
                onChange={(e) => onChange({ scale: parseFloat(e.target.value) })}
              />
            </Field>

            <Field label="Octaves" description={fieldDescriptions.octaves} valueLabel={String(state.octaves)}>
              <RangeInput
                min={1}
                max={6}
                step={1}
                value={state.octaves}
                onChange={(e) => onChange({ octaves: parseInt(e.target.value, 10) })}
              />
            </Field>

            <Field label="Persistence" description={fieldDescriptions.persistence} valueLabel={state.persistence.toFixed(2)}>
              <RangeInput
                min={0}
                max={1}
                step={0.05}
                value={state.persistence}
                onChange={(e) => onChange({ persistence: parseFloat(e.target.value) })}
              />
            </Field>

            <Field label="Seed" description={fieldDescriptions.seed} valueLabel={String(state.seed)}>
              <RangeInput
                min={1}
                max={100}
                step={1}
                value={state.seed}
                onChange={(e) => onChange({ seed: parseInt(e.target.value, 10) })}
              />
            </Field>
          </Section>

          <Section icon={<GridIcon />} title="Grid">
            <Field label="Resolution" description={fieldDescriptions.resolution} valueLabel={String(state.resolution)}>
              <RangeInput
                min={4}
                max={250}
                step={1}
                value={state.resolution}
                onChange={(e) => onChange({ resolution: parseInt(e.target.value, 10) })}
              />
            </Field>
          </Section>

          <Section icon={<ShapingIcon />} title="Shaping">
            <Field label="Operation" description={fieldDescriptions.shapingType}>
              <Select
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
              </Select>
            </Field>
            <FieldNote>{shaping.description}</FieldNote>

            {state.shapingType !== "none" && (
              <Field label={shaping.amountLabel} description={shaping.description} valueLabel={state.amount.toFixed(2)}>
                <RangeInput
                  min={shaping.min}
                  max={shaping.max}
                  step={shaping.step}
                  value={state.amount}
                  onChange={(e) => onChange({ amount: parseFloat(e.target.value) })}
                />
              </Field>
            )}
          </Section>
        </>
      )}

      {activeTab === "camera" && (
        <>
          <Section icon={<MonitorIcon />} title="Display">
            <Field label="View" description={fieldDescriptions.viewMode}>
              <Select
                value={state.viewMode}
                onChange={(e) => onChange({ viewMode: e.target.value as ViewMode })}
              >
                {Object.entries(viewModeConfig).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </Select>
            </Field>
            <FieldNote>{viewModeConfig[state.viewMode].description}</FieldNote>
          </Section>

          <Section icon={<DropletIcon />} title="Hydraulic Erosion">
            <Field label="Intensity" description={fieldDescriptions.inertia} valueLabel={state.erosionParams.inertia.toFixed(2)}>
              <RangeInput
                min={0}
                max={1}
                step={0.01}
                value={state.erosionParams.inertia}
                onChange={(e) => updateErosionParam("inertia", parseFloat(e.target.value))}
              />
            </Field>

            <Field label="Erode Speed" description={fieldDescriptions.erodeSpeed} valueLabel={state.erosionParams.erodeSpeed.toFixed(2)}>
              <RangeInput
                min={0}
                max={1}
                step={0.01}
                value={state.erosionParams.erodeSpeed}
                onChange={(e) => updateErosionParam("erodeSpeed", parseFloat(e.target.value))}
              />
            </Field>

            <Field label="Deposit Speed" description={fieldDescriptions.depositSpeed} valueLabel={state.erosionParams.depositSpeed.toFixed(2)}>
              <RangeInput
                min={0}
                max={1}
                step={0.01}
                value={state.erosionParams.depositSpeed}
                onChange={(e) => updateErosionParam("depositSpeed", parseFloat(e.target.value))}
              />
            </Field>

            <Field label="Max Lifetime" description={fieldDescriptions.maxLifetime} valueLabel={String(state.erosionParams.maxLifetime)}>
              <RangeInput
                min={5}
                max={100}
                step={1}
                value={state.erosionParams.maxLifetime}
                onChange={(e) => updateErosionParam("maxLifetime", parseInt(e.target.value, 10))}
              />
            </Field>

            <Field label="Initial Water" description={fieldDescriptions.initialWater} valueLabel={state.erosionParams.initialWater.toFixed(1)}>
              <RangeInput
                min={0.5}
                max={3}
                step={0.1}
                value={state.erosionParams.initialWater}
                onChange={(e) => updateErosionParam("initialWater", parseFloat(e.target.value))}
              />
            </Field>
          </Section>

          <Section icon={<CameraIcon />} title="Camera">
            <FieldNote>Drag to orbit, scroll to zoom, right-drag to pan.</FieldNote>
            <div className="flex gap-2">
              {Object.entries(cameraPresetConfig).map(([key, cfg]) => (
                <PanelButton
                  key={key}
                  title={cfg.description}
                  onClick={() => onCameraPreset(key as CameraPreset)}
                >
                  {cfg.label}
                </PanelButton>
              ))}
            </div>
            <PanelButton className="w-full" onClick={onResetCamera}>
              Reset Camera
            </PanelButton>
          </Section>
        </>
      )}
    </SidePanel>
  );
}
