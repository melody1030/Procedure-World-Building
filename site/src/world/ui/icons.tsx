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

export const WaterIcon = () => (
  <svg {...props}>
    <path d="M3 8c2 0 2-1.5 4.5-1.5S10 8 12 8s2.5-1.5 4.5-1.5S19 8 21 8" />
    <path d="M3 13c2 0 2-1.5 4.5-1.5S10 13 12 13s2.5-1.5 4.5-1.5S19 13 21 13" />
    <path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18" />
  </svg>
);

export const CubeIcon = () => (
  <svg {...props}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
  </svg>
);

export const SwatchIcon = () => (
  <svg {...props}>
    <rect x="3" y="3" width="8" height="8" rx="1" />
    <rect x="13" y="3" width="8" height="8" rx="1" />
    <rect x="3" y="13" width="8" height="8" rx="1" />
    <rect x="13" y="13" width="8" height="8" rx="1" />
  </svg>
);

export const MoodIcon = () => (
  <svg {...props}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);

export const SunIcon = () => (
  <svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const GlowIcon = () => (
  <svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="7" strokeDasharray="2 3" />
  </svg>
);

export const FogIcon = () => (
  <svg {...props}>
    <path d="M4 8h12M7 12h13M4 16h10M9 20h8" />
  </svg>
);

export const LensIcon = () => (
  <svg {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4 12h16" strokeDasharray="2 2" />
  </svg>
);

export const RainIcon = () => (
  <svg {...props}>
    <path d="M7 4l-2 5M13 4l-2 5M19 4l-2 5M10 13l-2 5M16 13l-2 5" />
  </svg>
);

export const DistrictIcon = () => (
  <svg {...props}>
    <path d="M3 3h18v18H3z" />
    <path d="M3 13l6-3 3-7M9 10l4 11M13 21l2-9 6-2M15 12l-3-9" />
  </svg>
);

export const RoadIcon = () => (
  <svg {...props}>
    <path d="M4 21c0-7 8-8 8-15V3M12 21c0-7 8-8 8-15V3" />
    <path d="M8 21c0-7 8-8 8-15V3" strokeDasharray="2 3" />
  </svg>
);

export const BridgeIcon = () => (
  <svg {...props}>
    <path d="M2 10h20M5 10v10M19 10v10M2 14c4-3 6-3 10 0s6 3 10 0" />
  </svg>
);

export const MapIcon = () => (
  <svg {...props}>
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);

export const BuildingIcon = () => (
  <svg {...props}>
    <path d="M4 21V9l5-3v15M9 21V3h7v18M16 21v-9h4v9M3 21h18" />
  </svg>
);

export const TreeIcon = () => (
  <svg {...props}>
    <path d="M12 3l6 9h-4l4 6H6l4-6H6z" />
    <path d="M12 18v3" />
  </svg>
);

export const PropsIcon = () => (
  <svg {...props}>
    <path d="M6 21V5h4M10 5v3" />
    <circle cx="10" cy="10" r="2" />
    <path d="M14 21v-6h6v6M17 15v-3" />
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
