import { useEffect, useState, type ReactNode } from "react";
import { SidePanel } from "../../components/SidePanel";
import type { Life } from "../life/agents";
import { Button, GLASS, Legend, Note, Row, Section, Select, Slider, Switch } from "./kit";
import type { WorldController } from "../state";
import { DEFAULT_PARAMS, PARAM_SPECS, RIVER_VISIBLE, type ParamKey, type ParamSpec, type RangeSpec, type TerrainParams } from "../terrain/params";
import { CLAIM_COLORS } from "../terrain/claims";
import { DISTRICTS } from "../terrain/districts";
import type { Terrain } from "../terrain/pipeline";
import { NoiseIcon, ResetIcon, RiverIcon, ShapingIcon, Spinner, SurfaceIcon, TerraceIcon, TownIcon } from "./icons";
import { TitleBlock } from "./TitleCard";

/**
 * The world's one panel, on the left: the title and seed at the top, then the terrain's settings
 * laid out like the weekly studios (icon sections in pipeline order) and Reset. Sliders apply when
 * released, since the terrain takes a moment to rebuild; selects apply at once.
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
      ["surfaces", "ledgeDrop"],
      ["surfaces", "stairSlope"],
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
  ["Park", CLAIM_COLORS.park],
];

/** Every key Reset restores: the panel's controls plus the hand-placed river points. */
const ALL_KEYS: ParamKey[] = [...SECTIONS.flatMap((s) => s.keys), ["river", "control"]];

/** A setting's name, and a spinner while the rebuild it started runs. */
function SettingLabel({ label, pending }: { label: string; pending: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {pending && <Spinner />}
    </span>
  );
}

/** A slider that applies on release: dragging only moves the number, letting go rebuilds. */
function CommitSlider({ spec, value, fallback, onCommit, pending }: { spec: RangeSpec; value: number; fallback: number; onCommit: (v: number) => void; pending: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <Row label={<SettingLabel label={spec.label} pending={pending} />} description={spec.description} value={(spec.format ?? String)(draft)}>
      <Slider
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={draft}
        defaultValue={fallback}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label={spec.label}
      />
    </Row>
  );
}

type Value = number | string | boolean;

function ParamControl({ spec, value, fallback, onChange, pending }: { spec: ParamSpec; value: Value; fallback: Value; onChange: (v: Value) => void; pending: boolean }) {
  if (spec.kind === "switch")
    return (
      <Row label={<SettingLabel label={spec.label} pending={pending} />} description={spec.description} inline>
        <Switch checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
      </Row>
    );
  if (spec.kind === "select")
    return (
      <>
        <Row label={<SettingLabel label={spec.label} pending={pending} />} description={spec.description}>
          <Select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Row>
        <Note>{spec.options.find((o) => o.value === value)?.summary}</Note>
      </>
    );
  return <CommitSlider spec={spec} value={value as number} fallback={fallback as number} onCommit={onChange} pending={pending} />;
}

const read = (params: TerrainParams, [g, key]: ParamKey) => (params[g] as unknown as Record<string, Value>)[key];
const specOf = ([g, key]: ParamKey) => (PARAM_SPECS[g] as Record<string, ParamSpec>)[key];

