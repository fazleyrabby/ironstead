import { RESOURCE_ICONS, RESOURCE_LABELS, RESOURCE_TYPES } from "../config/resources";
import { populationCap, unitCount } from "../sim/selectors";
import type { GameState, ResourceType } from "../sim/types";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class Hud {
  private readonly values = new Map<ResourceType, HTMLElement>();
  private readonly popValue: HTMLElement;
  private readonly popCap: HTMLElement;
  private readonly clock: HTMLElement;

  constructor(parent: HTMLElement) {
    const title = el("div", "hud-title", "BROWSER RTS");
    const resources = el("div", "hud-res");

    for (const type of RESOURCE_TYPES) {
      const pill = el("div", `hud-pill res-${type}`);
      pill.title = RESOURCE_LABELS[type];
      const icon = el("span", "hud-icon", RESOURCE_ICONS[type]);
      const value = el("b", "hud-value", "0");
      pill.append(icon, value);
      resources.appendChild(pill);
      this.values.set(type, value);
    }

    const pop = el("div", "hud-pill hud-pop");
    pop.title = "Population";
    const popIcon = el("span", "hud-icon", "\u{1F465}");
    this.popValue = el("b", "hud-value", "0");
    this.popCap = el("span", "hud-cap", "/ 0");
    pop.append(popIcon, this.popValue, this.popCap);

    this.clock = el("div", "hud-pill hud-clock", "0:00");

    parent.append(title, el("div", "hud-spacer"), resources, pop, this.clock);
  }

  update(state: GameState): void {
    const player = state.players.player;

    for (const type of RESOURCE_TYPES) {
      const node = this.values.get(type);
      if (!node) continue;
      const text = Math.floor(player.resources[type]).toString();
      if (node.textContent !== text) node.textContent = text;
    }

    const used = unitCount(player).toString();
    if (this.popValue.textContent !== used) this.popValue.textContent = used;

    const cap = `/ ${populationCap(player)}`;
    if (this.popCap.textContent !== cap) this.popCap.textContent = cap;

    const total = Math.floor(state.time);
    const clock = `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
    if (this.clock.textContent !== clock) this.clock.textContent = clock;
  }
}
