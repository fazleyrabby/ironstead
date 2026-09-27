import { Graphics } from "pixi.js";
import type { Building } from "../sim/types";

// Authored architecture with seeded material variation. Geometry is retained by
// Pixi between state changes; no per-frame texture noise or random redraws.
const INK = 0x382e28;
const PLASTER = 0xddcba4;
const TIMBER = 0x67503b;
const STONE = 0xa6a18c;

function randomFor(key: string): () => number {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function drawing(g: Graphics, b: Building) {
  // Towers occupy one tile, but their elevated silhouette must read at RTS zoom.
  const sx = b.width / 100 * (b.type === "tower" ? 1.15 : 1);
  const sy = b.height / 100 * (b.type === "tower" ? 1.55 : 1);
  const rand = randomFor(b.id);
  const poly = (p: number[], fill: number, width = 0.8, alpha = 1) => {
    g.poly(p.map((n, i) => n * (i % 2 ? sy : sx))).fill({ color: fill, alpha });
    if (width) g.stroke({ color: INK, width: width * sx, alpha });
  };
  const rect = (x: number, y: number, w: number, h: number, fill: number, width = 0.8, alpha = 1) =>
    poly([x, y, x + w, y, x + w, y + h, x, y + h], fill, width, alpha);
  const line = (p: number[], color = INK, width = 0.6, alpha = 1) => {
    g.moveTo(p[0] * sx, p[1] * sy);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * sx, p[i + 1] * sy);
    g.stroke({ color, width: width * sx, alpha });
  };
  const oval = (x: number, y: number, rx: number, ry: number, fill: number, width = 0.7, alpha = 1) => {
    g.ellipse(x * sx, y * sy, rx * sx, ry * sy).fill({ color: fill, alpha });
    if (width) g.stroke({ color: INK, width: width * sx, alpha });
  };
  const stone = (x: number, y: number, w: number, h: number, rowH = 4) => {
    rect(x, y, w, h, STONE);
    for (let row = 0; row < Math.ceil(h / rowH); row++) {
      const yy = y + row * rowH;
      for (let xx = x - (row % 2) * 4; xx < x + w; xx += 8) {
        const left = Math.max(x, xx);
        const right = Math.min(x + w, xx + 8);
        rect(left + 0.3, yy + 0.3, right - left - 0.6, Math.min(rowH, y + h - yy) - 0.6,
          mix(STONE, rand() > 0.5 ? 0xe3d7b8 : 0x716d5c, rand() * 0.3), 0.3);
      }
    }
  };
  const wall = (x: number, y: number, w: number, h: number) => {
    rect(x, y, w, h, PLASTER, 1.1);
    rect(x + w - 4, y, 4, h, 0xb4a07f, 0);
    for (let i = 0; i < w * h / 45; i++) {
      const xx = x + 2 + rand() * (w - 4);
      const yy = y + 2 + rand() * (h - 4);
      line([xx, yy, xx + 1 + rand() * 2, yy + 0.2], 0x9d8e72, 0.45, 0.42);
    }
    for (const xx of [x + 1, x + w / 2 - 1, x + w - 3]) {
      rect(xx, y, 2.2, h, TIMBER, 0.6);
      line([xx + 0.6, y + 2, xx + 0.6, y + h - 1], 0xa58a62, 0.4);
    }
    rect(x, y + h - 3, w, 2.5, TIMBER, 0.5);
    line([x + 4, y + h - 4, x + w / 2 - 3, y + 3], TIMBER, 1.8);
    line([x + w / 2 + 4, y + 3, x + w - 4, y + h - 4], TIMBER, 1.8);
  };
  const roof = (x: number, y: number, w: number, h: number, color: number) => {
    // A broad roof plane stays aligned with the existing frontal/top-down view.
    poly([x - 2, y + h + 1, x + w + 3, y + h + 1, x + w + 2, y + h + 5, x, y + h + 4], INK, 0, 0.3);
    const rows = Math.max(4, Math.round(h / 4));
    for (let row = 0; row < rows; row++) {
      const a = row / rows;
      const z = (row + 1) / rows;
      const leftTop = x + 8 * (1 - a);
      const leftBottom = x + 8 * (1 - z);
      const rightTop = x + w - 8 * (1 - a);
      const rightBottom = x + w - 8 * (1 - z);
      const count = Math.max(3, Math.round((rightTop - leftTop) / 6));
      for (let col = 0; col < count; col++) {
        const t = col / count;
        const u = (col + 1) / count;
        const y1 = y + h * a;
        const y2 = y + h * z;
        const c = mix(color, rand() > 0.52 ? 0xc8c6ac : 0x253d42, 0.07 + rand() * 0.19);
        poly([leftTop + (rightTop - leftTop) * t, y1,
          leftTop + (rightTop - leftTop) * u, y1,
          leftBottom + (rightBottom - leftBottom) * u, y2 + rand() * 0.5,
          leftBottom + (rightBottom - leftBottom) * t, y2], c, 0.45);
        line([leftBottom + (rightBottom - leftBottom) * t + 0.7, y2 - 0.8,
          leftBottom + (rightBottom - leftBottom) * u - 0.7, y2 - 0.8], 0xd7d1b7, 0.4, 0.45);
      }
    }
    line([x, y + h, x + 8, y, x + w - 8, y, x + w, y + h, x, y + h], INK, 1.2);
    rect(x + 7, y - 1.4, w - 14, 2.4, mix(color, 0xe5dcc3, 0.25), 0.65);
    for (let xx = x + 12; xx < x + w - 8; xx += 6) line([xx, y - 1.1, xx, y + 1], INK, 0.45);
    rect(x - 1, y + h, w + 2, 2.1, TIMBER, 0.6);
    line([x, y + h + 0.4, x + w, y + h + 0.4], 0xbc9b6c, 0.5);
  };
  const window = (x: number, y: number, w: number, h: number) => {
    rect(x - 1.2, y - 1, w + 2.4, h + 2, 0xb7a17a, 0.6);
    rect(x, y, w, h, 0x36484a, 0.7);
    rect(x + 0.9, y + 0.9, w / 2 - 1.3, h - 1.8, 0xb6bdac, 0);
    line([x, y + h * 0.45, x + w, y + h * 0.45], TIMBER, 0.8);
    line([x + w / 2, y, x + w / 2, y + h], TIMBER, 0.8);
    rect(x - 2, y + h, w + 4, 1.5, 0xd9c9a4, 0.6);
    for (const xx of [x - 4, x + w + 1]) {
      rect(xx, y, 2.6, h, 0x7a8167, 0.5);
      for (let yy = y + 2; yy < y + h; yy += 2) line([xx + 0.3, yy, xx + 2.3, yy], INK, 0.35);
    }
  };
  const door = (x: number, y: number, w: number, h: number) => {
    rect(x - 2, y - 2, w + 4, h + 2, 0xae9c79, 0.8);
    rect(x, y, w, h, 0x403a30, 0.7);
    rect(x + 1.3, y + 1, w - 2.2, h - 1, 0x86694a, 0.4);
    for (let xx = x + 3; xx < x + w; xx += 2.6) line([xx, y + 1.5, xx, y + h - 0.5], INK, 0.5);
    for (const yy of [y + h * 0.28, y + h * 0.77]) {
      rect(x + 1.6, yy, w - 3, 1, 0x42443c, 0);
      oval(x + 2.5, yy + 0.5, 0.4, 0.4, 0xcbbea0, 0);
    }
    oval(x + w - 3, y + h * 0.57, 0.9, 1.1, 0xc5aa6b, 0.4);
  };
  const barrel = (x: number, y: number, size = 1) => {
    oval(x + 2, y + 2, 4.5 * size, 2 * size, INK, 0, 0.18);
    poly([x - 3 * size, y - 8 * size, x + 3 * size, y - 8 * size,
      x + 3.7 * size, y - 3 * size, x + 3 * size, y, x - 3 * size, y, x - 3.7 * size, y - 3 * size], 0x98734b, 0.7);
    for (const dx of [-1.5, 0.5, 2]) line([x + dx * size, y - 7 * size, x + dx * size, y - 0.5 * size], TIMBER, 0.45);
    for (const dy of [-6, -1.5]) rect(x - 3.4 * size, y + dy * size, 6.8 * size, size, 0x66695c, 0.35);
    oval(x, y - 8 * size, 3 * size, 1.2 * size, 0xb1976d, 0.6);
    line([x - 2 * size, y - 8 * size, x + 2 * size, y - 8 * size], TIMBER, 0.45);
  };
  const flag = (x: number, y: number, color: number) => {
    line([x, y + 16, x, y - 1], TIMBER, 1.1);
    oval(x, y - 1, 1.1, 1.1, 0xcab578, 0.5);
    poly([x + 0.7, y, x + 7, y + 1, x + 12, y + 0.2, x + 10, y + 4,
      x + 12, y + 7, x + 6, y + 7.8, x + 0.7, y + 6], color, 0.6);
    line([x + 5, y + 1, x + 5.5, y + 7], 0xf0dfb8, 0.6, 0.5);
  };
  const ground = () => {
    poly([-48, 24, -39, 17, 32, 19, 48, 29, 49, 43, 38, 50, 12, 49,
      -5, 55, -33, 50, -49, 43], 0xb09a70, 0, 0.48);
    poly([-42, 8, 32, 4, 53, 27, 51, 43, 34, 51, -30, 46], 0x343627, 0, 0.21);
    for (let i = 0; i < 38; i++) {
      const x = -46 + rand() * 92;
      const y = 36 + rand() * 17;
      if (Math.abs(x) < 14) continue;
      if (i % 3 === 0) {
        line([x - 1.5, y, x - 2.5, y - 2.7, x, y, x + 1, y - 3.5], 0x647146, 0.65, 0.8);
      } else oval(x, y, 0.6 + rand(), 0.5, i % 2 ? 0xbab398 : 0x796b51, 0, 0.7);
    }
  };
  return { poly, rect, line, oval, stone, wall, roof, window, door, barrel, flag, ground };
}

