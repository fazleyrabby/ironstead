import type { ResourceStore } from "../sim/types";

export const DEMOLISH = {
  refund: 0.5,
  blocked: ["town_center"] as const,
} as const;

export function demolishRefund(cost: Partial<ResourceStore>): Partial<ResourceStore> {
  const refund: Partial<ResourceStore> = {};
  for (const key of ["food", "wood", "gold"] as const) {
    const value = Math.floor((cost[key] ?? 0) * DEMOLISH.refund);
    if (value > 0) refund[key] = value;
  }
  return refund;
}
