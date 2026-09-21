import type { EventBus } from "../core/EventBus";
import { armorReduction } from "../config/research";
import type { NavGrid } from "./navgrid";
import { def, storageCap } from "./selectors";
import type { Building, GameState, ResourceStore, Unit } from "./types";

function releaseBuilding(state: GameState, nav: NavGrid, building: Building): void {
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
      if (unit.repairBuildingId === building.id) {
        unit.repairBuildingId = undefined;
        if (unit.state === "repairing") unit.state = "idle";
      }
    }
  }
}

export function damageUnit(
  state: GameState,
  events: EventBus,
  unit: Unit,
  amount: number,
): void {
  if (unit.state === "dead") return;
  const reduction = armorReduction(state.players[unit.owner]);
  unit.hp -= amount * (1 - reduction);

  if (unit.hp <= 0) {
    unit.hp = 0;
    unit.state = "dead";
    unit.path = [];
    unit.targetId = undefined;
    unit.targetKind = undefined;
    unit.assignedBuildingId = undefined;
    unit.repairBuildingId = undefined;
    state.ui.selectedUnitIds = state.ui.selectedUnitIds.filter((id) => id !== unit.id);
    if (unit.owner === "player") state.stats.playerUnitsLost += 1;
    else state.stats.playerUnitsKilled += 1;
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
    releaseBuilding(state, nav, building);

    if (building.owner === "player") state.stats.playerBuildingsLost += 1;
    else state.stats.playerBuildingsDestroyed += 1;

    events.emit("building:destroyed", building);
  }
}

export function demolishBuilding(
  state: GameState,
  events: EventBus,
  nav: NavGrid,
  building: Building,
  refund: Partial<ResourceStore>,
): void {
  if (building.state === "destroyed") return;

  releaseBuilding(state, nav, building);

  const player = state.players[building.owner];
  const cap = storageCap(player);
  for (const key of ["food", "wood", "gold"] as const) {
    const amount = refund[key] ?? 0;
    if (amount <= 0) continue;
    player.resources[key] = Math.min(cap, player.resources[key] + amount);
  }

  events.emit("building:demolished", building);
}
