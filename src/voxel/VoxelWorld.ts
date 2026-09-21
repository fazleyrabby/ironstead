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
  private readonly groundMat: THREE.MeshLambertMaterial;
  private readonly waterMat: THREE.MeshLambertMaterial;
  private readonly bridgeMat: THREE.MeshLambertMaterial;

  constructor(debug = false) {
    this.group = new THREE.Group();
    this.groundMat = new THREE.MeshLambertMaterial({ color: 0x8bc34a, wireframe: debug });
    this.waterMat = new THREE.MeshLambertMaterial({
      color: 0x2f7fc4,
      emissive: 0x0a2540,
      transparent: true,
      opacity: 0.85,
      wireframe: debug,
    });
    this.bridgeMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b, wireframe: debug });
  }

  /** Rebuild terrain from a VoxelNav: one ground slab, water tiles on top,
   *  and bridge decks over water. Far fewer meshes than per-tile ground. */
  build(nav: VoxelNav): void {
    while (this.group.children.length) {
      const child = this.group.children[0] as THREE.Mesh;
      this.group.remove(child);
      child.geometry?.dispose?.();
    }

    const GROUND_TOP = TILE; // ground surface height in world units

    // one big ground slab
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(nav.cols * TILE, GROUND_TOP, nav.rows * TILE),
      this.groundMat,
    );
    ground.position.set(0, GROUND_TOP / 2, 0);
    this.group.add(ground);

    const waterGeo = new THREE.BoxGeometry(TILE * 0.96, 0.18, TILE * 0.96);
    const deckGeo = new THREE.BoxGeometry(TILE * 1.06, 0.2, TILE * 1.06);

    for (let y = 0; y < nav.rows; y += 1) {
      for (let x = 0; x < nav.cols; x += 1) {
        const wx = (x - nav.cols / 2) * TILE;
        const wz = (y - nav.rows / 2) * TILE;

        if (nav.isWater(x, y)) {
          const m = new THREE.Mesh(waterGeo, this.waterMat);
          m.position.set(wx, GROUND_TOP + 0.06, wz);
          this.group.add(m);
        }
        if (nav.isBridge(x, y)) {
          const m = new THREE.Mesh(deckGeo, this.bridgeMat);
          m.position.set(wx, GROUND_TOP + 0.4, wz);
          this.group.add(m);
        }
      }
    }
  }
}
