import { Container, Graphics } from "pixi.js";
import { PALETTE } from "../config/world";
import type { PlayerId, Projectile } from "../sim/types";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

export class ProjectileRenderer {
  private readonly layer: Container;
  private readonly entries = new Map<string, Container>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  update(projectiles: Projectile[]): void {
    const seen = new Set<string>();

    for (const projectile of projectiles) {
      seen.add(projectile.id);
      let container = this.entries.get(projectile.id);
      if (!container) {
        container = makeBolt(projectile.owner);
        this.layer.addChild(container);
        this.entries.set(projectile.id, container);
      }
      container.position.set(projectile.x, projectile.y);
    }

    for (const [id, container] of this.entries) {
      if (seen.has(id)) continue;
      container.destroy({ children: true });
      this.entries.delete(id);
    }
  }
}

function makeBolt(owner: PlayerId): Container {
  const container = new Container();
  const graphics = new Graphics();
  graphics.circle(0, 0, 4).fill(FACTION_COLORS[owner]);
  graphics.circle(0, 0, 4).stroke({ width: 1.5, color: PALETTE.outline, alpha: 0.8 });
  graphics.circle(0, 0, 1.6).fill(0xffffff);
  container.addChild(graphics);
  return container;
}
