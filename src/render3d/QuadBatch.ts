import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshDepthMaterial,
  MeshLambertMaterial,
  RGBADepthPacking,
} from "three";
import type { Texture } from "three";
import { VIEW3D } from "../config/atmosphere";
import type { UvRect } from "./Atlas";

// Lit, shadow-casting cut-out material shared by every sprite billboard.
// Normals point up so sprites take the same light as the ground they stand on.
export function billboardMaterials(map: Texture): {
  material: MeshLambertMaterial;
  depth: MeshDepthMaterial;
} {
  const { alphaTest } = VIEW3D.billboard;
  const material = new MeshLambertMaterial({ map, alphaTest, side: DoubleSide });
  material.shadowSide = DoubleSide;
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map, alphaTest });
  return { material, depth };
}

// A dynamic mesh of textured quads, rebuilt every frame.
export class QuadBatch {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly uvs: Float32Array;
  private readonly geometry = new BufferGeometry();
  private readonly max: number;
  private count = 0;

  constructor(map: Texture, maxQuads: number) {
    this.max = maxQuads;
    this.positions = new Float32Array(maxQuads * 12);
    this.uvs = new Float32Array(maxQuads * 8);
    const normals = new Float32Array(maxQuads * 12);
    const indices = new Uint16Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i += 1) {
      for (let v = 0; v < 4; v += 1) normals[i * 12 + v * 3 + 1] = 1;
      indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }

    const position = new BufferAttribute(this.positions, 3);
    position.setUsage(DynamicDrawUsage);
    const uv = new BufferAttribute(this.uvs, 2);
    uv.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("position", position);
    this.geometry.setAttribute("uv", uv);
    this.geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    this.geometry.setIndex(new BufferAttribute(indices, 1));

    const { material, depth } = billboardMaterials(map);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.customDepthMaterial = depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  begin(): void {
    this.count = 0;
  }

  // Vertical quad facing the camera; extents are relative to (x, 0, z).
  upright(x: number, z: number, left: number, right: number, bottom: number, top: number, uv: UvRect): void {
    this.push(x - left, bottom, z, x + right, bottom, z, x + right, top, z, x - left, top, z, uv);
  }

  // Horizontal quad lying on the ground; image top points north (-z).
  flat(x0: number, z0: number, x1: number, z1: number, y: number, uv: UvRect): void {
    this.push(x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0, uv);
  }

  end(): void {
    this.geometry.setDrawRange(0, this.count * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
  }

  private push(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    uv: UvRect,
  ): void {
    if (this.count >= this.max) return;
    const p = this.count * 12;
    this.positions.set([ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz], p);
    const [u0, v0, u1, v1] = uv;
    this.uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], this.count * 8);
    this.count += 1;
  }
}
