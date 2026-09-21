import { Container, Graphics, Sprite } from "pixi.js";
import { PALETTE } from "../config/world";
import { def } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Building, GameState, PlayerId } from "../sim/types";
import { buildingTexture, USE_SPRITE_ASSETS } from "./Assets";
import { softShadowTexture } from "./softShadow";
import { STYLE } from "./style";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

const OUTLINE = PALETTE.outline;
const ROOF_BLUE = STYLE.roofBlue;
const GOLD_NUGGET = STYLE.gold;
const STONE = STYLE.stone;
const STONE_DARK = STYLE.stoneDark;
const WOOD_DARK = STYLE.woodDark;
const WINDOW_LIT = STYLE.windowLit;
const CANVAS_TENT = STYLE.canvasTent;

interface Entry {
  container: Container;
  sprite?: Sprite;
  body: Graphics;
  overlay: Graphics;
  progress: Graphics;
  state: string;
  selected: boolean;
  hpBucket: number;
  z: number;
}

export class BuildingRenderer {
  private readonly layer: Container;
  private readonly entries = new Map<string, Entry>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  update(state: GameState, selectedId: string | undefined, playerMap: VisibilityMap): void {
    const seen = new Set<string>();

    for (const id of ["player", "enemy"] as const) {
      for (const building of state.players[id].buildings) {
        if (building.state === "destroyed") continue;

        const mode = id === "player" ? "sync" : this.enemyMode(playerMap, building);
        if (mode === "hide") continue;
        seen.add(building.id);

        let entry = this.entries.get(building.id);
        if (!entry) {
          entry = this.createEntry(building);
          this.entries.set(building.id, entry);
        }
        if (mode === "sync") {
          entry.container.visible = true;
          entry.container.alpha = 1;
          this.sync(entry, building, selectedId === building.id);
        }
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.container.destroy({ children: true });
      this.entries.delete(id);
    }
  }

  private enemyMode(map: VisibilityMap, building: Building): "sync" | "freeze" | "hide" {
    const definition = def(building.type);
    let visible = false;
    let explored = false;
    for (let y = building.tileY; y < building.tileY + definition.tilesH && !visible; y += 1) {
      for (let x = building.tileX; x < building.tileX + definition.tilesW; x += 1) {
        if (isTileVisible(map, x, y)) {
          visible = true;
          break;
        }
        if (isTileExplored(map, x, y)) explored = true;
      }
    }
    if (visible) return "sync";
    const entry = this.entries.get(building.id);
    if (!entry) return "hide";
    if (explored) {
      entry.container.visible = true;
      entry.container.alpha = 0.6;
      return "freeze";
    }
    entry.container.visible = false;
    return "hide";
  }

  private createEntry(building: Building): Entry {
    const container = new Container();
    const overlay = new Graphics();
    const progress = new Graphics();
    const texture = USE_SPRITE_ASSETS ? buildingTexture(building.type, building.owner) : undefined;
    let sprite: Sprite | undefined;
    let body: Graphics;
    if (texture) {
      const shadow = new Sprite(softShadowTexture());
      shadow.anchor.set(0.5);
      shadow.width = building.width * 1.04;
      shadow.height = building.height * 0.46;
      shadow.y = building.height * 0.42;
      container.addChild(shadow);
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      container.addChild(sprite);
      body = new Graphics();
    } else {
      body = new Graphics();
      drawBody(body, building);
      container.addChild(body);
    }
    container.addChild(overlay, progress);
    this.layer.addChild(container);
    return {
      container,
      sprite,
      body,
      overlay,
      progress,
      state: "",
      selected: false,
      hpBucket: -1,
      z: Number.NaN,
    };
  }

  private sync(entry: Entry, building: Building, selected: boolean): void {
    entry.container.position.set(building.x, building.y);
    if (entry.z !== building.y) {
      entry.z = building.y;
      entry.container.zIndex = building.y;
    }

    if (entry.sprite) {
      const texture = entry.sprite.texture;
      if (texture.width > 0) {
        const scale = (building.width * 1.3) / texture.width;
        entry.sprite.scale.set(scale);
      }
      entry.sprite.y = building.height * 0.42;
      entry.sprite.tint = building.state === "constructing" ? 0xb8b8c4 : 0xffffff;
      entry.sprite.alpha = building.state === "constructing" ? 0.85 : 1;
    } else if (entry.state !== building.state) {
      entry.state = building.state;
      drawBody(entry.body, building);
    }

    const hpBucket = Math.ceil((building.hp / building.maxHp) * 12);
    if (entry.selected !== selected || entry.hpBucket !== hpBucket) {
      entry.selected = selected;
      entry.hpBucket = hpBucket;
      redrawOverlay(entry.overlay, building, selected);
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

function redrawOverlay(g: Graphics, building: Building, selected: boolean): void {
  g.clear();
  const w = building.width;
  const h = building.height;

  if (selected) {
    g.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 8).stroke({
      width: 3,
      color: 0xffe066,
      alpha: 0.95,
    });
  }

  const ratio = building.hp / building.maxHp;
  if (building.hp < building.maxHp) {
    const barW = Math.max(w, 36);
    const x = -barW / 2;
    const y = -h / 2 - 15;
    g.roundRect(x, y, barW, 6, 3).fill({ color: 0x000000, alpha: 0.6 });
    g.roundRect(x, y, barW * Math.max(ratio, 0), 6, 3).fill({
      color: ratio > 0.55 ? 0x7ee081 : ratio > 0.25 ? 0xf2c14e : 0xef4444,
    });
  }

  if (ratio < 0.55 && building.state === "complete") {
    drawCracks(g, building, ratio < 0.3 ? 3 : 2);
  }
}

function drawCracks(g: Graphics, building: Building, count: number): void {
  const w = building.width;
  const h = building.height;
  let seed = 7;
  for (const char of building.id) seed = (seed * 31 + char.charCodeAt(0)) | 0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let c = 0; c < count; c += 1) {
    let x = (rand() - 0.5) * w * 0.7;
    let y = -h * 0.4;
    const points: number[] = [x, y];
    const steps = 4;
    for (let s = 0; s < steps; s += 1) {
      x += (rand() - 0.5) * w * 0.22;
      y += (h * 0.8) / steps;
      points.push(x, y);
    }
    g.poly(points).stroke({ width: 2, color: 0x14141c, alpha: 0.75 });
  }

  if (count >= 3) {
    for (let d = 0; d < 4; d += 1) {
      const rx = (rand() - 0.5) * w * 0.6;
      const ry = (rand() - 0.3) * h * 0.5;
      const rs = 1.5 + rand() * 2.5;
      g.poly([rx - rs, ry + rs * 0.4, rx + rs * 0.6, ry + rs * 0.3, rx + rs * 0.3, ry - rs * 0.5, rx - rs * 0.4, ry - rs * 0.3]).fill({ color: STYLE.stoneDark, alpha: 0.7 });
    }
  }
}

function drawBody(g: Graphics, building: Building): void {
  g.clear();
  const faction = FACTION_COLORS[building.owner];

  switch (building.type) {
    case "town_center":
      drawTownCenter(g, building, faction);
      break;
    case "house":
      drawHouse(g, building, faction);
      break;
    case "farm":
      drawFarm(g, building);
      break;
    case "storage":
      drawStorage(g, building, faction);
      break;
    case "army_camp":
      drawCamp(g, building, faction);
      break;
    case "tower":
      drawTower(g, building, faction);
      break;
    case "wall":
      drawWall(g, building);
      break;
    case "academy":
      drawAcademy(g, building, faction);
      break;
    case "forest":
      drawForest(g, building);
      break;
    case "gold_vein":
      drawGold(g, building);
      break;
  }

  if (building.state === "constructing") {
    g.tint = 0xbfbfbf;
  } else {
    g.tint = 0xffffff;
  }
}

function shade(color: number, amount: number): number {
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number): number => Math.round(c + (target - c) * t);
  return (mix((color >> 16) & 0xff) << 16) | (mix((color >> 8) & 0xff) << 8) | mix(color & 0xff);
}

function line(w: number): number {
  return Math.max(2, Math.round(w / 36));
}

function shadow(g: Graphics, w: number, h: number): void {
  g.ellipse(0, h * 0.45, w * 0.56, h * 0.19).fill({ color: 0x000000, alpha: 0.2 });
  g.ellipse(0, h * 0.45, w * 0.42, h * 0.13).fill({ color: 0x000000, alpha: 0.16 });
}

function brickwork(g: Graphics, x: number, y: number, w: number, h: number, color: number, rows = 3): void {
  const rowH = h / rows;
  for (let r = 1; r < rows; r += 1) {
    g.rect(x, y + r * rowH, w, Math.max(1.5, rowH * 0.09)).fill({ color, alpha: 0.4 });
  }
  for (let r = 0; r < rows; r += 1) {
    const offset = (r % 2) * (w / 4);
    for (let c = 0; c < 3; c += 1) {
      const vx = x + offset + c * (w / 2);
      if (vx > x + 2 && vx < x + w - 2) {
        g.rect(vx, y + r * rowH, Math.max(1.5, w * 0.018), rowH).fill({ color, alpha: 0.32 });
      }
    }
  }
}

function foundation(g: Graphics, w: number, h: number, lw: number): void {
  g.roundRect(-w / 2 + 1, -h / 2 + 6, w - 2, h - 8, 8).fill(STONE);
  brickwork(g, -w / 2 + 1, -h / 2 + 6, w - 2, h - 8, STONE_DARK, 3);
  g.roundRect(-w / 2 + 1, -h / 2 + 6, w - 2, h - 8, 8).stroke({ width: lw, color: OUTLINE, alpha: 0.9 });
  g.roundRect(-w / 2 + 5, -h / 2 + 10, w - 10, 7, 3).fill({ color: 0xffffff, alpha: 0.16 });
  g.roundRect(-w / 2 + 5, h / 2 - 12, w - 10, 5, 2).fill({ color: 0x000000, alpha: 0.14 });
}

function timberWall(g: Graphics, x: number, y: number, w: number, h: number, fill: number, lw: number): void {
  g.roundRect(x, y, w, h, 4).fill(fill);
  for (let i = 1; i < 4; i += 1) {
    g.rect(x + (i * w) / 4, y, Math.max(1.2, w * 0.012), h).fill({
      color: shade(fill, -0.24),
      alpha: 0.35,
    });
  }
  g.rect(x, y, w, Math.max(3, h * 0.12)).fill({ color: WOOD_DARK, alpha: 0.85 });
  g.rect(x, y + h - Math.max(3, h * 0.12), w, Math.max(3, h * 0.12)).fill({
    color: WOOD_DARK,
    alpha: 0.85,
  });
  g.rect(x + w * 0.46, y, Math.max(2.5, w * 0.07), h).fill({ color: WOOD_DARK, alpha: 0.85 });
  g.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.08), 2).fill({ color: 0xffffff, alpha: 0.16 });
  g.roundRect(x, y, w, h, 4).stroke({ width: lw, color: OUTLINE, alpha: 0.85 });
}

