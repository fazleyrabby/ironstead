import { Camera } from "../render/Camera";

export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly keys = new Set<string>();
  private panning = false;
  private panButton = -1;

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
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

  private readonly onPointerDown = (event: PointerEvent): void => {
    const isPan = event.button === 1 || (event.button === 0 && this.keys.has("Space"));
    if (!isPan) return;
    event.preventDefault();
    this.panning = true;
    this.panButton = event.button;
    this.camera.beginDrag(event.clientX, event.clientY);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.panning) return;
    this.camera.moveDrag(event.clientX, event.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.panning || event.button !== this.panButton) return;
    this.panning = false;
    this.panButton = -1;
    this.camera.endDrag();
  };
}
