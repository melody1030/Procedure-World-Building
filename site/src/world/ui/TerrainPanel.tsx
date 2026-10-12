import { useEffect, useState, type ReactNode } from "react";
import { SidePanel } from "../../components/SidePanel";
import { Field, FieldNote, PanelButton, RangeInput, Section, Select, Switch } from "../../components/controls";
import type { WorldController } from "../state";
import { DEFAULT_PARAMS, PARAM_SPECS, RIVER_VISIBLE, type ParamKey, type ParamSpec, type RangeSpec, type TerrainParams } from "../terrain/params";
import { CLAIM_COLORS } from "../terrain/claims";
import { DISTRICTS } from "../terrain/districts";
import type { Terrain } from "../terrain/pipeline";
import { GridIcon, NoiseIcon, ResetIcon, RiverIcon, ShapingIcon, SurfaceIcon, TerraceIcon, TownIcon } from "./icons";

/**
 * The terrain's settings, laid out like the weekly studios: icon sections in pipeline order and
 * Reset. Sliders apply when released, since the terrain takes a moment
 * to rebuild; selects apply at once.
 */

const SECTIONS: { title: string; icon: ReactNode; keys: ParamKey[] }[] = [
  {
    title: "Noise",
    icon: <NoiseIcon />,
    keys: [
      ["noise", "type"],
      ["noise", "scale"],
      ["noise", "octaves"],
      ["noise", "persistence"],
      ["noise", "lacunarity"],
    ],
  },
  { title: "Grid", icon: <GridIcon />, keys: [["noise", "resolution"]] },
  { title: "Shaping", icon: <ShapingIcon />, keys: [["shaping", "power"], ["shaping", "ridge"], ["shaping", "height"]] },
  {
    title: "Terraces",
    icon: <TerraceIcon />,
    keys: [
      ["terraces", "strength"],
      ["terraces", "height"],
      ["terraces", "wander"],
      ["terraces", "slope"],
    ],
  },
  {
    title: "River",
    icon: <RiverIcon />,
    keys: [
      ["river", "enabled"],
      ["river", "points"],
      ["river", "width"],
      ["river", "depth"],
      ["river", "valleyWidth"],
      ["river", "valleyShape"],
      ["river", "water"],
    ],
  },
  {
    title: "Surfaces",
    icon: <SurfaceIcon />,
    keys: [
      ["surfaces", "tones"],
      ["surfaces", "rockCliff"],
      ["surfaces", "dirtSlope"],
      ["surfaces", "grassLimit"],
      ["look", "grid"],
    ],
  },
  {
    title: "Town",
    icon: <TownIcon />,
    keys: [],
  },
];
/** The Show claims legend: the claims made so far (lots come with the districts). */
const CLAIM_LEGEND: [string, number][] = [
  ["River", CLAIM_COLORS.river],
  ["Bank", CLAIM_COLORS.bank],
  ["Road", CLAIM_COLORS.road],
  ["Verge", CLAIM_COLORS.verge],
  ["Plaza", CLAIM_COLORS.plaza],
  ["Lot", CLAIM_COLORS.lot],
];

/** Every key Reset restores: the panel's controls plus the hand-placed river points. */
const ALL_KEYS: ParamKey[] = [...SECTIONS.flatMap((s) => s.keys), ["river", "control"]];

/** A slider that applies on release: dragging only moves the number, letting go rebuilds. */
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

type Value = number | string | boolean;

function ParamControl({ spec, value, onChange }: { spec: ParamSpec; value: Value; onChange: (v: Value) => void }) {
  if (spec.kind === "switch")
    return (
      <Field label={spec.label} description={spec.description} inline>
        <Switch checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
      </Field>
    );
  if (spec.kind === "select")
    return (
      <>
        <Field label={spec.label} description={spec.description}>
          <Select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <FieldNote>{spec.options.find((o) => o.value === value)?.summary}</FieldNote>
      </>
    );
  return <CommitSlider spec={spec} value={value as number} onCommit={onChange} />;
}

