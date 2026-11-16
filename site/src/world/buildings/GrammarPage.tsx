import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { linkProps } from "../../router";
import { VOXEL_M } from "../scale";
import { Button, CHIP, GLASS, HEADING, NOTE, RULE, Row, Segmented, Select, Slider } from "../ui/kit";
import { BAY_NAMES, CROWN_TYPES, DEFAULT_GRAMMAR, GRAMMAR_RANGES, ROOF_TYPES, SIGN_CAP, WINDOW_TYPES, buildGrammar, type Bay, type Derivation, type GrammarParams, type RoofType } from "./grammar";
import { SHAPES, type Shape } from "./massing";
import { buildingObject, disposeBuilding } from "./render";

/**
 * The building grammar editor (docs/plans/building-grammar-plan.md): the parameters on the left,
 * the building in the middle, what the rules made on the right. Every change rebuilds the
 * building at once, in the city's night light.
 */

type NumberKey = keyof typeof GRAMMAR_RANGES;

/** A slider: key, label, step, how to show the value, and what it does. */
interface SliderRow {
  key: NumberKey;
  label: string;
  step: number;
  unit: string;
  description: string;
}

/** The sliders, by panel group. */
const GROUPS: { title: string; rows: SliderRow[] }[] = [
  {
    title: "Footprint",
    rows: [
      {
        key: "frontage",
        label: "Width",
        step: 0.5,
        unit: "m",
        description: "The street front, corner to corner. It sets how many bays fit along it.",
      },
      {
        key: "depth",
        label: "Depth",
        step: 0.5,
        unit: "m",
        description: "How far the building reaches back from the street.",
      },
    ],
  },
  {
    title: "Floors",
    rows: [
      {
        key: "floors",
        label: "Floors",
        step: 1,
        unit: "",
        description: "Storeys, the ground floor included. Upper floors are the city's 3 m.",
      },
      {
        key: "groundFloor",
        label: "Ground floor",
        step: 0.25,
        unit: "m",
        description: "The base's height: shops and doors want a taller storey.",
      },
    ],
  },
  {
    title: "Windows",
    rows: [
      {
        key: "bayWidth",
        label: "Spacing",
        step: 0.25,
        unit: "m",
        description: "From one window to the next, the pier between them included. The bays stretch to fill the front exactly.",
      },
      {
        key: "windowWidth",
        label: "Width",
        step: 0.25,
        unit: "m",
        description: "Each window's width, at most its bay's opening. Ribbon and glass windows fill the bay.",
      },
      {
        key: "windowHeight",
        label: "Height",
        step: 0.25,
        unit: "m",
        description: "Each window's height, at most its storey less a sill. Glass windows run the storey.",
      },
      {
        key: "lit",
        label: "Lit",
        step: 0.05,
        unit: "%",
        description: "The share of windows with a light on.",
      },
    ],
  },
  {
    title: "Facade",
    rows: [
      {
        key: "balconies",
        label: "Balconies",
        step: 0.05,
        unit: "%",
        description: "The chance that a window above the ground floor is a balcony instead, drawn window by window.",
      },
    ],
  },
  { title: "Top", rows: [] },
];

/** The Top group's sliders, each shown for the roofs it applies to. */
const ROOF_ROWS: (Omit<SliderRow, "description"> & { roofs: RoofType[] })[] = [
  {
    key: "fill",
    label: "Fill",
    step: 0.05,
    unit: "%",
    roofs: ["gear", "garden", "billboard"],
  },
  {
    key: "padSize",
    label: "Pad size",
    step: 0.25,
    unit: "m",
    roofs: ["helipad"],
  },
  {
    key: "parapet",
    label: "Parapet",
    step: 0.25,
    unit: "m",
    roofs: ["gear", "garden", "billboard", "helipad"],
  },
];


const show = (v: number, unit: string) => (unit === "%" ? `${Math.round(v * 100)}%` : unit ? `${v} ${unit}` : `${v}`);

/** The starting view's distance from the camera to its target, enough for a mid-rise. */
const VIEW_DIST = 526;

/** The panels' size relative to the weeks' controls, drawn with CSS zoom like /world's UI_SCALE. */
const UI_SCALE = 0.9;

