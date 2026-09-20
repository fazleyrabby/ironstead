import { Application, Container } from "pixi.js";
import { EventBus } from "./core/EventBus";
import { GameLoop } from "./core/GameLoop";
import { InputManager } from "./input/InputManager";
import { Camera } from "./render/Camera";
import { buildWorldScene } from "./render/WorldScene";
import { PLAYER_START } from "./config/world";

async function main(): Promise<void> {
  const mount = document.getElementById("app");
  if (!mount) throw new Error("Missing #app mount point");

  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: 0x0b0b14,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  app.ticker.stop();
  mount.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  buildWorldScene(world);

  const camera = new Camera(world);
  camera.resize(app.screen.width, app.screen.height);
  camera.centerOn(PLAYER_START.x, PLAYER_START.y, 1);

  const input = new InputManager(app.canvas, camera);
  void input;

  const eventBus = new EventBus();
  eventBus.on<{ time: number }>("world:ready", ({ time }) => {
    console.log("[rts] world ready at", time.toFixed(2), "s");
  });

  let elapsed = 0;

  const loop = new GameLoop(
    (dt) => {
      elapsed += dt;
      camera.update(dt);
    },
    () => {
      app.renderer.render(app.stage);
    },
  );
  loop.start();
  eventBus.emit("world:ready", { time: elapsed });

  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    camera.resize(app.screen.width, app.screen.height);
  });
}

void main();
