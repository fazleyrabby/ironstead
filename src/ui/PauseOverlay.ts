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

export class PauseOverlay {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement, onResume: () => void) {
    this.root = el("div", "pause-overlay hidden");
    const box = el("div", "pause-box");
    box.append(
      el("div", "pause-kicker", "BATTLE SUSPENDED"),
      el("div", "pause-title", "PAUSED"),
      el("p", "pause-copy", "The battlefield is frozen. Your selection and orders are preserved."),
    );

    const resume = el("button", "pause-resume", "Resume Battle");
    resume.type = "button";
    resume.addEventListener("click", onResume);
    box.append(resume, el("div", "pause-hint", "Press Esc or Space to resume"));

    this.root.appendChild(box);
    parent.appendChild(this.root);
  }

  setPaused(paused: boolean): void {
    this.root.classList.toggle("hidden", !paused);
  }
}
