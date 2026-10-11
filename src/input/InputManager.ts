import { Camera } from "../render/Camera";

export interface InputCallbacks {
  onPrimaryClick?: (screenX: number, screenY: number) => void;
  onSecondaryClick?: (screenX: number, screenY: number) => void;
  onBoxSelect?: (x0: number, y0: number, x1: number, y1: number) => void;
  onKeyDown?: (code: string, event: KeyboardEvent) => void;
  // Touch tap; falls back to onPrimaryClick when not provided.
  onTap?: (screenX: number, screenY: number) => void;
}

// Touch: tap = select/order, drag = pan, pinch = zoom, long-press then drag =
// box select, long-press and release = secondary (right-click) action.
const LONG_PRESS_MS = 380;
const TOUCH_SLOP = 10;

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

  private readonly touches = new Map<number, { x: number; y: number }>();
  private touchMode: "idle" | "pending" | "pan" | "pinch" | "held" | "box" = "idle";
  private touchStartX = 0;
  private touchStartY = 0;
  private pinchDistance = 0;
  private longPressTimer = 0;

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
    window.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    canvas.style.touchAction = "none";
  }

  private local(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private pinchState(): { x: number; y: number; distance: number } {
    const [a, b] = [...this.touches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  private touchDown(event: PointerEvent): void {
    const point = this.local(event);
    this.touches.set(event.pointerId, point);
    window.clearTimeout(this.longPressTimer);
    if (this.touchMode === "pan") this.camera.endDrag();

    if (this.touches.size === 1) {
      this.touchMode = "pending";
      this.touchStartX = point.x;
      this.touchStartY = point.y;
      this.pointer.x = point.x;
      this.pointer.y = point.y;
      this.pointer.inside = true;
      this.longPressTimer = window.setTimeout(() => {
        if (this.touchMode !== "pending") return;
        this.touchMode = "held";
        navigator.vibrate?.(12);
      }, LONG_PRESS_MS);
      return;
    }

    if (this.touches.size === 2) {
      const pinch = this.pinchState();
      this.touchMode = "pinch";
      this.dragBox.active = false;
      this.pinchDistance = pinch.distance;
      this.camera.beginDrag(pinch.x, pinch.y);
    }
  }

  private touchMove(event: PointerEvent): void {
    const point = this.local(event);
    this.touches.set(event.pointerId, point);

    if (this.touchMode === "pinch" && this.touches.size >= 2) {
      const pinch = this.pinchState();
      if (this.pinchDistance > 0 && pinch.distance > 0) {
        // Same exponential mapping the wheel uses, so pinch tracks the fingers.
        this.camera.zoomAt(pinch.x, pinch.y, -Math.log(pinch.distance / this.pinchDistance) / 0.0012);
      }
      this.pinchDistance = pinch.distance;
      this.camera.moveDrag(pinch.x, pinch.y);
      return;
    }

    this.pointer.x = point.x;
    this.pointer.y = point.y;
    const travelled = Math.hypot(point.x - this.touchStartX, point.y - this.touchStartY);

    if (this.touchMode === "pending" && travelled > TOUCH_SLOP) {
      window.clearTimeout(this.longPressTimer);
      this.touchMode = "pan";
      this.camera.beginDrag(this.touchStartX, this.touchStartY);
    }
    if (this.touchMode === "held" && travelled > TOUCH_SLOP) {
      this.touchMode = "box";
      this.dragBox.x0 = this.touchStartX;
      this.dragBox.y0 = this.touchStartY;
    }

    if (this.touchMode === "pan") this.camera.moveDrag(point.x, point.y);
    if (this.touchMode === "box") {
      this.dragBox.x1 = point.x;
      this.dragBox.y1 = point.y;
      this.dragBox.active = true;
    }
  }

  private touchUp(event: PointerEvent, cancelled: boolean): void {
    if (!this.touches.delete(event.pointerId)) return;
    window.clearTimeout(this.longPressTimer);
    const mode = this.touchMode;

    if (mode === "pinch") {
      this.camera.endDrag();
      // Stay inert until every finger lifts so a pinch never ends in a tap.
      this.touchMode = this.touches.size === 0 ? "idle" : "pinch";
      if (this.touches.size === 1) this.pinchDistance = 0;
      return;
    }

    this.touchMode = "idle";
    this.pointer.inside = false;
    if (mode === "pan") this.camera.endDrag();
    if (cancelled) {
      this.dragBox.active = false;
      return;
    }

    const point = this.local(event);
    if (mode === "pending") {
      if (this.callbacks.onTap) this.callbacks.onTap(point.x, point.y);
      else this.callbacks.onPrimaryClick?.(point.x, point.y);
    } else if (mode === "held") {
      this.callbacks.onSecondaryClick?.(point.x, point.y);
    } else if (mode === "box") {
      const box = { ...this.dragBox };
      this.dragBox.active = false;
      this.callbacks.onBoxSelect?.(box.x0, box.y0, box.x1, box.y1);
    }
  }

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === "touch") this.touchUp(event, true);
  };

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

  private readonly onPointerEnter = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") this.pointer.inside = true;
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType !== "touch") this.pointer.inside = false;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      this.touchDown(event);
      return;
    }
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
    if (event.pointerType === "touch") {
      if (this.touches.has(event.pointerId)) this.touchMove(event);
      return;
    }
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
    if (event.pointerType === "touch") {
      this.touchUp(event, false);
      return;
    }
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
