import { useState } from "react";
import { SidePanel } from "../../components/SidePanel";
import { ColorField, Field, FieldNote, headingClass, headingIconClass, RangeInput, Section, Select, Switch } from "../../components/controls";
import { fieldDescriptions, geometryParamsConfig, lightConfig, materialConfig, presetConfig, shapeConfig } from "./config";
import { CubeIcon, DiamondIcon, DiceIcon, DropletIcon, StarIcon, SunIcon } from "./icons";
import ParamRow from "./ParamRow";
import { randomizePatch } from "./randomize";
import type { GeometryParams, LightType, MaterialType, ParamShapeType, PresetKey, ShapeType, Week1BasicsState } from "./types";

interface ControlsPanelProps {
  state: Week1BasicsState;
  onChange: (patch: Partial<Week1BasicsState>) => void;
}

const PARAM_SHAPES: readonly ParamShapeType[] = ["box", "sphere", "icosahedron", "torus", "torusKnot", "cone", "cylinder"];

function isParamShape(shape: ShapeType): shape is ParamShapeType {
  return (PARAM_SHAPES as readonly string[]).includes(shape);
}

export default function ControlsPanel({ state, onChange }: ControlsPanelProps) {
  const material = materialConfig[state.materialType];
  const light = lightConfig[state.lightType];
  const showRoughnessMetalness = state.materialType === "standard" || state.materialType === "physical";
  const showShininess = state.materialType === "phong";
  // Shows whichever preset was last chosen, so picking one is reflected in the dropdown
  // instead of silently reverting to the placeholder.
  const [presetSelection, setPresetSelection] = useState("");
  const [open, setOpen] = useState(true);

  const updateGeometryParam = (shape: ParamShapeType, key: string, value: number) => {
    const shapeParams = state.geometryParams[shape] as unknown as Record<string, number>;
    onChange({
      geometryParams: {
        ...state.geometryParams,
        [shape]: { ...shapeParams, [key]: value },
      } as GeometryParams,
    });
  };

  return (
    <SidePanel side="left" open={open} onToggle={() => setOpen((prev) => !prev)} widthRem={16.2} label="settings panel">
      <Section icon={<StarIcon />} title="Presets">
        <Select
          value={presetSelection}
          onChange={(e) => {
            const key = e.target.value as PresetKey;
            setPresetSelection(key);
            onChange(presetConfig[key].patch);
          }}
        >
          <option value="" disabled className="text-slate-500">
            Choose a preset…
          </option>
          {Object.entries(presetConfig).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.emoji} {preset.label}
            </option>
          ))}
        </Select>
      </Section>

      <Section icon={<CubeIcon />} title="Geometry">
        <Field label="Shape" description={fieldDescriptions.shape}>
          <Select value={state.shape} onChange={(e) => onChange({ shape: e.target.value as ShapeType })}>
            {Object.entries(shapeConfig).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </Select>
        </Field>

        <ColorField
          label="Color"
          description={fieldDescriptions.color}
          value={state.color}
          onChange={(color) => onChange({ color })}
        />

        {isParamShape(state.shape) && (
          <div className="flex flex-col gap-3.5 border-t border-slate-700/50 pt-3">
            <div className={headingClass}>
              <DiamondIcon className={headingIconClass} />
              Parameters
            </div>
            {geometryParamsConfig[state.shape].map((def) => {
              const shape = state.shape as ParamShapeType;
              const shapeParams = state.geometryParams[shape] as unknown as Record<string, number>;
              return (
                <ParamRow
                  key={def.key}
                  label={def.label}
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  decimals={def.decimals}
                  value={shapeParams[def.key]}
                  onChange={(value) => updateGeometryParam(shape, def.key, value)}
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section icon={<DropletIcon />} title="Material">
        <Field label="Type" description={fieldDescriptions.materialType}>
          <Select
            value={state.materialType}
            onChange={(e) => onChange({ materialType: e.target.value as MaterialType })}
          >
            {Object.entries(materialConfig).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Wireframe" description={fieldDescriptions.wireframe} inline>
          <Switch
            checked={state.wireframe}
            onChange={(e) => onChange({ wireframe: e.target.checked })}
          />
        </Field>

        <FieldNote>{material.description}</FieldNote>

        {showRoughnessMetalness && (
          <>
            <Field
              label="Roughness"
              description={fieldDescriptions.roughness}
              valueLabel={state.roughness.toFixed(2)}
            >
              <RangeInput
                min={0}
                max={1}
                step={0.05}
                value={state.roughness}
                onChange={(e) => onChange({ roughness: parseFloat(e.target.value) })}
              />
            </Field>

            <Field
              label="Metalness"
              description={fieldDescriptions.metalness}
              valueLabel={state.metalness.toFixed(2)}
            >
              <RangeInput
                min={0}
                max={1}
                step={0.05}
                value={state.metalness}
                onChange={(e) => onChange({ metalness: parseFloat(e.target.value) })}
              />
            </Field>
          </>
        )}

        {showShininess && (
          <Field label="Shininess" description={fieldDescriptions.shininess} valueLabel={String(state.shininess)}>
            <RangeInput
              min={0}
              max={200}
              step={5}
              value={state.shininess}
              onChange={(e) => onChange({ shininess: parseInt(e.target.value, 10) })}
            />
          </Field>
        )}
      </Section>

      <Section icon={<SunIcon />} title="Lighting">
        <Field label="Type" description={fieldDescriptions.lightType}>
          <Select
            value={state.lightType}
            onChange={(e) => {
              const lightType = e.target.value as LightType;
              onChange({ lightType, lightIntensity: lightConfig[lightType].default });
            }}
          >
            {Object.entries(lightConfig).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Shadows" description={fieldDescriptions.shadowsEnabled} inline>
          <Switch
            checked={state.shadowsEnabled}
            onChange={(e) => onChange({ shadowsEnabled: e.target.checked })}
          />
        </Field>

        <FieldNote>{light.description}</FieldNote>

        <Field
          label="Intensity"
          description={fieldDescriptions.lightIntensity}
          valueLabel={state.lightIntensity.toFixed(1)}
        >
          <RangeInput
            min={light.min}
            max={light.max}
            step={light.step}
            value={state.lightIntensity}
            onChange={(e) => onChange({ lightIntensity: parseFloat(e.target.value) })}
          />
        </Field>
      </Section>

      {/* Sticky over the scrolling panel: the offset is measured inside the panel's 1.25rem padding, so
          -0.75rem rests it 0.5rem above the card edge. The translucent cyan sits on solid slate, and the
          two shadows back the strip above and below it. */}
      <button
        className="sticky -bottom-3 flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cyan-400/60 bg-slate-900 bg-gradient-to-b from-cyan-500/20 to-cyan-500/20 px-3 py-2.5 text-[13px] font-semibold text-cyan-200 shadow-[0_-0.75rem_0.75rem_-0.25rem_rgba(15,23,42,0.95),0_0.75rem_0_0_rgba(15,23,42,0.95)] transition hover:from-cyan-500/30 hover:to-cyan-500/30 active:translate-y-px"
        onClick={() => onChange(randomizePatch())}
      >
        <DiceIcon className="h-4 w-4 shrink-0" />
        Randomize
      </button>
    </SidePanel>
  );
}
