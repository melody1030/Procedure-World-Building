import type { ComponentType } from "react";
import Week01NoiseGrid from "./week01-noise-grid";

export interface Week {
  id: string;
  title: string;
  Component: ComponentType;
}

// Add one entry per week here as the class progresses.
export const weeks: Week[] = [
  { id: "week01", title: "Week 1 — Noise Grid", Component: Week01NoiseGrid },
];
