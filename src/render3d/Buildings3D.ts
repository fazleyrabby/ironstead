import { Color, Group, Mesh, MeshBasicMaterial } from "three";
import type { Scene } from "three";
import { def } from "../sim/selectors";
import type { Building, GameState } from "../sim/types";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Bars3D } from "./Bars3D";
import { buildingModel } from "./buildingModels";
import type { BuildingModel } from "./buildingModels";
import { modelMaterial } from "./geo";

interface Entry {
  group: Group;
  glow?: Mesh;
}

// Low-poly building meshes, one group per building. Models are cached per
// type and owner; a building under construction rises out of the ground.
export class Buildings3D {
  private readonly scene: Scene;
  private readonly bars: Bars3D;
  private readonly entries = new Map<string, Entry>();
  private readonly models = new Map<string, BuildingModel>();
  // Colour above 1 so windows and gold clear the bloom threshold.
  private readonly glowMaterial = new MeshBasicMaterial({ vertexColors: true, color: new Color(1.2, 1.2, 1.2) });

  constructor(scene: Scene, bars: Bars3D) {
    this.scene = scene;
    this.bars = bars;
  }

  update(state: GameState, visibility: VisibilityMap): void {
    const seen = new Set<string>();

    for (const id of ["player", "enemy"] as const) {
      for (const building of state.players[id].buildings) {
        if (building.state === "destroyed") continue;

        let entry = this.entries.get(building.id);
        if (id === "enemy") {
          // Enemy buildings stay as last seen once explored, and are hidden otherwise.
          const sight = this.sight(visibility, building);
          if (sight === "hidden" || (sight === "explored" && !entry)) continue;
          if (sight === "explored") {
            seen.add(building.id);
            continue;
          }
        }
        seen.add(building.id);

        if (!entry) {
          entry = this.create(building);
          this.entries.set(building.id, entry);
        }
        this.sync(entry, building);
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.group);
      this.entries.delete(id);
    }
  }

  private sight(map: VisibilityMap, building: Building): "visible" | "explored" | "hidden" {
    const definition = def(building.type);
    let explored = false;
    for (let y = building.tileY; y < building.tileY + definition.tilesH; y += 1) {
      for (let x = building.tileX; x < building.tileX + definition.tilesW; x += 1) {
        if (isTileVisible(map, x, y)) return "visible";
        if (isTileExplored(map, x, y)) explored = true;
      }
    }
    return explored ? "explored" : "hidden";
  }

  private create(building: Building): Entry {
    const key = `${building.type}_${building.owner}`;
    let model = this.models.get(key);
    if (!model) {
      model = buildingModel(building.type, building.width, building.height, building.owner);
      this.models.set(key, model);
    }

    const group = new Group();
    group.position.set(building.x, 0, building.y);
    const body = new Mesh(model.body, modelMaterial());
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    let glow: Mesh | undefined;
    if (model.glow) {
      glow = new Mesh(model.glow, this.glowMaterial);
      group.add(glow);
    }
    this.scene.add(group);
    return { group, glow };
  }

  private sync(entry: Entry, building: Building): void {
    const building3dTop = Math.max(building.width, building.height) * 0.75 + 26;
    const constructing = building.state === "constructing";
    entry.group.scale.y = constructing ? 0.12 + 0.88 * building.buildProgress : 1;
    if (entry.glow) entry.glow.visible = !constructing;

    const barWidth = Math.max(building.width * 0.8, 34);
    if (constructing) {
      this.bars.add(building.x, building3dTop * entry.group.scale.y + 8, building.y, barWidth, building.buildProgress, "warn");
    } else if (building.hp < building.maxHp) {
      this.bars.add(building.x, building3dTop, building.y, barWidth, building.hp / building.maxHp);
    }
  }
}
