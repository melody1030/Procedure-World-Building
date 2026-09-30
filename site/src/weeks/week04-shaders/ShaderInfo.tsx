import { useState } from "react";
import { FieldNote } from "../../components/controls";
import { TECHNIQUES } from "./config";
import type { StudioController } from "./state";
import type { TechniqueType } from "./types";

/** What the shader adds around the technique so it can be seen (matches `pickTechniques`). */
function helperNote(technique: TechniqueType): string | null {
  if (technique === "gradient" || technique === "slope") return "Plain Lambert light is added so the shapes read.";
  if (technique === "ripple") return "Water covers the floor, so the objects stand in it. They are grey with plain Lambert light.";
  if (["fakeAO", "fresnel", "fog"].includes(technique)) return "Shown on grey with plain Lambert light, so the effect has a surface to show on.";
  return null;
}

/** "How it works": a short explanation and the core formula. */
export default function ShaderInfo({ studio }: { studio: StudioController }) {
  const [showFormula, setShowFormula] = useState(false);
  const { technique } = studio.state;
  const module = TECHNIQUES[technique];
  const note = helperNote(technique);

  return (
    <>
      <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5">
        <p className="m-0 text-xs leading-snug text-slate-300">{module.summary}</p>
        <button
          onClick={() => setShowFormula((v) => !v)}
          aria-expanded={showFormula}
          className="mt-2 text-[11px] font-medium text-cyan-300 transition-colors duration-150 hover:text-cyan-200"
        >
          {showFormula ? "Hide formula" : "Show formula"}
        </button>
        {showFormula && <pre className="m-0 mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-cyan-300/80">{module.formula}</pre>}
      </div>
      {note && <FieldNote>{note}</FieldNote>}
    </>
  );
}
