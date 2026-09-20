import { BUILDABLE_TYPES, BUILDING_ICONS, BUILDINGS } from "../config/buildings";
import { RESOURCE_ICONS } from "../config/resources";
import { findBuilding } from "../sim/Game";
import { canAfford, def, productionResource, productionRate } from "../sim/selectors";
import type { Command } from "../sim/commands";
import type { Building, BuildingType, GameState, ResourceStore } from "../sim/types";

function costLabel(cost: Partial<ResourceStore>): string {
  const parts: string[] = [];
  if (cost.food) parts.push(`${cost.food}${RESOURCE_ICONS.food}`);
  if (cost.wood) parts.push(`${cost.wood}${RESOURCE_ICONS.wood}`);
  if (cost.gold) parts.push(`${cost.gold}${RESOURCE_ICONS.gold}`);
  return parts.join(" ");
}

function statsLabel(building: Building): string {
  const definition = def(building.type);
  const parts: string[] = [];
  if (definition.population) parts.push(`Population +${definition.population}`);
  if (definition.storage) parts.push(`Capacity +${definition.storage}`);
  const resource = productionResource(building);
  if (resource) {
    const rate = productionRate(building);
    parts.push(`${RESOURCE_ICONS[resource]} ${rate.toFixed(1)}/s`);
  }
  return parts.join(" · ");
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
    }
  };

  update(state: GameState): void {
    const player = state.players.player;
    const selected = findBuilding(state, state.ui.selectedBuildingId);
    const signature = [
      state.ui.pendingBuild ?? "",
      selected?.id ?? "",
      selected ? Math.ceil((selected.hp / selected.maxHp) * 20) : "",
      selected ? selected.state : "",
      state.status,
      Math.floor(player.resources.food),
      Math.floor(player.resources.wood),
      Math.floor(player.resources.gold),
    ].join("|");

    if (signature === this.signature) return;
    this.signature = signature;
    this.render(state, selected);
  }

  private render(state: GameState, selected: Building | undefined): void {
    const pending = state.ui.pendingBuild;
    if (pending) {
      this.root.innerHTML = this.placementHtml(pending);
      return;
    }
    if (selected) {
      this.root.innerHTML = this.selectionHtml(selected);
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

  private selectionHtml(building: Building): string {
    const definition = def(building.type);
    const hpRatio = Math.max(0, Math.min(1, building.hp / building.maxHp));
    const stats = statsLabel(building);
    return `
      <div class="panel">
        <div class="panel-head">${BUILDING_ICONS[building.type]} ${definition.name}</div>
        <div class="panel-desc">${definition.description}</div>
        <div class="hpbar"><i style="width:${(hpRatio * 100).toFixed(1)}%"></i></div>
        <div class="panel-hint">HP ${Math.ceil(building.hp)} / ${building.maxHp}${
          building.state === "constructing" ? " · under construction" : ""
        }</div>
        ${stats ? `<div class="panel-stats">${stats}</div>` : ""}
        <button class="btn btn-ghost" data-action="deselect">Close</button>
      </div>`;
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
