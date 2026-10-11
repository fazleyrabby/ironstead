import type { BufferGeometry } from "three";
import { STYLE } from "../render/style";
import type { BuildingType, PlayerId } from "../sim/types";
import { blob, box, cone, cyl, gable, merge, rock, seeded } from "./geo";
import { pineModel } from "./Props3D";

export interface BuildingModel {
  // Lit, shadow-casting body.
  body: BufferGeometry;
  // Unlit bright parts (windows, gold) that the bloom pass picks up.
  glow?: BufferGeometry;
}

const ROOF: Record<PlayerId, number> = { player: 0x3b6db3, enemy: 0xb5433f };
const ROOF_DARK: Record<PlayerId, number> = { player: 0x2c5490, enemy: 0x8f332f };
const BANNER: Record<PlayerId, number> = { player: 0x60a5fa, enemy: 0xf87171 };

const PLASTER = 0xe8d8b0;
const PLASTER_SHADE = 0xcdbb92;
const THATCH = 0xc9a55a;
const CANVAS = 0xe4d6b8;
const WINDOW = 0xffd98a;

type Parts = BufferGeometry[];

function flag(parts: Parts, owner: PlayerId, x: number, y: number, z: number, h = 16): void {
  parts.push(cyl(0.6, 0.6, h, STYLE.woodDark, x, y, z, 5));
  parts.push(box(8, 5, 0.8, BANNER[owner], x + 4.4, y + h - 6, z));
}

// Front (+z) window: a dark frame on the body with a bright pane in the glow mesh.
function windowAt(parts: Parts, glow: Parts, x: number, y: number, z: number, w = 5, h = 6): void {
  parts.push(box(w + 1.6, h + 1.6, 0.8, STYLE.woodDark, x, y - 0.8, z));
  glow.push(box(w, h, 0.8, WINDOW, x, y, z + 0.5));
}

function house(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const bw = w * 0.72;
  const bd = d * 0.6;
  parts.push(box(bw + 6, 5, bd + 6, STYLE.stoneDark));
  parts.push(box(bw, 24, bd, PLASTER, 0, 5));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box(2.4, 24, 2.4, STYLE.woodDark, (sx * bw) / 2, 5, (sz * bd) / 2));
  }
  parts.push(box(bw + 1, 2.2, bd + 1, STYLE.woodDark, 0, 16));
  parts.push(gable(bw + 9, bd + 10, 20, ROOF[owner], 0, 29, 0));
  parts.push(box(bw + 10, 1.6, 3, ROOF_DARK[owner], 0, 28.4, bd / 2 + 4.5));
  parts.push(box(6, 16, 6, STYLE.stone, bw * 0.26, 34, -bd * 0.12));
  parts.push(box(8, 13, 1, STYLE.wood, -bw * 0.2, 5, bd / 2 + 0.4));
  windowAt(parts, glow, bw * 0.22, 14, bd / 2 + 0.4);
  parts.push(box(9, 3, 5, STYLE.stone, -bw * 0.2, 0, bd / 2 + 4));
  return { body: merge(parts), glow: merge(glow) };
}

