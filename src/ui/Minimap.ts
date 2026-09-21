import { MAP_LAYOUT, PONDS } from "../config/map";
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH, worldToTile } from "../config/world";
import { STYLE } from "../render/style";
import { isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Camera } from "../render/Camera";
import type { GameState } from "../sim/types";

export interface MinimapOptions {
  onNavigate: (worldX: number, worldY: number) => void;
  onOrder?: (worldX: number, worldY: number) => void;
}

const WIDTH = 208;
const HEIGHT = 139;

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private readonly fog: HTMLCanvasElement;
  private readonly options: MinimapOptions;
  private fogVersion = -1;
  private dragging = false;

  constructor(parent: HTMLElement, options: MinimapOptions) {
    this.options = options;

    const panel = document.createElement("div");
    panel.className = "minimap";
    this.canvas = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(WIDTH * dpr);
    this.canvas.height = Math.round(HEIGHT * dpr);
    this.canvas.style.width = `${WIDTH}px`;
    this.canvas.style.height = `${HEIGHT}px`;
    panel.appendChild(this.canvas);
    parent.appendChild(panel);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Minimap: 2D context unavailable");
    this.ctx = ctx;
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false;

    this.background = this.buildBackground();
    this.fog = document.createElement("canvas");

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
  }

  update(state: GameState, visibility: VisibilityMap, camera: Camera): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(this.background, 0, 0, WIDTH, HEIGHT);
    this.drawFog(visibility);
    ctx.drawImage(this.fog, 0, 0, WIDTH, HEIGHT);
    this.drawEntities(state, visibility);
    this.drawViewport(camera);
  }

  private buildBackground(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const g = canvas.getContext("2d");
    if (!g) return canvas;

    g.fillStyle = hex(STYLE.grass);
    g.fillRect(0, 0, WIDTH, HEIGHT);

    const roadY = HEIGHT / 2;
    const roadH = (112 / WORLD_HEIGHT) * HEIGHT;
    g.fillStyle = hex(STYLE.dirt);
    g.fillRect(0, roadY - roadH / 2, WIDTH, roadH);

    g.fillStyle = hex(STYLE.dirt);
    for (const id of ["player", "enemy"] as const) {
      const tile = MAP_LAYOUT[id].baseTile;
      const x = ((tile.x * TILE_SIZE) / WORLD_WIDTH) * WIDTH;
      const y = ((tile.y * TILE_SIZE) / WORLD_HEIGHT) * HEIGHT;
      g.beginPath();
      g.ellipse(x, y + 2, 20, 15, 0, 0, Math.PI * 2);
      g.fill();
    }

    g.fillStyle = hex(STYLE.water);
    for (const pond of PONDS) {
      const x = (pond.tileX * TILE_SIZE) / WORLD_WIDTH * WIDTH;
      const y = (pond.tileY * TILE_SIZE) / WORLD_HEIGHT * HEIGHT;
      const rx = (pond.radius * TILE_SIZE) / WORLD_WIDTH * WIDTH;
      const ry = (pond.radius * TILE_SIZE) / WORLD_HEIGHT * HEIGHT;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }

    return canvas;
  }

  private drawFog(visibility: VisibilityMap): void {
    if (visibility.version === this.fogVersion) return;
    this.fogVersion = visibility.version;

    const cols = visibility.cols;
    const rows = visibility.rows;
    if (this.fog.width !== cols || this.fog.height !== rows) {
      this.fog.width = cols;
      this.fog.height = rows;
    }
    const g = this.fog.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, cols, rows);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        if (visibility.visible[i] === 1) continue;
        g.fillStyle = visibility.explored[i] === 1 ? "rgba(7,9,18,0.5)" : "rgba(7,9,18,0.92)";
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  private drawEntities(state: GameState, visibility: VisibilityMap): void {
    const { ctx } = this;
    for (const id of ["player", "enemy"] as const) {
      const player = state.players[id];
      ctx.fillStyle = id === "player" ? "#3b82f6" : "#ef4444";

      for (const building of player.buildings) {
        if (building.state === "destroyed") continue;
        if (id === "enemy" && !isTileVisible(visibility, building.tileX, building.tileY)) continue;
        const x = (building.x / WORLD_WIDTH) * WIDTH;
        const y = (building.y / WORLD_HEIGHT) * HEIGHT;
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }

      for (const unit of player.units) {
        if (unit.state === "dead") continue;
        if (id === "enemy") {
          const tile = worldToTile(unit.x, unit.y);
          if (!isTileVisible(visibility, tile.x, tile.y)) continue;
        }
        const x = (unit.x / WORLD_WIDTH) * WIDTH;
        const y = (unit.y / WORLD_HEIGHT) * HEIGHT;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }

  private drawViewport(camera: Camera): void {
    const bounds = camera.viewBounds();
    const x = (bounds.x / WORLD_WIDTH) * WIDTH;
    const y = (bounds.y / WORLD_HEIGHT) * HEIGHT;
    const w = (bounds.width / WORLD_WIDTH) * WIDTH;
    const h = (bounds.height / WORLD_HEIGHT) * HEIGHT;
    const { ctx } = this;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 2) {
      // right-click: issue a move/attack order at that world position
      const world = this.toWorld(event);
      this.options.onOrder?.(world.x, world.y);
      return;
    }
    this.dragging = true;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // pointer capture is best-effort
    }
    this.navigate(event);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.dragging) this.navigate(event);
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  private navigate(event: PointerEvent): void {
    const world = this.toWorld(event);
    this.options.onNavigate(world.x, world.y);
  }

  private toWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return { x: px * WORLD_WIDTH, y: py * WORLD_HEIGHT };
  }
}
