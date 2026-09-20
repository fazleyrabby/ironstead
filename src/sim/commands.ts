import type { BuildingType } from "./types";

export type Command =
  | { type: "BEGIN_PLACEMENT"; buildingType: BuildingType }
  | { type: "CANCEL_PLACEMENT" }
  | { type: "PLACE_BUILDING"; buildingType: BuildingType; tileX: number; tileY: number }
  | { type: "SELECT_BUILDING"; buildingId?: string };
