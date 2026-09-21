import { Container, Graphics } from "pixi.js";
import { PALETTE } from "../config/world";
import { def } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Building, GameState, PlayerId } from "../sim/types";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

const OUTLINE = PALETTE.outline;
const STONE = 0xa8a29a;
const STONE_DARK = 0x79736b;
const WOOD = 0x8a5a2b;
const WOOD_DARK = 0x5f3c1c;
const WINDOW_LIT = 0xffd97a;
const CANVAS_TENT = 0xe4d6b8;

interface Entry {
  container: Container;
  body: Graphics;
  overlay: Graphics;
  progress: Graphics;
  state: string;
  selected: boolean;
  hpBucket: number;
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
          entry = this.createEntry();
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

  private createEntry(): Entry {
    const container = new Container();
    const body = new Graphics();
    const overlay = new Graphics();
    const progress = new Graphics();
    container.addChild(body, overlay, progress);
    this.layer.addChild(container);
    return { container, body, overlay, progress, state: "", selected: false, hpBucket: -1 };
  }

  private sync(entry: Entry, building: Building, selected: boolean): void {
    entry.container.position.set(building.x, building.y);

    if (entry.state !== building.state) {
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

function line(w: number): number {
  return Math.max(2, Math.round(w / 36));
}

function shadow(g: Graphics, w: number, h: number): void {
  g.ellipse(0, h * 0.44, w * 0.52, h * 0.18).fill({ color: 0x000000, alpha: 0.18 });
}

function foundation(g: Graphics, w: number, h: number, lw: number): void {
  g.roundRect(-w / 2 + 1, -h / 2 + 6, w - 2, h - 8, 8).fill(STONE);
  g.roundRect(-w / 2 + 1, -h / 2 + 6, w - 2, h - 8, 8).stroke({ width: lw, color: OUTLINE, alpha: 0.85 });
  g.roundRect(-w / 2 + 5, -h / 2 + 10, w - 10, 5, 2).fill({ color: 0xffffff, alpha: 0.18 });
}

function timberWall(g: Graphics, x: number, y: number, w: number, h: number, fill: number, lw: number): void {
  g.roundRect(x, y, w, h, 4).fill(fill);
  g.rect(x, y, w, Math.max(3, h * 0.12)).fill({ color: WOOD_DARK, alpha: 0.85 });
  g.rect(x, y + h - Math.max(3, h * 0.12), w, Math.max(3, h * 0.12)).fill({
    color: WOOD_DARK,
    alpha: 0.85,
  });
  g.rect(x + w * 0.46, y, Math.max(2.5, w * 0.07), h).fill({ color: WOOD_DARK, alpha: 0.85 });
  g.roundRect(x, y, w, h, 4).stroke({ width: lw, color: OUTLINE, alpha: 0.85 });
}

function gableRoof(g: Graphics, x: number, yApex: number, yEave: number, w: number, color: number, lw: number): void {
  g.poly([x - 3, yEave + 2, x + w / 2, yApex, x + w + 3, yEave + 2]).fill(color);
  g.poly([x - 3, yEave + 2, x + w / 2, yApex, x + w + 3, yEave + 2]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.poly([x + w / 2 - 2.5, yApex + 5, x + w / 2, yApex + 2, x + w / 2 + 2.5, yApex + 5]).fill({
    color: 0xffffff,
    alpha: 0.3,
  });
  g.rect(x - 3, yEave - 1, w + 6, 4).fill({ color: 0x000000, alpha: 0.16 });
}

function door(g: Graphics, cx: number, baseY: number, w: number, h: number): void {
  g.roundRect(cx - w / 2, baseY - h, w, h, w * 0.3).fill(WOOD_DARK);
  g.circle(cx, baseY - h, w * 0.28).fill(0xf6d76a);
}

function windowLit(g: Graphics, cx: number, cy: number, s: number): void {
  g.roundRect(cx - s / 2, cy - s / 2, s, s, 2).fill(WINDOW_LIT);
  g.rect(cx - s / 2, cy - 1, s, 2).fill(WOOD_DARK);
  g.rect(cx - 1, cy - s / 2, 2, s).fill(WOOD_DARK);
  g.roundRect(cx - s / 2, cy - s / 2, s, s, 2).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
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

  const hallW = w * 0.72;
  const hallH = h * 0.4;
  const hallY = h * 0.06;
  timberWall(g, -hallW / 2, hallY, hallW, hallH, colors.body, lw);
  gableRoof(g, -hallW / 2 - 4, hallY - h * 0.26, hallY + 2, hallW + 8, colors.roof, lw);

  const towerW = w * 0.3;
  const towerH = h * 0.52;
  const towerY = -h * 0.46;
  timberWall(g, -towerW / 2, towerY, towerW, towerH, colors.accent, lw);
  for (let i = 0; i < 3; i += 1) {
    const bx = -towerW / 2 + (i * towerW) / 3;
    g.rect(bx + 1, towerY - 7, towerW / 3 - 2, 8).fill(colors.accent);
    g.rect(bx + 1, towerY - 7, towerW / 3 - 2, 8).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
  }
  g.poly([-towerW / 2 - 3, towerY - 6, 0, towerY - h * 0.2, towerW / 2 + 3, towerY - 6]).fill(colors.roof);
  g.poly([-towerW / 2 - 3, towerY - 6, 0, towerY - h * 0.2, towerW / 2 + 3, towerY - 6]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });

  door(g, 0, hallY + hallH, w * 0.14, h * 0.2);
  windowLit(g, -hallW * 0.3, hallY + hallH * 0.45, w * 0.07);
  windowLit(g, hallW * 0.3, hallY + hallH * 0.45, w * 0.07);
  windowLit(g, 0, towerY + towerH * 0.3, w * 0.06);

  pennant(g, -towerW / 2 + 3, towerY - h * 0.2 + 2, w * 0.12, faction);
  pennant(g, towerW / 2 - 3, towerY - h * 0.2 + 2, w * 0.12, faction);
}

function drawHouse(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  const lw = line(w);
  shadow(g, w, h);

  const wallH = h * 0.44;
  const wallY = h * 0.02;
  timberWall(g, -w * 0.36, wallY, w * 0.72, wallH, colors.body, lw);
  gableRoof(g, -w * 0.42, wallY - h * 0.3, wallY + 2, w * 0.84, colors.roof, lw);

  g.rect(w * 0.16, wallY - h * 0.26, w * 0.09, h * 0.2).fill(STONE_DARK);
  g.rect(w * 0.16, wallY - h * 0.26, w * 0.09, h * 0.2).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });

  door(g, -w * 0.12, wallY + wallH, w * 0.16, h * 0.26);
  windowLit(g, w * 0.18, wallY + wallH * 0.45, w * 0.11);
  pennant(g, 0, wallY - h * 0.3 + 1, w * 0.14, faction);
}

function drawFarm(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  const lw = line(w);
  shadow(g, w, h);

  g.roundRect(-w / 2, -h / 2, w, h, 8).fill(0x8a6a45);
  g.roundRect(-w / 2, -h / 2, w, h, 8).stroke({ width: lw, color: OUTLINE, alpha: 0.85 });
  for (let r = 0; r < 3; r += 1) {
    const ry = -h * 0.32 + r * h * 0.3;
    g.roundRect(-w * 0.42, ry, w * 0.84, h * 0.16, 4).fill(0x5d8a3c);
    for (let c = 0; c < 5; c += 1) {
      const cx = -w * 0.34 + c * w * 0.17;
      g.circle(cx, ry + h * 0.08, Math.max(2, w * 0.03)).fill(0x7ee081);
    }
  }

  const barnW = w * 0.34;
  const barnH = h * 0.3;
  const bx = w * 0.12;
  const by = -h * 0.44;
  timberWall(g, bx, by, barnW, barnH, colors.body, lw);
  gableRoof(g, bx - 2, by - h * 0.14, by + 1, barnW + 4, colors.roof, lw);

  g.circle(-w * 0.32, h * 0.32, w * 0.09).fill(colors.accent);
  g.circle(-w * 0.32, h * 0.32, w * 0.09).stroke({ width: 1.5, color: WOOD_DARK, alpha: 0.9 });
  g.rect(-w * 0.32 - w * 0.09, h * 0.32 - 1, w * 0.18, 2).fill(WOOD_DARK);

  for (let i = 0; i < 4; i += 1) {
    const fx = -w * 0.46 + i * w * 0.12;
    g.rect(fx, h * 0.18, 3, h * 0.22).fill(WOOD);
  }
  g.rect(-w * 0.46, h * 0.24, w * 0.38, 3).fill(WOOD);
}

function drawStorage(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  const lw = line(w);
  shadow(g, w, h);
  foundation(g, w * 0.9, h * 0.9, lw);

  const wallH = h * 0.4;
  const wallY = -h * 0.08;
  timberWall(g, -w * 0.34, wallY, w * 0.68, wallH, colors.body, lw);
  gableRoof(g, -w * 0.4, wallY - h * 0.26, wallY + 2, w * 0.8, colors.roof, lw);

  g.roundRect(-w * 0.13, wallY + wallH - h * 0.24, w * 0.26, h * 0.24, 3).fill(WOOD_DARK);
  g.rect(-w * 0.13, wallY + wallH - h * 0.13, w * 0.26, 2).fill({ color: faction, alpha: 0.9 });

  g.roundRect(-w * 0.44, h * 0.22, w * 0.2, h * 0.16, 2).fill(0xc8a878);
  g.roundRect(-w * 0.44, h * 0.22, w * 0.2, h * 0.16, 2).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
  g.rect(-w * 0.44, h * 0.28, w * 0.2, 2).fill(WOOD_DARK);
  g.circle(w * 0.34, h * 0.3, w * 0.1).fill(0xa0763e);
  g.circle(w * 0.34, h * 0.3, w * 0.1).stroke({ width: 1.5, color: OUTLINE, alpha: 0.9 });
  g.rect(w * 0.24, h * 0.26, w * 0.2, 2.5).fill(WOOD_DARK);
  g.rect(w * 0.24, h * 0.34, w * 0.2, 2.5).fill(WOOD_DARK);
}

function drawCamp(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const lw = line(w);
  shadow(g, w, h);

  g.ellipse(0, h * 0.1, w * 0.46, h * 0.4).fill(0x9a7f57);
  g.ellipse(0, h * 0.1, w * 0.46, h * 0.4).stroke({ width: lw, color: OUTLINE, alpha: 0.85 });

  for (let i = 0; i < 6; i += 1) {
    const px = -w * 0.42 + i * w * 0.17;
    g.poly([px - 5, -h * 0.34, px + 5, -h * 0.34, px, -h * 0.44]).fill(WOOD);
    g.rect(px - 5, -h * 0.34, 10, h * 0.1).fill(WOOD);
  }
  g.rect(-w * 0.44, -h * 0.3, w * 0.88, 4).fill(WOOD_DARK);

  tent(g, -w * 0.22, h * 0.05, w * 0.3, h * 0.34, lw);
  tent(g, w * 0.22, h * 0.12, w * 0.24, h * 0.27, lw);

  g.circle(w * 0.02, h * 0.3, w * 0.07).fill(STONE_DARK);
  g.poly([w * 0.02 - 5, h * 0.3 + 3, w * 0.02 + 5, h * 0.3 + 3, w * 0.02, h * 0.3 - 9]).fill(0xf08a2d);
  g.poly([w * 0.02 - 2.5, h * 0.3 + 3, w * 0.02 + 2.5, h * 0.3 + 3, w * 0.02, h * 0.3 - 4]).fill(0xf6d76a);

  g.rect(-w * 0.4, -h * 0.05, 3, h * 0.3).fill(WOOD_DARK);
  g.rect(-w * 0.4 + 3, -h * 0.05, w * 0.16, 3).fill(WOOD_DARK);
  g.circle(-w * 0.4 + 3 + w * 0.08, -h * 0.05 - 4, 4).fill(0xd9b382);

  pennant(g, w * 0.38, -h * 0.32, w * 0.12, faction);
  g.rect(w * 0.38 - 1.5, -h * 0.32 - 13, 3, h * 0.5).fill(WOOD_DARK);
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
  g.rect(cx - 1.5, baseY - h - 4, 3, h + 8).fill(WOOD_DARK);
}

function drawTower(g: Graphics, building: Building, faction: number): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  const lw = line(w);
  shadow(g, w * 1.2, h * 1.2);

