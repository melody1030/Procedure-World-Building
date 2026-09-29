import { useEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { gsap } from "gsap";

/**
 * Hover spotlight adapted from React Bits' ChromaGrid (reactbits.dev), rewritten in TypeScript
 * with Tailwind to match the rest of the site. Unlike the original, nothing changes at rest:
 * only while the pointer is over the grid does everything outside a soft circle around the cursor
 * fade to grayscale and dim. The circle follows the cursor with a gsap-damped glide.
 */

// Transparent at the cursor, fully masked (grayscale shows) at the circle's edge.
const SPOTLIGHT_MASK =
  "radial-gradient(circle var(--r) at var(--x) var(--y), transparent 0%, transparent 15%, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.22) 45%, rgba(0,0,0,0.35) 60%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.68) 88%, white 100%)";

const overlayStyle: CSSProperties = {
  backdropFilter: "grayscale(1) brightness(0.78)",
  WebkitBackdropFilter: "grayscale(1) brightness(0.78)",
  maskImage: SPOTLIGHT_MASK,
  WebkitMaskImage: SPOTLIGHT_MASK,
};

export function ChromaGrid({
  children,
  className = "",
  radius = 300,
  damping = 0.45,
  fadeOut = 0.6,
  ease = "power3.out",
}: {
  children: ReactNode;
  className?: string;
  /** Spotlight radius in pixels. */
  radius?: number;
  /** Seconds the spotlight takes to catch up with the cursor. */
  damping?: number;
  /** Seconds the effect takes to fade away after the pointer leaves. */
  fadeOut?: number;
  /** gsap easing for the spotlight movement. */
  ease?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const setX = useRef<((value: number) => void) | null>(null);
  const setY = useRef<((value: number) => void) | null>(null);
  const pos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setX.current = gsap.quickSetter(el, "--x", "px") as (value: number) => void;
    setY.current = gsap.quickSetter(el, "--y", "px") as (value: number) => void;
    const { width, height } = el.getBoundingClientRect();
    pos.current = { x: width / 2, y: height / 2 };
    setX.current(pos.current.x);
    setY.current(pos.current.y);
    return () => {
      gsap.killTweensOf(pos.current);
      if (overlayRef.current) gsap.killTweensOf(overlayRef.current);
    };
  }, []);

  const handleMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = rootRef.current!.getBoundingClientRect();
    gsap.to(pos.current, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      duration: damping,
      ease,
      overwrite: true,
      onUpdate: () => {
        setX.current?.(pos.current.x);
        setY.current?.(pos.current.y);
      },
    });
    gsap.to(overlayRef.current, { opacity: 1, duration: 0.25, overwrite: true });
  };

  const handleLeave = () => {
    gsap.to(overlayRef.current, { opacity: 0, duration: fadeOut, overwrite: true });
  };

  return (
    <div
      ref={rootRef}
      className={"relative " + className}
      style={{ "--r": `${radius}px` } as CSSProperties}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {children}
      <div ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 opacity-0" style={overlayStyle} />
    </div>
  );
}

/** Classes for a card inside a ChromaGrid: a soft cyan glow that tracks the cursor while hovered. */
export const chromaCardClass =
  "relative overflow-hidden before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(103,232,249,0.14),transparent_70%)] before:opacity-0 before:transition-opacity before:duration-500 hover:before:opacity-100";

/** Mouse-move handler for a chroma card: moves its glow to the cursor. */
export function trackChromaCard(event: MouseEvent<HTMLElement>) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
  card.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
}
