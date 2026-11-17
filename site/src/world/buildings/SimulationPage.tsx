import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { linkProps } from "../../router";
import { HEIGHT_TINT_BOTTOM, HEIGHT_TINT_COLORS, HEIGHT_TINT_TOP, heightTintShare } from "../city/zoning";
import { hash2 } from "../rng";
import { voxels } from "../scale";
import { Button, GLASS, NOTE, Row, Segmented, Slider, Switch } from "../ui/kit";
import { BLOCK_RANGES, DEFAULT_BLOCK, layoutBlocks, massBoxes, type BlockParams, type Layout, type Lot } from "./block";
import { GrammarPool } from "./grammarPool";
import type { GrammarDone } from "./grammarWorker";
import { PageSwitch, Panel, Stat, thousands } from "./panels";
import { buildingObject, disposeBuilding } from "./render";
import { createNightStage } from "./stage";

/**
 * The grammar's Simulation (docs/plans/building-grammar-plan.md §2.1, after Class 09's City
 * Morphology Demo): streets, blocks and lots laid out from a few parameters, a hidden height field
 * setting each building's height, and a building on every lot, as masses or as the grammar's own.
 */

type Key = keyof BlockParams;
interface SliderRow {
  key: Key;
  label: string;
  step: number;
  unit: "m" | "%" | "";
  description: string;
}

const GROUPS: { title: string; rows: SliderRow[]; roll?: "streets" | "heights" }[] = [
  {
    title: "Streets",
    roll: "streets",
    rows: [
      { key: "area", label: "Area", step: 10, unit: "m", description: "The side of the square laid out. Larger areas take longer to build in Grammar view." },
      { key: "blockLength", label: "Block length", step: 5, unit: "m", description: "How long a block runs along its street, between cross streets." },
      { key: "streetWidth", label: "Street width", step: 1, unit: "m", description: "Curb to curb plus the sidewalks." },
      { key: "irregularity", label: "Irregularity", step: 0.05, unit: "%", description: "How much block lengths and depths vary. The cross streets stagger band by band into T junctions." },
    ],
  },
  {
    title: "Lots",
    rows: [
      { key: "frontage", label: "Frontage", step: 0.5, unit: "m", description: "Each lot's width along its street. A block is two rows of lots back to back." },
      { key: "depth", label: "Depth", step: 0.5, unit: "m", description: "Each lot's depth, half its block's." },
      { key: "jitter", label: "Jitter", step: 0.05, unit: "%", description: "How much the lots' fronts vary along a row." },
      { key: "frontSetback", label: "Front setback", step: 0.25, unit: "m", description: "How far the building stands back from the street. At least the awnings' 1.52 m." },
      { key: "sideSetback", label: "Side and rear setback", step: 0.25, unit: "m", description: "How far the building stands in from its neighbors and the lot behind. At least the balconies' 1.15 m." },
    ],
  },
  {
    title: "Height",
    roll: "heights",
    rows: [
      { key: "minHeight", label: "Min height", step: 1, unit: "m", description: "The lowest the height field asks for." },
      { key: "maxHeight", label: "Max height", step: 1, unit: "m", description: "The highest the height field asks for. Slender lots stop at 8 times their narrower side." },
      { key: "district", label: "District size", step: 5, unit: "m", description: "How large the height field's hills and hollows are." },
      { key: "contrast", label: "Contrast", step: 0.1, unit: "", description: "Above 1, most lots stay low and a few rise high. Below 1, most rise toward the max." },
    ],
  },
];

const show = (v: number, unit: string) => (unit === "%" ? `${Math.round(v * 100)}%` : unit ? `${v} ${unit}` : `${v}`);

type View = "masses" | "grammar" | "none";
const VIEWS: { value: View; label: string }[] = [
  { value: "masses", label: "Masses" },
  { value: "grammar", label: "Grammar" },
  { value: "none", label: "None" },
];

/** How many vertices of arriving grammar buildings go to the GPU per frame. */
const UPLOAD_BUDGET = 300_000;
/**
 * The most vertices Grammar view stands up. Past about this many, each new GPU buffer (a building,
 * the masses, the ground) stalled frames for seconds; the default area makes about 8M.
 */
