import * as THREE from "three";
import { TILE_SIZE } from "../config/world";
import { unitDef, def } from "../sim/selectors";
import type { Building, GameState, Unit } from "../sim/types";

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** One voxel = 0.25 world units (TILE_SIZE is 32px; world coords /32 for tile space). */
export const VOXEL_SCALE = 0.25;

export class VoxelAssets {
  /** Instance-colored mesh for a building footprint (flat-topped voxel). */
  static building(building: Building): THREE.Mesh {
    const d = def(building.type);
    const w = Math.max(1, d.tilesW) * VOXEL_SCALE;
    const h = Math.max(1, d.tilesH) * VOXEL_SCALE;
    const mesh = new THREE.Mesh(boxGeo, VoxelAssets.mat(building.owner, d.colors.body));
    mesh.scale.set(w, VOXEL_SCALE * 2, h);
    mesh.position.set(
      (building.x - building.width / 2) / TILE_SIZE,
      VOXEL_SCALE, // one-voxel height
      (building.y - building.height / 2) / TILE_SIZE,
    );
    return mesh;
  }

  /** Small colored block for a unit, floating slightly above the ground. */
  static unit(unit: Unit): THREE.Mesh {
    const d = unitDef(unit.type);
    const mesh = new THREE.Mesh(boxGeo, VoxelAssets.mat(unit.owner, d.color));
    mesh.scale.set(VOXEL_SCALE * 1.2, VOXEL_SCALE * 2, VOXEL_SCALE * 1.2);
    mesh.position.set(unit.x / TILE_SIZE, VOXEL_SCALE * 1.6, unit.y / TILE_SIZE);
    return mesh;
  }

  private static mat(owner: "player" | "enemy", color: number): THREE.MeshBasicMaterial {
    // player units slightly brighter so they read at a glance
    const tint = owner === "player" ? 1.15 : 0.9;
    const c = new THREE.Color(color).multiplyScalar(tint);
    return new THREE.MeshBasicMaterial({ color: c });
  }
}

/** Swap the terrain + entity meshes in one go from a GameState. */
export function syncEntities(group: THREE.Group, state: GameState): void {
  while (group.children.length) {
    const c = group.children[0] as THREE.Mesh;
    (c.material as THREE.MeshBasicMaterial)?.dispose?.();
    group.remove(c);
  }
  for (const b of state.players.player.buildings) {
    if (b.state === "destroyed") continue;
    group.add(VoxelAssets.building(b));
  }
  for (const b of state.players.enemy.buildings) {
    if (b.state === "destroyed") continue;
    group.add(VoxelAssets.building(b));
  }
  for (const u of [...state.players.player.units, ...state.players.enemy.units]) {
    if (u.state === "dead") continue;
    group.add(VoxelAssets.unit(u));
  }
}
