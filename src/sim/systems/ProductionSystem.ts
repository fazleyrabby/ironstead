import { worldToTile } from "../../config/world";
import type { EventBus } from "../../core/EventBus";
import { canAfford, def, populationCap, spendCost, unitCount, unitDef } from "../selectors";
import { nearestFreeTile, tileToWorldCenter } from "../pathfinding";
import { spawnUnit } from "../GameState";
import type { MovementSystem } from "./MovementSystem";
import type { NavGrid } from "../navgrid";
import type { GameState, PlayerId, UnitType } from "../types";

export class ProductionSystem {
  private readonly events: EventBus;
  private readonly nav: NavGrid;
  private readonly movement: MovementSystem;

  constructor(events: EventBus, nav: NavGrid, movement: MovementSystem) {
    this.events = events;
    this.nav = nav;
    this.movement = movement;
  }

  enqueue(state: GameState, playerId: PlayerId, buildingId: string, unitType: UnitType): boolean {
    const player = state.players[playerId];
    const building = player.buildings.find((entry) => entry.id === buildingId);
    if (!building || building.state !== "complete") return false;
    if (!def(building.type).produces?.includes(unitType)) return false;

    const cost = unitDef(unitType).cost;
    if (!canAfford(player.resources, cost)) return false;

    spendCost(player.resources, cost);
    building.queue.push({ unitType, progress: 0 });
    this.events.emit("train:queued", { buildingId, unitType });
    return true;
  }

  update(state: GameState, dt: number): void {
    for (const id of ["player", "enemy"] as const) {
      const player = state.players[id];
      const cap = populationCap(player);
      const used = unitCount(player);

      for (const building of player.buildings) {
        if (building.state !== "complete" || building.queue.length === 0) continue;
        if (used >= cap) continue;

        const order = building.queue[0];
        order.progress += dt / unitDef(order.unitType).productionTime;

        if (order.progress >= 1) {
          if (this.trySpawn(state, id, building.id, order.unitType)) {
            building.queue.shift();
            this.events.emit("resource:changed", id);
          } else {
            order.progress = 1;
          }
        }
      }
    }
  }

  private trySpawn(
    state: GameState,
    playerId: PlayerId,
    buildingId: string,
    unitType: UnitType,
  ): boolean {
    const player = state.players[playerId];
    const building = player.buildings.find((entry) => entry.id === buildingId);
    if (!building) return false;

    const centerTile = worldToTile(building.x, building.y);
    const free = nearestFreeTile(this.nav, centerTile.x, centerTile.y, 12);
    if (!free) return false;

    const base = tileToWorldCenter(free.x, free.y);
    const count = player.units.length;
    const angle = count * 2.39996;
    const ring = 26 + (count % 3) * 12;
    let px = base.x + Math.cos(angle) * ring;
    let py = base.y + Math.sin(angle) * ring;
    const offsetTile = worldToTile(px, py);
    if (this.nav.isBlocked(offsetTile.x, offsetTile.y)) {
      px = base.x;
      py = base.y;
    }

    const unit = spawnUnit(state, playerId, unitType, px, py);
    player.units.push(unit);
    if (building.rallyX !== undefined && building.rallyY !== undefined) {
      this.movement.orderMove([unit], building.rallyX, building.rallyY);
    }
    this.events.emit("unit:created", unit);
    return true;
  }
}
