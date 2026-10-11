import type { BufferGeometry } from "three";
import { STYLE } from "../render/style";
import type { BuildingType, PlayerId } from "../sim/types";
import { blob, box, cone, cyl, gable, merge, rock, seeded } from "./geo";
import { pineModel } from "./Props3D";

export interface BuildingModel {
  // Lit, shadow-casting body.
  body: BufferGeometry;
  // Unlit bright parts (windows, lanterns, gold) that the bloom pass picks up.
  glow?: BufferGeometry;
}

const ROOF: Record<PlayerId, number> = { player: 0x3b6db3, enemy: 0xb5433f };
const ROOF_DARK: Record<PlayerId, number> = { player: 0x2c5490, enemy: 0x8f332f };
const BANNER: Record<PlayerId, number> = { player: 0x60a5fa, enemy: 0xf87171 };

const PLASTER = 0xe8d8b0;
const PLASTER_SHADE = 0xcdbb92;
const THATCH = 0xc9a55a;
const THATCH_DARK = 0xa5843f;
const CANVAS = 0xe4d6b8;
const CANVAS_SHADE = 0xc4b592;
const WINDOW = 0xffd98a;
const IRON = 0x3a3d45;
const SACK = 0xcbb98a;
const HAY = 0xdcc05a;

type Parts = BufferGeometry[];

// Box centred on the origin, for parts that are rotated before being placed.
function cbox(w: number, h: number, d: number, color: number): BufferGeometry {
  return box(w, h, d, color, 0, -h / 2, 0);
}

// Gable roof with ridge beam, shingle courses and eave boards.
function gableRoof(
  parts: Parts,
  length: number,
  span: number,
  h: number,
  color: number,
  dark: number,
  x: number,
  y: number,
  z: number,
  alongZ = false,
): void {
  const local: Parts = [gable(length, span, h, color)];
  local.push(cbox(length + 1.6, 1.7, 1.7, dark).translate(0, h + 0.2, 0));
  const slope = Math.atan2(h, span / 2);
  for (const side of [-1, 1]) {
    for (const t of [0.28, 0.52, 0.76, 0.98]) {
      local.push(
        cbox(length + 0.7, 0.7, t > 0.9 ? 2.2 : 1.3, dark)
          .rotateX(side * slope)
          .translate(0, h * (1 - t) + 0.4, side * (span / 2) * t),
      );
    }
  }
  for (const piece of local) {
    if (alongZ) piece.rotateY(Math.PI / 2);
    parts.push(piece.translate(x, y, z));
  }
}

// Half-timber frame on a front (+z) wall: posts, rails and diagonal braces.
function timberFront(parts: Parts, w: number, h: number, x: number, y: number, z: number, bays: number): void {
  for (let i = 0; i <= bays; i += 1) parts.push(box(1.8, h, 1, STYLE.woodDark, x - w / 2 + (w / bays) * i, y, z));
  parts.push(box(w + 1, 1.8, 1, STYLE.woodDark, x, y, z));
  parts.push(box(w + 1, 1.8, 1, STYLE.woodDark, x, y + h * 0.5, z));
  parts.push(box(w + 1, 1.8, 1, STYLE.woodDark, x, y + h - 1.8, z));
  const bay = w / bays;
  const brace = Math.hypot(bay, h * 0.5);
  for (const i of [0, bays - 1]) {
    const lean = i === 0 ? 1 : -1;
    parts.push(
      cbox(brace * 0.92, 1.3, 0.8, STYLE.woodDark)
        .rotateZ(lean * Math.atan2(h * 0.5, bay))
        .translate(x - w / 2 + bay * (i + 0.5), y + h * 0.25, z),
    );
  }
}

function flag(parts: Parts, owner: PlayerId, x: number, y: number, z: number, h = 16): void {
  parts.push(cyl(0.6, 0.7, h, STYLE.woodDark, x, y, z, 5));
  parts.push(blob(1, STYLE.gold, x, y + h + 0.6, z, 1, 0));
  parts.push(box(8, 5, 0.6, BANNER[owner], x + 4.6, y + h - 6, z));
  parts.push(box(3, 3.4, 0.6, ROOF_DARK[owner], x + 10, y + h - 5.2, z));
}

// Front (+z) window: frame, shutters and sill on the body, pane in the glow mesh.
function windowAt(parts: Parts, glow: Parts, x: number, y: number, z: number, w = 5, h = 6, shutter?: number): void {
  parts.push(box(w + 1.8, h + 1.8, 0.8, STYLE.woodDark, x, y - 0.9, z));
  parts.push(box(w + 3, 1, 1.6, STYLE.woodLight, x, y - 1.6, z + 0.4));
  glow.push(box(w, h, 0.8, WINDOW, x, y, z + 0.5));
  parts.push(box(0.7, h, 0.5, STYLE.woodDark, x, y, z + 1));
  parts.push(box(w, 0.7, 0.5, STYLE.woodDark, x, y + h / 2 - 0.35, z + 1));
  if (shutter !== undefined) {
    for (const sx of [-1, 1]) parts.push(box(2.2, h + 0.6, 0.7, shutter, x + sx * (w / 2 + 1.9), y - 0.3, z + 0.3));
  }
}

function door(parts: Parts, x: number, y: number, z: number, w: number, h: number): void {
  parts.push(box(w + 2.4, h + 1.4, 0.8, STYLE.woodDark, x, y, z));
  parts.push(box(w, h, 0.9, STYLE.wood, x, y, z + 0.4));
  for (const t of [0.25, 0.75]) parts.push(box(w, 0.9, 0.5, IRON, x, y + h * t, z + 0.9));
  parts.push(blob(0.7, STYLE.gold, x + w * 0.3, y + h * 0.45, z + 1.2, 1, 0));
}

function lantern(parts: Parts, glow: Parts, x: number, y: number, z: number): void {
  parts.push(box(0.7, 0.7, 3.4, IRON, x, y + 3.6, z - 1.2));
  parts.push(box(2.4, 0.6, 2.4, IRON, x, y + 3, z));
  parts.push(box(2.4, 0.6, 2.4, IRON, x, y, z));
  glow.push(box(1.7, 2.5, 1.7, 0xffc266, x, y + 0.5, z));
}

