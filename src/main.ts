import { VIEW3D } from "./config/atmosphere";
import { MAP_LAYOUT } from "./config/map";
import { TILE_SIZE, worldToTile } from "./config/world";
import { EventBus } from "./core/EventBus";
import { GameLoop } from "./core/GameLoop";
import { InputManager } from "./input/InputManager";
import { loadGameAssets, USE_SPRITE_ASSETS, USE_V2_ASSET_PROTOTYPES } from "./render/Assets";
import { SelectionBox } from "./render/SelectionBox";
import { Scene3D } from "./render3d/Scene3D";
import { Game } from "./sim/Game";
import { spawnUnit } from "./sim/GameState";
import { buildingAtTile, def, unitDef } from "./sim/selectors";
import { canPlace } from "./sim/placement";
import type { PlacementResult } from "./sim/placement";
import { tileToWorldCenter } from "./sim/pathfinding";
import { isTileExplored, isTileVisible } from "./sim/visibility";
import type { BuildingType, PlayerId, UnitType } from "./sim/types";
import { CommandPanel } from "./ui/CommandPanel";
import { Hud } from "./ui/Hud";
import { MainMenu } from "./ui/MainMenu";
import { Minimap } from "./ui/Minimap";
import { OutcomeOverlay } from "./ui/OutcomeOverlay";
import { PauseOverlay } from "./ui/PauseOverlay";
import { SoundFX } from "./audio/sfx";

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

  const events = new EventBus();
  const game = new Game(events);

  if (USE_SPRITE_ASSETS || USE_V2_ASSET_PROTOTYPES) await loadGameAssets();

  const scene = await Scene3D.create();
  mount.appendChild(scene.canvas);
  const camera = scene.camera;
  scene.resize(window.innerWidth, window.innerHeight);

  const baseTile = MAP_LAYOUT.player.baseTile;
  const baseCenter = { x: baseTile.x * TILE_SIZE, y: baseTile.y * TILE_SIZE };
  camera.centerOn(baseCenter.x, baseCenter.y, VIEW3D.camera.startZoom);

  const selectionBox = new SelectionBox(mount);
  const sfx = new SoundFX();
  const hud = new Hud(hudTop, {
    isSoundOn: () => sfx.isEnabled(),
    onToggleSound: () => {
      sfx.toggle();
      sfx.play("click");
    },
  });
  const commandPanel = new CommandPanel(hudBottom, (command) => game.execute(command));
  const outcome = new OutcomeOverlay(document.body, () => window.location.reload());
  let pauseOverlay: PauseOverlay;
  const setPaused = (paused: boolean): void => {
    loop.timeScale = paused ? 0 : 1;
    pauseOverlay?.setPaused(paused);
  };
  pauseOverlay = new PauseOverlay(document.body, () => setPaused(false));
  const minimap = new Minimap(document.body, {
    onNavigate: (x, y) => camera.centerOn(x, y, camera.zoomLevel()),
    onOrder: (x, y) => orderAtWorld({ x, y }),
  });

  let started = false;
  new MainMenu(document.body, {
    onStart: () => {
      started = true;
      document.body.classList.remove("menu-open");
      loop.timeScale = 1;
      sfx.play("click");
    },
    isSoundOn: () => sfx.isEnabled(),
    onToggleSound: () => {
      sfx.toggle();
      sfx.play("click");
    },
  });
  document.body.classList.add("menu-open");

  function hoverOrigin(): { x: number; y: number } {
    const worldPoint = camera.screenToWorld(input.pointer.x, input.pointer.y);
    const tile = worldToTile(worldPoint.x, worldPoint.y);
    const pending = game.state.ui.pendingBuild;
    return pending ? placementOrigin(pending, tile) : tile;
  }

  // Sprites stand upright, so the cursor is over a unit's body rather than the
  // ground under its feet: pick in screen space against the body centre.
  function pickScore(unit: { x: number; y: number; type: UnitType }, screenX: number, screenY: number): number {
    const radius = unitDef(unit.type).radius;
    const body = camera.worldToScreen(unit.x, unit.y, radius * 1.3);
    return Math.hypot(body.x - screenX, body.y - screenY) / camera.zoomLevel() - radius;
  }

  function unitAtPoint(screenX: number, screenY: number) {
    const player = game.state.players.player;
    let best: (typeof player.units)[number] | undefined;
    let bestScore = 18;
    for (const unit of player.units) {
      if (unit.state === "dead") continue;
      const score = pickScore(unit, screenX, screenY);
      if (score < bestScore) {
        bestScore = score;
        best = unit;
      }
    }
    return best;
  }

  function enemyUnitAtPoint(screenX: number, screenY: number) {
    const enemy = game.state.players.enemy;
    const seenBy = game.visibility.player;
    let best: (typeof enemy.units)[number] | undefined;
    let bestScore = 18;
    for (const unit of enemy.units) {
      if (unit.state === "dead") continue;
      const tile = worldToTile(unit.x, unit.y);
      if (!isTileVisible(seenBy, tile.x, tile.y)) continue;
      const score = pickScore(unit, screenX, screenY);
      if (score < bestScore) {
        bestScore = score;
        best = unit;
      }
    }
    return best;
  }

  function enemyBuildingAt(tileX: number, tileY: number) {
    const hit = buildingAtTile(game.state.players.enemy, tileX, tileY);
    if (!hit) return undefined;
    const center = worldToTile(hit.x, hit.y);
    const seen =
      isTileVisible(game.visibility.player, center.x, center.y) ||
      isTileExplored(game.visibility.player, center.x, center.y);
    return seen ? hit : undefined;
  }

  const DOUBLE_CLICK_MS = 300;
  let lastClickAt = 0;
  let lastClickType: UnitType | undefined;
  const controlGroups = new Map<string, string[]>();
  let attackMovePending = false;

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

    if (attackMovePending) {
      attackMovePending = false;
      const ids = game.state.ui.selectedUnitIds;
      if (ids.length > 0) {
        game.execute({ type: "ATTACK_MOVE", unitIds: ids, x: worldPoint.x, y: worldPoint.y });
      }
      return;
    }

    const hitUnit = unitAtPoint(screenX, screenY);
    if (hitUnit) {
      const now = performance.now();
      const doubleClick =
        now - lastClickAt < DOUBLE_CLICK_MS && lastClickType === hitUnit.type;
      lastClickAt = now;
      lastClickType = hitUnit.type;

      if (doubleClick) {
        // AoE-style: select every unit of the same type currently on screen
        const bounds = camera.viewBounds();
        const ids = game.state.players.player.units
          .filter(
            (unit) =>
              unit.state !== "dead" &&
              unit.type === hitUnit.type &&
              unit.x >= bounds.x &&
              unit.x <= bounds.x + bounds.width &&
              unit.y >= bounds.y &&
              unit.y <= bounds.y + bounds.height,
          )
          .map((unit) => unit.id);
        game.execute({ type: "SELECT_UNITS", unitIds: ids });
      } else {
        game.execute({ type: "SELECT_UNITS", unitIds: [hitUnit.id] });
      }
      return;
    }

    lastClickType = undefined;

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
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);

    // Under perspective the box is a trapezoid on the ground, so test on screen.
    const ids = game.state.players.player.units
      .filter((unit) => {
        if (unit.state === "dead") return false;
        const p = camera.worldToScreen(unit.x, unit.y, unitDef(unit.type).radius);
        return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      })
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
    orderAtWorld(camera.screenToWorld(screenX, screenY), enemyUnitAtPoint(screenX, screenY));
  }

  function orderAtWorld(
    worldPoint: { x: number; y: number },
    enemyUnit?: ReturnType<typeof enemyUnitAtPoint>,
  ): void {
    const selectedIds = game.state.ui.selectedUnitIds;
    if (selectedIds.length === 0) {
      // no units selected: right-click sets a rally point on a selected building
      const buildingId = game.state.ui.selectedBuildingId;
      if (buildingId) {
        const building = game.state.players.player.buildings.find(
          (entry) => entry.id === buildingId && entry.state !== "destroyed",
        );
        if (building) {
          game.execute({ type: "SET_RALLY", buildingId, x: worldPoint.x, y: worldPoint.y });
        }
      }
      return;
    }

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
    const enemyBuilding = enemyBuildingAt(tile.x, tile.y);
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

    if (target) {
      const villagers = selectedIds.filter((id) => {
        const unit = game.state.players.player.units.find((entry) => entry.id === id);
        return unit && unit.type === "villager" && unit.state !== "dead";
      });
      if (villagers.length === 0) return;
      if (target.hp < target.maxHp) {
        game.execute({ type: "REPAIR", unitIds: villagers, buildingId: target.id });
        return;
      }
      if (def(target.type).maxWorkers) {
        game.execute({ type: "ASSIGN_WORKERS", unitIds: villagers, buildingId: target.id });
        return;
      }
      return;
    }

    game.execute({ type: "MOVE_UNITS", unitIds: selectedIds, x: worldPoint.x, y: worldPoint.y });
  }

  const input = new InputManager(scene.canvas, camera, {
    onPrimaryClick: handlePrimary,
    onSecondaryClick: handleSecondary,
    onBoxSelect: handleBox,
    onKeyDown: (code, event) => {
      if (!started) return;
      const mod = event.ctrlKey || event.metaKey;
      if (code === "Escape") {
        attackMovePending = false;
        if (game.state.ui.pendingBuild) {
          game.execute({ type: "CANCEL_PLACEMENT" });
        }
        if (game.state.ui.buildOpen) game.execute({ type: "TOGGLE_BUILD", open: false });
        if (game.state.status === "playing") setPaused(loop.timeScale !== 0);
        event.preventDefault();
        return;
      }
      if (code === "KeyB" && game.state.status === "playing") {
        game.execute({ type: "TOGGLE_BUILD" });
      }
      if (code === "KeyA" && game.state.ui.selectedUnitIds.length > 0) {
        attackMovePending = true;
      }
      if (code === "KeyS" && game.state.ui.selectedUnitIds.length > 0) {
        game.execute({ type: "STOP", unitIds: game.state.ui.selectedUnitIds });
      }
      if (code === "KeyC") {
        camera.centerOn(baseCenter.x, baseCenter.y, VIEW3D.camera.startZoom);
      }
      if (code === "KeyR") {
        game.execute({ type: "ACTIVATE_HERO" });
      }
      if (code === "Space" && game.state.status === "playing") {
        setPaused(loop.timeScale !== 0);
      }
      if (code === "Minus" || code === "NumpadSubtract") {
        loop.timeScale = Math.max(1, loop.timeScale - 1);
      }
      if (code === "Equal" || code === "NumpadAdd") {
        loop.timeScale = Math.min(5, loop.timeScale + 1);
      }
      // Control groups: Ctrl+1..9 assign, Shift+Ctrl add, 1..9 recall (AoE-style)
      if (code.startsWith("Digit")) {
        const n = code.slice(5);
        if (mod) {
          event.preventDefault();
          const current = [...game.state.ui.selectedUnitIds];
          if (event.shiftKey) {
            controlGroups.set(n, [...(controlGroups.get(n) ?? []), ...current]);
          } else {
            controlGroups.set(n, current);
          }
        } else {
          const alive = new Set(game.state.players.player.units.map((unit) => unit.id));
          const ids = (controlGroups.get(n) ?? []).filter((id) => alive.has(id));
          if (ids.length > 0) {
            game.execute({ type: "SELECT_UNITS", unitIds: ids });
          }
        }
      }
      if (code === "KeyT" && game.state.status === "playing") {
        game.autoPlay = !game.autoPlay;
        loop.timeScale = game.autoPlay ? 5 : 1;
        loop.maxSteps = game.autoPlay ? 12 : 5;
        hud.setTestMode(game.autoPlay);
      }
      if (code === "KeyM") {
        sfx.toggle();
        sfx.play("click");
      }
    },
  });

  events.on<string>("placement:rejected", (reason) => {
    console.debug("[rts] placement rejected:", reason);
    sfx.play("error");
  });

  events.on("building:created", () => sfx.play("place"));
  events.on("building:completed", () => sfx.play("complete"));
  events.on("building:destroyed", () => sfx.play("destroyed"));
  events.on("building:demolished", () => sfx.play("destroyed"));
  events.on("building:repaired", () => sfx.play("complete"));
  events.on("unit:created", () => sfx.play("train"));
  events.on("unit:died", () => sfx.play("die"));
  events.on("projectile:hit", () => sfx.play("hit"));
  events.on("train:queued", () => sfx.play("click"));
  events.on("repair:started", () => sfx.play("repair"));
  events.on("hero:rally", () => sfx.play("rally"));
  events.on("hero:upgraded", () => sfx.play("upgrade"));
  events.on("hero:respawned", () => sfx.play("train"));
  events.on("research:done", () => sfx.play("upgrade"));
  events.on("victory", () => sfx.play("victory"));
  events.on("defeat", () => sfx.play("defeat"));
  events.on<string>("combat:strike", (kind) => {
    if (kind === "tower") sfx.play("tower");
    else if (kind === "ranged") sfx.play("bolt");
    else sfx.play("melee");
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __rts?: unknown }).__rts = {
      game,
      camera,
      setSpeed: (n: number): void => {
        loop.timeScale = n;
      },
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
    (frameTime) => {
      const pending = game.state.ui.pendingBuild;
      const hover = pending && input.pointer.inside ? hoverOrigin() : undefined;
      game.state.ui.hoverTile = hover;

      let result: PlacementResult | null = null;
      if (pending && hover) {
        result = canPlace(game.state, game.nav, "player", pending, hover.x, hover.y);
      }

      scene.render(game.state, game.visibility.player, result, performance.now() / 1000, frameTime);
      selectionBox.update(input.dragBox.active ? input.dragBox : undefined);
      hud.update(game.state, loop.timeScale);
      commandPanel.update(game.state);
      minimap.update(game.state, game.visibility.player, camera);
      outcome.update(game.state.status, game.state.stats, game.state.time);
    },
  );
  loop.timeScale = 0;
  loop.start();

}

void main();
