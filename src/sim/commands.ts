import type { ResearchLine } from "../config/research";
import type { BuildingType, PlayerId, UnitType } from "./types";

export type Command =
  | { type: "BEGIN_PLACEMENT"; buildingType: BuildingType }
  | { type: "CANCEL_PLACEMENT" }
  | { type: "TOGGLE_BUILD"; open?: boolean }
  | { type: "DEMOLISH"; buildingId: string; faction?: PlayerId }
  | {
      type: "PLACE_BUILDING";
      buildingType: BuildingType;
      tileX: number;
      tileY: number;
      faction?: PlayerId;
    }
  | { type: "SELECT_BUILDING"; buildingId?: string }
  | { type: "SELECT_UNITS"; unitIds: string[] }
  | { type: "TRAIN_UNIT"; buildingId: string; unitType: UnitType; faction?: PlayerId }
  | { type: "MOVE_UNITS"; unitIds: string[]; x: number; y: number; faction?: PlayerId }
  | { type: "ATTACK_MOVE"; unitIds: string[]; x: number; y: number; faction?: PlayerId }
  | { type: "STOP"; unitIds: string[]; faction?: PlayerId }
  | { type: "SET_RALLY"; buildingId: string; x: number; y: number; faction?: PlayerId }
  | {
      type: "ATTACK_TARGET";
      unitIds: string[];
      targetKind: "unit" | "building";
      targetId: string;
      faction?: PlayerId;
    }
  | { type: "ASSIGN_WORKERS"; unitIds: string[]; buildingId: string; faction?: PlayerId }
  | { type: "REPAIR"; unitIds: string[]; buildingId: string; faction?: PlayerId }
  | { type: "RESEARCH"; line: ResearchLine; faction?: PlayerId }
  | { type: "ACTIVATE_HERO"; faction?: PlayerId }
  | { type: "UPGRADE_HERO"; faction?: PlayerId };
