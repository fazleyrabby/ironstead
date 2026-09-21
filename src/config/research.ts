import type { PlayerState, ResourceStore, ResourceType } from "../sim/types";

export type ResearchLine =
  | "farming"
  | "lumber"
  | "mining"
  | "weapons"
  | "armor"
  | "training";

export type ResearchKind = "economy" | "attack" | "armor" | "training";

export interface ResearchTier {
  bonus: number;
  cost: Partial<ResourceStore>;
}

export interface ResearchDef {
  line: ResearchLine;
  name: string;
  icon: string;
  description: string;
  kind: ResearchKind;
  resource?: ResourceType;
  tiers: ResearchTier[];
}

function economy(
  lineName: ResearchLine,
  name: string,
  icon: string,
  description: string,
  resource: ResourceType,
): ResearchDef {
  return {
    line: lineName,
    name,
    icon,
    description,
    kind: "economy",
    resource,
    tiers: [
      { bonus: 0.5, cost: { wood: 100, gold: 50 } },
      { bonus: 1.0, cost: { wood: 200, gold: 150 } },
    ],
  };
}

function military(
  lineName: ResearchLine,
  name: string,
  icon: string,
  description: string,
  kind: ResearchKind,
  tiers: ResearchTier[],
): ResearchDef {
  return { line: lineName, name, icon, description, kind, tiers };
}

export const RESEARCH: Record<ResearchLine, ResearchDef> = {
  farming: economy(
    "farming",
    "Improved Farming",
    "\u{1F33E}",
    "+50% food production per level.",
    "food",
  ),
  lumber: economy(
    "lumber",
    "Forestry",
    "\u{1FAB5}",
    "+50% wood production per level.",
    "wood",
  ),
  mining: economy(
    "mining",
    "Gold Mining",
    "\u{1FA99}",
    "+50% gold production per level.",
    "gold",
  ),
  weapons: military(
    "weapons",
    "Weaponsmithing",
    "\u2694\uFE0F",
    "+15% attack damage per level for all soldiers.",
    "attack",
    [
      { bonus: 0.15, cost: { food: 100, gold: 75 } },
      { bonus: 0.3, cost: { food: 200, gold: 150 } },
    ],
  ),
  armor: military(
    "armor",
    "Armor Plating",
    "\u{1F6E1}\uFE0F",
    "-20% damage taken per level for all soldiers.",
    "armor",
    [
      { bonus: 0.2, cost: { wood: 100, gold: 75 } },
      { bonus: 0.35, cost: { wood: 200, gold: 150 } },
    ],
  ),
  training: military(
    "training",
    "Drill Training",
    "\u{1F3C3}",
    "+10% move and attack speed per level for all soldiers.",
    "training",
    [
      { bonus: 0.1, cost: { food: 100, wood: 75 } },
      { bonus: 0.2, cost: { food: 200, wood: 150 } },
    ],
  ),
};

export const RESEARCH_LINES: ResearchLine[] = [
  "farming",
  "lumber",
  "mining",
  "weapons",
  "armor",
  "training",
];

export const ECONOMY_LINES: ResearchLine[] = ["farming", "lumber", "mining"];
export const MILITARY_LINES: ResearchLine[] = ["weapons", "armor", "training"];

export function researchLevel(player: PlayerState, line: ResearchLine): number {
  return player.research[line] ?? 0;
}

export function researchBonus(player: PlayerState, line: ResearchLine): number {
  const level = researchLevel(player, line);
  if (level <= 0) return 0;
  const tiers = RESEARCH[line].tiers;
  return tiers[Math.min(level, tiers.length) - 1].bonus;
}

export function attackMultiplier(player: PlayerState): number {
  return 1 + researchBonus(player, "weapons");
}

export function armorReduction(player: PlayerState): number {
  return Math.min(0.75, researchBonus(player, "armor"));
}

export function moveMultiplier(player: PlayerState): number {
  return 1 + researchBonus(player, "training");
}

export function attackSpeedMultiplier(player: PlayerState): number {
  return 1 + researchBonus(player, "training") * 0.8;
}
