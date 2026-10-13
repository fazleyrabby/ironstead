import { Group, Mesh } from "three";
import type { BufferGeometry, Scene } from "three";
import { worldToTile } from "../config/world";
import { unitDef } from "../sim/selectors";
import type { GameState, PlayerId, Unit, UnitType } from "../sim/types";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { Bars3D } from "./Bars3D";
import { merge, modelMaterial, prim, Spring } from "./geo";
import { FACTION, TOON } from "./palette";
import type { Quality } from "./quality";

type AttackStyle = "chop" | "thrust" | "shoot";
type Parts = BufferGeometry[];

const PANTS = 0x6a4f38;
const EYE = 0x2a1d16;
const HAIR = { brown: 0x6b3f1e, black: 0x33261c, ginger: 0xd9772a, blond: 0xf2c552 };

// A limb's parts are modelled hanging from (or sitting on) its pivot, so
// rotating the pivot swings the limb and whatever it carries.
interface LimbParts {
  parts: Parts;
  x: number;
  y: number;
  z: number;
}

interface Limb {
  geometry: BufferGeometry;
  x: number;
  y: number;
  z: number;
}

// Merged geometry for one unit type + owner, shared by every such unit: a
// static torso plus one mesh each for the head and the moving limbs.
interface Blueprint {
  body: BufferGeometry;
  head: Limb;
  legs: Limb[];
  armL: Limb;
  armR: Limb;
  attack: AttackStyle;
  mounted: boolean;
  scale: number;
  height: number;
}

// Stubby leg: short trouser thigh and an oversized boot.
function leg(x: number, hipY: number, z: number, pants: number): LimbParts {
  return {
    parts: [
      prim("box", pants, 3.6, hipY * 0.6, 3.6, 0, -hipY * 0.3, 0),
      prim("box", TOON.boot, 4.2, hipY * 0.5, 5.6, 0, -hipY * 0.75, 0.9),
      prim("box", TOON.leather, 4.4, 0.9, 4.2, 0, -hipY * 0.5, 0.2),
    ],
    x,
    y: hipY,
    z,
  };
}

// Thick arm ending in a big fist.
function arm(x: number, y: number, z: number, sleeve: number, forearm: number, fist: number): LimbParts {
  return {
    parts: [
      prim("ball", sleeve, 2.5, 2.3, 2.5, 0, 0, 0),
      prim("box", sleeve, 3, 4, 3, 0, -2.4, 0),
      prim("box", forearm, 3.1, 3, 3.1, 0, -5, 0),
      prim("ball", fist, 2.2, 2.1, 2.2, 0, -7.4, 0),
    ],
    x,
    y,
    z,
  };
}

// Big cartoon head, modelled around the neck pivot at its base.
function headBase(hair: number, beard?: number): Parts {
  const head: Parts = [
    prim("orb", TOON.skin, 5.1, 4.7, 4.9, 0, 4.3, 0),
    prim("ball", TOON.skinDark, 1, 0.9, 1, 0, 3.4, 4.9),
    prim("slab", EYE, 2, 0.55, 0.5, 0, 1.8, 4.5),
  ];
  for (const sx of [-1, 1]) {
    head.push(prim("ball", 0xffffff, 1.25, 1.4, 0.8, sx * 1.95, 4.9, 4.2));
    head.push(prim("ball", EYE, 0.62, 0.7, 0.5, sx * 1.95, 4.8, 4.85));
    head.push(prim("slab", hair, 2.2, 0.65, 0.6, sx * 1.95, 6.6, 4.3, 0, sx * -0.2));
    head.push(prim("ball", TOON.skin, 1.05, 1.3, 0.8, sx * 5, 4, 0));
  }
  if (beard !== undefined) {
    head.push(prim("ball", beard, 3.9, 3.2, 2.6, 0, 1.2, 3.1));
    head.push(prim("ball", beard, 2.2, 0.9, 1, 0, 2.7, 4.7));
  }
  return head;
}

interface Figure {
  head: Parts;
  legs: LimbParts[];
  armL: LimbParts;
  armR: LimbParts;
  neckY: number;
}

