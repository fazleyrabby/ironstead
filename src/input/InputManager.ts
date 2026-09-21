import { Camera } from "../render/Camera";

export interface InputCallbacks {
  onPrimaryClick?: (screenX: number, screenY: number) => void;
  onSecondaryClick?: (screenX: number, screenY: number) => void;
  onBoxSelect?: (x0: number, y0: number, x1: number, y1: number) => void;
  onKeyDown?: (code: string, event: KeyboardEvent) => void;
}

export interface DragBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  active: boolean;
}

export class InputManager {
  readonly pointer = { x: 0, y: 0, inside: false };
  readonly dragBox: DragBox = { x0: 0, y0: 0, x1: 0, y1: 0, active: false };

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
      this.callbacks.onKeyDown?.(event.code, event);
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
    const isPan = event.button === 1;
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
      if (event.button === 0) {
        const rect = this.canvas.getBoundingClientRect();
        this.dragBox.x0 = event.clientX - rect.left;
        this.dragBox.y0 = event.clientY - rect.top;
        this.dragBox.x1 = this.dragBox.x0;
        this.dragBox.y1 = this.dragBox.y0;
        this.dragBox.active = false;
      }
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
      if (this.downButton === 0) {
        const rect = this.canvas.getBoundingClientRect();
        this.dragBox.x1 = event.clientX - rect.left;
        this.dragBox.y1 = event.clientY - rect.top;
        this.dragBox.active = true;
      }
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
    const wasBox = this.dragBox.active && event.button === 0;
    const box = { ...this.dragBox };
    this.downButton = -1;
    this.dragBox.active = false;

    if (wasMoved) {
      if (wasBox) {
        this.callbacks.onBoxSelect?.(box.x0, box.y0, box.x1, box.y1);
      }
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (event.button === 0) this.callbacks.onPrimaryClick?.(x, y);
    else if (event.button === 2) this.callbacks.onSecondaryClick?.(x, y);
  };
}
