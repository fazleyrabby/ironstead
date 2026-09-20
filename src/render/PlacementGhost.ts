import { Container, Graphics } from "pixi.js";
import { TILE_SIZE } from "../config/world";
import { def } from "../sim/selectors";
import type { PlacementResult } from "../sim/placement";
import type { UiState } from "../sim/types";

export class PlacementGhost {
  private readonly graphics: Graphics;

  constructor(layer: Container) {
    this.graphics = new Graphics();
    layer.addChild(this.graphics);
  }

  update(ui: UiState, result: PlacementResult | null): void {
    this.graphics.clear();

    if (!ui.pendingBuild || !ui.hoverTile) {
      this.graphics.visible = false;
      return;
    }

    const definition = def(ui.pendingBuild);
    const width = definition.tilesW * TILE_SIZE;
    const height = definition.tilesH * TILE_SIZE;
    const x = ui.hoverTile.x * TILE_SIZE;
    const y = ui.hoverTile.y * TILE_SIZE;
    const ok = result?.ok ?? false;
    const color = ok ? 0x4ade80 : 0xef4444;

    this.graphics.visible = true;
    this.graphics
      .roundRect(x + 2, y + 2, width - 4, height - 4, 6)
      .fill({ color, alpha: 0.3 });
    this.graphics
      .roundRect(x + 2, y + 2, width - 4, height - 4, 6)
      .stroke({ width: 3, color, alpha: 0.95 });
    this.graphics
      .roundRect(x + width * 0.3, y + height * 0.3, width * 0.4, height * 0.4, 4)
      .fill({ color, alpha: 0.35 });
  }
}
