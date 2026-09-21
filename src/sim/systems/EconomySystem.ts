import { assignedWorkers, productionRate, productionResource, storageCap } from "../selectors";
import { RESEARCH } from "../../config/research";
import type { GameState } from "../types";

export class EconomySystem {
  update(state: GameState, dt: number): void {
    for (const id of ["player", "enemy"] as const) {
      const player = state.players[id];
      const cap = storageCap(player);
      for (const building of player.buildings) {
        const resource = productionResource(building);
        if (!resource) continue;
        const active = assignedWorkers(state, building).length;
        const line = RESEARCH_LINE_FOR[resource];
        const level = player.research[line] ?? 0;
        const bonus = level > 0 ? RESEARCH[line].tiers[level - 1].bonus : 0;
        const rate = productionRate(building, active) * (1 + bonus);
        if (rate <= 0) continue;
        player.resources[resource] = Math.min(cap, player.resources[resource] + rate * dt);
      }
    }
  }
}

const RESEARCH_LINE_FOR = {
  food: "farming",
  gold: "mining",
  wood: "lumber",
} as const;
