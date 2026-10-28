import { linkProps } from "../router";
import CityTab from "./CityTab";
import ConceptTab from "./ConceptTab";
import { DOCS } from "./content";
import TechniqueTab from "./TechniqueTab";
import { CompassIcon, external } from "./ui";

export type HomeTab = "concept" | "technique" | "city";

export const HOME_TABS: { id: HomeTab; label: string; path: string }[] = [
  { id: "concept", label: "Concept", path: "/concept" },
  { id: "technique", label: "Technique", path: "/technique" },
  { id: "city", label: "City", path: "/city" },
];

/**
 * The project's front page, in three tabs, each with its own address so it can be shared: Concept
 * (what Blueprint City is and the research behind it), Technique (what the city is made of, and
 * every studio where a technique was tried first) and City (the way in), under one slim bar with
 * the project's name and the tabs; each tab has its own headline.
 */
export default function HomePage({ tab }: { tab: HomeTab }) {
  return (
    <div className="flex flex-1 flex-col font-technical">
      {/* One slim bar: the name, the three tabs and the documentation. The headline is each tab's own. */}
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-page/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-stretch gap-4 px-6 sm:gap-8 sm:px-10 lg:px-20">
          <a {...linkProps("/")} className="flex items-center whitespace-nowrap font-display text-lg font-bold tracking-tight text-slate-100 sm:text-xl">
            Blueprint City
          </a>
          <nav className="flex items-stretch" aria-label="Sections">
            {HOME_TABS.map((t) => (
              <a
                key={t.id}
                {...linkProps(t.path)}
                aria-current={t.id === tab ? "page" : undefined}
                className={
                  // The underline sits on the header's bottom border, glowing cyan on the open tab.
                  "relative flex items-center px-3 font-display text-[1.05rem] font-bold sm:px-4 transition-colors after:absolute after:inset-x-3 after:-bottom-px sm:after:inset-x-4 after:h-0.5 after:rounded-full after:transition-colors " +
                  (t.id === tab
                    ? "text-cyan-300 after:bg-cyan-400 after:shadow-[0_0_10px_rgba(34,211,238,0.7)]"
                    : "text-slate-400 after:bg-transparent hover:text-cyan-300 hover:after:bg-cyan-400/30")
                }
              >
                {t.label}
              </a>
            ))}
          </nav>
          <a href={DOCS} {...external} className="ml-auto hidden items-center whitespace-nowrap text-[12px] uppercase tracking-[0.15em] text-slate-400 transition-colors hover:text-cyan-300 sm:flex">
            Documentation ↗
          </a>
        </div>
      </header>

      {tab === "concept" && <ConceptTab />}
      {tab === "technique" && <TechniqueTab />}
      {tab === "city" && <CityTab />}

      <footer className="mt-auto border-t border-slate-800/80">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-8 sm:px-10 md:flex-row md:items-center md:justify-between lg:px-20">
          <div className="flex items-start gap-4">
            <span className="text-cyan-400">
              <CompassIcon />
            </span>
            <div>
              <p className="text-[15px] text-slate-200">Blueprint City</p>
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
