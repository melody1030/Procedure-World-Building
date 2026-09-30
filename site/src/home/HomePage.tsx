import type { ReactNode } from "react";
import { ChromaGrid, chromaCardClass, trackChromaCard } from "../components/ChromaGrid";
import CursorGrid from "../components/CursorGrid";
import { linkProps } from "../router";
import HeroCity from "./HeroCity";

const DOCS_URL = "https://github.com/melody1030/Procedure-World-Building#readme";

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function CubeIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
    </svg>
  );
}

function MountainIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M2 19.5h20L15 6.5l-3.2 5.6L9 8.5z" />
      <path d="M5 19.5l4-6.5 3 4.5M13.5 16l2-3 3.5 6.5" />
    </svg>
  );
}

function VoxelIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z" />
      <path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5" />
      <path d="M7.75 4.9l8.5 4.72v9.5M16.25 4.9l-8.5 4.72v9.5M3.5 12l8.5 4.75L20.5 12" strokeOpacity={0.55} />
    </svg>
  );
}

function ShaderSphereIcon() {
  return (
    <svg {...iconProps} className="h-11 w-11">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M3.4 15.2c5.4 2 11.8 2 17.2 0M2.6 10.4c6.1 1.7 12.7 1.7 18.8 0" />
      <path d="M8 5.6c2.3-1.2 5.2-1.1 7.4.3" strokeOpacity={0.55} />
    </svg>
  );
}

function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...iconProps} strokeWidth={1.8} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.8} className="h-4 w-4">
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.6} className="h-5 w-5">
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h7" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg {...iconProps} strokeWidth={1.6} className="h-7 w-7">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

const EXPERIMENTS: { number: string; title: string; description: string; path: string; icon: ReactNode }[] = [
  { number: "01", title: "Geometry", description: "Three.js basics, shapes, materials, lighting.", path: "/week01", icon: <CubeIcon /> },
  { number: "02", title: "Terrain", description: "Noise grids, shaping, hydraulic erosion.", path: "/week02", icon: <MountainIcon /> },
  { number: "03", title: "Volumes", description: "Voxels, CSG, implicit surfaces, mesh generation.", path: "/week03", icon: <VoxelIcon /> },
  { number: "04", title: "Shader Studio", description: "Stack, isolate and read shader techniques.", path: "/week04", icon: <ShaderSphereIcon /> },
];

/** Landing page: the project's entry point into the week-by-week experiments. */
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col font-technical">
      <section className="relative overflow-hidden">
        {/* Faint blueprint grid behind the hero whose cells light up around the cursor. It fades
            towards the edges, but keeps some strength there so lit cells stay visible. */}
        <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_60%_40%,black_30%,rgba(0,0,0,0.35)_80%,transparent_100%)]">
          <CursorGrid cellSize={48} color="#22d3ee" gridOpacity={0.05} maxOpacity={0.55} radius={150} lineWidth={1} holdTime={120} fadeDuration={400} clickPulse={false} />
        </div>

        <div className="relative mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-4 px-6 pt-14 sm:px-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:pt-16 lg:px-20 lg:pt-24">
          <div className="relative z-10 flex flex-col items-start">
            <p className="whitespace-nowrap text-[11px] uppercase tracking-[0.18em] text-slate-400 sm:text-sm md:text-xs lg:text-sm">
              Procedural World Building<span className="mx-3 text-slate-600">·</span>Fall 2026
            </p>
            {/* Stepped so each line stays on one line within the text column at every width. */}
            <h1 className="mt-5 whitespace-nowrap font-display text-5xl font-bold leading-[1.05] tracking-tight text-slate-100 sm:text-7xl md:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl">
              Build worlds
              <br />
              <span className="text-cyan-400 [text-shadow:0_0_28px_rgba(34,211,238,0.35)]">from rules.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400">
              Explore geometry, noise, erosion, voxels, volumes, mesh generation, and shaders through interactive procedural experiments.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                {...linkProps("/week01")}
                className="group flex items-center gap-3 rounded-xl bg-cyan-400 px-5 py-3.5 font-sans text-[15px] font-medium text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300 hover:shadow-[0_0_32px_rgba(34,211,238,0.45)]"
              >
                <PlayIcon />
                Start Exploring
                <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-cyan-400/50 bg-slate-950/40 px-5 py-3.5 font-sans text-[15px] font-medium text-cyan-300 transition hover:border-cyan-300 hover:bg-cyan-500/10 hover:shadow-[0_0_18px_rgba(34,211,238,0.25)]"
              >
                <DocumentIcon />
                View Documentation
              </a>
            </div>
          </div>

          <div className="relative -mx-6 h-[300px] sm:-mx-10 sm:h-[380px] md:mx-0 md:-mr-10 md:h-[440px] lg:-mr-20 lg:h-[520px]">
            <HeroCity />
          </div>
        </div>

        {/* Hovering the cards shows a cursor spotlight: everything outside it turns grayscale. */}
        <ChromaGrid className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 px-6 pb-16 pt-4 sm:px-10 md:grid-cols-2 lg:px-20 2xl:grid-cols-4">
          {EXPERIMENTS.map((experiment) => (
            <a
              key={experiment.path}
              {...linkProps(experiment.path)}
              onMouseMove={trackChromaCard}
              className={
                chromaCardClass +
                " group flex items-start gap-5 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900/80 hover:shadow-[0_0_28px_rgba(34,211,238,0.12)]"
              }
            >
              <span className="shrink-0 text-cyan-400 transition group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">{experiment.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-3">
                  <span className="text-sm text-cyan-400">{experiment.number} /</span>
                  <span className="text-xl font-medium text-slate-100">{experiment.title}</span>
                </span>
                <span className="mt-2.5 block text-[13px] leading-relaxed text-slate-400">{experiment.description}</span>
              </span>
              <ArrowIcon className="mt-1.5 h-4 w-4 shrink-0 text-cyan-400 transition-transform group-hover:translate-x-1" />
            </a>
          ))}
        </ChromaGrid>
      </section>

      <footer className="mt-auto border-t border-slate-800/80">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-20">
          <div className="flex items-start gap-4">
            <span className="text-cyan-400">
              <CompassIcon />
            </span>
            <div>
              <p className="text-[15px] text-slate-200">Explore the experiments</p>
              <p className="mt-1.5 text-[11px] uppercase tracking-[0.15em] text-slate-500">
                {["Cornell Tech", "Fall 2026", "Three.js", "React", "TypeScript"].map((item, i) => (
                  <span key={item}>
                    {i > 0 && <span className="mx-2.5 text-slate-600">·</span>}
                    {item}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <p className="flex items-center gap-4 text-[11px] uppercase tracking-[0.15em] text-slate-500">
            <span className="h-px w-8 bg-cyan-400" />
            Generate / Explore / Iterate
          </p>
        </div>
      </footer>
    </div>
  );
}
