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
  | "academy"
  | "forest"
  | "gold_vein";

export type BuildingState = "constructing" | "complete" | "destroyed";

export interface TrainOrder {
  unitType: UnitType;
  progress: number;
}

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
  queue: TrainOrder[];
  cooldown: number;
}

export type UnitType =
  | "villager"
  | "swordsman"
  | "spearman"
  | "crossbowman"
  | "horse_rider"
  | "hero";

export type UnitState = "idle" | "moving" | "gathering" | "attacking" | "repairing" | "dead";

export interface Unit {
  id: string;
  type: UnitType;
  owner: PlayerId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: UnitState;
  path: Array<{ x: number; y: number }>;
  assignedBuildingId?: string;
  repairBuildingId?: string;
  targetKind?: "unit" | "building";
  targetId?: string;
  attackTimer: number;
  repathTimer: number;
  heroLevel?: number;
  abilityCooldown: number;
  rallyTimer: number;
  respawnTimer: number;
}

export interface Projectile {
  id: string;
  owner: PlayerId;
  x: number;
  y: number;
  speed: number;
  damage: number;
  targetKind: "unit" | "building";
  targetId: string;
}

import type { ResearchLine } from "../config/research";

export interface PlayerState {
  id: PlayerId;
  resources: ResourceStore;
  buildings: Building[];
  units: Unit[];
  heroId?: string;
  research: Record<ResearchLine, number>;
}

export interface UiState {
  pendingBuild?: BuildingType;
  hoverTile?: { x: number; y: number };
  selectedBuildingId?: string;
  selectedUnitIds: string[];
}

export type GameStatus = "playing" | "victory" | "defeat";

export interface GameStats {
  playerUnitsLost: number;
  playerUnitsKilled: number;
  playerBuildingsLost: number;
  playerBuildingsDestroyed: number;
}

export interface GameState {
  status: GameStatus;
  time: number;
  players: Record<PlayerId, PlayerState>;
  projectiles: Projectile[];
  ui: UiState;
  stats: GameStats;
  nextId: number;
}
