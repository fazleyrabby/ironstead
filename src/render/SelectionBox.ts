export interface BoxRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Drag-select rectangle as a DOM overlay above the game canvas.
export class SelectionBox {
  private readonly element: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "absolute",
      display: "none",
      pointerEvents: "none",
      background: "rgba(126, 224, 129, 0.12)",
      border: "1.5px solid rgba(126, 224, 129, 0.9)",
      boxSizing: "border-box",
    });
    parent.appendChild(this.element);
  }

  update(rect: BoxRect | undefined): void {
    const w = rect ? Math.abs(rect.x1 - rect.x0) : 0;
    const h = rect ? Math.abs(rect.y1 - rect.y0) : 0;
    if (!rect || (w < 3 && h < 3)) {
      this.element.style.display = "none";
      return;
    }
    Object.assign(this.element.style, {
      display: "block",
      left: `${Math.min(rect.x0, rect.x1)}px`,
      top: `${Math.min(rect.y0, rect.y1)}px`,
      width: `${w}px`,
      height: `${h}px`,
    });
  }
}
