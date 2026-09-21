import type { BuildingType, ResourceStore, ResourceType, UnitType } from "../sim/types";

export interface BuildingProduction {
  resource: ResourceType;
  baseRate: number;
  perWorker: number;
}

export interface BuildingAttack {
  range: number;
  damage: number;
  cooldown: number;
}

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  description: string;
  cost: Partial<ResourceStore>;
  hp: number;
  tilesW: number;
  tilesH: number;
  buildTime: number;
  population: number;
  storage: number;
  production?: BuildingProduction;
  attack?: BuildingAttack;
  produces?: UnitType[];
  maxWorkers?: number;
  buildable: boolean;
  colors: { body: number; roof: number; accent: number };
}

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  town_center: {
    id: "town_center",
    name: "Town Center",
    description: "The heart of your settlement. Lose it and the match is over.",
    cost: {},
    hp: 3000,
    tilesW: 4,
    tilesH: 4,
    buildTime: 0,
    population: 5,
    storage: 500,
    produces: ["villager"],
    buildable: false,
    colors: { body: 0xe8d8b0, roof: 0xb5533f, accent: 0xf1e6cf },
  },
  house: {
    id: "house",
    name: "House",
    description: "Raises population capacity by 5.",
    cost: { wood: 50 },
    hp: 500,
    tilesW: 2,
    tilesH: 2,
    buildTime: 6,
    population: 5,
    storage: 0,
    buildable: true,
    colors: { body: 0xd9b382, roof: 0xa0522d, accent: 0xe9cda4 },
  },
  farm: {
    id: "farm",
    name: "Farm",
    description: "Produces food. Assign villagers to speed it up.",
    cost: { wood: 75 },
    hp: 400,
    tilesW: 3,
    tilesH: 3,
    buildTime: 8,
    population: 0,
    storage: 0,
    production: { resource: "food", baseRate: 3, perWorker: 7 },
    maxWorkers: 3,
    buildable: true,
    colors: { body: 0xc9a227, roof: 0x7a8f3a, accent: 0xe0c45a },
  },
  storage: {
    id: "storage",
    name: "Storage",
    description: "Increases resource capacity by 500.",
    cost: { wood: 100 },
    hp: 700,
    tilesW: 2,
    tilesH: 2,
    buildTime: 8,
    population: 0,
    storage: 500,
    buildable: true,
    colors: { body: 0xb08d57, roof: 0x6b4f2a, accent: 0xc8a878 },
  },
  army_camp: {
    id: "army_camp",
    name: "Army Camp",
    description: "Trains soldiers for your army.",
    cost: { wood: 150 },
    hp: 1000,
    tilesW: 3,
    tilesH: 3,
    buildTime: 12,
    population: 0,
    storage: 0,
    produces: ["swordsman", "spearman", "crossbowman", "horse_rider"],
    buildable: true,
    colors: { body: 0x8f9aa8, roof: 0x4b5563, accent: 0xaeb8c4 },
  },
  tower: {
    id: "tower",
    name: "Tower",
    description: "Automatically fires at enemies in range.",
    cost: { wood: 150 },
    hp: 800,
    tilesW: 1,
    tilesH: 1,
    buildTime: 10,
    population: 0,
    storage: 0,
    attack: { range: 250, damage: 25, cooldown: 1.2 },
    buildable: true,
    colors: { body: 0x9ca3af, roof: 0x4b5563, accent: 0xc3c9d2 },
  },
  wall: {
    id: "wall",
    name: "Wall",
    description: "Blocks movement and absorbs attacks.",
    cost: { wood: 25 },
    hp: 400,
    tilesW: 1,
    tilesH: 1,
    buildTime: 3,
    population: 0,
    storage: 0,
    buildable: true,
    colors: { body: 0xb9b3a6, roof: 0x8d8678, accent: 0xd2ccbf },
  },
  forest: {
    id: "forest",
    name: "Forest",
    description: "Timber. Produces wood when worked.",
    cost: {},
    hp: 100000,
    tilesW: 2,
    tilesH: 2,
    buildTime: 0,
    population: 0,
    storage: 0,
    production: { resource: "wood", baseRate: 2, perWorker: 6 },
    maxWorkers: 3,
    buildable: false,
    colors: { body: 0x2f5d34, roof: 0x3f7a44, accent: 0x538f59 },
  },
  gold_vein: {
    id: "gold_vein",
    name: "Gold Vein",
    description: "Precious ore. Produces gold when worked.",
    cost: {},
    hp: 100000,
    tilesW: 2,
    tilesH: 2,
    buildTime: 0,
    population: 0,
    storage: 0,
    production: { resource: "gold", baseRate: 1.5, perWorker: 4 },
    maxWorkers: 3,
    buildable: false,
    colors: { body: 0x8b8f9a, roof: 0x6f737d, accent: 0xf2c14e },
  },
};

export const BUILDABLE_TYPES: readonly BuildingType[] = [
  "house",
  "farm",
  "storage",
  "army_camp",
  "tower",
  "wall",
];

export const BUILDING_ICONS: Record<BuildingType, string> = {
  town_center: "\u{1F3F0}",
  house: "\u{1F3E0}",
  farm: "\u{1F33E}",
  storage: "\u{1F4E6}",
  army_camp: "\u2694\uFE0F",
  tower: "\u{1F3F9}",
  wall: "\u{1F9F1}",
  forest: "\u{1F332}",
  gold_vein: "\u{1FA99}",
};
