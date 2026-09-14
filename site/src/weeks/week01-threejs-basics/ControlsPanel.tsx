import { fieldDescriptions, lightConfig, materialConfig, shapeConfig } from "./config";
import Field from "./Field";
import type { LightType, MaterialType, ShapeType, Week1BasicsState } from "./types";

interface ControlsPanelProps {
  state: Week1BasicsState;
  onChange: (patch: Partial<Week1BasicsState>) => void;
}

export default function ControlsPanel({ state, onChange }: ControlsPanelProps) {
  const material = materialConfig[state.materialType];
  const light = lightConfig[state.lightType];
  const showRoughnessMetalness = state.materialType === "standard" || state.materialType === "physical";
  const showShininess = state.materialType === "phong";

  return (
    <aside className="controls-panel">
      <section>
        <h3>Geometry</h3>

        <Field label="Shape" description={fieldDescriptions.shape}>
          <select value={state.shape} onChange={(e) => onChange({ shape: e.target.value as ShapeType })}>
            {Object.entries(shapeConfig).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Color" description={fieldDescriptions.color}>
          <input type="color" value={state.color} onChange={(e) => onChange({ color: e.target.value })} />
        </Field>
      </section>

      <section>
        <h3>Material</h3>

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
        <p className="field-note">{material.description}</p>

        <Field label="Wireframe" description={fieldDescriptions.wireframe}>
          <input
            type="checkbox"
            checked={state.wireframe}
            onChange={(e) => onChange({ wireframe: e.target.checked })}
          />
        </Field>

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
      </section>

      <section>
        <h3>Lighting</h3>

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

        <Field label="Shadows" description={fieldDescriptions.shadowsEnabled}>
          <input
            type="checkbox"
            checked={state.shadowsEnabled}
            onChange={(e) => onChange({ shadowsEnabled: e.target.checked })}
          />
        </Field>
      </section>
    </aside>
  );
}