const read = (params: TerrainParams, [g, key]: ParamKey) => (params[g] as unknown as Record<string, Value>)[key];
const specOf = ([g, key]: ParamKey) => (PARAM_SPECS[g] as Record<string, ParamSpec>)[key];

export function TerrainPanel({ terrain, ctl, open, onToggle }: { terrain: Terrain; ctl: WorldController; open: boolean; onToggle: () => void }) {
  const changed = ALL_KEYS.some((k) => read(terrain.params, k) !== read(DEFAULT_PARAMS, k));

  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={16.2} label="settings panel">
      {SECTIONS.map((section) => (
        <Section key={section.title} icon={section.icon} title={section.title} collapsible defaultOpen={false}>
          {/* With the river off, only its on/off switch is shown; while it is hidden, none of it. */}
          {section.keys
            .filter((k) => k[0] !== "river" || (RIVER_VISIBLE && (k[1] === "enabled" || terrain.params.river.enabled)))
            .map((k) => (
              <ParamControl key={k.join(".")} spec={specOf(k)} value={read(terrain.params, k)} onChange={(v) => ctl.setParam(k[0], { [k[1]]: v })} />
            ))}
          {section.title === "Town" && (
            <>
              <Field label="Show network" description="Pin the city center (large, white), dot every junction, draw the streets' center lines and the street tiles they were collapsed on (white squares). Buildable ground is tinted by how well it suits a city center, from violet to amber; unbuildable ground is dark." inline>
                <Switch checked={ctl.state.showNetwork} onChange={(e) => ctl.setShowNetwork(e.target.checked)} />
              </Field>
              {ctl.state.showNetwork && (
                <FieldNote>
                  {terrain.streets.streets.filter((st) => st.kind === "main").length} main and {terrain.streets.streets.filter((st) => st.kind === "street").length} side street segments, {terrain.streets.junctions.length} junctions.
                </FieldNote>
              )}
              <Field label="Show districts" description="Tint the ground by district: corporate core, neon strip, megablocks, industrial and docks, wealthy enclave, parks." inline>
                <Switch checked={ctl.state.showDistricts} onChange={(e) => ctl.setShowDistricts(e.target.checked)} />
              </Field>
              {ctl.state.showDistricts && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {DISTRICTS.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `#${d.color.toString(16).padStart(6, "0")}` }} />
                      {d.name} {Math.round(terrain.districts.shares[i] * 100)}%
                    </span>
                  ))}
                </div>
              )}
              <Field label="Show lots" description="Outline every building lot in its district's color, with a tick on the side that faces the street." inline>
                <Switch checked={ctl.state.showLots} onChange={(e) => ctl.setShowLots(e.target.checked)} />
              </Field>
              {ctl.state.showLots && <FieldNote>{terrain.districts.lots.length} lots along the streets.</FieldNote>}
              <Field label="Show claims" description="Tint the ground by what owns each column. Later stages only build on free ground." inline>
                <Switch checked={ctl.state.showClaims} onChange={(e) => ctl.setShowClaims(e.target.checked)} />
              </Field>
              {ctl.state.showClaims && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {CLAIM_LEGEND.map(([label, color]) => (
                    <span key={label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `#${color.toString(16).padStart(6, "0")}` }} />
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          {section.title === "River" && RIVER_VISIBLE && terrain.params.river.enabled && (
            <>
              <Field label="Show path" description="Draw the control points and the curve over the terrain." inline>
                <Switch checked={ctl.state.showPath} onChange={(e) => ctl.setShowPath(e.target.checked)} />
              </Field>
              {ctl.state.showPath && <FieldNote>Drag a point to move it.</FieldNote>}
              {terrain.params.river.control && (
                <PanelButton className="flex flex-none items-center justify-center gap-2" onClick={() => ctl.setRiverControl(null)}>
                  <ResetIcon />
                  Reset path
                </PanelButton>
              )}
            </>
          )}
        </Section>
      ))}


      <PanelButton className="flex flex-none items-center justify-center gap-2 disabled:cursor-default disabled:opacity-40" disabled={!changed} onClick={() => ctl.resetParams(ALL_KEYS)}>
        <ResetIcon />
        Reset to defaults
      </PanelButton>
    </SidePanel>
  );
}

