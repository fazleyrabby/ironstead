import type { EventBus } from "../core/EventBus";
import { GRID_COLS, GRID_ROWS } from "../config/world";
import type { Command } from "./commands";
import { canPlace } from "./placement";
import { def, spendCost } from "./selectors";
import { createInitialState, spawnBuilding } from "./GameState";
import { NavGrid } from "./navgrid";
import { ConstructionSystem } from "./systems/ConstructionSystem";
import { EconomySystem } from "./systems/EconomySystem";
import type { Building, BuildingType, GameState, PlayerId } from "./types";

export class Game {
  readonly state: GameState;
  readonly nav: NavGrid;
  readonly events: EventBus;

  private readonly economy = new EconomySystem();
  private readonly construction: ConstructionSystem;
  private readonly queue: Command[] = [];

  constructor(events: EventBus) {
    this.events = events;
    this.state = createInitialState();
    this.nav = new NavGrid(GRID_COLS, GRID_ROWS);
    this.construction = new ConstructionSystem(events);
    this.rebuildNav();
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

  private apply(command: Command): void {
    const ui = this.state.ui;

    switch (command.type) {
      case "BEGIN_PLACEMENT": {
        ui.pendingBuild = command.buildingType;
        ui.selectedBuildingId = undefined;
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
        ui.selectedBuildingId = command.buildingId;
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
