import { AI } from "../../config/ai";
import { MAP_LAYOUT } from "../../config/map";
import { TILE_SIZE, worldToTile } from "../../config/world";
import { canPlace } from "../placement";
import { def, populationCap, storageCap, unitCount } from "../selectors";
import { nearestFreeTile } from "../pathfinding";
import { isTileVisible } from "../visibility";
import type { Game } from "../Game";
import type { Building, BuildingType, GameState, ResourceType, Unit } from "../types";
import type { UnitType } from "../types";

const SCOUT_OFFSETS = [
  { x: 0, y: 0 },
  { x: 7, y: 3 },
  { x: -7, y: 4 },
  { x: 4, y: -6 },
];

export class AISystem {
  private economyTimer = 0;
  private militaryTimer = 0;
  private buildCooldown = 0;
  private attacking = false;
  private gathering = false;
  private lastScout = 0;

  update(game: Game, dt: number): void {
    const state = game.state;
    if (state.status !== "playing") return;

    const townCenter = state.players.enemy.buildings.find(
      (building) => building.type === "town_center" && building.state !== "destroyed",
    );
    if (!townCenter) return;

    this.economyTimer += dt;
    if (this.economyTimer >= AI.thinkEconomy) {
      this.economyTimer = 0;
      this.runEconomy(game);
    }

    this.militaryTimer += dt;
    if (this.militaryTimer >= AI.thinkMilitary) {
      this.militaryTimer = 0;
      this.runMilitary(game, townCenter);
    }

    if (this.buildCooldown > 0) this.buildCooldown -= dt;
  }

  private runEconomy(game: Game): void {
    const state = game.state;
    const enemy = state.players.enemy;
    const used = unitCount(enemy);
    const cap = populationCap(enemy);

    const villagers = enemy.units.filter(
      (unit) => unit.type === "villager" && unit.state !== "dead",
    );

    const townCenter = enemy.buildings.find(
      (building) => building.type === "town_center" && building.state === "complete",
    );
    if (
      townCenter &&
      villagers.length < AI.maxVillagers &&
      townCenter.queue.length < 2 &&
      enemy.resources.food >= 50 &&
      used < cap
    ) {
      game.execute({
        type: "TRAIN_UNIT",
        faction: "enemy",
        buildingId: townCenter.id,
        unitType: "villager",
      });
    }

    this.assignWorkers(game);

    if (this.buildCooldown <= 0) {
      this.build(game);
    }

    const camp = enemy.buildings.find(
      (building) => building.type === "army_camp" && building.state === "complete",
    );
    const militaryCount = enemy.units.filter(
      (unit) => unit.type !== "villager" && unit.state !== "dead",
    ).length;
    if (camp && camp.queue.length < 3 && used < cap && militaryCount < AI.maxArmy) {
      const pick = this.pickTrainType(enemy);
      if (pick) {
        game.execute({ type: "TRAIN_UNIT", faction: "enemy", buildingId: camp.id, unitType: pick });
      }
    }
  }

  private assignWorkers(game: Game): void {
    const state = game.state;
    const enemy = state.players.enemy;
    const idle = enemy.units.filter(
      (unit) => unit.type === "villager" && unit.state !== "dead" && unit.state === "idle" && !unit.assignedBuildingId,
    );
    if (idle.length === 0) return;

    const desired: Record<ResourceType, number> = { ...AI.workerTargets };
    if (enemy.resources.food < AI.lowStockpile) desired.food += 1;
    if (enemy.resources.wood < AI.lowStockpile) desired.wood += 1;
    if (enemy.resources.gold < AI.lowStockpile) desired.gold += 1;

    const assigned: Record<ResourceType, number> = { food: 0, wood: 0, gold: 0 };
    const producers: Building[] = [];
    for (const building of enemy.buildings) {
      const resource = def(building.type).production?.resource;
      if (!resource || building.state !== "complete") continue;
      producers.push(building);
      for (const unit of enemy.units) {
        if (unit.assignedBuildingId === building.id && unit.state !== "dead") {
          assigned[resource] += 1;
        }
      }
    }

    for (const villager of idle) {
      let best: Building | undefined;
      let bestDeficit = 0;
      for (const building of producers) {
        const resource = def(building.type).production?.resource;
        if (!resource) continue;
        const deficit = desired[resource] - assigned[resource];
        if (deficit <= bestDeficit) continue;
        if (this.freeSlots(state, building) <= 0) continue;
        bestDeficit = deficit;
        best = building;
      }
      if (!best) return;
      const resource = def(best.type).production?.resource;
      if (resource) assigned[resource] += 1;
      game.execute({
        type: "ASSIGN_WORKERS",
        faction: "enemy",
        unitIds: [villager.id],
        buildingId: best.id,
      });
    }
  }

