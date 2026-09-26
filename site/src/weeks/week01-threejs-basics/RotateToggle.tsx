import { fieldDescriptions } from "./config";

interface RotateToggleProps {
  autoRotate: boolean;
  onToggle: () => void;
}

export default function RotateToggle({ autoRotate, onToggle }: RotateToggleProps) {
  return (
    <button
      className="absolute right-4 top-4 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-slate-700/50 bg-slate-900/70 text-sm text-slate-300 shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:text-cyan-300"
      onClick={onToggle}
      title={fieldDescriptions.autoRotate}
      aria-label={autoRotate ? "Pause rotation" : "Play rotation"}
    >
      {autoRotate ? "❙❙" : "▶"}
    </button>
  );
}
