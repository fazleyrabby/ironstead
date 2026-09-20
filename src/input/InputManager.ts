import { Camera } from "../render/Camera";

export interface InputCallbacks {
  onPrimaryClick?: (screenX: number, screenY: number) => void;
  onSecondaryClick?: (screenX: number, screenY: number) => void;
  onKeyDown?: (code: string) => void;
}

export class InputManager {
  readonly pointer = { x: 0, y: 0, inside: false };

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly callbacks: InputCallbacks;
  private readonly keys = new Set<string>();

  private panning = false;
  private panButton = -1;
  private downButton = -1;
  private downX = 0;
  private downY = 0;
  private moved = false;

  constructor(canvas: HTMLCanvasElement, camera: Camera, callbacks: InputCallbacks = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerenter", this.onPointerEnter);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.keys.has(event.code)) {
      this.callbacks.onKeyDown?.(event.code);
    }
    this.keys.add(event.code);
    this.camera.setPanKey(event.code, true);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    this.camera.setPanKey(event.code, false);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY);
  };

  private readonly onPointerEnter = (): void => {
    this.pointer.inside = true;
  };

  private readonly onPointerLeave = (): void => {
    this.pointer.inside = false;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    const isPan = event.button === 1 || (event.button === 0 && this.keys.has("Space"));
    if (isPan) {
      event.preventDefault();
      this.panning = true;
      this.panButton = event.button;
      this.moved = true;
      this.camera.beginDrag(event.clientX, event.clientY);
      return;
    }

    if (event.button === 0 || event.button === 2) {
      this.downButton = event.button;
      this.downX = event.clientX;
      this.downY = event.clientY;
      this.moved = false;
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;

    if (this.panning) {
      this.camera.moveDrag(event.clientX, event.clientY);
      return;
    }

    if (
      this.downButton !== -1 &&
      Math.abs(event.clientX - this.downX) + Math.abs(event.clientY - this.downY) > 6
    ) {
      this.moved = true;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.panning && event.button === this.panButton) {
      this.panning = false;
      this.panButton = -1;
      this.camera.endDrag();
      return;
    }

    if (this.downButton === -1 || event.button !== this.downButton) return;

    const wasMoved = this.moved;
    this.downButton = -1;

    if (wasMoved) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (event.button === 0) this.callbacks.onPrimaryClick?.(x, y);
    else if (event.button === 2) this.callbacks.onSecondaryClick?.(x, y);
  };
}
