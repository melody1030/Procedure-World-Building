import { glassCardClass, RangeInput, Select } from "../../components/controls";

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];
const buttonClass = "flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors";

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
    <div className={"absolute right-4 top-4 z-10 flex w-[220px] flex-col items-stretch gap-3 p-4 " + glassCardClass}>
      <RangeInput
        min={0}
        max={maxTimelineDroplets}
        step={1}
        value={Math.min(dropletCount, maxTimelineDroplets)}
        onChange={(e) => onSeek(parseInt(e.target.value, 10))}
        title="Simulation timeline — drag to jump to that point"
      />
      <div className="flex items-center justify-between">
        <Select
          compact
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          title="Simulation speed"
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </Select>
        <button
          className={buttonClass + " h-11 w-11 border border-cyan-400/60 bg-cyan-500/20 text-lg text-cyan-200 hover:bg-cyan-500/30"}
          onClick={onTogglePlay}
          title={isSimulating ? "Pause erosion" : "Play erosion"}
        >
          {isSimulating ? "❙❙" : "▶"}
        </button>
        <button
          className={buttonClass + " h-8 w-8 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-200"}
          onClick={onReset}
          title="Reset to raw noise"
        >
          ↺
        </button>
      </div>
      <div className="flex flex-col items-center gap-0.5 whitespace-nowrap text-[11px] uppercase tracking-wider text-slate-500">
        <span>Hydraulic Erosion</span>
        <span className="font-mono normal-case tracking-normal tabular-nums text-cyan-300">{dropletCount.toLocaleString()} droplets</span>
      </div>
    </div>
  );
}
