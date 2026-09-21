import { UNITS } from "../../config/units";
import { moveMultiplier } from "../../config/research";
import { TILE_SIZE, WORLD_HEIGHT, WORLD_WIDTH, worldToTile } from "../../config/world";
import { findPath, nearestFreeTile, tileToWorldCenter } from "../pathfinding";
import type { NavGrid } from "../navgrid";
import type { Building, GameState, Unit } from "../types";

const FORMATION_SPACING = 30;

export class MovementSystem {
  private readonly nav: NavGrid;

  constructor(nav: NavGrid) {
    this.nav = nav;
  }

  stop(units: Unit[]): void {
    for (const unit of units) {
      unit.attackMoveX = undefined;
      unit.attackMoveY = undefined;
      unit.targetId = undefined;
      unit.targetKind = undefined;
      unit.path = [];
      if (unit.state === "moving" || unit.state === "attacking") unit.state = "idle";
    }
  }

  orderMove(units: Unit[], destX: number, destY: number): void {    const count = units.length;
    if (count === 0) return;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    units.forEach((unit, index) => {
      unit.assignedBuildingId = undefined;
      unit.repairBuildingId = undefined;
      unit.targetKind = undefined;
      unit.targetId = undefined;
      const col = index % cols;
      const row = Math.floor(index / cols);
      const offsetX = (col - (cols - 1) / 2) * FORMATION_SPACING;
      const offsetY = (row - (rows - 1) / 2) * FORMATION_SPACING;
      this.sendUnit(unit, destX + offsetX, destY + offsetY);
    });
  }

  orderAssign(units: Unit[], building: Building): void {
    units.forEach((unit, index) => {
      unit.assignedBuildingId = building.id;
      unit.repairBuildingId = undefined;
      unit.targetKind = undefined;
      unit.targetId = undefined;
      const angle = (index / Math.max(units.length, 1)) * Math.PI * 2;
      const reachX = building.width / 2 + 24;
      const reachY = building.height / 2 + 24;
      this.sendUnit(unit, building.x + Math.cos(angle) * reachX, building.y + Math.sin(angle) * reachY);
    });
  }

  orderRepair(units: Unit[], building: Building): void {
    units.forEach((unit, index) => {
      unit.repairBuildingId = building.id;
      unit.assignedBuildingId = undefined;
      unit.targetKind = undefined;
      unit.targetId = undefined;
      const angle = (index / Math.max(units.length, 1)) * Math.PI * 2;
      const reachX = building.width / 2 + 24;
      const reachY = building.height / 2 + 24;
      this.sendUnit(unit, building.x + Math.cos(angle) * reachX, building.y + Math.sin(angle) * reachY);
    });
  }

  private sendUnit(unit: Unit, destX: number, destY: number): void {
    const start = worldToTile(unit.x, unit.y);
    let goal = worldToTile(destX, destY);

    if (this.nav.isBlocked(goal.x, goal.y)) {
      const free = nearestFreeTile(this.nav, goal.x, goal.y);
      if (!free) {
        unit.path = [];
        unit.state = "idle";
        return;
      }
      goal = free;
    }

    const tiles = findPath(this.nav, start, goal);
    unit.path = tiles.map((tile) => tileToWorldCenter(tile.x, tile.y));
    if (unit.path.length === 0) {
      unit.state = unit.repairBuildingId ? "repairing" : unit.assignedBuildingId ? "gathering" : "idle";
    } else {
      unit.state = "moving";
    }
  }

  update(state: GameState, dt: number): void {
    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        if (unit.state === "dead") continue;

        // attack-move: keep heading to the destination, resume after fights
        if (unit.attackMoveX !== undefined && unit.attackMoveY !== undefined) {
          const adx = unit.attackMoveX - unit.x;
          const ady = unit.attackMoveY - unit.y;
          if (Math.hypot(adx, ady) < TILE_SIZE * 0.6) {
            unit.attackMoveX = undefined;
            unit.attackMoveY = undefined;
            if (unit.state === "moving") unit.state = "idle";
          } else if (!unit.targetId && unit.state !== "moving") {
            this.sendUnit(unit, unit.attackMoveX, unit.attackMoveY);
          }
        }

        if (unit.state !== "moving") continue;
        if (unit.path.length === 0) {
          unit.state = unit.repairBuildingId
            ? "repairing"
            : unit.assignedBuildingId
              ? "gathering"
              : "idle";
          continue;
        }

        const speed =
          UNITS[unit.type].speed *
          (unit.rallyTimer > 0 ? 1.2 : 1) *
          moveMultiplier(state.players[id]);
        let remaining = speed * dt;

        while (remaining > 0 && unit.path.length > 0) {
          const waypoint = unit.path[0];
          const dx = waypoint.x - unit.x;
          const dy = waypoint.y - unit.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= remaining) {
            unit.x = waypoint.x;
            unit.y = waypoint.y;
            unit.path.shift();
            remaining -= dist;
          } else {
            unit.x += (dx / dist) * remaining;
            unit.y += (dy / dist) * remaining;
            remaining = 0;
          }
        }

        if (unit.path.length === 0) {
          unit.state = unit.repairBuildingId
            ? "repairing"
            : unit.assignedBuildingId
              ? "gathering"
              : "idle";
        }
      }
    }

    this.separate(state);
  }

  private separate(state: GameState): void {
    const all: Unit[] = [];
    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        if (unit.state !== "dead") all.push(unit);
      }
    }

    const pushX = new Array<number>(all.length).fill(0);
    const pushY = new Array<number>(all.length).fill(0);

    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const minDist = UNITS[a.type].radius + UNITS[b.type].radius;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          const angle = ((i * 12.9898 + j * 78.233) * 43758.5453) % (Math.PI * 2);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 0.01;
        }
        if (dist < minDist) {
          const push = ((minDist - dist) / 2) * 0.6;
          const nx = dx / dist;
          const ny = dy / dist;
          pushX[i] -= nx * push;
          pushY[i] -= ny * push;
          pushX[j] += nx * push;
          pushY[j] += ny * push;
        }
      }
    }

    const maxStep = 3;
    for (let i = 0; i < all.length; i += 1) {
      const unit = all[i];
      let dx = pushX[i];
      let dy = pushY[i];
      const len = Math.hypot(dx, dy);
      if (len <= 0.001) continue;
      if (len > maxStep) {
        dx = (dx / len) * maxStep;
        dy = (dy / len) * maxStep;
      }
      const nx = clamp(unit.x + dx, 0, WORLD_WIDTH);
      const ny = clamp(unit.y + dy, 0, WORLD_HEIGHT);
      if (!this.nav.isBlocked(Math.floor(nx / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
        unit.x = nx;
        unit.y = ny;
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
