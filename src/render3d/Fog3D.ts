import {
  CanvasTexture,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import type { Scene } from "three";
import { VIEW3D } from "../config/atmosphere";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";
import type { VisibilityMap } from "../sim/visibility";

const UNEXPLORED = "rgba(7, 9, 18, 1)";
const EXPLORED = "rgba(7, 9, 18, 0.52)";
// The fog sheet floats at mid-sprite height so it hides trees as well as
// ground; it is shifted south so it still lines up with the tiles below it.
const SHEET_HEIGHT = 24;
// The sheet overhangs the map so border trees never poke out past its edge.
const MARGIN = 260;

export class Fog3D {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private lastVersion = -1;

  constructor(scene: Scene, cols: number, rows: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = cols;
    this.canvas.height = rows;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = SRGBColorSpace;
    // Clamped edge texels stretch across the overhang.
    this.texture.repeat.set((WORLD_WIDTH + MARGIN * 2) / WORLD_WIDTH, (WORLD_HEIGHT + MARGIN * 2) / WORLD_HEIGHT);
    this.texture.offset.set(-MARGIN / WORLD_WIDTH, -MARGIN / WORLD_HEIGHT);

    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    const sheet = new Mesh(new PlaneGeometry(WORLD_WIDTH + MARGIN * 2, WORLD_HEIGHT + MARGIN * 2), material);
    sheet.rotation.x = -Math.PI / 2;
    const shift = SHEET_HEIGHT / Math.tan(MathUtils.degToRad(VIEW3D.camera.pitch));
    sheet.position.set(WORLD_WIDTH / 2, SHEET_HEIGHT, WORLD_HEIGHT / 2 + shift);
    sheet.renderOrder = 100;
    scene.add(sheet);
  }

  update(map: VisibilityMap): void {
    if (map.version === this.lastVersion) return;
    this.lastVersion = map.version;

    const { ctx } = this;
    const width = map.cols;
    const height = map.rows;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = UNEXPLORED;
    ctx.beginPath();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (map.visible[i] === 1 || map.explored[i] === 1) continue;
        ctx.rect(x, y, 1, 1);
      }
    }
    ctx.fill();

    ctx.fillStyle = EXPLORED;
    ctx.beginPath();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (map.visible[i] === 1 || map.explored[i] === 0) continue;
        ctx.rect(x, y, 1, 1);
      }
    }
    ctx.fill();

    this.texture.needsUpdate = true;
  }
}
