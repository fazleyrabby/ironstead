import { describe, expect, it } from "vitest";
import { EventBus } from "../core/EventBus";
import { Game } from "./Game";

const DT = 1 / 30; // fixed simulation step

/**
 * Full-game soak: both factions are driven by the AI so a whole match plays out
 * headlessly. Guards against crashes, non-finite state, runaway entity counts,
 * and "nothing actually happened" regressions.
 */
describe("full-game soak (AI vs AI)", () => {
  it("plays a complete match and keeps state finite", () => {
    const game = new Game(new EventBus());
    game.autoPlay = true;

    const maxSteps = 30 * 60 * 20; // cap at 20 simulated minutes
    let steps = 0;
    while (game.state.status === "playing" && steps < maxSteps) {
      game.update(DT);
      steps += 1;
    }

    const { player, enemy } = game.state.players;
    const allUnits = [...player.units, ...enemy.units];
    expect(allUnits.length).toBeGreaterThan(0);

    for (const unit of allUnits) {
      expect(Number.isFinite(unit.x)).toBe(true);
      expect(Number.isFinite(unit.y)).toBe(true);
      expect(Number.isFinite(unit.hp)).toBe(true);
      expect(unit.hp).toBeLessThanOrEqual(unit.maxHp + 0.001);
    }

    for (const building of [...player.buildings, ...enemy.buildings]) {
      expect(Number.isFinite(building.hp)).toBe(true);
      expect(Number.isFinite(building.x)).toBe(true);
      expect(Number.isFinite(building.y)).toBe(true);
    }

    // A real match must produce units, economy, and at least some combat.
    expect(player.buildings.length).toBeGreaterThan(1);
    expect(enemy.buildings.length).toBeGreaterThan(1);
    const combat = game.state.stats.playerUnitsKilled + game.state.stats.playerUnitsLost;
    expect(combat).toBeGreaterThan(0);

    console.log(
      `\n[soak] status=${game.state.status} time=${Math.round(game.state.time)}s steps=${steps}` +
        ` units=${player.units.length}v${enemy.units.length}` +
        ` killed=${game.state.stats.playerUnitsKilled} lost=${game.state.stats.playerUnitsLost}` +
        ` razed=${game.state.stats.playerBuildingsDestroyed} lostBld=${game.state.stats.playerBuildingsLost}\n`,
    );
  }, 180_000);
});
