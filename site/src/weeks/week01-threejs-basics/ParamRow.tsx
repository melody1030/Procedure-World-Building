import { useEffect, useState } from "react";

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
    <div className="param-row">
      <span className="param-label">{label}</span>
      <div className="param-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          type="text"
          inputMode="decimal"
          className="param-value"
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
