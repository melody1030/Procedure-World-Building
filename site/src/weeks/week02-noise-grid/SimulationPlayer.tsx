const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

interface SimulationPlayerProps {
  isSimulating: boolean;
  dropletCount: number;
  maxTimelineDroplets: number;
  speed: number;
  onTogglePlay: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (dropletCount: number) => void;
}

export default function SimulationPlayer({
  isSimulating,
  dropletCount,
  maxTimelineDroplets,
  speed,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onSeek,
}: SimulationPlayerProps) {
  return (
    <div className="simulation-player">
      <input
        type="range"
        className="sp-timeline"
        min={0}
        max={maxTimelineDroplets}
        step={1}
        value={Math.min(dropletCount, maxTimelineDroplets)}
        onChange={(e) => onSeek(parseInt(e.target.value, 10))}
        title="Simulation timeline — drag to jump to that point"
      />
      <div className="simulation-player-transport">
        <select
          className="sp-speed-select"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          title="Simulation speed"
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
        <button className="sp-btn sp-btn-play" onClick={onTogglePlay} title={isSimulating ? "Pause erosion" : "Play erosion"}>
          {isSimulating ? "❙❙" : "▶"}
        </button>
        <button className="sp-btn sp-btn-reset" onClick={onReset} title="Reset to raw noise">
          ↺
        </button>
      </div>
      <div className="simulation-player-label">
        <span>Hydraulic Erosion</span>
        <span className="simulation-player-count">{dropletCount.toLocaleString()} droplets</span>
      </div>
    </div>
  );
}
