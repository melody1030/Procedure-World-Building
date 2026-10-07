/** Inline SVG icons for the world panel's section headings, drawn like the weeks' icons. */

const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IslandIcon = () => (
  <svg {...props}>
    <path d="M3 17c2 0 2-1 4.5-1S10 17 12 17s2.5-1 4.5-1 2.5 1 4.5 1" />
    <path d="M6 14c1-4 3.5-7 6-7s5 3 6 7" />
  </svg>
);

export const NoiseIcon = () => (
  <svg {...props}>
    <path d="M3 15l3-5 3 3 4-7 3 6 2-2 3 5" />
    <path d="M3 20h18" />
  </svg>
);

export const ErosionIcon = () => (
  <svg {...props}>
    <path d="M12 3s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10z" />
  </svg>
);

export const TerraceIcon = () => (
  <svg {...props}>
    <path d="M3 20h18M3 20v-4h5v-4h5V8h5V4h3" />
  </svg>
);

export const StatsIcon = () => (
  <svg {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
);

export const InfoIcon = () => (
  <svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h0" />
  </svg>
);

export const ResetIcon = ({ className = "h-4 w-4 shrink-0" }: { className?: string }) => (
  <svg {...props} className={className}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
