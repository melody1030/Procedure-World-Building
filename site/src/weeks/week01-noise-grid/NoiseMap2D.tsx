import { useEffect, useRef } from "react";
import { sampleNoise } from "./noise";
import { applyShaping } from "./shaping";
import type { Week1State } from "./types";

const MAP_SIZE = 256;

interface NoiseMap2DProps {
  state: Week1State;
}

export default function NoiseMap2D({ state }: NoiseMap2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    for (let py = 0; py < MAP_SIZE; py++) {
      for (let px = 0; px < MAP_SIZE; px++) {
        const nx = px / MAP_SIZE;
        const ny = py / MAP_SIZE;
        const raw = sampleNoise(nx, ny, state);
        const value = applyShaping(raw, state.shapingType, state.amount);
        const gray = Math.round(Math.min(1, Math.max(0, value)) * 255);

        const i = (py * MAP_SIZE + px) * 4;
        image.data[i] = gray;
        image.data[i + 1] = gray;
        image.data[i + 2] = gray;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [state]);

  return (
    <div className="noise-map-2d">
      <h3>2D Noise Map</h3>
      <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} />
    </div>
  );
}