  private freeSlots(state: GameState, building: Building): number {
    const max = def(building.type).maxWorkers ?? 0;
    if (max <= 0) return 0;
    let assigned = 0;
    for (const unit of state.players[building.owner].units) {
      if (unit.type === "villager" && unit.state !== "dead" && unit.assignedBuildingId === building.id) {
        assigned += 1;
      }
    }
    return Math.max(0, max - assigned);
  }

  private build(game: Game): void {
    const state = game.state;
    const enemy = state.players.enemy;
    const res = enemy.resources;
    const used = unitCount(enemy);
    const cap = populationCap(enemy);
    const time = state.time;

    const count = (type: BuildingType): number =>
      enemy.buildings.filter((building) => building.type === type && building.state !== "destroyed")
        .length;

    const maxRes = Math.max(res.food, res.wood, res.gold);

    if (count("army_camp") === 0 && time > AI.campBuildTime && res.wood >= 170) {
      if (this.tryBuild(game, "army_camp")) return;
    }
    if (count("house") < AI.maxHouses && cap - used <= 4 && res.wood >= 60) {
      if (this.tryBuild(game, "house")) return;
    }
    if (count("storage") < AI.maxStorages && maxRes > storageCap(enemy) - 150 && res.wood >= 120) {
      if (this.tryBuild(game, "storage")) return;
    }
    if (count("farm") < 2 && time > 90 && res.wood >= 95) {
      if (this.tryBuild(game, "farm")) return;
    }
    if (count("tower") < 2 && time > 200 && res.wood >= 170) {
      if (this.tryBuild(game, "tower")) return;
    }
    if (count("farm") < 3 && time > 240 && res.wood >= 95) {
      if (this.tryBuild(game, "farm")) return;
    }
    if (count("farm") < 4 && time > 420 && res.wood >= 95) {
      if (this.tryBuild(game, "farm")) return;
    }
  }

  private tryBuild(game: Game, type: BuildingType): boolean {
    const site = this.findSite(game, type);
    if (!site) {
      this.buildCooldown = 2;
      return false;
    }
    game.execute({ type: "PLACE_BUILDING", faction: "enemy", buildingType: type, tileX: site.x, tileY: site.y });
    this.buildCooldown = AI.buildCooldown;
    return true;
  }

