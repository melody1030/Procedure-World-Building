import { useEffect, useState, type ReactNode } from "react";
import { SidePanel } from "../../components/SidePanel";
import type { Life } from "../life/agents";
import { Button, GLASS, Legend, Note, Row, RULE, Section, Segmented, Select, Slider, Subheading, Switch, Tabs } from "./kit";
import type { GroundTint, WorldController } from "../state";
import { DEFAULT_PARAMS, PARAM_SPECS, RIVER_VISIBLE, type ParamKey, type ParamSpec, type RangeSpec, type TerrainParams } from "../terrain/params";
import { CLAIM_COLORS } from "../terrain/claims";
import { DISTRICTS, FRONTAGE_KINDS, frontageKind } from "../terrain/districts";
import type { Terrain } from "../terrain/pipeline";
import { LotsIcon, NoiseIcon, ResetIcon, RiverIcon, ShapingIcon, Spinner, SurfaceIcon, TerraceIcon } from "./icons";
import { TitleBlock } from "./TitleCard";
import { EDGE, HEIGHT_TIERS, HEIGHT_TINT_BOTTOM, HEIGHT_TINT_COLORS, heightTintShare, type Zoning } from "../city/zoning";

/**
 * The world's one panel, on the left: the title and seed at the top, then two tabs. **Build** holds
 * the terrain's settings, laid out like the weekly studios (icon sections in pipeline order, each
 * with a count of its changed settings and its own reset) and Reset all. Sliders apply when
 * released, since the terrain takes a moment to rebuild; selects apply at once. **Layers** holds
 * what only changes the drawing: one ground tint at a time, and the layers drawn on top.
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
    title: "Lots",
    icon: <LotsIcon />,
    keys: [
      ["lots", "unit"],
      ["lots", "avenueWidth"],
      ["lots", "depth"],
      ["lots", "alley"],
      ["lots", "setback"],
      ["lots", "merge"],
      ["lots", "corners"],
    ],
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
/** The panel's tabs; the open one is remembered in this browser. */
type Tab = "build" | "layers";
const TAB_KEY = "world.panelTab";
function savedTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "layers" ? "layers" : "build";
  } catch {
    return "build";
  }
}

/** The ground tints, in the order the segmented control shows them. */
const TINT_OPTIONS: { value: GroundTint; label: string }[] = [
  { value: "none", label: "None" },
  { value: "districts", label: "Districts" },
  { value: "frontage", label: "Frontage" },
  { value: "heights", label: "Height" },
  { value: "claims", label: "Claims" },
  { value: "suitability", label: "Suitability" },
];

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

export function TerrainPanel({ terrain, zoning, life, ctl, open, onToggle, busy }: { terrain: Terrain; zoning: Zoning; life: Life | null; ctl: WorldController; open: boolean; onToggle: () => void; busy: boolean }) {
  const [tab, setTab] = useState<Tab>(savedTab);
  const pickTab = (next: Tab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Private windows may refuse storage; the tab just isn't remembered.
    }
  };

  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={16.2} label="settings panel" glass={GLASS} bodyClassName="gap-3.5 p-4">
      <TitleBlock seed={ctl.state.seed} onSeed={ctl.setSeed} />
      <Tabs
        label="Panel"
        value={tab}
        onChange={pickTab}
        tabs={[
          { id: "build", label: "Build", panel: <BuildTab ctl={ctl} busy={busy} /> },
          { id: "layers", label: "Layers", panel: <LayersTab terrain={terrain} zoning={zoning} life={life} ctl={ctl} /> },
        ]}
      />
    </SidePanel>
  );
}

const changedIn = (params: TerrainParams, keys: ParamKey[]) => keys.filter((k) => read(params, k) !== read(DEFAULT_PARAMS, k)).length;

