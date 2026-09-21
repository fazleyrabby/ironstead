import { describe, expect, it } from "vitest";
import { EventBus } from "../core/EventBus";
import { Game } from "./Game";
import { spawnUnit } from "./GameState";

const DT = 1 / 30; // fixed simulation step

function snapshot(game: Game) {
  const { player, enemy } = game.state.players;
  return {
    playerUnits: player.units.map((u) => u.id + u.x.toFixed(2) + u.y.toFixed(2) + u.hp.toFixed(3) + u.state),
    enemyUnits: enemy.units.map((u) => u.id + u.x.toFixed(2) + u.y.toFixed(2) + u.hp.toFixed(3) + u.state),
    playerBuildings: player.buildings.length,
    enemyBuildings: enemy.buildings.length,
    stats: game.state.stats,
    status: game.state.status,
    time: Math.floor(game.state.time * 1000),
  };
}

/** Bounded per-side headroom above maxVillagers(9)+maxArmy(24)+hero. */
const ENTITY_CAP = 120;

/**
 * Full-game soak: both factions are driven by the AI so a whole match plays out
 * headlessly. Guards against crashes, non-finite state, runaway entity counts,
 * and "nothing actually happened" regressions.
 */
describe("full-game soak (AI vs AI)", () => {
  it("runs a long match and keeps state finite and bounded", () => {
    const game = new Game(new EventBus(), { seed: 1337 });
    game.autoPlay = true;

    const maxSteps = 30 * 60 * 6; // cap at 6 simulated minutes
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

    // No unbounded growth of entity arrays over a long match.
    expect(player.units.length).toBeLessThan(ENTITY_CAP);
    expect(enemy.units.length).toBeLessThan(ENTITY_CAP);
    expect(player.buildings.length).toBeLessThan(40);
    expect(enemy.buildings.length).toBeLessThan(40);

    console.log(
      `\n[soak] status=${game.state.status} time=${Math.round(game.state.time)}s steps=${steps}` +
        ` units=${player.units.length}v${enemy.units.length}` +
        ` killed=${game.state.stats.playerUnitsKilled} lost=${game.state.stats.playerUnitsLost}` +
        ` razed=${game.state.stats.playerBuildingsDestroyed} lostBld=${game.state.stats.playerBuildingsLost}\n`,
    );
  }, 180_000);

  it("seeded matches are byte-for-byte reproducible", () => {
    const first = new Game(new EventBus(), { seed: 4242 });
    first.autoPlay = true;
    const maxSteps = 30 * 60 * 3; // 3 minutes
    for (let i = 0; i < maxSteps; i += 1) first.update(DT);
    const snapA = snapshot(first);

    const second = new Game(new EventBus(), { seed: 4242 });
    second.autoPlay = true;
    for (let i = 0; i < maxSteps; i += 1) second.update(DT);
    const snapB = snapshot(second);

    expect(snapA).toEqual(snapB);
    expect(snapA.status).toMatch(/victory|defeat|playing/);
  }, 180_000);

  it("reaps dead units and destroyed buildings so arrays stay bounded", () => {
    const game = new Game(new EventBus(), { seed: 1337 });
    const player = game.state.players.player;

    for (let i = 0; i < 200; i += 1) {
      const unit = spawnUnit(game.state, "player", "swordsman", 2000, 1400);
      unit.state = "dead";
      player.units.push(unit);
    }
    const before = player.units.length;
    expect(before).toBeGreaterThan(200);

    for (let i = 0; i < 20; i += 1) game.update(DT); // > 0.5s triggers the sweep

    expect(player.units.length).toBeLessThan(before - 150);
    expect(player.units.every((unit) => unit.state !== "dead")).toBe(true);
  }, 10_000);
});
