import type { EventBus } from "../../core/EventBus";
import { def } from "../selectors";
import type { Building, GameState } from "../types";

export class ConstructionSystem {
  private readonly events: EventBus;

  constructor(events: EventBus) {
    this.events = events;
  }

  update(state: GameState, dt: number): void {
    for (const player of [state.players.player, state.players.enemy]) {
      for (const building of player.buildings) {
        if (building.state !== "constructing") continue;

        const buildTime = def(building.type).buildTime;
        if (buildTime <= 0) {
          this.complete(building);
          continue;
        }

        building.buildProgress = Math.min(1, building.buildProgress + dt / buildTime);
        if (building.buildProgress >= 1) {
          this.complete(building);
        }
      }
    }
  }

  private complete(building: Building): void {
    building.state = "complete";
    building.buildProgress = 1;
    building.hp = building.maxHp;
    this.events.emit("building:completed", building);
  }
}