/** Everything that rebuilds the terrain, section by section. */
function BuildTab({ ctl, busy }: { ctl: WorldController; busy: boolean }) {
  const { state } = ctl;
  const changed = changedIn(state.params, ALL_KEYS) > 0;
  // The last setting changed, to put the spinner by it while the city rebuilds.
  const [lastKey, setLastKey] = useState<string | null>(null);

  return (
    <>
      {SECTIONS.map((section) => {
        const count = changedIn(state.params, section.keys);
        return (
          <Section key={section.title} icon={section.icon} title={section.title} changed={count}>
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
            {section.title === "River" && RIVER_VISIBLE && state.params.river.enabled && (
              <>
                <Row label="Show path" description="Draw the control points and the curve over the terrain. Drag a point to move the river." inline>
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
        );
      })}

      <Button className="mt-1 disabled:cursor-default disabled:opacity-40" disabled={!changed} onClick={() => ctl.resetParams(ALL_KEYS)}>
        <ResetIcon className="h-3.5 w-3.5" />
        Reset all
      </Button>
    </>
  );
}

/** Each frontage kind with its share of the lots. */
function frontageLegend(terrain: Terrain): [string, number][] {
  const { lots } = terrain.districts;
  const counts = FRONTAGE_KINDS.map(() => 0);
  for (const lot of lots) counts[frontageKind(lot)]++;
  return FRONTAGE_KINDS.map((k, i) => [`${k.name} ${lots.length ? Math.round((counts[i] / lots.length) * 100) : 0}%`, k.color]);
}

/** The Height limit tint's legend: the heat bar with the tiers marked, and how many lots the open-edge cap holds down. */
function HeightLegend({ zoning }: { zoning: Zoning }) {
  const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
  const capped = zoning.lots.filter((z) => z.cap === "edge").length;
  const ticks: [number, string][] = [
    [HEIGHT_TINT_BOTTOM, `${HEIGHT_TINT_BOTTOM}`],
    [HEIGHT_TIERS[0], `${HEIGHT_TIERS[0]}`],
    [HEIGHT_TIERS[1], `${HEIGHT_TIERS[1]}`],
    [140, "140 m"],
  ];
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <span className="block h-1.5 rounded-full" style={{ background: `linear-gradient(to right, ${HEIGHT_TINT_COLORS.map(hex).join(", ")})` }} aria-hidden />
        {HEIGHT_TIERS.map((m) => (
          <span key={m} className="absolute -top-0.5 h-2.5 w-px bg-white/70" style={{ left: `${heightTintShare(m) * 100}%` }} aria-hidden />
        ))}
      </div>
      <div className="relative h-3.5">
        {ticks.map(([m, label]) => (
          <span key={m} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${heightTintShare(m) * 100}%` }}>
            <Note>{label}</Note>
          </span>
        ))}
      </div>
      <Note>
        Low-rise under {HEIGHT_TIERS[0]} m, mid-rise to {HEIGHT_TIERS[1]} m, high-rise above. Within {EDGE} m of the river or a park the limit is {zoning.params.edgeCap} m
        {capped ? `: ${capped} of ${zoning.lots.length} lots held down.` : "."}
      </Note>
    </div>
  );
}

/** Everything that only changes what is drawn: one ground tint, then the layers on top. */
function LayersTab({ terrain, zoning, life, ctl }: { terrain: Terrain; zoning: Zoning; life: Life | null; ctl: WorldController }) {
  const { state } = ctl;
  const tint = state.groundTint;
  return (
    <>
      <div className="flex flex-col gap-2.5">
        <Subheading info="Color the ground by one thing at a time. Districts: which kind of neighborhood each column belongs to. Frontage: what each lot faces (an avenue or a side street, or two streets at a corner or through a thin block), its front edge bright. Height: how tall each lot may build, from the zoning map: highest at the plaza, lower out along the streets and stepping down toward the river and the parks. Claims: what owns each column (river, bank, road…); later stages only build on free ground. Suitability: how well each column suits the city center.">
          Ground color
        </Subheading>
        <Segmented label="Ground color" options={TINT_OPTIONS} value={tint} onChange={ctl.setGroundTint} columns={3} />
        {tint === "districts" && <Legend items={DISTRICTS.map((d, i) => [`${d.name} ${Math.round(terrain.districts.shares[i] * 100)}%`, d.color])} />}
        {tint === "frontage" && <Legend items={frontageLegend(terrain)} />}
        {tint === "heights" && <HeightLegend zoning={zoning} />}
        {tint === "claims" && <Legend items={CLAIM_LEGEND} />}
        {tint === "suitability" && (
          <div className="flex flex-col gap-1">
            <span className="h-1.5 rounded-full bg-gradient-to-r from-[#33296b] to-[#ffb82e]" aria-hidden />
            <span className="flex justify-between">
              <Note>Less suited</Note>
              <Note>Best for the center</Note>
            </span>
            <Note>Dark ground can't be built on.</Note>
          </div>
        )}
      </div>

      <div className={"flex flex-col gap-3.5 border-t pt-3.5 " + RULE}>
        <Subheading>Drawn on top</Subheading>
        <Row label="Street network" description="Pin the city center (large, white), dot every junction, and draw the streets' center lines and the street tiles they were collapsed on (white squares)." inline>
          <Switch checked={state.showNetwork} onChange={(e) => ctl.setShowNetwork(e.target.checked)} />
        </Row>
        {state.showNetwork && (
          <Note>
            {terrain.streets.streets.filter((st) => st.kind === "main").length} main and {terrain.streets.streets.filter((st) => st.kind === "street").length} side street segments, {terrain.streets.junctions.length} junctions.
          </Note>
        )}
        <Row label="Lots" description="Fill every building lot in its district's color, with a stronger edge." inline>
          <Switch checked={state.showLots} onChange={(e) => ctl.setShowLots(e.target.checked)} />
        </Row>
        {state.showLots && <Note>{terrain.districts.lots.length} lots, each facing a street.</Note>}
        <Row label="Parks" description="Draw the parks, a layer of their own over the districts: 3 to 6 per city, each kept at least 25 m from the others. No lot goes on a park." inline>
          <Switch checked={state.showParks} onChange={(e) => ctl.setShowParks(e.target.checked)} />
        </Row>
        {state.showParks && <Note>{terrain.districts.parks} parks.</Note>}
        <Row label="Buildings" description="Stand a building from the library on each lot: picked by district, sized to the lot, entrance to the street. The Landmark stands on the plaza." inline>
          <Switch checked={state.showBuildings} onChange={(e) => ctl.setShowBuildings(e.target.checked)} />
        </Row>
        <Row label="Life" description="Let the inhabitants out once the city is built. People walk the sidewalks and park paths to whatever they need most (a drink, a bench, company, home), pigeons flock round the plaza and the parks and take off when someone comes close, and cats stalk them. Cars, vans, taxis and buses drive the streets: people wait at the curb for a gap and vehicles stop for them, and going home some take the bus from a shelter or hail a taxi." inline>
          <Switch checked={state.showLife} onChange={(e) => ctl.setShowLife(e.target.checked)} />
        </Row>
        {state.showLife && life && (
          <Note>
            {life.people.length} people, {life.pigeons.length} pigeons, {life.cats.length} cats; {life.traffic.vehicles.length} vehicles on {life.traffic.routes.length} bus routes ({life.traffic.stops.length} stops).
          </Note>
        )}
      </div>
    </>
  );
}
