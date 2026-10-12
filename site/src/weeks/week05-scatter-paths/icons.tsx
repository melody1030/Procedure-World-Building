import type { ReactNode } from "react";

/** Inline SVG icons: 24x24 viewBox, stroke in currentColor, round caps and joins (STYLE_GUIDE section 10). */

function Svg({ className = "h-4 w-4", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const LayersIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
);

export const ScatterIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="6" cy="7" r="1.6" />
    <circle cx="15" cy="5" r="1.6" />
    <circle cx="11" cy="12" r="1.6" />
    <circle cx="18" cy="14" r="1.6" />
    <circle cx="6" cy="17" r="1.6" />
    <circle cx="13" cy="19" r="1.6" />
  </Svg>
);

export const RulesIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />
  </Svg>
);

export const VariationIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 20l4-9 4 9" />
    <path d="M12 20l3-6 3 6" />
    <path d="M16 6l2-3 2 3" />
  </Svg>
);

export const StatsIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 20V10M12 20V4M19 20v-7" />
  </Svg>
);

export const PathIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="5" cy="18" r="2" />
    <circle cx="19" cy="6" r="2" />
    <path d="M7 18c6 0 3-12 10-12" />
  </Svg>
);

export const RoadIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M8 3L4 21M16 3l4 18M12 4v3M12 11v3M12 18v2" />
  </Svg>
);

export const RiverIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 8c3-2 6 2 9 0s6-2 9 0" />
    <path d="M3 13c3-2 6 2 9 0s6-2 9 0" />
    <path d="M3 18c3-2 6 2 9 0s6-2 9 0" />
  </Svg>
);

export const InfluenceIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 17c4 0 5-6 9-6s5 6 9 6" />
    <path d="M12 3v5M9.5 6L12 8.5 14.5 6" />
  </Svg>
);

export const ParticlesIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M7 4l-2 4M13 3l-2 4M19 4l-2 4M9 12l-2 4M15 11l-2 4M11 18l-1 2M17 17l-1 2" />
  </Svg>
);

export const WindIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M3 8h11a3 3 0 1 0-3-3" />
    <path d="M3 12h15a3 3 0 1 1-3 3" />
    <path d="M3 16h6" />
  </Svg>
);

export const InfoIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const ResetIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7" />
    <path d="M4 4v4h4" />
  </Svg>
);

export const FrameIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const MountainIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M2 20h20L15 7l-3.5 6L9 10z" />
  </Svg>
);

export const DiceIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" strokeWidth={2.6} />
  </Svg>
);
