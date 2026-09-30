import { SidePanel } from "../../components/SidePanel";
import { Field, PanelButton, Section, Select } from "../../components/controls";
import { STAGES, TECHNIQUES } from "./config";
import { InfoIcon, ResetIcon, ShaderIcon, SlidersIcon } from "./icons";
import ShaderInfo from "./ShaderInfo";
import TechniqueControls from "./TechniqueControls";
import type { StudioController } from "./state";
import type { TechniqueType } from "./types";

interface ShaderPanelProps {
  studio: StudioController;
  open: boolean;
  onToggle: () => void;
}

const TYPES = Object.keys(TECHNIQUES) as TechniqueType[];

/** The left panel: pick a technique, tune it, and read how it works. */
export default function ShaderPanel({ studio, open, onToggle }: ShaderPanelProps) {
  const { technique } = studio.state;

  return (
    <SidePanel side="left" open={open} onToggle={onToggle} widthRem={16.2} label="shader panel">
      <Section icon={<ShaderIcon />} title="Shader">
        <Field label="Technique" description="The shader technique on show, grouped by the stage of the shader it runs in.">
          <Select value={technique} onChange={(e) => studio.select(e.target.value as TechniqueType)}>
            {STAGES.map((stage) => (
              <optgroup key={stage.id} label={stage.name}>
                {TYPES.filter((type) => TECHNIQUES[type].stage === stage.id).map((type) => (
                  <option key={type} value={type}>
                    {TECHNIQUES[type].name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      </Section>

      <Section icon={<SlidersIcon />} title={TECHNIQUES[technique].name}>
        <TechniqueControls studio={studio} />
        <PanelButton className="flex flex-none items-center justify-center gap-2" onClick={studio.resetParams}>
          <ResetIcon className="h-4 w-4 shrink-0" />
          Reset to defaults
        </PanelButton>
      </Section>

      <Section icon={<InfoIcon />} title="How it works">
        <ShaderInfo studio={studio} />
      </Section>
    </SidePanel>
  );
}
