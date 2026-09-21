import { Container, Graphics, Sprite } from "pixi.js";
import { PALETTE, worldToTile } from "../config/world";
import { unitDef } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { GameState, PlayerId, Unit } from "../sim/types";
import { UNIT_FRAMES, unitTexture, USE_SPRITE_ASSETS } from "./Assets";
import { softShadowTexture } from "./softShadow";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

const OUTLINE = PALETTE.outline;
const SKIN = 0xf0c49a;
const STEEL = 0xc3ccd8;
const STEEL_DARK = 0x7c8794;
const LEATHER = 0x6b4a2a;
const WOOD = 0x8a5a2b;
const GOLD = 0xf2c14e;
const HORSE = 0x7a5230;
const HORSE_DARK = 0x54371d;

interface Entry {
  container: Container;
  sprite?: Sprite;
  body: Graphics;
  overlay: Graphics;
  selected: boolean;
  hpBucket: number;
  rallyOn: boolean;
  lastX: number;
  facing: number;
  frame: number;
  z: number;
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
    const overlay = new Graphics();
    const texture = USE_SPRITE_ASSETS ? unitTexture(unit.type, unit.owner, 0) : undefined;
    let sprite: Sprite | undefined;
    let body: Graphics;
    if (texture) {
      const radius = unitDef(unit.type).radius;
      const shadow = new Sprite(softShadowTexture());
      shadow.anchor.set(0.5);
      shadow.width = radius * 2.6;
      shadow.height = radius * 1.2;
      shadow.y = radius * 0.9;
      container.addChild(shadow);
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      container.addChild(sprite);
      body = new Graphics();
    } else {
      body = new Graphics();
      drawBody(body, unit);
      container.addChild(body);
    }
    container.addChild(overlay);
    this.layer.addChild(container);
    return {
      container,
      sprite,
      body,
      overlay,
      selected: false,
      hpBucket: -1,
      rallyOn: false,
      lastX: unit.x,
      facing: 1,
      frame: 0,
      z: Number.NaN,
    };
  }

  private sync(entry: Entry, unit: Unit, selected: boolean, nowSec: number): void {
    entry.container.position.set(unit.x, unit.y);
    if (entry.z !== unit.y) {
      entry.z = unit.y;
      entry.container.zIndex = unit.y;
    }

    const dx = unit.x - entry.lastX;
    if (Math.abs(dx) > 1.5) {
      entry.facing = dx > 0 ? 1 : -1;
      entry.lastX = unit.x;
    } else if (unit.state === "idle") {
      entry.lastX = unit.x;
    }

    const pulse =
      unit.state === "attacking" ? 1 + 0.08 * Math.sin(nowSec * 18 + unit.y * 0.3) : 1;

    if (entry.sprite) {
      const moving = unit.state === "moving";
      const frame = moving ? Math.floor(nowSec * 9) % UNIT_FRAMES : 0;
      if (frame !== entry.frame) {
        const texture = unitTexture(unit.type, unit.owner, frame);
        if (texture) {
          entry.sprite.texture = texture;
          entry.frame = frame;
        }
      }
      const texture = entry.sprite.texture;
      if (texture.height > 0) {
        const target =
          unit.type === "horse_rider"
            ? unitDef(unit.type).radius * 2.6
            : unitDef(unit.type).radius * 3.6;
        const scale = target / texture.height;
        entry.sprite.scale.set(entry.facing * scale, scale);
      }
      entry.sprite.y = unitDef(unit.type).radius * 0.9;
    } else {
      entry.body.scale.set(entry.facing * pulse, pulse);
    }

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

function shade(color: number, amount: number): number {
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number): number => Math.round(c + (target - c) * t);
  return (mix((color >> 16) & 0xff) << 16) | (mix((color >> 8) & 0xff) << 8) | mix(color & 0xff);
}

function drawBody(g: Graphics, unit: Unit): void {
  const definition = unitDef(unit.type);
  const radius = definition.radius;
  const faction = FACTION_COLORS[unit.owner];
  const accent = definition.color;

  switch (unit.type) {
    case "villager":
      drawVillager(g, radius, faction, definition.color);
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
      drawHorse(g, radius, faction, accent);
      break;
    case "hero":
      drawHero(g, radius, faction);
      break;
  }
}

