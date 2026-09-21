import type { EventBus } from "../core/EventBus";
import { PONDS } from "../config/map";
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from "../config/world";
import type { Command } from "./commands";
import { canPlace } from "./placement";
import { def, freeWorkerSlots, spendCost } from "./selectors";
import { createInitialState, spawnBuilding, spawnUnit } from "./GameState";
import { NavGrid } from "./navgrid";
import { nearestFreeTile, tileToWorldCenter } from "./pathfinding";
import { createVisibility, updateVisibility } from "./visibility";
import type { VisibilityMap } from "./visibility";
import { ConstructionSystem } from "./systems/ConstructionSystem";
import { AISystem } from "./systems/AISystem";
import { CombatSystem } from "./systems/CombatSystem";
import { EconomySystem } from "./systems/EconomySystem";
import { HeroSystem } from "./systems/HeroSystem";
import { MovementSystem } from "./systems/MovementSystem";
import { ProductionSystem } from "./systems/ProductionSystem";
import { ProjectileSystem } from "./systems/ProjectileSystem";
import { HERO } from "../config/hero";
import type { Building, BuildingType, GameState, PlayerId, Unit } from "./types";

const STARTING_VILLAGERS = 4;
const VISIBILITY_INTERVAL = 0.2;

export class Game {
  readonly state: GameState;
  readonly nav: NavGrid;
  readonly events: EventBus;
  readonly visibility: Record<PlayerId, VisibilityMap>;
  readonly movement: MovementSystem;
  readonly production: ProductionSystem;
  readonly combat: CombatSystem;
  readonly hero: HeroSystem;

  private readonly economy = new EconomySystem();
  private readonly construction: ConstructionSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly ai = new AISystem();
  private readonly queue: Command[] = [];
  private visibilityTimer = 0;

  constructor(events: EventBus) {
    this.events = events;
    this.state = createInitialState();
    this.nav = new NavGrid(GRID_COLS, GRID_ROWS);
    this.visibility = {
      player: createVisibility(GRID_COLS, GRID_ROWS),
      enemy: createVisibility(GRID_COLS, GRID_ROWS),
    };
    this.construction = new ConstructionSystem(events);
    this.movement = new MovementSystem(this.nav);
    this.production = new ProductionSystem(events, this.nav);
    this.combat = new CombatSystem(events, this.nav);
    this.hero = new HeroSystem(events);
    this.projectiles = new ProjectileSystem(events, this.nav);
    this.rebuildNav();
    this.spawnStartingUnits();
    updateVisibility(this.state, this.visibility);
  }

  execute(command: Command): void {
    this.queue.push(command);
  }

  update(dt: number): void {
    if (this.state.status !== "playing") return;

    for (const command of this.queue) {
      this.apply(command);
    }
    this.queue.length = 0;

    this.economy.update(this.state, dt);
    this.construction.update(this.state, dt);
    this.production.update(this.state, dt);
    this.hero.update(this.state, dt);
    this.combat.update(this.state, this.visibility, dt);
    this.projectiles.update(this.state, dt);
    this.movement.update(this.state, dt);
    this.ai.update(this, dt);
    this.state.time += dt;

    this.visibilityTimer += dt;
    if (this.visibilityTimer >= VISIBILITY_INTERVAL) {
      this.visibilityTimer = 0;
      updateVisibility(this.state, this.visibility);
    }

    this.checkOutcome();
  }

  private checkOutcome(): void {
    if (this.state.status !== "playing") return;

    const hasTownCenter = (id: PlayerId): boolean =>
      this.state.players[id].buildings.some(
        (building) => building.type === "town_center" && building.state !== "destroyed",
      );

    if (!hasTownCenter("player")) {
      this.state.status = "defeat";
      this.events.emit("defeat", this.state.stats);
    } else if (!hasTownCenter("enemy")) {
      this.state.status = "victory";
      this.events.emit("victory", this.state.stats);
    }
  }

  private rebuildNav(): void {
    this.nav.clear();
    for (const id of ["player", "enemy"] as const) {
      for (const building of this.state.players[id].buildings) {
        const definition = def(building.type);
        this.nav.markRect(
          building.tileX,
          building.tileY,
          definition.tilesW,
          definition.tilesH,
          true,
        );
      }
    }
    for (const pond of PONDS) {
      const extent = Math.ceil(pond.radius + 0.5);
      for (let y = pond.tileY - extent; y <= pond.tileY + extent; y += 1) {
        for (let x = pond.tileX - extent; x <= pond.tileX + extent; x += 1) {
          const dist = Math.hypot(x - pond.tileX, y - pond.tileY);
          if (dist <= pond.radius + 0.4) this.nav.setBlocked(x, y, true);
        }
      }
    }
  }

  private spawnStartingUnits(): void {
    for (const id of ["player", "enemy"] as const) {
      const townCenter = this.state.players[id].buildings.find(
        (building) => building.type === "town_center",
      );
      if (!townCenter) continue;

      for (let i = 0; i < STARTING_VILLAGERS; i += 1) {
        const angle = (i / STARTING_VILLAGERS) * Math.PI * 2;
        const tileX = Math.floor(
          (townCenter.x + Math.cos(angle) * (townCenter.width / 2 + 48)) / TILE_SIZE,
        );
        const tileY = Math.floor(
          (townCenter.y + Math.sin(angle) * (townCenter.height / 2 + 48)) / TILE_SIZE,
        );
        const free = nearestFreeTile(this.nav, tileX, tileY, 12);
        const point = free
          ? tileToWorldCenter(free.x, free.y)
          : { x: townCenter.x, y: townCenter.y };
        this.state.players[id].units.push(spawnUnit(this.state, id, "villager", point.x, point.y));
      }

      const heroTileX = Math.floor((townCenter.x + townCenter.width / 2 + 40) / TILE_SIZE);
      const heroTileY = Math.floor(townCenter.y / TILE_SIZE);
      const heroFree = nearestFreeTile(this.nav, heroTileX, heroTileY, 12);
      const heroPoint = heroFree
        ? tileToWorldCenter(heroFree.x, heroFree.y)
        : { x: townCenter.x, y: townCenter.y };
      const hero = spawnUnit(this.state, id, "hero", heroPoint.x, heroPoint.y);
      const heroStats = HERO.levels[0];
      hero.hp = heroStats.hp;
      hero.maxHp = heroStats.hp;
      this.state.players[id].units.push(hero);
      this.state.players[id].heroId = hero.id;
    }
  }

