import { useEffect, useState } from "react";
import { FieldLabel, RangeInput, valueClass } from "../../components/controls";

interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  onChange: (value: number) => void;
}

/** The numeric readout is a real text input so an exact value can be typed in, not just
 * dragged — buffered locally so an in-progress edit isn't clobbered by the synced prop. */
export default function ParamRow({ label, value, min, max, step, decimals, onChange }: ParamRowProps) {
  const [text, setText] = useState(value.toFixed(decimals));

  useEffect(() => {
    setText(value.toFixed(decimals));
  }, [value, decimals]);

  const commit = () => {
    const parsed = parseFloat(text);
    if (Number.isNaN(parsed)) {
      setText(value.toFixed(decimals));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setText(clamped.toFixed(decimals));
    onChange(clamped);
  };

  return (
    <div className="relative flex flex-col gap-1.5 text-xs">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center">
        <RangeInput min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
        {/* Sits on the label row (top right), like Week 3's SliderField. */}
        <input
          type="text"
          inputMode="decimal"
          className={
            "absolute -top-0.5 right-0 w-16 rounded-md border border-transparent bg-transparent px-1 py-px text-right hover:border-slate-700/50 focus:border-cyan-400/50 focus:bg-slate-800 focus:outline-none " +
            valueClass
          }
          value={text}
          spellCheck={false}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
    </div>
  );
}
