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

const OUTLINE = PALETTE.outline;
const SKIN = 0xe8b98a;
const STEEL = 0xb9c2cc;
const STEEL_DARK = 0x7c8794;
const WOOD = 0x7a5230;

interface Entry {
  container: Container;
  body: Graphics;
  overlay: Graphics;
  selected: boolean;
  hpBucket: number;
  rallyOn: boolean;
  lastX: number;
  facing: number;
}

export class UnitRenderer {
  private readonly layer: Container;
  private readonly entries = new Map<string, Entry>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  update(
    state: GameState,
    selectedIds: readonly string[],
    playerMap: VisibilityMap,
    nowSec: number,
  ): void {
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
          this.sync(entry, unit, selected.has(unit.id), nowSec);
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
    return {
      container,
      body,
      overlay,
      selected: false,
      hpBucket: -1,
      rallyOn: false,
      lastX: unit.x,
      facing: 1,
    };
  }

  private sync(entry: Entry, unit: Unit, selected: boolean, nowSec: number): void {
    entry.container.position.set(unit.x, unit.y);

    const dx = unit.x - entry.lastX;
    if (Math.abs(dx) > 1.5) {
      entry.facing = dx > 0 ? 1 : -1;
      entry.lastX = unit.x;
    } else if (unit.state === "idle") {
      entry.lastX = unit.x;
    }

    const pulse =
      unit.state === "attacking" ? 1 + 0.08 * Math.sin(nowSec * 18 + unit.y * 0.3) : 1;
    entry.body.scale.set(entry.facing * pulse, pulse);

    const hpBucket = Math.ceil((unit.hp / unit.maxHp) * 10);
    const rallyOn = unit.rallyTimer > 0;
    if (entry.selected !== selected || entry.hpBucket !== hpBucket || entry.rallyOn !== rallyOn) {
      entry.selected = selected;
      entry.hpBucket = hpBucket;
      entry.rallyOn = rallyOn;
      redrawOverlay(entry.overlay, unit, selected, rallyOn);
    }
  }
}

function drawBody(g: Graphics, unit: Unit): void {
  const definition = unitDef(unit.type);
  const radius = definition.radius;
  const faction = FACTION_COLORS[unit.owner];
  const accent = definition.color;

  g.ellipse(0, radius * 0.9, radius, radius * 0.45).fill({ color: 0x000000, alpha: 0.2 });
  g.circle(0, 0, radius + 2).fill({ color: faction, alpha: 0.9 });

  switch (unit.type) {
    case "villager":
      drawVillager(g, radius, faction);
      break;
    case "swordsman":
      drawSwordsman(g, radius, faction, accent);
      break;
    case "spearman":
      drawSpearman(g, radius, faction, accent);
      break;
    case "crossbowman":
      drawCrossbowman(g, radius, faction, accent);
      break;
    case "horse_rider":
      drawHorse(g, radius, faction);
      break;
    case "hero":
      drawHero(g, radius, faction);
      break;
  }
}

function drawVillager(g: Graphics, r: number, faction: number): void {
  g.circle(0, 0, r).fill(faction);
  g.circle(0, 0, r).stroke({ width: 2.2, color: OUTLINE, alpha: 0.85 });
  g.rect(-r * 0.7, r * 0.1, r * 1.4, r * 0.32).fill({ color: 0x000000, alpha: 0.22 });
  g.circle(0, -r * 0.25, r * 0.52).fill(SKIN);
  g.poly([-r * 0.55, -r * 0.1, r * 0.55, -r * 0.1, 0, -r * 0.95]).fill(faction);
  g.poly([-r * 0.55, -r * 0.1, r * 0.55, -r * 0.1, 0, -r * 0.95]).stroke({
    width: 1.8,
    color: OUTLINE,
    alpha: 0.85,
  });
  g.circle(-r * 0.18, -r * 0.28, r * 0.09).fill(OUTLINE);
  g.circle(r * 0.18, -r * 0.28, r * 0.09).fill(OUTLINE);
}

