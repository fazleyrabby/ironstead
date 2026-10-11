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

const PANTS = 0x5b4a3a;
const HAIR = [0x4a2f1c, 0x2a2018, 0x8a5a2a, 0xc9a25a];

// Leg: trouser thigh, boot shin with cuff, and a foot pointing forward.
function legParts(hipY: number, x: number, z: number, pants: number): LimbParts {
  const leg = limbParts(pants, 2.4, hipY * 0.55, x, hipY, z);
  leg.parts.push(prim("box", STYLE.boot, 2.7, hipY * 0.48, 2.7, 0, -hipY * 0.76, 0));
  leg.parts.push(prim("box", STYLE.leather, 3, 0.9, 3, 0, -hipY * 0.52, 0));
  leg.parts.push(prim("box", STYLE.boot, 2.7, 1.5, 4.2, 0, -hipY + 0.75, 0.9));
  return leg;
}

// Arm: sleeve, forearm (bare, gloved or armoured) and a hand.
function armParts(x: number, y: number, z: number, sleeve: number, forearm: number, hand: number): LimbParts {
  const arm = limbParts(sleeve, 2.2, 4.6, x, y, z);
  arm.parts.push(prim("box", forearm, 2, 3.6, 2, 0, -6.2, 0));
  arm.parts.push(prim("ball", hand, 1.3, 1.3, 1.3, 0, -8.3, 0));
  return arm;
}

function face(body: Parts, headY: number, z: number, hair: number, beard?: number): void {
  for (const sx of [-1, 1]) body.push(prim("box", 0x241d18, 0.6, 0.7, 0.4, sx * 1.15, headY + 0.4, z + 3));
  body.push(prim("box", STYLE.skinDark, 0.7, 0.9, 0.7, 0, headY - 0.4, z + 3.1));
  body.push(prim("ball", hair, 3.1, 2.6, 3, 0, headY + 0.9, z - 0.7));
  if (beard !== undefined) body.push(prim("ball", beard, 2.3, 2, 1.6, 0, headY - 1.9, z + 2));
}

