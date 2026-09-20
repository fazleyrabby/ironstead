import { GRID_COLS, GRID_ROWS, TERRITORY } from "../config/world";
import { def, canAfford } from "./selectors";
import type { NavGrid } from "./navgrid";
import type { BuildingType, GameState, PlayerId } from "./types";

export type PlacementReason = "bounds" | "territory" | "occupied" | "cost";
export type PlacementResult = { ok: true } | { ok: false; reason: PlacementReason };

export const PLACEMENT_MESSAGES: Record<PlacementReason, string> = {
  bounds: "Outside the map",
  territory: "Outside your territory",
  occupied: "Blocked by another structure",
  cost: "Not enough resources",
};

export function territoryRows(player: PlayerId): { from: number; to: number } {
  if (player === "player") return { from: TERRITORY.playerStartRow, to: GRID_ROWS - 1 };
  return { from: 0, to: TERRITORY.enemyEndRow };
}

export function isInsideTerritory(player: PlayerId, tileY: number): boolean {
  const rows = territoryRows(player);
  return tileY >= rows.from && tileY <= rows.to;
}

export function canPlace(
  state: GameState,
  nav: NavGrid,
  playerId: PlayerId,
  type: BuildingType,
  tileX: number,
  tileY: number,
): PlacementResult {
  const definition = def(type);
  const maxX = tileX + definition.tilesW - 1;
  const maxY = tileY + definition.tilesH - 1;

  if (tileX < 0 || tileY < 0 || maxX >= GRID_COLS || maxY >= GRID_ROWS) {
    return { ok: false, reason: "bounds" };
  }

  for (let y = tileY; y <= maxY; y += 1) {
    for (let x = tileX; x <= maxX; x += 1) {
      if (!isInsideTerritory(playerId, y)) return { ok: false, reason: "territory" };
      if (nav.isBlocked(x, y)) return { ok: false, reason: "occupied" };
    }
  }

  if (!canAfford(state.players[playerId].resources, definition.cost)) {
    return { ok: false, reason: "cost" };
  }

  return { ok: true };
}
