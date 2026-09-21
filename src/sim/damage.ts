import type { EventBus } from "../core/EventBus";
import type { NavGrid } from "./navgrid";
import { def } from "./selectors";
import type { Building, GameState, Unit } from "./types";

export function damageUnit(
  state: GameState,
  events: EventBus,
  unit: Unit,
  amount: number,
): void {
  if (unit.state === "dead") return;
  unit.hp -= amount;

  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.state = "dead";
    unit.path = [];
    unit.targetId = undefined;
    unit.targetKind = undefined;
    unit.assignedBuildingId = undefined;
    state.ui.selectedUnitIds = state.ui.selectedUnitIds.filter((id) => id !== unit.id);
    events.emit("unit:died", unit);
  }
}

export function damageBuilding(
  state: GameState,
  events: EventBus,
  nav: NavGrid,
  building: Building,
  amount: number,
): void {
  if (building.state === "destroyed") return;
  building.hp -= amount;

  if (building.hp <= 0) {
    building.hp = 0;
    building.state = "destroyed";
    const definition = def(building.type);
    nav.markRect(building.tileX, building.tileY, definition.tilesW, definition.tilesH, false);

    if (state.ui.selectedBuildingId === building.id) {
      state.ui.selectedBuildingId = undefined;
    }

    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        if (unit.assignedBuildingId === building.id) unit.assignedBuildingId = undefined;
      }
    }

    events.emit("building:destroyed", building);
  }
}
