import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShortcutToggle } from "../components/SidePanel";
import { WorldView, type CameraPreset } from "./render/WorldView";
import { CameraBar } from "./ui/CameraBar";
import { useWorldState } from "./state";
import { finishTerrain, generateTerrain, type Terrain } from "./terrain/pipeline";
import { PrintBar } from "./ui/PrintBar";
import { buildUp } from "./terrain/buildup";
import { planBuildings } from "./city/placement";
import { buildZoning } from "./city/zoning";
import { hashSeed } from "./rng";
import { Life } from "./life/agents";
import { Spinner } from "./ui/icons";
import { GLASS } from "./ui/kit";
import { TerrainPanel } from "./ui/TerrainPanel";
import { Inspector } from "./ui/Inspector";
import { HelpDialog } from "./ui/Help";
import { Tour, tourSeen } from "./ui/Tour";
import type { Selection } from "./render/select";

/**
 * Blueprint City, full screen. The seed and the settings run the terrain pipeline, and WorldView
 * draws the result on the diorama. The bar at the bottom prints the terrain layer by layer; it
 * plays when a new seed loads. Press E to hide the panels.
 */
/** The interface's size relative to the weeks' (the panel, the time bar and the note). */
const UI_SCALE = 0.8;
/** How many people, pigeons and cats are out. */
const LIFE = { people: 420, pigeons: 150, cats: 8, cars: 14, vans: 4, taxis: 8, buses: 2 };

