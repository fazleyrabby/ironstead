import { Container, Graphics } from "pixi.js";
import { MAP_LAYOUT, PONDS } from "../config/map";
import { PALETTE, TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";
import {
  INK,
  STYLE,
  groundShadow,
  inkCircle,
  inkEllipse,
  inkPoly,
  inkRect,
} from "./style";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function baseCenters(): Array<{ x: number; y: number }> {
  return (["player", "enemy"] as const).map((id) => {
    const tile = MAP_LAYOUT[id].baseTile;
    return { x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE };
  });
}

function inPond(x: number, y: number, margin: number): boolean {
  for (const pond of PONDS) {
    const px = pond.tileX * TILE_SIZE;
    const py = pond.tileY * TILE_SIZE;
    if (Math.hypot(x - px, y - py) < (pond.radius + margin) * TILE_SIZE) return true;
  }
  return false;
}

function blobPoints(cx: number, cy: number, r: number, bumps: number): number[] {
  const points: number[] = [];
  const n = bumps * 4;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.84 + 0.16 * Math.abs(Math.sin((i * Math.PI) / 2)));
    points.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92);
  }
  return points;
}

export function buildWorldScene(world: Container): Container {
  const rand = mulberry32(1337);
  const terrainLayer = new Container();
  const terrain = new Graphics();

  terrain.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(STYLE.grass);

  for (let ty = 0; ty * TILE_SIZE < WORLD_HEIGHT; ty += 2) {
    for (let tx = 0; tx * TILE_SIZE < WORLD_WIDTH; tx += 2) {
      if ((tx + ty) % 4 !== 0) continue;
      terrain
        .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 2)
        .fill({ color: STYLE.grassLight, alpha: 0.03 });
    }
  }

  for (let i = 0; i < 90; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const w = 120 + rand() * 320;
    const h = 90 + rand() * 220;
    const color = rand() < 0.5 ? STYLE.grassLight : STYLE.grassDark;
    terrain.ellipse(x, y, w, h).fill({ color, alpha: 0.22 });
  }
  for (let i = 0; i < 34; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    terrain.ellipse(x, y, 80 + rand() * 160, 60 + rand() * 120).fill({
      color: STYLE.dirt,
      alpha: 0.08,
    });
  }
  for (let i = 0; i < 1500; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const r = 0.8 + rand() * 1.6;
    const color = rand() < 0.5 ? STYLE.grassDark : STYLE.grassLight;
    terrain.circle(x, y, r).fill({ color, alpha: 0.16 });
  }
  for (let i = 0; i < 400; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    terrain
      .ellipse(x, y, 3 + rand() * 7, 1.5 + rand() * 3)
      .fill({ color: STYLE.grassShade, alpha: 0.14 });
  }

  const roadY = WORLD_HEIGHT / 2;
  terrain.rect(0, roadY - 56, WORLD_WIDTH, 112).fill(STYLE.dirt);
  terrain.rect(0, roadY - 12, WORLD_WIDTH, 5).fill({ color: STYLE.dirtDark, alpha: 0.55 });
  terrain.rect(0, roadY + 7, WORLD_WIDTH, 5).fill({ color: STYLE.dirtDark, alpha: 0.55 });
  terrain.rect(0, roadY - 56, WORLD_WIDTH, 3).fill({ color: INK, alpha: 0.35 });
  terrain.rect(0, roadY + 53, WORLD_WIDTH, 3).fill({ color: INK, alpha: 0.35 });
  for (let i = 0; i < 180; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = roadY - 50 + rand() * 100;
    terrain
      .ellipse(x, y, 1.5 + rand() * 2.5, 1 + rand() * 1.8)
      .fill({ color: rand() < 0.5 ? STYLE.stoneDark : STYLE.sand, alpha: 0.6 });
  }

  const gridStep = TILE_SIZE * 4;
  for (let x = 0; x <= WORLD_WIDTH; x += gridStep) terrain.rect(x, 0, 1, WORLD_HEIGHT);
  for (let y = 0; y <= WORLD_HEIGHT; y += gridStep) terrain.rect(0, y, WORLD_WIDTH, 1);
  terrain.fill({ color: PALETTE.grid, alpha: 0.05 });

  for (const pond of PONDS) {
    const px = pond.tileX * TILE_SIZE;
    const py = pond.tileY * TILE_SIZE;
    const r = pond.radius * TILE_SIZE;
    inkEllipse(terrain, px, py, r + 16, r * 0.85 + 14, STYLE.sand, 3);
    inkEllipse(terrain, px, py, r, r * 0.85, STYLE.water, 3);
    terrain.ellipse(px, py + r * 0.2, r * 0.8, r * 0.55).fill({
      color: STYLE.waterDeep,
      alpha: 0.35,
    });
    terrain.ellipse(px - r * 0.3, py - r * 0.25, r * 0.45, r * 0.3).fill({
      color: STYLE.waterLight,
      alpha: 0.6,
    });
    terrain.ellipse(px + r * 0.3, py + r * 0.3, r * 0.16, r * 0.08).fill({
      color: 0xffffff,
      alpha: 0.6,
    });
    for (let i = 0; i < 4; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.5;
      drawLily(terrain, px + Math.cos(a) * d, py + Math.sin(a) * d, 5 + rand() * 4);
    }
    for (let i = 0; i < 9; i += 1) {
      const a = rand() * Math.PI * 2;
      drawReed(
        terrain,
        px + Math.cos(a) * (r + 5),
        py + Math.sin(a) * (r * 0.85 + 5),
        8 + rand() * 9,
      );
    }
  }

  terrain.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).stroke({ width: 6, color: INK, alpha: 0.3 });

  for (const b of baseCenters()) {
    terrain.ellipse(b.x, b.y + 10, 236, 176).fill(STYLE.dirt);
    terrain.ellipse(b.x, b.y + 10, 236, 176).stroke({ width: 3, color: INK, alpha: 0.22 });
    terrain.ellipse(b.x, b.y + 4, 196, 140).fill({ color: STYLE.sand, alpha: 0.3 });
    terrain.ellipse(b.x - 60, b.y - 30, 90, 60).fill({ color: STYLE.dirtDark, alpha: 0.16 });
  }

  const territory = new Graphics();
  territory
    .rect(0, WORLD_HEIGHT * 0.62, WORLD_WIDTH, WORLD_HEIGHT * 0.38)
    .fill({ color: PALETTE.playerTint, alpha: 0.09 });
  territory
    .rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT * 0.38)
    .fill({ color: PALETTE.enemyTint, alpha: 0.09 });
  territory
    .rect(0, WORLD_HEIGHT * 0.62 - 2, WORLD_WIDTH, 3)
    .fill({ color: PALETTE.playerTint, alpha: 0.4 });
  territory
    .rect(0, WORLD_HEIGHT * 0.38, WORLD_WIDTH, 3)
    .fill({ color: PALETTE.enemyTint, alpha: 0.4 });

  const decor = new Graphics();
  const occupied = baseCenters();
  const blockedAt = (x: number, y: number, baseRadius = 280, road = 120): boolean =>
    occupied.some((p) => Math.hypot(p.x - x, p.y - y) < baseRadius) ||
    Math.abs(y - roadY) < road ||
    inPond(x, y, 1.3);

  for (let i = 0; i < 7; i += 1) {
    const cx = 260 + rand() * (WORLD_WIDTH - 520);
    const cy = 220 + rand() * (WORLD_HEIGHT - 440);
    if (Math.abs(cy - roadY) < 220) continue;
    if (occupied.some((p) => Math.hypot(p.x - cx, p.y - cy) < 300)) continue;
    if (inPond(cx, cy, 2)) continue;
    drawCropPlot(decor, cx, cy, 44 + rand() * 34, rand);
  }

  const band = 150;
  for (let i = 0; i < 1100; i += 1) {
    let x: number;
    let y: number;
    if (rand() < 0.5) {
      x = rand() < 0.5 ? rand() * band : WORLD_WIDTH - rand() * band;
      y = rand() * WORLD_HEIGHT;
    } else {
      y = rand() < 0.5 ? rand() * band : WORLD_HEIGHT - rand() * band;
      x = rand() * WORLD_WIDTH;
    }
    if (blockedAt(x, y, 260, 130)) continue;
    const autumn = rand() < 0.14;
    const treeRoll = rand();
    if (treeRoll < 0.38) drawRoundTree(decor, x, y, 13 + rand() * 9, autumn);
    else if (treeRoll < 0.72) drawPine(decor, x, y, 12 + rand() * 8);
    else if (treeRoll < 0.88) drawBirchTree(decor, x, y, 13 + rand() * 8);
    else drawDeadTree(decor, x, y, 11 + rand() * 7);
  }

  for (let c = 0; c < 60; c += 1) {
    const cx = 200 + rand() * (WORLD_WIDTH - 400);
    const cy = 180 + rand() * (WORLD_HEIGHT - 360);
    if (blockedAt(cx, cy, 360, 170)) continue;
    const n = 5 + Math.floor(rand() * 10);
    for (let i = 0; i < n; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = 30 + rand() * 110;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (blockedAt(x, y, 270, 125)) continue;
      if (rand() < 0.55) drawRoundTree(decor, x, y, 12 + rand() * 9, rand() < 0.16);
      else if (rand() < 0.7) drawPine(decor, x, y, 11 + rand() * 8);
      else drawBirchTree(decor, x, y, 12 + rand() * 7);
    }
  }

  for (let i = 0; i < 240; i += 1) {
    const x = 80 + rand() * (WORLD_WIDTH - 160);
    const y = 80 + rand() * (WORLD_HEIGHT - 160);
    if (blockedAt(x, y, 260, 120)) continue;
    const roll = rand();
    if (roll < 0.24) drawBush(decor, x, y, 5 + rand() * 4);
    else if (roll < 0.42) drawRock(decor, x, y, 4 + rand() * 5);
    else if (roll < 0.54) drawBoulder(decor, x, y, 6 + rand() * 6);
    else if (roll < 0.66) drawStump(decor, x, y, 4 + rand() * 3);
    else if (roll < 0.78) drawMushroom(decor, x, y, 4 + rand() * 3);
    else if (roll < 0.88) drawTallGrass(decor, x, y, 5 + rand() * 4);
    else drawRoundTree(decor, x, y, 11 + rand() * 7, true);
  }

  for (let i = 0; i < 460; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    if (Math.abs(y - roadY) < 70 || inPond(x, y, 0.6)) continue;
    decor
      .ellipse(x, y, 1.5 + rand() * 2, 1.1 + rand() * 1.4)
      .fill({ color: rand() < 0.5 ? STYLE.stone : STYLE.stoneLight, alpha: 0.75 });
  }

  for (let i = 0; i < 460; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    if (Math.abs(y - roadY) < 90 || inPond(x, y, 0.6)) continue;
    decor.rect(x - 3, y - 6, 1.8, 6).fill({ color: STYLE.leafDark, alpha: 0.9 });
    decor.rect(x, y - 8, 1.8, 8).fill({ color: STYLE.leaf, alpha: 0.9 });
    decor.rect(x + 3, y - 5, 1.8, 5).fill({ color: STYLE.leafDark, alpha: 0.9 });
  }

  for (let i = 0; i < 300; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    if (Math.abs(y - roadY) < 90 || inPond(x, y, 0.6)) continue;
    const fRoll = rand();
    if (fRoll < 0.4) drawFlower(decor, x, y, STYLE.flowerWhite);
    else if (fRoll < 0.65) drawFlower(decor, x, y, STYLE.flowerYellow);
    else if (fRoll < 0.85) drawFlower(decor, x, y, STYLE.flowerPink);
    else drawFlower(decor, x, y, STYLE.flowerWhite);
  }

  terrainLayer.addChild(terrain, territory, decor);
  world.addChild(terrainLayer);
  return terrainLayer;
}