function gableRoof(g: Graphics, x: number, yApex: number, yEave: number, w: number, color: number, lw: number): void {
  const apexX = x + w / 2;
  g.poly([x - 3, yEave + 2, apexX, yApex, x + w + 3, yEave + 2]).fill(color);
  for (let i = 1; i <= 3; i += 1) {
    const t = i / 4;
    const yy = yApex + (yEave - yApex) * t;
    const half = (w / 2 + 3) * t;
    g.moveTo(apexX - half, yy)
      .lineTo(apexX + half, yy)
      .stroke({ width: 1.4, color: shade(color, -0.3), alpha: 0.45 });
  }
  g.poly([x - 3, yEave + 2, apexX, yApex, x + w + 3, yEave + 2]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.moveTo(x - 3, yEave + 2)
    .lineTo(apexX, yApex)
    .stroke({ width: 1.6, color: 0xffffff, alpha: 0.18 });
  g.moveTo(apexX - 3, yApex + 3)
    .lineTo(apexX, yApex)
    .lineTo(apexX + 3, yApex + 3)
    .stroke({ width: 2, color: 0xffffff, alpha: 0.4 });
  g.rect(x - 3, yEave - 1, w + 6, 4).fill({ color: 0x000000, alpha: 0.18 });
}

function door(g: Graphics, cx: number, baseY: number, w: number, h: number): void {
  g.roundRect(cx - w / 2, baseY - h, w, h, w * 0.3).fill(WOOD_DARK);
  g.roundRect(cx - w / 2, baseY - h, w, h, w * 0.3).stroke({ width: 1.2, color: OUTLINE, alpha: 0.8 });
  g.rect(cx - w * 0.04, baseY - h, w * 0.08, h).fill({ color: 0x000000, alpha: 0.2 });
  g.circle(cx + w * 0.2, baseY - h * 0.45, w * 0.08).fill(STYLE.gold);
}

function windowLit(g: Graphics, cx: number, cy: number, s: number): void {
  g.roundRect(cx - s / 2, cy - s / 2, s, s, 2).fill(WINDOW_LIT);
  g.rect(cx - s / 2, cy - 1, s, 2).fill(WOOD_DARK);
  g.rect(cx - 1, cy - s / 2, 2, s).fill(WOOD_DARK);
  g.roundRect(cx - s / 2, cy - s / 2, s, s, 2).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
}

function torch(g: Graphics, x: number, y: number, size: number): void {
  g.rect(x - size * 0.15, y, size * 0.3, size * 0.7).fill(STYLE.woodDark);
  g.poly([x - size * 0.25, y, x + size * 0.25, y, x, y - size * 0.6]).fill(STYLE.fire);
  g.poly([x - size * 0.12, y, x + size * 0.12, y, x, y - size * 0.35]).fill(STYLE.fireCore);
}

function barrel(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.ellipse(x, y + h * 0.4, w * 0.5, h * 0.15).fill(STYLE.woodDark);
  g.roundRect(x - w * 0.42, y - h * 0.3, w * 0.84, h * 0.7, w * 0.2).fill(STYLE.wood);
  g.roundRect(x - w * 0.42, y - h * 0.3, w * 0.84, h * 0.7, w * 0.2).stroke({ width: 1.2, color: OUTLINE, alpha: 0.85 });
  g.rect(x - w * 0.46, y - h * 0.1, w * 0.92, h * 0.06).fill(STYLE.steelDark);
  g.rect(x - w * 0.46, y + h * 0.18, w * 0.92, h * 0.06).fill(STYLE.steelDark);
  g.ellipse(x, y - h * 0.3, w * 0.42, h * 0.12).fill(STYLE.woodLight);
  g.ellipse(x, y - h * 0.3, w * 0.42, h * 0.12).stroke({ width: 1, color: OUTLINE, alpha: 0.8 });
}

function smokeWisp(g: Graphics, x: number, y: number, size: number): void {
  g.ellipse(x, y, size * 0.6, size * 0.4).fill({ color: 0xc0c0c0, alpha: 0.18 });
  g.ellipse(x - size * 0.3, y - size * 0.5, size * 0.4, size * 0.3).fill({ color: 0xd0d0d0, alpha: 0.14 });
  g.ellipse(x + size * 0.2, y - size * 0.9, size * 0.3, size * 0.22).fill({ color: 0xd8d8d8, alpha: 0.1 });
}

function pennant(g: Graphics, x: number, yTop: number, len: number, color: number): void {
  g.rect(x - 1.5, yTop - 13, 3, 13).fill(WOOD_DARK);
  g.poly([x + 1.5, yTop - 13, x + 1.5 + len, yTop - 9.5, x + 1.5, yTop - 6]).fill(color);
  g.poly([x + 1.5, yTop - 13, x + 1.5 + len, yTop - 9.5, x + 1.5, yTop - 6]).stroke({
    width: 1.2,
    color: OUTLINE,
    alpha: 0.7,
  });
}

function drawTownCenter(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  const lw = line(w);
  shadow(g, w, h);
  foundation(g, w, h, lw);
  g.roundRect(-w * 0.4, -h * 0.34, w * 0.8, h * 0.6, 8).fill({ color: 0xffffff, alpha: 0.07 });

  const hallW = w * 0.72;
  const hallH = h * 0.4;
  const hallY = h * 0.08;
  timberWall(g, -hallW / 2, hallY, hallW, hallH, colors.body, lw);
  gableRoof(g, -hallW / 2 - 4, hallY - h * 0.26, hallY + 2, hallW + 8, colors.roof, lw);

  const towerW = w * 0.32;
  const towerH = h * 0.5;
  const towerY = -h * 0.5;
  g.roundRect(-towerW / 2, towerY, towerW, towerH, 5).fill(STONE);
  brickwork(g, -towerW / 2, towerY, towerW, towerH, STONE_DARK, 4);
  g.roundRect(-towerW / 2, towerY, towerW, towerH, 5).stroke({ width: lw, color: OUTLINE, alpha: 0.9 });
  g.roundRect(-towerW / 2 + 3, towerY + 3, towerW - 6, towerH * 0.12).fill({ color: 0xffffff, alpha: 0.12 });
  const merlons = 3;
  const mw = towerW / (merlons * 2 - 1);
  for (let i = 0; i < merlons; i += 1) {
    const mx = -towerW / 2 + i * mw * 2;
    g.rect(mx, towerY - mw * 0.8, mw, mw * 0.8).fill(STONE);
    g.rect(mx, towerY - mw * 0.8, mw, mw * 0.8).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
  }
  g.rect(-towerW / 2, towerY + towerH - 3, towerW, 3).fill({ color: 0x000000, alpha: 0.12 });

  door(g, 0, hallY + hallH, w * 0.14, h * 0.2);
  windowLit(g, -hallW * 0.3, hallY + hallH * 0.45, w * 0.07);
  windowLit(g, hallW * 0.3, hallY + hallH * 0.45, w * 0.07);
  windowLit(g, 0, towerY + towerH * 0.42, w * 0.06);
  torch(g, -hallW * 0.48, hallY + hallH - 2, w * 0.08);
  torch(g, hallW * 0.48, hallY + hallH - 2, w * 0.08);

  pennant(g, 0, towerY - mw * 0.8 + 2, w * 0.15, faction);
  pennant(g, -hallW / 2 + 2, hallY - h * 0.12, w * 0.12, faction);
  pennant(g, hallW / 2 - 2, hallY - h * 0.12, w * 0.12, faction);
}

function drawHouse(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);

  const wallH = h * 0.4;
  const wallY = h * 0.04;
  const baseY = wallY + wallH;

  g.roundRect(-w * 0.4, baseY - h * 0.02, w * 0.8, h * 0.15, 4).fill(STYLE.stoneDark);
  g.roundRect(-w * 0.4, baseY - h * 0.02, w * 0.8, h * 0.15, 4).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });

  timberWall(g, -w * 0.36, wallY, w * 0.72, wallH, 0xefe0c0, lw);
  gableRoof(g, -w * 0.42, wallY - h * 0.32, wallY + 2, w * 0.84, STYLE.roofBlue, lw);

  g.rect(w * 0.15, wallY - h * 0.34, w * 0.1, h * 0.28).fill(STYLE.stone);
  g.rect(w * 0.15, wallY - h * 0.34, w * 0.1, h * 0.28).stroke({
    width: 1.5,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.rect(w * 0.13, wallY - h * 0.37, w * 0.14, h * 0.05).fill(STYLE.stoneDark);
  smokeWisp(g, w * 0.2, wallY - h * 0.48, w * 0.12);

  door(g, -w * 0.12, baseY, w * 0.16, h * 0.26);
  windowLit(g, w * 0.18, wallY + wallH * 0.42, w * 0.12);

  g.roundRect(w * 0.08, wallY + wallH * 0.72, w * 0.22, h * 0.06, 2).fill(STYLE.woodDark);
  g.circle(w * 0.12, wallY + wallH * 0.72, w * 0.025).fill(STYLE.flowerPink);
  g.circle(w * 0.18, wallY + wallH * 0.7, w * 0.025).fill(STYLE.flowerYellow);
  g.circle(w * 0.24, wallY + wallH * 0.72, w * 0.025).fill(STYLE.flowerWhite);

  pennant(g, 0, wallY - h * 0.32 + 1, w * 0.14, faction);
}

function drawFarm(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);

  g.roundRect(-w / 2, -h / 2, w, h, 8).fill(STYLE.soil);
  g.roundRect(-w / 2, -h / 2, w, h, 8).stroke({ width: lw, color: OUTLINE, alpha: 0.9 });
  g.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.07, 3).fill({ color: 0xffffff, alpha: 0.07 });
  const cropColors = [STYLE.crop, STYLE.leafLight, STYLE.cropDark];
  for (let r = 0; r < 3; r += 1) {
    const ry = -h * 0.32 + r * h * 0.3;
    g.roundRect(-w * 0.42, ry, w * 0.84, h * 0.14, 4).fill(STYLE.cropDark);
    for (let c = 0; c < 5; c += 1) {
      const cx = -w * 0.34 + c * w * 0.17;
      const cs = Math.max(2, w * 0.035);
      g.circle(cx, ry + h * 0.07, cs).fill(cropColors[(r + c) % 3]);
      g.circle(cx - cs * 0.35, ry + h * 0.045, cs * 0.4).fill({ color: 0xffffff, alpha: 0.35 });
    }
  }

  const barnW = w * 0.34;
  const barnH = h * 0.3;
  const bx = w * 0.12;
  const by = -h * 0.44;
  timberWall(g, bx, by, barnW, barnH, STYLE.woodLight, lw);
  gableRoof(g, bx - 2, by - h * 0.14, by + 1, barnW + 4, ROOF_BLUE, lw);

  g.rect(-w * 0.34 - 1.2, h * 0.08, 2.4, h * 0.3).fill(STYLE.woodDark);
  g.rect(-w * 0.4, h * 0.14, w * 0.14, 2.4).fill(STYLE.woodDark);
  g.circle(-w * 0.34, h * 0.06, w * 0.05).fill(0xd9b382);
  g.circle(-w * 0.34, h * 0.06, w * 0.05).stroke({ width: 1.4, color: OUTLINE, alpha: 0.85 });
  g.poly([-w * 0.4, h * 0.14, -w * 0.28, h * 0.14, -w * 0.34, h * 0.26]).fill(0xc0392b);

  const sx = -w * 0.46;
  const sy = h * 0.1;
  g.rect(sx, sy, 2.5, h * 0.28).fill(STYLE.wood);
  g.rect(sx - w * 0.06, sy + h * 0.06, w * 0.12, 2.5).fill(STYLE.wood);
  g.circle(sx, sy, w * 0.03).fill(STYLE.sand);
  g.rect(sx - 1, sy + h * 0.28, 4, 3).fill(STYLE.woodDark);

  for (let i = 0; i < 4; i += 1) {
    const fx = -w * 0.46 + i * w * 0.12;
    g.rect(fx, h * 0.18, 3, h * 0.22).fill(STYLE.wood);
  }
  g.rect(-w * 0.46, h * 0.24, w * 0.38, 3).fill(STYLE.wood);

  barrel(g, w * 0.42, h * 0.28, w * 0.1, h * 0.12);
}

