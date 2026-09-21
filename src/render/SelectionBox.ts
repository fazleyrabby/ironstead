import { Container, Graphics } from "pixi.js";

export interface BoxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class SelectionBox {
  private readonly graphics: Graphics;

  constructor(screenLayer: Container) {
    this.graphics = new Graphics();
    screenLayer.addChild(this.graphics);
  }

  update(rect: BoxRect | undefined): void {
    this.graphics.clear();
    if (!rect) return;

    const x = Math.min(rect.x0, rect.x1);
    const y = Math.min(rect.y0, rect.y1);
    const w = Math.abs(rect.x1 - rect.x0);
    const h = Math.abs(rect.y1 - rect.y0);
    if (w < 3 && h < 3) return;

    this.graphics.rect(x, y, w, h).fill({ color: 0x7ee081, alpha: 0.12 });
    this.graphics.rect(x, y, w, h).stroke({ width: 1.5, color: 0x7ee081, alpha: 0.9 });
  }
}
