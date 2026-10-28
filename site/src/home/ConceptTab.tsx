import CursorGrid from "../components/CursorGrid";
import { linkProps } from "../router";
import { ANALYSIS, DOCS, STAGES } from "./content";
import HeroCity from "./HeroCity";
import { ArrowIcon, DocumentIcon, HeroButton, IslandIcon, REPO, SectionHeading, external } from "./ui";

/** Concept: what Blueprint City is, the idea in four frames, and the research behind it. */
export default function ConceptTab() {
  return (
    <>
      <section className="relative">
        {/* Faint blueprint grid behind the hero whose cells light up around the cursor; it fades towards the edges. */}
        <div className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_60%_40%,black_30%,rgba(0,0,0,0.35)_80%,transparent_100%)]">
          <CursorGrid cellSize={48} color="#22d3ee" gridOpacity={0.05} maxOpacity={0.55} radius={150} lineWidth={1} holdTime={120} fadeDuration={400} clickPulse={false} />
        </div>
        <div className="relative mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-4 px-6 pt-10 sm:px-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:px-20 lg:pt-14">
          <div className="relative z-10 flex flex-col items-start">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Procedural World Building<span className="mx-3 text-slate-600">·</span>Fall 2026
            </p>
            {/* Stepped so each line stays on one line within the text column at every width. */}
            <h1 className="mt-5 whitespace-nowrap font-display text-5xl font-bold leading-[1.05] tracking-tight text-slate-100 sm:text-7xl md:text-5xl lg:text-6xl xl:text-7xl">
              Build a city
              <br />
              <span className="text-cyan-400 [text-shadow:0_0_28px_rgba(34,211,238,0.35)]">from rules.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-300">
              From empty ground to a working city: built layer by layer, then brought to life by people and traffic.
            </p>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-slate-500">
              A miniature voxel diorama after <em>Town to City</em>, turned to a neon cyberpunk night. Every island grows from a seed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 whitespace-nowrap [&>a]:w-[15.5rem]">
              <HeroButton {...linkProps("/world")} primary icon={<IslandIcon />} label="Enter the City" />
              <HeroButton href={`${REPO}docs/concept.md`} {...external} icon={<DocumentIcon />} label="Read the Concept" />
            </div>
          </div>
          <div className="relative -mx-6 h-[300px] sm:-mx-10 sm:h-[380px] md:mx-0 md:-mr-10 md:h-[440px] lg:-mr-20 lg:h-[520px]">
            <HeroCity />
          </div>
        </div>
      </section>

      {/* The concept sentence, frame by frame. */}
      <section className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10 lg:px-20">
        <SectionHeading eyebrow="The idea" title="How a city grows">
          The timeline replays the whole city being made, in the order the rules make it.
        </SectionHeading>
        <ol className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((stage, i) => (
            <li key={stage.title} className="flex flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/50">
              <div className="aspect-[4/3] overflow-hidden">
                <img src={stage.image} alt={stage.title} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <p className="flex items-baseline gap-3">
                  <span className="text-sm text-cyan-400">0{i + 1} /</span>
                  <span className="text-lg font-medium text-slate-100">{stage.title}</span>
                </p>
                <p className="text-[13px] leading-relaxed text-slate-400">{stage.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* What it borrows, what it changes. */}
      <section className="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 px-6 pb-16 sm:px-10 lg:grid-cols-2 lg:px-20">
        <SectionHeading eyebrow="References" title="A cozy builder, turned to night">
          <p>
            From <em>Town to City</em> it keeps the tabletop diorama, the terraced ground and the feeling that the place grew rather than was planned. It changes who builds (rules, not a
            player) and the tone: dark concrete, steel and glass, lit by its own windows, signs and traffic.
          </p>
        </SectionHeading>
        <dl className="grid grid-cols-1 gap-3 self-end text-[13px] sm:grid-cols-2">
          {[
            ["A player builds", "Rules build"],
            ["Golden-hour sunlight", "The city is its own light"],
            ["A village grows outward", "Outward, then upward"],
            ["Cozy", "Dense, a little lonely, still beautiful"],
          ].map(([from, to]) => (
            <div key={from} className="rounded-xl border border-slate-700/60 bg-slate-900/50 px-4 py-3">
              <dt className="text-slate-500 line-through decoration-slate-600">{from}</dt>
              <dd className="mt-1 text-cyan-300">{to}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-[1600px] px-6 pb-20 sm:px-10 lg:px-20">
        <SectionHeading eyebrow="Related analysis" title="Research and feedback behind it" />
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {ANALYSIS.map((doc) => (
            <a
              key={doc.title}
              href={doc.href}
              {...external}
              className="group flex flex-col gap-2 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900/80"
            >
              <span className="flex items-center justify-between gap-3 text-[15px] font-medium text-slate-100">
                {doc.title}
                <ArrowIcon className="h-4 w-4 shrink-0 text-cyan-400 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="text-[13px] leading-relaxed text-slate-400">{doc.text}</span>
            </a>
          ))}
        </div>
        <p className="mt-6 text-[13px] text-slate-500">
          Everything else is in the{" "}
          <a href={DOCS} {...external} className="text-cyan-300 underline-offset-4 hover:underline">
            project documentation
          </a>
          .
        </p>
      </section>
    </>
  );
}
