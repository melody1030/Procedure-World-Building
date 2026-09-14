import type { ComponentType } from "react";
import Week01ThreejsBasics from "./week01-threejs-basics";
import Week02NoiseGrid from "./week02-noise-grid";

export interface Week {
  id: string;
  title: string;
  Component: ComponentType;
}

// Add one entry per week here as the class progresses.
export const weeks: Week[] = [
  { id: "week01", title: "Week 1 — Three.js Basics", Component: Week01ThreejsBasics },
  { id: "week02", title: "Week 2 — Noise Grid", Component: Week02NoiseGrid },
];
