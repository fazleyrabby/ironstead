import { Color, Fog, PCFShadowMap, Scene, WebGLRenderer } from "three";
import { VIEW3D } from "../config/atmosphere";
import { GRID_COLS, GRID_ROWS } from "../config/world";
import { Camera } from "../render/Camera";
import type { PlacementResult } from "../sim/placement";
import type { GameState } from "../sim/types";
import type { VisibilityMap } from "../sim/visibility";
import { Bars3D } from "./Bars3D";
import { Buildings3D } from "./Buildings3D";
import { setModelRoundness, swayTime } from "./geo";
import { Fog3D } from "./Fog3D";
import { Lights3D } from "./Lights3D";
import { Overlays3D } from "./Overlays3D";
import { PostFX3D } from "./PostFX3D";
import { detectQuality } from "./quality";
import type { Quality } from "./quality";
import { buildTerrain } from "./Terrain3D";
import { Units3D } from "./Units3D";

// Adaptive resolution: drop below TARGET_LOW fps and the canvas renders at a
// lower pixel ratio; hold TARGET_HIGH and it climbs back.
const TARGET_LOW = 45;
const TARGET_HIGH = 57;
const MIN_SCALE = 0.6;

// Owns the Three.js scene: terrain, low-poly models, lighting and post-FX.
export class Scene3D {
  readonly canvas: HTMLCanvasElement;
  readonly camera = new Camera();

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly haze: Fog;
  readonly quality: Quality = detectQuality();
  private post?: PostFX3D;
  private readonly fog: Fog3D;
  private readonly lights: Lights3D;
  private readonly overlays: Overlays3D;
  private readonly bars: Bars3D;
  private readonly units: Units3D;
  private readonly buildings: Buildings3D;
  private width = 0;
  private height = 0;
  private scale = 1;
  private fps = 60;
  private slowFor = 0;
  private fastFor = 0;
  private upscaleLock = 0;

  private constructor() {
    const { quality } = this;
    setModelRoundness(quality.tier === "high" ? 2 : quality.tier === "medium" ? 1 : 0);
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.canvas = this.renderer.domElement;
    // Counted per frame (reset in render) so stats cover every pass.
    this.renderer.info.autoReset = false;

    const { background, haze } = VIEW3D.lighting;
    this.scene.background = new Color(background);
    this.haze = new Fog(haze, 1000, 5000);
    this.scene.fog = this.haze;

    this.bars = new Bars3D(this.scene);
    this.buildings = new Buildings3D(this.scene, this.bars);
    this.units = new Units3D(this.scene, this.bars, quality);
    this.lights = new Lights3D(this.scene, quality);
    this.overlays = new Overlays3D(this.scene);
    this.fog = new Fog3D(this.scene, GRID_COLS, GRID_ROWS);
    if (quality.bloom || quality.tiltShift) {
      this.post = new PostFX3D(this.renderer, this.scene, this.camera.three, quality);
    }
  }

  static async create(): Promise<Scene3D> {
    const scene = new Scene3D();
    await buildTerrain(scene.scene, scene.renderer, scene.quality);
    return scene;
  }

  resize(width: number, height: number): void {
    // A hidden tab reports a 0x0 window; never size framebuffers below 2px.
    this.width = width;
    this.height = height;
    width = Math.max(2, width);
    height = Math.max(2, height);
    const pixelRatio = this.quality.pixelRatio * this.scale;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.post?.resize(width, height, pixelRatio);
    this.camera.resize(width, height);
  }

  // Live numbers for tuning: tier, resolution scale, smoothed fps, draw load.
  stats(): { tier: string; scale: number; fps: number; calls: number; triangles: number } {
    const { calls, triangles } = this.renderer.info.render;
    return { tier: this.quality.tier, scale: this.scale, fps: Math.round(this.fps), calls, triangles };
  }

  // Trades resolution, then effects, for frame rate on devices that fall behind.
  private adapt(frameDt: number): void {
    // Ignore stalls from tab switches and loading hitches.
    if (frameDt <= 0 || frameDt > 0.1) return;
    this.fps += (1 / frameDt - this.fps) * 0.05;
    this.upscaleLock = Math.max(0, this.upscaleLock - frameDt);

    if (this.fps < TARGET_LOW) {
      this.slowFor += frameDt;
      this.fastFor = 0;
    } else if (this.fps > TARGET_HIGH) {
      this.fastFor += frameDt;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }

    if (this.slowFor > 1.5) {
      this.slowFor = 0;
      this.upscaleLock = 20;
      if (this.scale > MIN_SCALE) {
        this.scale = Math.max(MIN_SCALE, this.scale * 0.85);
        this.resize(this.width, this.height);
      } else if (this.post) {
        this.post = undefined;
      } else if (this.renderer.shadowMap.enabled) {
        this.renderer.shadowMap.enabled = false;
        this.lights.disableShadows();
      }
    } else if (this.fastFor > 5 && this.scale < 1 && this.upscaleLock === 0) {
      this.fastFor = 0;
      this.upscaleLock = 10;
      this.scale = Math.min(1, this.scale * 1.1);
      this.resize(this.width, this.height);
    }
  }

  render(
    state: GameState,
    visibility: VisibilityMap,
    placement: PlacementResult | null,
    nowSec: number,
    frameDt: number,
  ): void {
    if (window.innerWidth !== this.width || window.innerHeight !== this.height) {
      this.resize(window.innerWidth, window.innerHeight);
    }

    this.adapt(frameDt);
    this.renderer.info.reset();

    this.bars.begin();
    swayTime.value = nowSec;
    this.buildings.update(state, visibility, frameDt);
    this.units.update(state, visibility, nowSec, frameDt);
    this.bars.end();
    this.overlays.update(state, placement, this.units);
    this.lights.update(state, visibility, this.camera, nowSec);
    this.fog.update(visibility);

    // Distance haze starts just behind the focus point.
    const distance = this.camera.distance();
    this.haze.near = distance * 1.15;
    this.haze.far = distance * 3.2;

    if (this.post) this.post.render(this.camera.zoomLevel());
    else this.renderer.render(this.scene, this.camera.three);
  }
}