function groundShadow(g: Graphics, r: number, stretch = 1): void {
  g.ellipse(0, r * 0.95, r * 0.95 * stretch, r * 0.36).fill({ color: 0x000000, alpha: 0.24 });
}

function torso(g: Graphics, r: number, tunic: number, ry = 0.9): void {
  g.ellipse(0, r * 0.22, r * 0.96, r * ry).fill(tunic);
  g.ellipse(0, r * 0.22, r * 0.96, r * ry).stroke({ width: 2.2, color: OUTLINE, alpha: 0.9 });
  g.ellipse(0, r * 0.55, r * 0.82, r * 0.34).fill({ color: shade(tunic, -0.32), alpha: 0.5 });
  g.ellipse(-r * 0.3, -r * 0.05, r * 0.46, r * 0.5).fill({ color: shade(tunic, 0.3), alpha: 0.45 });
}

function head(g: Graphics, r: number): void {
  g.circle(0, -r * 0.4, r * 0.48).fill(SKIN);
  g.circle(0, -r * 0.4, r * 0.48).stroke({ width: 2, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.15, -r * 0.34, r * 0.075).fill(OUTLINE);
  g.circle(r * 0.15, -r * 0.34, r * 0.075).fill(OUTLINE);
}

function steelHelm(g: Graphics, r: number, crest: number): void {
  g.circle(0, -r * 0.5, r * 0.52).fill(STEEL);
  g.circle(0, -r * 0.5, r * 0.52).stroke({ width: 2, color: OUTLINE, alpha: 0.9 });
  g.rect(-r * 0.52, -r * 0.34, r * 1.04, r * 0.1).fill(STEEL_DARK);
  g.rect(-r * 0.05, -r * 0.52, r * 0.1, r * 0.42).fill(STEEL_DARK);
  g.ellipse(-r * 0.16, -r * 0.66, r * 0.16, r * 0.09).fill({ color: 0xffffff, alpha: 0.4 });
  g.poly([-r * 0.06, -r * 0.9, r * 0.06, -r * 0.9, 0, -r * 1.12]).fill(crest);
}

function drawVillager(g: Graphics, r: number, faction: number, accent: number): void {
  const hood = shade(faction, -0.34);
  groundShadow(g, r);
  torso(g, r, faction);
  g.circle(-r * 0.62, r * 0.34, r * 0.26).fill(accent);
  g.circle(-r * 0.62, r * 0.34, r * 0.26).stroke({ width: 1.6, color: OUTLINE, alpha: 0.85 });
  head(g, r);
  g.moveTo(-r * 0.54, -r * 0.4)
    .arc(0, -r * 0.4, r * 0.54, Math.PI, 0, false)
    .lineTo(-r * 0.54, -r * 0.4)
    .fill(hood)
    .stroke({ width: 2, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.15, -r * 0.34, r * 0.075).fill(OUTLINE);
  g.circle(r * 0.15, -r * 0.34, r * 0.075).fill(OUTLINE);
}

function drawSwordsman(g: Graphics, r: number, faction: number, accent: number): void {
  groundShadow(g, r);
  g.circle(-r * 0.72, r * 0.06, r * 0.46).fill(shade(faction, -0.4));
  g.circle(-r * 0.72, r * 0.06, r * 0.46).stroke({ width: 2.4, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.72, r * 0.06, r * 0.2).fill(STEEL);
  g.circle(-r * 0.72, r * 0.06, r * 0.2).stroke({ width: 1.6, color: OUTLINE, alpha: 0.9 });
  torso(g, r, faction);
  g.circle(-r * 0.4, -r * 0.08, r * 0.24).fill(STEEL_DARK);
  g.circle(r * 0.4, -r * 0.08, r * 0.24).fill(STEEL_DARK);
  g.circle(r * 0.66, r * 0.16, r * 0.16).fill(SKIN);
  g.roundRect(r * 0.6, -r * 1.0, r * 0.17, r * 1.06, r * 0.06).fill(STEEL);
  g.roundRect(r * 0.6, -r * 1.0, r * 0.17, r * 1.06, r * 0.06).stroke({
    width: 1.6,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.rect(r * 0.44, -r * 0.02, r * 0.5, r * 0.13).fill(GOLD);
  g.rect(r * 0.44, -r * 0.02, r * 0.5, r * 0.13).stroke({ width: 1.2, color: OUTLINE, alpha: 0.85 });
  head(g, r);
  steelHelm(g, r, accent);
}

function drawSpearman(g: Graphics, r: number, faction: number, accent: number): void {
  groundShadow(g, r);
  g.circle(-r * 0.7, r * 0.1, r * 0.4).fill(shade(faction, -0.4));
  g.circle(-r * 0.7, r * 0.1, r * 0.4).stroke({ width: 2.2, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.7, r * 0.1, r * 0.16).fill(STEEL);
  torso(g, r, faction);
  g.roundRect(r * 0.6, -r * 1.5, r * 0.13, r * 2.2, r * 0.05).fill(LEATHER);
  g.roundRect(r * 0.6, -r * 1.5, r * 0.13, r * 2.2, r * 0.05).stroke({
    width: 1.4,
    color: OUTLINE,
    alpha: 0.85,
  });
  g.poly([r * 0.665 - r * 0.2, -r * 1.5, r * 0.665 + r * 0.2, -r * 1.5, r * 0.665, -r * 1.98])
    .fill(STEEL)
    .stroke({ width: 1.4, color: OUTLINE, alpha: 0.9 });
  g.circle(r * 0.66, r * 0.15, r * 0.16).fill(SKIN);
  head(g, r);
  steelHelm(g, r, accent);
}

function drawCrossbowman(g: Graphics, r: number, faction: number, accent: number): void {
  groundShadow(g, r);
  torso(g, r, faction);
  g.circle(r * 0.58, r * 0.12, r * 0.16).fill(SKIN);
  g.roundRect(r * 0.2, -r * 0.1, r * 1.0, r * 0.17, r * 0.05).fill(WOOD);
  g.roundRect(r * 0.2, -r * 0.1, r * 1.0, r * 0.17, r * 0.05).stroke({
    width: 1.4,
    color: OUTLINE,
    alpha: 0.85,
  });
  g.moveTo(r * 0.98, -r * 0.52)
    .quadraticCurveTo(r * 1.22, 0, r * 0.98, r * 0.52)
    .stroke({ width: r * 0.11, color: STEEL_DARK });
  g.moveTo(r * 0.98, -r * 0.52)
    .lineTo(r * 0.72, -r * 0.02)
    .lineTo(r * 0.98, r * 0.52)
    .stroke({ width: 1.4, color: 0xf5f5f5, alpha: 0.6 });
  head(g, r);
  g.circle(0, -r * 0.52, r * 0.54).fill(LEATHER);
  g.circle(0, -r * 0.52, r * 0.54).stroke({ width: 2, color: OUTLINE, alpha: 0.9 });
  g.poly([r * 0.34, -r * 0.78, r * 0.78, -r * 1.16, r * 0.52, -r * 0.6]).fill(accent);
  g.poly([r * 0.34, -r * 0.78, r * 0.78, -r * 1.16, r * 0.52, -r * 0.6]).stroke({
    width: 1.2,
    color: OUTLINE,
    alpha: 0.7,
  });
}

function drawHorse(g: Graphics, r: number, faction: number, accent: number): void {
  g.ellipse(0, r * 0.78, r * 1.15, r * 0.4).fill({ color: 0x000000, alpha: 0.24 });
  for (const lx of [-r * 0.55, -r * 0.15, r * 0.25, r * 0.65]) {
    g.roundRect(lx - r * 0.08, r * 0.5, r * 0.16, r * 0.6, r * 0.06).fill(HORSE_DARK);
  }
  g.poly([-r * 1.0, r * 0.2, -r * 0.82, r * 0.1, -r * 1.18, r * 0.72]).fill(HORSE_DARK);
  g.ellipse(0, r * 0.28, r * 1.05, r * 0.6).fill(HORSE);
  g.ellipse(0, r * 0.28, r * 1.05, r * 0.6).stroke({ width: 2.2, color: OUTLINE, alpha: 0.9 });
  g.ellipse(-r * 0.2, r * 0.12, r * 0.7, r * 0.32).fill({ color: shade(HORSE, 0.2), alpha: 0.5 });
  g.roundRect(r * 0.5, -r * 0.68, r * 0.42, r * 0.96, r * 0.16).fill(HORSE);
  g.roundRect(r * 0.5, -r * 0.68, r * 0.42, r * 0.96, r * 0.16).stroke({
    width: 2,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.ellipse(r * 0.86, -r * 0.72, r * 0.3, r * 0.24).fill(HORSE);
  g.ellipse(r * 0.86, -r * 0.72, r * 0.3, r * 0.24).stroke({ width: 1.8, color: OUTLINE, alpha: 0.9 });
  g.circle(r * 0.98, -r * 0.78, r * 0.06).fill(OUTLINE);
  g.poly([-r * 0.2, r * 0.9, r * 1.15, -r * 0.7, r * 1.05, -r * 0.82, -r * 0.28, r * 0.82]).fill(LEATHER);
  g.ellipse(0, -r * 0.2, r * 0.5, r * 0.52).fill(faction);
  g.ellipse(0, -r * 0.2, r * 0.5, r * 0.52).stroke({ width: 2.2, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.4, -r * 0.1, r * 0.18).fill(shade(faction, -0.3));
  g.circle(r * 0.4, -r * 0.1, r * 0.18).fill(shade(faction, -0.3));
  g.circle(0, -r * 0.68, r * 0.3).fill(SKIN);
  g.circle(0, -r * 0.68, r * 0.3).stroke({ width: 1.8, color: OUTLINE, alpha: 0.9 });
  g.circle(-r * 0.1, -r * 0.66, r * 0.05).fill(OUTLINE);
  g.circle(r * 0.1, -r * 0.66, r * 0.05).fill(OUTLINE);
  g.circle(0, -r * 0.78, r * 0.34).fill(STEEL);
  g.circle(0, -r * 0.78, r * 0.34).stroke({ width: 1.8, color: OUTLINE, alpha: 0.9 });
  g.poly([-r * 0.05, -r * 1.06, r * 0.05, -r * 1.06, 0, -r * 1.28]).fill(accent);
}

function drawHero(g: Graphics, r: number, faction: number): void {
  g.ellipse(0, r * 0.95, r * 1.05, r * 0.38).fill({ color: 0x000000, alpha: 0.26 });
  g.poly([-r * 0.95, -r * 0.1, r * 0.95, -r * 0.1, r * 0.6, r * 0.95, -r * 0.6, r * 0.95]).fill(
    shade(faction, -0.45),
  );
  torso(g, r, faction, 0.94);
  g.circle(-r * 0.42, -r * 0.08, r * 0.26).fill(GOLD);
  g.circle(r * 0.42, -r * 0.08, r * 0.26).fill(GOLD);
  g.circle(-r * 0.42, -r * 0.08, r * 0.26).stroke({ width: 1.6, color: OUTLINE, alpha: 0.85 });
  g.circle(r * 0.42, -r * 0.08, r * 0.26).stroke({ width: 1.6, color: OUTLINE, alpha: 0.85 });
  g.circle(r * 0.68, r * 0.18, r * 0.16).fill(SKIN);
  g.roundRect(r * 0.6, -r * 1.05, r * 0.18, r * 1.1, r * 0.06).fill(0xf6f1d6);
  g.roundRect(r * 0.6, -r * 1.05, r * 0.18, r * 1.1, r * 0.06).stroke({
    width: 1.5,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.rect(r * 0.44, -r * 0.02, r * 0.52, r * 0.13).fill(GOLD);
  g.rect(r * 0.44, -r * 0.02, r * 0.52, r * 0.13).stroke({ width: 1.2, color: OUTLINE, alpha: 0.85 });
  head(g, r);
  g.rect(-r * 0.46, -r * 0.74, r * 0.92, r * 0.16).fill(GOLD);
  g.rect(-r * 0.46, -r * 0.74, r * 0.92, r * 0.16).stroke({ width: 1.4, color: OUTLINE, alpha: 0.85 });
  for (const px of [-r * 0.34, 0, r * 0.34]) {
    g.poly([px - r * 0.1, -r * 0.74, px + r * 0.1, -r * 0.74, px, -r * 1.02]).fill(GOLD);
  }
  g.circle(0, -r * 0.6, r * 0.08).fill(0x9b1c2e);
  g.circle(-r * 0.15, -r * 0.34, r * 0.075).fill(OUTLINE);
  g.circle(r * 0.15, -r * 0.34, r * 0.075).fill(OUTLINE);
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
