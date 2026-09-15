import { useState } from "react";
import { fieldDescriptions, geometryParamsConfig, lightConfig, materialConfig, presetConfig, shapeConfig } from "./config";
import ColorField from "./ColorField";
import Field from "./Field";
import { CubeIcon, DiamondIcon, DiceIcon, DropletIcon, StarIcon, SunIcon } from "./icons";
import ParamRow from "./ParamRow";
import { randomizePatch } from "./randomize";
import Section from "./Section";
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
    <aside className="controls-panel">
      <Section icon={<StarIcon />} title="Presets">
        <select
          className="preset-select"
          value={presetSelection}
          onChange={(e) => {
            const key = e.target.value as PresetKey;
            setPresetSelection(key);
            onChange(presetConfig[key].patch);
          }}
        >
          <option value="" disabled>
            Choose a preset…
          </option>
          {Object.entries(presetConfig).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.emoji} {preset.label}
            </option>
          ))}
        </select>
      </Section>

      <Section icon={<CubeIcon />} title="Geometry">
        <Field label="Shape" description={fieldDescriptions.shape}>
          <select value={state.shape} onChange={(e) => onChange({ shape: e.target.value as ShapeType })}>
            {Object.entries(shapeConfig).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </Field>

        <ColorField
          label="Color"
          description={fieldDescriptions.color}
          value={state.color}
          onChange={(color) => onChange({ color })}
        />

        {isParamShape(state.shape) && (
          <div className="param-section">
            <div className="param-section-header">
              <DiamondIcon />
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
          <select
            value={state.materialType}
            onChange={(e) => onChange({ materialType: e.target.value as MaterialType })}
          >
            {Object.entries(materialConfig).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Wireframe" description={fieldDescriptions.wireframe}>
          <input
            type="checkbox"
            checked={state.wireframe}
            onChange={(e) => onChange({ wireframe: e.target.checked })}
          />
        </Field>

        <p className="field-note">{material.description}</p>

        {showRoughnessMetalness && (
          <>
            <Field
              label="Roughness"
              description={fieldDescriptions.roughness}
              valueLabel={state.roughness.toFixed(2)}
            >
              <input
                type="range"
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
              <input
                type="range"
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
            <input
              type="range"
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
          <select
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
          </select>
        </Field>

        <Field label="Shadows" description={fieldDescriptions.shadowsEnabled}>
          <input
            type="checkbox"
            checked={state.shadowsEnabled}
            onChange={(e) => onChange({ shadowsEnabled: e.target.checked })}
          />
        </Field>

        <p className="field-note">{light.description}</p>

        <Field
          label="Intensity"
          description={fieldDescriptions.lightIntensity}
          valueLabel={state.lightIntensity.toFixed(1)}
        >
          <input
            type="range"
            min={light.min}
            max={light.max}
            step={light.step}
            value={state.lightIntensity}
            onChange={(e) => onChange({ lightIntensity: parseFloat(e.target.value) })}
          />
        </Field>
      </Section>

      <button className="randomize-button" onClick={() => onChange(randomizePatch())}>
        <DiceIcon />
        Randomize
      </button>
    </aside>
  );
}
