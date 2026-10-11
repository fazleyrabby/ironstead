import { Application, Container, Rectangle } from "pixi.js";
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type UvRect = [u0: number, v0: number, u1: number, v1: number];

// An offscreen Pixi canvas used as a live sprite sheet: the existing 2D
// renderers draw into cells and Three samples the canvas as one texture.
export class Atlas {
  readonly layer: Container;
  readonly texture: CanvasTexture;
  readonly width: number;
  readonly height: number;
  private readonly app: Application;

  private constructor(app: Application, width: number, height: number) {
    this.app = app;
    this.width = width;
    this.height = height;
    this.layer = app.stage;
    this.texture = new CanvasTexture(app.canvas as HTMLCanvasElement);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 4;
  }

  static async create(width: number, height: number, resolution: number): Promise<Atlas> {
    const app = new Application();
    await app.init({
      width,
      height,
      resolution,
      autoDensity: false,
      backgroundAlpha: 0,
      antialias: true,
      preference: "webgl",
      autoStart: false,
    });
    app.ticker.stop();
    return new Atlas(app, width, height);
  }

  render(): void {
    this.app.renderer.render(this.app.stage);
    this.texture.needsUpdate = true;
  }

  uv(cell: Cell): UvRect {
    return [
      cell.x / this.width,
      1 - (cell.y + cell.h) / this.height,
      (cell.x + cell.w) / this.width,
      1 - cell.y / this.height,
    ];
  }

  // One-off bake of a display object (not on the atlas stage) to a 2D canvas.
  bake(target: Container, frame: Rectangle, resolution: number): HTMLCanvasElement {
    return this.app.renderer.extract.canvas({
      target,
      frame,
      resolution,
      antialias: true,
    }) as HTMLCanvasElement;
  }
}

// Fixed grid of equally sized cells inside an atlas, handed out per object.
export class CellGrid {
  private readonly cells: Cell[] = [];
  private readonly free: number[] = [];
  private readonly used = new Map<object, number>();
  private readonly seen = new Set<object>();

  constructor(originX: number, originY: number, cols: number, rows: number, cellW: number, cellH: number) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        this.cells.push({ x: originX + col * cellW, y: originY + row * cellH, w: cellW, h: cellH });
      }
    }
    for (let i = this.cells.length - 1; i >= 0; i -= 1) this.free.push(i);
  }

  begin(): void {
    this.seen.clear();
  }

  // Returns the object's cell, allocating one if needed; `fresh` marks a new allocation.
  acquire(key: object): { cell: Cell; fresh: boolean } | undefined {
    this.seen.add(key);
    const existing = this.used.get(key);
    if (existing !== undefined) return { cell: this.cells[existing], fresh: false };
    const index = this.free.pop();
    if (index === undefined) return undefined;
    this.used.set(key, index);
    return { cell: this.cells[index], fresh: true };
  }

  // Releases cells whose objects were not acquired since begin().
  end(): void {
    for (const [key, index] of this.used) {
      if (this.seen.has(key)) continue;
      this.used.delete(key);
      this.free.push(index);
    }
  }
}
