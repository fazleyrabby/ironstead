import { worldToTile } from "../../config/world";
import type { EventBus } from "../../core/EventBus";
import { damageBuilding, damageUnit } from "../damage";
import { def, unitDef } from "../selectors";
import { findPath, nearestFreeTile, tileToWorldCenter } from "../pathfinding";
import type { NavGrid } from "../navgrid";
import { isTileVisible } from "../visibility";
import type { VisibilityMap } from "../visibility";
import type { Building, GameState, PlayerId, Unit } from "../types";

const AGGRO_RANGE = 220;
const REPATH_INTERVAL = 0.4;
const PROJECTILE_SPEED = 430;

type Target = { kind: "unit"; unit: Unit } | { kind: "building"; building: Building };

export class CombatSystem {
  private readonly events: EventBus;
  private readonly nav: NavGrid;

  constructor(events: EventBus, nav: NavGrid) {
    this.events = events;
    this.nav = nav;
  }

  orderAttack(
    units: Unit[],
    targetKind: "unit" | "building",
    targetId: string,
  ): void {
    for (const unit of units) {
      unit.assignedBuildingId = undefined;
      unit.targetKind = targetKind;
      unit.targetId = targetId;
      unit.attackTimer = 0;
      unit.repathTimer = 0;
      unit.path = [];
      unit.state = "moving";
    }
  }

  update(state: GameState, visibility: Record<PlayerId, VisibilityMap>, dt: number): void {
    this.updateUnits(state, visibility, dt);
    this.updateTowers(state, visibility, dt);
  }

  private updateUnits(
    state: GameState,
    visibility: Record<PlayerId, VisibilityMap>,
    dt: number,
  ): void {
    for (const id of ["player", "enemy"] as const) {
      const foe: PlayerId = id === "player" ? "enemy" : "player";
      for (const unit of state.players[id].units) {
        if (unit.state === "dead") continue;

        if (unit.targetId && !this.resolveTarget(state, id, unit)) {
          unit.targetId = undefined;
          unit.targetKind = undefined;
          unit.path = [];
          if (unit.state === "attacking" || unit.state === "moving") unit.state = "idle";
        }

        if (!unit.targetId && unitDef(unit.type).aggressive && unit.state === "idle") {
          const enemy = this.nearestEnemyUnit(
            state,
            foe,
            visibility[id],
            unit.x,
            unit.y,
            AGGRO_RANGE,
          );
          if (enemy) {
            unit.targetKind = "unit";
            unit.targetId = enemy.id;
            unit.attackTimer = 0;
            unit.repathTimer = 0;
          }
        }

        if (!unit.targetId) continue;

        const target = this.resolveTarget(state, id, unit);
        if (!target) continue;

        const definition = unitDef(unit.type);
        const dist = this.distanceToTarget(unit, target);

        if (dist <= definition.range) {
          unit.state = "attacking";
          unit.path = [];
          unit.attackTimer -= dt;
          if (unit.attackTimer <= 0) {
            unit.attackTimer = definition.attackCooldown;
            this.strike(state, unit, target);
          }
        } else {
          unit.state = "moving";
          unit.repathTimer -= dt;
          if (unit.repathTimer <= 0 || unit.path.length === 0) {
            unit.repathTimer = REPATH_INTERVAL;
            unit.path = this.pathToTarget(unit, target);
          }
        }
      }
    }
  }

  private updateTowers(
    state: GameState,
    visibility: Record<PlayerId, VisibilityMap>,
    dt: number,
  ): void {
    for (const id of ["player", "enemy"] as const) {
      const foe: PlayerId = id === "player" ? "enemy" : "player";
      for (const building of state.players[id].buildings) {
        const attack = def(building.type).attack;
        if (!attack || building.state !== "complete") continue;

        building.cooldown -= dt;
        if (building.cooldown > 0) continue;

        const enemy = this.nearestEnemyUnit(
          state,
          foe,
          visibility[id],
          building.x,
          building.y,
          attack.range,
        );
        if (!enemy) continue;

        building.cooldown = attack.cooldown;
        state.projectiles.push({
          id: `p${state.nextId++}`,
          owner: id,
          x: building.x,
          y: building.y - building.height / 2,
          speed: PROJECTILE_SPEED,
          damage: attack.damage,
          targetKind: "unit",
          targetId: enemy.id,
        });
      }
    }
  }

  private strike(state: GameState, attacker: Unit, target: Target): void {
    const definition = unitDef(attacker.type);
    let damage = definition.damage;
    if (target.kind === "unit" && definition.counters?.includes(target.unit.type)) {
      damage *= 1.5;
    }

    if (definition.ranged) {
      state.projectiles.push({
        id: `p${state.nextId++}`,
        owner: attacker.owner,
        x: attacker.x,
        y: attacker.y,
        speed: PROJECTILE_SPEED,
        damage,
        targetKind: target.kind,
        targetId: target.kind === "unit" ? target.unit.id : target.building.id,
      });
      return;
    }

    if (target.kind === "unit") {
      damageUnit(state, this.events, target.unit, damage);
    } else {
      damageBuilding(state, this.events, this.nav, target.building, damage);
    }
  }

  private resolveTarget(state: GameState, owner: PlayerId, unit: Unit): Target | undefined {
    if (!unit.targetId || !unit.targetKind) return undefined;
    const foe: PlayerId = owner === "player" ? "enemy" : "player";

    if (unit.targetKind === "unit") {
      const target = state.players[foe].units.find((entry) => entry.id === unit.targetId);
      if (!target || target.state === "dead") return undefined;
      return { kind: "unit", unit: target };
    }

    const target = state.players[foe].buildings.find((entry) => entry.id === unit.targetId);
    if (!target || target.state === "destroyed") return undefined;
    return { kind: "building", building: target };
  }

  private nearestEnemyUnit(
    state: GameState,
    foe: PlayerId,
    seenBy: VisibilityMap,
    x: number,
    y: number,
    range: number,
  ): Unit | undefined {
    let best: Unit | undefined;
    let bestDist = range;
    for (const unit of state.players[foe].units) {
      if (unit.state === "dead") continue;
      const dist = Math.hypot(unit.x - x, unit.y - y);
      if (dist >= bestDist) continue;
      const tile = worldToTile(unit.x, unit.y);
      if (!isTileVisible(seenBy, tile.x, tile.y)) continue;
      bestDist = dist;
      best = unit;
    }
    return best;
  }

  private distanceToTarget(unit: Unit, target: Target): number {
    if (target.kind === "unit") {
      return Math.hypot(target.unit.x - unit.x, target.unit.y - unit.y) - unitDef(target.unit.type).radius;
    }
    const building = target.building;
    const dx = Math.max(Math.abs(unit.x - building.x) - building.width / 2, 0);
    const dy = Math.max(Math.abs(unit.y - building.y) - building.height / 2, 0);
    return Math.hypot(dx, dy);
  }

  private pathToTarget(unit: Unit, target: Target): Array<{ x: number; y: number }> {
    const start = worldToTile(unit.x, unit.y);
    const goalTile =
      target.kind === "unit"
        ? worldToTile(target.unit.x, target.unit.y)
        : worldToTile(target.building.x, target.building.y);

    const goal = this.nav.isBlocked(goalTile.x, goalTile.y)
      ? nearestFreeTile(this.nav, goalTile.x, goalTile.y, 10)
      : goalTile;
    if (!goal) return [];

    return findPath(this.nav, start, goal).map((tile) => tileToWorldCenter(tile.x, tile.y));
  }
}
