import { UNITS } from "../../config/units";
import { WORLD_HEIGHT, WORLD_WIDTH, worldToTile } from "../../config/world";
import { findPath, nearestFreeTile, tileToWorldCenter } from "../pathfinding";
import type { NavGrid } from "../navgrid";
import type { Building, GameState, Unit } from "../types";

const FORMATION_SPACING = 30;

export class MovementSystem {
  private readonly nav: NavGrid;

  constructor(nav: NavGrid) {
    this.nav = nav;
  }

  orderMove(units: Unit[], destX: number, destY: number): void {
    const count = units.length;
    if (count === 0) return;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    units.forEach((unit, index) => {
      unit.assignedBuildingId = undefined;
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
    unit.state = unit.path.length > 0 ? "moving" : unit.assignedBuildingId ? "gathering" : "idle";
  }

  update(state: GameState, dt: number): void {
    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        if (unit.state !== "moving") continue;
        if (unit.path.length === 0) {
          unit.state = unit.assignedBuildingId ? "gathering" : "idle";
          continue;
        }

        const speed = UNITS[unit.type].speed;
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
          unit.state = unit.assignedBuildingId ? "gathering" : "idle";
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

    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const minDist = UNITS[a.type].radius + UNITS[b.type].radius;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x = clamp(a.x - nx * push, 0, WORLD_WIDTH);
          a.y = clamp(a.y - ny * push, 0, WORLD_HEIGHT);
          b.x = clamp(b.x + nx * push, 0, WORLD_WIDTH);
          b.y = clamp(b.y + ny * push, 0, WORLD_HEIGHT);
        }
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
