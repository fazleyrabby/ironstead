import { Group, Mesh } from "three";
import type { BufferGeometry, Scene } from "three";
import { PALETTE, worldToTile } from "../config/world";
import { STYLE } from "../render/style";
import { unitDef } from "../sim/selectors";
import type { GameState, PlayerId, Unit, UnitType } from "../sim/types";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Bars3D } from "./Bars3D";
import { merge, modelMaterial, prim } from "./geo";
import type { Quality } from "./quality";

const TUNIC: Record<PlayerId, number> = { player: PALETTE.playerTint, enemy: PALETTE.enemyTint };
const TRIM: Record<PlayerId, number> = { player: 0x1e4fae, enemy: 0xa52424 };

type AttackStyle = "chop" | "thrust" | "shoot";
type Parts = BufferGeometry[];

// A limb's parts are modelled hanging down from its pivot, so rotating the
// pivot swings the limb and whatever it holds.
interface LimbParts {
  parts: Parts;
  x: number;
  y: number;
  z: number;
}

function limbParts(color: number, w: number, length: number, x: number, y: number, z = 0): LimbParts {
  return { parts: [prim("box", color, w, length, w, 0, -length / 2, 0)], x, y, z };
}

interface Limb {
  geometry: BufferGeometry;
  x: number;
  y: number;
  z: number;
}

// Merged geometry for one unit type + owner, shared by every such unit: a
// static body plus one mesh per moving limb.
interface Blueprint {
  body: BufferGeometry;
  legs: Limb[];
  armL: Limb;
  armR: Limb;
  attack: AttackStyle;
  mounted: boolean;
  scale: number;
  height: number;
}

function humanoid(
  body: Parts,
  type: UnitType,
  owner: PlayerId,
  hipY: number,
  z: number,
  withLegs: boolean,
): { legs: LimbParts[]; armL: LimbParts; armR: LimbParts } {
  const tunic = type === "villager" ? 0xb08a5a : TUNIC[owner];
  const trim = TRIM[owner];
  const legs: LimbParts[] = [];

  if (withLegs) {
    for (const sx of [-1, 1]) legs.push(limbParts(STYLE.boot, 2.5, hipY, sx * 1.7, hipY, z));
  }
  body.push(prim("box", tunic, 7, 9.5, 4.4, 0, hipY + 4.75, z));
  body.push(prim("box", trim, 7.3, 1.6, 4.7, 0, hipY + 1.2, z));
  body.push(prim("ball", STYLE.skin, 3.2, 3.3, 3.2, 0, hipY + 12.6, z));

  const armL = limbParts(tunic, 2.2, 8, -4.7, hipY + 9, z);
  const armR = limbParts(tunic, 2.2, 8, 4.7, hipY + 9, z);
  armL.parts.push(prim("ball", STYLE.skin, 1.3, 1.3, 1.3, 0, -8.2, 0));
  armR.parts.push(prim("ball", STYLE.skin, 1.3, 1.3, 1.3, 0, -8.2, 0));

  const headY = hipY + 12.6;
  const forward = Math.PI / 2;
  switch (type) {
    case "villager":
      body.push(prim("cone", 0xd9b45c, 5.2, 3, 5.2, 0, headY + 3.4, z));
      // Pick/axe held in the working hand.
      armR.parts.push(prim("box", STYLE.woodDark, 0.8, 9, 0.8, 0, -8, 3));
      armR.parts.push(prim("box", STYLE.steel, 0.9, 2.4, 4.6, 0, -4.2, 4.2));
      break;
    case "swordsman":
      body.push(prim("ball", STYLE.steel, 3.5, 2.6, 3.5, 0, headY + 1.5, z));
      armR.parts.push(prim("box", STYLE.steel, 0.8, 11, 1.7, 0, -8, 5.5, forward));
      armR.parts.push(prim("box", STYLE.goldDark, 3.4, 0.9, 0.9, 0, -8, 0.8));
      armL.parts.push(prim("tube", trim, 4.6, 1, 4.6, -1.5, -5, 0, 0, forward));
      armL.parts.push(prim("ball", STYLE.steel, 1.2, 1.2, 1.2, -2.2, -5, 0));
      break;
    case "spearman":
      body.push(prim("cone", STYLE.steel, 3.6, 4, 3.6, 0, headY + 3, z));
      armR.parts.push(prim("tube", STYLE.woodDark, 0.45, 26, 0.45, 0, -8, 6, forward));
      armR.parts.push(prim("cone", STYLE.steel, 1.1, 4, 1.1, 0, -8, 20.5, forward));
      break;
    case "crossbowman":
      body.push(prim("cone", STYLE.leather, 3.9, 4.6, 3.9, 0, headY + 2.6, z));
      armR.parts.push(prim("box", STYLE.woodDark, 1.2, 1.2, 9, 0, -8, 3.5));
      armR.parts.push(prim("box", STYLE.woodLight, 10, 0.9, 1.1, 0, -8, 7));
      body.push(prim("tube", STYLE.leather, 1.6, 7, 1.6, -2.5, hipY + 7, z - 3));
      break;
    case "horse_rider":
      body.push(prim("ball", STYLE.steel, 3.5, 2.8, 3.5, 0, headY + 1.4, z));
      body.push(prim("cone", trim, 1, 3.4, 1, 0, headY + 5, z));
      armR.parts.push(prim("tube", STYLE.woodDark, 0.5, 32, 0.5, 0, -8, 9, forward));
      armR.parts.push(prim("cone", STYLE.steel, 1.3, 5, 1.3, 0, -8, 27, forward));
      break;
    case "hero":
      body.push(prim("tube", STYLE.gold, 3.1, 1.9, 3.1, 0, headY + 3.5, z));
      body.push(prim("box", trim, 8.4, 13, 0.9, 0, hipY + 4, z - 2.9));
      body.push(prim("box", STYLE.gold, 7.6, 1.5, 4.9, 0, hipY + 8.6, z));
      armR.parts.push(prim("box", STYLE.steel, 1, 14, 2.1, 0, -8, 7, forward));
      armR.parts.push(prim("box", STYLE.gold, 4.2, 1, 1, 0, -8, 0.8));
      break;
  }
  return { legs, armL, armR };
}

