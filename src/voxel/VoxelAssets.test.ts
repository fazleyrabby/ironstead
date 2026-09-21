import { describe, expect, it } from "vitest";
import { BUILDINGS } from "../config/buildings";
import { UNITS } from "../config/units";
import type { Building, BuildingType, Unit, UnitType } from "../sim/types";
import { buildingModel, unitModel, syncEntities } from "./VoxelAssets";
import * as THREE from "three";
import { EventBus } from "../core/EventBus";
import { Game } from "../sim/Game";

function fakeBuilding(type: BuildingType, owner: "player" | "enemy" = "player"): Building {
  return { type, owner, x: 0, y: 0 } as Building;
}
function fakeUnit(type: UnitType, owner: "player" | "enemy" = "player"): Unit {
  return { type, owner, x: 0, y: 0 } as Unit;
}

describe("VoxelAssets models", () => {
  it("builds a multi-block model for every building type", () => {
    for (const type of Object.keys(BUILDINGS) as BuildingType[]) {
      const model = buildingModel(fakeBuilding(type));
      expect(model.children.length, `${type} blocks`).toBeGreaterThanOrEqual(2);
    }
  });

  it("builds a multi-block model for every unit type", () => {
    for (const type of Object.keys(UNITS) as UnitType[]) {
      const model = unitModel(fakeUnit(type));
      expect(model.children.length, `${type} blocks`).toBeGreaterThanOrEqual(3);
    }
  });

  it("tints enemy models differently from player models", () => {
    const playerMat = (buildingModel(fakeBuilding("house", "player")).children[0] as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;
    const enemyMat = (buildingModel(fakeBuilding("house", "enemy")).children[0] as THREE.Mesh)
      .material as THREE.MeshBasicMaterial;
    expect(playerMat.color.getHex()).not.toBe(enemyMat.color.getHex());
  });

  it("syncs one group per live entity, skipping dead/destroyed", () => {
    const game = new Game(new EventBus());
    const group = new THREE.Group();
    syncEntities(group, game.state);
    const live =
      game.state.players.player.buildings.length +
      game.state.players.enemy.buildings.length +
      game.state.players.player.units.length +
      game.state.players.enemy.units.length;
    expect(group.children.length).toBe(live);

    // mark one unit dead and one building destroyed, then re-sync
    const u = game.state.players.player.units[0];
    if (u) u.state = "dead";
    const b = game.state.players.player.buildings[0];
    if (b) b.state = "destroyed";
    syncEntities(group, game.state);
    expect(group.children.length).toBe(live - 2);
  });
});