function drawCropPlot(g: Graphics, x: number, y: number, size: number, rand: () => number): void {
  const w = size;
  const h = size * 0.72;
  groundShadow(g, x, y + h * 0.12, w * 0.56, h * 0.34);
  inkRect(g, x - w / 2, y - h / 2, w, h, STYLE.soil, 4, 2.2);
  for (let r = 0; r < 3; r += 1) {
    const ry = y - h / 2 + (r + 0.72) * (h / 3);
    for (let c = 0; c < 4; c += 1) {
      const cx = x - w / 2 + (c + 0.5) * (w / 4);
      const r2 = Math.max(2, w * 0.055);
      inkCircle(g, cx, ry, r2, STYLE.crop, 1.2);
      g.circle(cx - r2 * 0.3, ry - r2 * 0.3, r2 * 0.4).fill({ color: 0xffffff, alpha: 0.25 });
    }
  }
  for (let c = 0; c <= 3; c += 1) {
    const px = x - w / 2 + c * (w / 3);
    g.rect(px - 1.5, y - h / 2 - 7, 3, 8).fill(STYLE.wood);
    g.rect(px - 1.5, y + h / 2 - 1, 3, 8).fill(STYLE.wood);
  }
  void rand;
}

function drawRoundTree(g: Graphics, x: number, y: number, size: number, autumn: boolean): void {
  groundShadow(g, x, y + size * 0.42, size * 0.64, size * 0.26);
  inkRect(g, x - size * 0.1, y - size * 0.12, size * 0.2, size * 0.56, STYLE.woodDark, size * 0.05, 1.6);
  const leaf = autumn ? STYLE.autumn : STYLE.leaf;
  const leafLight = autumn ? STYLE.autumnLight : STYLE.leafLight;
  inkPoly(g, blobPoints(x, y - size * 0.5, size * 0.62, 5), leaf, 2);
  g.ellipse(x - size * 0.2, y - size * 0.72, size * 0.22, size * 0.14).fill({
    color: leafLight,
    alpha: 0.85,
  });
}

