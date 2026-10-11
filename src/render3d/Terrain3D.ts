import { Graphics, Rectangle } from "pixi.js";
import {
  BoxGeometry,
  CanvasTexture,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Scene, WebGLRenderer } from "three";
import { VIEW3D } from "../config/atmosphere";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config/world";
import { buildWorldScene, drawProp } from "../render/WorldScene";
import type { PropInstance, PropKind } from "../render/WorldScene";
import type { Atlas } from "./Atlas";
import { billboardMaterials } from "./QuadBatch";

const GROUND_RESOLUTION = 1.5;
// Props are baked once at this nominal size and scaled per instance.
const PROP_BAKE_SIZE = 16;
const PROP_BAKE_RESOLUTION = 6;
const TREES: ReadonlySet<PropKind> = new Set<PropKind>(["round", "round_autumn", "pine", "birch", "dead"]);

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

function addProps(scene: Scene, bakery: Atlas, props: PropInstance[]): void {
  const { stretch, treeScale, propScale } = VIEW3D.billboard;
  const byKind = new Map<PropKind, PropInstance[]>();
  for (const prop of props) {
    const list = byKind.get(prop.kind) ?? [];
    list.push(prop);
    byKind.set(prop.kind, list);
  }

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const upright = new Quaternion();

  for (const [kind, list] of byKind) {
    const art = new Graphics();
    drawProp(art, kind, PROP_BAKE_SIZE);
    const bounds = art.getLocalBounds();
    const frame = new Rectangle(
      Math.floor(bounds.x) - 2,
      Math.floor(bounds.y) - 2,
      Math.ceil(bounds.width) + 4,
      Math.ceil(bounds.height) + 4,
    );
    const texture = new CanvasTexture(bakery.bake(art, frame, PROP_BAKE_RESOLUTION));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    art.destroy();

    const geometry = new PlaneGeometry(1, 1);
    geometry.translate(0, 0.5, 0);
    const normals = geometry.attributes.normal;
    for (let i = 0; i < normals.count; i += 1) normals.setXYZ(i, 0, 1, 0);

    const { material, depth } = billboardMaterials(texture);
    const mesh = new InstancedMesh(geometry, material, list.length);
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const boost = TREES.has(kind) ? treeScale : propScale;
    const centreX = frame.x + frame.width / 2;
    const baseY = frame.y + frame.height;
    list.forEach((prop, i) => {
      const unit = prop.size / PROP_BAKE_SIZE;
      const s = unit * boost;
      position.set(prop.x + centreX * s, 0, prop.y + baseY * unit);
      scale.set(frame.width * s, frame.height * s * stretch, 1);
      mesh.setMatrixAt(i, matrix.compose(position, upright, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}

// Ground plane textured with the flat 2D terrain art, the soil slab under it,
// and every standing prop as an instanced billboard.
export function buildTerrain(scene: Scene, renderer: WebGLRenderer, bakery: Atlas): void {
  const { ground, props } = buildWorldScene();

  const canvas = bakery.bake(ground, new Rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT), GROUND_RESOLUTION);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  ground.destroy({ children: true });

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

  addProps(scene, bakery, props);
}
