import { fieldDescriptions } from "./config";

interface RotateToggleProps {
  autoRotate: boolean;
  onToggle: () => void;
}

export default function RotateToggle({ autoRotate, onToggle }: RotateToggleProps) {
  return (
    <button
      className="rotate-toggle"
      onClick={onToggle}
      title={fieldDescriptions.autoRotate}
      aria-label={autoRotate ? "Pause rotation" : "Play rotation"}
    >
      {autoRotate ? "❙❙" : "▶"}
    </button>
  );
}
