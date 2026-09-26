import { useEffect, useState } from "react";
import { Field } from "../../components/controls";

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
    <Field label={label} description={description}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-[38px] w-[38px] shrink-0 cursor-pointer rounded-xl border border-slate-700/50 bg-slate-800/60 p-[3px] transition-colors hover:border-slate-500 [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-none"
          value={HEX_COLOR.test(text) ? text : value}
          onChange={(e) => commit(e.target.value)}
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          className="min-w-0 flex-1 rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2 font-mono text-[13px] text-cyan-300 transition-colors hover:border-slate-500 focus:border-cyan-400/50 focus:outline-none"
          value={text}
          spellCheck={false}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setText(value)}
          aria-label={`${label} hex value`}
        />
      </div>
    </Field>
  );
}
