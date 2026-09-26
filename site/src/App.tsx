import { useState } from "react";
import { weeks } from "./weeks/registry";

export default function App() {
  const [activeId, setActiveId] = useState(weeks[0]?.id);
  const active = weeks.find((w) => w.id === activeId);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-20 flex items-center gap-6 border-b border-slate-700/50 bg-slate-900/60 px-6 py-3 backdrop-blur-xl">
        <span className="flex items-center gap-2.5 whitespace-nowrap font-display text-[1.15rem] font-bold tracking-[0.02em] text-slate-200">
          Procedural World Building
        </span>
        <nav className="flex flex-wrap gap-2">
          {weeks.map((week) => (
            // Same treatment as the Week 3 sidebar items: quiet slate, cyan when active.
            <button
              key={week.id}
              className={
                "cursor-pointer rounded-xl border px-3.5 py-2 font-display text-[0.95rem] font-bold transition-colors " +
                (week.id === activeId
                  ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-300"
                  : "border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-cyan-300")
              }
              onClick={() => setActiveId(week.id)}
            >
              {week.title}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex flex-1 flex-col p-4">
        {active ? (
          <active.Component />
        ) : (
          <p className="text-slate-400">
            No weeks yet — add one in{" "}
            <code className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-1.5 py-0.5">site/src/weeks/registry.ts</code>.
          </p>
        )}
      </main>
    </div>
  );
}
