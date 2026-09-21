import { describe, it } from "vitest";
import { EventBus } from "../core/EventBus";
import { Game } from "./Game";

const DT = 1 / 30;
const SWEEP_HORIZON_S = 180; // A/B signal horizon: long enough to see first blood
const DEFAULT_SWEEP_HORIZON_S = SWEEP_HORIZON_S;

interface StatsAt {
  killed: number;
  lost: number;
  razed: number;
  playerUnits: number;
  enemyUnits: number;
  time: number;
}

interface RunResult {
  seed: number;
  status: Game["state"]["status"];
  time: number;
  /** sim seconds when the first unit/building dies; -1 if none within horizon. */
  firstBloodS: number;
  /** snapshot at t >= horizon (the A/B comparison window). */
  atHorizon: StatsAt | null;
  atEnd: StatsAt;
}

/** Headless AI-vs-AI run from a fixed seed.
 *  `opts.horizonS` caps how long to simulate (defaults to full match) — use the
 *  horizon window (e.g. 180s) for fast A/B discrimination between two AI
 *  versions on identical, reproducible matches. */
export function runSeed(seed: number, opts: { horizonS?: number } = {}): RunResult {
  const game = new Game(new EventBus(), { seed });
  game.autoPlay = true;
  const horizonS = opts.horizonS ?? DEFAULT_SWEEP_HORIZON_S;
  const horizonSteps = Math.floor(horizonS / DT);
  const snapshot = (): StatsAt => {
    const { player, enemy } = game.state.players;
    const s = game.state.stats;
    return {
      killed: s.playerUnitsKilled,
      lost: s.playerUnitsLost,
      razed: s.playerBuildingsDestroyed,
      playerUnits: player.units.length,
      enemyUnits: enemy.units.length,
      time: Math.round(game.state.time),
    };
  };
    let firstBloodS = -1;
    let atHorizon: StatsAt | null = null;
    let steps = 0;
    while (game.state.status === "playing" && steps < horizonSteps) {
      game.update(DT);
      steps += 1;
      const s = game.state.stats;
      const combat = s.playerUnitsKilled + s.playerUnitsLost + s.playerBuildingsDestroyed + s.playerBuildingsLost;
      if (firstBloodS < 0 && combat > 0) firstBloodS = Math.round(game.state.time);
      if (!atHorizon && game.state.time >= horizonS - DT) atHorizon = snapshot();
    }
    if (!atHorizon && game.state.status !== "playing") atHorizon = snapshot(); // ended before horizon
    return { seed, status: game.state.status, time: Math.round(game.state.time), firstBloodS, atHorizon, atEnd: snapshot() };
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

    const results: RunResult[] = [];
    for (const seed of seeds) {
      const r = runSeed(seed, { horizonS: SWEEP_HORIZON_S });
      results.push(r);
      const a = r.atHorizon;
      const aStr = a
        ? `atHorizon(t=${a.time}s k=${a.killed} l=${a.lost} r=${a.razed} pv=${a.playerUnits} ev=${a.enemyUnits})`
        : "ended<before horizon";
      console.log(
        `seed=${r.seed} status=${r.status} firstBlood=${r.firstBloodS}s ${aStr} ` +
          `end(time=${r.atEnd.time}s k=${r.atEnd.killed} l=${r.atEnd.lost} r=${r.atEnd.razed})`,
      );
    }

    const avgTime = results.reduce((a, r) => a + r.time, 0) / results.length;
    const firstBloodAvg =
      results.reduce((a, r) => a + Math.max(0, r.firstBloodS), 0) / results.length;
    console.log(
      `\nSUMMARY seeds=${results.length} avgTime=${Math.round(avgTime)}s ` +
        `avgFirstBlood=${Math.round(firstBloodAvg)}s`,
    );
  }, 180_000);
});