function drawStorage(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);
  foundation(g, w * 0.9, h * 0.9, lw);

  const wallH = h * 0.4;
  const wallY = -h * 0.08;
  timberWall(g, -w * 0.34, wallY, w * 0.68, wallH, STYLE.woodLight, lw);
  gableRoof(g, -w * 0.4, wallY - h * 0.26, wallY + 2, w * 0.8, ROOF_BLUE, lw);

  g.roundRect(-w * 0.13, wallY + wallH - h * 0.24, w * 0.26, h * 0.24, 3).fill(STYLE.woodDark);
  g.rect(-w * 0.13, wallY + wallH - h * 0.13, w * 0.26, 2).fill({ color: faction, alpha: 0.9 });

  barrel(g, -w * 0.38, h * 0.28, w * 0.12, h * 0.14);
  barrel(g, -w * 0.24, h * 0.3, w * 0.11, h * 0.12);

  g.roundRect(w * 0.22, h * 0.22, w * 0.18, h * 0.14, 2).fill(STYLE.woodLight);
  g.roundRect(w * 0.22, h * 0.22, w * 0.18, h * 0.14, 2).stroke({ width: 1.3, color: OUTLINE, alpha: 0.85 });
  g.rect(w * 0.22, h * 0.28, w * 0.18, 2).fill(STYLE.woodDark);
  g.roundRect(w * 0.25, h * 0.12, w * 0.14, h * 0.12, 2).fill(STYLE.woodLight);
  g.roundRect(w * 0.25, h * 0.12, w * 0.14, h * 0.12, 2).stroke({ width: 1.2, color: OUTLINE, alpha: 0.8 });

  g.rect(0, wallY - h * 0.2, 2, h * 0.14).fill(STYLE.woodDark);
  g.circle(0, wallY - h * 0.22, w * 0.03).fill(STYLE.steelDark);
  g.moveTo(-w * 0.06, wallY - h * 0.08).lineTo(0, wallY - h * 0.2).lineTo(w * 0.06, wallY - h * 0.08).stroke({ width: 1.4, color: STYLE.woodDark });

  pennant(g, 0, wallY - h * 0.26 + 2, w * 0.12, faction);
}

