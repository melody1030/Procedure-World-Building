import { useEffect, useState, type ReactNode } from "react";
import { SidePanel } from "../../components/SidePanel";
import { Field, FieldNote, PanelButton, RangeInput, Section, Select, Switch } from "../../components/controls";
import { DEFAULT_PARAMS, PARAM_SPECS, RENDER_SPECS, type ParamKey, type ParamSpec, type RangeSpec, type RenderParams, type WorldParams } from "../params";
import type { WorldModel } from "../pipeline";
import { MOODS, type MoodId } from "../render/effects";
import type { WorldController } from "../state";
import {
  BridgeIcon,
  BuildingIcon,
  CubeIcon,
  DistrictIcon,
  ErosionIcon,
  FogIcon,
  GlowIcon,
  InfoIcon,
  IslandIcon,
  LensIcon,
  MapIcon,
  MoodIcon,
  NoiseIcon,
  PropsIcon,
  RainIcon,
  ResetIcon,
  RoadIcon,
  StatsIcon,
  SunIcon,
  SwatchIcon,
  TerraceIcon,
  TreeIcon,
  WaterIcon,
} from "./icons";

/**
 * The world's settings, laid out like the weekly studios: one tab per course topic, in the order
 * they were taught (Terrain, Voxels, Shader, Paths, Scatter). Each tab has its sections, a Result
 * card and How it works. Generation settings apply when a slider is released and rerun only the
 * stages from the one they belong to; shader settings apply live.
 */

type TabId = "terrain" | "voxels" | "shader" | "paths" | "scatter";

const TABS: { id: TabId; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "voxels", label: "Voxels" },
  { id: "shader", label: "Shader" },
  { id: "paths", label: "Paths" },
  { id: "scatter", label: "Scatter" },
];

interface GenSection {
  title: string;
  icon: ReactNode;
  keys: ParamKey[];
  note?: string;
}

interface GenTab {
  sections: GenSection[];
  result: (w: WorldModel) => [string, string | number][];
  summary: string;
  formula: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const thousands = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString());

