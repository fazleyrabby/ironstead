import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { VoxelNav } from "./VoxelNav";
import { VoxelWorld } from "./VoxelWorld";

/** Headless check: VoxelWorld meshes the nav correctly (no WebGL/context). */
describe("VoxelWorld.build", () => {
  it("draws water, ground, and a bridge deck from a VoxelNav", () => {
    const cols = 6;
    const rows = 6;
    const nav = new VoxelNav(cols, rows);

    // everything is water (height 0, unwalkable) except a 2-tile bridge path
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if (x === 2 && (y === 2 || y === 3)) {
          nav.setBridge(x, y, true); // bridge deck
        } else {
          // 1-tile ground island only at the bridge approach, rest is water
          if (x === 2 && y === 1) nav.setGround(x, y, 1);
          if (x === 2 && y === 4) nav.setGround(x, y, 1);
          // everything else stays ground=0 (water)
        }
      }
    }

    const world = new VoxelWorld(true);
    world.build(nav);

    const children = world.group.children;
    // meshes only (materials are not in the group)
    const meshes = children.filter((o) => (o as THREE.Mesh).isMesh) as THREE.Mesh[];
    const water = meshes.filter((m) => (m.material as THREE.MeshBasicMaterial).color.getHex() === 0x286ba8);
    const ground = meshes.filter((m) => (m.material as THREE.MeshBasicMaterial).color.getHex() === 0x8bc34a);
    const bridge = meshes.filter((m) => (m.material as THREE.MeshBasicMaterial).color.getHex() === 0x8b5a2b);

    expect(water.length).toBe(32); // 36 tiles - 2 bridge - 2 ground island
    expect(bridge.length).toBe(2); // exactly the two bridge deck tiles
    expect(ground.length).toBe(6); // 2 ground islands + 2 columns under each bridge tile
  });
});