function barrel(parts: Parts, x: number, y: number, z: number, r = 3.6, h = 9): void {
  parts.push(cyl(r * 0.88, r * 0.88, h, STYLE.woodLight, x, y, z, 8));
  parts.push(cyl(r, r, h * 0.5, STYLE.wood, x, y + h * 0.25, z, 8));
  for (const t of [0.18, 0.78]) parts.push(cyl(r + 0.15, r + 0.15, 0.8, IRON, x, y + h * t, z, 8));
}

function crate(parts: Parts, x: number, y: number, z: number, s: number): void {
  parts.push(box(s, s, s, STYLE.woodLight, x, y, z));
  for (const sx of [-1, 1]) {
    parts.push(box(1, s + 0.4, s + 0.4, STYLE.wood, x + sx * (s / 2 - 0.4), y, z));
  }
  parts.push(box(s + 0.4, 1, s + 0.4, STYLE.wood, x, y + s - 0.8, z));
}

function sack(parts: Parts, x: number, y: number, z: number, s = 3.2): void {
  parts.push(blob(s, SACK, x, y + s * 0.8, z, 0.85, 0));
  parts.push(blob(s * 0.35, 0x9c8a5e, x, y + s * 1.6, z, 1, 0));
}

function hayBale(parts: Parts, x: number, y: number, z: number): void {
  parts.push(box(8, 5, 5, HAY, x, y, z));
  for (const sx of [-1, 1]) parts.push(box(0.5, 5.2, 5.2, THATCH_DARK, x + sx * 2.2, y, z));
}

function steps(parts: Parts, x: number, z: number, w: number, count: number, color: number = STYLE.stoneLight): void {
  for (let i = 0; i < count; i += 1) parts.push(box(w - i * 2, 1.6, 3.4, color, x, i * 1.6, z - i * 3));
}

function house(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const bw = w * 0.72;
  const bd = d * 0.6;
  const front = bd / 2 + 0.4;

  parts.push(box(bw + 6, 5, bd + 6, STYLE.stoneDark));
  for (let i = 0; i < 6; i += 1) parts.push(box(5, 2, 1, STYLE.stone, -bw / 2 + 4 + i * 8.2, i % 2 ? 0.6 : 2.6, bd / 2 + 3));
  parts.push(box(bw, 24, bd, PLASTER, 0, 5));
  parts.push(box(bw, 24, 1, PLASTER_SHADE, 0, 5, -bd / 2));
  timberFront(parts, bw, 24, 0, 5, front, 4);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(2.4, 24, 2.4, STYLE.woodDark, (sx * bw) / 2, 5, (sz * bd) / 2));
  }
  gableRoof(parts, bw + 9, bd + 11, 21, ROOF[owner], ROOF_DARK[owner], 0, 29, 0);
  // Gable ends get their own little truss.
  for (const sx of [-1, 1]) {
    parts.push(box(1, 1.6, bd, STYLE.woodDark, sx * (bw / 2 + 0.3), 29, 0));
    parts.push(box(1, 14, 1.6, STYLE.woodDark, sx * (bw / 2 + 0.3), 29, 0));
  }

  // Chimney with cap.
  parts.push(box(6, 20, 6, STYLE.stone, bw * 0.26, 32, -bd * 0.14));
  parts.push(box(7.6, 1.6, 7.6, STYLE.stoneDark, bw * 0.26, 52, -bd * 0.14));
  parts.push(box(3.6, 2, 3.6, IRON, bw * 0.26, 53.6, -bd * 0.14));

  door(parts, -bw * 0.2, 5, front, 8, 13);
  parts.push(box(11, 1.4, 4, ROOF_DARK[owner], -bw * 0.2, 19.6, front + 2));
  steps(parts, -bw * 0.2, front + 7, 12, 3, STYLE.stone);
  windowAt(parts, glow, bw * 0.22, 14, front, 5.5, 6.5, ROOF_DARK[owner]);
  // Flower box.
  parts.push(box(8, 1.8, 2.2, STYLE.wood, bw * 0.22, 11, front + 1.6));
  for (let i = 0; i < 3; i += 1) {
    parts.push(blob(1.1, [STYLE.flowerPink, STYLE.flowerYellow, STYLE.flowerWhite][i], bw * 0.22 - 2.4 + i * 2.4, 13.6, front + 1.8, 1, 0));
  }
  lantern(parts, glow, -bw * 0.2 + 7.6, 14, front + 2);

  // Yard clutter.
  barrel(parts, bw / 2 + 5, 0, bd * 0.24, 3.2, 8);
  for (let i = 0; i < 4; i += 1) {
    parts.push(cyl(1.5, 1.5, 9, i % 2 ? STYLE.wood : STYLE.woodLight, 0, 0, 0, 6).rotateZ(Math.PI / 2).translate(-bw / 2 - 1.5, 1.6 + Math.floor(i / 2) * 2.9, bd * 0.2 - (i % 2) * 3.2));
  }
  parts.push(blob(3.4, STYLE.leaf, bw / 2 + 4, 2.4, -bd * 0.3, 0.8, 0));
  return { body: merge(parts), glow: merge(glow) };
}

