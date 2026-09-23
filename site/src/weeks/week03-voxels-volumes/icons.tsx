// Inline SVG icons shared across every Week 3 view (no icon library dependency).

export function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconOrbit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
      <circle cx="12" cy="4" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMinusCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlusCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" strokeLinecap="round" />
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path d="M21 12a9 9 0 11-3.5-7.14" strokeLinecap="round" />
      <path d="M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path d="M9 14 4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconRedo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
      <path d="m15 14 5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Object Manipulation gizmo-mode glyphs.

export function IconMove() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <polyline points="5 9 2 12 5 15" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="9 5 12 2 15 5" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="15 19 12 22 9 19" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="19 9 22 12 19 15" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="12" y1="2" x2="12" y2="22" />
    </svg>
  );
}

export function IconRotate() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path d="M3 12a9 9 0 1 0 3.5-7.1" strokeLinecap="round" />
      <path d="M3 3v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconScale() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path d="M4 16v4h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 8V4h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20 10 14" strokeLinecap="round" />
      <path d="M20 4 14 10" strokeLinecap="round" />
    </svg>
  );
}

export function IconSliders() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
      <circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Primitive-shape glyphs for the CSG Lab's palette and tree rows.

export function IconCube() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <path d="M12 2.5 20 6.8v10.4L12 21.5 4 17.2V6.8Z" strokeLinejoin="round" />
      <path d="M12 2.5v9M4 6.8 12 11.5 20 6.8M12 11.5v10" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSphere() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.2" />
    </svg>
  );
}

export function IconCylinder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <ellipse cx="12" cy="6.2" rx="7" ry="3" />
      <path d="M5 6.2v11.6a7 3 0 0 0 14 0V6.2" />
    </svg>
  );
}

export function IconCone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <ellipse cx="12" cy="18" rx="7" ry="3" />
      <path d="M12 3 5 18M12 3l7 15" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTorus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
      <ellipse cx="12" cy="12" rx="9" ry="5" />
      <ellipse cx="12" cy="12" rx="3" ry="1.7" />
    </svg>
  );
}

// CSG-operation glyphs (overlapping-circle metaphor) for the operation row and tree rows.

export function IconUnionOp() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5">
      <circle cx="9.5" cy="12" r="6.5" fill="currentColor" fillOpacity={0.55} />
      <circle cx="14.5" cy="12" r="6.5" fill="currentColor" fillOpacity={0.55} />
    </svg>
  );
}

export function IconDifferenceOp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="h-5 w-5">
      <circle cx="9.5" cy="12" r="6.5" fill="currentColor" fillOpacity={0.45} stroke="none" />
      <circle cx="14.5" cy="12" r="6.5" />
    </svg>
  );
}

export function IconIntersectionOp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} className="h-5 w-5">
      <circle cx="9.5" cy="12" r="6.5" />
      <circle cx="14.5" cy="12" r="6.5" />
      <path d="M12 6.3a6.5 6.5 0 0 1 0 11.4 6.5 6.5 0 0 1 0-11.4Z" fill="currentColor" fillOpacity={0.55} stroke="none" />
    </svg>
  );
}

// Visibility toggle for the CSG Lab's scene-tree rows.

export function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.5 17.5 0 0 1-3.4 4.3M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.85" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 10a3 3 0 0 0 4.24 4.24" strokeLinecap="round" />
    </svg>
  );
}