  private placeBuilding(
    playerId: PlayerId,
    type: BuildingType,
    tileX: number,
    tileY: number,
  ): boolean {
    const player = this.state.players[playerId];
    const definition = def(type);

    const result = canPlace(this.state, this.nav, playerId, type, tileX, tileY);
    if (!result.ok) {
      this.events.emit("placement:rejected", result.reason);
      return false;
    }

    spendCost(player.resources, definition.cost);
    const building = spawnBuilding(this.state, playerId, type, tileX, tileY, false);
    player.buildings.push(building);
    this.nav.markRect(tileX, tileY, definition.tilesW, definition.tilesH, true);
    this.events.emit("building:created", building);
    this.events.emit("resource:changed", playerId);
    return true;
  }

  private unitsOf(faction: PlayerId, unitIds: string[]): Unit[] {
    const player = this.state.players[faction];
    const ids = new Set(unitIds);
    return player.units.filter((unit) => ids.has(unit.id) && unit.state !== "dead");
  }

  private apply(command: Command): void {
    const ui = this.state.ui;

    switch (command.type) {
      case "BEGIN_PLACEMENT": {
        ui.pendingBuild = command.buildingType;
        ui.selectedBuildingId = undefined;
        ui.selectedUnitIds = [];
        break;
      }
      case "CANCEL_PLACEMENT": {
        ui.pendingBuild = undefined;
        ui.hoverTile = undefined;
        break;
      }
      case "PLACE_BUILDING": {
        const faction = command.faction ?? "player";
        const placed = this.placeBuilding(
          faction,
          command.buildingType,
          command.tileX,
          command.tileY,
        );
        if (faction === "player" && placed && !this.canAffordMore(command.buildingType)) {
          ui.pendingBuild = undefined;
        }
        break;
      }
      case "SELECT_BUILDING": {
        ui.pendingBuild = undefined;
        ui.selectedUnitIds = [];
        ui.selectedBuildingId = command.buildingId;
        break;
      }
      case "SELECT_UNITS": {
        ui.pendingBuild = undefined;
        ui.selectedBuildingId = undefined;
        ui.selectedUnitIds = this.unitsOf("player", command.unitIds).map((unit) => unit.id);
        break;
      }
      case "TRAIN_UNIT": {
        this.production.enqueue(
          this.state,
          command.faction ?? "player",
          command.buildingId,
          command.unitType,
        );
        break;
      }
      case "MOVE_UNITS": {
        this.movement.orderMove(
          this.unitsOf(command.faction ?? "player", command.unitIds),
          command.x,
          command.y,
        );
        break;
      }
      case "ATTACK_TARGET": {
        const faction = command.faction ?? "player";
        const foe: PlayerId = faction === "player" ? "enemy" : "player";
        const enemy = this.state.players[foe];
        const valid =
          command.targetKind === "unit"
            ? enemy.units.some((unit) => unit.id === command.targetId && unit.state !== "dead")
            : enemy.buildings.some(
                (building) => building.id === command.targetId && building.state !== "destroyed",
              );
        if (!valid) break;
        this.combat.orderAttack(
          this.unitsOf(faction, command.unitIds),
          command.targetKind,
          command.targetId,
        );
        break;
      }
      case "ASSIGN_WORKERS": {
        const faction = command.faction ?? "player";
        const building = this.state.players[faction].buildings.find(
          (entry) => entry.id === command.buildingId && entry.state === "complete",
        );
        if (!building) break;
        const slots = freeWorkerSlots(this.state, building);
        if (slots <= 0) break;
        const villagers = this.unitsOf(faction, command.unitIds)
          .filter((unit) => unit.type === "villager")
          .slice(0, slots);
        this.movement.orderAssign(villagers, building);
        break;
      }
      case "ACTIVATE_HERO": {
        this.hero.tryRally(this.state, command.faction ?? "player");
        break;
      }
      case "UPGRADE_HERO": {
        this.hero.upgradeHero(this.state, command.faction ?? "player");
        break;
      }
    }
  }

  private canAffordMore(type: BuildingType): boolean {
    const player = this.state.players.player;
    const cost = def(type).cost;
    return (
      (cost.food ?? 0) <= player.resources.food &&
      (cost.wood ?? 0) <= player.resources.wood &&
      (cost.gold ?? 0) <= player.resources.gold
    );
  }
}

export function findBuilding(state: GameState, id: string | undefined): Building | undefined {
  if (!id) return undefined;
  return (
    state.players.player.buildings.find((building) => building.id === id) ??
    state.players.enemy.buildings.find((building) => building.id === id)
  );
}

export function findUnit(state: GameState, id: string): Unit | undefined {
  return (
    state.players.player.units.find((unit) => unit.id === id) ??
    state.players.enemy.units.find((unit) => unit.id === id)
  );
}
