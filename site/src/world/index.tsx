import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcutToggle } from "../components/SidePanel";
import { generate, type WorldModel } from "./pipeline";
import { WorldView } from "./render/WorldView";
import { useWorldState } from "./state";
import { ControlBar } from "./ui/ControlBar";
import { WorldPanel } from "./ui/WorldPanel";
import { TitleCard } from "./ui/TitleCard";

/** Wide enough for the control bar to sit beside an open pipeline panel. */
const WIDE = "(min-width: 1180px)";
/** Seconds for the whole growth timeline when playing. */
const GROWTH_SECONDS = 16;

function useIsWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * Blueprint City: one procedural world, full screen. The seed and the settings run the pipeline
 * into a WorldModel, and WorldView draws it. The settings panel has one tab per course topic, so
 * every week's technique can be tuned in the finished world; press E to hide all overlays.
 */
export default function WorldPage() {
  const ctl = useWorldState();
  const { state, setSeed, toggleLayer, setGrowth, setPlaying } = ctl;
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const [overlays, setOverlays] = useState(true);
  const wide = useIsWide();
  const [panelOpen, setPanelOpen] = useState(wide);
  useShortcutToggle(overlays, () => setOverlays((v) => !v));

  // The last world, so a settings change reruns only the stages from the one it touches.
  const previousRef = useRef<WorldModel | null>(null);
  const world = useMemo(() => {
    const next = generate(state.seed, state.params, previousRef.current);
    previousRef.current = next;
    return next;
  }, [state.seed, state.params]);

  useEffect(() => {
    const view = new WorldView(mountRef.current!);
    viewRef.current = view;
    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.setWorld(world);
    console.info(`[world] ${world.name} (seed "${world.seed}")`, world);
    const url = `/world?seed=${encodeURIComponent(world.seed)}`;
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [world]);

  useEffect(() => viewRef.current?.setLayers(state.layers), [state.layers, world]);
  useEffect(() => viewRef.current?.setGrowth(state.growth), [state.growth, world]);
  useEffect(() => viewRef.current?.setRender(state.render), [state.render]);

  // Playing: advance the timeline every frame until the city is complete.
  const growthRef = useRef(state.growth);
  growthRef.current = state.growth;
  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = growthRef.current + (now - last) / 1000 / GROWTH_SECONDS;
      last = now;
      setGrowth(next);
      if (next >= 1) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.playing]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-stage">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        {overlays && <TitleCard world={world} onSeed={setSeed} />}
        {/* On narrower screens the open panel would cover the control bar, so the bar steps aside. */}
        {overlays && (wide || !panelOpen) && (
          <ControlBar
            world={world}
            layers={state.layers}
            onToggle={toggleLayer}
            growth={state.growth}
            playing={state.playing}
            onGrowth={(t) => {
              setPlaying(false);
              setGrowth(t);
            }}
            onPlay={setPlaying}
          />
        )}
        <WorldPanel world={world} ctl={ctl} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
      </div>
    </div>
  );
}