function finish(limb: LimbParts): Limb {
  return { geometry: merge(limb.parts), x: limb.x, y: limb.y, z: limb.z };
}

function blueprint(type: UnitType, owner: PlayerId): Blueprint {
  const body: Parts = [];
  const s = unitDef(type).radius / 10;

  if (type === "horse_rider") {
    body.push(prim("box", STYLE.horse, 6.5, 7, 17, 0, 12.5, 0));
    body.push(prim("box", STYLE.horse, 3.4, 9, 4.4, 0, 18, 8.2, 0.55));
    body.push(prim("box", STYLE.horse, 3.2, 3.6, 7, 0, 22.5, 12));
    body.push(prim("box", STYLE.horseDark, 1, 6, 1.4, 0, 20, 6.6));
    body.push(prim("box", STYLE.horseDark, 1.4, 8, 1.4, 0, 12, -9.2, -0.35));
    body.push(prim("box", TRIM[owner], 7, 1.2, 8, 0, 16.4, -0.5));
    for (const sx of [-1, 1]) body.push(prim("box", STYLE.boot, 2.2, 7, 2.6, sx * 3.9, 17, 0.1));
    const legs = [
      limbParts(STYLE.horseDark, 2, 9.5, -2.2, 9.5, 6.4),
      limbParts(STYLE.horseDark, 2, 9.5, 2.2, 9.5, 6.4),
      limbParts(STYLE.horseDark, 2, 9.5, -2.2, 9.5, -6.4),
      limbParts(STYLE.horseDark, 2, 9.5, 2.2, 9.5, -6.4),
    ];
    const rider = humanoid(body, type, owner, 16.6, -0.5, false);
    return {
      body: merge(body),
      legs: legs.map(finish),
      armL: finish(rider.armL),
      armR: finish(rider.armR),
      attack: "thrust",
      mounted: true,
      scale: s,
      height: 36 * s,
    };
  }

  const parts = humanoid(body, type, owner, 8, 0, true);
  const scale = s * 1.12 * (type === "hero" ? 1.18 : 1);
  return {
    body: merge(body),
    legs: parts.legs.map(finish),
    armL: finish(parts.armL),
    armR: finish(parts.armR),
    attack: type === "crossbowman" ? "shoot" : type === "spearman" ? "thrust" : "chop",
    mounted: false,
    scale,
    height: 27 * scale,
  };
}

interface Rig {
  // Rotated to face travel; model front is +z.
  root: Group;
  // Bobs with the stride.
  body: Group;
  legs: Group[];
  armL: Group;
  armR: Group;
  attack: AttackStyle;
  mounted: boolean;
  height: number;
}

interface Entry {
  rig: Rig;
  phase: number;
  move: number;
  heading: number;
  lastX: number;
  lastY: number;
  death: number;
}

// Low-poly animated figures. Walk, attack and work cycles are driven from the
// unit's sim state; heading follows its movement.
export class Units3D {
  private readonly scene: Scene;
  private readonly bars: Bars3D;
  private readonly entries = new Map<string, Entry>();
  private readonly blueprints = new Map<string, Blueprint>();
  private readonly shadows: boolean;

  constructor(scene: Scene, bars: Bars3D, quality: Quality) {
    this.scene = scene;
    this.bars = bars;
    this.shadows = quality.unitShadows;
  }

  // Five meshes per foot unit (body, two legs, two arms), all sharing one
  // material and per-type geometry.
  private buildRig(unit: Unit): Rig {
    const key = `${unit.type}_${unit.owner}`;
    let print = this.blueprints.get(key);
    if (!print) {
      print = blueprint(unit.type, unit.owner);
      this.blueprints.set(key, print);
    }

    const root = new Group();
    const body = new Group();
    root.add(body);
    root.scale.setScalar(print.scale);

    const add = (parent: Group, geometry: BufferGeometry): void => {
      const mesh = new Mesh(geometry, modelMaterial());
      mesh.castShadow = this.shadows;
      parent.add(mesh);
    };
    const hang = (limb: Limb): Group => {
      const pivot = new Group();
      pivot.position.set(limb.x, limb.y, limb.z);
      add(pivot, limb.geometry);
      body.add(pivot);
      return pivot;
    };

    add(body, print.body);
    return {
      root,
      body,
      legs: print.legs.map(hang),
      armL: hang(print.armL),
      armR: hang(print.armR),
      attack: print.attack,
      mounted: print.mounted,
      height: print.height,
    };
  }

