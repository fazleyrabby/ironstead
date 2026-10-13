import { STYLE } from "../render/style";
import type { PlayerId } from "../sim/types";

// Brighter, warmer model palette for the toy look. Ground art keeps STYLE.
export const TOON = {
  ...STYLE,
  stone: 0xb9b3a4,
  stoneLight: 0xdcd6c6,
  stoneDark: 0x8a8578,
  wood: 0xa9713c,
  woodDark: 0x7a4b24,
  woodLight: 0xd29a58,
  leaf: 0x5cc247,
  leafDark: 0x3f9a34,
  leafLight: 0x8fe060,
  autumn: 0xf08a2e,
  autumnDark: 0xd66a1c,
  autumnLight: 0xffb44d,
  skin: 0xf6c9a0,
  skinDark: 0xdc9f72,
  steel: 0xd3dde8,
  steelDark: 0x8996a6,
  gold: 0xffc93c,
  goldDark: 0xc98f14,
  leather: 0x8a5a2c,
  boot: 0x6b4423,
  horse: 0x9a6a3c,
  horseDark: 0x6b4423,
  plaster: 0xfbeccb,
  plasterShade: 0xe4cf9f,
  thatch: 0xe3b75a,
  thatchDark: 0xb98a34,
  canvas: 0xf3e6c4,
  canvasShade: 0xd6c394,
  iron: 0x4a4e59,
  window: 0xffe08a,
} as const;

export const FACTION: Record<PlayerId, { main: number; dark: number; light: number }> = {
  player: { main: 0x2f86f6, dark: 0x1c5fc4, light: 0x6fb4ff },
  enemy: { main: 0xe8453c, dark: 0xb02c28, light: 0xff8a7a },
};