const GEN_TABS: Record<Exclude<TabId, "shader">, GenTab> = {
  terrain: {
    sections: [
      { title: "Island", icon: <IslandIcon />, keys: [["island", "size"], ["island", "warp"], ["island", "bay"]] },
      { title: "Noise", icon: <NoiseIcon />, keys: [["terrain", "ridges"], ["terrain", "plateau"]] },
      { title: "Erosion", icon: <ErosionIcon />, keys: [["terrain", "erosion"]] },
      { title: "Terraces", icon: <TerraceIcon />, keys: [["terrain", "terraces"], ["terrain", "wander"]], note: "Turn on Terraces in the bar below to colour each level." },
      { title: "Water", icon: <WaterIcon />, keys: [["water", "river"], ["water", "riverFlow"], ["water", "riverWidth"], ["water", "lakeDepth"], ["water", "lakeSize"]] },
    ],
    result: (w) => [
      ["Terraces", w.terrain.levels],
      ["Land", pct(w.terrain.landShare)],
      ["River", w.water.riverPath.length ? "yes" : "none"],
      ["Waterfalls", w.water.falls],
      ["Lakes", w.water.lakes],
    ],
    summary:
      "A radial falloff with a noisy, domain-warped coast makes one island with a bay. fBm, ridged noise and a plateau give it height, Week 2's droplet erosion carves valleys, and the height is cut into terraces one storey tall. Priority-flood fills pits into lakes, and flow accumulation finds the river, which drops a terrace at each waterfall.",
    formula: [
      "coast  = size · (0.8 + 0.2 · fBm(angle))",
      "mask   = 1 − smoothstep(coast − 0.3, coast + 0.04, |warp(p)|)",
      "e      = (0.1·mask + inland·(0.22 + 0.28·fBm + ridges·ridged + plateau·high))^1.3",
      "e      → erosion droplets (blurred, deposits × 0.5)",
      "level  = ⌊(e − sea) / (eMax − sea) · terraces + wander · fBm⌋",
      "river  = main stem upstream while flow ≥ source",
    ].join("\n"),
  },
  voxels: {
    sections: [
      { title: "Meshing", icon: <CubeIcon />, keys: [["voxels", "greedy"]], note: "Compare the face counts in Result with greedy meshing on and off." },
      { title: "Surface", icon: <SwatchIcon />, keys: [["voxels", "tones"]] },
    ],
    result: (w) => [
      ["Faces before merging", thousands(w.voxels.naiveFaces)],
      ["Faces drawn", thousands(w.voxels.mergedFaces)],
      ["Saved", pct(1 - w.voxels.mergedFaces / Math.max(1, w.voxels.naiveFaces))],
      ["Triangles, whole world", thousands(w.stats.triangles)],
    ],
    summary:
      "Every land column becomes a stack of voxels, 0.5 m each. Only faces that can be seen are kept: the top, and a side wherever the neighbour is lower. Greedy meshing then grows each top face into the largest rectangle with the same height, surface and tone, inside its 32 × 32 chunk.",
    formula: [
      "side face  if  height(neighbour) < height(column)",
      "key        = (height, surface, tone)",
      "rectangle  : grow along x while key matches,",
      "             then along z while the whole row matches",
      "merging stops at chunk borders (32 voxels)",
    ].join("\n"),
  },
  paths: {
    sections: [
      {
        title: "Districts",
        icon: <DistrictIcon />,
        keys: [["districts", "count"], ["districts", "spacing"], ["districts", "terraceCost"]],
        note: "Each district's seed is a node the roads connect. Turn on Districts in the bar below to see the cells.",
      },
      { title: "Roads", icon: <RoadIcon />, keys: [["roads", "climb"], ["roads", "loops"], ["roads", "reuse"], ["roads", "smooth"], ["props", "lampSpacing"]] },
      { title: "Bridges & rail", icon: <BridgeIcon />, keys: [["bridges", "rails"], ["bridges", "skyBridges"]] },
    ],
    result: (w) => [
      ["Districts", w.districts.list.length],
      ["Roads", w.roads.roads.length],
      ["Plazas", w.roads.plazas.length],
      ["Street lights", w.props.counts.posts + w.props.counts.brackets],
      ["Rail lines", w.bridges.rails.length],
      ["Sky bridges", w.bridges.skyBridges],
    ],
    summary:
      "District seeds (Worley cells) are the nodes. A minimum spanning tree decides which to join, plus a few loops where the tree makes a long detour. Each link is routed by A* over the terrain: climbing a terrace is expensive, so roads wind along the levels and ramp up where they must. Lights are placed along each road, and the longest main roads carry the elevated rail.",
    formula: [
      "links  = Prim MST + loops where graph ≥ 1.7 × straight",
      "step   = length · (×2 near a rim) + climb · |Δlevel| + bridge",
      "         × share   on a road already built",
      "path   = A*(2 × 2 cells) → Chaikin × smoothing",
      "ramps  : rise ≤ 1 voxel per 2",
      "plaza  where ≥ 3 roads meet",
    ].join("\n"),
  },
  scatter: {
    sections: [
      {
        title: "Suitability",
        icon: <MapIcon />,
        keys: [["suitability", "room"], ["suitability", "water"], ["suitability", "low"]],
        note: "The density map buildings are scattered by. Turn on Suitability in the bar below to see it.",
      },
      {
        title: "Buildings",
        icon: <BuildingIcon />,
        keys: [["growth", "density"], ["growth", "towers"], ["growth", "scarcity"], ["growth", "stacking"], ["buildings", "windows"], ["buildings", "signs"]],
      },
      { title: "Trees", icon: <TreeIcon />, keys: [["props", "method"], ["props", "trees"], ["props", "groveSize"]] },
      { title: "Props", icon: <PropsIcon />, keys: [["props", "people"], ["props", "cables"], ["props", "piers"]] },
    ],
    result: (w) => [
      ["Lots", w.growth.lots],
      ["Buildings", w.growth.buildings.length],
      ["Towers", w.growth.buildings.filter((b) => b.band === "tall" || b.band === "landmark").length],
      ["Lit windows", thousands(w.buildings.litWindows)],
      ["Trees", w.props.counts.trees],
      ["People", w.props.counts.people],
      ["Piers", w.props.counts.piers],
    ],
    summary:
      "Buildings and props are scattered by rules, like Week 5's layers. Suitability is the density map: room on the terrace, near water, low ground. Lots line the roads and fill in order of value; the fuller a district already is, the taller what comes next (land scarcity). Trees are thrown as candidates, then kept by a noise mask that makes groves.",
    formula: [
      "score  = (w₁·room + w₂·water + w₃·low) / Σw",
      "value  = score · district weight / (1 + toCore / 160)",
      "height ∝ fill^1.3 · value   tower only if fill ≥ scarcity",
      "tree   if hash(x, z) < p(district) · grove(fBm(x / size)) · trees",
      "poisson: reject a candidate closer than 4.5 voxels",
    ].join("\n"),
  },
};

