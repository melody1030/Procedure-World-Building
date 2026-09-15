import { useEffect, useState } from "react";

interface ColorFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** A swatch (native color picker) and an editable hex readout, kept separate so the
 * hex text can be typed freely without the swatch fighting an in-progress edit. */
export default function ColorField({ label, description, value, onChange }: ColorFieldProps) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = (next: string) => {
    setText(next);
    if (HEX_COLOR.test(next)) onChange(next);
  };

  return (
    <label className="field">
      <span className="field-label" title={description}>
        {label}
        <span className="field-tooltip">{description}</span>
      </span>
      <div className="color-field">
        <input
          type="color"
          className="color-swatch"
          value={HEX_COLOR.test(text) ? text : value}
          onChange={(e) => commit(e.target.value)}
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          className="color-hex"
          value={text}
          spellCheck={false}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(value)}
          aria-label={`${label} hex value`}
        />
      </div>
    </label>
  );
}