function townCenter(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const hw = w * 0.76;
  const hd = d * 0.5;
  parts.push(box(w * 0.92, 6, d * 0.84, STYLE.stoneDark));
  parts.push(box(hw, 9, hd, STYLE.stone, 0, 6));
  parts.push(box(hw, 30, hd, PLASTER, 0, 15));
  for (let i = 0; i <= 6; i += 1) {
    const x = -hw / 2 + (hw / 6) * i;
    parts.push(box(2.4, 30, 1.2, STYLE.woodDark, x, 15, hd / 2 + 0.3));
  }
  parts.push(box(hw + 1, 2.4, hd + 1, STYLE.woodDark, 0, 28));
  parts.push(gable(hw + 12, hd + 14, 32, ROOF[owner], 0, 45, 0));
  parts.push(box(hw + 13, 2, 3.5, ROOF_DARK[owner], 0, 44.2, hd / 2 + 6));

  // Entrance porch facing the camera.
  parts.push(box(30, 34, 14, PLASTER_SHADE, 0, 6, hd / 2 + 6));
  parts.push(gable(18, 34, 16, ROOF[owner], 0, 40, hd / 2 + 6, true));
  parts.push(box(15, 22, 1.2, STYLE.woodDark, 0, 6, hd / 2 + 13.2));
  for (let i = 0; i < 3; i += 1) parts.push(box(38 - i * 5, 2, 5, STYLE.stoneLight, 0, i * 2, hd / 2 + 24 - i * 4.5));

  // Clock tower.
  const tw = w * 0.21;
  parts.push(box(tw, 96, tw, STYLE.stone, 0, 6, -hd * 0.08));
  parts.push(box(tw + 5, 4, tw + 5, STYLE.stoneLight, 0, 98, -hd * 0.08));
  parts.push(cone((tw / 2 + 5) * Math.SQRT2, 30, ROOF[owner], 0, 102, -hd * 0.08, 4));
  parts.push(cyl(7.5, 7.5, 1.4, STYLE.woodDark, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(0, 84, -hd * 0.08 + tw / 2));
  glow.push(cyl(6, 6, 1.4, 0xd9cfae, 0, 0, 0, 12).rotateX(Math.PI / 2).translate(0, 84, -hd * 0.08 + tw / 2 + 2));
  flag(parts, owner, 0, 130, -hd * 0.08, 22);

  for (const sx of [-1, 1]) {
    windowAt(parts, glow, sx * hw * 0.22, 26, hd / 2 + 0.6, 7, 9);
    windowAt(parts, glow, sx * hw * 0.4, 26, hd / 2 + 0.6, 7, 9);
    parts.push(box(1.2, 16, 5, BANNER[owner], sx * 19, 20, hd / 2 + 13.6));
  }
  parts.push(box(10, 8, 10, STYLE.wood, hw * 0.42, 6, hd / 2 + 12));
  parts.push(cyl(4, 4, 9, STYLE.woodLight, -hw * 0.42, 6, hd / 2 + 12, 8));
  return { body: merge(parts), glow: merge(glow) };
}

function storage(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const bw = w * 0.62;
  const bd = d * 0.74;
  parts.push(box(bw + 5, 4, bd + 5, STYLE.stoneDark));
  parts.push(box(bw, 24, bd, STYLE.wood, 0, 4));
  for (let i = 0; i <= 4; i += 1) parts.push(box(1.6, 24, 1, STYLE.woodDark, -bw / 2 + (bw / 4) * i, 4, bd / 2 + 0.3));
  parts.push(gable(bd + 9, bw + 11, 20, THATCH, 0, 28, 0, true));
  parts.push(box(15, 17, 1, STYLE.woodDark, 0, 4, bd / 2 + 0.6));
  parts.push(box(bw + 2, 3, 1.2, ROOF[owner], 0, 24, bd / 2 + 0.7));
  parts.push(box(9, 9, 9, STYLE.woodLight, bw / 2 + 9, 0, bd * 0.2));
  parts.push(box(7, 7, 7, STYLE.wood, bw / 2 + 8, 9, bd * 0.2));
  parts.push(cyl(4, 4, 10, STYLE.woodLight, -bw / 2 - 8, 0, bd * 0.25, 8));
  parts.push(cyl(4, 4, 10, STYLE.wood, -bw / 2 - 9, 0, -bd * 0.12, 8));
  return { body: merge(parts) };
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
      parts.push(blob(3.1, c % 2 ? STYLE.crop : STYLE.cropDark, x, 5.6, z, 1.25, 0));
    }
  }
  const posts = 6;
  for (let i = 0; i <= posts; i += 1) {
    const t = -0.5 + i / posts;
    parts.push(box(1.8, 9, 1.8, STYLE.wood, fw * t, 0, -fd / 2));
    parts.push(box(1.8, 9, 1.8, STYLE.wood, fw * t, 0, fd / 2));
    parts.push(box(1.8, 9, 1.8, STYLE.wood, -fw / 2, 0, fd * t));
    parts.push(box(1.8, 9, 1.8, STYLE.wood, fw / 2, 0, fd * t));
  }
  for (const y of [3.5, 7]) {
    parts.push(box(fw, 1, 1, STYLE.woodLight, 0, y, -fd / 2));
    parts.push(box(fw, 1, 1, STYLE.woodLight, 0, y, fd / 2));
    parts.push(box(1, 1, fd, STYLE.woodLight, -fw / 2, y, 0));
    parts.push(box(1, 1, fd, STYLE.woodLight, fw / 2, y, 0));
  }
  // Tool shed in the back corner.
  parts.push(box(22, 15, 18, STYLE.wood, fw * 0.32, 1.6, -fd * 0.3));
  parts.push(gable(26, 24, 12, ROOF[owner], fw * 0.32, 16.6, -fd * 0.3));
  // Scarecrow.
  parts.push(box(1.4, 20, 1.4, STYLE.woodDark, fw * 0.3, 1.6, fd * 0.24));
  parts.push(box(14, 1.4, 1.4, STYLE.woodDark, fw * 0.3, 15, fd * 0.24));
  parts.push(box(7, 8, 3, 0xb7793a, fw * 0.3, 9, fd * 0.24));
  parts.push(blob(3, THATCH, fw * 0.3, 21, fd * 0.24, 1, 0));
  return { body: merge(parts) };
}