export function drawIllustratedHouse(g: Graphics, b: Building, faction: number): void {
  const d = drawing(g, b);
  const roof = b.owner === "player" ? 0x526d79 : 0x995e4c;
  d.ground();
  d.stone(-36, 31, 72, 12);
  d.wall(-34, 1, 68, 33);
  d.roof(-42, -35, 84, 38, roof);
  // Brick chimney, flashing, and a dark open flue.
  d.poly([19, -18, 32, -18, 35, -13, 17, -13], 0x647170, 0.6);
  d.stone(21, -42, 9, 26, 3.4);
  d.rect(19, -44, 13, 3, 0x8e8a77, 0.8);
  d.rect(21, -44, 9, 1.5, 0x393a32, 0.3);
  // Small gabled dormer cuts the broad roof into a recognizable house silhouette.
  d.wall(-23, -15, 18, 12);
  d.poly([-26, -15, -14, -26, -2, -15], roof, 1);
  d.line([-23, -15, -14, -23, -5, -15], 0xa7ac9b, 0.6);
  d.window(-17, -13, 6, 7);
  d.door(-19, 11, 13, 23);
  d.window(11, 11, 11, 12);
  d.rect(8, 27, 18, 4, 0x846347, 0.7);
  for (let i = 0; i < 6; i++) {
    d.line([10 + i * 2.5, 27, 11 + i * 2.5, 24 - i % 2], 0x506540, 0.7);
    d.oval(11 + i * 2.5, 24 - i % 2, 1.2, 0.9, i % 2 ? 0xd9c28e : 0xa56758, 0.2);
  }
  d.rect(-22, 35, 19, 3, 0xc0baa1, 0.6);
  d.rect(-25, 39, 25, 3, 0xa9a48d, 0.6);
  for (let i = 0; i < 3; i++) d.poly([-21 + i % 2, 45 + i * 4, -9, 44 + i * 4,
    -7, 47 + i * 4, -22, 48 + i * 4], 0xb8b095, 0.45);
  d.barrel(36, 39, 1.1);
  d.barrel(43, 43, 0.8);
  d.flag(-1, -48, faction);
}

