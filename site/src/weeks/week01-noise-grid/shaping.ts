import type { ShapingType } from "./types";

export interface ShapingConfigEntry {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  default: number;
  amountLabel: string;
}

export const shapingConfig: Record<ShapingType, ShapingConfigEntry> = {
  none: {
    label: "None",
    description: "No shaping — the raw noise values are used as-is.",
    min: 0,
    max: 1,
    step: 1,
    default: 0,
    amountLabel: "—",
  },
  power: {
    label: "Power (Redistribution)",
    description:
      "Raises each value to this exponent. Above 1, valleys sink and lowlands flatten out (more ocean-like); below 1, lowlands rise and peaks flatten.",
    min: 0.2,
    max: 4,
    step: 0.1,
    default: 1.8,
    amountLabel: "Exponent",
  },
  terrace: {
    label: "Terrace (Steps)",
    description:
      "Snaps values into this many discrete height bands, creating stepped, terraced terrain instead of a smooth slope.",
    min: 2,
    max: 20,
    step: 1,
    default: 8,
    amountLabel: "Steps",
  },
  ridge: {
    label: "Ridge",
    description:
      "Folds values around the midpoint into ridge lines. Higher sharpness makes the ridges narrower and crisper.",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.4,
    amountLabel: "Sharpness",
  },
};

/** Applies the chosen shaping curve to a [0, 1] noise value. Returns [0, 1]. */
export function applyShaping(value: number, type: ShapingType, amount: number): number {
  switch (type) {
    case "none":
      return value;
    case "power":
      return Math.pow(value, amount);
    case "terrace": {
      const steps = Math.max(1, Math.round(amount));
      return Math.round(value * steps) / steps;
    }
    case "ridge": {
      const ridge = 1 - Math.abs(2 * value - 1);
      return Math.pow(ridge, 1 + amount * 3);
    }
  }
}
