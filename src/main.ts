import { Application, Container } from "pixi.js";
import { MAP_LAYOUT } from "./config/map";
import { GRID_COLS, GRID_ROWS, TILE_SIZE, worldToTile } from "./config/world";
import { EventBus } from "./core/EventBus";
import { GameLoop } from "./core/GameLoop";
import { InputManager } from "./input/InputManager";
import { BuildingRenderer } from "./render/BuildingRenderer";
import { Camera } from "./render/Camera";
import { FogRenderer } from "./render/FogRenderer";
import { PlacementGhost } from "./render/PlacementGhost";
import { ProjectileRenderer } from "./render/ProjectileRenderer";
import { SelectionBox } from "./render/SelectionBox";
import { UnitRenderer } from "./render/UnitRenderer";
import { buildWorldScene } from "./render/WorldScene";
import { Game } from "./sim/Game";
import { spawnUnit } from "./sim/GameState";
import { buildingAtTile, def, unitDef } from "./sim/selectors";
import { canPlace } from "./sim/placement";
import type { PlacementResult } from "./sim/placement";
import { tileToWorldCenter } from "./sim/pathfinding";
import { isTileVisible } from "./sim/visibility";
import type { BuildingType, PlayerId, UnitType } from "./sim/types";
import { CommandPanel } from "./ui/CommandPanel";
import { Hud } from "./ui/Hud";

