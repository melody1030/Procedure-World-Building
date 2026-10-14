import { useEffect, useState } from "react";
import { SiteHeader } from "./components/SiteHeader";
import { WeekConfigProvider, type WeekConfigHandle } from "./firebase/weekConfig";
import HomePage from "./home/HomePage";
import { usePath } from "./router";
import { weeks } from "./weeks/registry";
import WorldPage from "./world";
import BuildingsPreview from "./world/buildings/Preview";

export default function App() {
  const path = usePath();
  // `/week01` etc. open a week; anything else shows the homepage.
  const active = weeks.find((w) => `/${w.id}` === path);
  // Set by the active week (see useWeekConfig) so the top bar can save and load its settings.
  const [configHandle, setConfigHandle] = useState<WeekConfigHandle | null>(null);

  useEffect(() => {
    if (path === "/world") document.title = "Blueprint City · Procedural World Building";
    else if (path === "/buildings") document.title = "Building library · Procedural World Building";
    else document.title = active ? `${active.title} · Procedural World Building` : "Procedural World Building — Weekly Workshops";
  }, [active, path]);

  // The procedural world is the project's final piece: full screen, no top bar.
  if (path === "/world") return <WorldPage />;
  // The city's building library, on its own (a preview of the assets /world places on lots).
  if (path === "/buildings") return <BuildingsPreview />;

  return (
    <div className="flex min-h-screen flex-col">
      {active ? (
        <>
          {/* The homepage has no top bar; its buttons and cards lead into the weeks. */}
          <SiteHeader path={path} configHandle={configHandle} weekTitle={active.title} />
          <main className="flex flex-1 flex-col p-4">
            <WeekConfigProvider setHandle={setConfigHandle}>
              <active.Component />
            </WeekConfigProvider>
          </main>
        </>
      ) : (
        <main className="flex flex-1 flex-col">
          <HomePage />
        </main>
      )}
    </div>
  );
}