const VERTEX_CAP = 10_000_000;
/** How often (ms) the shadows and the stand-in masses catch up while buildings arrive. */
const SHADOW_EVERY = 300;

/** The panels' size relative to the weeks' controls, as on the Building page. */
const UI_SCALE = 0.9;

const COLORS = { street: 0x161a24, walk: 0x3a4050, lot: 0x2a2f3c, open: 0x2f5a3a, mass: 0xd5dae3, line: 0x5ad8ff };

export default function SimulationPage() {
  const [params, setParams] = useState<BlockParams>(DEFAULT_BLOCK);
  const [seeds, setSeeds] = useState({ streets: 1, heights: 1 });
  const [view, setView] = useState<View>("masses");
  const [showLots, setShowLots] = useState(true);
  const [tint, setTint] = useState(false);
  const layout = useMemo(() => layoutBlocks(params, seeds.streets, seeds.heights), [params, seeds]);
  const [progress, setProgress] = useState({ done: 0, total: 0, ms: 0, vertices: 0, capped: false });
  /** A slider is being dragged: Grammar shows masses until it's let go, then builds once. */
  const [dragging, setDragging] = useState(false);
  /** Bumped as grammar buildings arrive, so the masses standing in for the rest follow. */
  const [arrived, setArrived] = useState(0);

  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{ scene: THREE.Scene; root: THREE.Group; refreshShadows: () => void } | null>(null);
  /** The grammar buildings shown, by what they were built from, so an unchanged lot is never rebuilt. */
  const built = useRef(new Map<string, THREE.Group>());
  /** The grammar buildings the layout wants, by key, and the current build's clock. */
  const wanted = useRef(new Map<string, Lot>());
  const clock = useRef({ start: 0, end: 0, vertices: 0, capped: false });
  const pool = useRef<GrammarPool | null>(null);

  useEffect(() => {
    const shown = built.current;
    // The workers' buildings wait here as they come back, and are stood on their lots a few per
    // frame (UPLOAD_BUDGET vertices), since each must be sent to the GPU: taking them all at once
    // stalled a frame for seconds while the workers sent more. The shadows and the stand-in masses
    // follow every SHADOW_EVERY ms while they come in, and once more at the end.
    const arrivals: GrammarDone[] = [];
    let ready: { root: THREE.Group; refreshShadows: () => void } | null = null;
    let lastShadows = 0;
    const standUp = () => {
      if (!ready || !arrivals.length) return;
      const c = clock.current;
      let budget = UPLOAD_BUDGET;
      let added = 0;
      while (arrivals.length && budget > 0 && !c.capped) {
        const d = arrivals.shift()!;
        const lot = wanted.current.get(d.key);
        if (!lot || shown.has(d.key)) continue;
        // Past the cap the build stops: the lots left keep their masses.
        if (c.vertices + d.vertices > VERTEX_CAP) {
          c.capped = true;
          pool.current?.replace([]);
          arrivals.length = 0;
          break;
        }
        const g = buildingObject(d.model);
        g.userData.vertices = d.vertices;
        place(g, lot);
        ready.root.add(g);
        shown.set(d.key, g);
        c.vertices += d.vertices;
        budget -= d.vertices;
        added++;
      }
      if (!added && !c.capped) return;
      let done = 0;
      for (const key of wanted.current.keys()) if (shown.has(key)) done++;
      const total = wanted.current.size;
      const now = performance.now();
      const finished = done === total || c.capped;
      if (finished && !c.end) c.end = now;
      setProgress({ done, total, ms: (c.end || now) - c.start, vertices: c.vertices, capped: c.capped });
      if (finished || now - lastShadows > SHADOW_EVERY) {
        lastShadows = now;
        ready.refreshShadows();
        setArrived((n) => n + 1);
      }
    };
    const view = createNightStage(host.current!, {
      shadow: 1100,
      camera: [-1750, 1700, 2550],
      target: [0, 40, 0],
      fog: [4500, 11000],
      // Smoother with a city of buildings: shadows drawn only when the buildings change, a plain
      // depth buffer (near raised to keep its precision), and at most 1.5 device pixels per pixel.
      staticShadows: true,
      logDepth: false,
      near: 20,
      pixelRatio: 1.5,
      onFrame: standUp,
    });
    const root = new THREE.Group();
    view.scene.add(root);
    ready = { root, refreshShadows: view.refreshShadows };
    stage.current = { scene: view.scene, root, refreshShadows: view.refreshShadows };
    pool.current = new GrammarPool((d) => arrivals.push(d));
    // A drag ends wherever the pointer is let go, on the panel or off it.
    const release = () => setDragging(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      pool.current?.dispose();
      pool.current = null;
      ready = null;
      arrivals.length = 0;
      for (const g of shown.values()) disposeBuilding(g);
      shown.clear();
      stage.current = null;
      view.dispose();
    };
  }, []);

  // The ground: streets, sidewalks and lot pads, rebuilt with the layout or the tint.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const ground = groundMesh(layout, tint);
    s.scene.add(ground);
    s.refreshShadows();
    return () => {
      s.scene.remove(ground);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    };
  }, [layout, tint]);

  useEffect(() => {
    const s = stage.current;
    if (!s || !showLots) return;
    const lines = lotLines(layout);
    s.scene.add(lines);
    return () => {
      s.scene.remove(lines);
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
    };
  }, [layout, showLots]);

  // Grammar: every lot's building, built by the workers from the middle out. Buildings whose
  // settings didn't change are kept and only moved; the rest are dropped or queued. While a slider
  // is dragged the buildings hide and masses stand in, and the build waits for the release.
  useEffect(() => {
    const s = stage.current;
    const workers = pool.current;
    const shown = built.current;
    if (!s || !workers) return;
    const drop = (key: string) => {
      const g = shown.get(key)!;
      s.root.remove(g);
      disposeBuilding(g);
      shown.delete(key);
      s.refreshShadows();
    };
    s.root.visible = view === "grammar" && !dragging;
    s.refreshShadows();
    if (view !== "grammar") {
      workers.replace([]);
      wanted.current = new Map();
      for (const key of [...shown.keys()]) drop(key);
      return;
    }
    if (dragging) {
      workers.replace([]);
      return;
    }
    const want = new Map<string, Lot>();
    for (const lot of layout.lots) if (lot.grammar) want.set(lotKey(lot), lot);
    wanted.current = want;
    for (const key of [...shown.keys()]) if (!want.has(key)) drop(key);
    for (const [key, g] of shown) place(g, want.get(key)!);
    const center = (l: Lot) => Math.hypot(l.body![0] + l.body![2], l.body![1] + l.body![3]);
    const missing = [...want].filter(([key]) => !shown.has(key)).sort((a, b) => center(a[1]) - center(b[1]));
    let vertices = 0;
    for (const key of want.keys()) vertices += (shown.get(key)?.userData.vertices as number | undefined) ?? 0;
    const capped = missing.length > 0 && vertices >= VERTEX_CAP;
    clock.current = { start: performance.now(), end: missing.length && !capped ? 0 : performance.now(), vertices, capped };
    workers.replace(capped ? [] : missing.map(([key, lot]) => ({ key, params: lot.grammar!, seed: lot.seed })));
    setProgress({ done: want.size - missing.length, total: want.size, ms: 0, vertices, capped });
  }, [layout, view, dragging]);

  // Masses: each lot's grammar massing as plain boxes, in one mesh. In Grammar view they stand in
  // for the buildings not built yet, and for all of them while a slider is dragged. (After the
  // Grammar effect, so they see the lots it now wants.)
  useEffect(() => {
    const s = stage.current;
    if (!s || view === "none") return;
    let lots = layout.lots;
    if (view === "grammar" && !dragging) {
      const shown = built.current;
      const pending = new Set<number>();
      for (const [key, lot] of wanted.current) if (!shown.has(key)) pending.add(lot.id);
      if (!pending.size) return;
      lots = lots.filter((l) => pending.has(l.id));
    }
    const masses = massMesh(lots);
    s.scene.add(masses);
    s.refreshShadows();
    return () => {
      s.scene.remove(masses);
      s.refreshShadows();
      masses.geometry.dispose();
      (masses.material as THREE.Material).dispose();
    };
  }, [layout, view, dragging, arrived]);

  const set = (key: Key, value: number) => setParams((p) => ({ ...p, [key]: value }));
  const { stats } = layout;
  const building = view === "grammar" && progress.done < progress.total && !progress.capped;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0f1d] text-[#dce8f5]">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0" style={{ zoom: UI_SCALE }}>
        <aside
          className={"pointer-events-auto absolute bottom-4 left-4 top-4 w-72 overflow-hidden rounded-2xl border " + GLASS}
          onPointerDownCapture={(e) => {
            if (e.target instanceof HTMLInputElement && e.target.type === "range") setDragging(true);
          }}
        >
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
            <div>
              <a {...linkProps("/technique")} className="font-mono text-[11px] uppercase tracking-wider text-[#6f86a0] hover:text-[#5ad8ff]">
                ← Technique
              </a>
              <h1 className="mt-1 font-display text-lg font-bold text-white">Building grammar</h1>
              <p className={NOTE + " mt-1"}>Streets, blocks and lots, with a height map setting how tall each lot's building grows, after Class 09's city morphology demo.</p>
            </div>
            <PageSwitch path="/grammar/simulation" />
            {GROUPS.map((g) => (
              <Panel key={g.title} title={g.title}>
                {g.rows.map((r) => {
                  const [min, max] = BLOCK_RANGES[r.key];
                  return (
                    <Row key={r.key} label={r.label} description={r.description} value={show(params[r.key], r.unit)}>
                      <Slider min={min} max={max} step={r.step} value={params[r.key]} defaultValue={DEFAULT_BLOCK[r.key]} onChange={(e) => set(r.key, Number(e.target.value))} />
                    </Row>
                  );
                })}
                {g.roll && (
                  <Button onClick={() => setSeeds((v) => ({ ...v, [g.roll!]: v[g.roll!] + 1 }))}>{g.roll === "streets" ? "New streets" : "New heights"}</Button>
                )}
              </Panel>
            ))}
            <Button
              onClick={() => {
                setParams(DEFAULT_BLOCK);
                setSeeds({ streets: 1, heights: 1 });
              }}
            >
              Reset
            </Button>
          </div>
        </aside>

        <aside className={"pointer-events-auto absolute right-4 top-4 flex max-h-[calc(100%-2rem)] w-80 flex-col gap-4 overflow-y-auto rounded-2xl border p-4 " + GLASS}>
          <Panel title="View">
            <Row label="Buildings" description="Masses: each lot's massing as plain boxes. Grammar: each lot's full grammar building, built in the background, with masses standing in until it arrives and while a slider is dragged. None: the lots alone, to read the Height map.">
              <Segmented label="Buildings" options={VIEWS} value={view} onChange={setView} />
            </Row>
            <Row label="Lots" description="Each lot's outline. Open lots, too small for a building, are green." inline>
              <Switch checked={showLots} onChange={(e) => setShowLots(e.target.checked)} />
            </Row>
            <Row label="Height map" description="Tints each lot by its building's height, on the city's Height tint scale." inline>
              <Switch checked={tint} onChange={(e) => setTint(e.target.checked)} />
            </Row>
            {tint && <TintScale />}
          </Panel>
          <Panel title="Stats">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <Stat label="Blocks" value={`${stats.blocks}`} />
              <Stat label="Lots" value={`${stats.lots} · ${stats.open} open`} />
              <Stat label="Tallest" value={`${stats.tallest.toFixed(1)} m`} />
              <Stat label="Tiers" value={`${stats.tiers.low} low · ${stats.tiers.mid} mid · ${stats.tiers.high} high`} />
              <Stat label="Layout" value={`${stats.ms.toFixed(1)} ms`} />
              {view === "grammar" && (
                <>
                  <Stat label="Buildings" value={`${progress.done} / ${progress.total}${building ? " …" : ""}`} />
                  <Stat label="Build" value={`${(progress.ms / 1000).toFixed(2)} s · ${pool.current?.size ?? 0} workers`} />
                  <Stat label="Mesh" value={`${thousands(progress.vertices)} verts`} />
                  {progress.capped && (
                    <dd className={"col-span-2 m-0 " + NOTE}>
                      Stopped at {thousands(VERTEX_CAP)} vertices to stay smooth: the {progress.total - progress.done} lots farthest out keep their masses.
                    </dd>
                  )}
                </>
              )}
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/** What a lot's building is built from: the same settings and seed make the same building. */
const lotKey = (lot: Lot) => JSON.stringify([lot.grammar, lot.seed]);

/** Stands a grammar building on its lot's body, its street front turned to the lot's street. */
function place(g: THREE.Group, lot: Lot) {
  const [x0, z0, x1, z1] = lot.body!;
  g.position.set(voxels((x0 + x1) / 2), 0, voxels((z0 + z1) / 2));
  g.rotation.y = lot.facing > 0 ? 0 : Math.PI;
}

/** The Height tint's color for a height in meters (zoning.ts's scale). */
function tintColor(meters: number) {
  const t = heightTintShare(meters) * (HEIGHT_TINT_COLORS.length - 1);
  const i = Math.min(HEIGHT_TINT_COLORS.length - 2, Math.floor(t));
  return new THREE.Color(HEIGHT_TINT_COLORS[i]).lerp(new THREE.Color(HEIGHT_TINT_COLORS[i + 1]), t - i);
}

function TintScale() {
  const stops = HEIGHT_TINT_COLORS.map((c) => `#${c.toString(16).padStart(6, "0")}`).join(", ");
  return (
    <div className="flex flex-col gap-1">
      <span className="h-2 rounded-sm" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <span className={"flex justify-between " + NOTE}>
        <span>{HEIGHT_TINT_BOTTOM} m</span>
        <span>{HEIGHT_TINT_TOP} m</span>
      </span>
    </div>
  );
}

/** Boxes [x0, y0, z0, x1, y1, z1] (voxels) with a color each, as one geometry; no bottoms. */
function boxGeometry(boxes: { box: number[]; color: THREE.Color }[]) {
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const quad = (corners: number[][], n: number[], c: THREE.Color) => {
    const base = position.length / 3;
    for (const p of corners) {
      position.push(...p);
      normal.push(...n);
      color.push(c.r, c.g, c.b);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const { box: [x0, y0, z0, x1, y1, z1], color: c } of boxes) {
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], c);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c);
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c);
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c);
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** The streets (one slab under it all), each block's sidewalk, and each lot's pad. */
function groundMesh(layout: Layout, tint: boolean) {
  const v = voxels;
  const boxes: { box: number[]; color: THREE.Color }[] = [];
  const [ex0, ez0, ex1, ez1] = layout.extent;
  const pad = 40;
  boxes.push({ box: [v(ex0 - pad), -16, v(ez0 - pad), v(ex1 + pad), -0.5, v(ez1 + pad)], color: new THREE.Color(COLORS.street) });
  const walk = 2.5;
  for (const [x0, z0, x1, z1] of layout.blocks) boxes.push({ box: [v(x0 - walk), -8, v(z0 - walk), v(x1 + walk), 0, v(z1 + walk)], color: new THREE.Color(COLORS.walk) });
  // Each pad a hair inside its lot, so the lots read apart.
  const gap = 0.125;
  for (const lot of layout.lots) {
    const [x0, z0, x1, z1] = lot.rect;
    const color = !lot.body ? new THREE.Color(COLORS.open) : tint ? tintColor(lot.height).multiplyScalar(0.75) : new THREE.Color(COLORS.lot);
    boxes.push({ box: [v(x0 + gap), -4, v(z0 + gap), v(x1 - gap), 0.1, v(z1 - gap)], color });
  }
  const mesh = new THREE.Mesh(boxGeometry(boxes), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Every lot's outline, just above its pad. */
function lotLines(layout: Layout) {
  const v = voxels;
  const points: number[] = [];
  const y = 0.4;
  for (const { rect: [x0, z0, x1, z1] } of layout.lots) {
    const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [v(x), y, v(z)]);
    for (let i = 0; i < 4; i++) points.push(...c[i], ...c[(i + 1) % 4]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLORS.line, transparent: true, opacity: 0.35 }));
}

/** Each lot's massing as pale boxes, a little lighter or darker lot by lot. */
function massMesh(lots: Lot[]) {
  const boxes = massBoxes(lots).map(({ lot, box }) => ({ box, color: new THREE.Color(COLORS.mass).multiplyScalar(0.88 + 0.12 * hash2(lot, 0x77, 3)) }));
  const mesh = new THREE.Mesh(boxGeometry(boxes), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
