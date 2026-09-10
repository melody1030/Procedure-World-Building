import { useState } from "react";
import { weeks } from "./weeks/registry";

export default function App() {
  const [activeId, setActiveId] = useState(weeks[0]?.id);
  const active = weeks.find((w) => w.id === activeId);

  return (
    <div className="app">
      <header className="tab-bar">
        <span className="tab-bar-title">Procedural World Building</span>
        <nav className="tabs">
          {weeks.map((week) => (
            <button
              key={week.id}
              className={week.id === activeId ? "tab active" : "tab"}
              onClick={() => setActiveId(week.id)}
            >
              {week.title}
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {active ? (
          <active.Component />
        ) : (
          <p className="empty-state">
            No weeks yet — add one in{" "}
            <code>site/src/weeks/registry.ts</code>.
          </p>
        )}
      </main>
    </div>
  );
}