/** "How it works": a short explanation with the core formula behind a toggle, as in the weeks. */
function InfoCard({ summary, formula }: { summary: string; formula: string }) {
  const [showFormula, setShowFormula] = useState(false);
  return (
    <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5">
      <p className="m-0 text-xs leading-snug text-slate-300">{summary}</p>
      <button
        onClick={() => setShowFormula((v) => !v)}
        aria-expanded={showFormula}
        className="mt-2 text-[11px] font-medium text-cyan-300 transition-colors duration-150 hover:text-cyan-200"
      >
        {showFormula ? "Hide formula" : "Show formula"}
      </button>
      {showFormula && <pre className="m-0 mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-cyan-300/80">{formula}</pre>}
    </div>
  );
}

function StatsCard({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2.5 font-mono text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between py-0.5">
          <span className="text-slate-500">{label}</span>
          <span className="tabular-nums text-cyan-300">{value}</span>
        </div>
      ))}
    </div>
  );
}

const rangeLabel = (spec: RangeSpec, v: number) => (spec.format ?? String)(v);

/** A slider that applies on release: the world takes a moment to rebuild, so dragging only moves the number. */
function CommitSlider({ spec, value, onCommit }: { spec: RangeSpec; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <Field label={spec.label} description={spec.description} valueLabel={rangeLabel(spec, draft)}>
      <RangeInput min={spec.min} max={spec.max} step={spec.step} value={draft} onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </Field>
  );
}

