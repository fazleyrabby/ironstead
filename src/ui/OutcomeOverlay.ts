import type { GameStats, GameStatus } from "../sim/types";

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

export class OutcomeOverlay {
  private readonly root: HTMLElement;
  private shown: GameStatus | undefined;

  constructor(parent: HTMLElement, onRestart: () => void) {
    this.root = el("div", "outcome hidden");
    parent.appendChild(this.root);

    const box = el("div", "outcome-box");
    const title = el("div", "outcome-title", "VICTORY");
    const subtitle = el("div", "outcome-subtitle", "");
    const stats = el("div", "outcome-stats", "");
    const button = el("button", "btn outcome-btn", "Play Again");
    button.addEventListener("click", onRestart);

    box.append(title, subtitle, stats, button);
    this.root.appendChild(box);
    this.root.addEventListener("click", (event) => event.stopPropagation());
  }

  update(status: GameStatus, stats: GameStats, time: number): void {
    if (status === this.shown) return;
    this.shown = status;

    if (status !== "victory" && status !== "defeat") {
      this.root.classList.add("hidden");
      return;
    }

    const victory = status === "victory";
    this.root.classList.remove("hidden");
    this.root.classList.toggle("is-victory", victory);
    (this.root.querySelector(".outcome-title") as HTMLElement).textContent = victory
      ? "VICTORY"
      : "DEFEAT";
    (this.root.querySelector(".outcome-subtitle") as HTMLElement).textContent = victory
      ? "Enemy Town Center destroyed."
      : "Your Town Center has fallen.";

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, "0");
    (this.root.querySelector(".outcome-stats") as HTMLElement).innerHTML = `
      <div class="outcome-row"><span>Units lost</span><b>${stats.playerUnitsLost}</b></div>
      <div class="outcome-row"><span>Units defeated</span><b>${stats.playerUnitsKilled}</b></div>
      <div class="outcome-row"><span>Buildings lost</span><b>${stats.playerBuildingsLost}</b></div>
      <div class="outcome-row"><span>Buildings razed</span><b>${stats.playerBuildingsDestroyed}</b></div>
      <div class="outcome-row"><span>Match time</span><b>${minutes}:${seconds}</b></div>`;
  }
}
