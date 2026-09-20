export type UpdateFn = (dt: number) => void;
export type RenderFn = (frameTime: number, alpha: number) => void;

export class GameLoop {
  private readonly fixedDt: number;
  private readonly maxSteps: number;
  private readonly update: UpdateFn;
  private readonly render: RenderFn;

  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  timeScale = 1;

  constructor(update: UpdateFn, render: RenderFn, updatesPerSecond = 30, maxSteps = 5) {
    this.update = update;
    this.render = render;
    this.fixedDt = 1 / updatesPerSecond;
    this.maxSteps = maxSteps;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;

    const frameTime = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.accumulator += frameTime * this.timeScale;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.update(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }

    if (steps === this.maxSteps) {
      this.accumulator = 0;
    }

    this.render(frameTime, this.accumulator / this.fixedDt);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