function ParamControl({ spec, value, onChange }: { spec: ParamSpec; value: number | boolean | string; onChange: (v: number | boolean | string) => void }) {
  if (spec.kind === "switch")
    return (
      <Field label={spec.label} description={spec.description} inline>
        <Switch checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
      </Field>
    );
  if (spec.kind === "select")
    return (
      <Field label={spec.label} description={spec.description}>
        <Select value={String(value)} onChange={(e) => onChange(spec.options.find((o) => String(o.value) === e.target.value)!.value)}>
          {spec.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  return <CommitSlider spec={spec} value={value as number} onCommit={onChange} />;
}

const read = (params: WorldParams, [g, key]: ParamKey) => (params[g] as unknown as Record<string, number | boolean | string>)[key];
const specOf = ([g, key]: ParamKey) => (PARAM_SPECS[g] as Record<string, ParamSpec>)[key];

function GenerationTab({ tab, world, ctl }: { tab: GenTab; world: WorldModel; ctl: WorldController }) {
  const keys = tab.sections.flatMap((s) => s.keys);
  const changed = keys.some((k) => read(world.params, k) !== read(DEFAULT_PARAMS, k));
  const ms = world.timings.filter((t) => !t.cached).reduce((sum, t) => sum + t.ms, 0);
  return (
    <>
      {tab.sections.map((section) => (
        <Section key={section.title} icon={section.icon} title={section.title}>
          {section.keys.map((k) => (
            <ParamControl key={k.join(".")} spec={specOf(k)} value={read(world.params, k)} onChange={(v) => ctl.setParam(k[0], { [k[1]]: v })} />
          ))}
          {section.note && <FieldNote>{section.note}</FieldNote>}
        </Section>
      ))}
      <PanelButton className="flex flex-none items-center justify-center gap-2 disabled:cursor-default disabled:opacity-40" disabled={!changed} onClick={() => ctl.resetParams(keys)}>
        <ResetIcon />
        Reset to defaults
      </PanelButton>
      <Section icon={<StatsIcon />} title="Result">
        <StatsCard rows={[...tab.result(world), ["Last rebuild", `${Math.round(ms)} ms`]]} />
      </Section>
      <Section icon={<InfoIcon />} title="How it works">
        <InfoCard summary={tab.summary} formula={tab.formula} />
      </Section>
    </>
  );
}

function ShaderTab({ render, ctl }: { render: RenderParams; ctl: WorldController }) {
  const sections: { title: string; icon: ReactNode; keys: (keyof typeof RENDER_SPECS)[] }[] = [
    { title: "Light", icon: <SunIcon />, keys: ["sunAzimuth", "sunElevation", "sun", "ambient", "exposure"] },
    { title: "Bloom", icon: <GlowIcon />, keys: ["bloom"] },
    { title: "Distance fog", icon: <FogIcon />, keys: ["fog"] },
    { title: "Tilt-shift", icon: <LensIcon />, keys: ["tiltShift"] },
    { title: "Rain", icon: <RainIcon />, keys: ["rain", "rainSpeed", "wind"] },
  ];
  return (
    <>
      <Section icon={<MoodIcon />} title="Mood">
        <Field label="Preset" description="Sets the colours of the sky, the light and the sea, and every slider below, which you can then tune.">
          <Select value={render.mood} onChange={(e) => ctl.setMood(e.target.value as MoodId)}>
            {(Object.keys(MOODS) as MoodId[]).map((id) => (
              <option key={id} value={id}>
                {MOODS[id].label}
              </option>
            ))}
          </Select>
        </Field>
      </Section>
      {sections.map((s) => (
        <Section key={s.title} icon={s.icon} title={s.title}>
          {s.keys.map((key) => {
            const spec = RENDER_SPECS[key];
            return (
              <Field key={key} label={spec.label} description={spec.description} valueLabel={rangeLabel(spec, render[key])}>
                <RangeInput min={spec.min} max={spec.max} step={spec.step} value={render[key]} onChange={(e) => ctl.setRender({ [key]: Number(e.target.value) })} />
              </Field>
            );
          })}
        </Section>
      ))}
      <PanelButton className="flex flex-none items-center justify-center gap-2" onClick={() => ctl.setMood(render.mood)}>
        <ResetIcon />
        Reset to {MOODS[render.mood].label}
      </PanelButton>
      <Section icon={<InfoIcon />} title="How it works">
        <InfoCard
          summary="The city lights itself: windows, signs and lamps are emissive, and bloom spreads only the brightest values. A dim key light and a hemisphere sky light keep the terrain readable. Fog fades distant towers into the background colour, tilt-shift blurs away from a band like a macro lens on a model, and the rain falls entirely in the vertex shader."
          formula={[
            "light = hemi(sky, ground) + key · max(N · L, 0)",
            "fog   = 1 − exp(−(density · distance)²)",
            "bloom = blur(max(colour − threshold, 0)) · strength",
            "tilt  = blur · smoothstep(band, band + 0.32, |uv.y − focus|)",
            "rain  : y = mod(y₀ − t · speed, height),  x += wind · fallen",
          ].join("\n")}
        />
      </Section>
    </>
  );
}

export function WorldPanel({ world, ctl, open, onToggle }: { world: WorldModel; ctl: WorldController; open: boolean; onToggle: () => void }) {
  const [tab, setTab] = useState<TabId>("terrain");
  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={17.5} label="settings panel">
      {/* Sticky segmented tabs, as in the weeks; the negative margins cancel the panel's padding. */}
      <nav className="sticky -top-5 z-20 -mx-5 -mt-5 grid grid-cols-5 gap-1.5 bg-slate-900/95 px-5 pb-2 pt-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-pressed={t.id === tab}
            className={
              "cursor-pointer rounded-xl border px-0.5 py-2 text-[11px] transition-colors " +
              (t.id === tab
                ? "border-cyan-400/60 bg-cyan-500/20 font-semibold text-cyan-200"
                : "border-slate-700/50 bg-slate-800/50 font-medium text-slate-400 hover:bg-slate-700/60 hover:text-slate-200")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "shader" ? <ShaderTab render={ctl.state.render} ctl={ctl} /> : <GenerationTab tab={GEN_TABS[tab]} world={world} ctl={ctl} />}
    </SidePanel>
  );
}
