import { useRef, useState } from "react";
import ControlsPanel from "./ControlsPanel";
import NoiseMap2D from "./NoiseMap2D";
import GridScene3D from "./GridScene3D";
import type { GridScene3DHandle } from "./GridScene3D";
import SimulationPlayer from "./SimulationPlayer";
import { createRng, defaultErosionParams, erodeDroplets, generateHeightField } from "./erosion";
import { defaultWeek1State } from "./config";
import type { MapCell, Week1State } from "./types";
import "./week02.css";

// Around half a droplet per grid node is roughly where this simulation's erosion settles into
// a detailed, channel-carved equilibrium (matches the ratio used in the reference Lague-style
// demos); scaling the timeline's max to the current resolution keeps that same "well eroded but
// still recognizable" endpoint no matter how coarse or fine the grid is set — a fixed droplet
// count either does nothing on a fine grid or flattens a coarse one to a plane.
const DROPLETS_PER_NODE = 0.5;
const EROSION_SEED = 1337;

export default function Week02NoiseGrid() {
  const [state, setState] = useState<Week1State>(defaultWeek1State);
  const [hoverCell, setHoverCell] = useState<MapCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<MapCell | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [dropletCount, setDropletCount] = useState(0);
  const [speed, setSpeed] = useState(1);
  const gridRef = useRef<GridScene3DHandle>(null);

  // The height field is the shared source of truth for elevation: it starts
  // as a straight sample of the noise/shaping stack, then the erosion
  // simulation mutates it in place. Regenerated (fresh from noise) whenever
  // the noise/shaping/resolution params change, computed synchronously here
  // during render (guarded by reference comparison, so it doesn't redo the
  // O(resolution^2) noise sampling on every unrelated re-render) so both
  // children always see a field that matches `state`.
  const heightFieldRef = useRef<Float32Array | null>(null);
  const prevStateRef = useRef<Week1State | null>(null);
  if (prevStateRef.current !== state) {
    heightFieldRef.current = generateHeightField(state.resolution, state);
    prevStateRef.current = state;
    if (dropletCount !== 0) setDropletCount(0);
  }
  const heightField = heightFieldRef.current!;
  const maxTimelineDroplets = Math.round((state.resolution + 1) ** 2 * DROPLETS_PER_NODE);

  const onChange = (patch: Partial<Week1State>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectCell = (cell: MapCell) => {
    setSelectedCell(cell);
    gridRef.current?.centerOn(cell);
  };

  const handleClearSelection = () => setSelectedCell(null);

  const handleResetSimulation = () => {
    heightFieldRef.current = generateHeightField(state.resolution, state);
    setDropletCount(0);
    setIsSimulating(false);
  };

  // Erosion is seeded and deterministic, so "seeking" the timeline just means
  // replaying from raw noise up to the target droplet count — scrubbing
  // pauses playback, same as a video player.
  const handleSeek = (targetCount: number) => {
    const field = generateHeightField(state.resolution, state);
    const rng = createRng(EROSION_SEED);
    erodeDroplets(field, state.resolution, targetCount, defaultErosionParams, rng);
    heightFieldRef.current = field;
    setDropletCount(targetCount);
    setIsSimulating(false);
  };

  return (
    <div className="week02">
      <GridScene3D
        ref={gridRef}
        state={state}
        heightField={heightField}
        hoverCell={hoverCell}
        selectedCell={selectedCell}
        isSimulating={isSimulating}
        speed={speed}
        dropletCount={dropletCount}
        maxDropletCount={maxTimelineDroplets}
        onDropletCountChange={setDropletCount}
        onReachMaxDropletCount={() => setIsSimulating(false)}
      />
      <SimulationPlayer
        isSimulating={isSimulating}
        dropletCount={dropletCount}
        maxTimelineDroplets={maxTimelineDroplets}
        speed={speed}
        onTogglePlay={() => setIsSimulating((prev) => !prev)}
        onReset={handleResetSimulation}
        onSpeedChange={setSpeed}
        onSeek={handleSeek}
      />
      <ControlsPanel
        state={state}
        onChange={onChange}
        onResetCamera={() => gridRef.current?.resetCamera()}
        onCameraPreset={(preset) => gridRef.current?.setCameraPreset(preset)}
      />
      <NoiseMap2D
        heightField={heightField}
        resolution={state.resolution}
        isSimulating={isSimulating}
        hoverCell={hoverCell}
        selectedCell={selectedCell}
        onHoverCell={setHoverCell}
        onSelectCell={handleSelectCell}
        onClearSelection={handleClearSelection}
      />
    </div>
  );
}