  const baseW = w * 0.78;
  g.poly([-baseW / 2, h / 2, -w * 0.3, -h * 0.28, w * 0.3, -h * 0.28, baseW / 2, h / 2]).fill(colors.body);
  g.poly([-baseW / 2, h / 2, -w * 0.3, -h * 0.28, w * 0.3, -h * 0.28, baseW / 2, h / 2]).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.rect(-baseW / 2 + 2, 0, baseW - 4, 3).fill({ color: 0x000000, alpha: 0.15 });

  g.roundRect(-w * 0.42, -h * 0.48, w * 0.84, h * 0.24, 2).fill(WOOD);
  g.roundRect(-w * 0.42, -h * 0.48, w * 0.84, h * 0.24, 2).stroke({
    width: lw,
    color: OUTLINE,
    alpha: 0.9,
  });
  for (let i = 0; i < 3; i += 1) {
    const bx = -w * 0.42 + i * w * 0.28;
    g.rect(bx + 1, -h * 0.48 - 5, w * 0.28 - 2, 6).fill(colors.body);
  }

  windowLit(g, 0, h * 0.1, Math.max(4, w * 0.16));
  g.rect(-1.5, -h * 0.48 - 16, 3, 16).fill(WOOD_DARK);
  g.poly([1.5, -h * 0.48 - 16, 1.5 + w * 0.3, -h * 0.48 - 12, 1.5, -h * 0.48 - 8]).fill(faction);
}

