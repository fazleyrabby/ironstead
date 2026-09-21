import type { EventBus } from "../core/EventBus";
import { DEMOLISH, demolishRefund } from "../config/demolish";
import { PONDS } from "../config/map";
import { GRID_COLS, GRID_ROWS } from "../config/world";
import type { Command } from "./commands";
import { canPlace } from "./placement";
import { demolishBuilding } from "./damage";
import { def, canAfford, freeWorkerSlots, spendCost } from "./selectors";
import { REPAIR } from "../config/repair";
import { RESEARCH } from "../config/research";
import { createInitialState, spawnBuilding, spawnUnit } from "./GameState";
import { NavGrid } from "./navgrid";
import { tileToWorldCenter } from "./pathfinding";
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
import { RepairSystem } from "./systems/RepairSystem";
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
  private readonly repair: RepairSystem;
  private readonly aiEnemy = new AISystem("enemy");
  private readonly aiPlayer = new AISystem("player");
  private readonly queue: Command[] = [];
  private visibilityTimer = 0;
  private cleanupTimer = 0;

  /** When true the player is also driven by the AI (test / demo mode). */
  autoPlay = false;

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
    this.production = new ProductionSystem(events, this.nav, this.movement);
    this.combat = new CombatSystem(events, this.nav);
    this.hero = new HeroSystem(events);
    this.repair = new RepairSystem(events);
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
    this.repair.update(this.state, dt);
    this.combat.update(this.state, this.visibility, dt);
    this.projectiles.update(this.state, dt);
    this.movement.update(this.state, dt);
    this.aiEnemy.update(this, dt);
    if (this.autoPlay) this.aiPlayer.update(this, dt);
    this.state.time += dt;

    this.cleanupTimer += dt;
    if (this.cleanupTimer >= 0.5) {
      this.cleanupTimer = 0;
      this.compact();
    }

    this.visibilityTimer += dt;
    if (this.visibilityTimer >= VISIBILITY_INTERVAL) {
      this.visibilityTimer = 0;
      updateVisibility(this.state, this.visibility);
    }

    this.checkOutcome();
  }

  // Dead units and destroyed buildings are flagged, not removed, so systems can
  // resolve final hits. Sweep them out periodically to keep per-tick scans and
  // arrays bounded over long matches.
  private compact(): void {
    for (const id of ["player", "enemy"] as const) {
      const player = this.state.players[id];
      if (player.units.some((unit) => unit.state === "dead")) {
        player.units = player.units.filter((unit) => unit.state !== "dead");
      }
      if (player.buildings.some((building) => building.state === "destroyed")) {
        player.buildings = player.buildings.filter((building) => building.state !== "destroyed");
      }
    }

    const alive = new Set<string>();
    for (const id of ["player", "enemy"] as const) {
      for (const unit of this.state.players[id].units) alive.add(unit.id);
    }
    this.state.ui.selectedUnitIds = this.state.ui.selectedUnitIds.filter((unitId) =>
      alive.has(unitId),
    );
  }

  private checkOutcome(): void {    if (this.state.status !== "playing") return;

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

      const used = new Set<string>();
      const centerTileX = townCenter.tileX + 2;
      const centerTileY = townCenter.tileY + 2;

      for (let i = 0; i < STARTING_VILLAGERS; i += 1) {
        const angle = (i / STARTING_VILLAGERS) * Math.PI * 2;
        const ringTileX = Math.round(centerTileX + Math.cos(angle) * 4);
        const ringTileY = Math.round(centerTileY + Math.sin(angle) * 4);
        const point = this.claimSpawnTile(used, ringTileX, ringTileY) ?? {
          x: townCenter.x,
          y: townCenter.y,
        };
        this.state.players[id].units.push(spawnUnit(this.state, id, "villager", point.x, point.y));
      }

      const heroPoint = this.claimSpawnTile(
        used,
        centerTileX + 4,
        centerTileY + 1,
      ) ?? { x: townCenter.x, y: townCenter.y };
      const hero = spawnUnit(this.state, id, "hero", heroPoint.x, heroPoint.y);
      const heroStats = HERO.levels[0];
      hero.hp = heroStats.hp;
      hero.maxHp = heroStats.hp;
      this.state.players[id].units.push(hero);
      this.state.players[id].heroId = hero.id;
    }
  }

  private claimSpawnTile(
    used: Set<string>,
    tileX: number,
    tileY: number,
  ): { x: number; y: number } | undefined {
    for (let radius = 0; radius <= 14; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = tileX + dx;
          const y = tileY + dy;
          const key = `${x},${y}`;
          if (used.has(key)) continue;
          if (!this.nav.inBounds(x, y) || this.nav.isBlocked(x, y)) continue;
          used.add(key);
          return tileToWorldCenter(x, y);
        }
      }
    }
    return undefined;
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

  private nearestVillagers(faction: PlayerId, building: Building, count: number): Unit[] {
    return this.state.players[faction].units
      .filter(
        (unit) =>
          unit.type === "villager" &&
          unit.state !== "dead" &&
          unit.repairBuildingId !== building.id,
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - building.x, a.y - building.y) -
          Math.hypot(b.x - building.x, b.y - building.y),
      )
      .slice(0, count);
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
      case "TOGGLE_BUILD": {
        ui.buildOpen = command.open ?? !ui.buildOpen;
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
        const units = this.unitsOf(command.faction ?? "player", command.unitIds);
        for (const unit of units) {
          unit.attackMoveX = undefined;
          unit.attackMoveY = undefined;
        }
        this.movement.orderMove(units, command.x, command.y);
        break;
      }
      case "ATTACK_MOVE": {
        const units = this.unitsOf(command.faction ?? "player", command.unitIds);
        this.movement.orderMove(units, command.x, command.y);
        for (const unit of units) {
          unit.attackMoveX = command.x;
          unit.attackMoveY = command.y;
        }
        break;
      }
      case "STOP": {
        this.movement.stop(this.unitsOf(command.faction ?? "player", command.unitIds));
        break;
      }
      case "SET_RALLY": {
        const faction = command.faction ?? "player";
        const building = this.state.players[faction].buildings.find(
          (entry) => entry.id === command.buildingId && entry.state !== "destroyed",
        );
        if (!building) break;
        building.rallyX = command.x;
        building.rallyY = command.y;
        this.events.emit("rally:set", building.id);
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
        const targets = this.unitsOf(faction, command.unitIds);
        for (const unit of targets) {
          unit.attackMoveX = undefined;
          unit.attackMoveY = undefined;
        }
        this.combat.orderAttack(targets, command.targetKind, command.targetId);
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
      case "REPAIR": {
        const faction = command.faction ?? "player";
        const building = this.state.players[faction].buildings.find(
          (entry) =>
            entry.id === command.buildingId &&
            entry.state === "complete" &&
            entry.hp < entry.maxHp,
        );
        if (!building) break;
        const requested = this.unitsOf(faction, command.unitIds).filter(
          (unit) => unit.type === "villager",
        );
        const villagers =
          requested.length > 0
            ? requested
            : this.nearestVillagers(faction, building, REPAIR.maxWorkers);
        if (villagers.length === 0) break;
        this.movement.orderRepair(villagers, building);
        this.events.emit("repair:started", building.id);
        break;
      }
      case "DEMOLISH": {
        const faction = command.faction ?? "player";
        const building = this.state.players[faction].buildings.find(
          (entry) => entry.id === command.buildingId && entry.state !== "destroyed",
        );
        if (!building || (DEMOLISH.blocked as readonly BuildingType[]).includes(building.type)) break;
        demolishBuilding(
          this.state,
          this.events,
          this.nav,
          building,
          demolishRefund(def(building.type).cost),
        );
        this.events.emit("resource:changed", faction);
        break;
      }
      case "UPGRADE_HERO": {
        this.hero.upgradeHero(this.state, command.faction ?? "player");
        break;
      }
      case "RESEARCH": {
        const faction = command.faction ?? "player";
        const player = this.state.players[faction];
        const research = RESEARCH[command.line];
        const level = player.research[command.line] ?? 0;
        if (level >= research.tiers.length) break;
        const cost = research.tiers[level].cost;
        if (!canAfford(player.resources, cost)) break;
        spendCost(player.resources, cost);
        player.research[command.line] = level + 1;
        this.events.emit("research:done", command.line);
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
