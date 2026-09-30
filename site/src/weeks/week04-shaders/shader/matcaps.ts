import * as THREE from "three";

/**
 * Matcaps drawn on a canvas at runtime, so there are no image assets. Each is a lit sphere seen
 * head-on: the shader samples it with the view-space normal. These are scene colors, not UI.
 */

const SIZE = 256;

function sphere(paint: (ctx: CanvasRenderingContext2D, c: number, r: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  const c = SIZE / 2;
  const r = SIZE / 2;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  paint(ctx, c, r);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  // Raw values, like the rest of the studio's colors.
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

export function createMatcaps(): Record<string, THREE.CanvasTexture> {
  return {
    // Soft studio clay: light from the top left, a gentle falloff.
    clay: sphere((ctx, c, r) => {
      radial(ctx, c * 0.7, c * 0.6, r * 1.5, [
        [0, "#e4e1dc"],
        [0.45, "#a8a49e"],
        [0.85, "#4f4c48"],
        [1, "#2a2826"],
      ]);
    }),
    // Glossy plastic: steel blue with a small, sharp highlight.
    glossy: sphere((ctx, c, r) => {
      radial(ctx, c * 0.8, c * 0.7, r * 1.35, [
        [0, "#a9d2ea"],
        [0.4, "#7fb5d6"],
        [0.8, "#2c4a63"],
        [1, "#14222f"],
      ]);
      radial(ctx, c * 0.62, c * 0.5, r * 0.18, [
        [0, "rgba(255,255,255,0.95)"],
        [1, "rgba(255,255,255,0)"],
      ]);
    }),
    // Toon: hard bands with no blending, so a matcap alone fakes cel shading.
    toon: sphere((ctx, c, r) => {
      const disc = (x: number, y: number, radius: number, color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      };
      disc(c, c, r, "#22384b");
      disc(c * 0.9, c * 0.85, r * 0.82, "#5f87a3");
      disc(c * 0.78, c * 0.7, r * 0.45, "#a5c9e0");
      disc(c * 0.68, c * 0.58, r * 0.12, "#eef6fb");
    }),
    // Pearl: a pale, soft body, warm from above and cool from below.
    pearl: sphere((ctx, c, r) => {
      const g = ctx.createLinearGradient(0, 0, 0, SIZE);
      g.addColorStop(0, "#f4eee6");
      g.addColorStop(1, "#aebfcf");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
      radial(ctx, c, c, r, [
        [0, "rgba(30,41,59,0)"],
        [0.75, "rgba(30,41,59,0.1)"],
        [1, "rgba(30,41,59,0.55)"],
      ]);
      radial(ctx, c * 0.7, c * 0.55, r * 0.5, [
        [0, "rgba(255,255,255,0.7)"],
        [1, "rgba(255,255,255,0)"],
      ]);
    }),
  };
}
