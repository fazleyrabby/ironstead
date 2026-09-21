import type { BuildingType, UnitType } from "./types";

export type Command =
  | { type: "BEGIN_PLACEMENT"; buildingType: BuildingType }
  | { type: "CANCEL_PLACEMENT" }
  | { type: "PLACE_BUILDING"; buildingType: BuildingType; tileX: number; tileY: number }
  | { type: "SELECT_BUILDING"; buildingId?: string }
  | { type: "SELECT_UNITS"; unitIds: string[] }
  | { type: "TRAIN_UNIT"; buildingId: string; unitType: UnitType }
  | { type: "MOVE_UNITS"; unitIds: string[]; x: number; y: number }
  | { type: "ASSIGN_WORKERS"; unitIds: string[]; buildingId: string };