function humanoid(body: Parts, type: UnitType, owner: PlayerId, hipY: number, z: number, withLegs: boolean): Figure {
  const faction = FACTION[owner];
  const soldier = type !== "villager";
  const tunic = soldier ? faction.main : 0xc99a5e;
  const legs: LimbParts[] = [];
  if (withLegs) {
    for (const sx of [-1, 1]) legs.push(leg(sx * 2.7, hipY, z, soldier ? PANTS : 0x7d6447));
  }

  // Barrel torso, belt and buckle.
  body.push(prim("box", tunic, 9.6, 8.8, 6.8, 0, hipY + 4.2, z));
  body.push(prim("box", tunic, 10.2, 2.6, 7.4, 0, hipY + 0.6, z));
  body.push(prim("box", TOON.leather, 10, 1.9, 7.2, 0, hipY + 2.6, z));
  body.push(prim("box", TOON.gold, 2.4, 2.4, 0.8, 0, hipY + 2.6, z + 3.7));

  const shoulderY = hipY + 7.4;
  const neckY = hipY + 8.4;
  const forward = Math.PI / 2;
  let head: Parts;
  let armL: LimbParts;
  let armR: LimbParts;

  switch (type) {
    case "villager":
      head = headBase(HAIR.brown);
      armL = arm(-6.3, shoulderY, z, tunic, TOON.skin, TOON.skin);
      armR = arm(6.3, shoulderY, z, tunic, TOON.skin, TOON.skin);
      // Moustache, floppy straw hat with a team band.
      head.push(prim("ball", HAIR.brown, 2.4, 0.8, 0.9, 0, 2.7, 4.8));
      head.push(prim("tube", TOON.thatch, 8.2, 0.8, 8.2, 0, 7.6, 0, -0.06));
      head.push(prim("ball", TOON.thatch, 4.6, 3.4, 4.6, 0, 8.8, 0));
      head.push(prim("tube", faction.main, 4.7, 1.2, 4.7, 0, 8.3, 0));
      // Neckerchief, apron and a bulging backpack.
      body.push(prim("box", faction.main, 7.4, 1.8, 6, 0, hipY + 7.7, z + 0.4));
      body.push(prim("box", TOON.canvas, 6.4, 6.6, 0.8, 0, hipY + 3.2, z + 3.5));
      body.push(prim("ball", 0xa9814a, 4.4, 4.6, 3.4, 0, hipY + 5, z - 4.6));
      body.push(prim("box", TOON.leather, 9.4, 1, 7.4, 0, hipY + 6.4, z - 0.2, 0, 0.5));
      // Oversized pickaxe.
      armR.parts.push(prim("tube", TOON.woodDark, 0.7, 13, 0.7, 0, -7.4, 4.4, forward));
      armR.parts.push(prim("box", TOON.steel, 1.5, 9, 2, 0, -7.4, 10.6));
      armR.parts.push(prim("cone", TOON.steel, 1, 2.6, 1.1, 0, -2, 10.6));
      armR.parts.push(prim("cone", TOON.steel, 1, 2.6, 1.1, 0, -12.8, 10.6, Math.PI));
      break;

    case "swordsman":
      head = headBase(HAIR.ginger, HAIR.ginger);
      armL = arm(-6.3, shoulderY, z, tunic, TOON.steelDark, TOON.leather);
      armR = arm(6.3, shoulderY, z, tunic, TOON.steelDark, TOON.leather);
      // Dome helmet with rim, nasal and a tall plume.
      head.push(prim("orb", TOON.steel, 5.4, 3.7, 5.2, 0, 6.6, -0.1));
      head.push(prim("tube", TOON.steelDark, 5.6, 1, 5.4, 0, 5.4, -0.1));
      head.push(prim("slab", TOON.steel, 1.1, 3.2, 0.9, 0, 4.4, 5));
      head.push(prim("box", faction.main, 1.6, 3.8, 6.4, 0, 10.6, -0.6));
      head.push(prim("ball", faction.light, 1.3, 1.6, 1.6, 0, 11.6, 2.4));
      // Breastplate and chunky pauldrons.
      body.push(prim("box", TOON.steel, 8.4, 6, 1.2, 0, hipY + 6, z + 3.3));
      body.push(prim("slab", TOON.steelDark, 8.6, 0.8, 1.3, 0, hipY + 6, z + 3.4));
      for (const sx of [-1, 1]) body.push(prim("ball", TOON.steel, 3.3, 2.5, 3.5, sx * 6.2, hipY + 8.6, z));
      // Fat sword.
      armR.parts.push(prim("slab", TOON.steel, 1, 15, 3.2, 0, -7.4, 9.2, forward));
      armR.parts.push(prim("slab", TOON.steelDark, 1.1, 11, 0.9, 0, -7.4, 8, forward));
      armR.parts.push(prim("cone", TOON.steel, 1.6, 3, 0.5, 0, -7.4, 18.2, forward));
      armR.parts.push(prim("box", TOON.gold, 6.4, 1.5, 1.6, 0, -7.4, 1.6));
      armR.parts.push(prim("ball", TOON.gold, 1.3, 1.3, 1.3, 0, -7.4, -2.6));
      // Big round shield.
      armL.parts.push(prim("tube", TOON.gold, 6.6, 1.1, 6.6, -2.2, -5.4, 0.6, 0, forward));
      armL.parts.push(prim("tube", faction.main, 5.6, 1.4, 5.6, -2.5, -5.4, 0.6, 0, forward));
      armL.parts.push(prim("slab", faction.light, 0.5, 2, 10.4, -3.3, -5.4, 0.6));
      armL.parts.push(prim("ball", TOON.gold, 1.9, 1.9, 1.9, -3.5, -5.4, 0.6));
      break;

    case "spearman":
      head = headBase(HAIR.black);
      armL = arm(-6.3, shoulderY, z, tunic, TOON.leather, TOON.skin);
      armR = arm(6.3, shoulderY, z, tunic, TOON.leather, TOON.skin);
      // Pointed kettle helm.
      head.push(prim("tube", TOON.steelDark, 6.6, 0.8, 6.4, 0, 6.6, 0));
      head.push(prim("cone", TOON.steel, 5, 5.2, 4.9, 0, 9.4, 0));
      head.push(prim("ball", TOON.gold, 0.9, 0.9, 0.9, 0, 12.2, 0));
      // Quilted tabard and a shield slung on the back.
      body.push(prim("box", faction.dark, 5, 7.4, 0.9, 0, hipY + 4.6, z + 3.4));
      body.push(prim("box", TOON.gold, 2, 2, 0.6, 0, hipY + 6.2, z + 3.9, 0, Math.PI / 4));
      for (const sx of [-1, 1]) body.push(prim("ball", TOON.leather, 3, 2.2, 3.2, sx * 6.2, hipY + 8.6, z));
      body.push(prim("tube", faction.main, 5.2, 1.2, 5.2, 0, hipY + 5, z - 4.2, forward));
      body.push(prim("ball", TOON.gold, 1.5, 1.5, 1, 0, hipY + 5, z - 5));
      // Long spear with a leaf blade and pennant.
      armR.parts.push(prim("tube", TOON.woodDark, 0.7, 34, 0.7, 0, -7.4, 8, forward));
      armR.parts.push(prim("cone", TOON.steel, 2, 6.4, 0.8, 0, -7.4, 28, forward));
      armR.parts.push(prim("tube", TOON.gold, 1.1, 1.8, 1.1, 0, -7.4, 24, forward));
      armR.parts.push(prim("slab", faction.main, 0.5, 4.4, 5.4, 0, -10.2, 20.6));
      break;

    case "crossbowman":
      head = headBase(HAIR.brown);
      armL = arm(-6.3, shoulderY, z, tunic, TOON.leather, TOON.leather);
      armR = arm(6.3, shoulderY, z, tunic, TOON.leather, TOON.leather);
      // Deep hood with a team trim and a feather.
      head.push(prim("orb", TOON.leaf, 5.6, 5.2, 5.5, 0, 5.4, -1));
      head.push(prim("cone", TOON.leaf, 3.4, 5, 3.4, 0, 10.4, -2.4, -0.5));
      head.push(prim("tube", faction.main, 5.7, 1, 5.3, 0, 3.1, -0.4));
      head.push(prim("slab", 0xf5f2e8, 0.5, 5, 1.4, 3.6, 10, -1, 0, -0.4));
      // Bandolier and a fat quiver of bolts.
      body.push(prim("box", TOON.leather, 1.8, 12, 0.9, 0, hipY + 5, z + 3.5, 0, 0.7));
      body.push(prim("tube", TOON.woodDark, 2.6, 8.4, 2.4, -3.2, hipY + 5.6, z - 4.4, 0, 0.25));
      for (let i = 0; i < 3; i += 1) {
        body.push(prim("tube", TOON.woodLight, 0.4, 3.4, 0.4, -5 + i * 1.1, hipY + 11, z - 4.4));
        body.push(prim("slab", faction.light, 1.4, 1.5, 0.4, -5 + i * 1.1, hipY + 12.8, z - 4.4));
      }
      // Chunky crossbow with a loaded bolt.
      armR.parts.push(prim("box", TOON.woodDark, 2.2, 2.4, 13, 0, -7.4, 5));
      armR.parts.push(prim("box", TOON.wood, 15, 1.7, 2, 0, -7.4, 10.4));
      armR.parts.push(prim("box", TOON.steel, 3, 2.2, 2.6, 0, -7.4, 10.4));
      armR.parts.push(prim("slab", 0xf2ead2, 14, 0.4, 0.4, 0, -6.4, 6.8));
      armR.parts.push(prim("tube", TOON.woodLight, 0.4, 8, 0.4, 0, -6.2, 8.4, forward));
      armR.parts.push(prim("cone", TOON.steel, 0.9, 2.2, 0.9, 0, -6.2, 13.2, forward));
      break;

    case "horse_rider":
      head = headBase(HAIR.black);
      armL = arm(-6.3, shoulderY, z, tunic, TOON.steelDark, TOON.leather);
      armR = arm(6.3, shoulderY, z, tunic, TOON.steelDark, TOON.leather);
      // Bucket helm with a visor slit and a big crest.
      head.push(prim("orb", TOON.steel, 5.5, 5, 5.3, 0, 5, 0));
      head.push(prim("slab", EYE, 6.4, 1, 0.8, 0, 4.9, 4.8));
      head.push(prim("slab", TOON.steelDark, 1, 5, 0.9, 0, 4.4, 5));
      head.push(prim("box", faction.main, 1.8, 5, 7, 0, 10.6, -0.4));
      // Cuirass, pauldrons, cape.
      body.push(prim("box", TOON.steel, 8.4, 6.2, 1.2, 0, hipY + 6, z + 3.3));
      for (const sx of [-1, 1]) body.push(prim("ball", TOON.steel, 3.3, 2.5, 3.5, sx * 6.2, hipY + 8.6, z));
      body.push(prim("box", faction.dark, 9.6, 11, 1, 0, hipY + 4.4, z - 4, 0.2));
      // Lance with vamplate and pennant, small shield.
      armR.parts.push(prim("tube", TOON.woodDark, 0.8, 40, 0.8, 0, -7.4, 11, forward));
      armR.parts.push(prim("cone", TOON.steel, 2, 7, 0.9, 0, -7.4, 34, forward));
      armR.parts.push(prim("cone", TOON.gold, 3, 3.4, 3, 0, -7.4, 3.4, -forward));
      armR.parts.push(prim("slab", faction.main, 0.5, 4.6, 6.4, 0, -10.6, 26));
      armL.parts.push(prim("tube", TOON.gold, 5, 1, 5, -2.2, -5.4, 0.4, 0, forward));
      armL.parts.push(prim("tube", faction.main, 4.2, 1.3, 4.2, -2.5, -5.4, 0.4, 0, forward));
      armL.parts.push(prim("ball", TOON.gold, 1.5, 1.5, 1.5, -3.4, -5.4, 0.4));
      break;

    case "hero":
      head = headBase(HAIR.blond, HAIR.blond);
      armL = arm(-6.3, shoulderY, z, tunic, TOON.gold, TOON.leather);
      armR = arm(6.3, shoulderY, z, tunic, TOON.gold, TOON.leather);
      // Flowing hair and a heavy jewelled crown.
      head.push(prim("ball", HAIR.blond, 5.3, 4.6, 4.2, 0, 4.6, -1.6));
      head.push(prim("tube", TOON.gold, 4.9, 2.2, 4.9, 0, 8.6, 0));
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
        head.push(prim("cone", TOON.gold, 1.2, 3, 1.2, Math.cos(a) * 4.2, 11, Math.sin(a) * 4.2));
        head.push(prim("ball", i % 2 ? 0xe5413a : 0x46c7f0, 0.75, 0.75, 0.75, Math.cos(a) * 4.9, 8.7, Math.sin(a) * 4.9));
      }
      head.push(prim("ball", 0xc0392b, 3.9, 2.2, 3.9, 0, 9.6, 0));
      // Royal cape with ermine collar, gilded cuirass and pauldrons.
      body.push(prim("box", faction.dark, 12, 16, 1.1, 0, hipY + 2.4, z - 4.4, 0.16));
      body.push(prim("box", 0xfaf6ea, 12.6, 2.4, 2.2, 0, hipY + 8.8, z - 3.4));
      body.push(prim("box", 0xfaf6ea, 12.4, 1.8, 1.4, 0, hipY - 5.2, z - 5.6));
      body.push(prim("box", TOON.gold, 8.6, 6.4, 1.3, 0, hipY + 6, z + 3.3));
      body.push(prim("box", faction.light, 3, 3.4, 0.7, 0, hipY + 6.2, z + 4.1, 0, Math.PI / 4));
      for (const sx of [-1, 1]) {
        body.push(prim("ball", TOON.gold, 3.7, 2.8, 3.9, sx * 6.3, hipY + 8.8, z));
        body.push(prim("cone", TOON.goldDark, 1.3, 2.6, 1.3, sx * 7.6, hipY + 10.8, z));
      }
      // Greatsword.
      armR.parts.push(prim("slab", TOON.steel, 1.2, 20, 4, 0, -7.4, 11.6, forward));
      armR.parts.push(prim("slab", TOON.steelDark, 1.3, 15, 1, 0, -7.4, 10, forward));
      armR.parts.push(prim("cone", TOON.steel, 2, 3.6, 0.6, 0, -7.4, 23.4, forward));
      armR.parts.push(prim("box", TOON.gold, 8.4, 1.8, 1.9, 0, -7.4, 1.6));
      armR.parts.push(prim("ball", 0xe5413a, 1.5, 1.5, 1.5, 0, -7.4, -2.8));
      break;
  }
  return { head, legs, armL, armR, neckY };
}

