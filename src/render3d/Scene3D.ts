import { Color, Fog, PCFSoftShadowMap, Scene, WebGLRenderer } from "three";
import { VIEW3D } from "../config/atmosphere";
import { GRID_COLS, GRID_ROWS } from "../config/world";
import { Camera } from "../render/Camera";
import type { PlacementResult } from "../sim/placement";
import type { GameState } from "../sim/types";
import type { VisibilityMap } from "../sim/visibility";
import { Bars3D } from "./Bars3D";
import { Buildings3D } from "./Buildings3D";
import { Fog3D } from "./Fog3D";
import { Lights3D } from "./Lights3D";
import { Overlays3D } from "./Overlays3D";
import { PostFX3D } from "./PostFX3D";
import { buildTerrain } from "./Terrain3D";
import { Units3D } from "./Units3D";

// Owns the Three.js scene: terrain, low-poly models, lighting and post-FX.
export class Scene3D {
  readonly canvas: HTMLCanvasElement;
  readonly camera = new Camera();

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly haze: Fog;
  private readonly post: PostFX3D;
  private readonly fog: Fog3D;
  private readonly lights: Lights3D;
  private readonly overlays: Overlays3D;
  private readonly bars: Bars3D;
  private readonly units: Units3D;
  private readonly buildings: Buildings3D;
  private width = 0;
  private height = 0;

  private constructor() {
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;

    const { background, haze } = VIEW3D.lighting;
    this.scene.background = new Color(background);
    this.haze = new Fog(haze, 1000, 5000);
    this.scene.fog = this.haze;

    this.bars = new Bars3D(this.scene);
    this.buildings = new Buildings3D(this.scene, this.bars);
    this.units = new Units3D(this.scene, this.bars);
    this.lights = new Lights3D(this.scene);
    this.overlays = new Overlays3D(this.scene);
    this.fog = new Fog3D(this.scene, GRID_COLS, GRID_ROWS);
    this.post = new PostFX3D(this.renderer, this.scene, this.camera.three);
  }

  static async create(): Promise<Scene3D> {
    const scene = new Scene3D();
    await buildTerrain(scene.scene, scene.renderer);
    return scene;
  }

  resize(width: number, height: number): void {
    // A hidden tab reports a 0x0 window; never size framebuffers below 2px.
    this.width = width;
    this.height = height;
    width = Math.max(2, width);
    height = Math.max(2, height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.post.resize(width, height, pixelRatio);
    this.camera.resize(width, height);
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

    this.bars.begin();
    this.buildings.update(state, visibility);
    this.units.update(state, visibility, nowSec, frameDt);
    this.bars.end();
    this.overlays.update(state, placement);
    this.lights.update(state, visibility, this.camera, nowSec);
    this.fog.update(visibility);

    // Distance haze starts just behind the focus point.
    const distance = this.camera.distance();
    this.haze.near = distance * 1.15;
    this.haze.far = distance * 3.2;

    this.post.render(this.camera.zoomLevel());
  }
}