/** The first draw shown: A B A over S S B, mirrored, so windows, balconies and two sign columns show at once. */
const START_SEED = 15;
export default function GrammarPage() {
  const [params, setParams] = useState<GrammarParams>(DEFAULT_GRAMMAR);
  const [seed, setSeed] = useState(START_SEED);
  const result = useMemo(() => buildGrammar(params, seed), [params, seed]);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    aim: { y: number; dist: number; height: number };
  } | null>(null);

  // The view: the city's night light and bloom, orbit controls, the lot it stands on.
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f1d);
    scene.fog = new THREE.Fog(0x0b0f1d, 1600, 3600);
    scene.add(new THREE.HemisphereLight(0x9aa3c4, 0x1c1a26, 2.0));
    const key = new THREE.DirectionalLight(0xdfe4ff, 2.6);
    key.position.set(-500, 900, 600);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, {
      left: -400,
      right: 400,
      top: 700,
      bottom: -400,
      near: 10,
      far: 3000,
    });
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.6;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc06bff, 1.1);
    rim.position.set(700, 300, -700);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(30, 1, 10, 8000);
    camera.position.set(-260, 240, 420);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 60, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();

    // Only the lights cross the bloom's threshold, so windows and neon glow and the walls stay dark.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.72));
    composer.addPass(new OutputPass());

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    // Where the view should look and how far back it stands. When the height changes, the target
    // glides up or down and the camera pulls back along its own line of sight: a pan and a dolly,
    // never a turn, so the view doesn't tilt or jolt. Grabbing the view stops the glide.
    const aim = {
      y: controls.target.y,
      dist: camera.position.distanceTo(controls.target),
      height: 0,
    };
    controls.addEventListener("start", () => {
      aim.y = controls.target.y;
      aim.dist = camera.position.distanceTo(controls.target);
    });
    const offset = new THREE.Vector3();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      offset.subVectors(camera.position, controls.target);
      const dist = offset.length();
      const dy = (aim.y - controls.target.y) * 0.12;
      const dd = (aim.dist - dist) * 0.12;
      if (Math.abs(dy) > 0.01 || Math.abs(dd) > 0.01) {
        controls.target.y += dy;
        camera.position.copy(controls.target).add(offset.setLength(dist + dd));
      }
      controls.update();
      composer.render();
    };
    tick();
    stage.current = { scene, camera, controls, aim };
    return () => {
      stage.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // The building and its lot, swapped on every change; the view pans to follow its height.
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const { model } = result;
    const building = buildingObject(model);
    building.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    });
    const lot = lotObject(model.width, model.depth);
    s.scene.add(building, lot);
    if (model.height !== s.aim.height) {
      s.aim.height = model.height;
      s.aim.y = model.height * 0.42;
      // Far enough back to see the whole building, but no closer than the starting view.
      const r = 0.5 * Math.hypot(model.height, model.width, model.depth);
      s.aim.dist = Math.max(VIEW_DIST, (1.15 * r) / Math.sin(THREE.MathUtils.degToRad(15)));
    }
    return () => {
      s.scene.remove(building, lot);
      disposeBuilding(building);
      lot.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    };
  }, [result]);

  const set = (key: NumberKey, value: number) => setParams((p) => ({ ...p, [key]: value }));
  const { stats, derivation } = result;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0f1d] text-[#dce8f5]">
      <div ref={host} className="absolute inset-0" />

      {/* Left: the parameters. The scrolling box sits inside the panel, as in /world, so a hint's
          bubble opens just right of the panel rather than at the window's edge. */}
      {/* The panels are drawn at UI_SCALE (90%), so they take less of the view. */}
      <div className="pointer-events-none absolute inset-0" style={{ zoom: UI_SCALE }}>
        <aside className={"pointer-events-auto absolute bottom-4 left-4 top-4 w-72 overflow-hidden rounded-2xl border " + GLASS}>
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
            <div>
              <a {...linkProps("/technique")} className="font-mono text-[11px] uppercase tracking-wider text-[#6f86a0] hover:text-[#5ad8ff]">
                ← Technique
              </a>
              <h1 className="mt-1 font-display text-lg font-bold text-white">Building grammar</h1>
              <p className={NOTE + " mt-1"}>A building derived rule by rule from a few parameters, after Class 09's building morphology demo.</p>
            </div>
            {GROUPS.map((g) => (
              <Panel key={g.title} title={g.title}>
                {g.title === "Footprint" && (
                  <Row label="Shape" description="The footprint's plan. L and U are wings round a court open to the street (too small a footprint makes a bar). Stepped steps back from the street in 3 stages, 2 m each, leaving terraces." inline>
                    <Select value={params.shape} onChange={(e) => setParams((p) => ({ ...p, shape: e.target.value as Shape }))}>
                      {SHAPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Row>
                )}
                {g.title === "Top" && (
                  <>
                    <Row label="Roof" description="">
                      <Segmented label="Roof" options={ROOF_TYPES} value={params.roof} onChange={(roof) => setParams((p) => ({ ...p, roof }))} />
                    </Row>
                    {ROOF_ROWS.filter((r) => r.roofs.includes(params.roof)).map((r) => {
                      const [min, max] = GRAMMAR_RANGES[r.key];
                      return (
                        <Row key={r.key} label={r.label} description="" value={show(params[r.key], r.unit)}>
                          <Slider min={min} max={max} step={r.step} value={params[r.key]} defaultValue={DEFAULT_GRAMMAR[r.key]} onChange={(e) => set(r.key, Number(e.target.value))} />
                        </Row>
                      );
                    })}
                    <Row label="Crown" description="">
                      <Segmented label="Crown" options={CROWN_TYPES} value={params.crown} onChange={(crown) => setParams((p) => ({ ...p, crown }))} />
                    </Row>
                  </>
                )}
                {g.title === "Windows" && (
                  <Row label="Type" description="How the A bays are glazed. Punched: a window in each bay. Ribbon: one band of glass along the floor. Glass: floor to floor.">
                    <Segmented label="Window type" options={WINDOW_TYPES} value={params.windowType} onChange={(windowType) => setParams((p) => ({ ...p, windowType }))} />
                  </Row>
                )}
                {g.rows.map((r) => {
                  const [min, max] = GRAMMAR_RANGES[r.key];
                  return (
                    <Row key={r.key} label={r.label} description={r.description} value={show(params[r.key], r.unit)}>
                      <Slider min={min} max={max} step={r.step} value={params[r.key]} defaultValue={DEFAULT_GRAMMAR[r.key]} onChange={(e) => set(r.key, Number(e.target.value))} />
                    </Row>
                  );
                })}
              </Panel>
            ))}
            <Button
              onClick={() => {
                setParams(DEFAULT_GRAMMAR);
                setSeed(START_SEED);
              }}
            >
              Reset
            </Button>
          </div>
        </aside>

        {/* Right: what the rules made. */}
        <aside className={"pointer-events-auto absolute right-4 top-4 flex w-80 flex-col gap-4 rounded-2xl border p-4 " + GLASS}>
          <Panel title="Variation">
            <div className="flex items-center justify-between gap-2">
              <span className={NOTE}>A new draw of the bay patterns, the lit windows, the signs, the balconies' clutter and the rooftop gear.</span>
              <Button onClick={() => setSeed((v) => v + 1)}>Randomize</Button>
            </div>
          </Panel>
          <Panel title="Grammar">
            <Printout d={derivation} />
          </Panel>
          <Panel title="Stats">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <Stat label="Height" value={`${stats.height.toFixed(1)} m · ${stats.tier}-rise`} />
              <Stat label="Footprint" value={`${stats.frontage} × ${stats.depth} m`} />
              <Stat label="Floors" value={`${stats.floors}`} />
              <Stat label="Windows" value={`${stats.windows} (${stats.lit} lit)`} />
              <Stat label="Mesh" value={`${stats.vertices.toLocaleString()} verts · ${stats.triangles.toLocaleString()} tris`} />
              <Stat label="Build" value={`${stats.ms.toFixed(1)} ms`} />
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={"flex flex-col gap-3 border-t pt-3 " + RULE}>
      <h2 className={"m-0 " + HEADING}>{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#9db2c8]">{label}</dt>
      <dd className="m-0 text-right font-mono tabular-nums text-[#ffd27a]">{value}</dd>
    </>
  );
}

/** A row of bay letters as the rule expanded them. */
function Bays({ label, letters }: { label: string; letters: Bay[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-12 shrink-0 pt-0.5 text-[11px] text-[#9db2c8]">{label}</span>
      <span className="flex flex-wrap gap-1">
        {letters.map((l, i) => (
          <span key={i} title={BAY_NAMES[l]} className={CHIP + " cursor-help"}>
            {l}
          </span>
        ))}
      </span>
    </div>
  );
}

/** The rules as they read now: each rule's name, what it expands to, and the numbers in amber. */
function Printout({ d }: { d: Derivation }) {
  const v = (text: string | number) => <span className="text-[#ffd27a]">{text}</span>;
  const pattern = (bays: Bay[]) => `[${bays.join(" ")}]+`;
  const mirrored = d.mirror ? " mirrored" : "";
  const rules: [string, ReactNode][] = [
    ["BUILDING", "PLAN BASE SHAFT TOP"],
    ["PLAN", <>{v(SHAPES.find((o) => o.value === d.shape)?.label ?? d.shape)}{["l", "u"].includes(d.shape) ? <> · wings {v(`${d.wing} m`)}</> : null}</>],
    ["BASE", <>pier {pattern(d.groundPattern)} pier{mirrored} · {v(`${d.groundFloor} m`)}</>],
    ["SHAFT", d.stageFloors.length > 1 ? <>STAGE × {v(d.stageFloors.length)}</> : <>FLOOR × {v(d.floors - 1)}</>],
    ...(d.stageFloors.length > 1
      ? ([
          [
            "STAGE",
            <>
              FLOOR × {v(d.stageFloors.join(" | "))}
              {" "}· in {v(d.stageInsets.map((x) => `${+x.toFixed(2)}`).join(" | ") + " m")}
            </>,
          ],
        ] as [string, ReactNode][])
      : []),
    ["FLOOR", <>pier {pattern(d.upperPattern)} pier{mirrored} · {v(`${d.floorHeight} m`)}</>],
    ["TOP", <>parapet {v(`${d.parapet} m`)} + ROOF{d.crown !== "none" ? " + CROWN" : ""}</>],
    [
      "ROOF",
      <>
        {d.roofBuilt === d.roof ? v(d.roof) : <>{v(d.roof)} (roof too small: {d.roofBuilt})</>}
        {d.roofBuilt === "helipad" ? <> · {v(`${+d.roofSize.toFixed(2)} m`)} pad</> : null}
        {d.roofBuilt !== "helipad" ? <> · fill {v(`${Math.round(d.fill * 100)}%`)}</> : null}
      </>,
    ],
    ...(d.crown !== "none" ? ([["CROWN", d.crown === "cap" && !d.capped ? <>{v("cap")} (roof too small: none)</> : v(d.crown === "band" ? "neon band" : "stepped cap")]] as [string, ReactNode][]) : []),
    ["A", <>{v(d.windowType)} window | balcony {v(`${Math.round(d.balconies * 100)}%`)}</>],
    ["N", <>{v(d.signs)} of {v(d.columns)} columns · drawn {v(`${Math.round(d.signShare * 100)}%`)}, at most {v(`${Math.round(SIGN_CAP * 100)}%`)}</>],
    ["FRONT", <>{v(d.bays)} bays × {v(`${d.bay.toFixed(2)} m`)}{d.fronts > 1 ? <> on each of {v(d.fronts)} wings</> : null}</>],
  ];
  return (
    <>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 font-mono text-[11px] leading-snug">
        {rules.map(([name, body]) => (
          <div key={name} className="contents">
            <dt className="text-[#dce8f5]">{name}</dt>
            <dd className="m-0 text-[#9db2c8]">
              <span className="text-[#6f86a0]">→ </span>
              {body}
            </dd>
          </div>
        ))}
      </dl>
      <p className={"m-0 " + NOTE}>The street front expands to (hover a letter for its bay):</p>
      <Bays label="Upper" letters={d.upper} />
      <Bays label="Ground" letters={d.ground} />
    </>
  );
}

/** The lot the building stands on: a concrete slab, a sidewalk along the street front, and the street. */
function lotObject(width: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const v = (meters: number) => meters / VOXEL_M;
  const pad = v(2);
  const walk = v(3);
  const street = v(8);
  const box = (w: number, h: number, d: number, x: number, z: number, color: number, y = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    mesh.position.set(x, y - h / 2, z);
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const w = width + 2 * pad;
  box(w, 2, depth + 2 * pad, 0, 0, 0x2a2f3c, 0.02);
  box(w, 1.5, walk, 0, depth / 2 + pad + walk / 2, 0x3a4050, 0.02);
  box(w + v(20), 3, street, 0, depth / 2 + pad + walk + street / 2, 0x161a24, -0.5);
  // A dashed center line, faintly lit.
  for (let x = -w / 2 - v(8); x < w / 2 + v(8); x += v(4)) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(v(2), 0.1, v(0.15)), new THREE.MeshBasicMaterial({ color: 0x8a7a40 }));
    dash.position.set(x + v(1), -0.45, depth / 2 + pad + walk + street / 2);
    group.add(dash);
  }
  return group;
}
