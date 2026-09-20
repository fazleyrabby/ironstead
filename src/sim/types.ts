export type ResourceType = "food" | "wood" | "gold";

export interface ResourceStore {
  food: number;
  wood: number;
  gold: number;
}

export type PlayerId = "player" | "enemy";

export type BuildingType =
  | "town_center"
  | "house"
  | "farm"
  | "storage"
  | "army_camp"
  | "tower"
  | "wall"
  | "forest"
  | "gold_vein";

export type BuildingState = "constructing" | "complete" | "destroyed";

export interface Building {
  id: string;
  type: BuildingType;
  owner: PlayerId;
  tileX: number;
  tileY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  state: BuildingState;
  buildProgress: number;
  workerCount: number;
}

export interface PlayerState {
  id: PlayerId;
  resources: ResourceStore;
  buildings: Building[];
  populationUsed: number;
}

export interface UiState {
  pendingBuild?: BuildingType;
  hoverTile?: { x: number; y: number };
  selectedBuildingId?: string;
}

export type GameStatus = "playing" | "victory" | "defeat";

export interface GameState {
  status: GameStatus;
  time: number;
  players: Record<PlayerId, PlayerState>;
  ui: UiState;
  nextId: number;
}
