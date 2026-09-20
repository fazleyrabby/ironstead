import { Application, Container } from "pixi.js";
import { MAP_LAYOUT } from "./config/map";
import { TILE_SIZE, worldToTile } from "./config/world";
import { EventBus } from "./core/EventBus";
import { GameLoop } from "./core/GameLoop";
import { InputManager } from "./input/InputManager";
import { BuildingRenderer } from "./render/BuildingRenderer";
import { Camera } from "./render/Camera";
import { PlacementGhost } from "./render/PlacementGhost";
import { buildWorldScene } from "./render/WorldScene";
import { Game } from "./sim/Game";
import { buildingAtTile, def } from "./sim/selectors";
import { canPlace } from "./sim/placement";
import type { PlacementResult } from "./sim/placement";
import { CommandPanel } from "./ui/CommandPanel";
import { Hud } from "./ui/Hud";

function placementOrigin(type: Parameters<typeof def>[0], tile: { x: number; y: number }) {
  const definition = def(type);
  return {
    x: tile.x - Math.floor((definition.tilesW - 1) / 2),
    y: tile.y - Math.floor((definition.tilesH - 1) / 2),
  };
}

async function main(): Promise<void> {
  const mount = document.getElementById("app");
  if (!mount) throw new Error("Missing #app mount point");
  const hudTop = document.getElementById("hud-top");
  const hudBottom = document.getElementById("hud-bottom");
  if (!hudTop || !hudBottom) throw new Error("Missing HUD mount points");

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

  const buildingLayer = new Container();
  const ghostLayer = new Container();
  world.addChild(buildingLayer, ghostLayer);

  const events = new EventBus();
  const game = new Game(events);
  const camera = new Camera(world);
  camera.resize(app.screen.width, app.screen.height);

  const baseTile = MAP_LAYOUT.player.baseTile;
  camera.centerOn(baseTile.x * TILE_SIZE, baseTile.y * TILE_SIZE, 1.05);

  const buildingRenderer = new BuildingRenderer(buildingLayer);
  const ghost = new PlacementGhost(ghostLayer);
  const hud = new Hud(hudTop);
  const commandPanel = new CommandPanel(hudBottom, (command) => game.execute(command));

  function hoverOrigin(): { x: number; y: number } {
    const worldPoint = camera.screenToWorld(input.pointer.x, input.pointer.y);
    const tile = worldToTile(worldPoint.x, worldPoint.y);
    const pending = game.state.ui.pendingBuild;
    return pending ? placementOrigin(pending, tile) : tile;
  }

  function handlePrimary(screenX: number, screenY: number): void {
    const worldPoint = camera.screenToWorld(screenX, screenY);
    const tile = worldToTile(worldPoint.x, worldPoint.y);
    const pending = game.state.ui.pendingBuild;

    if (pending) {
      const origin = placementOrigin(pending, tile);
      game.execute({
        type: "PLACE_BUILDING",
        buildingType: pending,
        tileX: origin.x,
        tileY: origin.y,
      });
      return;
    }

    const hit =
      buildingAtTile(game.state.players.player, tile.x, tile.y) ??
      buildingAtTile(game.state.players.enemy, tile.x, tile.y);
    game.execute({ type: "SELECT_BUILDING", buildingId: hit?.id });
  }

  const input = new InputManager(app.canvas, camera, {
    onPrimaryClick: handlePrimary,
    onSecondaryClick: () => {
      if (game.state.ui.pendingBuild) {
        game.execute({ type: "CANCEL_PLACEMENT" });
      } else {
        game.execute({ type: "SELECT_BUILDING" });
      }
    },
    onKeyDown: (code) => {
      if (code === "Escape") {
        game.execute({ type: "CANCEL_PLACEMENT" });
        game.execute({ type: "SELECT_BUILDING" });
      }
      if (code === "KeyC") {
        camera.centerOn(baseTile.x * TILE_SIZE, baseTile.y * TILE_SIZE, 1.05);
      }
    },
  });

  events.on<string>("placement:rejected", (reason) => {
    console.debug("[rts] placement rejected:", reason);
  });

  const loop = new GameLoop(
    (dt) => {
      camera.update(dt);
      game.update(dt);
    },
    () => {
      const pending = game.state.ui.pendingBuild;
      const hover = pending && input.pointer.inside ? hoverOrigin() : undefined;
      game.state.ui.hoverTile = hover;

      let result: PlacementResult | null = null;
      if (pending && hover) {
        result = canPlace(game.state, game.nav, "player", pending, hover.x, hover.y);
      }

      ghost.update(game.state.ui, result);
      buildingRenderer.update(game.state, game.state.ui.selectedBuildingId);
      hud.update(game.state);
      commandPanel.update(game.state);
      app.renderer.render(app.stage);
    },
  );
  loop.start();

  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    camera.resize(app.screen.width, app.screen.height);
  });
}

void main();
