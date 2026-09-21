import { HERO } from "../../config/hero";
import { unitDef } from "../selectors";
import type { EventBus } from "../../core/EventBus";
import type { GameState, PlayerId, Unit } from "../types";

export class HeroSystem {
  private readonly events: EventBus;

  constructor(events: EventBus) {
    this.events = events;
  }

  tryRally(state: GameState, playerId: PlayerId): boolean {
    const player = state.players[playerId];
    const hero = player.units.find((unit) => unit.type === "hero" && unit.state !== "dead");
    if (!hero || hero.abilityCooldown > 0) return false;

    hero.abilityCooldown = HERO.ability.cooldown;
    const radiusSq = HERO.ability.radius * HERO.ability.radius;

    for (const unit of player.units) {
      if (unit.state === "dead" || unit.type === "hero") continue;
      const dx = unit.x - hero.x;
      const dy = unit.y - hero.y;
      if (dx * dx + dy * dy <= radiusSq) {
        unit.rallyTimer = HERO.ability.duration;
      }
    }

    this.events.emit("hero:rally", hero);
    return true;
  }

  upgradeHero(state: GameState, playerId: PlayerId): boolean {
    const player = state.players[playerId];
    const hero = player.units.find((unit) => unit.type === "hero");
    if (!hero) return false;
    const level = hero.heroLevel ?? 1;
    if (level >= HERO.levels.length) return false;

    const cost = HERO.levels[level].upgradeCost;
    if ((cost.food ?? 0) > player.resources.food) return false;
    if ((cost.gold ?? 0) > player.resources.gold) return false;

    player.resources.food -= cost.food ?? 0;
    player.resources.gold -= cost.gold ?? 0;

    hero.heroLevel = level + 1;
    const stats = HERO.levels[hero.heroLevel - 1];
    hero.maxHp = stats.hp;
    hero.hp = stats.hp;

    this.events.emit("hero:upgraded", hero);
    return true;
  }

  update(state: GameState, dt: number): void {
    for (const id of ["player", "enemy"] as const) {
      const player = state.players[id];

      for (const unit of player.units) {
        if (unit.rallyTimer > 0) unit.rallyTimer = Math.max(0, unit.rallyTimer - dt);
      }

      const hero = player.units.find((unit) => unit.type === "hero");
      if (!hero) continue;

      if (hero.abilityCooldown > 0) hero.abilityCooldown = Math.max(0, hero.abilityCooldown - dt);

      if (hero.state === "dead") {
        hero.respawnTimer += dt;
        if (hero.respawnTimer >= HERO.respawn) {
          this.respawn(state, id, hero);
        }
      }
    }
  }

  private respawn(state: GameState, playerId: PlayerId, hero: Unit): void {
    const townCenter = state.players[playerId].buildings.find(
      (building) => building.type === "town_center" && building.state !== "destroyed",
    );
    const point = townCenter
      ? { x: townCenter.x, y: townCenter.y + townCenter.height / 2 + 28 }
      : { x: hero.x, y: hero.y };

    const stats = HERO.levels[(hero.heroLevel ?? 1) - 1];
    hero.state = "idle";
    hero.hp = stats.hp;
    hero.maxHp = stats.hp;
    hero.x = point.x;
    hero.y = point.y;
    hero.path = [];
    hero.targetId = undefined;
    hero.targetKind = undefined;
    hero.assignedBuildingId = undefined;
    hero.respawnTimer = 0;
    this.events.emit("hero:respawned", hero);
  }
}

export function heroDisplayName(unit: Unit): string {
  return HERO.names[unit.owner];
}

export function heroIcon(unit: Unit): string {
  return HERO.icons[unit.owner];
}

export function heroAttack(unit: Unit): number {
  if (unit.type !== "hero") return unitDef(unit.type).damage;
  return HERO.levels[(unit.heroLevel ?? 1) - 1].damage;
}