function finish(limb: LimbParts): Limb {
  return { geometry: merge(limb.parts), x: limb.x, y: limb.y, z: limb.z };
}

// Stubby horse leg with a fat hoof.
function horseLeg(x: number, z: number): LimbParts {
  return {
    parts: [
      prim("box", TOON.horse, 3.2, 5, 3.2, 0, -2.5, 0),
      prim("box", TOON.horseDark, 2.7, 2.6, 2.7, 0, -6, 0),
      prim("box", EYE, 3.4, 1.8, 3.8, 0, -8.1, 0.3),
    ],
    x,
    y: 9,
    z,
  };
}

function blueprint(type: UnitType, owner: PlayerId): Blueprint {
  const body: Parts = [];
  const s = unitDef(type).radius / 10;
  const faction = FACTION[owner];

  if (type === "horse_rider") {
    // Barrel-chested pony: round body, short neck, huge head.
    body.push(prim("orb", TOON.horse, 5.6, 5.2, 9.4, 0, 12, 0));
    body.push(prim("ball", TOON.horse, 5, 5, 4.4, 0, 12.6, 6.4));
    body.push(prim("ball", TOON.horse, 5.2, 5.2, 4.6, 0, 12.4, -6));
    body.push(prim("box", TOON.horse, 4.6, 9, 5.4, 0, 17.6, 8.6, 0.6));
    body.push(prim("box", TOON.horse, 4.8, 5.2, 7.4, 0, 22.4, 12.4));
    body.push(prim("box", 0xc99a6a, 4.2, 3.8, 3.4, 0, 21.6, 16.6));
    for (const sx of [-1, 1]) {
      body.push(prim("cone", TOON.horse, 0.9, 2.4, 0.9, sx * 1.6, 26, 10.6));
      body.push(prim("ball", 0xffffff, 0.9, 1, 0.6, sx * 2.4, 23.6, 13.4));
      body.push(prim("ball", EYE, 0.5, 0.55, 0.45, sx * 2.75, 23.5, 13.7));
      body.push(prim("ball", EYE, 0.4, 0.4, 0.3, sx * 1, 21.4, 18.3));
    }
    for (let i = 0; i < 4; i += 1) body.push(prim("ball", TOON.horseDark, 1.5, 2, 1.9, 0, 25.2 - i * 2.2, 9.2 - i * 1.6));
    body.push(prim("ball", TOON.horseDark, 1.7, 2.2, 1.9, 0, 26, 11.6));
    body.push(prim("ball", TOON.horseDark, 2, 4.6, 2, 0, 11, -10.4, -0.4));
    // Caparison, saddle, bridle.
    body.push(prim("box", faction.main, 10.6, 5.4, 10.4, 0, 12.6, -0.4));
    body.push(prim("box", TOON.gold, 10.9, 1.1, 10.7, 0, 9.9, -0.4));
    body.push(prim("box", TOON.leather, 6.6, 1.8, 7.4, 0, 16.2, -0.4));
    body.push(prim("box", TOON.leather, 6, 3, 1.6, 0, 17.2, -4));
    body.push(prim("box", TOON.leather, 5.2, 0.8, 0.9, 0, 21.4, 14.6));
    body.push(prim("box", TOON.leather, 5.2, 0.8, 0.9, 0, 24, 10.8));
    for (const sx of [-1, 1]) {
      body.push(prim("slab", TOON.leather, 0.4, 0.6, 10, sx * 2.6, 20.6, 6.4, -0.35));
      body.push(prim("box", PANTS, 3.2, 5.6, 3.6, sx * 5.6, 14.4, 0));
      body.push(prim("box", TOON.boot, 3.6, 3.4, 5, sx * 5.8, 10.6, 0.7));
    }
    const legs = [horseLeg(-3, 6), horseLeg(3, 6), horseLeg(-3.1, -6), horseLeg(3.1, -6)];
    const rider = humanoid(body, type, owner, 15.6, -0.6, false);
    return {
      body: merge(body),
      head: { geometry: merge(rider.head), x: 0, y: rider.neckY, z: -0.6 },
      legs: legs.map(finish),
      armL: finish(rider.armL),
      armR: finish(rider.armR),
      attack: "thrust",
      mounted: true,
      scale: s * 0.92,
      height: 40 * s,
    };
  }

  const figure = humanoid(body, type, owner, 5.4, 0, true);
  const scale = s * 1.02 * (type === "hero" ? 1.22 : 1);
  return {
    body: merge(body),
    head: { geometry: merge(figure.head), x: 0, y: figure.neckY, z: 0 },
    legs: figure.legs.map(finish),
    armL: finish(figure.armL),
    armR: finish(figure.armR),
    attack: type === "crossbowman" ? "shoot" : type === "spearman" ? "thrust" : "chop",
    mounted: false,
    scale,
    height: 30 * scale,
  };
}

