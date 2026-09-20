import { Container, Graphics } from "pixi.js";
import { PALETTE } from "../config/world";
import { def } from "../sim/selectors";
import type { Building, GameState, PlayerId } from "../sim/types";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

interface Entry {
  container: Container;
  body: Graphics;
  overlay: Graphics;
  progress: Graphics;
  state: string;
  selected: boolean;
}

export class BuildingRenderer {
  private readonly layer: Container;
  private readonly entries = new Map<string, Entry>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  update(state: GameState, selectedId?: string): void {
    const seen = new Set<string>();

    for (const id of ["player", "enemy"] as const) {
      for (const building of state.players[id].buildings) {
        if (building.state === "destroyed") continue;
        seen.add(building.id);

        let entry = this.entries.get(building.id);
        if (!entry) {
          entry = this.createEntry();
          this.entries.set(building.id, entry);
        }

        this.sync(entry, building, selectedId === building.id);
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.container.destroy({ children: true });
      this.entries.delete(id);
    }
  }

  private createEntry(): Entry {
    const container = new Container();
    const body = new Graphics();
    const overlay = new Graphics();
    const progress = new Graphics();
    container.addChild(body, overlay, progress);
    this.layer.addChild(container);
    return { container, body, overlay, progress, state: "", selected: false };
  }

  private sync(entry: Entry, building: Building, selected: boolean): void {
    entry.container.position.set(building.x, building.y);

    if (entry.state !== building.state) {
      entry.state = building.state;
      drawBody(entry.body, building);
    }

    if (entry.selected !== selected) {
      entry.selected = selected;
      entry.overlay.clear();
      if (selected) {
        const w = building.width;
        const h = building.height;
        entry.overlay
          .roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 8)
          .stroke({ width: 3, color: 0xffe066, alpha: 0.95 });
      }
    }

    entry.progress.clear();
    if (building.state === "constructing") {
      const w = building.width;
      const h = building.height;
      const barW = Math.max(w, 40);
      const x = -barW / 2;
      const y = -h / 2 - 16;
      entry.progress
        .roundRect(x, y, barW, 8, 4)
        .fill({ color: 0x000000, alpha: 0.55 })
        .roundRect(x, y, barW * building.buildProgress, 8, 4)
        .fill({ color: 0x7ee081 });
    }
  }
}

function drawBody(g: Graphics, building: Building): void {
  g.clear();
  const w = building.width;
  const h = building.height;
  const definition = def(building.type);
  const colors = definition.colors;

  if (building.type === "forest") {
    drawForest(g, w, h, colors.body, colors.roof, colors.accent);
  } else if (building.type === "gold_vein") {
    drawGold(g, w, h, colors.body, colors.accent);
  } else {
    g.ellipse(0, h * 0.42, w * 0.5, h * 0.22).fill({ color: 0x000000, alpha: 0.16 });
    g.roundRect(-w / 2, -h / 2, w, h, 7).fill(colors.body);
    g.roundRect(-w / 2, -h / 2, w, h * 0.34, 7).fill(colors.roof);
    g.roundRect(-w * 0.28, -h * 0.12, w * 0.56, h * 0.4, 4).fill(colors.accent);
    g.roundRect(-w / 2, -h / 2, w, h, 7).stroke({
      width: 4,
      color: PALETTE.outline,
      alpha: 0.8,
    });
  }

  const stripe = FACTION_COLORS[building.owner];
  g.rect(-w / 2 + 4, h / 2 - 6, w - 8, 4).fill({ color: stripe, alpha: 0.9 });

  if (building.state === "constructing") {
    g.tint = 0xbfbfbf;
  } else {
    g.tint = 0xffffff;
  }
}

function drawForest(g: Graphics, w: number, h: number, dark: number, mid: number, light: number): void {
  g.ellipse(0, h * 0.38, w * 0.5, h * 0.2).fill({ color: 0x000000, alpha: 0.16 });
  const spots: Array<[number, number, number]> = [
    [-w * 0.18, -h * 0.12, w * 0.3],
    [w * 0.2, -h * 0.02, w * 0.26],
    [0, -h * 0.24, w * 0.24],
  ];
  for (const [x, y, r] of spots) {
    g.circle(x, y + r * 0.6, r * 0.85).fill({ color: 0x000000, alpha: 0.15 });
    g.circle(x, y, r).fill(dark);
    g.circle(x - r * 0.3, y - r * 0.35, r * 0.7).fill(mid);
    g.circle(x - r * 0.4, y - r * 0.5, r * 0.35).fill(light);
  }
}

function drawGold(g: Graphics, w: number, h: number, rock: number, gold: number): void {
  g.ellipse(0, h * 0.36, w * 0.5, h * 0.2).fill({ color: 0x000000, alpha: 0.16 });
  g.ellipse(0, 0, w * 0.44, h * 0.4).fill(rock);
  g.ellipse(0, 0, w * 0.44, h * 0.4).stroke({ width: 4, color: PALETTE.outline, alpha: 0.8 });
  const dots: Array<[number, number, number]> = [
    [-w * 0.14, -h * 0.06, w * 0.08],
    [w * 0.12, h * 0.04, w * 0.07],
    [w * 0.02, -h * 0.18, w * 0.06],
  ];
  for (const [x, y, r] of dots) {
    g.circle(x, y, r).fill(gold);
    g.circle(x, y, r).stroke({ width: 2, color: 0x7a5a12, alpha: 0.8 });
  }
}