  private findSite(game: Game, type: BuildingType): { x: number; y: number } | undefined {
    const state = game.state;
    const townCenter = state.players.enemy.buildings.find(
      (building) => building.type === "town_center" && building.state !== "destroyed",
    );
    if (!townCenter) return undefined;

    const definition = def(type);
    const cx = townCenter.tileX + 2;
    const cy = townCenter.tileY + 2;

    const candidates: Array<{ x: number; y: number }> = [{ x: cx, y: cy }];
    for (let radius = 1; radius <= 16; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          candidates.push({ x: cx + dx, y: cy + dy });
        }
      }
    }

    for (const candidate of candidates) {
      if (!canPlace(state, game.nav, "enemy", type, candidate.x, candidate.y).ok) continue;
      if (this.connected(game, townCenter, candidate.x, candidate.y, definition.tilesW, definition.tilesH)) {
        return candidate;
      }
    }
    return undefined;
  }

  private connected(
    game: Game,
    townCenter: Building,
    tileX: number,
    tileY: number,
    w: number,
    h: number,
  ): boolean {
    const nav = game.nav;
    const goalX = townCenter.tileX + 2;
    const goalY = townCenter.tileY + 2;
    const startX = tileX + Math.floor(w / 2);
    const startY = tileY + Math.floor(h / 2);

    const visited = new Uint8Array(nav.cols * nav.rows);
    const queue: number[] = [startY * nav.cols + startX];
    visited[startY * nav.cols + startX] = 1;
    let visits = 0;

    while (queue.length > 0 && visits < 4000) {
      const current = queue.pop() as number;
      visits += 1;
      const cx = current % nav.cols;
      const cy = Math.floor(current / nav.cols);
      if (Math.max(Math.abs(cx - goalX), Math.abs(cy - goalY)) <= 5) return true;

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ];
      for (const [nx, ny] of neighbors) {
        if (!nav.inBounds(nx, ny)) continue;
        const index = ny * nav.cols + nx;
        if (visited[index] === 1 || nav.isBlocked(nx, ny)) continue;
        visited[index] = 1;
        queue.push(index);
      }
    }
    return false;
  }

  private pickTrainType(enemy: { units: Unit[] }): UnitType | undefined {
    const counts = new Map<UnitType, number>();
    for (const unit of enemy.units) {
      if (unit.type === "villager" || unit.state === "dead") continue;
      counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
    }

    let best: UnitType | undefined;
    let bestScore = Infinity;
    for (const entry of AI.trainMix) {
      const score = (counts.get(entry.type) ?? 0) / entry.weight;
      if (score < bestScore) {
        bestScore = score;
        best = entry.type;
      }
    }
    return best;
  }

  private rallyPoint(game: Game, townCenter: Building): { x: number; y: number } {
    const goalTile = { x: townCenter.tileX + 2, y: townCenter.tileY + 8 };
    const free = nearestFreeTile(game.nav, goalTile.x, goalTile.y, 14);
    const tile = free ?? goalTile;
    return { x: (tile.x + 0.5) * TILE_SIZE, y: (tile.y + 0.5) * TILE_SIZE };
  }

  private runMilitary(game: Game, townCenter: Building): void {
    const state = game.state;
    const enemy = state.players.enemy;
    const visibility = game.visibility.enemy;

    const military = enemy.units.filter(
      (unit) => unit.type !== "villager" && unit.state !== "dead",
    );

    const invaders = state.players.player.units.filter((unit) => {
      if (unit.state === "dead") return false;
      if (Math.hypot(unit.x - townCenter.x, unit.y - townCenter.y) > AI.defenseRadius) return false;
      const tile = worldToTile(unit.x, unit.y);
      return isTileVisible(visibility, tile.x, tile.y);
    });

    if (invaders.length > 0) {
      for (const soldier of military) {
        let best = invaders[0];
        let bestDist = Infinity;
        for (const invader of invaders) {
          const dist = Math.hypot(invader.x - soldier.x, invader.y - soldier.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = invader;
          }
        }
        if (soldier.targetId !== best.id || soldier.targetKind !== "unit") {
          game.execute({
            type: "ATTACK_TARGET",
            faction: "enemy",
            unitIds: [soldier.id],
            targetKind: "unit",
            targetId: best.id,
          });
        }
      }
      return;
    }

    if (this.attacking) {
      if (military.length < AI.regroupBelow) {
        this.attacking = false;
        this.gathering = false;
        return;
      }

      if (this.gathering) {
        const rally = this.rallyPoint(game, townCenter);
        const grouped = military.filter(
          (soldier) => Math.hypot(soldier.x - rally.x, soldier.y - rally.y) < TILE_SIZE * 4,
        ).length;
        const movers = military
          .filter((soldier) => Math.hypot(soldier.x - rally.x, soldier.y - rally.y) >= TILE_SIZE * 4)
          .map((soldier) => soldier.id);
        if (movers.length > 0) {
          game.execute({
            type: "MOVE_UNITS",
            faction: "enemy",
            unitIds: movers,
            x: rally.x,
            y: rally.y,
          });
        }
        if (grouped >= Math.max(AI.minAttackGroup, military.length * 0.75)) {
          this.gathering = false;
        }
        return;
      }

      const playerTc = state.players.player.buildings.find(
        (building) => building.type === "town_center" && building.state !== "destroyed",
      );
      if (!playerTc) return;

      let cx = 0;
      let cy = 0;
      for (const soldier of military) {
        cx += soldier.x;
        cy += soldier.y;
      }
      cx /= military.length;
      cy /= military.length;

      let threat: Unit | undefined;
      let threatDist: number = AI.engageRadius;
      for (const unit of state.players.player.units) {
        if (unit.state === "dead") continue;
        const dist = Math.hypot(unit.x - cx, unit.y - cy);
        if (dist >= threatDist) continue;
        const tile = worldToTile(unit.x, unit.y);
        if (!isTileVisible(visibility, tile.x, tile.y)) continue;
        threatDist = dist;
        threat = unit;
      }

      if (threat) {
        const ids = military
          .filter((soldier) => soldier.targetId !== threat.id || soldier.targetKind !== "unit")
          .map((soldier) => soldier.id);
        if (ids.length > 0) {
          game.execute({
            type: "ATTACK_TARGET",
            faction: "enemy",
            unitIds: ids,
            targetKind: "unit",
            targetId: threat.id,
          });
        }
      } else {
        const ids = military
          .filter((soldier) => soldier.targetId !== playerTc.id)
          .map((soldier) => soldier.id);
        if (ids.length > 0) {
          game.execute({
            type: "ATTACK_TARGET",
            faction: "enemy",
            unitIds: ids,
            targetKind: "building",
            targetId: playerTc.id,
          });
        }
      }
      return;
    }

    const idle = military.filter((soldier) => soldier.state === "idle" && !soldier.targetId);

    const rally = this.rallyPoint(game, townCenter);
    const strays = idle.filter(
      (soldier) => Math.hypot(soldier.x - rally.x, soldier.y - rally.y) > AI.rallyLeash * TILE_SIZE,
    );
    if (strays.length > 0) {
      game.execute({
        type: "MOVE_UNITS",
        faction: "enemy",
        unitIds: strays.map((soldier) => soldier.id),
        x: rally.x,
        y: rally.y,
      });
    }

    const ready =
      idle.length >= AI.minAttackGroup &&
      (state.time > AI.firstAttackTime ||
        (idle.length >= AI.preferredAttackGroup && state.time > AI.earlyAttackTime));
    if (ready) {
      this.attacking = true;
      this.gathering = true;
      game.execute({
        type: "MOVE_UNITS",
        faction: "enemy",
        unitIds: idle.map((soldier) => soldier.id),
        x: rally.x,
        y: rally.y,
      });
      return;
    }

    if (state.time > AI.scoutStartTime && state.time - this.lastScout > AI.scoutInterval) {
      const scout =
        military.find((soldier) => soldier.type === "horse_rider" && soldier.state === "idle") ??
        military.find((soldier) => soldier.type !== "hero" && soldier.state === "idle");
      if (scout) {
        this.lastScout = state.time;
        const offset = SCOUT_OFFSETS[Math.floor(state.time / AI.scoutInterval) % SCOUT_OFFSETS.length];
        const base = MAP_LAYOUT.player.baseTile;
        game.execute({
          type: "MOVE_UNITS",
          faction: "enemy",
          unitIds: [scout.id],
          x: (base.x + offset.x) * TILE_SIZE,
          y: (base.y + offset.y) * TILE_SIZE,
        });
      }
    }
  }
}