function drawWall(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  const lw = line(w);
  shadow(g, w, h);

  g.roundRect(-w / 2, -h / 2, w, h, 3).fill(colors.body);
  g.roundRect(-w / 2, -h / 2, w, h * 0.4, 3).fill(colors.accent);
  for (let i = 0; i < 4; i += 1) {
    const bx = -w / 2 + (i * w) / 4;
    g.rect(bx + 1, -h / 2 - 5, w / 4 - 2, 7).fill(colors.body);
    g.rect(bx + 1, -h / 2 - 5, w / 4 - 2, 7).stroke({ width: 1.2, color: OUTLINE, alpha: 0.9 });
  }
  g.roundRect(-w / 2, -h / 2, w, h, 3).stroke({ width: lw, color: OUTLINE, alpha: 0.9 });
  g.rect(-w / 2 + 3, h * 0.1, w - 6, 3).fill({ color: 0x000000, alpha: 0.12 });
}

function drawForest(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  pine(g, -w * 0.2, -h * 0.05, w * 0.3, colors);
  pine(g, w * 0.2, h * 0.08, w * 0.26, colors);
  pine(g, w * 0.02, -h * 0.22, w * 0.24, colors);
}

function pine(g: Graphics, x: number, y: number, size: number, colors: { body: number; roof: number; accent: number }): void {
  g.ellipse(x, y + size * 0.55, size * 0.5, size * 0.2).fill({ color: 0x000000, alpha: 0.15 });
  g.rect(x - size * 0.08, y + size * 0.1, size * 0.16, size * 0.45).fill(0x6b4423);
  const layers: Array<[number, number]> = [
    [size * 0.5, y - size * 0.1],
    [size * 0.38, y - size * 0.38],
    [size * 0.26, y - size * 0.62],
  ];
  layers.forEach(([half, ly], i) => {
    const shade = i === 0 ? colors.body : i === 1 ? colors.roof : colors.accent;
    g.poly([x - half, ly, x + half, ly, x, ly - size * 0.4]).fill(shade);
    g.poly([x - half, ly, x + half, ly, x, ly - size * 0.4]).stroke({
      width: 1.5,
      color: OUTLINE,
      alpha: 0.7,
    });
  });
}

