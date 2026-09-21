import { TILE_SIZE } from "../config/world";
import type { NavGrid } from "./navgrid";

export interface TilePos {
  x: number;
  y: number;
}

export function tileToWorldCenter(tileX: number, tileY: number): { x: number; y: number } {
  return { x: (tileX + 0.5) * TILE_SIZE, y: (tileY + 0.5) * TILE_SIZE };
}

class Heap {
  private readonly items: number[] = [];
  constructor(private readonly priority: Float32Array) {}

  get size(): number {
    return this.items.length;
  }

  push(index: number): void {
    this.items.push(index);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(position: number): void {
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (this.priority[this.items[position]] >= this.priority[this.items[parent]]) break;
      [this.items[position], this.items[parent]] = [this.items[parent], this.items[position]];
      position = parent;
    }
  }

  private bubbleDown(position: number): void {
    for (;;) {
      const left = position * 2 + 1;
      const right = left + 1;
      let smallest = position;
      if (left < this.items.length && this.priority[this.items[left]] < this.priority[this.items[smallest]]) {
        smallest = left;
      }
      if (right < this.items.length && this.priority[this.items[right]] < this.priority[this.items[smallest]]) {
        smallest = right;
      }
      if (smallest === position) break;
      [this.items[position], this.items[smallest]] = [this.items[smallest], this.items[position]];
      position = smallest;
    }
  }
}

const DIRS: Array<{ dx: number; dy: number; cost: number }> = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: 1.4142 },
  { dx: 1, dy: -1, cost: 1.4142 },
  { dx: -1, dy: 1, cost: 1.4142 },
  { dx: -1, dy: -1, cost: 1.4142 },
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
}

export function findPath(nav: NavGrid, start: TilePos, goal: TilePos): TilePos[] {
  const { cols, rows } = nav;
  const total = cols * rows;
  const startIndex = start.y * cols + start.x;
  const goalIndex = goal.y * cols + goal.x;

  if (startIndex === goalIndex) return [];

  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  gScore[startIndex] = 0;
  fScore[startIndex] = heuristic(start.x, start.y, goal.x, goal.y);

  const open = new Heap(fScore);
  open.push(startIndex);

  let iterations = 0;
  const maxIterations = total * 2;

  while (open.size > 0 && iterations < maxIterations) {
    iterations += 1;
    const current = open.pop();
    if (current === goalIndex) {
      return reconstruct(cameFrom, cols, current, startIndex);
    }
    if (closed[current] === 1) continue;
    closed[current] = 1;

    const cx = current % cols;
    const cy = Math.floor(current / cols);

    for (const dir of DIRS) {
      const nx = cx + dir.dx;
      const ny = cy + dir.dy;
      if (!nav.inBounds(nx, ny) || nav.isBlocked(nx, ny)) continue;

      if (dir.dx !== 0 && dir.dy !== 0) {
        if (nav.isBlocked(cx + dir.dx, cy) || nav.isBlocked(cx, cy + dir.dy)) continue;
      }

      const neighbor = ny * cols + nx;
      if (closed[neighbor] === 1) continue;

      const tentative = gScore[current] + dir.cost;
      if (tentative < gScore[neighbor]) {
        cameFrom[neighbor] = current;
        gScore[neighbor] = tentative;
        fScore[neighbor] = tentative + heuristic(nx, ny, goal.x, goal.y);
        open.push(neighbor);
      }
    }
  }

  return [];
}

function reconstruct(cameFrom: Int32Array, cols: number, goalIndex: number, startIndex: number): TilePos[] {
  const path: TilePos[] = [];
  let current = goalIndex;
  while (current !== startIndex && current !== -1) {
    path.push({ x: current % cols, y: Math.floor(current / cols) });
    current = cameFrom[current];
  }
  path.reverse();
  return path;
}

export function nearestFreeTile(
  nav: NavGrid,
  tileX: number,
  tileY: number,
  maxRadius = 10,
): TilePos | undefined {
  if (!nav.isBlocked(tileX, tileY)) return { x: tileX, y: tileY };

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = tileX + dx;
        const y = tileY + dy;
        if (nav.inBounds(x, y) && !nav.isBlocked(x, y)) return { x, y };
      }
    }
  }
  return undefined;
}
