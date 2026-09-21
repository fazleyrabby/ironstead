import { BUILDABLE_TYPES, BUILDING_ICONS, BUILDINGS } from "../config/buildings";
import { RESOURCE_ICONS } from "../config/resources";
import { UNIT_ICONS } from "../config/units";
import { findBuilding } from "../sim/Game";
import {
  assignedWorkers,
  canAfford,
  def,
  populationCap,
  productionResource,
  productionRate,
  unitCount,
  unitDef,
} from "../sim/selectors";
import type { Command } from "../sim/commands";
import type { Building, BuildingType, GameState, ResourceStore, Unit, UnitType } from "../sim/types";

function costLabel(cost: Partial<ResourceStore>): string {
  const parts: string[] = [];
  if (cost.food) parts.push(`${cost.food}${RESOURCE_ICONS.food}`);
  if (cost.wood) parts.push(`${cost.wood}${RESOURCE_ICONS.wood}`);
  if (cost.gold) parts.push(`${cost.gold}${RESOURCE_ICONS.gold}`);
  return parts.join(" ");
}

function statsLabel(state: GameState, building: Building): string {
  const definition = def(building.type);
  const parts: string[] = [];
  if (definition.population) parts.push(`Population +${definition.population}`);
  if (definition.storage) parts.push(`Capacity +${definition.storage}`);
  const resource = productionResource(building);
  if (resource) {
    const rate = productionRate(building, assignedWorkers(state, building).length);
    parts.push(`${RESOURCE_ICONS[resource]} ${rate.toFixed(1)}/s`);
  }
  return parts.join(" · ");
}

function unitBreakdown(units: Unit[]): string {
  const counts = new Map<UnitType, number>();
  for (const unit of units) {
    counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => `${UNIT_ICONS[type]} ${count}`)
    .join(" &nbsp; ");
}

export class CommandPanel {
  private readonly root: HTMLElement;
  private readonly execute: (command: Command) => void;
  private signature = "";

