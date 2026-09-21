import { Texture } from "pixi.js";

let cached: Texture | undefined;

export function softShadowTexture(): Texture {
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0.5)");
    gradient.addColorStop(0.45, "rgba(0,0,0,0.28)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  cached = Texture.from(canvas);
  return cached;
}
