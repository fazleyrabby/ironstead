import { Container, Graphics, Sprite } from "pixi.js";
import { PALETTE } from "../config/world";
import { def } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Building, GameState, PlayerId } from "../sim/types";
import { buildingTexture, USE_SPRITE_ASSETS, USE_V2_ASSET_PROTOTYPES } from "./Assets";
import { softShadowTexture } from "./softShadow";
import { STYLE } from "./style";
import { drawIllustratedBuilding, drawIllustratedHouse, drawIllustratedTownCenter } from "./IllustratedBuildings";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

const OUTLINE = PALETTE.outline;
const GOLD_NUGGET = STYLE.gold;

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
    const texture = USE_SPRITE_ASSETS || USE_V2_ASSET_PROTOTYPES
      ? buildingTexture(building.type, building.owner)
      : undefined;
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
      drawIllustratedTownCenter(g, building, faction);
      break;
    case "house":
      drawIllustratedHouse(g, building, faction);
      break;
    case "farm":
      drawIllustratedBuilding(g, building, faction);
      break;
    case "storage":
      drawIllustratedBuilding(g, building, faction);
      break;
    case "army_camp":
      drawIllustratedBuilding(g, building, faction);
      break;
    case "tower":
      drawIllustratedBuilding(g, building, faction);
      break;
    case "wall":
      drawIllustratedBuilding(g, building, faction);
      break;
    case "academy":
      drawIllustratedBuilding(g, building, faction);
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

function drawForest(g: Graphics, building: Building): void {
  const w = building.width;
  const h = building.height;
  pine(g, -w * 0.2, -h * 0.05, w * 0.3);
  pine(g, w * 0.2, h * 0.08, w * 0.26);
  pine(g, w * 0.02, -h * 0.22, w * 0.24);
  g.ellipse(-w * 0.01, h * 0.4, w * 0.2, h * 0.06).fill({ color: STYLE.leafDark, alpha: 0.55 });
  for (const x of [-w * 0.09, w * 0.07]) {
    g.circle(x, h * 0.38, w * 0.025).fill(STYLE.mushroom);
    g.rect(x - 0.6, h * 0.38, 1.2, h * 0.04).fill(STYLE.sand);
  }
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
    g.moveTo(x - half * 0.52, ly - size * 0.12)
      .lineTo(x - half * 0.16, ly - size * 0.25)
      .stroke({ width: 1, color: STYLE.leafLight, alpha: 0.46 });
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
  for (const [x1, y1, x2, y2] of [
    [-0.38, 0.22, -0.25, 0.1], [0.02, 0.24, 0.12, 0.16], [0.08, -0.19, 0.2, -0.1],
  ]) {
    g.moveTo(x1 * w, y1 * h).lineTo(x2 * w, y2 * h)
      .stroke({ width: 1.4, color: STYLE.goldDark, alpha: 0.8 });
  }

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