function drawCamp(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);

  const padW = w * 0.94;
  const padH = h * 0.9;
  const top = -padH / 2;
  g.roundRect(-padW / 2, top, padW, padH, 6).fill(STYLE.dirt);
  g.roundRect(-padW / 2, top, padW, padH, 6).stroke({ width: lw, color: OUTLINE, alpha: 0.9 });
  g.roundRect(-padW / 2 + 5, top + 5, padW - 10, padH * 0.42, 4).fill({
    color: STYLE.sand,
    alpha: 0.32,
  });

  const posts = 7;
  for (let i = 0; i < posts; i += 1) {
    const px = -padW * 0.46 + i * ((padW * 0.92) / (posts - 1));
    g.rect(px - 3, top - h * 0.16, 6, h * 0.18).fill(STYLE.wood);
    g.rect(px - 3, top - h * 0.16, 6, h * 0.18).stroke({ width: 1.2, color: OUTLINE, alpha: 0.85 });
    g.poly([px - 3, top - h * 0.16, px + 3, top - h * 0.16, px, top - h * 0.22]).fill(STYLE.woodLight);
  }
  g.rect(-padW * 0.46, top - h * 0.02, padW * 0.92, 3).fill(STYLE.woodDark);

  tent(g, -w * 0.2, h * 0.24, w * 0.3, h * 0.32, lw);
  tent(g, w * 0.22, h * 0.28, w * 0.24, h * 0.26, lw);

  const fx = w * 0.02;
  const fy = h * 0.06;
  g.ellipse(fx, fy, w * 0.09, h * 0.05).fill(STYLE.stoneDark);
  g.circle(fx - w * 0.06, fy + h * 0.01, w * 0.022).fill(STYLE.stone);
  g.circle(fx + w * 0.06, fy + h * 0.015, w * 0.022).fill(STYLE.stone);
  g.circle(fx, fy - h * 0.04, w * 0.022).fill(STYLE.stone);
  g.poly([fx - 5, fy + 2, fx + 5, fy + 2, fx, fy - h * 0.12]).fill(STYLE.fire);
  g.poly([fx - 2.5, fy + 2, fx + 2.5, fy + 2, fx, fy - h * 0.07]).fill(STYLE.fireCore);
  smokeWisp(g, fx, fy - h * 0.16, w * 0.06);

  const rx = -w * 0.4;
  const ry = h * 0.1;
  g.rect(rx, ry, 3, h * 0.24).fill(STYLE.woodDark);
  g.rect(rx + w * 0.16, ry, 3, h * 0.24).fill(STYLE.woodDark);
  g.rect(rx, ry + h * 0.04, w * 0.16, 3).fill(STYLE.wood);
  g.rect(rx + w * 0.02, ry - h * 0.08, 2, h * 0.14).fill(STYLE.wood);
  g.poly([rx + w * 0.02 - 2.5, ry - h * 0.08, rx + w * 0.02 + 2.5, ry - h * 0.08, rx + w * 0.02, ry - h * 0.15]).fill(
    STYLE.stoneLight,
  );
  g.rect(rx + w * 0.11, ry - h * 0.06, 2, h * 0.12).fill(STYLE.wood);
  g.rect(rx + w * 0.11 - 3, ry - h * 0.09, 6, 2.4).fill(STYLE.stoneDark);

  const shx = rx + w * 0.04;
  const shy = ry + h * 0.08;
  g.circle(shx, shy, w * 0.035).fill(faction);
  g.circle(shx, shy, w * 0.035).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
  g.circle(shx + w * 0.08, shy + h * 0.02, w * 0.03).fill(shade(faction, -0.2));
  g.circle(shx + w * 0.08, shy + h * 0.02, w * 0.03).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });

  const dx = w * 0.4;
  const dy = h * 0.34;
  g.rect(dx - 1.5, dy - h * 0.18, 3, h * 0.2).fill(STYLE.woodDark);
  g.rect(dx - w * 0.05, dy - h * 0.14, w * 0.1, 3).fill(STYLE.woodDark);
  g.circle(dx, dy - h * 0.2, w * 0.04).fill(STYLE.sand);
  g.circle(dx, dy - h * 0.2, w * 0.04).stroke({ width: 1.3, color: OUTLINE, alpha: 0.85 });
  g.circle(dx, dy - h * 0.2, w * 0.02).fill({ color: 0xef4444, alpha: 0.7 });

  g.rect(w * 0.44 - 1.5, top - h * 0.34, 3, h * 0.34).fill(STYLE.woodDark);
  pennant(g, w * 0.44, top - h * 0.32, w * 0.13, faction);
}

