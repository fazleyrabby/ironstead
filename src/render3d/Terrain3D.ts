import { Application, Rectangle } from "pixi.js";
import type { Container } from "pixi.js";
import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import type { Scene, WebGLRenderer } from "three";
import { VIEW3D } from "../config/atmosphere";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";
import { buildWorldScene } from "../render/WorldScene";
import { addProps } from "./Props3D";

const GROUND_RESOLUTION = 1.5;
function strataTexture(): CanvasTexture {
  const width = 512;
  const height = 128;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bands: Array<[number, string]> = [
      [0, "#4f9a3a"],
      [7, "#3c7a2c"],
      [11, "#7a5636"],
      [44, "#62432a"],
      [78, "#4d4a52"],
      [108, "#38363f"],
    ];
    bands.forEach(([y, color], i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, y, width, (bands[i + 1]?.[0] ?? height) - y);
    });
    let seed = 99;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 260; i += 1) {
      const y = 12 + rand() * (height - 14);
      ctx.fillStyle = y > 78 ? "rgba(140,140,155,0.35)" : "rgba(40,26,14,0.3)";
      ctx.beginPath();
      ctx.ellipse(rand() * width, y, 2 + rand() * 7, 1 + rand() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.repeat.set(6, 1);
  return texture;
}

// The flat terrain art (grass, road, ponds, flowers) is still drawn with Pixi
// Graphics; it is rendered once here and copied into a plain 2D canvas.
async function bakeGround(ground: Container): Promise<HTMLCanvasElement> {
  const app = new Application();
  await app.init({ width: 8, height: 8, preference: "webgl", autoStart: false, antialias: true });
  const baked = app.renderer.extract.canvas({
    target: ground,
    frame: new Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT),
    resolution: GROUND_RESOLUTION,
    antialias: true,
  }) as HTMLCanvasElement;

  const canvas = document.createElement("canvas");
  canvas.width = baked.width;
  canvas.height = baked.height;
  canvas.getContext("2d")?.drawImage(baked, 0, 0);
  ground.destroy({ children: true });
  app.destroy(true);
  return canvas;
}

// Ground plane textured with the flat terrain art, the soil slab under it,
// and every tree and rock as instanced low-poly meshes.
export async function buildTerrain(scene: Scene, renderer: WebGLRenderer): Promise<void> {
  const { ground, props } = buildWorldScene();

  const map = new CanvasTexture(await bakeGround(ground));
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const plane = new Mesh(new PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT), new MeshLambertMaterial({ map }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);
  plane.receiveShadow = true;
  scene.add(plane);

  const { depth } = VIEW3D.slab;
  const slab = new Mesh(
    new BoxGeometry(WORLD_WIDTH, depth, WORLD_HEIGHT),
    new MeshLambertMaterial({ map: strataTexture() }),
  );
  slab.position.set(WORLD_WIDTH / 2, -depth / 2 - 0.2, WORLD_HEIGHT / 2);
  scene.add(slab);

  addProps(scene, props);
}
