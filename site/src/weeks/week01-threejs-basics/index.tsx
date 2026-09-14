import { useState } from "react";
import ControlsPanel from "./ControlsPanel";
import RotateToggle from "./RotateToggle";
import Scene3D from "./Scene3D";
import { defaultWeek1BasicsState } from "./config";
import type { Week1BasicsState } from "./types";
import "./week01-basics.css";

export default function Week01ThreejsBasics() {
  const [state, setState] = useState<Week1BasicsState>(defaultWeek1BasicsState);

  const onChange = (patch: Partial<Week1BasicsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="week01-basics">
      <Scene3D state={state} />
      <ControlsPanel state={state} onChange={onChange} />
      <RotateToggle autoRotate={state.autoRotate} onToggle={() => onChange({ autoRotate: !state.autoRotate })} />
    </div>
  );
}
