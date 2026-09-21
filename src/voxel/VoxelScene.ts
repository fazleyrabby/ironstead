import * as THREE from "three";
import { GRID_COLS, GRID_ROWS } from "../config/world";
import { VoxelNav } from "./VoxelNav";
import { VoxelWorld } from "./VoxelWorld";
import { syncEntities } from "./VoxelAssets";
import type { GameState } from "../sim/types";

const LOWRES_W = 320;
const LOWRES_H = 180;

/**
 * Minimal Three.js scene that renders the VoxelWorld at a low, pixelated
 * resolution upscaled to the screen — the "sharp but simple" HD look from the
 * Mono clip. Water + reflections can be layered in here later.
 */
export class VoxelScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly world: VoxelWorld;
  readonly entities: THREE.Group;
  private readonly composeRoot: HTMLElement;
  readonly nav: VoxelNav;

  constructor(composeRoot: HTMLElement, cols = GRID_COLS, rows = GRID_ROWS) {
    this.composeRoot = composeRoot;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.makeCanvas(), antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(LOWRES_W, LOWRES_H);
    this.renderer.setClearColor(0x202024);

    this.scene = new THREE.Scene();
    const sky = new THREE.Color(0x404048);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 30, 60);

    this.camera = new THREE.PerspectiveCamera(45, LOWRES_W / LOWRES_H, 0.1, 200);
    this.camera.position.set(24, 22, 28);
    this.camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(-10, 20, -10);
    this.scene.add(sun);

    this.world = new VoxelWorld(false);
    this.scene.add(this.world.group);

    this.entities = new THREE.Group();
    this.scene.add(this.entities);

    this.nav = new VoxelNav(cols, rows);
    this.composeRoot.appendChild(this.renderer.domElement);
  }

  private makeCanvas(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.style.imageRendering = "pixelated";
    c.style.width = "100%";
    c.style.height = "100%";
    return c;
  }

  /** Re-render entity meshes from a GameState (call once per sim step). */
  renderState(state: GameState): void {
    syncEntities(this.entities, state);
  }

  /** Render the low-res scene. The canvas is CSS-pixel-scaled and
   *  pixelated, giving the sharp-but-simple HD look. */
  render(): void {
    this.renderer.render(this.scene, this.camera);
    const el = this.renderer.domElement;
    el.width = LOWRES_W;
    el.height = LOWRES_H;
  }

  dispose(): void {
    this.composeRoot.removeChild(this.renderer.domElement);
    this.renderer.dispose();
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
  }
}