function tent(g: Graphics, cx: number, baseY: number, w: number, h: number, lw: number): void {
  g.poly([cx - w / 2, baseY, cx + w / 2, baseY, cx, baseY - h]).fill(CANVAS_TENT);
  g.poly([cx - w / 2, baseY, cx + w / 2, baseY, cx, baseY - h]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.poly([cx - w * 0.12, baseY, cx + w * 0.12, baseY, cx, baseY - h * 0.45]).fill({
    color: 0x000000,
    alpha: 0.35,
  });
  g.rect(cx - 1.5, baseY - h - 4, 3, h + 8).fill(STYLE.woodDark);
}

function drawTower(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w * 1.2, h * 1.2);

  const baseW = w * 0.78;
  g.poly([-baseW / 2, h / 2, -w * 0.3, -h * 0.28, w * 0.3, -h * 0.28, baseW / 2, h / 2]).fill(STYLE.stone);
  g.poly([-baseW / 2, h / 2, -w * 0.3, -h * 0.28, w * 0.3, -h * 0.28, baseW / 2, h / 2]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.poly([-baseW / 2 + 3, h * 0.4, -w * 0.24, -h * 0.2, w * 0.24, -h * 0.2, baseW / 2 - 3, h * 0.4]).fill(
    STYLE.stoneLight,
  );
  g.rect(-baseW / 2 + 2, 0, baseW - 4, 3).fill({ color: 0x000000, alpha: 0.15 });

  g.roundRect(-w * 0.08, h * 0.02, w * 0.16, h * 0.12, 2).fill({ color: 0x000000, alpha: 0.4 });
  g.roundRect(-w * 0.08, -h * 0.18, w * 0.16, h * 0.12, 2).fill({ color: 0x000000, alpha: 0.4 });

  g.roundRect(-w * 0.42, -h * 0.48, w * 0.84, h * 0.24, 2).fill(STYLE.woodLight);
  g.roundRect(-w * 0.42, -h * 0.48, w * 0.84, h * 0.24, 2).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  for (let i = 0; i < 3; i += 1) {
    const bx = -w * 0.42 + i * w * 0.28;
    g.rect(bx + 1, -h * 0.48 - 5, w * 0.28 - 2, 6).fill(STYLE.stone);
    g.rect(bx + 1, -h * 0.48 - 5, w * 0.28 - 2, 6).stroke({ width: 1.2, color: OUTLINE, alpha: 0.9 });
  }

  windowLit(g, 0, h * 0.1, Math.max(4, w * 0.16));
  torch(g, w * 0.28, h * 0.18, Math.max(3, w * 0.1));
  g.rect(-1.5, -h * 0.48 - 16, 3, 16).fill(STYLE.woodDark);
  g.poly([1.5, -h * 0.48 - 16, 1.5 + w * 0.3, -h * 0.48 - 12, 1.5, -h * 0.48 - 8]).fill(faction);
}

function drawAcademy(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);
  foundation(g, w * 0.94, h * 0.94, lw);

  const hallW = w * 0.72;
  const hallH = h * 0.42;
  const hallY = h * 0.0;
  timberWall(g, -hallW / 2, hallY, hallW, hallH, 0xefe0c0, lw);

  for (let i = 0; i < 4; i += 1) {
    const cx = -hallW / 2 + (i + 0.5) * (hallW / 4);
    g.roundRect(cx - w * 0.045, hallY - h * 0.02, w * 0.09, hallH + h * 0.04, 3).fill(STYLE.woodLight);
    g.roundRect(cx - w * 0.045, hallY - h * 0.02, w * 0.09, hallH + h * 0.04, 3).stroke({
      width: 1.5,
      color: OUTLINE,
      alpha: 0.9,
    });
    g.roundRect(cx - w * 0.05, hallY - h * 0.02, w * 0.1, h * 0.04, 2).fill(STYLE.stone);
    g.roundRect(cx - w * 0.05, hallY + hallH, w * 0.1, h * 0.04, 2).fill(STYLE.stone);
  }

  g.poly([-hallW / 2 - 4, hallY, 0, hallY - h * 0.26, hallW / 2 + 4, hallY]).fill(ROOF_BLUE);
  g.poly([-hallW / 2 - 4, hallY, 0, hallY - h * 0.26, hallW / 2 + 4, hallY]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });

  g.circle(0, hallY - h * 0.1, w * 0.065).fill(STYLE.stoneLight);
  g.circle(0, hallY - h * 0.1, w * 0.065).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
  g.circle(0, hallY - h * 0.1, w * 0.04).stroke({ width: 1, color: STYLE.stoneDark, alpha: 0.5 });

  g.roundRect(-w * 0.08, hallY - h * 0.2, w * 0.16, h * 0.07, 2).fill(STYLE.sand);
  g.roundRect(-w * 0.08, hallY - h * 0.2, w * 0.16, h * 0.07, 2).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
  g.moveTo(-w * 0.04, hallY - h * 0.16).lineTo(w * 0.04, hallY - h * 0.16).stroke({ width: 0.8, color: OUTLINE, alpha: 0.4 });
  g.moveTo(-w * 0.03, hallY - h * 0.15).lineTo(w * 0.05, hallY - h * 0.15).stroke({ width: 0.8, color: OUTLINE, alpha: 0.4 });

  door(g, 0, hallY + hallH, w * 0.15, h * 0.22);
  windowLit(g, -hallW * 0.32, hallY + hallH * 0.55, w * 0.08);
  windowLit(g, hallW * 0.32, hallY + hallH * 0.55, w * 0.08);
  pennant(g, hallW / 2 - 2, hallY - h * 0.26 + 2, w * 0.13, faction);
}

