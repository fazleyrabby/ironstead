import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  PointLight,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import type { Scene } from "three";
import { VIEW3D } from "../config/atmosphere";
import { WORLD_HEIGHT, WORLD_WIDTH, worldToTile } from "../config/world";
import type { Camera } from "../render/Camera";
import type { Building, BuildingType, GameState } from "../sim/types";
import { isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Quality } from "./quality";

// Light radius in world units per lit building type; unlisted types cast no light.
const BUILDING_LIGHT: Partial<Record<BuildingType, number>> = {
  town_center: 250,
  house: 135,
  storage: 135,
  army_camp: 190,
  tower: 150,
  academy: 160,
};

function glowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.5)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

interface Lit {
  building: Building;
  radius: number;
  distance: number;
}

// Dusk rig: cool hemisphere fill, a low warm sun that casts the shadows, a
// small pool of point lights handed to the lit buildings nearest the camera,
// and additive halos / fireflies for the bloom pass to pick up.
export class Lights3D {
  private readonly sun: DirectionalLight;
  private readonly sunOffset: Vector3;
  private readonly points: PointLight[] = [];
  private readonly halos: Sprite[] = [];
  private readonly glow = glowTexture();
  private readonly scene: Scene;
  private readonly flies: Points;
  private readonly flyHomes: Float32Array;
  private readonly lit: Lit[] = [];

  constructor(scene: Scene, quality: Quality) {
    this.scene = scene;
    const { lighting, fireflies } = VIEW3D;

    scene.add(new HemisphereLight(lighting.sky, lighting.ground, lighting.hemisphere));

    this.sunOffset = new Vector3(...lighting.sunFrom).normalize().multiplyScalar(2200);
    this.sun = new DirectionalLight(lighting.sun, lighting.sunIntensity);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.camera.near = 200;
    this.sun.shadow.camera.far = 5200;
    scene.add(this.sun, this.sun.target);

    for (let i = 0; i < quality.pointLights; i += 1) {
      const light = new PointLight(lighting.buildingLight, 0, 1, 2);
      this.points.push(light);
      scene.add(light);
    }

    this.flyHomes = new Float32Array(fireflies * 4);
    let seed = 4242;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < fireflies; i += 1) {
      this.flyHomes.set([rand() * WORLD_WIDTH, rand() * WORLD_HEIGHT, rand() * Math.PI * 2, 0.4 + rand() * 0.6], i * 4);
    }
    const flyGeometry = new BufferGeometry();
    flyGeometry.setAttribute("position", new BufferAttribute(new Float32Array(fireflies * 3), 3));
    this.flies = new Points(
      flyGeometry,
      new PointsMaterial({
        map: this.glow,
        color: new Color(0xfff6d0),
        size: 9,
        opacity: 0.7,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.flies.frustumCulled = false;
    scene.add(this.flies);
  }

  update(state: GameState, visibility: VisibilityMap, camera: Camera, time: number): void {
    this.followCamera(camera);

    this.lit.length = 0;
    for (const id of ["player", "enemy"] as const) {
      for (const building of state.players[id].buildings) {
        const radius = BUILDING_LIGHT[building.type];
        if (radius === undefined || building.state !== "complete") continue;
        if (id === "enemy") {
          const tile = worldToTile(building.x, building.y);
          if (!isTileVisible(visibility, tile.x, tile.y)) continue;
        }
        const distance = Math.hypot(building.x - camera.target.x, building.y - camera.target.z);
        this.lit.push({ building, radius, distance });
      }
    }

    this.lit.forEach(({ building, radius }, i) => {
      const flicker = 1 + 0.05 * Math.sin(time * 6.3 + building.x * 0.37 + building.y * 0.11);
      const halo = this.halo(i);
      halo.visible = true;
      halo.position.set(building.x, 20, building.y + building.height * 0.4);
      halo.scale.setScalar(radius * 0.8 * flicker);
    });
    for (let i = this.lit.length; i < this.halos.length; i += 1) this.halos[i].visible = false;

    // Real point lights are costly, so only the nearest buildings get one.
    this.lit.sort((a, b) => a.distance - b.distance);
    this.points.forEach((light, i) => {
      const entry = this.lit[i];
      if (!entry) {
        light.intensity = 0;
        return;
      }
      const { building, radius } = entry;
      const flicker = 1 + 0.06 * Math.sin(time * 6.3 + building.x * 0.37 + building.y * 0.11);
      light.position.set(building.x, 58, building.y + building.height * 0.72);
      light.distance = radius * 1.9;
      light.intensity = radius * radius * 0.085 * flicker * VIEW3D.lighting.buildingLightStrength;
    });

    const positions = this.flies.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < positions.count; i += 1) {
      const t = time * this.flyHomes[i * 4 + 3] + this.flyHomes[i * 4 + 2];
      positions.setXYZ(
        i,
        this.flyHomes[i * 4] + Math.sin(t * 0.7) * 26,
        14 + Math.sin(t * 1.3) * 8,
        this.flyHomes[i * 4 + 1] + Math.cos(t * 0.9) * 18,
      );
    }
    positions.needsUpdate = true;
  }

  // Runtime fallback when the device cannot hold frame rate.
  disableShadows(): void {
    this.sun.castShadow = false;
  }

  // Keeps the shadow frustum centred on, and sized to, what the camera sees.
  private followCamera(camera: Camera): void {
    const extent = Math.min(2200, Math.max(520, 900 / camera.zoomLevel()));
    const shadowCamera = this.sun.shadow.camera;
    if (shadowCamera.right !== extent) {
      shadowCamera.left = -extent;
      shadowCamera.right = extent;
      shadowCamera.top = extent;
      shadowCamera.bottom = -extent;
      shadowCamera.updateProjectionMatrix();
    }
    this.sun.target.position.copy(camera.target);
    this.sun.position.copy(camera.target).add(this.sunOffset);
  }

  private halo(index: number): Sprite {
    let sprite = this.halos[index];
    if (!sprite) {
      sprite = new Sprite(
        new SpriteMaterial({
          map: this.glow,
          color: VIEW3D.lighting.buildingLight,
          opacity: 0.26 * VIEW3D.lighting.buildingLightStrength,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.halos.push(sprite);
      this.scene.add(sprite);
    }
    return sprite;
  }
}
