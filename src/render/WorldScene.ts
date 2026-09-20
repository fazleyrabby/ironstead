import { Container, Graphics } from "pixi.js";
import {
  ENEMY_START,
  PALETTE,
  PLAYER_START,
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

export function buildWorldScene(world: Container): void {
  const rand = mulberry32(1337);
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
    .fill({ color: PALETTE.playerTint, alpha: 0.1 });
  territory
    .rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT * 0.38)
    .fill({ color: PALETTE.enemyTint, alpha: 0.1 });

  const decor = new Graphics();
  const occupied: Array<{ x: number; y: number }> = [PLAYER_START, ENEMY_START];
  for (let i = 0; i < 140; i += 1) {
    const x = 80 + rand() * (WORLD_WIDTH - 160);
    const y = 80 + rand() * (WORLD_HEIGHT - 160);
    const nearBase = occupied.some((p) => Math.hypot(p.x - x, p.y - y) < 260);
    const nearRoad = Math.abs(y - roadY) < 120;
    if (nearBase || nearRoad) continue;

    if (rand() < 0.78) {
      const r = 10 + rand() * 10;
      decor.circle(x, y + r * 0.7, r * 0.9).fill({ color: 0x000000, alpha: 0.12 });
      decor.circle(x, y, r).fill(PALETTE.tree);
      decor.circle(x - r * 0.3, y - r * 0.4, r * 0.7).fill(PALETTE.treeCanopy);
    } else {
      const r = 5 + rand() * 7;
      decor.ellipse(x, y, r * 1.2, r).fill(PALETTE.rock);
    }
  }

  world.addChild(terrain, territory, decor);

  world.addChild(makeBase(PLAYER_START.x, PLAYER_START.y, PALETTE.playerUnit, rand));
  world.addChild(makeBase(ENEMY_START.x, ENEMY_START.y, PALETTE.enemyUnit, rand));
}

function makeBase(
  x: number,
  y: number,
  accent: number,
  rand: () => number,
): Container {
  const group = new Container();
  group.position.set(x, y);

  const plaza = new Graphics();
  plaza.ellipse(0, 0, 150, 110).fill({ color: accent, alpha: 0.16 });
  plaza.ellipse(0, 0, 150, 110).stroke({ width: 3, color: accent, alpha: 0.5 });
  group.addChild(plaza);

  const hall = new Graphics();
  hall.roundRect(-70, -58, 140, 96, 12).fill(PALETTE.building);
  hall.roundRect(-70, -58, 140, 96, 12).stroke({ width: 4, color: PALETTE.outline, alpha: 0.8 });
  hall.poly([-84, -58, 0, -118, 84, -58]).fill(PALETTE.buildingRoof);
  hall.poly([-84, -58, 0, -118, 84, -58]).stroke({ width: 4, color: PALETTE.outline, alpha: 0.8 });
  group.addChild(hall);

  const units = new Graphics();
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    const ux = Math.cos(angle) * (110 + rand() * 40);
    const uy = Math.sin(angle) * (80 + rand() * 30);
    units.circle(ux, uy, 14).fill(accent);
    units.circle(ux, uy, 14).stroke({ width: 3, color: PALETTE.outline, alpha: 0.8 });
  }
  group.addChild(units);

  return group;
}
