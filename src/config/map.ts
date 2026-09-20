import type { BuildingType, PlayerId } from "../sim/types";

export interface BuildingSpawn {
  type: BuildingType;
  tileX: number;
  tileY: number;
}

export interface PlayerLayout {
  baseTile: { x: number; y: number };
  buildings: BuildingSpawn[];
}

export const MAP_LAYOUT: Record<PlayerId, PlayerLayout> = {
  player: {
    baseTile: { x: 38, y: 40 },
    buildings: [
      { type: "town_center", tileX: 36, tileY: 38 },
      { type: "house", tileX: 32, tileY: 40 },
      { type: "farm", tileX: 41, tileY: 37 },
      { type: "storage", tileX: 32, tileY: 36 },
      { type: "forest", tileX: 28, tileY: 42 },
      { type: "gold_vein", tileX: 46, tileY: 42 },
    ],
  },
  enemy: {
    baseTile: { x: 38, y: 10 },
    buildings: [
      { type: "town_center", tileX: 36, tileY: 8 },
      { type: "house", tileX: 32, tileY: 6 },
      { type: "farm", tileX: 41, tileY: 9 },
      { type: "storage", tileX: 32, tileY: 10 },
      { type: "forest", tileX: 28, tileY: 6 },
      { type: "gold_vein", tileX: 46, tileY: 6 },
    ],
  },
};
