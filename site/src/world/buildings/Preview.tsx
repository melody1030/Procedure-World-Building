import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ARCHETYPES, buildBuilding } from "./registry";
import { buildingObject, disposeBuilding } from "./render";

/**
 * A plain preview of the building library: every archetype on its own diorama base, skyscrapers
 * in the back row and residential complexes in front, at night, with orbit controls. It is a tool
 * for looking at the assets, not part of the city; the city places them on lots itself.
 */

/** Gap between buildings, in voxels (6 m). */
const GAP = 24;

export default function BuildingsPreview() {
  const host = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // The first view can come from the URL (?b=<archetype id>&seed=<n>), so a view can be linked.
  const params = new URLSearchParams(window.location.search);
  const [seed, setSeed] = useState(() => Math.max(1, Number(params.get("seed")) || 1));
  // "all", or one archetype id to look at on its own.
  const [focus, setFocus] = useState(() => (ARCHETYPES.some((a) => a.id === params.get("b")) ? params.get("b")! : "all"));
  const [stats, setStats] = useState("");

  useEffect(() => {
    const el = host.current!;
    // A logarithmic depth buffer keeps fine, close-set layers from flickering at a distance.
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f1d);
    scene.fog = new THREE.Fog(0x0b0f1d, 1400, 3200);
    scene.add(new THREE.HemisphereLight(0x9aa3c4, 0x1c1a26, 2.0));
    const key = new THREE.DirectionalLight(0xdfe4ff, 2.6);
    key.position.set(-500, 900, 600);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 10, far: 3000 });
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.6;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc06bff, 1.1);
    rim.position.set(700, 300, -700);
    scene.add(rim);

    // Lay out the two rows.
    const groups: THREE.Group[] = [];
    const labels: { name: string; at: THREE.Vector3 }[] = [];
    let boxes = 0;
    const shown = focus === "all" ? ARCHETYPES : ARCHETYPES.filter((a) => a.id === focus);
    const rows = [shown.filter((a) => a.category === "skyscraper"), shown.filter((a) => a.category === "residential")].filter((row) => row.length);
    const models = rows.map((row) => row.map((a) => buildBuilding(a.id, { seed, base: true })));
    // The back row (skyscrapers) sits far enough behind the front one to stand clear of it.
    const rowGap = rows.length > 1 ? Math.max(...models[0].map((b) => b.depth)) + Math.max(...models[1].map((b) => b.depth)) + GAP * 6 : 0;
    models.forEach((row, r) => {
      const total = row.reduce((s, b) => s + b.width + GAP * 2, 0);
      let x = -total / 2;
      const z = r === 0 ? -rowGap / 2 : rowGap / 2;
      row.forEach((model, i) => {
        const group = buildingObject(model);
        group.position.set(x + model.width / 2 + GAP, 0, z);
        scene.add(group);
        groups.push(group);
        labels.push({ name: rows[r][i].name, at: new THREE.Vector3(group.position.x, -4, z + model.depth / 2 + 10) });
        x += model.width + GAP * 2;
        boxes += model.solid.index.length / 36 + model.glow.index.length / 36;
      });
    });
    setStats(`${groups.length} buildings · about ${Math.round(boxes).toLocaleString()} boxes`);

    const camera = new THREE.PerspectiveCamera(30, 1, 20, 8000);
    // Frame what is shown: the whole set, or one building close up.
    const tallest = Math.max(...models.flat().map((b) => b.height));
    const span = Math.max(tallest, ...models.map((row) => row.reduce((s, b) => s + b.width + GAP * 2, 0)));
    const dist = span * (focus === "all" ? 1.9 : 2.3);
    camera.position.set(-dist * 0.55, tallest * 0.5 + dist * 0.45, dist * 0.8);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, tallest * (focus === "all" ? 0.38 : 0.48), 0);
    controls.enableDamping = true;
    controls.update();

    // A soft bloom: only the bright lights (windows, neon, signs) cross the threshold, so they glow
    // without washing out the dark architecture.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.72);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const tags = labels.map(({ name }) => {
      const tag = document.createElement("div");
      tag.textContent = name;
      tag.className = "pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-mono text-[11px] uppercase tracking-wider text-slate-400";
      labelsRef.current!.appendChild(tag);
      return tag;
    });
    const v = new THREE.Vector3();
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      composer.render();
      labels.forEach(({ at }, i) => {
        v.copy(at).project(camera);
        const visible = v.z < 1;
        tags[i].style.display = visible ? "block" : "none";
        tags[i].style.left = `${((v.x + 1) / 2) * el.clientWidth}px`;
        tags[i].style.top = `${((1 - v.y) / 2) * el.clientHeight}px`;
      });
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      controls.dispose();
      composer.dispose();
      groups.forEach(disposeBuilding);
      tags.forEach((t) => t.remove());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [seed, focus]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0b0f1d]">
      <div ref={host} className="absolute inset-0" />
      <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
      <div className="absolute left-4 top-4 rounded-lg border border-slate-700/60 bg-slate-900/80 px-4 py-3 text-slate-200 backdrop-blur">
        <a href="/world" className="font-mono text-[11px] uppercase tracking-wider text-slate-500 hover:text-cyan-300">
          ← Blueprint City
        </a>
        <h1 className="mt-1 text-lg font-semibold">Building library</h1>
        <p className="mt-0.5 text-xs text-slate-400">{stats}</p>
        <div className="mt-2 flex items-center gap-2">
          <select value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Building to show" className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-200">
            <option value="all">All buildings</option>
            {ARCHETYPES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setSeed((s) => s + 1)} className="rounded border border-slate-600 px-2 py-1 font-mono text-xs text-cyan-300 hover:bg-slate-800">
            Seed {seed} → next
          </button>
        </div>
        {focus !== "all" && <p className="mt-2 max-w-64 text-xs text-slate-400">{ARCHETYPES.find((a) => a.id === focus)?.summary}</p>}
      </div>
    </div>
  );
}
