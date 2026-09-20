export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.blocked = new Uint8Array(cols * rows);
  }

  inBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < this.cols && tileY < this.rows;
  }

  isBlocked(tileX: number, tileY: number): boolean {
    if (!this.inBounds(tileX, tileY)) return true;
    return this.blocked[tileY * this.cols + tileX] === 1;
  }

  setBlocked(tileX: number, tileY: number, value: boolean): void {
    if (!this.inBounds(tileX, tileY)) return;
    this.blocked[tileY * this.cols + tileX] = value ? 1 : 0;
  }

  markRect(tileX: number, tileY: number, width: number, height: number, value: boolean): void {
    for (let y = tileY; y < tileY + height; y += 1) {
      for (let x = tileX; x < tileX + width; x += 1) {
        this.setBlocked(x, y, value);
      }
    }
  }

  isAreaFree(tileX: number, tileY: number, width: number, height: number): boolean {
    for (let y = tileY; y < tileY + height; y += 1) {
      for (let x = tileX; x < tileX + width; x += 1) {
        if (this.isBlocked(x, y)) return false;
      }
    }
    return true;
  }

  clear(): void {
    this.blocked.fill(0);
  }
}
