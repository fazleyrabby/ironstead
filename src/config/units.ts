import type { ResourceStore } from "../sim/types";
import type { UnitType } from "../sim/types";

export interface UnitDefinition {
  id: UnitType;
  name: string;
  cost: Partial<ResourceStore>;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  attackCooldown: number;
  productionTime: number;
  counters?: string[];
  color: number;
  radius: number;
  sight: number;
  aggressive: boolean;
  ranged: boolean;
}

export const UNITS: Record<UnitType, UnitDefinition> = {
  villager: {
    id: "villager",
    name: "Villager",
    cost: { food: 50 },
    hp: 50,
    damage: 5,
    range: 24,
    speed: 70,
    attackCooldown: 1.2,
    productionTime: 8,
    color: 0xd9a066,
    sight: 7,
    radius: 9,
    aggressive: false,
    ranged: false,
  },
  swordsman: {
    id: "swordsman",
    name: "Swordsman",
    cost: { food: 60, wood: 20 },
    hp: 120,
    damage: 20,
    range: 30,
    speed: 65,
    attackCooldown: 1.0,
    productionTime: 10,
    color: 0x7aa2f7,
    sight: 8,
    radius: 10,
    aggressive: true,
    ranged: false,
  },
  spearman: {
    id: "spearman",
    name: "Spearman",
    cost: { food: 50, wood: 30 },
    hp: 110,
    damage: 18,
    range: 35,
    speed: 60,
    attackCooldown: 1.1,
    productionTime: 10,
    counters: ["horse_rider"],
    color: 0x7ee081,
    sight: 8,
    radius: 10,
    aggressive: true,
    ranged: false,
  },
  crossbowman: {
    id: "crossbowman",
    name: "Crossbowman",
    cost: { food: 40, gold: 50 },
    hp: 70,
    damage: 30,
    range: 180,
    speed: 55,
    attackCooldown: 1.3,
    productionTime: 12,
    color: 0xc792ea,
    sight: 9,
    radius: 10,
    aggressive: true,
    ranged: true,
  },
  horse_rider: {
    id: "horse_rider",
    name: "Horse Rider",
    cost: { food: 80, gold: 50 },
    hp: 160,
    damage: 35,
    range: 35,
    speed: 120,
    attackCooldown: 1.2,
    productionTime: 14,
    color: 0xcb8a4b,
    sight: 9,
    radius: 12,
    aggressive: true,
    ranged: false,
  },
  hero: {
    id: "hero",
    name: "Hero",
    cost: {},
    hp: 600,
    damage: 50,
    range: 40,
    speed: 80,
    attackCooldown: 1.0,
    productionTime: 0,
    color: 0xf2c14e,
    sight: 9,
    radius: 13,
    aggressive: true,
    ranged: false,
  },
};

export const UNIT_ICONS: Record<UnitType, string> = {
  villager: "\u{1F9D1}",
  swordsman: "\u{1F5E1}\uFE0F",
  spearman: "\u{1F6E1}\uFE0F",
  crossbowman: "\u{1F3F9}",
  horse_rider: "\u{1F40E}",
  hero: "\u{1F451}",
};