export function TerrainPanel({ terrain, life, ctl, open, onToggle, busy }: { terrain: Terrain; life: Life | null; ctl: WorldController; open: boolean; onToggle: () => void; busy: boolean }) {
  const changed = ALL_KEYS.some((k) => read(ctl.state.params, k) !== read(DEFAULT_PARAMS, k));
  // The last setting changed, to put the spinner by it while the city rebuilds.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const { state } = ctl;

  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={16.2} label="settings panel" glass={GLASS} bodyClassName="gap-3.5 p-4">
      <TitleBlock seed={state.seed} onSeed={ctl.setSeed} />
      {SECTIONS.map((section) => (
        <Section key={section.title} icon={section.icon} title={section.title}>
          {/* With the river off, only its on/off switch is shown; while it is hidden, none of it. */}
          {section.keys
            .filter((k) => k[0] !== "river" || (RIVER_VISIBLE && (k[1] === "enabled" || state.params.river.enabled)))
            .map((k) => (
              <ParamControl
                key={k.join(".")}
                spec={specOf(k)}
                value={read(state.params, k)}
                fallback={read(DEFAULT_PARAMS, k)}
                pending={busy && lastKey === k.join(".")}
                onChange={(v) => {
                  setLastKey(k.join("."));
                  ctl.setParam(k[0], { [k[1]]: v });
                }}
              />
            ))}
          {section.title === "Town" && (
            <>
              <Row label="Show network" description="Pin the city center (large, white), dot every junction, draw the streets' center lines and the street tiles they were collapsed on (white squares). Buildable ground is tinted by how well it suits a city center, from violet to amber; unbuildable ground is dark." inline>
                <Switch checked={state.showNetwork} onChange={(e) => ctl.setShowNetwork(e.target.checked)} />
              </Row>
              {state.showNetwork && (
                <Note>
                  {terrain.streets.streets.filter((st) => st.kind === "main").length} main and {terrain.streets.streets.filter((st) => st.kind === "street").length} side street segments, {terrain.streets.junctions.length} junctions.
                </Note>
              )}
              <Row label="Show districts" description="Tint the ground by district: corporate core, commercial, megablocks, industrial and docks, wealthy enclave." inline>
                <Switch checked={state.showDistricts} onChange={(e) => ctl.setShowDistricts(e.target.checked)} />
              </Row>
              {state.showDistricts && <Legend items={DISTRICTS.map((d, i) => [`${d.name} ${Math.round(terrain.districts.shares[i] * 100)}%`, d.color])} />}
              <Row label="Show lots" description="Fill every building lot in its district's color, with a stronger edge." inline>
                <Switch checked={state.showLots} onChange={(e) => ctl.setShowLots(e.target.checked)} />
              </Row>
              {state.showLots && <Note>{terrain.districts.lots.length} lots, each facing a street.</Note>}
              <Row label="Show parks" description="Draw the parks, a layer of their own over the districts: 3 to 6 per city, each kept at least 25 m from the others. No lot goes on a park." inline>
                <Switch checked={state.showParks} onChange={(e) => ctl.setShowParks(e.target.checked)} />
              </Row>
              {state.showParks && <Note>{terrain.districts.parks} parks.</Note>}
              <Row label="Show buildings" description="Stand a building from the library on each lot: picked by district, sized to the lot, entrance to the street. The Landmark stands on the plaza." inline>
                <Switch checked={state.showBuildings} onChange={(e) => ctl.setShowBuildings(e.target.checked)} />
              </Row>
              <Row label="Show life" description="Let the inhabitants out once the city is built. People walk the sidewalks and park paths to whatever they need most (a drink, a bench, company, home), pigeons flock round the plaza and the parks and take off when someone comes close, and cats stalk them. Cars, vans, taxis and buses drive the streets: people wait at the curb for a gap and vehicles stop for them, and going home some take the bus from a shelter or hail a taxi." inline>
                <Switch checked={state.showLife} onChange={(e) => ctl.setShowLife(e.target.checked)} />
              </Row>
              {state.showLife && life && (
                <Note>
                  {life.people.length} people, {life.pigeons.length} pigeons, {life.cats.length} cats; {life.traffic.vehicles.length} vehicles on {life.traffic.routes.length} bus routes ({life.traffic.stops.length} stops).
                </Note>
              )}
              <Row label="Show claims" description="Tint the ground by what owns each column. Later stages only build on free ground." inline>
                <Switch checked={state.showClaims} onChange={(e) => ctl.setShowClaims(e.target.checked)} />
              </Row>
              {state.showClaims && <Legend items={CLAIM_LEGEND} />}
            </>
          )}
          {section.title === "River" && RIVER_VISIBLE && state.params.river.enabled && (
            <>
              <Row label="Show path" description="Draw the control points and the curve over the terrain." inline>
                <Switch checked={state.showPath} onChange={(e) => ctl.setShowPath(e.target.checked)} />
              </Row>
              {state.showPath && <Note>Drag a point to move it.</Note>}
              {state.params.river.control && (
                <Button onClick={() => ctl.setRiverControl(null)}>
                  <ResetIcon className="h-3.5 w-3.5" />
                  Reset path
                </Button>
              )}
            </>
          )}
        </Section>
      ))}

      <Button className="mt-1 disabled:cursor-default disabled:opacity-40" disabled={!changed} onClick={() => ctl.resetParams(ALL_KEYS)}>
        <ResetIcon className="h-3.5 w-3.5" />
        Reset to defaults
      </Button>
    </SidePanel>
  );
}
