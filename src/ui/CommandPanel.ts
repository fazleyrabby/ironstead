import { BUILDABLE_TYPES, BUILDING_ICONS, BUILDINGS } from "../config/buildings";
import { DEMOLISH } from "../config/demolish";
import { HERO } from "../config/hero";
import { ECONOMY_LINES, MILITARY_LINES, RESEARCH, RESEARCH_LINES } from "../config/research";
import type { ResearchLine } from "../config/research";
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
import { heroDisplayName, heroIcon } from "../sim/systems/HeroSystem";
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
  private pendingDemolish?: string;

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

    const researchButton = target.closest<HTMLElement>("[data-research]");
    if (researchButton?.dataset.research) {
      this.execute({ type: "RESEARCH", line: researchButton.dataset.research as ResearchLine });
      return;
    }

    const repairButton = target.closest<HTMLElement>("[data-repair]");
    if (repairButton?.dataset.repair) {
      this.execute({ type: "REPAIR", unitIds: [], buildingId: repairButton.dataset.repair });
      return;
    }

    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action === "cancel") {
      this.execute({ type: "CANCEL_PLACEMENT" });
      return;
    }
    if (action === "open-build") {
      this.execute({ type: "TOGGLE_BUILD", open: true });
      return;
    }
    if (action === "close-build") {
      this.execute({ type: "TOGGLE_BUILD", open: false });
      return;
    }
    if (action === "rally") {
      this.execute({ type: "ACTIVATE_HERO" });
      return;
    }
    if (action === "upgrade-hero") {
      this.execute({ type: "UPGRADE_HERO" });
      return;
    }
    if (action === "demolish") {
      this.pendingDemolish = target.closest<HTMLElement>("[data-building-id]")?.dataset
        .buildingId;
      this.signature = "";
      return;
    }
    if (action === "confirm-demolish") {
      if (this.pendingDemolish) {
        this.execute({ type: "DEMOLISH", buildingId: this.pendingDemolish });
      }
      this.pendingDemolish = undefined;
      this.signature = "";
      return;
    }
    if (action === "cancel-demolish") {
      this.pendingDemolish = undefined;
      this.signature = "";
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

    const hero = player.units.find((unit) => unit.type === "hero");

    if (this.pendingDemolish && this.pendingDemolish !== selected?.id) {
      this.pendingDemolish = undefined;
    }

    const signature = [
      state.ui.pendingBuild ?? "",
      state.ui.buildOpen ? "b" : "",
      this.pendingDemolish ?? "",
      selected?.id ?? "",
      selected ? Math.ceil((selected.hp / selected.maxHp) * 20) : "",
      selected ? selected.state : "",
      selected ? selected.queue.map((order) => `${order.unitType}:${Math.floor(order.progress * 5)}`).join(",") : "",
      state.ui.selectedUnitIds.join(","),
      hero ? `h${hero.heroLevel ?? 1}:${Math.ceil(hero.abilityCooldown)}` : "",
      RESEARCH_LINES.map((line) => player.research[line] ?? 0).join(","),
      state.status,
      this.affordability(state, selected),
    ].join("|");

    if (signature === this.signature) return;
    this.signature = signature;
    this.render(state, selected, selectedUnits);
  }

  // Fingerprint of which buttons are affordable so the panel only rebuilds when
  // that changes, not on every resource tick (re-rendering mid-click eats clicks).
  private affordability(state: GameState, selected: Building | undefined): string {
    const player = state.players.player;
    const resources = player.resources;
    const bits: string[] = [];

    if (state.ui.buildOpen) {
      for (const type of BUILDABLE_TYPES) {
        bits.push(canAfford(resources, BUILDINGS[type].cost) ? "1" : "0");
      }
    }

    if (selected && selected.owner === "player") {
      const popFull = unitCount(player) >= populationCap(player);
      const produces = def(selected.type).produces ?? [];
      for (const unit of produces) {
        bits.push(canAfford(resources, unitDef(unit).cost) && !popFull ? "1" : "0");
      }
      if (selected.type === "academy") {
        for (const line of RESEARCH_LINES) {
          const level = player.research[line] ?? 0;
          const tier = level < RESEARCH[line].tiers.length ? RESEARCH[line].tiers[level] : undefined;
          bits.push(tier && canAfford(resources, tier.cost) ? "1" : "0");
        }
      }
      if (selected.type === "town_center") {
        const hero = player.units.find((unit) => unit.type === "hero");
        const level = hero?.heroLevel ?? 1;
        const cost = level < HERO.levels.length ? HERO.levels[level].upgradeCost : undefined;
        bits.push(cost && canAfford(resources, cost) ? "1" : "0");
      }
    }

    return bits.join("");
  }

  private render(state: GameState, selected: Building | undefined, selectedUnits: Unit[]): void {
    const pending = state.ui.pendingBuild;
    if (pending) {
      this.root.innerHTML = this.placementHtml(pending);
      return;
    }
    if (selectedUnits.length > 0) {
      this.root.innerHTML = this.unitsHtml(selectedUnits, state);
      return;
    }
    if (selected) {
      this.root.innerHTML = this.selectionHtml(state, selected);
      return;
    }
    if (state.ui.buildOpen) {
      this.root.innerHTML = this.buildHtml(state);
      return;
    }
    this.root.innerHTML = `
      <div class="panel panel-collapsed">
        <button class="build-fab" data-action="open-build" title="Build (B)">
          <span class="fab-icon">\u{1F528}</span>
          <span class="fab-label">Build</span>
        </button>
      </div>`;
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

  private unitsHtml(units: Unit[], state: GameState): string {
    const hasVillager = units.some((unit) => unit.type === "villager");
    const hero = state.players.player.units.find(
      (unit) => unit.type === "hero" && unit.state !== "dead",
    );
    const heroSelected = units.some((unit) => unit.type === "hero");

    const hint = hasVillager
      ? "Right-click ground to move &middot; right-click a farm, forest or mine to work it &middot; right-click damaged buildings to repair"
      : "Right-click ground to move";

    let heroBlock = "";
    if (heroSelected && hero) {
      const ready = hero.abilityCooldown <= 0;
      const name = heroDisplayName(hero);
      const cd = ready ? "Ready" : `${Math.ceil(hero.abilityCooldown)}s`;
      heroBlock = `
        <div class="panel-sub">${heroIcon(hero)} ${name} &middot; Level ${hero.heroLevel ?? 1}</div>
        <button class="hero-ability${ready ? "" : " is-cooling"}" data-action="rally" ${
          ready ? "" : "disabled"
        }>
          <span class="ha-icon">${HERO.ability.name === "Rally" ? "\u{1F4E3}" : "\u2728"}</span>
          <span class="ha-label">${HERO.ability.name}</span>
          <span class="ha-cd">${cd}</span>
        </button>`;
    }

    return `
      <div class="panel">
        <div class="panel-head">${units.length} UNIT${units.length === 1 ? "" : "S"} SELECTED</div>
        <div class="panel-stats">${unitBreakdown(units)}</div>
        ${heroBlock}
        <div class="panel-hint">${hint}</div>
        <button class="btn btn-ghost" data-action="deselect">Deselect</button>
      </div>`;
  }

  private selectionHtml(state: GameState, building: Building): string {
    const definition = def(building.type);
    const hpRatio = Math.max(0, Math.min(1, building.hp / building.maxHp));
    const stats = statsLabel(state, building);
    const own = building.owner === "player";
    const production = own ? this.productionHtml(state, building) : "";
    const heroUpgrade = own ? this.heroUpgradeHtml(state, building) : "";
    const research = own ? this.researchHtml(state, building) : "";
    const repair = own ? this.repairHtml(building) : "";
    const demolish = own ? this.demolishHtml(building) : "";

    return `
      <div class="panel">
        <div class="panel-head">${BUILDING_ICONS[building.type]} ${definition.name}</div>
        <div class="panel-desc">${definition.description}</div>
        ${heroUpgrade}
        ${research}
        ${production}
        ${repair}
        <div class="hpbar"><i style="width:${(hpRatio * 100).toFixed(1)}%"></i></div>
        <div class="panel-hint">HP ${Math.ceil(building.hp)} / ${building.maxHp}${
          building.state === "constructing" ? " \u00b7 under construction" : ""
        }</div>
        ${stats ? `<div class="panel-stats">${stats}</div>` : ""}
        ${demolish}
        <button class="btn btn-ghost" data-action="deselect">Close</button>
      </div>`;
  }

  private repairHtml(building: Building): string {
    if (building.state !== "complete" || building.hp >= building.maxHp) return "";
    return `
      <div class="panel-sub">REPAIR</div>
      <button class="btn btn-repair" data-repair="${building.id}">
        \u{1F527} Send villagers to repair
      </button>`;
  }

  private demolishHtml(building: Building): string {
    if (building.state === "destroyed") return "";
    if ((DEMOLISH.blocked as readonly BuildingType[]).includes(building.type)) return "";

    if (this.pendingDemolish === building.id) {
      return `
        <div class="panel-sub">DEMOLISH</div>
        <div class="panel-hint">Refund ${Math.round(DEMOLISH.refund * 100)}% of the build cost. This cannot be undone.</div>
        <div class="btn-row">
          <button class="btn btn-danger" data-action="confirm-demolish">Demolish</button>
          <button class="btn btn-ghost" data-action="cancel-demolish">Cancel</button>
        </div>`;
    }
    return `
      <button class="btn btn-ghost" data-action="demolish" data-building-id="${building.id}">
        Demolish building
      </button>`;
  }

  private heroUpgradeHtml(state: GameState, building: Building): string {
    if (building.type !== "town_center" || building.state !== "complete") return "";
    const hero = state.players.player.units.find((unit) => unit.type === "hero");
    if (!hero) return "";
    const level = hero.heroLevel ?? 1;

    if (level >= HERO.levels.length) {
      return `<div class="panel-hint">${heroDisplayName(hero)} is fully upgraded.</div>`;
    }

    const cost = HERO.levels[level].upgradeCost;
    const affordable = canAfford(state.players.player.resources, cost);
    return `
      <div class="panel-sub">HERO</div>
      <div class="build-grid">
        <button class="build-btn${affordable ? "" : " is-disabled"}" data-action="upgrade-hero" ${
          affordable ? "" : "disabled"
        }>
          <span class="bb-icon">${heroIcon(hero)}</span>
          <span class="bb-name">${heroDisplayName(hero)} → Lv.${level + 1}</span>
          <span class="bb-cost">${costLabel(cost)}</span>
        </button>
      </div>`;
  }

  private researchHtml(state: GameState, building: Building): string {
    if (building.type !== "academy" || building.state !== "complete") return "";
    const player = state.players.player;

    const button = (line: ResearchLine): string => {
      const research = RESEARCH[line];
      const level = player.research[line] ?? 0;
      const maxed = level >= research.tiers.length;
      const tier = maxed ? undefined : research.tiers[level];
      const affordable = tier !== undefined && canAfford(player.resources, tier.cost);
      const pips = `${"\u25CF".repeat(level)}${"\u25CB".repeat(research.tiers.length - level)}`;
      const costText = maxed || !tier ? `MAX ${pips}` : `${costLabel(tier.cost)} ${pips}`;
      return `
        <button class="build-btn${affordable ? "" : " is-disabled"}" data-research="${line}" title="${research.description}" ${
          affordable ? "" : "disabled"
        }>
          <span class="bb-icon">${research.icon}</span>
          <span class="bb-name">${research.name}</span>
          <span class="bb-cost">${costText}</span>
        </button>`;
    };

    return `
      <div class="panel-sub">ECONOMY RESEARCH</div>
      <div class="build-grid">${ECONOMY_LINES.map(button).join("")}</div>
      <div class="panel-sub">MILITARY RESEARCH</div>
      <div class="build-grid">${MILITARY_LINES.map(button).join("")}</div>`;
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
        <div class="panel-head">BUILD
          <button class="panel-x" data-action="close-build" title="Close (Esc)">&times;</button>
        </div>
        <div class="build-grid">${buttons}</div>
      </div>`;
  }
}
