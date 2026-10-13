import { Color, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SphereGeometry } from "three";
import type { Scene } from "three";
import { PALETTE, TILE_SIZE } from "../config/world";
import type { PlacementResult } from "../sim/placement";
import { def, unitDef } from "../sim/selectors";
import type { GameState, PlayerId, Projectile, Unit } from "../sim/types";
import type { Units3D } from "./Units3D";

const LIFT = 0.9;
const PROJECTILE_HEIGHT = 18;

function flatMaterial(color: number, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
}

// Ground decals and markers that the 2D renderers used to draw: selection
// rings, the selected-building outline, rally marker, placement ghost, bolts.
export class Overlays3D {
  private readonly scene: Scene;
  private readonly ringGeometry = new RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  // A 4-segment ring is a square frame; its corners sit at radius 1.
  private readonly frameGeometry = new RingGeometry(0.93, 1, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
  private readonly tileGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly boltGeometry = new SphereGeometry(4, 12, 8);
  private readonly ringMaterial = flatMaterial(0x7ee081, 0.95);
  private readonly boltMaterials: Record<PlayerId, MeshBasicMaterial> = {
    player: new MeshBasicMaterial({ color: new Color(PALETTE.playerUnit).multiplyScalar(2.4) }),
    enemy: new MeshBasicMaterial({ color: new Color(PALETTE.enemyUnit).multiplyScalar(2.4) }),
  };

  private readonly rings: Mesh[] = [];
  private readonly bolts: Mesh[] = [];
  private readonly buildingFrame: Mesh;
  private readonly rally: Mesh;
  private readonly ghostFill: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly ghostFrame: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly unitsById = new Map<string, Unit>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.buildingFrame = new Mesh(this.frameGeometry, flatMaterial(0xffe066, 0.95));
    this.rally = new Mesh(this.ringGeometry, flatMaterial(0xf2c14e, 0.9));
    this.ghostFill = new Mesh(this.tileGeometry, flatMaterial(0x4ade80, 0.32));
    this.ghostFrame = new Mesh(this.frameGeometry, flatMaterial(0x4ade80, 0.95));
    for (const mesh of [this.buildingFrame, this.rally, this.ghostFill, this.ghostFrame]) {
      mesh.visible = false;
      mesh.renderOrder = 10;
      scene.add(mesh);
    }
  }

  update(state: GameState, placement: PlacementResult | null, units: Units3D): void {
    this.updateRings(state, units);
    this.updateBuilding(state);
    this.updateGhost(state, placement);
    this.updateBolts(state.projectiles);
  }

  private updateRings(state: GameState, units: Units3D): void {
    this.unitsById.clear();
    for (const unit of state.players.player.units) this.unitsById.set(unit.id, unit);

    let used = 0;
    for (const id of state.ui.selectedUnitIds) {
      const unit = this.unitsById.get(id);
      if (!unit || unit.state === "dead") continue;
      let ring = this.rings[used];
      if (!ring) {
        ring = new Mesh(this.ringGeometry, this.ringMaterial);
        ring.renderOrder = 10;
        this.rings.push(ring);
        this.scene.add(ring);
      }
      ring.visible = true;
      // Follow the smoothed figure, not the stepping sim position.
      const drawn = units.drawnPosition(unit.id) ?? unit;
      ring.position.set(drawn.x, LIFT, drawn.y);
      ring.scale.setScalar(unitDef(unit.type).radius + 7);
      used += 1;
    }
    for (let i = used; i < this.rings.length; i += 1) this.rings[i].visible = false;
  }

  private updateBuilding(state: GameState): void {
    const id = state.ui.selectedBuildingId;
    const building = id
      ? [...state.players.player.buildings, ...state.players.enemy.buildings].find(
          (entry) => entry.id === id && entry.state !== "destroyed",
        )
      : undefined;

    this.buildingFrame.visible = building !== undefined;
    this.rally.visible = false;
    if (!building) return;

    this.buildingFrame.position.set(building.x, LIFT, building.y);
    this.buildingFrame.scale.set((building.width / 2 + 6) * Math.SQRT2, 1, (building.height / 2 + 6) * Math.SQRT2);

    if (building.rallyX !== undefined && building.rallyY !== undefined) {
      this.rally.visible = true;
      this.rally.position.set(building.rallyX, LIFT, building.rallyY);
      this.rally.scale.setScalar(11);
    }
  }

  private updateGhost(state: GameState, placement: PlacementResult | null): void {
    const { pendingBuild, hoverTile } = state.ui;
    const show = pendingBuild !== undefined && hoverTile !== undefined;
    this.ghostFill.visible = show;
    this.ghostFrame.visible = show;
    if (!pendingBuild || !hoverTile) return;

    const definition = def(pendingBuild);
    const width = definition.tilesW * TILE_SIZE;
    const height = definition.tilesH * TILE_SIZE;
    const x = hoverTile.x * TILE_SIZE + width / 2;
    const z = hoverTile.y * TILE_SIZE + height / 2;
    const color = placement?.ok ? 0x4ade80 : 0xef4444;

    this.ghostFill.material.color.setHex(color);
    this.ghostFill.position.set(x, LIFT, z);
    this.ghostFill.scale.set(width - 4, 1, height - 4);
    this.ghostFrame.material.color.setHex(color);
    this.ghostFrame.position.set(x, LIFT + 0.1, z);
    this.ghostFrame.scale.set((width / 2) * Math.SQRT2, 1, (height / 2) * Math.SQRT2);
  }

  private updateBolts(projectiles: Projectile[]): void {
    projectiles.forEach((projectile, i) => {
      let bolt = this.bolts[i];
      if (!bolt) {
        bolt = new Mesh(this.boltGeometry, this.boltMaterials[projectile.owner]);
        this.bolts.push(bolt);
        this.scene.add(bolt);
      }
      bolt.visible = true;
      bolt.material = this.boltMaterials[projectile.owner];
      bolt.position.set(projectile.x, PROJECTILE_HEIGHT, projectile.y);
    });
    for (let i = projectiles.length; i < this.bolts.length; i += 1) this.bolts[i].visible = false;
  }
}
