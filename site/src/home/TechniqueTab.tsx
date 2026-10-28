import type { ReactNode } from "react";
import { ChromaGrid, chromaCardClass, trackChromaCard } from "../components/ChromaGrid";
import { linkProps } from "../router";
import { STUDIOS, TECHNIQUES } from "./content";
import { ArrowIcon, BuildingIcon, CubeIcon, MountainIcon, ScatterPathIcon, SectionHeading, ShaderSphereIcon, VoxelIcon, external } from "./ui";

const ICONS: Record<(typeof STUDIOS)[number]["icon"], ReactNode> = {
  cube: <CubeIcon />,
  mountain: <MountainIcon />,
  voxel: <VoxelIcon />,
  shader: <ShaderSphereIcon />,
  scatter: <ScatterPathIcon />,
  building: <BuildingIcon />,
};

const studio = (id: string) => STUDIOS.find((s) => s.id === id)!;

/** Technique: the five kinds of technique the city uses, then every studio they grew from. */
export default function TechniqueTab() {
  return (
    <>
      <section className="mx-auto max-w-[1600px] px-6 pt-12 sm:px-10 lg:px-20">
        <SectionHeading eyebrow="Technique" title="What the city is made of">
          Five kinds of technique, each tried first in a studio and then put to work in the city. Each card links to its page, with a diagram, screenshots and the code it lives in.
        </SectionHeading>
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {TECHNIQUES.map((t, i) => (
            <article key={t.title} className="flex flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50">
              <div className="aspect-[16/9] overflow-hidden">
                <img src={t.image} alt={t.title} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <p className="flex items-baseline gap-3">
                  <span className="text-sm text-cyan-400">0{i + 1} /</span>
                  <span className="text-xl font-medium text-slate-100">{t.title}</span>
                </p>
                <p className="text-[13px] leading-relaxed text-slate-400">{t.text}</p>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  {t.studios.length ? (
                    t.studios.map((id) => (
                      <a
                        key={id}
                        {...linkProps(studio(id).path)}
                        className="rounded-full border border-slate-700/60 bg-slate-800/50 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-300"
                      >
                        {studio(id).number === "City" ? studio(id).title : `Studio ${studio(id).number} · ${studio(id).title}`}
                      </a>
                    ))
                  ) : (
                    <span className="rounded-full border border-slate-800/60 px-3 py-1 text-[11px] text-slate-500">New in the city (Class 08)</span>
                  )}
                  <a href={t.doc} {...external} className="group ml-auto flex items-center gap-1.5 text-[12px] text-cyan-300">
                    How it works
                    <ArrowIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10 lg:px-20">
        <SectionHeading eyebrow="Studios" title="Where each technique was tried first">
          The weekly workshops, each an interactive studio of its own, and the city's building library.
        </SectionHeading>
        {/* Hovering the cards shows a cursor spotlight: everything outside it turns grayscale. */}
        <ChromaGrid className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {STUDIOS.map((s) => (
            <a
              key={s.path}
              {...linkProps(s.path)}
              onMouseMove={trackChromaCard}
              className={
                chromaCardClass +
                " group flex items-start gap-5 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900/80 hover:shadow-[0_0_28px_rgba(34,211,238,0.12)]"
              }
            >
              <span className="shrink-0 text-cyan-400 transition group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">{ICONS[s.icon]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-3">
                  <span className="text-sm text-cyan-400">{s.number} /</span>
                  <span className="text-xl font-medium text-slate-100">{s.title}</span>
                </span>
                <span className="mt-2.5 block text-[13px] leading-relaxed text-slate-400">{s.description}</span>
              </span>
              <ArrowIcon className="mt-1.5 h-4 w-4 shrink-0 text-cyan-400 transition-transform group-hover:translate-x-1" />
            </a>
          ))}
        </ChromaGrid>
      </section>
    </>
  );
}
