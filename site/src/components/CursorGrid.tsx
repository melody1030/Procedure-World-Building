import { useEffect, useRef } from "react";

/**
 * Canvas grid whose cells light up around the cursor and fade out, adapted from React Bits'
 * CursorGrid (reactbits.dev) into TypeScript + Tailwind.
 *
 * Difference from the original: it listens for the pointer on its nearest ancestor that receives
 * pointer events, so it can sit behind other content as a background (with pointer-events off)
 * and still react while the cursor is over the text and buttons in front of it.
 */

type Falloff = "linear" | "smooth" | "sharp";

const FALLOFF_CURVES: Record<Falloff, (t: number) => number> = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  sharp: (t) => t * t * t,
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(v.slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

interface CursorGridProps {
  /** Size of each grid cell in pixels. */
  cellSize?: number;
  /** Hex colour of the cell strokes, fills and pulses. */
  color?: string;
  /** Radius in pixels around the cursor within which cells light up. */
  radius?: number;
  /** Curve mapping distance from the cursor to cell brightness. */
  falloff?: Falloff;
  /** Milliseconds a cell stays lit before it starts fading. */
  holdTime?: number;
  /** Milliseconds a fully lit cell takes to fade out. */
  fadeDuration?: number;
  /** Stroke width of the cell outlines. */
  lineWidth?: number;
  /** Peak opacity of a cell at the cursor. */
  maxOpacity?: number;
  /** Translucent fill of lit cells; 0 disables it. */
  fillOpacity?: number;
  /** Opacity of a faint always-visible lattice; 0 hides it. */
  gridOpacity?: number;
  /** Corner radius of the cells in pixels. */
  cellRadius?: number;
  /** Emit an expanding ring of lit cells on click. */
  clickPulse?: boolean;
  /** Expansion speed of the click ring in pixels per second. */
  pulseSpeed?: number;
  className?: string;
}

export default function CursorGrid({
  cellSize = 70,
  color = "#D946EF",
  radius = 140,
  falloff = "smooth",
  holdTime = 400,
  fadeDuration = 800,
  lineWidth = 1.2,
  maxOpacity = 1,
  fillOpacity = 0,
  gridOpacity = 0,
  cellRadius = 0,
  clickPulse = true,
  pulseSpeed = 600,
  className = "",
}: CursorGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const propsRef = useRef({ cellSize, color, radius, falloff, holdTime, fadeDuration, lineWidth, maxOpacity, fillOpacity, gridOpacity, cellRadius, clickPulse, pulseSpeed });
  propsRef.current = { cellSize, color, radius, falloff, holdTime, fadeDuration, lineWidth, maxOpacity, fillOpacity, gridOpacity, cellRadius, clickPulse, pulseSpeed };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;
    // Skip wrappers that ignore the pointer (like this component itself), or they'd never fire.
    let target: HTMLElement = container.parentElement ?? container;
    while (target.parentElement && getComputedStyle(target).pointerEvents === "none") target = target.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // One brightness + last-lit time per cell, row-major.
    let cols = 0;
    let rows = 0;
    let offX = 0;
    let offY = 0;
    let alphas = new Float32Array(0);
    let touched = new Float64Array(0);
    let w = 0;
    let h = 0;
    const pulses: { x: number; y: number; t0: number }[] = [];
    let raf = 0;
    let running = false;
    let lastFrame = 0;

    const rebuild = () => {
      const p = propsRef.current;
      w = container.offsetWidth;
      h = container.offsetHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / p.cellSize) + 1;
      rows = Math.ceil(h / p.cellSize) + 1;
      // Centre the lattice so edge cells crop evenly on both sides.
      offX = (w - cols * p.cellSize) / 2;
      offY = (h - rows * p.cellSize) / 2;
      alphas = new Float32Array(cols * rows);
      touched = new Float64Array(cols * rows);
    };

    const cellCenter = (i: number): [number, number] => {
      const size = propsRef.current.cellSize;
      return [offX + (i % cols) * size + size / 2, offY + Math.floor(i / cols) * size + size / 2];
    };

    // Light every cell whose centre is inside the radius, brightest at the cursor.
    const energize = (x: number, y: number) => {
      const p = propsRef.current;
      const r = Math.max(p.radius, 1);
      const ease = FALLOFF_CURVES[p.falloff] ?? FALLOFF_CURVES.linear;
      const now = performance.now();
      const minCol = Math.max(0, Math.floor((x - r - offX) / p.cellSize));
      const maxCol = Math.min(cols - 1, Math.floor((x + r - offX) / p.cellSize));
      const minRow = Math.max(0, Math.floor((y - r - offY) / p.cellSize));
      const maxRow = Math.min(rows - 1, Math.floor((y + r - offY) / p.cellSize));
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const i = row * cols + col;
          const [cx, cy] = cellCenter(i);
          const dist = Math.hypot(cx - x, cy - y);
          if (dist > r) continue;
          const level = ease(1 - dist / r) * p.maxOpacity;
          if (level > alphas[i]) alphas[i] = level;
          if (level > 0) touched[i] = now;
        }
      }
    };

    const draw = (now: number) => {
      const p = propsRef.current;
      const dt = Math.min(now - lastFrame, 50);
      lastFrame = now;
      ctx.clearRect(0, 0, w, h);
      const [cr, cg, cb] = hexToRgb(p.color);

      if (p.gridOpacity > 0) {
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${p.gridOpacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let col = 0; col <= cols; col++) {
          const x = Math.round(offX + col * p.cellSize) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let row = 0; row <= rows; row++) {
          const y = Math.round(offY + row * p.cellSize) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
      }

      // Expanding click rings light the cells they pass over.
      for (let pi = pulses.length - 1; pi >= 0; pi--) {
        const pulse = pulses[pi];
        const ringR = ((now - pulse.t0) / 1000) * p.pulseSpeed;
        if (ringR > Math.hypot(w, h)) {
          pulses.splice(pi, 1);
          continue;
        }
        const band = p.cellSize;
        const minCol = Math.max(0, Math.floor((pulse.x - ringR - band - offX) / p.cellSize));
        const maxCol = Math.min(cols - 1, Math.floor((pulse.x + ringR + band - offX) / p.cellSize));
        const minRow = Math.max(0, Math.floor((pulse.y - ringR - band - offY) / p.cellSize));
        const maxRow = Math.min(rows - 1, Math.floor((pulse.y + ringR + band - offY) / p.cellSize));
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            const i = row * cols + col;
            const [cx, cy] = cellCenter(i);
            if (Math.abs(Math.hypot(cx - pulse.x, cy - pulse.y) - ringR) < band / 2 && p.maxOpacity > alphas[i]) {
              alphas[i] = p.maxOpacity;
              touched[i] = now;
            }
          }
        }
      }

      let anyVisible = pulses.length > 0;
      const fadeStep = dt / Math.max(p.fadeDuration, 16);
      const half = p.cellSize / 2;

      for (let i = 0; i < alphas.length; i++) {
        let a = alphas[i];
        if (a <= 0) continue;
        if (now - touched[i] > p.holdTime) {
          a = Math.max(0, a - fadeStep);
          alphas[i] = a;
          if (a <= 0) continue;
        }
        anyVisible = true;

        const [cx, cy] = cellCenter(i);
        const gradient = ctx.createRadialGradient(cx, cy, half * 0.1, cx, cy, p.cellSize);
        gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
        gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        const x = cx - half + 0.5;
        const y = cy - half + 0.5;
        const s = p.cellSize - 1;

        ctx.beginPath();
        if (p.cellRadius > 0) ctx.roundRect(x, y, s, s, p.cellRadius);
        else ctx.rect(x, y, s, s);
        if (p.fillOpacity > 0) {
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${a * p.fillOpacity})`;
          ctx.fill();
        }
        ctx.strokeStyle = gradient;
        ctx.lineWidth = p.lineWidth;
        ctx.stroke();
      }

      // Stop the loop once everything has faded; the static lattice stays painted.
      if (anyVisible) raf = requestAnimationFrame(draw);
      else running = false;
    };

    const wake = () => {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      raf = requestAnimationFrame(draw);
    };
    wakeRef.current = wake;

    const toLocal = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };
    const onPointerMove = (e: PointerEvent) => {
      energize(...toLocal(e));
      wake();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!propsRef.current.clickPulse) return;
      const [x, y] = toLocal(e);
      pulses.push({ x, y, t0: performance.now() });
      wake();
    };

    const resizeObserver = new ResizeObserver(() => {
      rebuild();
      wake();
    });
    resizeObserver.observe(container);
    rebuild();
    wake();
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerdown", onPointerDown);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerdown", onPointerDown);
    };
  }, [cellSize]);

  // Repaint the static layers when visual props change while idle.
  useEffect(() => {
    wakeRef.current?.();
  }, [gridOpacity, color, lineWidth, maxOpacity, fillOpacity, cellRadius]);

  return (
    <div ref={containerRef} aria-hidden="true" className={"pointer-events-none relative h-full w-full overflow-hidden " + className}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