function drawWall(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);

  g.roundRect(-w / 2, -h / 2, w, h, 3).fill(STYLE.stone);
  brickwork(g, -w / 2, -h / 2, w, h, STYLE.stoneDark, 2);
  g.roundRect(-w / 2, -h / 2, w, h * 0.4, 3).fill(STYLE.stoneLight);
  for (let i = 0; i < 4; i += 1) {
    const bx = -w / 2 + (i * w) / 4;
    g.rect(bx + 1, -h / 2 - 5, w / 4 - 2, 7).fill(STYLE.stone);
    g.rect(bx + 1, -h / 2 - 5, w / 4 - 2, 7).stroke({ width: 1.2, color: OUTLINE, alpha: 0.9 });
  }
  g.roundRect(-w / 2, -h / 2, w, h, 3).stroke({ width: lw, color: OUTLINE, alpha: 0.9 });
  g.rect(-w / 2 + 3, h * 0.1, w - 6, 3).fill({ color: 0x000000, alpha: 0.12 });

  if (w > 30) {
    torch(g, 0, -h * 0.1, Math.max(3, w * 0.12));
  }
}

function drawForest(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  pine(g, -w * 0.2, -h * 0.05, w * 0.3);
  pine(g, w * 0.2, h * 0.08, w * 0.26);
  pine(g, w * 0.02, -h * 0.22, w * 0.24);
}