function townCenter(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const hw = w * 0.76;
  const hd = d * 0.5;
  const front = hd / 2 + 0.5;
  const towerZ = -hd * 0.08;

  // Plinth with a cobbled apron.
  parts.push(box(w * 0.94, 6, d * 0.86, STYLE.stoneDark));
  parts.push(box(w * 0.98, 1.4, d * 0.9, STYLE.stone));
  const rand = seeded(17);
  for (let i = 0; i < 22; i += 1) {
    parts.push(box(4 + rand() * 4, 0.6, 3 + rand() * 3, rand() < 0.5 ? STYLE.stoneLight : STYLE.stone, (rand() - 0.5) * w * 0.86, 6, d * 0.3 + rand() * d * 0.1));
  }

  // Great hall.
  parts.push(box(hw, 9, hd, STYLE.stone, 0, 6));
  for (let i = 0; i < 9; i += 1) parts.push(box(6, 3, 1, STYLE.stoneLight, -hw / 2 + 5 + i * (hw / 9), 7 + (i % 2) * 3.6, front));
  parts.push(box(hw, 30, hd, PLASTER, 0, 15));
  timberFront(parts, hw, 30, 0, 15, front, 6);
  for (const sx of [-1, 1]) {
    // Corner buttresses.
    parts.push(box(5, 22, 6, STYLE.stone, sx * (hw / 2 + 1), 6, hd / 2 - 2));
    parts.push(box(5, 4, 6, STYLE.stoneLight, sx * (hw / 2 + 1), 28, hd / 2 - 2).scale(1, 1, 0.7));
  }
  gableRoof(parts, hw + 12, hd + 15, 32, ROOF[owner], ROOF_DARK[owner], 0, 45, 0);
  // Roof dormers.
  for (const sx of [-1, 1]) {
    parts.push(box(9, 9, 8, PLASTER, sx * hw * 0.3, 52, hd * 0.32));
    gableRoof(parts, 10, 11, 6, ROOF[owner], ROOF_DARK[owner], sx * hw * 0.3, 61, hd * 0.32, true);
    glow.push(box(4.4, 5, 0.8, WINDOW, sx * hw * 0.3, 54, hd * 0.32 + 4.2));
  }

  // Entrance porch facing the camera.
  const porchZ = hd / 2 + 6;
  parts.push(box(30, 34, 14, PLASTER_SHADE, 0, 6, porchZ));
  for (const sx of [-1, 1]) parts.push(box(3, 34, 3, STYLE.woodDark, sx * 14.5, 6, porchZ + 6.5));
  parts.push(box(31, 2.4, 1.2, STYLE.woodDark, 0, 36, porchZ + 7));
  gableRoof(parts, 18, 35, 16, ROOF[owner], ROOF_DARK[owner], 0, 40, porchZ, true);
  door(parts, 0, 6, porchZ + 7, 14, 22);
  parts.push(box(17, 2.2, 1.4, STYLE.stoneLight, 0, 29, porchZ + 7.4));
  // Crest above the door.
  parts.push(box(7, 7, 0.8, BANNER[owner], 0, 31.6, porchZ + 7.6));
  parts.push(blob(1.6, STYLE.gold, 0, 35, porchZ + 8.2, 1, 0));
  steps(parts, 0, porchZ + 22, 40, 3);
  for (const sx of [-1, 1]) {
    lantern(parts, glow, sx * 11, 20, porchZ + 9);
    parts.push(box(1.2, 18, 5, BANNER[owner], sx * 19, 18, porchZ + 7.6));
    parts.push(box(1.4, 1.4, 6.4, STYLE.gold, sx * 19, 36, porchZ + 7.6));
  }

  // Clock tower with belfry.
  const tw = w * 0.21;
  parts.push(box(tw, 96, tw, STYLE.stone, 0, 6, towerZ));
  for (const y of [40, 62, 76]) parts.push(box(tw + 2, 2, tw + 2, STYLE.stoneLight, 0, y, towerZ));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(3, 96, 3, STYLE.stoneDark, (sx * tw) / 2, 6, towerZ + (sz * tw) / 2));
  }
  parts.push(box(tw + 6, 4, tw + 6, STYLE.stoneLight, 0, 98, towerZ));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(4, 5, 4, STYLE.stoneLight, sx * (tw / 2 + 1), 102, towerZ + sz * (tw / 2 + 1)));
  }
  parts.push(cone((tw / 2 + 5) * Math.SQRT2, 32, ROOF[owner], 0, 102, towerZ, 4));
  parts.push(cone((tw / 2 + 5.6) * Math.SQRT2, 5, ROOF_DARK[owner], 0, 101, towerZ, 4));
  // Clock: rim, face, hands.
  const clockZ = towerZ + tw / 2;
  parts.push(cyl(8, 8, 1.4, STYLE.woodDark, 0, 0, 0, 14).rotateX(Math.PI / 2).translate(0, 86, clockZ));
  glow.push(cyl(6.4, 6.4, 1.4, 0xd9cfae, 0, 0, 0, 14).rotateX(Math.PI / 2).translate(0, 86, clockZ + 1.6));
  parts.push(box(0.9, 5, 0.6, IRON, 0, 86, clockZ + 3.2));
  parts.push(cbox(3.6, 0.9, 0.6, IRON).translate(1.8, 86, clockZ + 3.2));
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(cbox(1, 1, 0.6, IRON).translate(Math.cos(a) * 5.2, 86 + Math.sin(a) * 5.2, clockZ + 3.1));
  }
  // Belfry openings and bell.
  glow.push(box(5, 8, 0.8, 0xffb650, 0, 66, clockZ + 0.5));
  parts.push(box(7, 1.2, 1.2, STYLE.woodDark, 0, 74.4, clockZ + 0.6));
  parts.push(cone(2.2, 3.4, STYLE.gold, 0, 68, clockZ + 1.4, 6));
  for (const y of [22, 50]) parts.push(box(2.2, 6, 0.8, IRON, 0, y, clockZ + 0.4));
  flag(parts, owner, 0, 132, towerZ, 22);

  for (const sx of [-1, 1]) {
    windowAt(parts, glow, sx * hw * 0.22, 26, front, 7, 9, ROOF_DARK[owner]);
    windowAt(parts, glow, sx * hw * 0.4, 26, front, 7, 9, ROOF_DARK[owner]);
  }

  // Market corner: stall, well and goods.
  const stallX = hw * 0.44;
  const stallZ = hd / 2 + 16;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(1.2, 14, 1.2, STYLE.woodDark, stallX + sx * 8, 6, stallZ + sz * 5));
  }
  parts.push(box(18, 5, 11, STYLE.wood, stallX, 6, stallZ));
  for (let i = 0; i < 4; i += 1) {
    parts.push(cbox(4.4, 0.8, 13, i % 2 ? CANVAS : BANNER[owner]).rotateX(0.22).translate(stallX - 6.8 + i * 4.5, 21, stallZ));
  }
  for (let i = 0; i < 4; i += 1) parts.push(blob(1.5, [STYLE.mushroom, STYLE.gold, STYLE.crop, STYLE.autumn][i], stallX - 5 + i * 3.4, 12.2, stallZ + 2, 1, 0));
  const wellX = -hw * 0.44;
  parts.push(cyl(6.5, 7, 6, STYLE.stone, wellX, 6, stallZ, 10));
  parts.push(cyl(5, 5, 0.6, 0x3b6f9c, wellX, 11.6, stallZ, 10));
  for (const sx of [-1, 1]) parts.push(box(1.2, 13, 1.2, STYLE.woodDark, wellX + sx * 5.6, 12, stallZ));
  gableRoof(parts, 15, 10, 5, THATCH, THATCH_DARK, wellX, 25, stallZ);
  parts.push(cyl(1.3, 1.5, 2.2, STYLE.wood, wellX, 17, stallZ, 6));
  crate(parts, hw * 0.24, 6, hd / 2 + 8, 7);
  barrel(parts, -hw * 0.25, 6, hd / 2 + 8);
  sack(parts, hw * 0.33, 6, hd / 2 + 6);
  sack(parts, -hw * 0.34, 6, hd / 2 + 6, 2.8);
  return { body: merge(parts), glow: merge(glow) };
}

