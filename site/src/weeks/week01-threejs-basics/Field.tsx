import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  description: string;
  valueLabel?: string;
  children: ReactNode;
}

export default function Field({ label, description, valueLabel, children }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label" title={description}>
        {label}
        {valueLabel !== undefined && <span className="field-value">{valueLabel}</span>}
        <span className="field-tooltip">{description}</span>
      </span>
      {children}
    </label>
  );
}