function pine(g: Graphics, x: number, y: number, size: number): void {
  g.ellipse(x, y + size * 0.55, size * 0.5, size * 0.2).fill({ color: 0x000000, alpha: 0.16 });
  g.rect(x - size * 0.08, y + size * 0.1, size * 0.16, size * 0.45).fill(STYLE.woodDark);
  const layers: Array<[number, number]> = [
    [size * 0.5, y - size * 0.1],
    [size * 0.38, y - size * 0.38],
    [size * 0.26, y - size * 0.62],
  ];
  const shades = [STYLE.leafDark, STYLE.leaf, STYLE.leafLight];
  layers.forEach(([half, ly], i) => {
    g.poly([x - half, ly, x + half, ly, x, ly - size * 0.4]).fill(shades[i]);
    g.poly([x - half, ly, x + half, ly, x, ly - size * 0.4]).stroke({
      width: 1.5,
      color: OUTLINE,
      alpha: 0.75,
    });
  });
}

function drawGold(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  g.ellipse(0, h * 0.36, w * 0.5, h * 0.2).fill({ color: 0x000000, alpha: 0.16 });
  g.ellipse(-w * 0.15, h * 0.05, w * 0.3, h * 0.28).fill(STYLE.stone);
  g.ellipse(w * 0.18, h * 0.12, w * 0.24, h * 0.22).fill(STYLE.stoneDark);
  g.ellipse(-w * 0.15, h * 0.05, w * 0.3, h * 0.28).stroke({ width: 2.5, color: OUTLINE, alpha: 0.85 });
  g.ellipse(w * 0.18, h * 0.12, w * 0.24, h * 0.22).stroke({ width: 1.8, color: OUTLINE, alpha: 0.85 });
  g.ellipse(-w * 0.22, -h * 0.05, w * 0.12, h * 0.1).fill({ color: STYLE.stoneLight, alpha: 0.8 });

  const nuggets: Array<[number, number, number]> = [
    [-0.2, -0.02, 0.075],
    [-0.05, 0.1, 0.06],
    [0.12, -0.08, 0.065],
    [0.24, 0.12, 0.05],
  ];
  for (const [nx, ny, nr] of nuggets) {
    g.circle(nx * w, ny * h, nr * w).fill(GOLD_NUGGET);
    g.circle(nx * w, ny * h, nr * w).stroke({ width: 1.5, color: 0x7a5a12, alpha: 0.9 });
    g.circle(nx * w - nr * w * 0.3, ny * h - nr * w * 0.3, nr * w * 0.35).fill(0xffffff);
  }
  g.poly([0.3 * w, -0.3 * h, 0.3 * w, -0.18 * h]).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  g.poly([0.26 * w, -0.24 * h, 0.34 * w, -0.24 * h]).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
}