function drawPine(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.5, size * 0.6, size * 0.24);
  inkRect(g, x - size * 0.1, y, size * 0.2, size * 0.5, STYLE.woodDark, 0, 1.5);
  const shades = [STYLE.leafDark, STYLE.leaf, STYLE.leafLight];
  for (let i = 0; i < 3; i += 1) {
    const ly = y - size * 0.3 - i * size * 0.3;
    const lw = size * (1.1 - i * 0.28);
    inkPoly(g, [x - lw / 2, ly, x + lw / 2, ly, x, ly - size * 0.6], shades[i], 1.8);
  }
}

function drawBush(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.4, size * 0.52, size * 0.2);
  inkPoly(g, blobPoints(x, y, size * 0.6, 4), STYLE.leaf, 1.8);
  g.ellipse(x - size * 0.18, y - size * 0.22, size * 0.22, size * 0.13).fill({
    color: STYLE.leafLight,
    alpha: 0.75,
  });
}

function drawRock(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.5, size * 0.72, size * 0.24);
  inkPoly(
    g,
    [x - size * 0.72, y + size * 0.4, x - size * 0.32, y - size * 0.62, x + size * 0.42, y - size * 0.5, x + size * 0.8, y + size * 0.4],
    STYLE.stone,
    1.8,
  );
  g.poly([x - size * 0.32, y - size * 0.62, x + size * 0.42, y - size * 0.5, x + size * 0.1, y - size * 0.08, x - size * 0.2, y - size * 0.12]).fill(
    STYLE.stoneLight,
  );
}