export default function WorldPage() {
  const ctl = useWorldState();
  const { state, setRiverControl } = ctl;
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const [overlays, setOverlays] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  useShortcutToggle(overlays, () => setOverlays((v) => !v));
  /** The camera preset the view is at, or null once it has been moved by hand. */
  const [view, setView] = useState<CameraPreset | null>("overview");
  const flyTo = useCallback((preset: CameraPreset) => viewRef.current?.flyTo(preset), []);
  /** What was clicked in the city (the inspector shows it), and whether the camera follows it. */
  const [selection, setSelection] = useState<Selection | null>(null);
  const [following, setFollowing] = useState(false);
  const closeInspector = useCallback(() => viewRef.current?.select(null), []);
  const setFollow = useCallback((on: boolean) => viewRef.current?.setFollowing(on), []);

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
  // (Finishing regrades the lots and redoes the mesh, so match on the ungraded columns.)
  const terrain = finished && finished.columns === ground.columns && finished.params === ground.params ? finished : ground;

  // The latest terrain, for the drag handler set up once below.
  const terrainRef = useRef(terrain);
  terrainRef.current = terrain;

  useEffect(() => {
    const view = new WorldView(mountRef.current!);
    viewRef.current = view;
    view.setViewHandler(setView);
    view.setSelectHandler(setSelection);
    view.setFollowHandler(setFollowing);
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
  /** The first build has played to the end (the tour waits for it). */
  const [built, setBuilt] = useState(false);
  const setPrint = useCallback((t: number) => {
    printRef.current = t;
    viewRef.current?.setPrint(t);
    if (t >= 1) setBuilt(true);
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
  useEffect(() => viewRef.current?.setGroundTint(state.groundTint), [state.groundTint]);
  useEffect(() => viewRef.current?.setShowLots(state.showLots), [state.showLots]);
  useEffect(() => viewRef.current?.setShowParks(state.showParks), [state.showParks]);
  useEffect(() => viewRef.current?.setShowBuildings(state.showBuildings), [state.showBuildings]);
  const zoning = useMemo(() => buildZoning(terrain.districts, hashSeed(terrain.seed)), [terrain.districts, terrain.seed]);
  useEffect(() => viewRef.current?.setZoning(zoning, terrain.districts), [zoning, terrain.districts]);
  const plans = useMemo(() => planBuildings(terrain.districts, terrain.streets, zoning, hashSeed(terrain.seed)), [terrain.districts, terrain.streets, zoning, terrain.seed]);
  useEffect(() => viewRef.current?.setBuildings(plans, terrain.columns.n), [plans, terrain.columns.n]);
  // The inhabitants, once the parks (and so the finished ground) are there.
  const life = useMemo(
    () => (terrain.parks ? new Life(terrain.districts.claims.claim, terrain.parks, plans, terrain.streets.plazas[0], terrain.streets.streets, hashSeed(terrain.seed), LIFE) : null),
    [terrain.parks, terrain.districts, terrain.streets, plans, terrain.seed],
  );
  useEffect(() => viewRef.current?.setLife(life), [life]);
  useEffect(() => viewRef.current?.setShowLife(state.showLife), [state.showLife]);
  useEffect(() => viewRef.current?.setParks(terrain.parks), [terrain.parks]);
  useEffect(() => {
    const { n, height } = terrain.columns;
    viewRef.current?.setNetwork(terrain.hubs, terrain.streets, (x, z) => height[Math.min(n - 1, Math.max(0, Math.round(z))) * n + Math.min(n - 1, Math.max(0, Math.round(x)))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain.hubs, terrain.streets, terrain.columns]);
  useEffect(() => viewRef.current?.setNetworkVisible(state.showNetwork), [state.showNetwork]);
  useEffect(() => viewRef.current?.setLook(state.params.look.grid), [state.params.look]);
  // The open panel (title, seed and settings) covers the view's left side (16.2rem wide, 1rem
  // from the edge): the city slides into the part still in view.
  useEffect(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    viewRef.current?.setInsetLeft(panelOpen && window.innerWidth >= 640 ? 17.2 * rem * UI_SCALE : 0);
  }, [panelOpen]);

  /** The city is rebuilding: a settings change is being applied, or its districts are still coming. */
  const busy = generating || !!terrain.pendingDistricts;
  const river = terrain.river.path;
  const available = useMemo(
    () => ({
      overview: true,
      plaza: terrain.streets.plazas.length > 0,
      park: !!terrain.parks?.parks.some((pk) => pk.props.length > 0),
      river: !!river && river.curve.length >= 40,
      street: terrain.streets.streets.some((st) => st.kind === "main" && st.curve.length >= 20),
    }),
    [terrain.streets, terrain.parks, river],
  );

  // The shortcuts sheet, and the tour: on a first visit it starts a moment after the city is built.
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const [touring, setTouring] = useState(false);
  const tourOffered = useRef(false);
  useEffect(() => {
    if (!built || busy || tourOffered.current) return;
    tourOffered.current = true;
    if (tourSeen()) return;
    const timer = setTimeout(() => setTouring(true), 900);
    return () => clearTimeout(timer);
  }, [built, busy]);

  const canFollow = !!selection && selection.kind !== "building";
  const follow = useMemo(() => ({ can: canFollow, on: following, onToggle: () => setFollow(!following) }), [canFollow, following, setFollow]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-stage">
      <div ref={mountRef} className="absolute inset-0" />
      {/* The whole interface is drawn at UI_SCALE (80%), so it takes less of the view. */}
      <div className="pointer-events-none absolute inset-0" style={{ zoom: UI_SCALE }}>
        <TerrainPanel terrain={terrain} zoning={zoning} life={life} ctl={ctl} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} busy={busy} />
        <CameraBar view={view} available={available} onFly={flyTo} shown={overlays} follow={follow} onHelp={openHelp} />
        {overlays && (
          <Inspector
            view={viewRef.current}
            selection={selection}
            following={following}
            life={life}
            plans={plans}
            lots={terrain.districts.lots}
            scale={UI_SCALE}
            onClose={closeInspector}
            onFollow={setFollow}
          />
        )}
        {overlays && touring && <Tour selection={selection} scale={UI_SCALE} panelOpen={panelOpen} setPanelOpen={setPanelOpen} onClose={() => setTouring(false)} />}
        {/* While the city rebuilds: a quiet note at the top of the view, over the part the panel leaves. */}
        <div
          className={"absolute top-4 flex justify-center transition-[left,opacity] duration-300 " + (busy ? "opacity-100" : "opacity-0")}
          style={{ left: panelOpen ? "18.2rem" : "1rem", right: "5rem" }}
          aria-live="polite"
        >
          <div className={"flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] text-[#dce8f5] " + GLASS}>
            <Spinner className="h-3.5 w-3.5" />
            {busy ? "Rebuilding the city…" : ""}
          </div>
        </div>
        {/* Hidden rather than removed with E, so the print keeps its place. Clear of the open panel. */}
        <div
          className={"absolute bottom-4 right-4 flex justify-center transition-[left] duration-300 " + (overlays ? "" : "hidden")}
          style={{ left: panelOpen ? "18.2rem" : "1rem" }}
        >
          <PrintBar replayKey={terrain.seed} onChange={setPrint} />
        </div>
      </div>
      {/* Outside the zoom: a modal dialog in the top layer takes clicks in the wrong place under it. */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} onTour={() => setTouring(true)} />
    </div>
  );
}
