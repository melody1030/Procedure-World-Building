import { ColorField, Field, RangeInput, Select, Switch } from "../../components/controls";
import { TECHNIQUES } from "./config";
import { gradientCurve } from "./shader/techniques/gradient";
import type { StudioController } from "./state";

/** A small plot of the gradient's shaping curve: 0 to 1 in, 0 to 1 out. */
function CurvePlot({ curve }: { curve: string }) {
  const points = Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
    return `${(t * 100).toFixed(1)},${(40 - gradientCurve(curve, t) * 36 - 2).toFixed(1)}`;
  }).join(" ");
  return (
    <svg
      viewBox="0 0 100 40"
      className="h-10 w-full rounded-lg border border-slate-700/50 bg-slate-800/40"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Plot of the ${curve} curve`}
    >
      <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Only the selected technique's controls, built from its parameter list. */
export default function TechniqueControls({ studio }: { studio: StudioController }) {
  const { technique } = studio.state;
  const module = TECHNIQUES[technique];
  const params = studio.state.params[technique];
  const set = (key: string, value: number | string | boolean) => studio.setParam(key, value);

  return (
    <>
      {module.params.map((param) => {
        if (param.visibleIf && !param.visibleIf(params)) return null;
        const value = params[param.key];
        switch (param.kind) {
          case "range":
            return (
              <Field key={param.key} label={param.label} description={param.description} valueLabel={Number(value).toFixed(param.decimals)}>
                <RangeInput
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={Number(value)}
                  onChange={(e) => set(param.key, parseFloat(e.target.value))}
                />
              </Field>
            );
          case "select":
            return (
              <div key={param.key} className="flex flex-col gap-2">
                <Field label={param.label} description={param.description}>
                  <Select value={String(value)} onChange={(e) => set(param.key, e.target.value)}>
                    {param.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {technique === "gradient" && param.key === "curve" && <CurvePlot curve={String(value)} />}
              </div>
            );
          case "color":
            return (
              <ColorField key={param.key} label={param.label} description={param.description} value={String(value)} onChange={(hex) => set(param.key, hex)} />
            );
          case "switch":
            return (
              <Field key={param.key} label={param.label} description={param.description} inline>
                <Switch checked={value === true} onChange={(e) => set(param.key, e.target.checked)} />
              </Field>
            );
        }
      })}
    </>
  );
}
