export interface MainMenuOptions {
  onStart: () => void;
  isSoundOn: () => boolean;
  onToggleSound: () => void;
}

interface ControlRow {
  keys: string;
  label: string;
}

const CONTROLS: ControlRow[] = [
  { keys: "Left click", label: "Select a unit or building" },
  { keys: "Drag", label: "Box-select your army" },
  { keys: "Right click", label: "Move \u00b7 assign workers \u00b7 attack \u00b7 repair" },
  { keys: "B", label: "Open the build menu" },
  { keys: "Esc", label: "Cancel placement or clear selection" },
  { keys: "Space", label: "Pause / resume" },
  { keys: "1 / 2 / 3", label: "Game speed" },
  { keys: "C", label: "Center on your Town Center" },
  { keys: "R", label: "Rally your hero" },
  { keys: "M", label: "Mute sound" },
];

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

export class MainMenu {
  private readonly root: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly sound: HTMLButtonElement;
  private readonly options: MainMenuOptions;
  private started = false;

  constructor(parent: HTMLElement, options: MainMenuOptions) {
    this.options = options;
    this.root = el("div", "menu");

    const card = el("div", "menu-card");
    card.append(
      el("div", "menu-kicker", "A BROWSER STRATEGY SKIRMISH"),
      el("h1", "menu-title", "BROWSER RTS"),
      el(
        "p",
        "menu-tagline",
        "Raise a settlement, muster an army, and raze the enemy Town Center before yours falls.",
      ),
    );

    const actions = el("div", "menu-actions");
    const start = el("button", "menu-btn menu-btn-primary", "Start Skirmish");
    start.addEventListener("click", () => this.start());
    const help = el("button", "menu-btn", "How to Play");
    actions.append(start, help);
    card.appendChild(actions);

    this.controls = el("div", "menu-controls hidden");
    this.controls.appendChild(el("div", "menu-controls-head", "CONTROLS"));
    for (const row of CONTROLS) {
      const line = el("div", "menu-control-row");
      line.append(el("kbd", "menu-key", row.keys), el("span", "menu-key-label", row.label));
      this.controls.appendChild(line);
    }
    help.addEventListener("click", () => {
      const open = !this.controls.classList.toggle("hidden");
      help.textContent = open ? "Hide Controls" : "How to Play";
    });
    card.appendChild(this.controls);

    const footer = el("div", "menu-footer");
    this.sound = el("button", "menu-sound", "");
    this.sound.addEventListener("click", () => {
      this.options.onToggleSound();
      this.refreshSound();
    });
    footer.append(this.sound, el("span", "menu-version", "v0.1 \u00b7 M5"));
    card.appendChild(footer);

    this.root.appendChild(card);
    parent.appendChild(this.root);
    this.refreshSound();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.options.onStart();
    this.root.classList.add("hidden");
  }

  private refreshSound(): void {
    const on = this.options.isSoundOn();
    this.sound.textContent = `${on ? "\u{1F50A}" : "\u{1F507}"} Sound ${on ? "On" : "Off"}`;
  }
}
