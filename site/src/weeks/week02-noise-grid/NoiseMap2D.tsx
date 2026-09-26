import { useEffect, useRef } from "react";
import { sampleHeightField } from "./erosion";
import { glassCardClass, headingClass, headingIconClass } from "../../components/controls";
import { MapIcon } from "./icons";
import type { MapCell } from "./types";

const MAP_SIZE = 256;
const REDRAW_INTERVAL_MS = 120;
const canvasClass = "absolute inset-0 block h-full w-full [image-rendering:pixelated]";

interface NoiseMap2DProps {
  heightField: Float32Array;
  resolution: number;
  isSimulating: boolean;
  hoverCell: MapCell | null;
  selectedCell: MapCell | null;
  onHoverCell: (cell: MapCell | null) => void;
  onSelectCell: (cell: MapCell) => void;
  onClearSelection: () => void;
}

function drawRing(ctx: CanvasRenderingContext2D, cell: MapCell, color: string) {
  const x = cell.nx * MAP_SIZE;
  const y = cell.ny * MAP_SIZE;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCrosshair(ctx: CanvasRenderingContext2D, cell: MapCell, color: string) {
  const x = cell.nx * MAP_SIZE;
  const y = cell.ny * MAP_SIZE;
  const size = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.stroke();
}

export default function NoiseMap2D({
  heightField,
  resolution,
  isSimulating,
  hoverCell,
  selectedCell,
  onHoverCell,
  onSelectCell,
  onClearSelection,
}: NoiseMap2DProps) {
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const heightFieldRef = useRef(heightField);
  heightFieldRef.current = heightField;
  const resolutionRef = useRef(resolution);
  resolutionRef.current = resolution;

  const drawBaseImage = () => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext("2d");
    const field = heightFieldRef.current;
    if (!canvas || !ctx || !field) return;

    const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    for (let py = 0; py < MAP_SIZE; py++) {
      for (let px = 0; px < MAP_SIZE; px++) {
        const nx = px / MAP_SIZE;
        const ny = py / MAP_SIZE;
        const value = sampleHeightField(field, resolutionRef.current, nx, ny);
        const gray = Math.round(Math.min(1, Math.max(0, value)) * 255);

        const i = (py * MAP_SIZE + px) * 4;
        image.data[i] = gray;
        image.data[i + 1] = gray;
        image.data[i + 2] = gray;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  };

  // Base noise image — redrawn whenever the height field is regenerated (noise/shaping change).
  useEffect(() => {
    drawBaseImage();
  }, [heightField, resolution]);

  // While the erosion simulation runs, periodically re-sample the (mutating) field.
  useEffect(() => {
    if (!isSimulating) return;
    const id = setInterval(drawBaseImage, REDRAW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isSimulating]);

  // Overlay: hover/selection markers — cheap vector drawing, redrawn
  // independently of the (expensive) base image.
  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    if (hoverCell) {
      drawRing(ctx, hoverCell, "rgba(255, 255, 255, 0.7)");
    }
    if (selectedCell) {
      drawCrosshair(ctx, selectedCell, "#ffffff");
    }
  }, [hoverCell, selectedCell]);

  const cellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>): MapCell | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    return { nx, ny };
  };

  return (
    <div className={"absolute bottom-4 right-4 z-10 flex flex-col gap-3 p-3 " + glassCardClass}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={"m-0 " + headingClass}>
          <MapIcon className={headingIconClass} />
          2D Noise Map
        </h3>
        {selectedCell && (
          <button
            className="cursor-pointer whitespace-nowrap rounded-lg border border-slate-700/50 bg-slate-800/50 px-2 py-0.5 text-[11px] font-medium text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
            onClick={onClearSelection}
            title="Remove the pin and crosshair"
          >
            Clear pin
          </button>
        )}
      </div>
      <div className="relative h-[180px] w-[180px] overflow-hidden rounded-xl border border-slate-700/50">
        <canvas ref={baseRef} width={MAP_SIZE} height={MAP_SIZE} className={canvasClass + " pointer-events-none"} />
        <canvas
          ref={overlayRef}
          className={canvasClass + " cursor-crosshair"}
          width={MAP_SIZE}
          height={MAP_SIZE}
          onMouseMove={(e) => onHoverCell(cellFromEvent(e))}
          onMouseLeave={() => onHoverCell(null)}
          onClick={(e) => {
            const cell = cellFromEvent(e);
            if (cell) onSelectCell(cell);
          }}
        />
      </div>
    </div>
  );
}
