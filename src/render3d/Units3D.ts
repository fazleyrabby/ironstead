import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial } from "three";
import type { BufferGeometry, Material, Scene } from "three";
import { PALETTE, worldToTile } from "../config/world";
import { STYLE } from "../render/style";
import { unitDef } from "../sim/selectors";
import type { GameState, PlayerId, Unit, UnitType } from "../sim/types";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Bars3D } from "./Bars3D";

const TUNIC: Record<PlayerId, number> = { player: PALETTE.playerTint, enemy: PALETTE.enemyTint };
const TRIM: Record<PlayerId, number> = { player: 0x1e4fae, enemy: 0xa52424 };

// Shared unit-sized primitives; every body part is one of these, scaled.
const BOX = new BoxGeometry(1, 1, 1);
const BALL = new IcosahedronGeometry(1, 1);
const TUBE = new CylinderGeometry(1, 1, 1, 6);
const CONE = new ConeGeometry(1, 1, 6);

const materials = new Map<number, MeshLambertMaterial>();
function lit(color: number): MeshLambertMaterial {
  let material = materials.get(color);
  if (!material) {
    material = new MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, material);
  }
  return material;
}
const GOLD_GLOW = new MeshBasicMaterial({ color: new Color(STYLE.gold).multiplyScalar(1.15) });