function drawStump(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.3, size * 0.5, size * 0.2);
  inkEllipse(g, x, y + size * 0.12, size * 0.42, size * 0.28, STYLE.woodDark, 1.6);
  inkEllipse(g, x, y - size * 0.16, size * 0.42, size * 0.28, STYLE.woodLight, 1.6);
  g.ellipse(x, y - size * 0.16, size * 0.2, size * 0.12).stroke({
    width: 1.2,
    color: STYLE.woodDark,
    alpha: 0.7,
  });
}

function drawMushroom(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.42, size * 0.42, size * 0.14);
  inkRect(g, x - size * 0.13, y, size * 0.26, size * 0.42, 0xf0e6d0, size * 0.08, 1.4);
  inkEllipse(g, x, y, size * 0.52, size * 0.36, STYLE.mushroom, 1.6);
  g.circle(x - size * 0.16, y - size * 0.04, size * 0.09).fill(0xffffff);
  g.circle(x + size * 0.13, y - size * 0.08, size * 0.07).fill(0xffffff);
}

function drawFlower(g: Graphics, x: number, y: number, color: number = STYLE.flowerWhite): void {
  g.circle(x - 3, y, 1.9).fill(color);
  g.circle(x + 3, y, 1.9).fill(color);
  g.circle(x, y - 3, 1.9).fill(color);
  g.circle(x, y + 1, 1.1).fill(STYLE.flowerYellow);
}