function placementOrigin(type: BuildingType, tile: { x: number; y: number }) {
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
  const screenLayer = new Container();
  app.stage.addChild(world, screenLayer);
  buildWorldScene(world);

  const buildingLayer = new Container();
  const unitLayer = new Container();
  const projectileLayer = new Container();
  const ghostLayer = new Container();
  const fogLayer = new Container();
  world.addChild(buildingLayer, unitLayer, projectileLayer, ghostLayer, fogLayer);

  const events = new EventBus();
  const game = new Game(events);
  const camera = new Camera(world);
  camera.resize(app.screen.width, app.screen.height);

  const baseTile = MAP_LAYOUT.player.baseTile;
  const baseCenter = { x: baseTile.x * TILE_SIZE, y: baseTile.y * TILE_SIZE };
  camera.centerOn(baseCenter.x, baseCenter.y, 1.05);

  const buildingRenderer = new BuildingRenderer(buildingLayer);
  const unitRenderer = new UnitRenderer(unitLayer);
  const projectileRenderer = new ProjectileRenderer(projectileLayer);
  const fog = new FogRenderer(fogLayer, GRID_COLS, GRID_ROWS);
  const ghost = new PlacementGhost(ghostLayer);
  const selectionBox = new SelectionBox(screenLayer);
  const hud = new Hud(hudTop);
  const commandPanel = new CommandPanel(hudBottom, (command) => game.execute(command));

  function hoverOrigin(): { x: number; y: number } {
    const worldPoint = camera.screenToWorld(input.pointer.x, input.pointer.y);
    const tile = worldToTile(worldPoint.x, worldPoint.y);
    const pending = game.state.ui.pendingBuild;
    return pending ? placementOrigin(pending, tile) : tile;
  }

  function unitAtPoint(worldX: number, worldY: number) {
    const player = game.state.players.player;
    let best: (typeof player.units)[number] | undefined;
    let bestScore = 18;
    for (const unit of player.units) {
      if (unit.state === "dead") continue;
      const score = Math.hypot(unit.x - worldX, unit.y - worldY) - unitDef(unit.type).radius;
      if (score < bestScore) {
        bestScore = score;
        best = unit;
      }
    }
    return best;
  }

  function enemyUnitAtPoint(worldX: number, worldY: number) {
    const enemy = game.state.players.enemy;
    const seenBy = game.visibility.player;
    let best: (typeof enemy.units)[number] | undefined;
    let bestScore = 18;
    for (const unit of enemy.units) {
      if (unit.state === "dead") continue;
      const tile = worldToTile(unit.x, unit.y);
      if (!isTileVisible(seenBy, tile.x, tile.y)) continue;
      const score = Math.hypot(unit.x - worldX, unit.y - worldY) - unitDef(unit.type).radius;
      if (score < bestScore) {
        bestScore = score;
        best = unit;
      }
    }
    return best;
  }

  function visibleEnemyBuildingAt(tileX: number, tileY: number) {
    const hit = buildingAtTile(game.state.players.enemy, tileX, tileY);
    if (!hit) return undefined;
    const center = worldToTile(hit.x, hit.y);
    if (!isTileVisible(game.visibility.player, center.x, center.y)) return undefined;
    return hit;
  }

  function handlePrimary(screenX: number, screenY: number): void {
    const worldPoint = camera.screenToWorld(screenX, screenY);
    const pending = game.state.ui.pendingBuild;

    if (pending) {
      const tile = worldToTile(worldPoint.x, worldPoint.y);
      const origin = placementOrigin(pending, tile);
      game.execute({
        type: "PLACE_BUILDING",
        buildingType: pending,
        tileX: origin.x,
        tileY: origin.y,
      });
      return;
    }

    const hitUnit = unitAtPoint(worldPoint.x, worldPoint.y);
    if (hitUnit) {
      game.execute({ type: "SELECT_UNITS", unitIds: [hitUnit.id] });
      return;
    }

    const tile = worldToTile(worldPoint.x, worldPoint.y);
    const hitBuilding =
      buildingAtTile(game.state.players.player, tile.x, tile.y) ??
      buildingAtTile(game.state.players.enemy, tile.x, tile.y);
    if (hitBuilding) {
      game.execute({ type: "SELECT_BUILDING", buildingId: hitBuilding.id });
      return;
    }

    game.execute({ type: "SELECT_UNITS", unitIds: [] });
    game.execute({ type: "SELECT_BUILDING" });
  }

  function handleBox(x0: number, y0: number, x1: number, y1: number): void {
    const a = camera.screenToWorld(x0, y0);
    const b = camera.screenToWorld(x1, y1);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);

    const ids = game.state.players.player.units
      .filter(
        (unit) =>
          unit.state !== "dead" && unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY,
      )
      .map((unit) => unit.id);

    game.execute({ type: "SELECT_UNITS", unitIds: ids });
    if (ids.length === 0) {
      game.execute({ type: "SELECT_BUILDING" });
    }
  }

  function handleSecondary(screenX: number, screenY: number): void {
    if (game.state.ui.pendingBuild) {
      game.execute({ type: "CANCEL_PLACEMENT" });
      return;
    }

    const selectedIds = game.state.ui.selectedUnitIds;
    if (selectedIds.length === 0) return;

    const worldPoint = camera.screenToWorld(screenX, screenY);

    const enemyUnit = enemyUnitAtPoint(worldPoint.x, worldPoint.y);
    if (enemyUnit) {
      game.execute({
        type: "ATTACK_TARGET",
        unitIds: selectedIds,
        targetKind: "unit",
        targetId: enemyUnit.id,
      });
      return;
    }

    const tile = worldToTile(worldPoint.x, worldPoint.y);
    const enemyBuilding = visibleEnemyBuildingAt(tile.x, tile.y);
    if (enemyBuilding) {
      game.execute({
        type: "ATTACK_TARGET",
        unitIds: selectedIds,
        targetKind: "building",
        targetId: enemyBuilding.id,
      });
      return;
    }

    const target = buildingAtTile(game.state.players.player, tile.x, tile.y);

    if (target && def(target.type).maxWorkers) {
      const villagers = selectedIds.filter((id) => {
        const unit = game.state.players.player.units.find((entry) => entry.id === id);
        return unit && unit.type === "villager" && unit.state !== "dead";
      });
      if (villagers.length > 0) {
        game.execute({ type: "ASSIGN_WORKERS", unitIds: villagers, buildingId: target.id });
        return;
      }
    }

    game.execute({ type: "MOVE_UNITS", unitIds: selectedIds, x: worldPoint.x, y: worldPoint.y });
  }

  const input = new InputManager(app.canvas, camera, {
    onPrimaryClick: handlePrimary,
    onSecondaryClick: handleSecondary,
    onBoxSelect: handleBox,
    onKeyDown: (code) => {
      if (code === "Escape") {
        game.execute({ type: "CANCEL_PLACEMENT" });
        game.execute({ type: "SELECT_BUILDING" });
        game.execute({ type: "SELECT_UNITS", unitIds: [] });
      }
      if (code === "KeyC") {
        camera.centerOn(baseCenter.x, baseCenter.y, 1.05);
      }
    },
  });

  events.on<string>("placement:rejected", (reason) => {
    console.debug("[rts] placement rejected:", reason);
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __rts?: unknown }).__rts = {
      game,
      camera,
      spawn: (type: UnitType, owner: PlayerId, tileX: number, tileY: number): string => {
        const point = tileToWorldCenter(tileX, tileY);
        const unit = spawnUnit(game.state, owner, type, point.x, point.y);
        game.state.players[owner].units.push(unit);
        return unit.id;
      },
    };
  }

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
      buildingRenderer.update(game.state, game.state.ui.selectedBuildingId, game.visibility.player);
      unitRenderer.update(
        game.state,
        game.state.ui.selectedUnitIds,
        game.visibility.player,
        performance.now() / 1000,
      );
      projectileRenderer.update(game.state.projectiles);
      fog.update(game.visibility.player);
      selectionBox.update(input.dragBox.active ? input.dragBox : undefined);
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
