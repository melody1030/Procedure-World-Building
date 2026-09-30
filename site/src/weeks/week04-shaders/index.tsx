import { useEffect, useMemo, useState } from "react";
import { useWeekConfig } from "../../firebase/weekConfig";
import { composeShader } from "./shader/composeShader";
import ShaderPanel from "./ShaderPanel";
import { sanitize, useStudioState } from "./state";
import Viewport from "./Viewport";
import ViewportControls from "./ViewportControls";

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

export default function Week04ShaderStudio() {
  const studio = useStudioState();
  const { state } = studio;
  const wide = useIsWide();
  // Starts closed on narrow screens, where it opens as an overlay.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia(WIDE).matches);
  const [frameToken, setFrameToken] = useState(0);

  // Only the technique changes the GLSL; every slider is a uniform.
  const composed = useMemo(() => composeShader(state.technique), [state.technique]);

  useWeekConfig(
    "week04",
    () => ({ technique: state.technique, params: state.params, viewport: state.viewport }),
    (raw) => studio.load(sanitize(raw)),
  );

  // On narrow screens the open panel covers the stage, so the other overlays step aside.
  const overlays = wide || !panelOpen;

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-2xl">
      <Viewport composed={composed} params={state.params} viewport={state.viewport} frameToken={frameToken} />
      <div className="pointer-events-none absolute inset-0">
        <ShaderPanel studio={studio} open={panelOpen} onToggle={() => setPanelOpen((v) => !v)} />
        {overlays && <ViewportControls studio={studio} onFrame={() => setFrameToken((t) => t + 1)} />}
      </div>
    </div>
  );
}
