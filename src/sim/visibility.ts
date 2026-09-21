import { TILE_SIZE } from "../config/world";
import { def, unitDef } from "./selectors";
import type { GameState, PlayerId } from "./types";

export interface VisibilityMap {
  cols: number;
  rows: number;
  visible: Uint8Array;
  explored: Uint8Array;
  version: number;
}

export function createVisibility(cols: number, rows: number): VisibilityMap {
  return {
    cols,
    rows,
    visible: new Uint8Array(cols * rows),
    explored: new Uint8Array(cols * rows),
    version: 0,
  };
}

export function isTileVisible(map: VisibilityMap, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= map.cols || tileY >= map.rows) return false;
  return map.visible[tileY * map.cols + tileX] === 1;
}

export function isTileExplored(map: VisibilityMap, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= map.cols || tileY >= map.rows) return false;
  return map.explored[tileY * map.cols + tileX] === 1;
}

export function updateVisibility(
  state: GameState,
  maps: Record<PlayerId, VisibilityMap>,
): void {
  for (const id of ["player", "enemy"] as const) {
    const map = maps[id];
    map.visible.fill(0);

    for (const unit of state.players[id].units) {
      if (unit.state === "dead") continue;
      stampCircle(map, unit.x, unit.y, unitDef(unit.type).sight);
    }

    for (const building of state.players[id].buildings) {
      if (building.state !== "complete") continue;
      stampCircle(map, building.x, building.y, def(building.type).sight);
    }

    for (let i = 0; i < map.visible.length; i += 1) {
      if (map.visible[i] === 1) map.explored[i] = 1;
    }
    map.version += 1;
  }
}

function stampCircle(map: VisibilityMap, worldX: number, worldY: number, radius: number): void {
  if (radius <= 0) return;
  const cx = Math.floor(worldX / TILE_SIZE);
  const cy = Math.floor(worldY / TILE_SIZE);
  const r = Math.ceil(radius);

  for (let dy = -r; dy <= r; dy += 1) {
    const y = cy + dy;
    if (y < 0 || y >= map.rows) continue;
    const extent = Math.floor(Math.sqrt(Math.max(r * r - dy * dy, 0)));
    const fromX = Math.max(cx - extent, 0);
    const toX = Math.min(cx + extent, map.cols - 1);
    for (let x = fromX; x <= toX; x += 1) {
      map.visible[y * map.cols + x] = 1;
    }
  }
}
