import { Sprite, SpriteMaterial } from "three";
import type { Scene } from "three";

const HEIGHT = 4.2;

function barMaterial(color: number, opacity = 1): SpriteMaterial {
  return new SpriteMaterial({ color, opacity, transparent: opacity < 1, depthTest: false, depthWrite: false });
}

// Pooled camera-facing bars: health over units and buildings, build progress.
export class Bars3D {
  private readonly scene: Scene;
  private readonly back = barMaterial(0x000000, 0.6);
  private readonly fills = {
    good: barMaterial(0x7ee081),
    warn: barMaterial(0xf2c14e),
    bad: barMaterial(0xef4444),
  };
  private readonly pool: Array<{ back: Sprite; fill: Sprite }> = [];
  private used = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  begin(): void {
    this.used = 0;
  }

  // A bar centred above (x, y, z); `tone` overrides the ratio-based colour.
  add(x: number, y: number, z: number, width: number, ratio: number, tone?: "good" | "warn" | "bad"): void {
    let bar = this.pool[this.used];
    if (!bar) {
      const back = new Sprite(this.back);
      const fill = new Sprite(this.fills.good);
      // Anchor the fill at its left edge so it shrinks toward the left.
      fill.center.set(0, 0.5);
      back.renderOrder = 20;
      fill.renderOrder = 21;
      bar = { back, fill };
      this.pool.push(bar);
      this.scene.add(back, fill);
    }
    this.used += 1;

    const clamped = Math.max(0, Math.min(1, ratio));
    bar.back.visible = true;
    bar.back.position.set(x, y, z);
    bar.back.scale.set(width + 2, HEIGHT + 2, 1);

    bar.fill.visible = clamped > 0;
    bar.fill.material = this.fills[tone ?? (clamped > 0.55 ? "good" : clamped > 0.25 ? "warn" : "bad")];
    bar.fill.position.set(x - width / 2, y, z);
    bar.fill.scale.set(Math.max(0.001, width * clamped), HEIGHT, 1);
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i += 1) {
      this.pool[i].back.visible = false;
      this.pool[i].fill.visible = false;
    }
  }
}