export function drawIllustratedTownCenter(g: Graphics, b: Building, faction: number): void {
  const d = drawing(g, b);
  const roof = b.owner === "player" ? 0x526d79 : 0x995e4c;
  d.ground();
  d.stone(-46, 31, 92, 11);
  // Low wings frame a taller civic hall, all on the existing orthogonal axes.
  for (const x of [-44, 20]) {
    d.wall(x, 8, 24, 25);
    d.roof(x - 3, -14, 30, 23, roof);
    d.window(x + 8, 16, 8, 10);
  }
  d.wall(-26, 0, 52, 37);
  d.roof(-31, -30, 62, 32, roof);
  d.stone(21, -32, 6, 15, 3);
  d.rect(20, -33, 8, 2, 0x7e7b69, 0.6);
  // Clock tower: pale masonry, corner quoins, cornices and narrow belfry vents.
  d.stone(-12, -49, 24, 42, 4);
  d.rect(8, -47, 4, 39, 0x777969, 0, 0.4);
  for (const x of [-12, 8]) {
    for (let y = -47; y < -10; y += 6) d.rect(x, y, 4, 3.5, 0xc9c1a4, 0.45);
  }
  d.rect(-14, -12, 28, 3, 0xbeb497, 0.7);
  d.rect(-13, -48, 26, 3, 0xd0c4a5, 0.7);
  for (const x of [-7, 3]) {
    d.rect(x, -43, 4, 8, 0x42493f, 0.6);
    for (let y = -41; y < -35; y += 2) d.line([x, y, x + 4, y], 0xa49e80, 0.5);
  }
  d.roof(-17, -64, 34, 16, roof);
  d.oval(0, -24, 7.1, 7.1, 0x786944, 0.7);
  d.oval(0, -24, 5.9, 5.9, 0xe7d9b6, 0.5);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    d.line([Math.sin(a) * 4.6, -24 + Math.cos(a) * 4.6,
      Math.sin(a) * 5.3, -24 + Math.cos(a) * 5.3], INK, 0.5);
  }
  d.line([0, -28, 0, -24, 3, -22], INK, 0.9);
  d.door(-7, 17, 14, 20);
  for (const x of [-19, 13]) d.window(x, 12, 6, 10);
  // Canopy on carved posts, with a small civic crest above it.
  d.poly([-11, 15, -7, 10, 7, 10, 11, 15], roof, 0.7);
  for (const x of [-10, 9]) {
    d.rect(x, 16, 1.4, 20, TIMBER, 0.4);
    d.rect(x - 0.8, 33, 3, 3, STONE, 0.4);
  }
  d.poly([-3, 3, 3, 3, 3, 7, 0, 9, -3, 7], faction, 0.6);
  d.line([0, 4, 0, 7, -1.5, 6, 1.5, 6], 0xe9dab0, 0.6);
  for (let i = 0; i < 3; i++) {
    d.rect(-11 - i * 2, 37 + i * 3, 22 + i * 4, 3, mix(STONE, 0xe3d7b8, 0.3 - i * 0.08), 0.5);
  }
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
    d.rect(-15 + col * 6 + row % 2, 47 + row * 3.5, 5.7, 3, 0xb5ad93, 0.35);
  }
  d.barrel(-39, 40, 0.8);
  d.barrel(-32, 42, 0.65);
  d.rect(30, 35, 8, 7, 0x9c7e53, 0.7);
  d.line([30, 35, 38, 42, 38, 35, 30, 42], TIMBER, 0.8);
  d.flag(0, -79, faction);
  for (const x of [-39, 35]) {
    d.rect(x, 11, 4, 11, faction, 0.5);
    d.poly([x, 22, x + 2, 24, x + 4, 22], faction, 0.5);
    d.line([x + 2, 13, x + 2, 19], 0xebddb9, 0.7);
  }
}

