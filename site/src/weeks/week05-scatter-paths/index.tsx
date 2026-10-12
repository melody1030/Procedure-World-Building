import { useEffect, useMemo, useState } from "react";
import { useWeekConfig } from "../../firebase/weekConfig";
import { LAYER_IDS } from "./config";
import { buildPaths } from "./paths";
import { scatterLayer, type LayerResult } from "./scatter";
import { sanitize, useWeek05State } from "./state";
import { generateHeightmap } from "./terrain";
import type { LayerId } from "./types";
import Viewport from "./Viewport";
import ViewportControls from "./ViewportControls";
import WorldPanel from "./WorldPanel";

const WIDE = "(min-width: 768px)";

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

export default function Week05ScatterPaths() {
  const studio = useWeek05State();
  const { state } = studio;
  const wide = useIsWide();
  // Starts closed on narrow screens, where it opens as an overlay.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia(WIDE).matches);
  const [frameToken, setFrameToken] = useState(0);

  // The pipeline, in order: terrain → paths (which deform it) → scatter layers on the result.
  const { seed, relief, scale } = state.terrain;
  const base = useMemo(() => generateHeightmap(state.terrain), [seed, relief, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => buildPaths(base, state.paths, seed), [base, state.paths, seed]);
  const scatter = useMemo(
    () => Object.fromEntries(LAYER_IDS.map((id) => [id, scatterLayer(id, state.layers[id], paths.map, paths, state.paths, seed)])) as Record<LayerId, LayerResult>,
    [paths, state.layers, state.paths, seed],
  );

  useWeekConfig(
    "week05",
    () => ({ terrain: state.terrain, layer: state.layer, layers: state.layers, paths: state.paths, particles: state.particles }),
    (raw) => studio.load(sanitize(raw)),
  );

  // On narrow screens the open panel covers the stage, so the other overlays step aside.
  const overlays = wide || !panelOpen;

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-2xl">
      <Viewport state={state} map={paths.map} paths={paths} scatter={scatter} frameToken={frameToken} />
      <div className="pointer-events-none absolute inset-0">
        <WorldPanel studio={studio} scatter={scatter} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
        {overlays && <ViewportControls studio={studio} onFrame={() => setFrameToken((t) => t + 1)} />}
      </div>
    </div>
  );
}
