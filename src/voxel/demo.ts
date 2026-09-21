import { EventBus } from "../core/EventBus";
import { GRID_COLS, GRID_ROWS } from "../config/world";
import { PONDS } from "../config/map";
import { Game } from "../sim/Game";
import { VoxelNav } from "./VoxelNav";
import { VoxelScene } from "./VoxelScene";

const DT = 1 / 30;

/** Ground everywhere, ponds carved from the map config, plus a demo bridge
 *  across the first pond to show the crossing tech. */
function buildTerrain(): VoxelNav {
  const nav = new VoxelNav(GRID_COLS, GRID_ROWS, 2);
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) nav.setGround(x, y, 1);
  }
  for (const p of PONDS) {
    for (let dy = -p.radius; dy <= p.radius; dy += 1) {
      for (let dx = -p.radius; dx <= p.radius; dx += 1) {
        if (dx * dx + dy * dy <= p.radius * p.radius) nav.setGround(p.tileX + dx, p.tileY + dy, 0);
      }
    }
  }
  const p0 = PONDS[0];
  if (p0) {
    for (let dy = -p0.radius - 1; dy <= p0.radius + 1; dy += 1) {
      nav.setBridge(p0.tileX, p0.tileY + dy, true);
    }
  }
  return nav;
}

const root = document.getElementById("root")!;
const scene = new VoxelScene(root, GRID_COLS, GRID_ROWS);
const game = new Game(new EventBus());
game.autoPlay = true;

const terrain = buildTerrain();
scene.world.build(terrain);

// dev hook for smoke-testing the render
(window as unknown as { __voxel: unknown }).__voxel = { scene, game };

const CAM_DIST = 74;
let frame = 0;
function loop(): void {
  frame += 1;
  // advance the sim faster than realtime so the base develops, then render
  for (let i = 0; i < 6; i += 1) game.update(DT);
  scene.renderState(game.state);

  scene.camera.position.set(
    Math.cos(frame / 420) * CAM_DIST,
    52 + Math.sin(frame / 600) * 4,
    Math.sin(frame / 420) * CAM_DIST,
  );
  scene.camera.lookAt(0, 0, 0);

  scene.render();
  requestAnimationFrame(loop);
}
loop();
