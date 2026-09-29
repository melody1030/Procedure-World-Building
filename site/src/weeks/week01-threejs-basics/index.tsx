import { useState } from "react";
import { useWeekConfig, withDefaults } from "../../firebase/weekConfig";
import ControlsPanel from "./ControlsPanel";
import RotateToggle from "./RotateToggle";
import Scene3D from "./Scene3D";
import { defaultWeek1BasicsState } from "./config";
import type { Week1BasicsState } from "./types";

export default function Week01ThreejsBasics() {
  const [state, setState] = useState<Week1BasicsState>(defaultWeek1BasicsState);

  const onChange = (patch: Partial<Week1BasicsState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  useWeekConfig(
    "week01",
    () => state,
    (data) => setState(withDefaults(defaultWeek1BasicsState, data)),
  );

  return (
    <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-2xl">
      <Scene3D state={state} />
      <ControlsPanel state={state} onChange={onChange} />
      <RotateToggle autoRotate={state.autoRotate} onToggle={() => onChange({ autoRotate: !state.autoRotate })} />
    </div>
  );
}