function armyCamp(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const yw = w * 0.94;
  const yd = d * 0.94;
  parts.push(box(yw, 1.4, yd, STYLE.sand));
  const stakes = 13;
  for (let i = 0; i <= stakes; i += 1) {
    const t = -0.5 + i / stakes;
    const h = 15 + (i % 2) * 2.5;
    parts.push(cone(2.3, h, STYLE.wood, yw * t, 0, -yd / 2, 5));
    parts.push(cone(2.3, h, STYLE.wood, -yw / 2, 0, yd * t, 5));
    parts.push(cone(2.3, h, STYLE.wood, yw / 2, 0, yd * t, 5));
    // Leave a gate in the middle of the front wall.
    if (Math.abs(t) > 0.16) parts.push(cone(2.3, h, STYLE.wood, yw * t, 0, yd / 2, 5));
  }
  // Command tent.
  parts.push(cone(25, 30, CANVAS, -yw * 0.2, 1.4, -yd * 0.16, 6));
  parts.push(cone(9, 11, ROOF[owner], -yw * 0.2, 22, -yd * 0.16, 6));
  parts.push(box(8, 13, 1, 0x3a2a1c, -yw * 0.2, 1.4, -yd * 0.16 + 21.6));
  // Training dummy and weapon rack.
  parts.push(box(1.6, 18, 1.6, STYLE.woodDark, yw * 0.26, 1.4, yd * 0.1));
  parts.push(box(13, 1.6, 1.6, STYLE.woodDark, yw * 0.26, 14, yd * 0.1));
  parts.push(box(7, 9, 4, THATCH, yw * 0.26, 8, yd * 0.1));
  parts.push(blob(3.2, THATCH, yw * 0.26, 21, yd * 0.1, 1, 0));
  parts.push(box(20, 1.4, 1.4, STYLE.woodDark, yw * 0.24, 12, -yd * 0.3));
  for (const sx of [-1, 1]) parts.push(box(1.4, 12, 1.4, STYLE.woodDark, yw * 0.24 + sx * 9, 1.4, -yd * 0.3));
  for (let i = 0; i < 4; i += 1) parts.push(box(0.9, 16, 0.9, STYLE.steel, yw * 0.24 - 6.6 + i * 4.4, 1.4, -yd * 0.3 + 1.2));
  // Campfire.
  parts.push(cyl(5.5, 6.5, 2.2, STYLE.stoneDark, 0, 1.4, yd * 0.24, 8));
  glow.push(cone(3.2, 7, STYLE.fire, 0, 3, yd * 0.24, 5));
  flag(parts, owner, -yw * 0.42, 0, yd * 0.42, 30);
  return { body: merge(parts), glow: merge(glow) };
}