  update(state: GameState, visibility: VisibilityMap, nowSec: number, frameDt: number): void {
    const selected = new Set(state.ui.selectedUnitIds);
    const seen = new Set<string>();

    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        let entry = this.entries.get(unit.id);

        if (unit.state === "dead") {
          // Brief topple; the sim reaps dead units shortly after.
          if (entry) {
            seen.add(unit.id);
            entry.death = Math.min(1, entry.death + frameDt * 4);
            entry.rig.root.rotation.x = -entry.death * (Math.PI / 2);
            entry.rig.root.position.y = -entry.death * 2;
          }
          continue;
        }

        if (id === "enemy") {
          // Out of sight: keep the last seen pose on explored ground, else hide.
          const tile = worldToTile(unit.x, unit.y);
          if (!isTileVisible(visibility, tile.x, tile.y)) {
            if (entry && isTileExplored(visibility, tile.x, tile.y)) seen.add(unit.id);
            continue;
          }
        }
        seen.add(unit.id);

        if (!entry) {
          const rig = this.buildRig(unit);
          this.scene.add(rig.root);
          entry = {
            rig,
            phase: Math.random() * Math.PI * 2,
            move: 0,
            heading: 0,
            lastX: unit.x,
            lastY: unit.y,
            death: 0,
          };
          this.entries.set(unit.id, entry);
        }
        this.animate(entry, unit, nowSec, frameDt);

        if (selected.has(unit.id) || unit.hp < unit.maxHp) {
          const width = Math.max(24, unitDef(unit.type).radius * 2 + 6);
          this.bars.add(unit.x, entry.rig.height + 9, unit.y, width, unit.hp / unit.maxHp);
        }
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.rig.root);
      this.entries.delete(id);
    }
  }

  private animate(entry: Entry, unit: Unit, nowSec: number, frameDt: number): void {
    const { rig } = entry;
    rig.root.position.set(unit.x, 0, unit.y);

    const dx = unit.x - entry.lastX;
    const dy = unit.y - entry.lastY;
    if (dx * dx + dy * dy > 0.04) {
      const target = Math.atan2(dx, dy);
      let diff = target - entry.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      entry.heading += diff * Math.min(1, frameDt * 12);
      entry.lastX = unit.x;
      entry.lastY = unit.y;
    }
    rig.root.rotation.y = entry.heading;

    const moving = unit.state === "moving";
    entry.move += ((moving ? 1 : 0) - entry.move) * Math.min(1, frameDt * 8);
    const pace = Math.max(0.7, Math.min(1.7, unitDef(unit.type).speed / 70));
    entry.phase += frameDt * (rig.mounted ? 13 : 10) * pace * (0.2 + entry.move);

    const swing = Math.sin(entry.phase) * entry.move;
    const breathe = Math.sin(nowSec * 2 + entry.phase) * 0.12;
    rig.body.position.y = Math.abs(Math.cos(entry.phase)) * entry.move * (rig.mounted ? 1.3 : 0.7) + breathe;

    if (rig.mounted) {
      rig.legs[0].rotation.x = swing * 0.8;
      rig.legs[1].rotation.x = -swing * 0.8;
      rig.legs[2].rotation.x = -swing * 0.8;
      rig.legs[3].rotation.x = swing * 0.8;
      rig.body.rotation.x = Math.sin(entry.phase * 2) * 0.04 * entry.move;
    } else {
      rig.legs[0].rotation.x = swing * 0.75;
      rig.legs[1].rotation.x = -swing * 0.75;
    }

    // Arms: stride swing by default, overridden by the current action.
    let left = -swing * 0.55;
    let right = swing * 0.55;
    if (unit.state === "attacking") {
      const beat = Math.sin(nowSec * 9 + entry.phase);
      if (rig.attack === "chop") right = -1.5 + beat * 1.05;
      else if (rig.attack === "thrust") right = -1.25 + beat * 0.35;
      else right = -1.45 + Math.max(0, beat) * 0.18;
      if (rig.attack === "shoot") left = -1.2;
      rig.body.position.z = rig.attack === "thrust" ? Math.max(0, beat) * 1.6 : 0;
    } else {
      rig.body.position.z = 0;
      if (unit.state === "gathering" || unit.state === "repairing") {
        right = -1.35 + Math.sin(nowSec * 6 + entry.phase) * 0.95;
      } else if (rig.mounted || rig.attack === "thrust") {
        // Carry lances and spears upright-ish rather than dragging them.
        right = -0.5 + swing * 0.15;
      }
    }
    rig.armL.rotation.x = left;
    rig.armR.rotation.x = right;
  }
}