function piece(
  parent: Group,
  geometry: BufferGeometry,
  material: Material,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// A limb hangs from its pivot so rotating the pivot swings it.
function limb(parent: Group, material: Material, w: number, length: number, x: number, y: number, z = 0): Group {
  const pivot = new Group();
  pivot.position.set(x, y, z);
  piece(pivot, BOX, material, w, length, w, 0, -length / 2, 0);
  parent.add(pivot);
  return pivot;
}

type AttackStyle = "chop" | "thrust" | "shoot";

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

function humanoid(body: Group, type: UnitType, owner: PlayerId, hipY: number, withLegs: boolean): Pick<Rig, "legs" | "armL" | "armR"> {
  const tunic = lit(type === "villager" ? 0xb08a5a : TUNIC[owner]);
  const trim = lit(TRIM[owner]);
  const skin = lit(STYLE.skin);
  const steel = lit(STYLE.steel);
  const legs: Group[] = [];

  if (withLegs) {
    for (const sx of [-1, 1]) legs.push(limb(body, lit(STYLE.boot), 2.5, hipY, sx * 1.7, hipY));
  }
  piece(body, BOX, tunic, 7, 9.5, 4.4, 0, hipY + 4.75, 0);
  piece(body, BOX, trim, 7.3, 1.6, 4.7, 0, hipY + 1.2, 0);
  piece(body, BALL, skin, 3.2, 3.3, 3.2, 0, hipY + 12.6, 0);

  const armL = limb(body, tunic, 2.2, 8, -4.7, hipY + 9);
  const armR = limb(body, tunic, 2.2, 8, 4.7, hipY + 9);
  piece(armL, BALL, skin, 1.3, 1.3, 1.3, 0, -8.2, 0);
  piece(armR, BALL, skin, 1.3, 1.3, 1.3, 0, -8.2, 0);

  const headY = hipY + 12.6;
  switch (type) {
    case "villager":
      piece(body, CONE, lit(0xd9b45c), 5.2, 3, 5.2, 0, headY + 3.4, 0);
      // Pick/axe held in the working hand.
      piece(armR, BOX, lit(STYLE.woodDark), 0.8, 9, 0.8, 0, -8, 3);
      piece(armR, BOX, steel, 0.9, 2.4, 4.6, 0, -4.2, 4.2);
      break;
    case "swordsman":
      piece(body, BALL, steel, 3.5, 2.6, 3.5, 0, headY + 1.5, 0);
      piece(armR, BOX, steel, 0.8, 11, 1.7, 0, -8, 5.5).rotation.x = Math.PI / 2;
      piece(armR, BOX, lit(STYLE.goldDark), 3.4, 0.9, 0.9, 0, -8, 0.8);
      piece(armL, TUBE, trim, 4.6, 1, 4.6, -1.5, -5, 0).rotation.z = Math.PI / 2;
      piece(armL, BALL, steel, 1.2, 1.2, 1.2, -2.2, -5, 0);
      break;
    case "spearman":
      piece(body, CONE, steel, 3.6, 4, 3.6, 0, headY + 3, 0);
      piece(armR, TUBE, lit(STYLE.woodDark), 0.45, 26, 0.45, 0, -8, 6).rotation.x = Math.PI / 2;
      piece(armR, CONE, steel, 1.1, 4, 1.1, 0, -8, 20.5).rotation.x = Math.PI / 2;
      break;
    case "crossbowman":
      piece(body, CONE, lit(STYLE.leather), 3.9, 4.6, 3.9, 0, headY + 2.6, 0);
      piece(armR, BOX, lit(STYLE.woodDark), 1.2, 1.2, 9, 0, -8, 3.5);
      piece(armR, BOX, lit(STYLE.woodLight), 10, 0.9, 1.1, 0, -8, 7);
      piece(body, TUBE, lit(STYLE.leather), 1.6, 7, 1.6, -2.5, hipY + 7, -3);
      break;
    case "horse_rider":
      piece(body, BALL, steel, 3.5, 2.8, 3.5, 0, headY + 1.4, 0);
      piece(body, CONE, trim, 1, 3.4, 1, 0, headY + 5, 0);
      piece(armR, TUBE, lit(STYLE.woodDark), 0.5, 32, 0.5, 0, -8, 9).rotation.x = Math.PI / 2;
      piece(armR, CONE, steel, 1.3, 5, 1.3, 0, -8, 27).rotation.x = Math.PI / 2;
      break;
    case "hero":
      piece(body, TUBE, GOLD_GLOW, 3.1, 1.9, 3.1, 0, headY + 3.5, 0).castShadow = false;
      piece(body, BOX, trim, 8.4, 13, 0.9, 0, hipY + 4, -2.9);
      piece(body, BOX, lit(STYLE.gold), 7.6, 1.5, 4.9, 0, hipY + 8.6, 0);
      piece(armR, BOX, steel, 1, 14, 2.1, 0, -8, 7).rotation.x = Math.PI / 2;
      piece(armR, BOX, lit(STYLE.gold), 4.2, 1, 1, 0, -8, 0.8);
      break;
  }
  return { legs, armL, armR };
}

function buildRig(unit: Unit): Rig {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const s = unitDef(unit.type).radius / 10;

  if (unit.type === "horse_rider") {
    const coat = lit(STYLE.horse);
    const dark = lit(STYLE.horseDark);
    piece(body, BOX, coat, 6.5, 7, 17, 0, 12.5, 0);
    piece(body, BOX, coat, 3.4, 9, 4.4, 0, 18, 8.2).rotation.x = 0.55;
    piece(body, BOX, coat, 3.2, 3.6, 7, 0, 22.5, 12);
    piece(body, BOX, dark, 1, 6, 1.4, 0, 20, 6.6);
    piece(body, BOX, dark, 1.4, 8, 1.4, 0, 12, -9.2).rotation.x = -0.35;
    piece(body, BOX, lit(TRIM[unit.owner]), 7, 1.2, 8, 0, 16.4, -0.5);
    const legs = [
      limb(body, dark, 2, 9.5, -2.2, 9.5, 6.4),
      limb(body, dark, 2, 9.5, 2.2, 9.5, 6.4),
      limb(body, dark, 2, 9.5, -2.2, 9.5, -6.4),
      limb(body, dark, 2, 9.5, 2.2, 9.5, -6.4),
    ];
    const rider = new Group();
    rider.position.set(0, 0, -0.5);
    body.add(rider);
    const upper = humanoid(rider, unit.type, unit.owner, 16.6, false);
    for (const sx of [-1, 1]) piece(rider, BOX, lit(STYLE.boot), 2.2, 7, 2.6, sx * 3.9, 13.5, 0.6);
    root.scale.setScalar(s);
    return { root, body, legs, armL: upper.armL, armR: upper.armR, attack: "thrust", mounted: true, height: 36 * s };
  }

  const parts = humanoid(body, unit.type, unit.owner, 8, true);
  const big = unit.type === "hero" ? 1.18 : 1;
  root.scale.setScalar(s * 1.12 * big);
  const attack: AttackStyle = unit.type === "crossbowman" ? "shoot" : unit.type === "spearman" ? "thrust" : "chop";
  return { root, body, ...parts, attack, mounted: false, height: 27 * s * 1.12 * big };
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

  constructor(scene: Scene, bars: Bars3D) {
    this.scene = scene;
    this.bars = bars;
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
          const rig = buildRig(unit);
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
