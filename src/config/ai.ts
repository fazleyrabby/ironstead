import type { ResourceType } from "../sim/types";
import type { UnitType } from "../sim/types";

export interface TrainMixEntry {
  type: UnitType;
  weight: number;
}

export const AI = {
  thinkEconomy: 1.0,
  thinkMilitary: 2.0,
  maxVillagers: 9,
  maxArmy: 24,
  maxHouses: 6,
  maxStorages: 3,
  workerTargets: { food: 3, wood: 2, gold: 1 } as Record<ResourceType, number>,
  lowStockpile: 150,
  buildCooldown: 4,
  minAttackGroup: 5,
  preferredAttackGroup: 8,
  regroupBelow: 3,
  firstAttackTime: 240,
  scoutStartTime: 150,
  scoutInterval: 90,
  defenseRadius: 600,
  engageRadius: 260,
  campBuildTime: 45,
  trainMix: [
    { type: "swordsman", weight: 3 },
    { type: "spearman", weight: 2 },
    { type: "crossbowman", weight: 2 },
    { type: "horse_rider", weight: 1 },
  ] as TrainMixEntry[],
} as const;