function drawGold(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  const colors = def(building.type).colors;
  g.ellipse(0, h * 0.36, w * 0.5, h * 0.2).fill({ color: 0x000000, alpha: 0.16 });
  g.ellipse(-w * 0.15, h * 0.05, w * 0.3, h * 0.28).fill(colors.body);
  g.ellipse(w * 0.18, h * 0.12, w * 0.24, h * 0.22).fill(STONE_DARK);
  g.ellipse(-w * 0.15, h * 0.05, w * 0.3, h * 0.28).stroke({ width: 2.5, color: OUTLINE, alpha: 0.85 });

  const nuggets: Array<[number, number, number]> = [
    [-0.2, -0.02, 0.075],
    [-0.05, 0.1, 0.06],
    [0.12, -0.08, 0.065],
    [0.24, 0.12, 0.05],
  ];
  for (const [nx, ny, nr] of nuggets) {
    g.circle(nx * w, ny * h, nr * w).fill(colors.accent);
    g.circle(nx * w, ny * h, nr * w).stroke({ width: 1.5, color: 0x7a5a12, alpha: 0.9 });
    g.circle(nx * w - nr * w * 0.3, ny * h - nr * w * 0.3, nr * w * 0.35).fill(0xffffff);
  }
  g.poly([0.3 * w, -0.3 * h, 0.3 * w, -0.18 * h]).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  g.poly([0.26 * w, -0.24 * h, 0.34 * w, -0.24 * h]).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
}
