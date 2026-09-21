import { Container, Graphics } from "pixi.js";
import { MAP_LAYOUT, PONDS } from "../config/map";
import {
  PALETTE,
  TILE_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "../config/world";

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

export function buildWorldScene(world: Container): Container {
  const rand = mulberry32(1337);
  const terrainLayer = new Container();

  const terrain = new Graphics();
  terrain.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(PALETTE.ground);

  for (let i = 0; i < 110; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const w = 100 + rand() * 260;
    const h = 80 + rand() * 200;
    const color = rand() < 0.5 ? PALETTE.groundPatch : PALETTE.groundAlt;
    terrain.ellipse(x, y, w, h).fill({ color, alpha: 0.45 });
  }

  for (let i = 0; i < 500; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const r = 1 + rand() * 2.2;
    terrain.circle(x, y, r).fill({ color: rand() < 0.5 ? 0x000000 : 0xffffff, alpha: 0.05 });
  }

  const roadY = WORLD_HEIGHT / 2;
  terrain.rect(0, roadY - 58, WORLD_WIDTH, 116).fill({ color: PALETTE.path, alpha: 0.5 });
  terrain.rect(0, roadY - 58, WORLD_WIDTH, 10).fill({ color: 0x000000, alpha: 0.08 });
  terrain.rect(0, roadY + 48, WORLD_WIDTH, 10).fill({ color: 0x000000, alpha: 0.08 });
  terrain.rect(0, roadY - 14, WORLD_WIDTH, 5).fill({ color: 0x000000, alpha: 0.1 });
  terrain.rect(0, roadY + 9, WORLD_WIDTH, 5).fill({ color: 0x000000, alpha: 0.1 });

  const gridStep = TILE_SIZE * 4;
  for (let x = 0; x <= WORLD_WIDTH; x += gridStep) {
    terrain.rect(x, 0, 1, WORLD_HEIGHT);
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += gridStep) {
    terrain.rect(0, y, WORLD_WIDTH, 1);
  }
  terrain.fill({ color: PALETTE.grid, alpha: 0.05 });

  for (const pond of PONDS) {
    const px = pond.tileX * TILE_SIZE;
    const py = pond.tileY * TILE_SIZE;
    const r = pond.radius * TILE_SIZE;
    terrain.ellipse(px, py, r + 14, r * 0.85 + 12).fill(0xcbb98a);
    terrain.ellipse(px, py, r + 14, r * 0.85 + 12).stroke({ width: 3, color: 0x8a7a5a, alpha: 0.6 });
    terrain.ellipse(px, py, r, r * 0.85).fill(0x3f8fbf);
    terrain.ellipse(px - r * 0.25, py - r * 0.2, r * 0.55, r * 0.45).fill(0x6fbfe8);
    terrain.ellipse(px + r * 0.3, py + r * 0.25, r * 0.2, r * 0.12).fill({ color: 0xffffff, alpha: 0.5 });
  }

  terrain.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).stroke({
    width: 8,
    color: PALETTE.outline,
    alpha: 0.5,
  });

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
  for (let i = 0; i < 150; i += 1) {
    const x = 80 + rand() * (WORLD_WIDTH - 160);
    const y = 80 + rand() * (WORLD_HEIGHT - 160);
    const nearBase = occupied.some((p) => Math.hypot(p.x - x, p.y - y) < 340);
    const nearRoad = Math.abs(y - roadY) < 140;
    if (nearBase || nearRoad || inPond(x, y, 1.2)) continue;

    if (rand() < 0.74) {
      drawPine(decor, x, y, 11 + rand() * 9, rand);
    } else {
      const r = 5 + rand() * 6;
      decor.ellipse(x, y + r * 0.5, r * 1.2, r * 0.6).fill({ color: 0x000000, alpha: 0.12 });
      decor.ellipse(x, y, r * 1.2, r).fill(PALETTE.rock);
      decor.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.4).fill(0xa8adb8);
    }
  }

  for (let i = 0; i < 130; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const nearRoad = Math.abs(y - roadY) < 90;
    if (nearRoad || inPond(x, y, 0.6)) continue;
    const h = 4 + rand() * 5;
    decor.rect(x - 3, y - h, 1.6, h).fill({ color: 0x3d6b34, alpha: 0.8 });
    decor.rect(x, y - h - 2, 1.6, h + 2).fill({ color: 0x4d8543, alpha: 0.8 });
    decor.rect(x + 3, y - h + 1, 1.6, h - 1).fill({ color: 0x3d6b34, alpha: 0.8 });
  }

  const flowerColors = [0xffffff, 0xf6d76a, 0xf2a0c0];
  for (let i = 0; i < 46; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const nearRoad = Math.abs(y - roadY) < 90;
    if (nearRoad || inPond(x, y, 0.6)) continue;
    decor.circle(x, y, 2.2).fill(flowerColors[Math.floor(rand() * flowerColors.length)]);
    decor.circle(x, y, 1).fill(0xe08a2d);
  }

  terrainLayer.addChild(terrain, territory, decor);
  world.addChild(terrainLayer);
  return terrainLayer;
}

function drawPine(g: Graphics, x: number, y: number, size: number, rand: () => number): void {
  g.ellipse(x, y + size * 0.5, size * 0.7, size * 0.3).fill({ color: 0x000000, alpha: 0.14 });
  g.rect(x - size * 0.12, y, size * 0.24, size * 0.55).fill(0x6b4423);
  const layers = 3;
  for (let i = 0; i < layers; i += 1) {
    const t = i / layers;
    const ly = y - size * 0.35 - i * size * 0.32;
    const lw = size * (1.05 - t * 0.55);
    const shade = i === 0 ? 0x2f5d34 : i === 1 ? 0x3a7040 : 0x47854e;
    g.poly([x - lw / 2, ly, x + lw / 2, ly, x, ly - size * 0.55]).fill(shade);
  }
  g.circle(x - size * 0.15, y - size * 0.9, size * 0.12).fill({ color: 0xffffff, alpha: 0.18 });
  void rand;
}
