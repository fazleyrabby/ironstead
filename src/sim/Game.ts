import type { EventBus } from "../core/EventBus";
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from "../config/world";
import type { Command } from "./commands";
import { canPlace } from "./placement";
import { def, freeWorkerSlots, spendCost } from "./selectors";
import { createInitialState, spawnBuilding, spawnUnit } from "./GameState";
import { NavGrid } from "./navgrid";
import { nearestFreeTile, tileToWorldCenter } from "./pathfinding";
import { ConstructionSystem } from "./systems/ConstructionSystem";
import { CombatSystem } from "./systems/CombatSystem";
import { EconomySystem } from "./systems/EconomySystem";
import { MovementSystem } from "./systems/MovementSystem";
import { ProductionSystem } from "./systems/ProductionSystem";
import { ProjectileSystem } from "./systems/ProjectileSystem";
import type { Building, BuildingType, GameState, PlayerId, Unit } from "./types";

const STARTING_VILLAGERS = 4;

export class Game {
  readonly state: GameState;
  readonly nav: NavGrid;
  readonly events: EventBus;
  readonly movement: MovementSystem;
  readonly production: ProductionSystem;
  readonly combat: CombatSystem;

  private readonly economy = new EconomySystem();
  private readonly construction: ConstructionSystem;
  private readonly projectiles: ProjectileSystem;
  private readonly queue: Command[] = [];

  constructor(events: EventBus) {
    this.events = events;
    this.state = createInitialState();
    this.nav = new NavGrid(GRID_COLS, GRID_ROWS);
    this.construction = new ConstructionSystem(events);
    this.movement = new MovementSystem(this.nav);
    this.production = new ProductionSystem(events, this.nav);
    this.combat = new CombatSystem(events, this.nav);
    this.projectiles = new ProjectileSystem(events, this.nav);
    this.rebuildNav();
    this.spawnStartingUnits();
  }

  execute(command: Command): void {
    this.queue.push(command);
  }

  update(dt: number): void {
    for (const command of this.queue) {
      this.apply(command);
    }
    this.queue.length = 0;

    this.economy.update(this.state, dt);
    this.construction.update(this.state, dt);
    this.production.update(this.state, dt);
    this.combat.update(this.state, dt);
    this.projectiles.update(this.state, dt);
    this.movement.update(this.state, dt);
    this.state.time += dt;
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

  private playerUnits(unitIds: string[]): Unit[] {
    const player = this.state.players.player;
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
        const placed = this.placeBuilding(
          "player",
          command.buildingType,
          command.tileX,
          command.tileY,
        );
        if (placed && !this.canAffordMore(command.buildingType)) {
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
        ui.selectedUnitIds = this.playerUnits(command.unitIds).map((unit) => unit.id);
        break;
      }
      case "TRAIN_UNIT": {
        this.production.enqueue(this.state, "player", command.buildingId, command.unitType);
        break;
      }
      case "MOVE_UNITS": {
        this.movement.orderMove(this.playerUnits(command.unitIds), command.x, command.y);
        break;
      }
      case "ATTACK_TARGET": {
        const enemy = this.state.players.enemy;
        const valid =
          command.targetKind === "unit"
            ? enemy.units.some((unit) => unit.id === command.targetId && unit.state !== "dead")
            : enemy.buildings.some(
                (building) => building.id === command.targetId && building.state !== "destroyed",
              );
        if (!valid) break;
        this.combat.orderAttack(
          this.playerUnits(command.unitIds),
          command.targetKind,
          command.targetId,
        );
        break;
      }
      case "ASSIGN_WORKERS": {
        const building = this.state.players.player.buildings.find(
          (entry) => entry.id === command.buildingId && entry.state === "complete",
        );
        if (!building) break;
        const slots = freeWorkerSlots(this.state, building);
        if (slots <= 0) break;
        const villagers = this.playerUnits(command.unitIds)
          .filter((unit) => unit.type === "villager")
          .slice(0, slots);
        this.movement.orderAssign(villagers, building);
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
