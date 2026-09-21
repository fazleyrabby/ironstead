import { Container, Graphics } from "pixi.js";
import { PALETTE, worldToTile } from "../config/world";
import { unitDef } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { GameState, PlayerId, Unit } from "../sim/types";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

interface Entry {
  container: Container;
  body: Graphics;
  overlay: Graphics;
  selected: boolean;
  hpBucket: number;
}

export class UnitRenderer {
  private readonly layer: Container;
  private readonly entries = new Map<string, Entry>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  update(state: GameState, selectedIds: readonly string[], playerMap: VisibilityMap): void {
    const selected = new Set(selectedIds);
    const seen = new Set<string>();

    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        if (unit.state === "dead") continue;

        const mode = id === "player" ? "sync" : this.enemyMode(playerMap, unit);
        if (mode === "hide") continue;
        seen.add(unit.id);

        let entry = this.entries.get(unit.id);
        if (!entry) {
          entry = this.createEntry(unit);
          this.entries.set(unit.id, entry);
        }
        if (mode === "sync") {
          entry.container.visible = true;
          entry.container.alpha = 1;
          this.sync(entry, unit, selected.has(unit.id));
        }
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.container.destroy({ children: true });
      this.entries.delete(id);
    }
  }

  private enemyMode(map: VisibilityMap, unit: Unit): "sync" | "freeze" | "hide" {
    const tile = worldToTile(unit.x, unit.y);
    if (isTileVisible(map, tile.x, tile.y)) return "sync";
    const entry = this.entries.get(unit.id);
    if (!entry) return "hide";
    if (isTileExplored(map, tile.x, tile.y)) {
      entry.container.visible = true;
      entry.container.alpha = 0.55;
      return "freeze";
    }
    entry.container.visible = false;
    return "hide";
  }

  private createEntry(unit: Unit): Entry {
    const container = new Container();
    const body = new Graphics();
    const overlay = new Graphics();
    drawBody(body, unit);
    container.addChild(body, overlay);
    this.layer.addChild(container);
    return { container, body, overlay, selected: false, hpBucket: -1 };
  }

  private sync(entry: Entry, unit: Unit, selected: boolean): void {
    entry.container.position.set(unit.x, unit.y);

    const hpBucket = Math.ceil((unit.hp / unit.maxHp) * 10);
    if (entry.selected !== selected || entry.hpBucket !== hpBucket) {
      entry.selected = selected;
      entry.hpBucket = hpBucket;
      redrawOverlay(entry.overlay, unit, selected);
    }
  }
}

function drawBody(g: Graphics, unit: Unit): void {
  const definition = unitDef(unit.type);
  const radius = definition.radius;

  g.ellipse(0, radius * 0.85, radius, radius * 0.45).fill({ color: 0x000000, alpha: 0.18 });
  g.circle(0, 0, radius + 2.5).fill(FACTION_COLORS[unit.owner]);
  g.circle(0, 0, radius).fill(definition.color);
  g.circle(-radius * 0.35, -radius * 0.35, radius * 0.45).fill({ color: 0xffffff, alpha: 0.25 });
  g.circle(0, 0, radius).stroke({ width: 2.5, color: PALETTE.outline, alpha: 0.85 });

  if (unit.type === "horse_rider") {
    g.poly([
      -radius - 3,
      -radius * 0.4,
      -radius + 3,
      0,
      -radius - 3,
      radius * 0.4,
    ]).fill({ color: 0x5b3a1e });
  } else if (unit.type === "spearman" || unit.type === "swordsman") {
    g.rect(-1.5, -radius - 6, 3, 10).fill({ color: 0xd7dde6 });
  } else if (unit.type === "crossbowman") {
    g.rect(-radius - 5, -1.5, 8, 3).fill({ color: 0x6b4a2b });
  } else {
    g.circle(0, -1, radius * 0.32).fill({ color: 0x8a5a2b });
  }
}

function redrawOverlay(g: Graphics, unit: Unit, selected: boolean): void {
  g.clear();
  const definition = unitDef(unit.type);
  const radius = definition.radius;

  if (selected) {
    g.circle(0, 0, radius + 6).stroke({ width: 2.5, color: 0x7ee081, alpha: 0.95 });
  }

  if (selected || unit.hp < unit.maxHp) {
    const barW = Math.max(24, radius * 2 + 6);
    const x = -barW / 2;
    const y = -radius - 12;
    const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    g.roundRect(x, y, barW, 5, 2.5).fill({ color: 0x000000, alpha: 0.6 });
    g.roundRect(x, y, barW * ratio, 5, 2.5).fill({
      color: ratio > 0.55 ? 0x7ee081 : ratio > 0.25 ? 0xf2c14e : 0xef4444,
    });
  }
}
