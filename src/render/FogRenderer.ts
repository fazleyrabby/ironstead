import { Container, Sprite, Texture } from "pixi.js";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";
import type { VisibilityMap } from "../sim/visibility";

const UNEXPLORED = "rgba(7, 9, 18, 1)";
const EXPLORED = "rgba(7, 9, 18, 0.52)";

export class FogRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: Texture;
  private lastVersion = -1;

  constructor(layer: Container, cols: number, rows: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = cols;
    this.canvas.height = rows;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;

    this.texture = Texture.from(this.canvas);
    const sprite = new Sprite(this.texture);
    sprite.width = WORLD_WIDTH;
    sprite.height = WORLD_HEIGHT;
    layer.addChild(sprite);
  }

  update(map: VisibilityMap): void {
    if (map.version === this.lastVersion) return;
    this.lastVersion = map.version;

    const { ctx } = this;
    const width = map.cols;
    const height = map.rows;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = UNEXPLORED;
    ctx.beginPath();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (map.visible[i] === 1 || map.explored[i] === 1) continue;
        ctx.rect(x, y, 1, 1);
      }
    }
    ctx.fill();

    ctx.fillStyle = EXPLORED;
    ctx.beginPath();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (map.visible[i] === 1 || map.explored[i] === 0) continue;
        ctx.rect(x, y, 1, 1);
      }
    }
    ctx.fill();

    this.texture.source.update();
  }
}