function storage(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const bw = w * 0.62;
  const bd = d * 0.74;
  const front = bd / 2 + 0.4;
  parts.push(box(bw + 5, 4, bd + 5, STYLE.stoneDark));
  parts.push(box(bw, 24, bd, STYLE.wood, 0, 4));
  // Plank seams and cross-bracing.
  for (let i = 0; i <= 8; i += 1) parts.push(box(0.7, 24, 0.7, STYLE.woodDark, -bw / 2 + (bw / 8) * i, 4, front));
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= 8; i += 1) parts.push(box(0.7, 24, 0.7, STYLE.woodDark, sx * (bw / 2 + 0.2), 4, -bd / 2 + (bd / 8) * i));
    parts.push(box(2.6, 24, 2.6, STYLE.woodDark, (sx * bw) / 2, 4, bd / 2));
  }
  parts.push(box(bw + 1.4, 2, 1.2, STYLE.woodDark, 0, 26, front));
  gableRoof(parts, bd + 10, bw + 12, 21, THATCH, THATCH_DARK, 0, 28, 0, true);
  // Barn doors with braces, loft hatch and hoist.
  for (const sx of [-1, 1]) {
    parts.push(box(8.4, 17, 0.9, STYLE.woodLight, sx * 4.4, 4, front + 0.4));
    parts.push(cbox(18, 1.2, 0.6, STYLE.woodDark).rotateZ(sx * 1.1).translate(sx * 4.4, 12.5, front + 1));
    parts.push(box(8.4, 1.2, 0.6, IRON, sx * 4.4, 6, front + 1));
    parts.push(box(8.4, 1.2, 0.6, IRON, sx * 4.4, 18, front + 1));
  }
  parts.push(box(8, 8, 0.9, STYLE.woodDark, 0, 31, front + 1.4));
  parts.push(box(1.4, 1.4, 9, STYLE.woodDark, 0, 42, front + 4));
  parts.push(box(0.4, 9, 0.4, SACK, 0, 33, front + 8));
  sack(parts, 0, 29, front + 8, 2.2);
  parts.push(box(bw + 2, 3, 1.2, ROOF[owner], 0, 22.5, front + 0.6));
  lantern(parts, glow, bw * 0.36, 15, front + 1.6);

  // Goods stacked outside.
  crate(parts, bw / 2 + 9, 0, bd * 0.2, 9);
  crate(parts, bw / 2 + 8, 9, bd * 0.2, 7);
  crate(parts, bw / 2 + 9, 0, bd * 0.2 - 10, 7);
  barrel(parts, -bw / 2 - 8, 0, bd * 0.25, 4, 10);
  barrel(parts, -bw / 2 - 9, 0, -bd * 0.1, 4, 10);
  barrel(parts, -bw / 2 - 6, 0, bd * 0.02, 3.2, 8);
  sack(parts, bw * 0.34, 0, front + 6);
  sack(parts, bw * 0.2, 0, front + 8, 2.8);
  hayBale(parts, -bw * 0.3, 0, front + 7);
  hayBale(parts, -bw * 0.26, 5, front + 7);
  // Hand cart.
  parts.push(box(12, 1.4, 8, STYLE.woodLight, bw / 2 + 8, 5, -bd * 0.36));
  for (const sz of [-1, 1]) {
    parts.push(box(12, 3, 0.8, STYLE.wood, bw / 2 + 8, 6.4, -bd * 0.36 + sz * 4));
    parts.push(cyl(3.6, 3.6, 0.9, STYLE.woodDark, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(bw / 2 + 8, 3.6, -bd * 0.36 + sz * 5));
  }
  return { body: merge(parts), glow: merge(glow) };
}

