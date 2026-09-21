import { NavGrid } from "../sim/navgrid";

/**
 * Bridge-aware height layer on top of the 2D NavGrid used by pathfinding.
 *
 * - `ground[x,y]` = tile base height (>=1 is walkable ground; 0 is water/deep).
 * - `bridge[x,y]` = a bridge deck laid over the tile; passable at `bridgeHeight`.
 *
 * Pathfinding still runs on the 2D NavGrid (units don't pathfind in 3D), so this
 * structure only has to answer "is this tile walkable" and "how high is it"
 * for the renderer. Bridges let units cross water without detouring.
 */
export class VoxelNav {
  readonly cols: number;
  readonly rows: number;
  readonly bridgeHeight: number;
  private readonly ground: Uint8Array;
  private readonly bridge: Uint8Array;

  constructor(cols: number, rows: number, bridgeHeight = 2) {
    this.cols = cols;
    this.rows = rows;
    this.bridgeHeight = bridgeHeight;
    this.ground = new Uint8Array(cols * rows);
    this.bridge = new Uint8Array(cols * rows);
  }

  private index(x: number, y: number): number {
    return y * this.cols + x;
  }

  setGround(x: number, y: number, height: number): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.ground[this.index(x, y)] = height & 0xff;
  }

  setBridge(x: number, y: number, value: boolean): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    this.bridge[this.index(x, y)] = value ? 1 : 0;
  }

  heightAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return 0;
    const i = this.index(x, y);
    if (this.bridge[i] === 1) return this.bridgeHeight;
    return this.ground[i];
  }

  /** True when the tile has no ground (water), even if a bridge spans it. */
  isWater(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return this.ground[this.index(x, y)] === 0;
  }

  isBridge(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return this.bridge[this.index(x, y)] === 1;
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    const i = this.index(x, y);
    // walkable land, or a bridge deck over water
    return this.ground[i] > 0 || this.bridge[i] === 1;
  }

  /** Sync walkability (including bridge flag) into a flat 2D NavGrid so the
   *  existing A* pathfinder routes across bridges and never across water. */
  syncToNav(nav: NavGrid): void {
    nav.clear();
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (!this.isWalkable(x, y)) nav.setBlocked(x, y, true);
      }
    }
  }
}
