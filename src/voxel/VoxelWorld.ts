import * as THREE from "three";
import type { VoxelNav } from "./VoxelNav";

const TILE = 1; // one unit per tile; renderer scales to screen

/**
 * Proof-of-concept mesh layer:
 *  - solid ground faces as 1x1x1 boxes stacked per tile
 *  - water cells (height 0, unwalkable) get a flat surface at y=0
 *  - bridge decks drawn as thin horizontal slabs at `bridgeHeight`
 */
export class VoxelWorld {
  readonly group: THREE.Group;
  private readonly groundMat: THREE.MeshBasicMaterial;
  private readonly waterMat: THREE.MeshBasicMaterial;
  private readonly bridgeMat: THREE.MeshBasicMaterial;

  constructor(debug = false) {
    this.group = new THREE.Group();
    this.groundMat = new THREE.MeshBasicMaterial({ color: 0x8bc34a, wireframe: debug });
    this.waterMat = new THREE.MeshBasicMaterial({
      color: 0x286ba8,
      transparent: true,
      opacity: 0.55,
      wireframe: debug,
    });
    this.bridgeMat = new THREE.MeshBasicMaterial({ color: 0x8b5a2b, wireframe: debug });
  }

  /** Rebuild meshes from a VoxelNav. */
  build(nav: VoxelNav): void {
    const mats = new Set([this.groundMat, this.waterMat, this.bridgeMat]);
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      if (!mats.has(child as any)) (child as any).geometry?.dispose?.();
    }

    const boxGeo = new THREE.BoxGeometry(TILE, TILE, TILE);
    const slabGeo = new THREE.BoxGeometry(TILE, 0.25, TILE);

    for (let y = 0; y < nav.rows; y += 1) {
      for (let x = 0; x < nav.cols; x += 1) {
        const h = nav.heightAt(x, y);
        const bridge = this.isBridgeTile(nav, x, y);
        const isWater = h === 0 && !bridge;

        if (isWater) {
          const m = new THREE.Mesh(boxGeo, this.waterMat);
          m.position.set((x - nav.cols / 2) * TILE, 0, (y - nav.rows / 2) * TILE);
          this.group.add(m);
          continue;
        }

        for (let z = 0; z < h; z += 1) {
          const m = new THREE.Mesh(boxGeo, this.groundMat);
          m.position.set(
            (x - nav.cols / 2) * TILE,
            z * TILE,
            (y - nav.rows / 2) * TILE,
          );
          this.group.add(m);
        }

        if (bridge) {
          const deckY = nav.bridgeHeight * TILE;
          const m = new THREE.Mesh(slabGeo, this.bridgeMat);
          m.position.set(
            (x - nav.cols / 2) * TILE,
            deckY,
            (y - nav.rows / 2) * TILE,
          );
          this.group.add(m);
        }
      }
    }
  }

  private isBridgeTile(nav: VoxelNav, x: number, y: number): boolean {
    return nav.isWalkable(x, y) && nav.heightAt(x, y) === nav.bridgeHeight;
  }
}