function humanoid(
  body: Parts,
  type: UnitType,
  owner: PlayerId,
  hipY: number,
  z: number,
  withLegs: boolean,
): { legs: LimbParts[]; armL: LimbParts; armR: LimbParts } {
  const soldier = type !== "villager";
  const tunic = soldier ? TUNIC[owner] : 0xb08a5a;
  const trim = TRIM[owner];
  const legs: LimbParts[] = [];
  if (withLegs) {
    for (const sx of [-1, 1]) legs.push(legParts(hipY, sx * 1.7, z, soldier ? PANTS : 0x6b5a42));
  }

  // Torso: tunic with skirt hem, belt and buckle, collar.
  body.push(prim("box", tunic, 7, 9.5, 4.4, 0, hipY + 4.75, z));
  body.push(prim("box", tunic, 7.5, 2.6, 4.9, 0, hipY + 0.2, z));
  body.push(prim("box", STYLE.leather, 7.4, 1.5, 4.8, 0, hipY + 2.2, z));
  body.push(prim("box", STYLE.gold, 1.5, 1.5, 0.6, 0, hipY + 2.2, z + 2.5));
  body.push(prim("box", trim, 5, 1.2, 4.7, 0, hipY + 9.3, z));
  body.push(prim("box", STYLE.skinDark, 2.6, 1.4, 2.6, 0, hipY + 10, z));
  body.push(prim("ball", STYLE.skin, 3.2, 3.3, 3.2, 0, hipY + 12.6, z));

  const headY = hipY + 12.6;
  const shoulderY = hipY + 9;
  const forward = Math.PI / 2;
  let armL: LimbParts;
  let armR: LimbParts;

  switch (type) {
    case "villager":
      armL = armParts(-4.7, shoulderY, z, tunic, STYLE.skin, STYLE.skin);
      armR = armParts(4.7, shoulderY, z, tunic, STYLE.skin, STYLE.skin);
      face(body, headY, z, HAIR[2]);
      // Straw hat with band, apron and a wicker pack.
      body.push(prim("tube", 0xd9b45c, 5.6, 0.6, 5.6, 0, headY + 2.3, z));
      body.push(prim("cone", 0xd9b45c, 3.4, 3, 3.4, 0, headY + 4, z));
      body.push(prim("tube", trim, 3.3, 0.8, 3.3, 0, headY + 2.9, z));
      body.push(prim("box", 0xe4d6b8, 4.6, 6.4, 0.6, 0, hipY + 3.4, z + 2.4));
      body.push(prim("tube", 0x9a7a44, 2.6, 6, 2.2, 0, hipY + 6, z - 3.4));
      body.push(prim("tube", 0x7a5e32, 2.8, 0.8, 2.4, 0, hipY + 8.6, z - 3.4));
      // Pickaxe in the working hand.
      armR.parts.push(prim("box", STYLE.woodDark, 0.8, 10, 0.8, 0, -8, 3.4, forward));
      armR.parts.push(prim("box", STYLE.steel, 0.9, 6.4, 1.2, 0, -8, 8));
      armR.parts.push(prim("cone", STYLE.steel, 0.6, 1.6, 0.6, 0, -4.2, 8));
      armR.parts.push(prim("cone", STYLE.steel, 0.6, 1.6, 0.6, 0, -11.8, 8, Math.PI));
      break;

    case "swordsman":
      armL = armParts(-4.7, shoulderY, z, tunic, STYLE.steelDark, STYLE.leather);
      armR = armParts(4.7, shoulderY, z, tunic, STYLE.steelDark, STYLE.leather);
      face(body, headY, z, HAIR[0]);
      // Helmet with nasal and plume, breastplate, pauldrons, scabbard.
      body.push(prim("ball", STYLE.steel, 3.5, 2.7, 3.5, 0, headY + 1.5, z));
      body.push(prim("tube", STYLE.steelDark, 3.6, 0.8, 3.6, 0, headY + 0.6, z));
      body.push(prim("box", STYLE.steel, 0.8, 2.6, 0.7, 0, headY, z + 3.3));
      body.push(prim("box", trim, 0.9, 2.4, 4.4, 0, headY + 4.6, z - 0.4));
      body.push(prim("box", STYLE.steel, 6.4, 6, 0.9, 0, hipY + 6, z + 2.2));
      body.push(prim("box", STYLE.steelDark, 6.6, 0.8, 1, 0, hipY + 6, z + 2.3));
      for (const sx of [-1, 1]) body.push(prim("ball", STYLE.steel, 2, 1.5, 2.3, sx * 4.6, hipY + 9.6, z));
      body.push(prim("box", STYLE.leather, 1, 9, 1.4, -3.9, hipY + 1.4, z - 1.4, -0.5));
      armR.parts.push(prim("box", STYLE.steel, 0.7, 12, 1.8, 0, -8, 6.2, forward));
      armR.parts.push(prim("cone", STYLE.steel, 0.9, 1.8, 0.35, 0, -8, 13, forward));
      armR.parts.push(prim("box", STYLE.goldDark, 3.8, 0.9, 0.9, 0, -8, 0.6));
      armR.parts.push(prim("ball", STYLE.gold, 0.8, 0.8, 0.8, 0, -8, -1.6));
      // Round shield: rim, face, boss and a painted bar.
      armL.parts.push(prim("tube", STYLE.steelDark, 5, 0.8, 5, -1.5, -5, 0, 0, forward));
      armL.parts.push(prim("tube", trim, 4.4, 1, 4.4, -1.7, -5, 0, 0, forward));
      armL.parts.push(prim("box", 0xf5f2e8, 0.4, 1.2, 7.4, -2.3, -5, 0));
      armL.parts.push(prim("ball", STYLE.steel, 1.3, 1.3, 1.3, -2.5, -5, 0));
      break;

    case "spearman":
      armL = armParts(-4.7, shoulderY, z, tunic, STYLE.leather, STYLE.skin);
      armR = armParts(4.7, shoulderY, z, tunic, STYLE.leather, STYLE.skin);
      face(body, headY, z, HAIR[1]);
      // Kettle helm, padded jack, shield slung on the back.
      body.push(prim("tube", STYLE.steelDark, 4.6, 0.6, 4.6, 0, headY + 1.6, z));
      body.push(prim("cone", STYLE.steel, 3.5, 3.6, 3.5, 0, headY + 3.4, z));
      for (const dx of [-2.2, 0, 2.2]) body.push(prim("box", trim, 0.5, 7, 0.5, dx, hipY + 6, z + 2.3));
      for (const sx of [-1, 1]) body.push(prim("box", STYLE.leather, 2.6, 1.3, 2.8, sx * 4.6, hipY + 9.6, z));
      body.push(prim("tube", trim, 4, 0.9, 4, 0, hipY + 6, z - 3, forward));
      body.push(prim("ball", STYLE.steel, 1.1, 1.1, 1.1, 0, hipY + 6, z - 3.7));
      armR.parts.push(prim("tube", STYLE.woodDark, 0.45, 28, 0.45, 0, -8, 6, forward));
      armR.parts.push(prim("cone", STYLE.steel, 1.1, 4.4, 0.5, 0, -8, 22, forward));
      armR.parts.push(prim("tube", STYLE.steelDark, 0.7, 1.4, 0.7, 0, -8, 19.4, forward));
      armR.parts.push(prim("box", trim, 0.4, 3, 3.6, 0, -9.8, 17));
      break;

    case "crossbowman":
      armL = armParts(-4.7, shoulderY, z, tunic, STYLE.leather, STYLE.leather);
      armR = armParts(4.7, shoulderY, z, tunic, STYLE.leather, STYLE.leather);
      face(body, headY, z, HAIR[0]);
      // Hood with cowl, bandolier, quiver of bolts.
      body.push(prim("cone", STYLE.leather, 3.9, 4.6, 3.9, 0, headY + 2.6, z - 0.3));
      body.push(prim("tube", STYLE.leather, 4.2, 1.6, 3.6, 0, hipY + 10, z - 0.4));
      body.push(prim("box", STYLE.leather, 1.2, 11, 0.6, 0, hipY + 5.6, z + 2.3, 0, 0.7));
      body.push(prim("tube", STYLE.woodDark, 1.7, 7, 1.7, -2.4, hipY + 6.6, z - 3.2, 0, 0.25));
      for (let i = 0; i < 3; i += 1) {
        body.push(prim("tube", STYLE.woodLight, 0.25, 3, 0.25, -3.6 + i * 0.7, hipY + 11, z - 3.2));
        body.push(prim("box", 0xf5f2e8, 0.9, 1.1, 0.2, -3.6 + i * 0.7, hipY + 12.6, z - 3.2));
      }
      // Crossbow: stock, prod, string and a loaded bolt.
      armR.parts.push(prim("box", STYLE.woodDark, 1.3, 1.4, 10, 0, -8, 3.6));
      armR.parts.push(prim("box", STYLE.woodLight, 11, 0.9, 1.1, 0, -8, 7.6));
      armR.parts.push(prim("box", STYLE.steelDark, 1.8, 1.1, 1.4, 0, -8, 7.6));
      armR.parts.push(prim("box", 0xe8e0c8, 10, 0.25, 0.25, 0, -7.4, 5));
      armR.parts.push(prim("tube", STYLE.woodLight, 0.25, 6, 0.25, 0, -7.2, 6, forward));
      armR.parts.push(prim("cone", STYLE.steel, 0.5, 1.4, 0.5, 0, -7.2, 9.6, forward));
      break;

    case "horse_rider":
      armL = armParts(-4.7, shoulderY, z, tunic, STYLE.steelDark, STYLE.leather);
      armR = armParts(4.7, shoulderY, z, tunic, STYLE.steelDark, STYLE.leather);
      face(body, headY, z, HAIR[1]);
      // Great helm with crest, cuirass, pauldrons and a riding cape.
      body.push(prim("ball", STYLE.steel, 3.5, 2.9, 3.5, 0, headY + 1.4, z));
      body.push(prim("box", STYLE.steelDark, 5.6, 0.9, 0.6, 0, headY + 0.5, z + 3));
      body.push(prim("box", trim, 0.9, 3.6, 4.6, 0, headY + 5, z - 0.3));
      body.push(prim("box", STYLE.steel, 6.4, 6.4, 0.9, 0, hipY + 6, z + 2.2));
      for (const sx of [-1, 1]) body.push(prim("ball", STYLE.steel, 2.1, 1.6, 2.4, sx * 4.6, hipY + 9.6, z));
      body.push(prim("box", trim, 7.6, 11, 0.7, 0, hipY + 5, z - 2.8, 0.18));
      armR.parts.push(prim("tube", STYLE.woodDark, 0.5, 34, 0.5, 0, -8, 9, forward));
      armR.parts.push(prim("cone", STYLE.steel, 1.3, 5.4, 0.6, 0, -8, 28.6, forward));
      armR.parts.push(prim("cone", STYLE.steelDark, 2, 2.4, 2, 0, -8, 3, -forward));
      armR.parts.push(prim("box", trim, 0.4, 3.4, 5, 0, -10.4, 22));
      armL.parts.push(prim("tube", trim, 3.6, 0.9, 3.6, -1.6, -5, 0, 0, forward));
      armL.parts.push(prim("ball", STYLE.steel, 1.1, 1.1, 1.1, -2.3, -5, 0));
      break;

    case "hero":
      armL = armParts(-4.7, shoulderY, z, tunic, STYLE.gold, STYLE.leather);
      armR = armParts(4.7, shoulderY, z, tunic, STYLE.gold, STYLE.leather);
      face(body, headY, z, HAIR[3], HAIR[3]);
      // Crown with points and jewel, ermine-trimmed cape, gilded armour.
      body.push(prim("tube", STYLE.gold, 3.2, 1.6, 3.2, 0, headY + 3.2, z));
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        body.push(prim("cone", STYLE.gold, 0.7, 1.8, 0.7, Math.cos(a) * 2.8, headY + 4.8, z + Math.sin(a) * 2.8));
      }
      body.push(prim("ball", STYLE.mushroom, 0.8, 0.8, 0.8, 0, headY + 3.3, z + 3.1));
      body.push(prim("box", trim, 9, 15, 0.8, 0, hipY + 3.4, z - 3, 0.12));
      body.push(prim("box", 0xf5f2e8, 9.6, 1.8, 1.4, 0, hipY + 10.2, z - 2.6));
      body.push(prim("box", 0xf5f2e8, 9.2, 1.4, 1, 0, hipY - 3.6, z - 3.9));
      body.push(prim("box", STYLE.gold, 6.6, 6.4, 0.9, 0, hipY + 6, z + 2.2));
      body.push(prim("box", trim, 2.6, 3, 0.5, 0, hipY + 6.4, z + 2.8));
      for (const sx of [-1, 1]) {
        body.push(prim("ball", STYLE.gold, 2.4, 1.7, 2.6, sx * 4.7, hipY + 9.7, z));
        body.push(prim("cone", STYLE.goldDark, 0.8, 1.6, 0.8, sx * 5.6, hipY + 11, z));
      }
      // Greatsword with fuller, crossguard and pommel.
      armR.parts.push(prim("box", STYLE.steel, 0.9, 16, 2.3, 0, -8, 8.4, forward));
      armR.parts.push(prim("box", STYLE.steelDark, 1, 12, 0.6, 0, -8, 7.4, forward));
      armR.parts.push(prim("cone", STYLE.steel, 1.15, 2.4, 0.45, 0, -8, 17.6, forward));
      armR.parts.push(prim("box", STYLE.gold, 5, 1, 1.1, 0, -8, 0.6));
      armR.parts.push(prim("ball", STYLE.gold, 1, 1, 1, 0, -8, -1.9));
      break;
  }
  return { legs, armL, armR };
}

