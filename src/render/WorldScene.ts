import { Container, Graphics } from "pixi.js";
import { MAP_LAYOUT } from "../config/map";
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

export function buildWorldScene(world: Container): Container {
  const rand = mulberry32(1337);
  const terrainLayer = new Container();

  const terrain = new Graphics();
  terrain.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(PALETTE.ground);

  for (let i = 0; i < 90; i += 1) {
    const x = rand() * WORLD_WIDTH;
    const y = rand() * WORLD_HEIGHT;
    const w = 120 + rand() * 260;
    const h = 90 + rand() * 200;
    terrain.ellipse(x, y, w, h).fill({ color: PALETTE.groundPatch, alpha: 0.5 });
  }

  const roadY = WORLD_HEIGHT / 2;
  terrain.rect(0, roadY - 60, WORLD_WIDTH, 120).fill({ color: PALETTE.path, alpha: 0.45 });

  const gridStep = TILE_SIZE * 4;
  for (let x = 0; x <= WORLD_WIDTH; x += gridStep) {
    terrain.rect(x, 0, 1, WORLD_HEIGHT);
  }
  for (let y = 0; y <= WORLD_HEIGHT; y += gridStep) {
    terrain.rect(0, y, WORLD_WIDTH, 1);
  }
  terrain.fill({ color: PALETTE.grid, alpha: 0.06 });

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
  for (let i = 0; i < 160; i += 1) {
    const x = 80 + rand() * (WORLD_WIDTH - 160);
    const y = 80 + rand() * (WORLD_HEIGHT - 160);
    const nearBase = occupied.some((p) => Math.hypot(p.x - x, p.y - y) < 340);
    const nearRoad = Math.abs(y - roadY) < 130;
    if (nearBase || nearRoad) continue;

    if (rand() < 0.78) {
      const r = 9 + rand() * 9;
      decor.circle(x, y + r * 0.7, r * 0.9).fill({ color: 0x000000, alpha: 0.12 });
      decor.circle(x, y, r).fill(PALETTE.tree);
      decor.circle(x - r * 0.3, y - r * 0.4, r * 0.7).fill(PALETTE.treeCanopy);
    } else {
      const r = 5 + rand() * 6;
      decor.ellipse(x, y, r * 1.2, r).fill(PALETTE.rock);
    }
  }

  terrainLayer.addChild(terrain, territory, decor);
  world.addChild(terrainLayer);
  return terrainLayer;
}
