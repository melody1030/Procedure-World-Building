/** Inline SVG icons for the terrain panel's section headings, drawn like the weeks' icons. */

const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const NoiseIcon = () => (
  <svg {...props}>
    <path d="M3 15l3-5 3 3 4-7 3 6 2-2 3 5" />
    <path d="M3 20h18" />
  </svg>
);

export const GridIcon = () => (
  <svg {...props}>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
  </svg>
);

export const ShapingIcon = () => (
  <svg {...props}>
    <path d="M3 20h18" />
    <path d="M4 20c4 0 5-14 8-14s4 14 8 14" />
  </svg>
);

export const TerraceIcon = () => (
  <svg {...props}>
    <path d="M3 20h18M3 20v-4h5v-4h5V8h5V4h3" />
  </svg>
);

export const SurfaceIcon = () => (
  <svg {...props}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
);

export const RiverIcon = () => (
  <svg {...props}>
    <path d="M7 3c0 5 6 5 6 9s-6 4-6 9" />
    <path d="M13 3c0 4 5 5 5 9s-5 5-5 9" />
  </svg>
);

export const TownIcon = () => (
  <svg {...props}>
    <path d="M3 21h18" />
    <path d="M5 21V11l4-3 4 3v10" />
    <path d="M13 21V7l3-3 3 3v14" />
  </svg>
);

export const ResetIcon = ({ className = "h-4 w-4 shrink-0" }: { className?: string }) => (
  <svg {...props} className={className}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
