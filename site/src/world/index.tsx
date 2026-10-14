import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShortcutToggle } from "../components/SidePanel";
import { WorldView } from "./render/WorldView";
import { useWorldState } from "./state";
import { finishTerrain, generateTerrain, type Terrain } from "./terrain/pipeline";
import { PrintBar } from "./ui/PrintBar";
import { buildUp } from "./terrain/buildup";
import { TerrainPanel } from "./ui/TerrainPanel";
import { TitleCard } from "./ui/TitleCard";

/**
 * Blueprint City, full screen. The seed and the settings run the terrain pipeline, and WorldView
 * draws the result on the diorama. The bar at the bottom prints the terrain layer by layer; it
 * plays when a new seed loads. Press E to hide the panels.
 */
export default function WorldPage() {
  const ctl = useWorldState();
  const { state, setSeed, setRiverControl } = ctl;
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const [overlays, setOverlays] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [seedOpen, setSeedOpen] = useState(true);
  // E slides the seed card away with the settings panel (each keeps its round button).
  useShortcutToggle(seedOpen, () => setSeedOpen((v) => !v));
  useShortcutToggle(overlays, () => setOverlays((v) => !v));

  // The seed and settings the terrain is made for follow the requested ones two frames later, so
  // "Generating…" shows (and the slider stays where it was let go) before the work blocks the page.
  const [applied, setApplied] = useState({ seed: state.seed, params: state.params });
  const generating = applied.seed !== state.seed || applied.params !== state.params;
  useEffect(() => {
    if (!generating) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setApplied({ seed: state.seed, params: state.params }));
    });
    return () => cancelAnimationFrame(frame);
  }, [generating, state.seed, state.params]);

  // The last terrain, so a settings change reruns only the stages from the one it touches. The
  // ground is drawn first; districts and lots (used only by the overlays) finish a moment later.
  const previousRef = useRef<Terrain | null>(null);
  const ground = useMemo(() => {
    const next = generateTerrain(applied.seed, applied.params, previousRef.current, { deferDistricts: true });
    previousRef.current = next;
    return next;
  }, [applied]);
  const [finished, setFinished] = useState<Terrain | null>(null);
  useEffect(() => {
    if (!ground.pendingDistricts) return;
    const timer = setTimeout(() => {
      const full = finishTerrain(ground);
      previousRef.current = full;
      setFinished(full);
    }, 30);
    return () => clearTimeout(timer);
  }, [ground]);
  const terrain = finished && finished.mesh === ground.mesh && finished.params === ground.params ? finished : ground;

  // The latest terrain, for the drag handler set up once below.
  const terrainRef = useRef(terrain);
  terrainRef.current = terrain;

  useEffect(() => {
    const view = new WorldView(mountRef.current!);
    viewRef.current = view;
    // A dropped river point replaces that point in the current path; the river rebuilds from it.
    view.setPathEditHandler((index, point) => {
      const path = terrainRef.current.river.path;
      if (path) setRiverControl(path.control.map((q, i) => (i === index ? point : q)));
    });
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  // Where the print timeline is (0–1), kept outside React state so playing re-renders only the bar.
  const printRef = useRef(0);
  const setPrint = useCallback((t: number) => {
    printRef.current = t;
    viewRef.current?.setPrint(t);
  }, []);

  // Re-upload only when the mesh itself changed: a look-only change keeps the same mesh object.
  useEffect(() => {
    const t = terrain;
    viewRef.current?.setTerrain(t.mesh.geometry, t.mesh.water, t.columns.max, () => buildUp(t));
    viewRef.current?.setPrint(printRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.mesh]);

  useEffect(() => viewRef.current?.setPath(terrain.river.path), [terrain.river.path]);

  useEffect(() => {
    const url = `/world?seed=${encodeURIComponent(terrain.seed)}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [terrain.seed]);

  useEffect(() => viewRef.current?.setPathVisible(state.showPath), [state.showPath]);
  useEffect(() => viewRef.current?.setClaims(terrain.districts.claims.claim, terrain.districts.claims.n), [terrain.districts]);
  useEffect(() => viewRef.current?.setDistricts(terrain.districts), [terrain.districts]);
  useEffect(() => viewRef.current?.setShowDistricts(state.showDistricts), [state.showDistricts]);
  useEffect(() => viewRef.current?.setShowLots(state.showLots), [state.showLots]);
  useEffect(() => viewRef.current?.setShowParks(state.showParks), [state.showParks]);
  useEffect(() => viewRef.current?.setShowClaims(state.showClaims), [state.showClaims]);
  useEffect(() => {
    const { n, height } = terrain.columns;
    viewRef.current?.setNetwork(terrain.hubs, terrain.streets, (x, z) => height[Math.min(n - 1, Math.max(0, Math.round(z))) * n + Math.min(n - 1, Math.max(0, Math.round(x)))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.hubs, terrain.streets, terrain.columns]);
  useEffect(() => viewRef.current?.setNetworkVisible(state.showNetwork), [state.showNetwork]);
  useEffect(() => viewRef.current?.setLook(state.params.look.grid), [state.params.look]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-stage">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        <TitleCard seed={state.seed} onSeed={setSeed} open={seedOpen} onToggle={() => setSeedOpen((v) => !v)} />
        <TerrainPanel terrain={terrain} ctl={ctl} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
        {/* Hidden rather than removed with E, so the print keeps its place. Clear of the open panel. */}
        <div
          className={"absolute bottom-4 right-4 flex justify-center transition-[left] duration-300 " + (overlays ? "" : "hidden")}
          style={{ left: panelOpen ? "18.2rem" : "1rem" }}
        >
          <PrintBar replayKey={terrain.seed} onChange={setPrint} busy={generating || !!terrain.pendingDistricts} />
        </div>
      </div>
    </div>
  );
}