function farm(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const fw = w * 0.92;
  const fd = d * 0.92;
  parts.push(box(fw, 1.6, fd, STYLE.soil));
  const rows = 7;
  for (let i = 0; i < rows; i += 1) {
    const z = -fd / 2 + (fd / rows) * (i + 0.5);
    parts.push(box(fw * 0.62, 2.2, fd / rows - 4, 0x5b3d26, -fw * 0.14, 1.6, z));
    for (let c = 0; c < 6; c += 1) {
      const x = -fw * 0.42 + c * (fw * 0.115);
      if (i < 3) {
        // Wheat: stalk with a golden head.
        parts.push(cone(1.4, 7, 0xb7a14a, x, 3.4, z, 4));
        parts.push(blob(1.5, HAY, x, 11, z, 1.5, 0));
      } else if (i < 5) {
        // Cabbages.
        parts.push(blob(3.1, c % 2 ? STYLE.crop : STYLE.cropDark, x, 5.4, z, 0.85, 0));
        parts.push(blob(1.8, 0xb6dc7a, x, 6.6, z, 0.8, 0));
      } else {
        // Pumpkins on a vine.
        parts.push(blob(2.6, STYLE.autumn, x, 5, z, 0.8, 0));
        parts.push(box(0.6, 1.6, 0.6, STYLE.leafDark, x, 6.6, z));
        parts.push(blob(1.6, STYLE.leaf, x + 2.6, 4.2, z + 1, 0.4, 0));
      }
    }
  }
  const posts = 6;
  for (let i = 0; i <= posts; i += 1) {
    const t = -0.5 + i / posts;
    parts.push(box(1.8, 9, 1.8, STYLE.wood, fw * t, 0, -fd / 2));
    parts.push(box(1.8, 9, 1.8, STYLE.wood, -fw / 2, 0, fd * t));
    parts.push(box(1.8, 9, 1.8, STYLE.wood, fw / 2, 0, fd * t));
    // Leave a gate gap in the front fence.
    if (i !== 3) parts.push(box(1.8, 9, 1.8, STYLE.wood, fw * t, 0, fd / 2));
  }
  for (const y of [3.5, 7]) {
    parts.push(box(fw, 1, 1, STYLE.woodLight, 0, y, -fd / 2));
    parts.push(box(fw * 0.36, 1, 1, STYLE.woodLight, -fw * 0.32, y, fd / 2));
    parts.push(box(fw * 0.36, 1, 1, STYLE.woodLight, fw * 0.32, y, fd / 2));
    parts.push(box(1, 1, fd, STYLE.woodLight, -fw / 2, y, 0));
    parts.push(box(1, 1, fd, STYLE.woodLight, fw / 2, y, 0));
  }
  // Open gate leaf.
  parts.push(cbox(fw * 0.16, 6, 1, STYLE.woodLight).rotateY(0.9).translate(fw * 0.1, 5, fd / 2 + 5));

  // Tool shed with door and window.
  const sx = fw * 0.32;
  const sz = -fd * 0.3;
  parts.push(box(22, 15, 18, STYLE.wood, sx, 1.6, sz));
  for (let i = 0; i <= 5; i += 1) parts.push(box(0.6, 15, 0.6, STYLE.woodDark, sx - 11 + i * 4.4, 1.6, sz + 9.2));
  gableRoof(parts, 26, 25, 12, ROOF[owner], ROOF_DARK[owner], sx, 16.6, sz);
  parts.push(box(6, 11, 0.8, STYLE.woodDark, sx - 4, 1.6, sz + 9.4));
  parts.push(box(5, 4, 0.8, WINDOW, sx + 5, 8, sz + 9.4));
  // Tools leaning on the shed.
  parts.push(cbox(0.7, 14, 0.7, STYLE.woodLight).rotateZ(0.2).translate(sx + 12.5, 8.6, sz + 6));
  parts.push(box(3.4, 2.4, 0.6, STYLE.steel, sx + 13.8, 14, sz + 6));
  parts.push(cbox(0.7, 13, 0.7, STYLE.woodLight).rotateZ(0.14).translate(sx + 12.4, 8, sz + 2));

  // Scarecrow.
  const cx = fw * 0.3;
  const cz = fd * 0.24;
  parts.push(box(1.4, 20, 1.4, STYLE.woodDark, cx, 1.6, cz));
  parts.push(box(15, 1.4, 1.4, STYLE.woodDark, cx, 15, cz));
  parts.push(box(7, 8, 3, 0xb7793a, cx, 9, cz));
  parts.push(box(2.2, 2.8, 2.6, 0x8a5a2a, cx - 6.4, 12.4, cz));
  parts.push(box(2.2, 2.8, 2.6, 0x8a5a2a, cx + 6.4, 12.4, cz));
  parts.push(blob(3, THATCH, cx, 21, cz, 1, 0));
  parts.push(cone(4.4, 3, 0x5a4326, cx, 23, cz, 7));
  for (const side of [-1, 1]) parts.push(blob(1.4, HAY, cx + side * 7.6, 15.6, cz, 1, 0));

  // Hay, trough and wheelbarrow.
  hayBale(parts, -fw * 0.4, 1.6, fd * 0.36);
  hayBale(parts, -fw * 0.4, 6.6, fd * 0.36);
  hayBale(parts, -fw * 0.28, 1.6, fd * 0.38);
  parts.push(box(15, 4, 6, STYLE.wood, fw * 0.06, 1.6, -fd * 0.4));
  parts.push(box(13, 0.8, 4.4, 0x4a8fc4, fw * 0.06, 5, -fd * 0.4));
  parts.push(box(9, 4, 6, STYLE.woodLight, fw * 0.06, 4, fd * 0.36));
  parts.push(cyl(2.6, 2.6, 1, STYLE.woodDark, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(fw * 0.06 - 6, 3, fd * 0.36));
  for (const side of [-1, 1]) parts.push(cbox(9, 0.8, 0.8, STYLE.woodDark).translate(fw * 0.06 + 7, 6.6, fd * 0.36 + side * 2.6));
  return { body: merge(parts) };
}

function tent(parts: Parts, owner: PlayerId, x: number, z: number, r: number, h: number): void {
  parts.push(cone(r, h, CANVAS, x, 1.4, z, 6));
  parts.push(cone(r * 1.04, h * 0.12, CANVAS_SHADE, x, 1.4, z, 6));
  parts.push(cone(r * 0.36, h * 0.38, ROOF[owner], x, 1.4 + h * 0.7, z, 6));
  parts.push(box(r * 0.34, h * 0.46, 1, 0x3a2a1c, x, 1.4, z + r * 0.86));
  parts.push(cyl(0.5, 0.5, h * 0.3, STYLE.woodDark, x, h + 1, z, 4));
  parts.push(box(4.4, 2.6, 0.5, BANNER[owner], x + 2.4, h * 1.18, z));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    parts.push(cone(0.7, 2.6, STYLE.woodDark, x + Math.cos(a) * r * 1.2, 1.4, z + Math.sin(a) * r * 1.2, 4));
  }
}