function tower(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const r = Math.min(w, d) * 0.36;
  parts.push(cyl(r + 2.5, r + 4, 7, STYLE.stoneDark, 0, 0, 0, 8));
  parts.push(cyl(r, r + 1.5, 58, STYLE.stone, 0, 7, 0, 8));
  parts.push(cyl(r + 4, r + 1, 6, STYLE.stoneLight, 0, 65, 0, 8));
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(box(4.6, 5, 4.6, STYLE.stoneLight, Math.cos(a) * (r + 2.4), 71, Math.sin(a) * (r + 2.4)));
  }
  parts.push(cone(r + 1.5, 22, ROOF[owner], 0, 73, 0, 8));
  glow.push(box(2.2, 7, 1, WINDOW, 0, 44, r + 0.9));
  parts.push(box(6, 11, 1, STYLE.woodDark, 0, 7, r + 1.2));
  return { body: merge(parts), glow: merge(glow) };
}

function wall(w: number, d: number): BuildingModel {
  const parts: Parts = [];
  parts.push(box(w, 5, d * 0.78, STYLE.stoneDark));
  parts.push(box(w, 25, d * 0.62, STYLE.stone, 0, 5));
  parts.push(box(w, 3, d * 0.74, STYLE.stoneLight, 0, 30));
  for (const sx of [-1, 0, 1]) parts.push(box(w * 0.2, 6, d * 0.74, STYLE.stoneLight, sx * w * 0.36, 33));
  return { body: merge(parts) };
}

function academy(w: number, d: number, owner: PlayerId): BuildingModel {
  const parts: Parts = [];
  const glow: Parts = [];
  const bw = w * 0.74;
  const bd = d * 0.6;
  for (let i = 0; i < 3; i += 1) parts.push(box(bw + 14 - i * 4, 2.4, bd + 16 - i * 4, STYLE.stoneLight, 0, i * 2.4, 2));
  parts.push(box(bw, 28, bd, STYLE.stoneLight, 0, 7.2));
  for (let i = 0; i < 4; i += 1) {
    const x = -bw / 2 + 4 + ((bw - 8) / 3) * i;
    parts.push(cyl(2.3, 2.6, 26, 0xe9ecf2, x, 7.2, bd / 2 + 6, 8));
  }
  parts.push(box(bw + 6, 4, bd + 16, STYLE.stone, 0, 34, 2));
  parts.push(cone((bw / 2 + 4) * Math.SQRT2, 22, ROOF[owner], 0, 38, 0, 4));
  glow.push(blob(3.6, 0xffd24a, 0, 62, 0, 1, 0));
  parts.push(box(9, 16, 1, STYLE.woodDark, 0, 7.2, bd / 2 + 0.5));
  for (const sx of [-1, 1]) windowAt(parts, glow, sx * bw * 0.3, 22, bd / 2 + 0.5, 4.5, 8);
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
  return { body: merge(parts) };
}

function goldVein(w: number, d: number): BuildingModel {
  const rand = seeded(91);
  const parts: Parts = [];
  const glow: Parts = [];
  parts.push(rock(w * 0.34, STYLE.stone, -w * 0.08, w * 0.17, -d * 0.04, 0.8, 0.3));
  parts.push(rock(w * 0.26, STYLE.stoneDark, w * 0.2, w * 0.12, d * 0.1, 0.75, 1.2));
  parts.push(rock(w * 0.2, STYLE.stoneLight, -w * 0.24, w * 0.09, d * 0.2, 0.7, 2.1));
  for (let i = 0; i < 9; i += 1) {
    const a = rand() * Math.PI * 2;
    const dist = rand() * w * 0.3;
    glow.push(rock(2.6 + rand() * 2.4, 0xf5b83a, Math.cos(a) * dist, 6 + rand() * w * 0.3, Math.sin(a) * dist * 0.8 + d * 0.08, 1, a));
  }
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
