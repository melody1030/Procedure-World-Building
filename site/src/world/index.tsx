import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcutToggle } from "../components/SidePanel";
import { generate, type WorldModel } from "./pipeline";
import { WorldView } from "./render/WorldView";
import { useWorldState } from "./state";
import { TitleCard } from "./ui/TitleCard";
import { WorldPanel } from "./ui/WorldPanel";

/**
 * Blueprint City: one procedural world, full screen. The seed and the settings run the pipeline
 * into a WorldModel, and WorldView draws it. For now the world is the terrain alone; press E to
 * hide the overlays.
 */
export default function WorldPage() {
  const ctl = useWorldState();
  const { state, setSeed } = ctl;
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<WorldView | null>(null);
  const [overlays, setOverlays] = useState(true);
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
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

  useEffect(() => viewRef.current?.setTerraces(state.terraces), [state.terraces, world]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-stage">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0">
        {overlays && <TitleCard world={world} onSeed={setSeed} />}
        <WorldPanel world={world} ctl={ctl} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
      </div>
    </div>
  );
}
