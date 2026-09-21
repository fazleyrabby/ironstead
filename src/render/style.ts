import { Graphics } from "pixi.js";

// Reference-matched "flat + ink outline" style: bright saturated fills, no soft
// gradients, a single warm-dark outline on every shape.
export const INK = 0x241d18;
export const INK_ALPHA = 0.85;
export const INK_WIDTH = 2;

export const STYLE = {
  grass: 0x58a63e,
  grassLight: 0x68b849,
  grassDark: 0x498d33,
  grassShade: 0x3e7c2b,

  dirt: 0xb0885a,
  dirtDark: 0x8f6a42,
  sand: 0xd8c48a,

  water: 0x4aa3e0,
  waterLight: 0x7fc9f0,
  waterDeep: 0x2f7fc0,

  stone: 0xa0a4b2,
  stoneLight: 0xc2c6d0,
  stoneDark: 0x767b88,

  wood: 0x7a5636,
  woodDark: 0x5c3f26,
  woodLight: 0xa17a4e,

  leaf: 0x4fae3f,
  leafDark: 0x3d8c31,
  leafLight: 0x6cc457,
  autumn: 0xe08a3c,
  autumnDark: 0xc96f2a,
  autumnLight: 0xf0a955,

  crop: 0x8fbf4a,
  cropDark: 0x6f9b38,
  soil: 0x6b4a2f,

  flowerWhite: 0xf5f2e8,
  flowerYellow: 0xf6d76a,
  flowerPink: 0xf2a0c0,
  mushroom: 0xe0553f,

  skin: 0xf0c49a,
  skinDark: 0xd39b6e,
  steel: 0xc3ccd8,
  steelDark: 0x7c8794,
  leather: 0x6b4a2a,
  gold: 0xf2c14e,
  goldDark: 0x7a5a12,
  horse: 0x7a5230,
  horseDark: 0x54371d,
  boot: 0x5a3d22,
  roofBlue: 0x3b6db3,
  canvasTent: 0xe4d6b8,
  windowLit: 0xffd97a,
  fire: 0xf08a2d,
  fireCore: 0xf6d76a,
  dust: 0xe6dcc0,
} as const;

export function inkCircle(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  fill: number,
  width = INK_WIDTH,
): void {
  g.circle(x, y, r).fill(fill);
  g.circle(x, y, r).stroke({ width, color: INK, alpha: INK_ALPHA });
}

export function inkEllipse(
  g: Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: number,
  width = INK_WIDTH,
): void {
  g.ellipse(x, y, rx, ry).fill(fill);
  g.ellipse(x, y, rx, ry).stroke({ width, color: INK, alpha: INK_ALPHA });
}

export function inkRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  radius = 0,
  width = INK_WIDTH,
): void {
  if (radius > 0) {
    g.roundRect(x, y, w, h, radius).fill(fill);
    g.roundRect(x, y, w, h, radius).stroke({ width, color: INK, alpha: INK_ALPHA });
  } else {
    g.rect(x, y, w, h).fill(fill);
    g.rect(x, y, w, h).stroke({ width, color: INK, alpha: INK_ALPHA });
  }
}

export function inkPoly(g: Graphics, points: number[], fill: number, width = INK_WIDTH): void {
  g.poly(points).fill(fill);
  g.poly(points).stroke({ width, color: INK, alpha: INK_ALPHA });
}

export function groundShadow(g: Graphics, x: number, y: number, rx: number, ry: number): void {
  g.ellipse(x, y, rx, ry).fill({ color: 0x1c2b16, alpha: 0.16 });
}
