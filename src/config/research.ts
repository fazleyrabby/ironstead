import type { ResourceStore, ResourceType } from "../sim/types";

export type ResearchLine = "farming" | "lumber" | "mining";

export interface ResearchTier {
  bonus: number;
  cost: Partial<ResourceStore>;
}

export interface ResearchDef {
  line: ResearchLine;
  name: string;
  icon: string;
  description: string;
  resource: ResourceType;
  tiers: ResearchTier[];
}

function line(
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
    resource,
    tiers: [
      { bonus: 0.5, cost: { wood: 100, gold: 50 } },
      { bonus: 1.0, cost: { wood: 200, gold: 150 } },
    ],
  };
}

export const RESEARCH: Record<ResearchLine, ResearchDef> = {
  farming: line(
    "farming",
    "Improved Farming",
    "\u{1F33E}",
    "+50% food production per level.",
    "food",
  ),
  lumber: line(
    "lumber",
    "Forestry",
    "\u{1FAB5}",
    "+50% wood production per level.",
    "wood",
  ),
  mining: line(
    "mining",
    "Gold Mining",
    "\u{1FA99}",
    "+50% gold production per level.",
    "gold",
  ),
};

export const RESEARCH_LINES: ResearchLine[] = ["farming", "lumber", "mining"];