/** Remaining civic/economic buildings share the same materials and line scale. */
export function drawIllustratedBuilding(g: Graphics, b: Building, faction: number): void {
  const d = drawing(g, b);
  const roof = b.owner === "player" ? 0x526d79 : 0x995e4c;
  d.ground();
  switch (b.type) {
    case "storage": {
      d.stone(-38, 30, 76, 10);
      d.wall(-35, -4, 70, 36);
      // Loading doors and a projecting hoist distinguish the storehouse.
      d.door(-20, 6, 20, 26);
      d.door(0, 6, 20, 26);
      d.roof(-43, -38, 86, 36, roof);
      d.rect(-3, -31, 6, 21, TIMBER, 0.7);
      d.rect(-10, -30, 23, 3, TIMBER, 0.7);
      d.line([-7, -15, 10, -28], TIMBER, 1.5);
      d.oval(10, -25, 2.4, 2.4, 0x91876a, 0.7);
      d.line([11, -23, 11, -9, 9, -7, 7, -9], 0xd0c29d, 0.8);
      d.rect(-25, 34, 50, 4, 0xb8ae92, 0.6);
      for (const [x, y] of [[25, 36], [34, 39], [30, 29]]) {
        d.rect(x, y - 9, 10, 9, 0xa08459, 0.7);
        d.line([x, y - 9, x + 10, y, x + 10, y - 9, x, y], TIMBER, 0.8);
      }
      d.barrel(-31, 40, 1.25);
      d.barrel(-41, 43, 1);
      d.flag(-24, -51, faction);
      break;
    }
    case "farm": {
      // Individual plants on raised, furrowed beds, with clear walking strips.
      d.poly([-45, -34, 41, -34, 44, 43, -45, 43], 0x87704e, 0.7);
      for (let row = 0; row < 5; row++) {
        const y = -23 + row * 13;
        d.rect(-39, y, 77, 9, 0x66513b, 0.4);
        d.line([-38, y + 9, 38, y + 9], 0xb29b6e, 0.8);
        for (let col = 0; col < 13; col++) {
          const x = -35 + col * 5.7;
          const height = 4 + (col + row * 2) % 3;
          d.line([x, y + 6, x, y - height], 0xb1b075, 0.65);
          for (let leaf = 0; leaf < 3; leaf++) {
            const yy = y + 3 - leaf * 2;
            d.poly([x, yy, x - 2.6, yy - 2.6, x - 0.5, yy - 2], 0x7f9354, 0.25);
            d.poly([x, yy - 1, x + 2.7, yy - 3, x + 1, yy], 0xa0ae68, 0.25);
          }
          d.oval(x, y - height, 0.7, 1.8, row < 2 ? 0xc6b774 : 0x91a060, 0.2);
        }
      }
      d.wall(11, -42, 28, 20);
      d.roof(7, -58, 36, 19, roof);
      d.door(19, -35, 11, 13);
      // Rail fence stays open at the entrance.
      for (const [x, w] of [[-45, 30], [12, 33]]) {
        for (const yy of [35, 41]) d.rect(x, yy, w, 1.6, 0xa48b61, 0.4);
        for (let xx = x; xx <= x + w; xx += 10) {
          d.poly([xx, 45, xx, 29, xx + 1.5, 27, xx + 3, 29, xx + 3, 45], TIMBER, 0.5);
        }
      }
      d.barrel(41, -18, 0.8);
      d.line([-37, -29, -37, -54], TIMBER, 1.2);
      d.line([-43, -45, -30, -45], TIMBER, 1.1);
      d.poly([-42, -46, -32, -46, -34, -37, -40, -37], 0x99805c, 0.5);
      d.oval(-37, -50, 2.4, 2.7, 0xc8b584, 0.5);
      d.poly([-42, -52, -39, -55, -35, -55, -32, -52], 0x847351, 0.5);
      break;
    }
    case "tower": {
      d.stone(-30, -33, 60, 76, 6);
      d.rect(20, -30, 10, 69, 0x777969, 0, 0.3);
      for (const x of [-32, 24]) d.stone(x, 0, 8, 43, 7);
      for (const y of [-20, 3]) {
        d.rect(-2.5, y, 5, 13, 0x3d4138, 0.6);
        d.line([-5, y + 5, 5, y + 5], 0x3d4138, 1.7);
        d.line([3.3, y, 3.3, y + 13], 0xd3c5a3, 0.6);
      }
      d.stone(-38, -45, 76, 15, 5);
      d.rect(-40, -32, 80, 3, 0xc5b99a, 0.8);
      for (let x = -38; x < 38; x += 15) {
        d.stone(x, -55, 10, 13, 5);
        d.rect(x - 1, -56, 12, 2, 0xd1c5a6, 0.5);
      }
      for (const x of [-28, -14, 12, 26]) d.poly([x, -29, x + 4, -29, x + 2, -23, x, -23], 0x88816c, 0.5);
      d.door(-8, 23, 16, 19);
      d.rect(-12, 43, 24, 4, 0xbcb295, 0.5);
      d.flag(0, -74, faction);
      d.poly([14, -22, 23, -22, 23, -5, 18.5, -1, 14, -5], faction, 0.6);
      d.line([18.5, -19, 18.5, -7], 0xe2d2a8, 0.8);
      break;
    }
    case "army_camp": {
      // Canvas ridges, guy ropes, bedrolls and weapon racks instead of a flat pad.
      for (let x = -43; x < 46; x += 6) {
        d.poly([x, -20, x, -43, x + 2, -47, x + 4, -43, x + 4, -20], 0x917750, 0.6);
        d.line([x + 1.2, -41, x + 1.2, -23], 0xc2a575, 0.4);
      }
      d.rect(-44, -28, 88, 2.5, TIMBER, 0.5);
      for (const [x, y, size] of [[-21, 20, 1], [25, 25, 0.8]]) {
        d.poly([x - 20 * size, y, x - 5 * size, y - 34 * size,
          x + 8 * size, y - 35 * size, x + 21 * size, y], 0xc8bd93, 0.9);
        d.poly([x - 5 * size, y - 34 * size, x + 8 * size, y - 35 * size,
          x + 21 * size, y, x - 4 * size, y], 0xa89e78, 0.7);
        d.poly([x - 12 * size, y, x - 4 * size, y - 23 * size, x + 3 * size, y], 0x4b4b3b, 0.5);
        for (const dx of [-18, 17]) {
          d.line([x + dx * size, y - 5, x + dx * 1.3 * size, y + 7], 0xd6c9a4, 0.65);
          d.line([x + dx * 1.3 * size, y + 4, x + dx * 1.3 * size, y + 9], TIMBER, 1.1);
        }
        d.line([x + 7 * size, y - 32 * size, x + 14 * size, y - 2], 0xe1d4ae, 0.7);
        d.rect(x - 9, y + 3, 14, 4, 0x7c8465, 0.5);
        for (const dx of [-6, 2]) d.line([x + dx, y + 3, x + dx, y + 7], TIMBER, 0.6);
      }
      d.oval(-1, 37, 8, 4, 0x655d48, 0.5);
      for (let i = 0; i < 8; i++) d.oval(Math.cos(i * Math.PI / 4) * 8 - 1, 37 + Math.sin(i * Math.PI / 4) * 4, 1.8, 1.3, STONE, 0.4);
      d.line([-5, 38, 3, 34, -4, 34, 3, 39], TIMBER, 1.5);
      d.poly([-4, 36, -2, 29, 0, 32, 2, 26, 4, 36], 0xc89449, 0.3);
      d.poly([-1, 36, 1, 30, 2, 36], 0xe3c47b, 0);
      for (const x of [-38, -24]) d.rect(x, 25, 2, 18, TIMBER, 0.5);
      d.rect(-40, 29, 20, 2, TIMBER, 0.5);
      for (const x of [-36, -30, -24]) {
        d.line([x, 40, x + 2, 20], 0x9a845c, 1);
        d.poly([x, 20, x + 2.5, 15, x + 4, 20], 0xb0b5a9, 0.4);
      }
      d.flag(34, -65, faction);
      d.line([34, -49, 34, -22], TIMBER, 1.3);
      break;
    }
    case "academy": {
      d.stone(-42, 27, 84, 14);
      d.wall(-36, -4, 72, 34);
      d.roof(-44, -38, 88, 36, roof);
      d.door(-8, 9, 16, 22);
      for (const x of [-27, 20]) d.window(x, 6, 8, 16);
      for (const x of [-35, -15, 12, 32]) {
        d.rect(x, 0, 3, 31, 0xbab49b, 0.6);
        d.rect(x - 1, 0, 5, 3, 0xd8ccac, 0.5);
        d.rect(x - 1, 29, 5, 3, 0xd8ccac, 0.5);
      }
      d.poly([-21, 1, 0, -16, 21, 1], 0xcabd9a, 0.9);
      d.poly([-16, -0.5, 0, -13, 16, -0.5], 0x9f987c, 0.5);
      // An open book above the portico, plus a brass roof observatory.
      d.poly([-7, -7, 0, -5, 7, -7, 7, -1, 0, 1, -7, -1], 0xe7d8b0, 0.5);
      d.line([0, -5, 0, 1], TIMBER, 0.5);
      d.oval(21, -42, 8, 8, 0x7e897b, 0.7);
      d.line([15, -47, 26, -36, 25, -49, 17, -35], 0xc4af78, 0.7);
      d.rect(13, -35, 16, 3, 0xa2936e, 0.5);
      for (let i = 0; i < 3; i++) d.rect(-15 - i * 3, 33 + i * 4, 30 + i * 6, 4, 0xb9b098, 0.6);
      d.flag(-24, -52, faction);
      break;
    }
    case "wall": {
      d.stone(-48, -24, 96, 66, 13);
      d.rect(-48, 29, 96, 12, 0x777b68, 0, 0.2);
      d.rect(-50, -27, 100, 6, 0xcec3a3, 1.2);
      for (const x of [-47, -13, 21]) {
        d.stone(x, -46, 25, 20, 10);
        d.rect(x - 1, -47, 27, 4, 0xd0c5a7, 0.8);
      }
      d.line([-21, -9, -24, 0, -18, 8, -20, 17], 0x716c5b, 1.1);
      break;
    }
  }
}
