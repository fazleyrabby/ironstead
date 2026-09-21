import { assignedWorkers, productionRate, productionResource, storageCap } from "../selectors";
import type { GameState } from "../types";

export class EconomySystem {
  update(state: GameState, dt: number): void {
    for (const player of [state.players.player, state.players.enemy]) {
      const cap = storageCap(player);
      for (const building of player.buildings) {
        const resource = productionResource(building);
        if (!resource) continue;
        const active = assignedWorkers(state, building).length;
        const rate = productionRate(building, active);
        if (rate <= 0) continue;
        player.resources[resource] = Math.min(cap, player.resources[resource] + rate * dt);
      }
    }
  }
}
