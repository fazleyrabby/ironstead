import { VoxelNav } from "./VoxelNav";
import { VoxelScene } from "./VoxelScene";

const COLS = 24;
const ROWS = 24;

function buildSampleNav(): VoxelNav {
  const nav = new VoxelNav(COLS, ROWS);
  // ground height 1 everywhere by default
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      nav.setGround(x, y, 1);
    }
  }
  // carve a horizontal river (water) in columns 9..14
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 9; x <= 14; x += 1) {
      nav.setGround(x, y, 0);
    }
  }
  // bridge across the river at columns 11..12
  for (let y = 0; y < ROWS; y += 1) {
    nav.setBridge(11, y, true);
    nav.setBridge(12, y, true);
  }
  return nav;
}

const root = document.getElementById("root")!;
const scene = new VoxelScene(root, COLS, ROWS);
const nav = buildSampleNav();
scene.world.build(nav);

let frame = 0;
function loop(): void {
  frame += 1;
  // slow turntable so the water/bridge/ground layers are visible
  scene.camera.position.set(
    Math.cos(frame / 240) * 26,
    18 + Math.sin(frame / 360) * 2,
    Math.sin(frame / 240) * 26,
  );
  scene.camera.lookAt(0, 0, 0);
  scene.render();
  requestAnimationFrame(loop);
}
loop();
