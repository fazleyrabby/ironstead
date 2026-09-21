import type { EventBus } from "../../core/EventBus";
import { REPAIR } from "../../config/repair";
import type { Building, GameState } from "../types";

export class RepairSystem {
  private readonly events: EventBus;

  constructor(events: EventBus) {
    this.events = events;
  }

  update(state: GameState, dt: number): void {
    for (const id of ["player", "enemy"] as const) {
      const player = state.players[id];

      for (const unit of player.units) {
        if (unit.type !== "villager" || unit.state !== "repairing" || !unit.repairBuildingId) {
          continue;
        }

        const building = player.buildings.find(
          (entry) => entry.id === unit.repairBuildingId && entry.state !== "destroyed",
        );
        if (!building || building.hp >= building.maxHp) {
          unit.repairBuildingId = undefined;
          if (unit.state === "repairing") unit.state = "idle";
          continue;
        }

        if (this.edgeDistance(unit.x, unit.y, building) > REPAIR.reach) continue;

        const heal = Math.min(REPAIR.rate * dt, building.maxHp - building.hp);
        const woodCost = heal / REPAIR.hpPerWood;
        if (player.resources.wood < woodCost) continue;

        player.resources.wood -= woodCost;
        building.hp = Math.min(building.maxHp, building.hp + heal);

        if (building.hp >= building.maxHp) {
          unit.repairBuildingId = undefined;
          unit.state = "idle";
          this.events.emit("building:repaired", building.id);
        }
      }
    }
  }

  private edgeDistance(x: number, y: number, building: Building): number {
    const dx = Math.max(Math.abs(x - building.x) - building.width / 2, 0);
    const dy = Math.max(Math.abs(y - building.y) - building.height / 2, 0);
    return Math.hypot(dx, dy);
  }
}
