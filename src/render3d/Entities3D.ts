import type { Scene } from "three";
import { VIEW3D } from "../config/atmosphere";
import { BuildingRenderer } from "../render/BuildingRenderer";
import { UnitRenderer } from "../render/UnitRenderer";
import { def } from "../sim/selectors";
import type { BuildingType, GameState } from "../sim/types";
import type { VisibilityMap } from "../sim/visibility";
import { Atlas, CellGrid } from "./Atlas";
import { QuadBatch } from "./QuadBatch";

// Unit cells: the rig's origin (body centre) sits at ORIGIN inside each cell.
const UNIT_CELL = 96;
const UNIT_ORIGIN_X = 48;
const UNIT_ORIGIN_Y = 58;
const UNIT_COLS = 16;
const UNIT_ROWS = 6;
// Feet sit this many radii below the rig origin.
const UNIT_FEET = 1.2;

const BIG = { w: 256, h: 288, originX: 128, originY: 200, cols: 6, rows: 2 };
const SMALL = { w: 128, h: 176, originX: 64, originY: 120, cols: 12, rows: 5 };
const BUILDING_ATLAS_W = 1536;
const BUILDING_REFRESH_FRAMES = 8;

// Drawn top-down in 2D, so they lie on the ground instead of standing up.
const FLAT_TYPES: ReadonlySet<BuildingType> = new Set<BuildingType>(["farm", "army_camp"]);

// Units: every visible rig is drawn into its atlas cell each frame and shown
// as an upright billboard at the unit's ground position.
export class Units3D {
  readonly renderer: UnitRenderer;
  private readonly atlas: Atlas;
  private readonly grid = new CellGrid(0, 0, UNIT_COLS, UNIT_ROWS, UNIT_CELL, UNIT_CELL);
  private readonly batch: QuadBatch;

  private constructor(scene: Scene, atlas: Atlas) {
    this.atlas = atlas;
    this.renderer = new UnitRenderer(atlas.layer);
    this.batch = new QuadBatch(atlas.texture, UNIT_COLS * UNIT_ROWS);
    scene.add(this.batch.mesh);
  }

  static async create(scene: Scene): Promise<Units3D> {
    return new Units3D(scene, await Atlas.create(UNIT_COLS * UNIT_CELL, UNIT_ROWS * UNIT_CELL, 2));
  }

  update(
    state: GameState,
    selectedIds: readonly string[],
    visibility: VisibilityMap,
    nowSec: number,
    frameDt: number,
  ): void {
    this.renderer.update(state, selectedIds, visibility, nowSec, frameDt);

    const { stretch } = VIEW3D.billboard;
    this.grid.begin();
    this.batch.begin();
    this.renderer.forEachView((view) => {
      const slot = this.grid.acquire(view.container);
      if (!slot) {
        view.container.position.set(-9999, -9999);
        return;
      }
      const { cell } = slot;
      view.container.position.set(cell.x + UNIT_ORIGIN_X, cell.y + UNIT_ORIGIN_Y);
      const feet = view.radius * UNIT_FEET;
      this.batch.upright(
        view.x,
        view.y,
        UNIT_ORIGIN_X,
        UNIT_CELL - UNIT_ORIGIN_X,
        -(UNIT_CELL - UNIT_ORIGIN_Y - feet) * stretch,
        (UNIT_ORIGIN_Y + feet) * stretch,
        this.atlas.uv(cell),
      );
    });
    this.grid.end();
    this.batch.end();
    this.atlas.render();
  }
}

// Buildings change rarely, so their atlas is only redrawn every few frames or
// when a new building needs a cell.
export class Buildings3D {
  readonly renderer: BuildingRenderer;
  private readonly atlas: Atlas;
  private readonly big = new CellGrid(0, 0, BIG.cols, BIG.rows, BIG.w, BIG.h);
  private readonly small = new CellGrid(0, BIG.rows * BIG.h, SMALL.cols, SMALL.rows, SMALL.w, SMALL.h);
  private readonly batch: QuadBatch;
  private frame = 0;

  private constructor(scene: Scene, atlas: Atlas) {
    this.atlas = atlas;
    this.renderer = new BuildingRenderer(atlas.layer);
    this.batch = new QuadBatch(atlas.texture, BIG.cols * BIG.rows + SMALL.cols * SMALL.rows);
    scene.add(this.batch.mesh);
  }

  static async create(scene: Scene): Promise<Buildings3D> {
    const height = BIG.rows * BIG.h + SMALL.rows * SMALL.h;
    return new Buildings3D(scene, await Atlas.create(BUILDING_ATLAS_W, height, 2));
  }

  // Shared Pixi renderer for one-off bakes (terrain, props).
  get bakery(): Atlas {
    return this.atlas;
  }

  update(state: GameState, selectedId: string | undefined, visibility: VisibilityMap): void {
    this.renderer.update(state, selectedId, visibility);

    const { stretch } = VIEW3D.billboard;
    let dirty = false;
    this.big.begin();
    this.small.begin();
    this.batch.begin();
    this.renderer.forEachView(({ container, building }) => {
      const definition = def(building.type);
      const isBig = Math.max(definition.tilesW, definition.tilesH) >= 3;
      const layout = isBig ? BIG : SMALL;
      const slot = (isBig ? this.big : this.small).acquire(container);
      if (!slot) {
        container.position.set(-9999, -9999);
        return;
      }
      const { cell, fresh } = slot;
      if (fresh) dirty = true;
      container.position.set(cell.x + layout.originX, cell.y + layout.originY);
      const uv = this.atlas.uv(cell);

      if (FLAT_TYPES.has(building.type)) {
        this.batch.flat(
          building.x - layout.originX,
          building.y - layout.originY,
          building.x + layout.w - layout.originX,
          building.y + layout.h - layout.originY,
          0.6,
          uv,
        );
        return;
      }

      // The footprint's bottom edge is the line where the facade meets the ground.
      const base = building.height / 2 + 4;
      this.batch.upright(
        building.x,
        building.y + building.height * 0.3,
        layout.originX,
        layout.w - layout.originX,
        -(layout.h - layout.originY - base) * stretch,
        (layout.originY + base) * stretch,
        uv,
      );
    });
    this.big.end();
    this.small.end();
    this.batch.end();

    this.frame += 1;
    if (dirty || this.frame % BUILDING_REFRESH_FRAMES === 0) this.atlas.render();
  }
}
