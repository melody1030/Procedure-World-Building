import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronIcon } from "./icons";

interface SectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export default function Section({ icon, title, children, defaultExpanded = true }: SectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="panel-section">
      <button
        type="button"
        className="panel-section-header"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span className="panel-section-icon">{icon}</span>
        <span className="panel-section-title">{title}</span>
        <ChevronIcon className={expanded ? "panel-section-chevron" : "panel-section-chevron collapsed"} />
      </button>
      {expanded && <div className="panel-section-body">{children}</div>}
    </section>
  );
}
