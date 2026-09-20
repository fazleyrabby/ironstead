import { Container } from "pixi.js";
import { CAMERA, WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";

export class Camera {
  readonly view: Container;

  private viewportW = 1;
  private viewportH = 1;
  private zoom = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private readonly keys = new Set<string>();

  constructor(view: Container) {
    this.view = view;
    this.view.scale.set(this.zoom);
  }

  resize(width: number, height: number): void {
    this.viewportW = width;
    this.viewportH = height;
    this.clamp();
  }

  centerOn(worldX: number, worldY: number, zoom = 1): void {
    this.zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom));
    this.view.scale.set(this.zoom);
    this.view.x = this.viewportW / 2 - worldX * this.zoom;
    this.view.y = this.viewportH / 2 - worldY * this.zoom;
    this.clamp();
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.view.x) / this.zoom,
      y: (screenY - this.view.y) / this.zoom,
    };
  }

  setPanKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  zoomAt(screenX: number, screenY: number, deltaY: number): void {
    const factor = Math.exp(-deltaY * 0.0012);
    const next = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, this.zoom * factor));
    if (next === this.zoom) return;

    const worldX = (screenX - this.view.x) / this.zoom;
    const worldY = (screenY - this.view.y) / this.zoom;
    this.zoom = next;
    this.view.scale.set(this.zoom);
    this.view.x = screenX - worldX * this.zoom;
    this.view.y = screenY - worldY * this.zoom;
    this.clamp();
  }

  beginDrag(screenX: number, screenY: number): void {
    this.dragging = true;
    this.lastX = screenX;
    this.lastY = screenY;
  }

  moveDrag(screenX: number, screenY: number): void {
    if (!this.dragging) return;
    this.view.x += screenX - this.lastX;
    this.view.y += screenY - this.lastY;
    this.lastX = screenX;
    this.lastY = screenY;
    this.clamp();
  }

  endDrag(): void {
    this.dragging = false;
  }

  update(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) dy -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) dy += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) dx -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) dx += 1;
    if (dx === 0 && dy === 0) return;

    const len = Math.hypot(dx, dy) || 1;
    this.view.x -= (dx / len) * CAMERA.panSpeed * dt * this.zoom;
    this.view.y -= (dy / len) * CAMERA.panSpeed * dt * this.zoom;
    this.clamp();
  }

  private clamp(): void {
    const scaledW = WORLD_WIDTH * this.zoom;
    const scaledH = WORLD_HEIGHT * this.zoom;

    if (scaledW <= this.viewportW) {
      this.view.x = (this.viewportW - scaledW) / 2;
    } else {
      this.view.x = Math.min(0, Math.max(this.viewportW - scaledW, this.view.x));
    }

    if (scaledH <= this.viewportH) {
      this.view.y = (this.viewportH - scaledH) / 2;
    } else {
      this.view.y = Math.min(0, Math.max(this.viewportH - scaledH, this.view.y));
    }
  }
}