function finish(limb: LimbParts): Limb {
  return { geometry: merge(limb.parts), x: limb.x, y: limb.y, z: limb.z };
}

function horseLeg(x: number, z: number): LimbParts {
  const leg = limbParts(STYLE.horse, 2.1, 5.4, x, 9.5, z);
  leg.parts.push(prim("box", STYLE.horseDark, 1.7, 3.2, 1.7, 0, -6.8, 0));
  leg.parts.push(prim("box", 0x241d18, 2.2, 1.3, 2.4, 0, -8.9, 0.2));
  return leg;
}

function blueprint(type: UnitType, owner: PlayerId): Blueprint {
  const body: Parts = [];
  const s = unitDef(type).radius / 10;

  if (type === "horse_rider") {
    const coat = STYLE.horse;
    const dark = STYLE.horseDark;
    // Barrel, chest, haunches.
    body.push(prim("box", coat, 6.5, 7, 17, 0, 12.5, 0));
    body.push(prim("box", coat, 7, 7.4, 5, 0, 12.7, 6.4));
    body.push(prim("box", coat, 7.2, 7.6, 5.4, 0, 12.9, -6.2));
    // Neck, head, muzzle, ears, eyes.
    body.push(prim("box", coat, 3.4, 9.6, 4.6, 0, 18.4, 8.4, 0.55));
    body.push(prim("box", coat, 3.2, 3.8, 6.4, 0, 22.8, 12));
    body.push(prim("box", dark, 2.6, 2.8, 2.6, 0, 22.2, 15.6));
    for (const sx of [-1, 1]) {
      body.push(prim("cone", coat, 0.6, 1.8, 0.6, sx * 1.1, 25.4, 10.4));
      body.push(prim("box", 0x241d18, 0.4, 0.8, 0.8, sx * 1.65, 23.4, 12.6));
    }
    // Mane, tail.
    for (let i = 0; i < 4; i += 1) body.push(prim("box", dark, 1.1, 2.6, 2.2, 0, 23.6 - i * 2, 8.6 - i * 1.5, 0.55));
    body.push(prim("box", dark, 1.5, 9, 1.5, 0, 11.6, -9.6, -0.35));
    body.push(prim("box", dark, 1.9, 4, 1.9, 0, 8, -11.2, -0.2));
    // Caparison, saddle, stirrups, bridle and reins.
    body.push(prim("box", TRIM[owner], 7.2, 5, 9.6, 0, 13.6, -0.5));
    body.push(prim("box", TUNIC[owner], 7.4, 1.4, 9.8, 0, 11, -0.5));
    body.push(prim("box", STYLE.leather, 5.4, 1.4, 6.4, 0, 16.8, -0.5));
    body.push(prim("box", STYLE.leather, 5, 2.4, 1.2, 0, 17.6, -3.6));
    body.push(prim("box", STYLE.leather, 4.4, 2, 1, 0, 17.4, 2.6));
    body.push(prim("box", STYLE.leather, 3.5, 0.6, 0.7, 0, 22.2, 13.8));
    body.push(prim("box", STYLE.leather, 3.5, 0.6, 0.7, 0, 23.9, 11));
    for (const sx of [-1, 1]) {
      body.push(prim("box", STYLE.leather, 0.3, 0.5, 9, sx * 1.8, 20.8, 6.6, -0.35));
      body.push(prim("box", PANTS, 2.2, 6, 2.6, sx * 3.9, 15, 0.1));
      body.push(prim("box", STYLE.boot, 2.4, 3.4, 3.4, sx * 4, 11, 0.6));
      body.push(prim("box", STYLE.steelDark, 0.5, 1.2, 2.6, sx * 4.4, 9.2, 0.8));
    }
    const legs = [horseLeg(-2.2, 6.4), horseLeg(2.2, 6.4), horseLeg(-2.3, -6.4), horseLeg(2.3, -6.4)];
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