function armyCamp(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const yw = w * 0.94;
  const yd = d * 0.94;
  parts.push(box(yw, 1.4, yd, STYLE.sand));
  parts.push(box(yw * 0.4, 0.4, yd * 0.42, 0xc9b377, yw * 0.2, 1.4, yd * 0.16));
  const stakes = 13;
  for (let i = 0; i <= stakes; i += 1) {
    const t = -0.5 + i / stakes;
    const h = 15 + (i % 2) * 2.5;
    parts.push(cone(2.3, h, i % 3 ? STYLE.wood : STYLE.woodDark, yw * t, 0, -yd / 2, 5));
    parts.push(cone(2.3, h, i % 3 ? STYLE.wood : STYLE.woodDark, -yw / 2, 0, yd * t, 5));
    parts.push(cone(2.3, h, i % 3 ? STYLE.wood : STYLE.woodDark, yw / 2, 0, yd * t, 5));
    // Leave a gate in the middle of the front wall.
    if (Math.abs(t) > 0.16) parts.push(cone(2.3, h, STYLE.wood, yw * t, 0, yd / 2, 5));
  }
  // Rope rails binding the palisade.
  for (const y of [5, 10]) {
    parts.push(box(yw, 0.8, 0.8, STYLE.woodDark, 0, y, -yd / 2 - 1.6));
    parts.push(box(0.8, 0.8, yd, STYLE.woodDark, -yw / 2 - 1.6, y, 0));
    parts.push(box(0.8, 0.8, yd, STYLE.woodDark, yw / 2 + 1.6, y, 0));
  }
  // Gate posts with torches.
  for (const sx of [-1, 1]) {
    parts.push(box(3.4, 24, 3.4, STYLE.woodDark, sx * yw * 0.15, 0, yd / 2));
    glow.push(cone(1.6, 4, STYLE.fire, sx * yw * 0.15, 24, yd / 2, 5));
  }
  parts.push(box(yw * 0.3 + 4, 2.6, 2.6, STYLE.woodDark, 0, 21, yd / 2));
  parts.push(box(8, 6, 0.8, BANNER[owner], 0, 14.6, yd / 2 + 0.4));

  tent(parts, owner, -yw * 0.2, -yd * 0.16, 25, 30);
  tent(parts, owner, yw * 0.28, -yd * 0.32, 13, 17);
  tent(parts, owner, -yw * 0.36, yd * 0.26, 11, 15);

  // Training dummy.
  const dx = yw * 0.26;
  const dz = yd * 0.1;
  parts.push(box(1.6, 18, 1.6, STYLE.woodDark, dx, 1.4, dz));
  parts.push(box(13, 1.6, 1.6, STYLE.woodDark, dx, 14, dz));
  parts.push(box(7, 9, 4, THATCH, dx, 8, dz));
  parts.push(blob(3.2, THATCH, dx, 21, dz, 1, 0));
  parts.push(cyl(3.6, 3.6, 0.9, ROOF[owner], 0, 0, 0, 8).rotateX(Math.PI / 2).translate(dx - 6, 11, dz + 1.4));
  // Archery butt.
  const ax = yw * 0.38;
  const az = yd * 0.3;
  parts.push(cyl(6.5, 6.5, 2.4, HAY, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(ax, 9, az));
  parts.push(cyl(4.4, 4.4, 0.5, 0xf5f2e8, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(ax, 9, az + 2.4));
  parts.push(cyl(2.2, 2.2, 0.5, STYLE.mushroom, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(ax, 9, az + 2.8));
  for (const sx of [-1, 1]) parts.push(cbox(1, 12, 1, STYLE.woodDark).rotateZ(sx * 0.3).translate(ax + sx * 4, 6, az - 1));
  // Weapon rack: spears and shields.
  const rx = yw * 0.02;
  const rz = -yd * 0.4;
  parts.push(box(22, 1.4, 1.4, STYLE.woodDark, rx, 12, rz));
  for (const sx of [-1, 1]) parts.push(box(1.4, 12, 1.4, STYLE.woodDark, rx + sx * 10, 1.4, rz));
  for (let i = 0; i < 5; i += 1) {
    parts.push(box(0.8, 17, 0.8, STYLE.woodLight, rx - 8 + i * 4, 1.4, rz + 1.2));
    parts.push(cone(1.1, 3, STYLE.steel, rx - 8 + i * 4, 18.4, rz + 1.2, 4));
  }
  for (const sx of [-1, 1]) {
    parts.push(cyl(3.6, 3.6, 0.9, ROOF[owner], 0, 0, 0, 8).rotateX(Math.PI / 2).translate(rx + sx * 5, 5, rz + 2.4));
    parts.push(blob(1, STYLE.steel, rx + sx * 5, 5, rz + 3.2, 1, 0));
  }

  // Campfire ring with log seats.
  const fz = yd * 0.24;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(rock(1.9, i % 2 ? STYLE.stone : STYLE.stoneDark, Math.cos(a) * 6, 2.2, fz + Math.sin(a) * 6, 0.8, a));
  }
  for (const a of [0.4, 1.9, 3.5]) parts.push(cbox(9, 1.4, 1.4, STYLE.woodDark).rotateY(a).translate(0, 2.6, fz));
  glow.push(cone(3.2, 8, STYLE.fire, 0, 2.6, fz, 5));
  glow.push(cone(1.7, 5, STYLE.fireCore, 0.6, 3, fz + 0.4, 4));
  for (const a of [0.9, 2.6, 4.4]) {
    parts.push(cyl(2, 2, 10, STYLE.wood, 0, 0, 0, 7).rotateZ(Math.PI / 2).rotateY(a).translate(Math.cos(a) * 13, 2.6, fz + Math.sin(a) * 11));
  }
  crate(parts, -yw * 0.06, 1.4, -yd * 0.02, 6);
  barrel(parts, yw * 0.1, 1.4, -yd * 0.1, 3.2, 8);
  flag(parts, owner, -yw * 0.42, 0, yd * 0.42, 32);
  return { body: merge(parts), glow: merge(glow) };
}

function tower(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const r = Math.min(w, d) * 0.36;
  parts.push(cyl(r + 2.5, r + 4.5, 7, STYLE.stoneDark, 0, 0, 0, 8));
  parts.push(cyl(r, r + 1.5, 58, STYLE.stone, 0, 7, 0, 8));
  // Course bands and scattered lighter blocks.
  for (const y of [22, 38, 54]) parts.push(cyl(r + 0.7, r + 0.9, 1.6, STYLE.stoneLight, 0, y, 0, 8));
  const rand = seeded(5);
  for (let i = 0; i < 14; i += 1) {
    const a = rand() * Math.PI * 2;
    parts.push(cbox(3.4, 2, 1.2, rand() < 0.5 ? STYLE.stoneLight : STYLE.stoneDark).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (r + 0.4), 10 + rand() * 50, Math.sin(a) * (r + 0.4)));
  }
  // Wooden hoarding below the battlements.
  parts.push(cyl(r + 5.5, r + 2, 4, STYLE.woodDark, 0, 61, 0, 8));
  parts.push(cyl(r + 5.2, r + 5.2, 5, STYLE.wood, 0, 65, 0, 8));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(box(4.4, 5, 4.4, i % 2 ? STYLE.stoneLight : STYLE.stone, Math.cos(a) * (r + 3.4), 70, Math.sin(a) * (r + 3.4)));
    parts.push(cbox(1, 6, 1, STYLE.woodDark).rotateZ(0.5).rotateY(-a).translate(Math.cos(a) * (r + 2.4), 60, Math.sin(a) * (r + 2.4)));
  }
  parts.push(cone(r + 3, 22, ROOF[owner], 0, 73, 0, 8));
  parts.push(cone(r + 3.8, 3.4, ROOF_DARK[owner], 0, 72.4, 0, 8));
  flag(parts, owner, 0, 94, 0, 12);
  // Arrow slits on three faces, one lit.
  glow.push(box(2.2, 7, 1, WINDOW, 0, 44, r + 0.9));
  parts.push(box(3.6, 9, 0.8, STYLE.stoneDark, 0, 43, r + 0.5));
  for (const sx of [-1, 1]) parts.push(box(0.8, 7, 2, IRON, sx * (r + 0.5), 30, 0));
  parts.push(box(2, 6, 0.8, IRON, 0, 22, r + 0.9));
  door(parts, 0, 7, r + 1.2, 6, 11);
  steps(parts, 0, r + 7, 10, 3, STYLE.stoneDark);
  // Wall torch.
  parts.push(cbox(0.8, 5, 0.8, STYLE.woodDark).rotateX(0.5).translate(r * 0.62, 20, r * 0.82));
  glow.push(cone(1.3, 3.2, STYLE.fire, r * 0.62, 22, r * 0.82 + 1.3, 5));
  return { body: merge(parts), glow: merge(glow) };
}