function drawBirchTree(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.42, size * 0.58, size * 0.24);
  inkRect(g, x - size * 0.08, y - size * 0.1, size * 0.16, size * 0.54, 0xf0ebe0, size * 0.04, 1.6);
  g.rect(x - size * 0.06, y + size * 0.02, size * 0.03, size * 0.08).fill({ color: 0x3a3a3a, alpha: 0.5 });
  g.rect(x + size * 0.02, y + size * 0.14, size * 0.04, size * 0.06).fill({ color: 0x3a3a3a, alpha: 0.4 });
  inkPoly(g, blobPoints(x, y - size * 0.48, size * 0.56, 5), STYLE.leafLight, 2);
  g.ellipse(x - size * 0.18, y - size * 0.68, size * 0.2, size * 0.12).fill({
    color: 0xffffff,
    alpha: 0.3,
  });
}

function drawDeadTree(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.4, size * 0.5, size * 0.18);
  inkRect(g, x - size * 0.1, y - size * 0.05, size * 0.2, size * 0.48, STYLE.woodDark, size * 0.04, 1.6);
  g.moveTo(x - size * 0.06, y - size * 0.05)
    .lineTo(x - size * 0.4, y - size * 0.45)
    .stroke({ width: 2, color: STYLE.woodDark });
  g.moveTo(x - size * 0.4, y - size * 0.45)
    .lineTo(x - size * 0.5, y - size * 0.62)
    .stroke({ width: 1.4, color: STYLE.woodDark });
  g.moveTo(x + size * 0.06, y + size * 0.05)
    .lineTo(x + size * 0.35, y - size * 0.3)
    .stroke({ width: 1.8, color: STYLE.woodDark });
  g.moveTo(x + size * 0.35, y - size * 0.3)
    .lineTo(x + size * 0.28, y - size * 0.48)
    .stroke({ width: 1.2, color: STYLE.woodDark });
  g.moveTo(x, y - size * 0.05)
    .lineTo(x + size * 0.08, y - size * 0.55)
    .stroke({ width: 1.6, color: STYLE.woodDark });
}

function drawBoulder(g: Graphics, x: number, y: number, size: number): void {
  groundShadow(g, x, y + size * 0.5, size * 0.8, size * 0.28);
  inkPoly(
    g,
    [x - size * 0.8, y + size * 0.45, x - size * 0.5, y - size * 0.4, x + size * 0.1, y - size * 0.55, x + size * 0.7, y - size * 0.3, x + size * 0.85, y + size * 0.45],
    STYLE.stone,
    2,
  );
  g.poly([x - size * 0.5, y - size * 0.4, x + size * 0.1, y - size * 0.55, x + size * 0.15, y - size * 0.1, x - size * 0.3, y - size * 0.05]).fill(
    STYLE.stoneLight,
  );
  g.ellipse(x - size * 0.2, y - size * 0.25, size * 0.15, size * 0.08).fill({ color: STYLE.leafDark, alpha: 0.5 });
  g.ellipse(x - size * 0.1, y - size * 0.2, size * 0.08, size * 0.05).fill({ color: STYLE.leaf, alpha: 0.4 });
}

function drawTallGrass(g: Graphics, x: number, y: number, size: number): void {
  const blades = [[-2, 0.9], [0, 1.0], [2, 0.85], [4, 0.7]] as const;
  for (const [dx, hf] of blades) {
    const h = size * hf;
    const tipX = x + dx + size * 0.15;
    g.moveTo(x + dx, y)
      .quadraticCurveTo(x + dx, y - h * 0.6, tipX, y - h)
      .stroke({ width: 1.6, color: STYLE.leafDark, alpha: 0.85 });
  }
}

function drawLily(g: Graphics, x: number, y: number, r: number): void {
  inkCircle(g, x, y, r, STYLE.leaf, 1.2);
  g.poly([x, y, x + r, y - r * 0.5, x + r * 0.7, y + r * 0.6]).fill(STYLE.water);
  g.circle(x - r * 0.3, y - r * 0.3, r * 0.35).fill({ color: STYLE.leafLight, alpha: 0.7 });
}

function drawReed(g: Graphics, x: number, y: number, h: number): void {
  inkRect(g, x - 1.2, y - h, 2.4, h, STYLE.leafDark, 0, 1);
  g.circle(x, y - h, 2.2).fill(STYLE.wood);
}
