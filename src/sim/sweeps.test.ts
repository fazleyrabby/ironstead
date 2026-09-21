import { describe, it } from "vitest";
import { EventBus } from "../core/EventBus";
import { Game } from "./Game";

const DT = 1 / 30;
const MAX_STEPS = 30 * 60 * 8; // 8 simulated minutes cap

interface RunResult {
  seed: number;
  status: Game["state"]["status"];
  time: number;
  playerUnits: number;
  enemyUnits: number;
  playerKilled: number;
  playerLost: number;
  playerRazed: number;
}

/** Headless AI-vs-AI run from a fixed seed. Used to compare an AI tweak
 *  against identical, reproducible matches (sweep `npm run sweep`). */
export function runSeed(seed: number, maxSteps: number = MAX_STEPS): RunResult {
  const game = new Game(new EventBus(), { seed });
  game.autoPlay = true;
  let steps = 0;
  while (game.state.status === "playing" && steps < maxSteps) {
    game.update(DT);
    steps += 1;
  }
  const { player, enemy } = game.state.players;
  const s = game.state.stats;
  return {
    seed,
    status: game.state.status,
    time: Math.round(game.state.time),
    playerUnits: player.units.length,
    enemyUnits: enemy.units.length,
    playerKilled: s.playerUnitsKilled,
    playerLost: s.playerUnitsLost,
    playerRazed: s.playerBuildingsDestroyed,
  };
}

describe("seed sweep (AI vs AI)", () => {
  it("reports outcome for a batch of seeds", () => {
    // Default batch. Override via SEEDS=4242,1337,7 (CLI: SEEDS=1..20 npm run sweep).
    // @ts-expect-error node env is not typed here, but vitest runs under node
    const env: string | undefined = process?.env?.SEEDS;
    let seeds: number[];
    if (env) {
      const parsed: number[] = [];
      for (const part of env.split(",")) {
        const m = part.match(/^(\d+)\.\.(\d+)(?:\.(\d+))?$/);
        if (m) {
          const [s, e, step = 1] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
          for (let v = s; v <= e; v += step) parsed.push(v);
        } else if (part.trim()) {
          parsed.push(Number(part));
        }
      }
      seeds = parsed.length ? parsed : [4242, 1337, 7];
    } else {
      seeds = [4242, 1337, 7];
    }

    let wins = 0;
    const results: RunResult[] = [];
    for (const seed of seeds) {
      const r = runSeed(seed);
      results.push(r);
      if (r.status === "victory") wins += 1;
      console.log(
        `seed=${r.seed} status=${r.status} time=${r.time}s | ` +
          `playerUnits=${r.playerUnits} enemyUnits=${r.enemyUnits} ` +
          `killed=${r.playerKilled} lost=${r.playerLost} razed=${r.playerRazed}`,
      );
    }

    const avgTime = results.reduce((a, r) => a + r.time, 0) / results.length;
    const winRate = wins / results.length;
    console.log(
      `\nSUMMARY seeds=${results.length} winRate=${(winRate * 100).toFixed(0)}% ` +
        `avgTime=${Math.round(avgTime)}s`,
    );
  }, 180_000);
});
