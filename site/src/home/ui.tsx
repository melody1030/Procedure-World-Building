import type { AnchorHTMLAttributes, ReactNode } from "react";

/** Pieces the homepage's three tabs share: icons, the call-to-action button and section headings. */

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function CubeIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
    </svg>
  );
}

export function MountainIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M2 19.5h20L15 6.5l-3.2 5.6L9 8.5z" />
      <path d="M5 19.5l4-6.5 3 4.5M13.5 16l2-3 3.5 6.5" />
    </svg>
  );
}

export function VoxelIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
      <path d="M7.75 4.9l8.5 4.72v9.5M16.25 4.9l-8.5 4.72v9.5M3.5 12l8.5 4.75L20.5 12" strokeOpacity={0.55} />
    </svg>
  );
}

export function ShaderSphereIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M3.4 15.2c5.4 2 11.8 2 17.2 0M2.6 10.4c6.1 1.7 12.7 1.7 18.8 0" />
      <path d="M8 5.6c2.3-1.2 5.2-1.1 7.4.3" strokeOpacity={0.55} />
    </svg>
  );
}

export function ScatterPathIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M3 20c5 0 4-8 9-8s4-8 9-8" />
      <path d="M6 8.5l1.5-3.5L9 8.5zM15.5 19l1.5-3.5 1.5 3.5z" />
      <circle cx="4.5" cy="13" r="0.9" />
      <circle cx="19.5" cy="11" r="0.9" />
      <circle cx="10" cy="19" r="0.9" />
    </svg>
  );
}

export function BuildingIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M4 21.5V9l5-3v15.5M9 21.5V3.5l6 3v15M15 21.5V11l5 2.5v8M2.5 21.5h19" />
      <path d="M11.5 8.5h1M11.5 11.5h1M11.5 14.5h1M6.5 12h0.5M6.5 15h0.5M17 15h1M17 18h1" />
    </svg>
  );
}

export function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...iconProps} strokeWidth={1.8} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.8} className="h-5 w-5">
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

export function DocumentIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.6} className="h-5 w-5">
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h7" />
    </svg>
  );
}

export function IslandIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.6} className="h-5 w-5">
      <path d="M2.5 19.5c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 3-1" />
      <path d="M5 16.5V13h3v-3h3V6.5h3V10h3v6.5" />
    </svg>
  );
}

export function CompassIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.6} className="h-7 w-7">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

/**
 * Call-to-action button: icon, label and an arrow that slides on hover, the same glow, lift and
 * focus ring everywhere. `primary` only swaps the colours.
 */
export function HeroButton({ primary = false, icon, label, ...link }: { primary?: boolean; icon: ReactNode; label: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const tone = primary
    ? "bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.25)] hover:bg-cyan-300 hover:shadow-[0_0_32px_rgba(34,211,238,0.45)]"
    : "border border-cyan-400/50 bg-slate-950/40 text-cyan-300 hover:border-cyan-300 hover:bg-cyan-500/10 hover:shadow-[0_0_18px_rgba(34,211,238,0.25)]";
  return (
    <a
      {...link}
      className={`group flex items-center justify-center gap-3 rounded-xl [&>svg]:shrink-0 px-5 py-3.5 font-sans text-[15px] font-medium transition duration-200 ease-in-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:translate-y-0 ${tone}`}
    >
      {icon}
      {label}
      <ArrowIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </a>
  );
}

/** A section's eyebrow (small caps, cyan rule) and title. */
export function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <p className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <span className="h-px w-8 bg-cyan-400" />
        {eyebrow}
      </p>
      <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">{title}</h2>
      {children && <div className="mt-4 text-[15px] leading-relaxed text-slate-400">{children}</div>}
    </div>
  );
}

/** A screenshot in a rounded frame, with an optional caption under it. */
export function Shot({ src, alt, caption, className = "aspect-[16/10]" }: { src: string; alt: string; caption?: string; className?: string }) {
  return (
    <figure className="flex flex-col gap-2.5">
      <div className={`overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 ${className}`}>
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      </div>
      {caption && <figcaption className="text-[12px] leading-relaxed text-slate-500">{caption}</figcaption>}
    </figure>
  );
}

/** Opens in a new tab (GitHub, docs). */
export const external = { target: "_blank", rel: "noreferrer" } as const;

/** The repository's files on GitHub. */
export const REPO = "https://github.com/melody1030/Procedure-World-Building/blob/main/";