function drawSwordsman(g: Graphics, r: number, faction: number, accent: number): void {
  g.circle(0, 0, r).fill(faction);
  g.circle(0, 0, r).stroke({ width: 2.2, color: OUTLINE, alpha: 0.85 });
  g.rect(-r * 0.7, r * 0.15, r * 1.4, r * 0.3).fill({ color: 0x000000, alpha: 0.2 });

  g.circle(-r * 0.55, r * 0.1, r * 0.42).fill(accent);
  g.circle(-r * 0.55, r * 0.1, r * 0.42).stroke({ width: 1.8, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.55, r * 0.1, r * 0.14).fill(STEEL_DARK);

  g.circle(0, -r * 0.2, r * 0.5).fill(SKIN);
  g.poly([-r * 0.5, -r * 0.25, r * 0.5, -r * 0.25, 0, -r * 0.95]).fill(STEEL);
  g.poly([-r * 0.5, -r * 0.25, r * 0.5, -r * 0.25, 0, -r * 0.95]).stroke({
    width: 1.8,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.rect(-r * 0.08, -r * 0.95, r * 0.16, r * 0.45).fill(STEEL_DARK);

  g.rect(r * 0.45, -r * 0.7, r * 0.16, r * 1.1).fill(STEEL);
  g.rect(r * 0.45, -r * 0.7, r * 0.16, r * 1.1).stroke({ width: 1.2, color: OUTLINE, alpha: 0.9 });
  g.rect(r * 0.3, r * 0.15, r * 0.46, r * 0.14).fill(0x8a6a2f);
}

function drawSpearman(g: Graphics, r: number, faction: number, accent: number): void {
  g.circle(0, 0, r).fill(faction);
  g.circle(0, 0, r).stroke({ width: 2.2, color: OUTLINE, alpha: 0.85 });

  g.rect(-r * 0.5, -r * 1.5, r * 0.14, r * 2.4).fill(WOOD);
  g.poly([-r * 0.5, -r * 1.5, -r * 0.36, -r * 1.5, -r * 0.43, -r * 1.85]).fill(STEEL);

  g.circle(0, -r * 0.2, r * 0.5).fill(SKIN);
  g.poly([-r * 0.5, -r * 0.25, r * 0.5, -r * 0.25, 0, -r * 0.9]).fill(STEEL);
  g.poly([-r * 0.5, -r * 0.25, r * 0.5, -r * 0.25, 0, -r * 0.9]).stroke({
    width: 1.8,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.poly([-r * 0.1, -r * 0.85, r * 0.1, -r * 0.85, 0, -r * 1.25]).fill(accent);
}

function drawCrossbowman(g: Graphics, r: number, faction: number, accent: number): void {
  g.poly([-r * 0.8, r * 0.8, r * 0.8, r * 0.8, 0, -r * 0.9]).fill(faction);
  g.poly([-r * 0.8, r * 0.8, r * 0.8, r * 0.8, 0, -r * 0.9]).stroke({
    width: 2.2,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.circle(0, -r * 0.25, r * 0.45).fill(SKIN);
  g.poly([-r * 0.5, -r * 0.2, r * 0.5, -r * 0.2, 0, -r * 0.95]).fill(accent);
  g.poly([-r * 0.5, -r * 0.2, r * 0.5, -r * 0.2, 0, -r * 0.95]).stroke({
    width: 1.6,
    color: OUTLINE,
    alpha: 0.9,
  });

  g.rect(r * 0.1, -r * 0.1, r * 0.9, r * 0.18).fill(WOOD);
  g.poly([r * 0.55, -r * 0.45, r * 0.55, r * 0.25]).stroke({ width: 2, color: STEEL_DARK, alpha: 1 });
  g.rect(r * 0.75, -r * 0.18, r * 0.3, r * 0.1).fill(STEEL);
}

function drawHorse(g: Graphics, r: number, faction: number): void {
  const body = 0x7a5230;
  const dark = 0x54371d;

  g.ellipse(0, r * 0.35, r * 1.05, r * 0.62).fill(body);
  g.ellipse(0, r * 0.35, r * 1.05, r * 0.62).stroke({ width: 2.2, color: OUTLINE, alpha: 0.85 });
  for (const lx of [-r * 0.6, -r * 0.2, r * 0.2, r * 0.6]) {
    g.rect(lx - r * 0.09, r * 0.6, r * 0.18, r * 0.55).fill(dark);
  }
  g.ellipse(r * 0.75, -r * 0.25, r * 0.42, r * 0.5).fill(body);
  g.ellipse(r * 0.75, -r * 0.25, r * 0.42, r * 0.5).stroke({ width: 2, color: OUTLINE, alpha: 0.85 });
  g.circle(r * 0.95, -r * 0.6, r * 0.28).fill(body);
  g.circle(r * 0.95, -r * 0.6, r * 0.28).stroke({ width: 1.8, color: OUTLINE, alpha: 0.85 });
  g.poly([r * 0.4, -r * 0.6, r * 0.75, -r * 0.45, r * 0.4, -r * 0.2]).fill(dark);
  g.poly([-r * 1.0, r * 0.1, -r * 0.8, r * 0.1, -r * 1.05, r * 0.75]).fill(dark);

  g.roundRect(-r * 0.35, -r * 0.75, r * 0.7, r * 0.75, r * 0.25).fill(faction);
  g.roundRect(-r * 0.35, -r * 0.75, r * 0.7, r * 0.75, r * 0.25).stroke({
    width: 2,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.circle(0, -r * 0.9, r * 0.32).fill(SKIN);
  g.poly([-r * 0.32, -r * 0.9, r * 0.32, -r * 0.9, 0, -r * 1.35]).fill(STEEL);
  g.poly([-r * 0.32, -r * 0.9, r * 0.32, -r * 0.9, 0, -r * 1.35]).stroke({
    width: 1.6,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.rect(r * 0.3, -r * 1.1, r * 0.12, r * 0.8).fill(STEEL);
}

function drawHero(g: Graphics, r: number, faction: number): void {
  g.ellipse(0, r * 0.95, r * 1.2, r * 0.45).fill({ color: 0x000000, alpha: 0.22 });

  g.poly([-r, r * 0.7, r, r * 0.7, 0, -r * 0.2]).fill(0x9b1c2e);
  g.poly([-r, r * 0.7, r, r * 0.7, 0, -r * 0.2]).stroke({ width: 2, color: OUTLINE, alpha: 0.9 });

  g.circle(0, 0, r).fill(0xf2c14e);
  g.circle(0, 0, r).stroke({ width: 2.4, color: OUTLINE, alpha: 0.9 });

  g.circle(0, -r * 0.25, r * 0.52).fill(SKIN);
  g.poly([-r * 0.55, -r * 0.1, r * 0.55, -r * 0.1, 0, -r * 0.95]).fill(faction);
  g.poly([-r * 0.55, -r * 0.1, r * 0.55, -r * 0.1, 0, -r * 0.95]).stroke({
    width: 1.8,
    color: OUTLINE,
    alpha: 0.9,
  });

  g.rect(r * 0.5, -r * 0.75, r * 0.18, r * 1.15).fill(0xf6f1d6);
  g.rect(r * 0.5, -r * 0.75, r * 0.18, r * 1.15).stroke({ width: 1.2, color: OUTLINE, alpha: 0.9 });
  g.rect(r * 0.34, r * 0.15, r * 0.5, r * 0.14).fill(0x8a6a2f);

  const crownY = -r * 0.92;
  g.rect(-r * 0.42, crownY - r * 0.28, r * 0.84, r * 0.3).fill(0xf2c14e);
  g.rect(-r * 0.42, crownY - r * 0.28, r * 0.84, r * 0.3).stroke({
    width: 1.5,
    color: OUTLINE,
    alpha: 0.9,
  });
  for (const px of [-r * 0.36, 0, r * 0.36]) {
    g.poly([px - r * 0.1, crownY - r * 0.28, px + r * 0.1, crownY - r * 0.28, px, crownY - r * 0.62]).fill(
      0xf2c14e,
    );
  }
  g.circle(0, crownY - r * 0.08, r * 0.09).fill(0x9b1c2e);
}

function redrawOverlay(g: Graphics, unit: Unit, selected: boolean, rallyOn: boolean): void {
  g.clear();
  const definition = unitDef(unit.type);
  const radius = definition.radius;

  if (rallyOn) {
    g.circle(0, 0, radius + 9).stroke({ width: 2, color: 0xf2c14e, alpha: 0.85 });
  }

  if (selected) {
    g.circle(0, 0, radius + 6).stroke({ width: 2.5, color: 0x7ee081, alpha: 0.95 });
  }

  if (unit.type === "hero") {
    g.circle(0, 0, radius + 12).stroke({ width: 1.5, color: 0xf2c14e, alpha: 0.4 });
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
