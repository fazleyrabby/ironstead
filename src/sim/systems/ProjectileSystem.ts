import type { EventBus } from "../../core/EventBus";
import { damageBuilding, damageUnit } from "../damage";
import type { NavGrid } from "../navgrid";
import type { Building, GameState, PlayerId, Unit } from "../types";

export class ProjectileSystem {
  private readonly events: EventBus;
  private readonly nav: NavGrid;

  constructor(events: EventBus, nav: NavGrid) {
    this.events = events;
    this.nav = nav;
  }

  update(state: GameState, dt: number): void {
    const alive: typeof state.projectiles = [];

    for (const projectile of state.projectiles) {
      const foe: PlayerId = projectile.owner === "player" ? "enemy" : "player";
      const target = this.resolve(state, foe, projectile.targetKind, projectile.targetId);
      if (!target) continue;

      const dx = target.x - projectile.x;
      const dy = target.y - projectile.y;
      const dist = Math.hypot(dx, dy);
      const step = projectile.speed * dt;

      if (dist <= Math.max(step, 10)) {
        if (target.kind === "unit") {
          damageUnit(state, this.events, target.unit, projectile.damage);
        } else {
          damageBuilding(state, this.events, this.nav, target.building, projectile.damage);
        }
        this.events.emit("projectile:hit", projectile.id);
      } else {
        projectile.x += (dx / dist) * step;
        projectile.y += (dy / dist) * step;
        alive.push(projectile);
      }
    }

    state.projectiles = alive;
  }

  private resolve(
    state: GameState,
    foe: PlayerId,
    kind: "unit" | "building",
    id: string,
  ): { kind: "unit"; unit: Unit; x: number; y: number } | { kind: "building"; building: Building; x: number; y: number } | undefined {
    if (kind === "unit") {
      const unit = state.players[foe].units.find((entry) => entry.id === id);
      if (!unit || unit.state === "dead") return undefined;
      return { kind: "unit", unit, x: unit.x, y: unit.y };
    }
    const building = state.players[foe].buildings.find((entry) => entry.id === id);
    if (!building || building.state === "destroyed") return undefined;
    return { kind: "building", building, x: building.x, y: building.y };
  }
}
