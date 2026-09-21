import { BUILDINGS } from "../config/buildings";
import { UNITS } from "../config/units";
import { TILE_SIZE } from "../config/world";
import type { BuildingDefinition } from "../config/buildings";
import type { UnitDefinition } from "../config/units";
import type {
  Building,
  BuildingType,
  GameState,
  PlayerState,
  ResourceStore,
  ResourceType,
  Unit,
  UnitType,
} from "./types";

export function def(type: BuildingType): BuildingDefinition {
  return BUILDINGS[type];
}

export function unitDef(type: UnitType): UnitDefinition {
  return UNITS[type];
}

export function footprintWorld(definition: BuildingDefinition): { w: number; h: number } {
  return { w: definition.tilesW * TILE_SIZE, h: definition.tilesH * TILE_SIZE };
}

export function centerOfTileRect(
  tileX: number,
  tileY: number,
  definition: BuildingDefinition,
): { x: number; y: number } {
  return {
    x: (tileX + definition.tilesW / 2) * TILE_SIZE,
    y: (tileY + definition.tilesH / 2) * TILE_SIZE,
  };
}

export function populationCap(player: PlayerState): number {
  let cap = 0;
  for (const building of player.buildings) {
    if (building.state !== "complete") continue;
    cap += def(building.type).population;
  }
  return cap;
}

export function storageCap(player: PlayerState): number {
  let cap = 0;
  for (const building of player.buildings) {
    if (building.state !== "complete") continue;
    cap += def(building.type).storage;
  }
  return cap;
}

export function canAfford(resources: ResourceStore, cost: Partial<ResourceStore>): boolean {
  return (
    (cost.food ?? 0) <= resources.food &&
    (cost.wood ?? 0) <= resources.wood &&
    (cost.gold ?? 0) <= resources.gold
  );
}

export function spendCost(resources: ResourceStore, cost: Partial<ResourceStore>): void {
  resources.food -= cost.food ?? 0;
  resources.wood -= cost.wood ?? 0;
  resources.gold -= cost.gold ?? 0;
}

export function productionRate(building: Building, activeWorkers: number): number {
  const definition = def(building.type);
  if (!definition.production || building.state !== "complete") return 0;
  return definition.production.baseRate + definition.production.perWorker * activeWorkers;
}

export function productionResource(building: Building): ResourceType | undefined {
  return def(building.type).production?.resource;
}

export function unitCount(player: PlayerState): number {
  let count = 0;
  for (const unit of player.units) {
    if (unit.state !== "dead") count += 1;
  }
  return count;
}

export function assignedWorkers(state: GameState, building: Building): Unit[] {
  const player = state.players[building.owner];
  const result: Unit[] = [];
  for (const unit of player.units) {
    if (unit.type !== "villager" || unit.state === "dead") continue;
    if (unit.assignedBuildingId !== building.id) continue;
    const dx = unit.x - building.x;
    const dy = unit.y - building.y;
    if (dx * dx + dy * dy > 90 * 90) continue;
    result.push(unit);
  }
  return result;
}

export function freeWorkerSlots(state: GameState, building: Building): number {
  const max = def(building.type).maxWorkers ?? 0;
  if (max <= 0) return 0;
  const player = state.players[building.owner];
  let assigned = 0;
  for (const unit of player.units) {
    if (unit.type === "villager" && unit.state !== "dead" && unit.assignedBuildingId === building.id) {
      assigned += 1;
    }
  }
  return Math.max(0, max - assigned);
}

export function buildingAtTile(player: PlayerState, tileX: number, tileY: number): Building | undefined {
  return player.buildings.find((building) => {
    if (building.state === "destroyed") return false;
    return (
      tileX >= building.tileX &&
      tileX < building.tileX + def(building.type).tilesW &&
      tileY >= building.tileY &&
      tileY < building.tileY + def(building.type).tilesH
    );
  });
}
