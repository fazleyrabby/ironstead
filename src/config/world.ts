export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1600;

export const TILE_SIZE = 32;
export const GRID_COLS = Math.floor(WORLD_WIDTH / TILE_SIZE);
export const GRID_ROWS = Math.floor(WORLD_HEIGHT / TILE_SIZE);

export const PLAYER_START = { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.8 };
export const ENEMY_START = { x: WORLD_WIDTH * 0.5, y: WORLD_HEIGHT * 0.2 };

export const PALETTE = {
  void: 0x0b0b14,
  ground: 0x6f9a4e,
  groundAlt: 0x7aa955,
  groundPatch: 0x638b45,
  playerTint: 0x3b82f6,
  enemyTint: 0xef4444,
  tree: 0x2f5d34,
  treeCanopy: 0x3f7a44,
  rock: 0x8b8f9a,
  path: 0x9a8f6f,
  grid: 0x000000,
  playerUnit: 0x60a5fa,
  enemyUnit: 0xf87171,
  building: 0xe8d8b0,
  buildingRoof: 0xb5533f,
  outline: 0x1a1a24,
} as const;

export const CAMERA = {
  minZoom: 0.4,
  maxZoom: 2.5,
  panSpeed: 900,
} as const;
