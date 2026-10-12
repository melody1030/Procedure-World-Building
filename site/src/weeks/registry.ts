import type { ComponentType } from "react";
import Week01ThreejsBasics from "./week01-threejs-basics";
import Week02NoiseGrid from "./week02-noise-grid";
import Week03VoxelsVolumes from "./week03-voxels-volumes";
import Week04ShaderStudio from "./week04-shaders";
import Week05ScatterPaths from "./week05-scatter-paths";

export interface Week {
  id: string;
  title: string;
  Component: ComponentType;
}

// Add one entry per week here as the class progresses.
export const weeks: Week[] = [
  { id: "week01", title: "Week 1 — Three.js Basics", Component: Week01ThreejsBasics },
  { id: "week02", title: "Week 2 — Noise Grid", Component: Week02NoiseGrid },
  { id: "week03", title: "Week 3 — Voxels & Volumes", Component: Week03VoxelsVolumes },
  { id: "week04", title: "Week 4 — Shader Studio", Component: Week04ShaderStudio },
  { id: "week05", title: "Week 5 — Scatter & Paths", Component: Week05ScatterPaths },
];
