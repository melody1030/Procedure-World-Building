import { linkProps } from "../router";
import { DEVLOG, MILESTONES, SHOTS } from "./content";
import { BuildingIcon, DocumentIcon, HeroButton, IslandIcon, SectionHeading, Shot, external } from "./ui";

const EXPLORE = [
  { title: "Watch it build", text: "The timeline at the bottom replays the city: terrain, river, plaza, streets, lots, buildings. Scrub it, or change its speed." },
  { title: "Change the rules", text: "The panel holds every stage's settings and the seed. A change regrows the city from the stage it touched." },
  { title: "Look closer", text: "Drag to orbit, scroll to zoom. Turn on districts, lots or parks, or turn people and traffic on and off." },
];

const GALLERY = [
  { src: SHOTS.inhabitants, alt: "People in a park, pigeons taking off", caption: "People walk to whatever they need most; pigeons go up as they pass." },
  { src: SHOTS.busStop, alt: "A bus at its shelter", caption: "A bus at its shelter: the door lights up and the people waiting get on." },
  { src: SHOTS.taxi, alt: "A taxi at the curb", caption: "A taxi pulls up for the person who hailed it." },
  { src: SHOTS.smoothed, alt: "The ground with the buildings hidden", caption: "The ground under the city: blocks smoothed between the streets, lots graded flat." },
  { src: SHOTS.districts, alt: "Districts and parks", caption: "Districts and parks over the street network." },
  { src: SHOTS.version1, alt: "Version 1 of the city", caption: "Version 1 (Oct 7), before the restart." },
];

/** City: the way into Blueprint City, how to explore it, and how it came to be. */
export default function CityTab() {
  return (
    <>
      <section className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-10 px-6 pt-12 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-20">
        <div className="flex flex-col items-start">
          <SectionHeading eyebrow="The city" title="Step onto the island">
            A 232 m voxel island grown from a seed: its ground, river, streets, lots and buildings, then the people, pigeons, cats and traffic that live in it. Every seed is a different city.
          </SectionHeading>
          <div className="mt-8 flex flex-wrap gap-3 whitespace-nowrap [&>a]:w-[15.5rem]">
            <HeroButton {...linkProps("/world")} primary icon={<IslandIcon />} label="Enter the City" />
            <HeroButton {...linkProps("/buildings")} icon={<span className="[&>svg]:h-5 [&>svg]:w-5"><BuildingIcon /></span>} label="Building Library" />
          </div>
        </div>
        <a {...linkProps("/world")} className="group relative block overflow-hidden rounded-2xl border border-slate-700/60" aria-label="Enter the city">
          <img src={SHOTS.city} alt="Blueprint City at night, its towers lit" className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-5 pb-4 pt-12 text-[12px] uppercase tracking-[0.15em] text-cyan-300">
            /world?seed=blueprint
          </span>
        </a>
      </section>

      <section className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10 lg:px-20">
        <SectionHeading eyebrow="How to explore" title="Three ways in" />
        <ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {EXPLORE.map((step, i) => (
            <li key={step.title} className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-5">
              <p className="flex items-baseline gap-3">
                <span className="text-sm text-cyan-400">0{i + 1} /</span>
                <span className="text-lg font-medium text-slate-100">{step.title}</span>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-[1600px] px-6 pb-16 sm:px-10 lg:px-20">
        <SectionHeading eyebrow="Inside" title="Life in the city" />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {GALLERY.map((shot) => (
            <Shot key={shot.alt} {...shot} />
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1600px] grid-cols-1 gap-10 px-6 pb-20 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:px-20">
        <div className="flex flex-col items-start gap-6">
          <SectionHeading eyebrow="Process" title="How it came to be">
            Built in the open, one dated entry at a time, with a screenshot for each step.
          </SectionHeading>
          <div className="w-[15.5rem] whitespace-nowrap">
            <HeroButton href={DEVLOG} {...external} icon={<DocumentIcon />} label="Development Log" />
          </div>
        </div>
        <ol className="relative border-l border-slate-700/60 pl-6">
          {MILESTONES.map((m) => (
            <li key={m.date} className="relative pb-5 last:pb-0">
              <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border border-cyan-400 bg-slate-950" />
              <p className="text-[12px] uppercase tracking-[0.15em] text-cyan-300">{m.date}</p>
              <p className="mt-1 text-[14px] text-slate-300">{m.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
