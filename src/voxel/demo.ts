import { EventBus } from "../core/EventBus";
import { Game } from "../sim/Game";
import { VoxelNav } from "./VoxelNav";
import { VoxelScene } from "./VoxelScene";

const COLS = 48;
const ROWS = 48;
const DT = 1 / 30;

/** Flat ground map from the game's terrain/nav so the voxel demo matches reality.
 *  Water (unbuildable/unwalkable tiles) becomes height-0; the rest is ground. */
function buildTerrainFromNav(nav: import("../sim/navgrid").NavGrid): VoxelNav {
  const out = new VoxelNav(COLS, ROWS, 2);
  // walkable + non-bridged tiles are ground height 1; blocked (water/edges) stay 0
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (nav.inBounds(x, y) && !nav.isBlocked(x, y)) out.setGround(x, y, 1);
    }
  }
  // bridges: none by default in this flat demo, but keep the layer wired
  out.syncToNav(nav);
  return out;
}

const root = document.getElementById("root")!;
const scene = new VoxelScene(root, COLS, ROWS);
const game = new Game(new EventBus(), { seed: 4242 });
game.autoPlay = true;

const terrain = buildTerrainFromNav(game.nav);
scene.world.build(terrain);

// dev hook for smoke-testing the render
(window as unknown as { __voxel: unknown }).__voxel = { scene, game };

const CAM_DIST = 26;
let frame = 0;
function loop(): void {
  frame += 1;
  // advance the sim faster than realtime so the base develops, then render
  for (let i = 0; i < 6; i += 1) game.update(DT);
  scene.renderState(game.state);

  // turntable so the whole base + army is visible
  scene.camera.position.set(
    Math.cos(frame / 360) * CAM_DIST,
    18 + Math.sin(frame / 540) * 2,
    Math.sin(frame / 360) * CAM_DIST,
  );
  scene.camera.lookAt(
    game.state.players.player.units.reduce((ax, u) => ax + u.x / 32, 0) /
      Math.max(1, game.state.players.player.units.length),
    0,
    game.state.players.player.units.reduce((az, u) => az + u.y / 32, 0) /
      Math.max(1, game.state.players.player.units.length),
  );

  scene.render();
  requestAnimationFrame(loop);
}
loop();