  constructor(parent: HTMLElement, execute: (command: Command) => void) {
    this.root = parent;
    this.execute = execute;
    this.root.addEventListener("click", this.onClick);
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const trainButton = target.closest<HTMLElement>("[data-train]");
    if (trainButton?.dataset.train) {
      const [buildingId, unitType] = trainButton.dataset.train.split("|");
      if (buildingId && unitType) {
        this.execute({ type: "TRAIN_UNIT", buildingId, unitType: unitType as UnitType });
      }
      return;
    }

    const buildButton = target.closest<HTMLElement>("[data-build]");
    if (buildButton?.dataset.build) {
      this.execute({
        type: "BEGIN_PLACEMENT",
        buildingType: buildButton.dataset.build as BuildingType,
      });
      return;
    }

    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "cancel") {
      this.execute({ type: "CANCEL_PLACEMENT" });
      return;
    }
    if (action === "deselect") {
      this.execute({ type: "SELECT_BUILDING" });
      this.execute({ type: "SELECT_UNITS", unitIds: [] });
    }
  };

  update(state: GameState): void {
    const player = state.players.player;
    const selected = findBuilding(state, state.ui.selectedBuildingId);
    const selectedUnits = state.ui.selectedUnitIds
      .map((id) => player.units.find((unit) => unit.id === id && unit.state !== "dead"))
      .filter((unit): unit is Unit => unit !== undefined);

    const signature = [
      state.ui.pendingBuild ?? "",
      selected?.id ?? "",
      selected ? Math.ceil((selected.hp / selected.maxHp) * 20) : "",
      selected ? selected.state : "",
      selected ? selected.queue.map((order) => `${order.unitType}:${Math.floor(order.progress * 10)}`).join(",") : "",
      state.ui.selectedUnitIds.join(","),
      state.status,
      Math.floor(player.resources.food),
      Math.floor(player.resources.wood),
      Math.floor(player.resources.gold),
    ].join("|");

    if (signature === this.signature) return;
    this.signature = signature;
    this.render(state, selected, selectedUnits);
  }

  private render(state: GameState, selected: Building | undefined, selectedUnits: Unit[]): void {
    const pending = state.ui.pendingBuild;
    if (pending) {
      this.root.innerHTML = this.placementHtml(pending);
      return;
    }
    if (selectedUnits.length > 0) {
      this.root.innerHTML = this.unitsHtml(selectedUnits);
      return;
    }
    if (selected) {
      this.root.innerHTML = this.selectionHtml(state, selected);
      return;
    }
    this.root.innerHTML = this.buildHtml(state);
  }

  private placementHtml(type: BuildingType): string {
    const definition = BUILDINGS[type];
    return `
      <div class="panel panel-accent">
        <div class="panel-head">PLACING <b>${BUILDING_ICONS[type]} ${definition.name}</b></div>
        <div class="panel-hint">Left click to place &middot; Esc or right click to cancel</div>
        <button class="btn btn-ghost" data-action="cancel">Cancel</button>
      </div>`;
  }

  private unitsHtml(units: Unit[]): string {
    const hasVillager = units.some((unit) => unit.type === "villager");
    const hint = hasVillager
      ? "Right-click ground to move &middot; right-click a farm, forest or mine to work it"
      : "Right-click ground to move";
    return `
      <div class="panel">
        <div class="panel-head">${units.length} UNIT${units.length === 1 ? "" : "S"} SELECTED</div>
        <div class="panel-stats">${unitBreakdown(units)}</div>
        <div class="panel-hint">${hint}</div>
        <button class="btn btn-ghost" data-action="deselect">Deselect</button>
      </div>`;
  }

  private selectionHtml(state: GameState, building: Building): string {
    const definition = def(building.type);
    const hpRatio = Math.max(0, Math.min(1, building.hp / building.maxHp));
    const stats = statsLabel(state, building);
    const production = this.productionHtml(state, building);

    return `
      <div class="panel">
        <div class="panel-head">${BUILDING_ICONS[building.type]} ${definition.name}</div>
        <div class="panel-desc">${definition.description}</div>
        ${production}
        <div class="hpbar"><i style="width:${(hpRatio * 100).toFixed(1)}%"></i></div>
        <div class="panel-hint">HP ${Math.ceil(building.hp)} / ${building.maxHp}${
          building.state === "constructing" ? " · under construction" : ""
        }</div>
        ${stats ? `<div class="panel-stats">${stats}</div>` : ""}
        <button class="btn btn-ghost" data-action="deselect">Close</button>
      </div>`;
  }

  private productionHtml(state: GameState, building: Building): string {
    const produces = def(building.type).produces;
    if (!produces || produces.length === 0) return "";
    if (building.state !== "complete") {
      return `<div class="panel-hint">Finishes construction before training units.</div>`;
    }

    const player = state.players.player;
    const popFull = unitCount(player) >= populationCap(player);
    const buttons = produces
      .map((unitType) => {
        const definition = unitDef(unitType);
        const affordable = canAfford(player.resources, definition.cost) && !popFull;
        return `
          <button class="build-btn${affordable ? "" : " is-disabled"}" data-train="${building.id}|${unitType}" ${
            affordable ? "" : "disabled"
          }>
            <span class="bb-icon">${UNIT_ICONS[unitType]}</span>
            <span class="bb-name">${definition.name}</span>
            <span class="bb-cost">${costLabel(definition.cost)}</span>
          </button>`;
      })
      .join("");

    let queue = "";
    if (building.queue.length > 0) {
      const current = building.queue[0];
      const name = unitDef(current.unitType).name;
      queue = `
        <div class="queue">
          <div class="queue-label">Training: <b>${name}</b>${building.queue.length > 1 ? ` (+${building.queue.length - 1} queued)` : ""}</div>
          <div class="hpbar"><i style="width:${(current.progress * 100).toFixed(0)}%"></i></div>
        </div>`;
    }

    return `
      <div class="panel-sub">TRAIN${popFull ? " · POPULATION FULL" : ""}</div>
      <div class="build-grid">${buttons}</div>
      ${queue}`;
  }

  private buildHtml(state: GameState): string {
    const resources = state.players.player.resources;
    const buttons = BUILDABLE_TYPES.map((type) => {
      const definition = BUILDINGS[type];
      const affordable = canAfford(resources, definition.cost);
      return `
        <button class="build-btn${affordable ? "" : " is-disabled"}" data-build="${type}" ${
          affordable ? "" : "disabled"
        }>
          <span class="bb-icon">${BUILDING_ICONS[type]}</span>
          <span class="bb-name">${definition.name}</span>
          <span class="bb-cost">${costLabel(definition.cost)}</span>
        </button>`;
    }).join("");

    return `
      <div class="panel">
        <div class="panel-head">BUILD</div>
        <div class="build-grid">${buttons}</div>
      </div>`;
  }
}
