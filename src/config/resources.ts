import type { ResourceStore, ResourceType } from "../sim/types";

export const RESOURCE_TYPES: readonly ResourceType[] = ["food", "wood", "gold"];

export const STARTING_RESOURCES: ResourceStore = {
  food: 200,
  wood: 200,
  gold: 100,
};

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  food: "Food",
  wood: "Wood",
  gold: "Gold",
};

export const RESOURCE_ICONS: Record<ResourceType, string> = {
  food: "\u{1F33E}",
  wood: "\u{1FAB5}",
  gold: "\u{1FA99}",
};
