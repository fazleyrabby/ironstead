import { Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";
import type { Renderer } from "pixi.js";
import { ATMOSPHERE } from "../config/atmosphere";
import { WORLD_HEIGHT, WORLD_WIDTH, worldToTile } from "../config/world";
import type { Building, BuildingType, GameState } from "../sim/types";
import { isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";

// Light radius in px per lit building type; unlisted types cast no light.
const BUILDING_LIGHT: Partial<Record<BuildingType, number>> = {
  town_center: 250,
  house: 135,
  storage: 135,
  army_camp: 190,
  tower: 150,
  academy: 160,
};

let cachedGlow: Texture | undefined;

function glowTexture(): Texture {
  if (cachedGlow) return cachedGlow;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.14)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  cachedGlow = Texture.from(canvas);
  return cachedGlow;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Firefly {
  sprite: Sprite;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

// Dusk lighting: an ambient-tinted light map is multiplied over the world and
// warm lights punch holes in it. A second additive pass adds the visible halo.
export class LightRenderer {
  private readonly renderer: Renderer;
  private readonly mapRoot = new Container();
  private readonly mapLights = new Container();
  private readonly mapTexture: RenderTexture;
  private readonly glowLayer = new Container();
  private readonly mapPool: Sprite[] = [];
  private readonly glowPool: Sprite[] = [];
  private readonly fireflies: Firefly[] = [];
  private mapUsed = 0;
  private glowUsed = 0;

  constructor(layer: Container, renderer: Renderer) {
    this.renderer = renderer;
    const { lighting, fireflies } = ATMOSPHERE;

    const ambient = new Graphics().rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(lighting.ambient);
    this.mapRoot.addChild(ambient, this.mapLights);
    this.mapRoot.scale.set(lighting.mapScale);

    this.mapTexture = RenderTexture.create({
      width: Math.ceil(WORLD_WIDTH * lighting.mapScale),
      height: Math.ceil(WORLD_HEIGHT * lighting.mapScale),
      resolution: 1,
    });

    const shade = new Sprite(this.mapTexture);
    shade.width = WORLD_WIDTH;
    shade.height = WORLD_HEIGHT;
    shade.blendMode = "multiply";
    layer.addChild(shade, this.glowLayer);

    const rand = mulberry32(4242);
    for (let i = 0; i < fireflies; i += 1) {
      const sprite = new Sprite(glowTexture());
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.tint = 0xe8ff9a;
      sprite.width = sprite.height = 14;
      this.glowLayer.addChild(sprite);
      this.fireflies.push({
        sprite,
        x: rand() * WORLD_WIDTH,
        y: rand() * WORLD_HEIGHT,
        phase: rand() * Math.PI * 2,
        speed: 0.4 + rand() * 0.6,
      });
    }
  }

  update(state: GameState, visibility: VisibilityMap, time: number): void {
    const { lighting } = ATMOSPHERE;
    this.mapUsed = 0;
    this.glowUsed = 0;

    for (const id of ["player", "enemy"] as const) {
      for (const building of state.players[id].buildings) {
        const radius = BUILDING_LIGHT[building.type];
        if (radius === undefined || building.state !== "complete") continue;
        if (id === "enemy" && !this.seen(building, visibility)) continue;

        const flicker = 1 + 0.035 * Math.sin(time * 6.3 + building.x * 0.37 + building.y * 0.11);
        this.addMapLight(building.x, building.y, radius * flicker, lighting.buildingLight, 1);
        this.addGlow(building.x, building.y, radius * 0.55 * flicker, lighting.buildingLight, 0.2);
      }
    }

    for (const unit of state.players.player.units) {
      if (unit.state === "dead") continue;
      this.addMapLight(unit.x, unit.y, lighting.unitRadius, lighting.unitLight, lighting.unitIntensity);
    }

    for (let i = this.mapUsed; i < this.mapPool.length; i += 1) this.mapPool[i].visible = false;
    for (let i = this.glowUsed; i < this.glowPool.length; i += 1) this.glowPool[i].visible = false;

    for (const fly of this.fireflies) {
      const t = time * fly.speed + fly.phase;
      fly.sprite.position.set(fly.x + Math.sin(t * 0.7) * 26, fly.y + Math.cos(t * 0.9) * 18);
      fly.sprite.alpha = 0.25 + 0.55 * Math.max(0, Math.sin(t * 1.6));
    }

    this.renderer.render({ container: this.mapRoot, target: this.mapTexture, clear: true });
  }

  private seen(building: Building, visibility: VisibilityMap): boolean {
    const tile = worldToTile(building.x, building.y);
    return isTileVisible(visibility, tile.x, tile.y);
  }

  private addMapLight(x: number, y: number, radius: number, tint: number, alpha: number): void {
    const sprite = this.take(this.mapPool, this.mapLights, this.mapUsed);
    this.mapUsed += 1;
    this.place(sprite, x, y, radius, tint, alpha);
  }

  private addGlow(x: number, y: number, radius: number, tint: number, alpha: number): void {
    const sprite = this.take(this.glowPool, this.glowLayer, this.glowUsed);
    this.glowUsed += 1;
    this.place(sprite, x, y, radius, tint, alpha);
  }

  private take(pool: Sprite[], parent: Container, index: number): Sprite {
    let sprite = pool[index];
    if (!sprite) {
      sprite = new Sprite(glowTexture());
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      parent.addChild(sprite);
      pool.push(sprite);
    }
    return sprite;
  }

  private place(sprite: Sprite, x: number, y: number, radius: number, tint: number, alpha: number): void {
    sprite.visible = true;
    sprite.position.set(x, y);
    sprite.width = sprite.height = radius * 2;
    sprite.tint = tint;
    sprite.alpha = alpha;
  }
}