function wall(w: number, d: number): BuildingModel {
  const parts: Parts = [];
  const rand = seeded(11);
  parts.push(box(w, 5, d * 0.8, STYLE.stoneDark));
  parts.push(box(w, 25, d * 0.62, STYLE.stone, 0, 5));
  // Block courses on both faces.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const x = -w / 2 + (w / 3) * (col + 0.5) + (row % 2 ? w / 6 : 0) - w / 12;
        if (Math.abs(x) > w / 2 - 3) continue;
        parts.push(box(w / 3 - 1.6, 3.6, 0.7, rand() < 0.5 ? STYLE.stoneLight : STYLE.stoneDark, x, 6.5 + row * 4.8, side * d * 0.31));
      }
    }
  }
  parts.push(box(w, 3, d * 0.78, STYLE.stoneLight, 0, 30));
  parts.push(box(w, 1.2, d * 0.5, STYLE.woodDark, 0, 33));
  for (const sx of [-1, 0, 1]) {
    parts.push(box(w * 0.2, 7, d * 0.2, STYLE.stoneLight, sx * w * 0.36, 33, d * 0.29));
    parts.push(box(w * 0.2, 7, d * 0.2, STYLE.stoneLight, sx * w * 0.36, 33, -d * 0.29));
  }
  // Moss at the foot.
  for (let i = 0; i < 4; i += 1) parts.push(blob(2.4, STYLE.leafDark, (rand() - 0.5) * w * 0.8, 3.4, d * 0.4, 0.5, 0));
  return { body: merge(parts) };
}

