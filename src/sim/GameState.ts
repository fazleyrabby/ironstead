import { BUILDINGS } from "../config/buildings";
import { MAP_LAYOUT } from "../config/map";
import { STARTING_RESOURCES } from "../config/resources";
import { centerOfTileRect, def, footprintWorld } from "./selectors";
import type { Building, BuildingType, GameState, PlayerId, PlayerState } from "./types";

export function spawnBuilding(
  state: GameState,
  owner: PlayerId,
  type: BuildingType,
  tileX: number,
  tileY: number,
  complete: boolean,
): Building {
  const definition = def(type);
  const center = centerOfTileRect(tileX, tileY, definition);
  const footprint = footprintWorld(definition);

  return {
    id: `b${state.nextId++}`,
    type,
    owner,
    tileX,
    tileY,
    x: center.x,
    y: center.y,
    width: footprint.w,
    height: footprint.h,
    hp: definition.hp,
    maxHp: definition.hp,
    state: complete ? "complete" : "constructing",
    buildProgress: complete ? 1 : 0,
    workerCount: 0,
  };
}

function createPlayer(id: PlayerId): PlayerState {
  return {
    id,
    resources: { ...STARTING_RESOURCES },
    buildings: [],
    populationUsed: 0,
  };
}

export function createInitialState(): GameState {
  const state: GameState = {
    status: "playing",
    time: 0,
    players: {
      player: createPlayer("player"),
      enemy: createPlayer("enemy"),
    },
    ui: {},
    nextId: 1,
  };

  for (const id of ["player", "enemy"] as const) {
    const layout = MAP_LAYOUT[id];
    for (const spawn of layout.buildings) {
      state.players[id].buildings.push(
        spawnBuilding(state, id, spawn.type, spawn.tileX, spawn.tileY, true),
      );
    }
  }

  return state;
}

export function allBuildingTypes(): BuildingType[] {
  return Object.keys(BUILDINGS) as BuildingType[];
}
