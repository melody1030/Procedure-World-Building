import { useRef, useState } from "react";
import ControlsPanel from "./ControlsPanel";
import NoiseMap2D from "./NoiseMap2D";
import GridScene3D from "./GridScene3D";
import type { GridScene3DHandle } from "./GridScene3D";
import { defaultWeek1State } from "./config";
import type { Week1State } from "./types";
import "./week01.css";

export default function Week01NoiseGrid() {
  const [state, setState] = useState<Week1State>(defaultWeek1State);
  const gridRef = useRef<GridScene3DHandle>(null);

  const onChange = (patch: Partial<Week1State>) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="week01">
      <GridScene3D ref={gridRef} state={state} />
      <ControlsPanel
        state={state}
        onChange={onChange}
        onResetCamera={() => gridRef.current?.resetCamera()}
        onCameraPreset={(preset) => gridRef.current?.setCameraPreset(preset)}
      />
      <NoiseMap2D state={state} />
    </div>
  );
}