function academy(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const bw = w * 0.74;
  const bd = d * 0.6;
  const front = bd / 2 + 0.5;
  for (let i = 0; i < 3; i += 1) parts.push(box(bw + 14 - i * 4, 2.4, bd + 18 - i * 4, i % 2 ? STYLE.stone : STYLE.stoneLight, 0, i * 2.4, 2));
  parts.push(box(bw, 28, bd, STYLE.stoneLight, 0, 7.2));
  for (const y of [14, 24]) parts.push(box(bw + 0.8, 1.2, bd + 0.8, STYLE.stone, 0, y));
  // Colonnade with bases and capitals.
  for (let i = 0; i < 4; i += 1) {
    const x = -bw / 2 + 4 + ((bw - 8) / 3) * i;
    const z = bd / 2 + 6.5;
    parts.push(box(6, 2, 6, STYLE.stone, x, 7.2, z));
    parts.push(cyl(2.2, 2.6, 23, 0xe9ecf2, x, 9.2, z, 8));
    parts.push(box(6.4, 2, 6.4, STYLE.stone, x, 32.2, z));
  }
  parts.push(box(bw + 6, 4, bd + 17, STYLE.stone, 0, 34.2, 2));
  // Pediment over the porch, then the main pyramid roof.
  gableRoof(parts, bw + 6, 16, 9, STYLE.stoneLight, STYLE.stone, 0, 38.2, bd / 2 + 4);
  parts.push(blob(2.2, STYLE.gold, 0, 41.6, bd / 2 + 12.4, 1, 0));
  parts.push(cone((bw / 2 + 4) * Math.SQRT2, 24, ROOF[owner], 0, 38.2, -2, 4));
  parts.push(cone((bw / 2 + 5) * Math.SQRT2, 4, ROOF_DARK[owner], 0, 37.6, -2, 4));
  parts.push(cyl(1, 1, 5, STYLE.goldDark, 0, 61, -2, 6));
  glow.push(blob(3.4, 0xffd24a, 0, 68, -2, 1, 0));
  door(parts, 0, 7.2, front, 9, 16);
  parts.push(cyl(5.4, 5.4, 1, STYLE.stone, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(0, 29, front));
  glow.push(cyl(4, 4, 1, 0x9fd0ff, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(0, 29, front + 0.6));
  for (const sx of [-1, 1]) {
    windowAt(parts, glow, sx * bw * 0.3, 20, front, 4.5, 9);
    // Braziers at the foot of the steps.
    const x = sx * (bw / 2 + 2);
    const z = bd / 2 + 14;
    parts.push(cyl(1, 1.6, 9, IRON, x, 0, z, 6));
    parts.push(cyl(3.4, 2, 3, IRON, x, 9, z, 8));
    glow.push(cone(2.4, 5.4, STYLE.fire, x, 11.4, z, 5));
    parts.push(box(1.2, 16, 4.6, BANNER[owner], sx * (bw / 2 + 0.7), 14, bd * 0.1));
  }
  // Lectern, scrolls and an armillary on the terrace.
  parts.push(box(3, 8, 3, STYLE.woodDark, bw * 0.3, 7.2, bd / 2 + 11));
  parts.push(cbox(5.4, 0.8, 4, STYLE.woodLight).rotateX(0.5).translate(bw * 0.3, 16, bd / 2 + 11));
  parts.push(cbox(4, 0.5, 3, 0xf5f2e8).rotateX(0.5).translate(bw * 0.3, 16.6, bd / 2 + 11.2));
  parts.push(cyl(0.6, 0.6, 7, STYLE.goldDark, -bw * 0.3, 7.2, bd / 2 + 11, 5));
  for (const tilt of [0, 1.1, 2.2]) {
    parts.push(cyl(3.2, 3.2, 0.5, STYLE.gold, 0, 0, 0, 12).rotateX(tilt).translate(-bw * 0.3, 17, bd / 2 + 11));
  }
  return { body: merge(parts), glow: merge(glow) };
}

function forest(w: number, d: number): BuildingModel {
  const rand = seeded(733);
  const parts: Parts = [cyl(w * 0.5, w * 0.52, 1.2, 0x3d7a30, 0, 0, 0, 12).scale(1, 1, d / w)];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + rand() * 0.6;
    const dist = i === 0 ? 0 : w * (0.16 + rand() * 0.2);
    const s = 17 + rand() * 9;
    parts.push(
      pineModel()
        .rotateY(rand() * Math.PI)
        .scale(s, s, s)
        .translate(Math.cos(a) * dist, 0.8, Math.sin(a) * dist * (d / w)),
    );
  }
  // Felled timber: stumps, a log pile and an axe in a chopping block.
  for (const [x, z] of [[w * 0.3, d * 0.32], [-w * 0.34, d * 0.26]]) {
    parts.push(cyl(3, 3.6, 3.4, STYLE.woodDark, x, 1, z, 8));
    parts.push(cyl(2.7, 2.7, 0.4, STYLE.woodLight, x, 4.4, z, 8));
  }
  for (let i = 0; i < 5; i += 1) {
    parts.push(cyl(1.7, 1.7, 13, i % 2 ? STYLE.wood : STYLE.woodDark, 0, 0, 0, 6).rotateZ(Math.PI / 2).translate(-w * 0.02, 2.6 + (i > 2 ? 3 : 0), d * 0.4 + (i > 2 ? i - 3.5 : i - 1) * 3.2));
  }
  parts.push(cbox(0.8, 9, 0.8, STYLE.woodLight).rotateZ(0.6).translate(w * 0.3 + 2.4, 8, d * 0.32));
  parts.push(box(3.2, 2.6, 0.7, STYLE.steel, w * 0.3, 4.6, d * 0.32));
  for (let i = 0; i < 5; i += 1) {
    const a = rand() * Math.PI * 2;
    parts.push(blob(2.6 + rand() * 1.6, i % 2 ? STYLE.leaf : STYLE.leafDark, Math.cos(a) * w * 0.42, 2.6, Math.sin(a) * d * 0.42, 0.7, 0));
  }
  for (let i = 0; i < 3; i += 1) {
    const x = (rand() - 0.5) * w * 0.6;
    const z = d * 0.3 + rand() * d * 0.12;
    parts.push(cyl(0.5, 0.7, 2, 0xf0e6d0, x, 1, z, 5));
    parts.push(blob(1.8, STYLE.mushroom, x, 3, z, 0.55, 0));
  }
  return { body: merge(parts) };
}

function goldVein(w: number, d: number): BuildingModel {
  const rand = seeded(91);
  const parts: Parts = [];
  const glow: Parts = [];
  parts.push(cyl(w * 0.46, w * 0.5, 1, 0x8a7a5c, 0, 0, 0, 12).scale(1, 1, d / w));
  parts.push(rock(w * 0.34, STYLE.stone, -w * 0.08, w * 0.17, -d * 0.06, 0.8, 0.3));
  parts.push(rock(w * 0.26, STYLE.stoneDark, w * 0.2, w * 0.12, d * 0.06, 0.75, 1.2));
  parts.push(rock(w * 0.2, STYLE.stoneLight, -w * 0.26, w * 0.09, d * 0.16, 0.7, 2.1));
  parts.push(rock(w * 0.14, STYLE.stone, w * 0.04, w * 0.07, d * 0.26, 0.7, 0.7));
  parts.push(rock(w * 0.16, STYLE.stoneDark, w * 0.3, w * 0.24, -d * 0.12, 0.9, 2.6));
  for (let i = 0; i < 12; i += 1) {
    const a = rand() * Math.PI * 2;
    const dist = rand() * w * 0.3;
    glow.push(rock(2.2 + rand() * 2.4, 0xf5b83a, Math.cos(a) * dist, 5 + rand() * w * 0.32, Math.sin(a) * dist * 0.8 + d * 0.06, 1, a));
  }
  // Gold seams and crystal spikes.
  for (let i = 0; i < 4; i += 1) {
    const a = rand() * Math.PI * 2;
    glow.push(cone(1.6, 6 + rand() * 4, 0xffd35a, Math.cos(a) * w * 0.2, w * 0.2 + rand() * 6, Math.sin(a) * d * 0.16, 4).rotateZ((rand() - 0.5) * 0.5));
  }
  for (let i = 0; i < 9; i += 1) {
    const a = rand() * Math.PI * 2;
    parts.push(rock(1.2 + rand() * 1.4, rand() < 0.5 ? STYLE.stone : STYLE.stoneLight, Math.cos(a) * w * 0.42, 1.4, Math.sin(a) * d * 0.42, 0.7, a));
  }
  // Miner's kit: ore cart on rails and a pick.
  const cx = w * 0.26;
  const cz = d * 0.36;
  for (const sz of [-1, 1]) parts.push(box(22, 0.7, 0.9, IRON, cx - 3, 1, cz + sz * 3));
  for (let i = 0; i < 5; i += 1) parts.push(box(1.4, 0.6, 8.4, STYLE.woodDark, cx - 12 + i * 4.6, 0.8, cz));
  parts.push(box(10, 5, 7, STYLE.wood, cx, 3.4, cz));
  parts.push(box(10.6, 1, 7.6, IRON, cx, 8, cz));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(cyl(1.8, 1.8, 0.9, IRON, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(cx + sx * 3.4, 2.4, cz + sz * 3.6));
  }
  for (let i = 0; i < 4; i += 1) glow.push(rock(1.7, 0xf5b83a, cx - 2.4 + i * 1.7, 9.4, cz + (i % 2 ? 1.2 : -1), 1, i));
  parts.push(cbox(0.8, 11, 0.8, STYLE.woodLight).rotateZ(-0.5).translate(-w * 0.34, 6, d * 0.36));
  parts.push(cbox(7, 1.2, 1, STYLE.steel).rotateZ(-0.5).translate(-w * 0.34 + 2.6, 10.6, d * 0.36));
  return { body: merge(parts), glow: merge(glow) };
}

export function buildingModel(type: BuildingType, w: number, d: number, owner: PlayerId): BuildingModel {
  switch (type) {
    case "town_center":
      return townCenter(w, d, owner);
    case "house":
      return house(w, d, owner);
    case "storage":
      return storage(w, d, owner);
    case "farm":
      return farm(w, d, owner);
    case "army_camp":
      return armyCamp(w, d, owner);
    case "tower":
      return tower(w, d, owner);
    case "wall":
      return wall(w, d);
    case "academy":
      return academy(w, d, owner);
    case "forest":
      return forest(w, d);
    case "gold_vein":
      return goldVein(w, d);
  }
}