interface Rig {
  // Rotated to face travel; model front is +z.
  root: Group;
  // Squashes, stretches and leans.
  body: Group;
  head: Group;
  legs: Group[];
  armL: Group;
  armR: Group;
  attack: AttackStyle;
  mounted: boolean;
  scale: number;
  height: number;
}

interface Entry {
  rig: Rig;
  phase: number;
  move: number;
  heading: number;
  lastX: number;
  lastY: number;
  // Drawn position: glides after the 30 Hz sim position instead of stepping.
  x: number;
  y: number;
  lastHp: number;
  wasMoving: boolean;
  lastBeat: number;
  death: number;
  // Jelly state: everything the body does overshoots and settles.
  pop: Spring;
  squash: Spring;
  lean: Spring;
  nod: Spring;
  armL: Spring;
  armR: Spring;
}

// Chunky toy figures with jelly motion: squash-and-stretch on every step,
// springy arms, a head that lags behind the body, and a pop when they spawn.
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

  // Six meshes per foot unit (body, head, two legs, two arms), all sharing
  // one material and per-type geometry.
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
      head: hang(print.head),
      legs: print.legs.map(hang),
      armL: hang(print.armL),
      armR: hang(print.armR),
      attack: print.attack,
      mounted: print.mounted,
      scale: print.scale,
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
          // Splat: flatten into a puddle; the sim reaps dead units shortly after.
          if (entry) {
            seen.add(unit.id);
            entry.death = Math.min(1, entry.death + frameDt * 5);
            const flat = 1 - entry.death * 0.92;
            const spread = 1 + entry.death * 0.7;
            entry.rig.body.scale.set(spread, flat, spread);
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
            x: unit.x,
            y: unit.y,
            lastHp: unit.hp,
            wasMoving: false,
            lastBeat: 0,
            death: 0,
            // Starts at zero size and springs up past full size.
            pop: new Spring(-1, 0),
            squash: new Spring(),
            lean: new Spring(),
            nod: new Spring(),
            armL: new Spring(),
            armR: new Spring(),
          };
          this.entries.set(unit.id, entry);
        }
        this.animate(entry, unit, nowSec, frameDt);

        if (selected.has(unit.id) || unit.hp < unit.maxHp) {
          const width = Math.max(24, unitDef(unit.type).radius * 2 + 6);
          this.bars.add(entry.x, entry.rig.height + 9, entry.y, width, unit.hp / unit.maxHp);
        }
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.rig.root);
      this.entries.delete(id);
    }
  }

  // Where a unit is drawn this frame, for overlays that must track it exactly.
  drawnPosition(id: string): { x: number; y: number } | undefined {
    return this.entries.get(id);
  }

  private animate(entry: Entry, unit: Unit, nowSec: number, frameDt: number): void {
    const { rig } = entry;
    const glide = 1 - Math.exp(-frameDt * 16);
    entry.x += (unit.x - entry.x) * glide;
    entry.y += (unit.y - entry.y) * glide;
    rig.root.position.set(entry.x, 0, entry.y);
    rig.root.scale.setScalar(rig.scale * Math.max(0.01, 1 + entry.pop.step(frameDt, 210, 12)));

    const dx = unit.x - entry.lastX;
    const dy = unit.y - entry.lastY;
    if (dx * dx + dy * dy > 0.04) {
      const target = Math.atan2(dx, dy);
      let diff = target - entry.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      entry.heading += diff * (1 - Math.exp(-frameDt * 9));
      entry.lastX = unit.x;
      entry.lastY = unit.y;
    }
    rig.root.rotation.y = entry.heading;

    const moving = unit.state === "moving";
    const working = unit.state === "gathering" || unit.state === "repairing";
    const attacking = unit.state === "attacking";

    // Starting squashes down then springs up; stopping jiggles to rest.
    if (moving !== entry.wasMoving) {
      entry.squash.kick(moving ? -2.6 : 2.2);
      entry.nod.kick(moving ? -4 : 5);
      entry.wasMoving = moving;
    }
    // Taking a hit flattens the unit for a moment.
    if (unit.hp < entry.lastHp) {
      entry.squash.kick(-3.4);
      entry.nod.kick(6);
    }
    entry.lastHp = unit.hp;

    entry.move += ((moving ? 1 : 0) - entry.move) * (1 - Math.exp(-frameDt * 6));
    const pace = Math.max(0.7, Math.min(1.7, unitDef(unit.type).speed / 70));
    entry.phase += frameDt * (rig.mounted ? 12 : 9) * pace * (0.15 + entry.move);

    const stride = Math.sin(entry.phase);
    const swing = stride * entry.move;
    // sin² instead of |sin|: the hop eases into and out of the ground with no kink.
    const hop = stride * stride * entry.move;
    // Stretch at the top of each hop, squash on landing; idle just breathes.
    const gait = (hop - 0.5) * 0.16 * entry.move;
    const breathe = Math.sin(nowSec * 2.4 + entry.phase) * 0.035 * (1 - entry.move);

    // Action beat: one wind-up and release per cycle, with a kick at the hit.
    let beat = 0;
    if (attacking || working) {
      beat = Math.sin(nowSec * (attacking ? 8.5 : 6) + entry.phase * 0.3);
      if (beat > 0.9 && entry.lastBeat <= 0.9) {
        entry.squash.kick(attacking ? -2 : -1.3);
        entry.nod.kick(3.5);
      }
    }
    entry.lastBeat = beat;

    const squash = entry.squash.step(frameDt, 140, 10);
    const sy = Math.max(0.45, 1 + squash + gait + breathe);
    // Preserve volume: what the body loses in height it gains in girth.
    const sxz = 1 / Math.sqrt(sy);
    rig.body.scale.set(sxz, sy, sxz);
    rig.body.position.y = hop * (rig.mounted ? 2.6 : 2.2);

    // Lean into travel, waddle side to side, lunge on a thrust.
    entry.lean.target = entry.move * 0.2 + (attacking ? 0.1 : 0);
    rig.body.rotation.x = entry.lean.step(frameDt, 90, 10);
    rig.body.rotation.z = Math.cos(entry.phase) * 0.11 * entry.move;
    rig.body.position.z = attacking && rig.attack === "thrust" ? Math.max(0, beat) * 2.4 : 0;

    // The head lags the body and wobbles back, like it is on a spring.
    entry.nod.target = -entry.lean.x * 0.6;
    rig.head.rotation.x = entry.nod.step(frameDt, 110, 8);
    rig.head.rotation.z = -rig.body.rotation.z * 0.9;
    const headSquash = 1 - (sy - 1) * 0.5;
    rig.head.scale.set(1 / Math.sqrt(headSquash), headSquash, 1 / Math.sqrt(headSquash));

    if (rig.mounted) {
      rig.legs[0].rotation.x = swing * 0.9;
      rig.legs[1].rotation.x = -swing * 0.9;
      rig.legs[2].rotation.x = -swing * 0.9;
      rig.legs[3].rotation.x = swing * 0.9;
    } else {
      rig.legs[0].rotation.x = swing * 0.9;
      rig.legs[1].rotation.x = -swing * 0.9;
    }

    // Arms chase their pose through a spring, so swings overshoot and settle.
    let left = -swing * 0.7;
    let right = swing * 0.7;
    if (attacking) {
      if (rig.attack === "chop") right = -1.55 + beat * 1.15;
      else if (rig.attack === "thrust") right = -1.25 + beat * 0.4;
      else right = -1.45 + Math.max(0, beat) * 0.22;
      if (rig.attack === "shoot") left = -1.2;
      else left = 0.3 - beat * 0.3;
    } else if (working) {
      right = -1.4 + beat * 1.05;
      left = 0.2 - beat * 0.25;
    } else if (rig.mounted || rig.attack === "thrust") {
      // Carry lances and spears upright-ish rather than dragging them.
      right = -0.55 + swing * 0.15;
    }
    entry.armL.target = left;
    entry.armR.target = right;
    rig.armL.rotation.x = entry.armL.step(frameDt, 190, 14);
    rig.armR.rotation.x = entry.armR.step(frameDt, 190, 14);
    // Arms flare out as the body squashes.
    rig.armL.rotation.z = -0.12 - Math.max(0, 1 - sy) * 0.9;
    rig.armR.rotation.z = 0.12 + Math.max(0, 1 - sy) * 0.9;
  }
}
