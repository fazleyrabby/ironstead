import * as THREE from "three";
import { TILE_SIZE } from "../config/world";
import { unitDef, def } from "../sim/selectors";
import type { Building, GameState, PlayerId, Unit } from "../sim/types";

/** One voxel = 0.25 world units (TILE_SIZE is 32px; world coords /32 for tile space). */
export const VOXEL_SCALE = 0.25;

const geoCache = new Map<string, THREE.BoxGeometry>();
const matCache = new Map<number, THREE.MeshBasicMaterial>();

function geo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w}|${h}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

function mat(color: number): THREE.MeshBasicMaterial {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}

/** Player pieces read brighter, enemy pieces a touch darker/redder. */
function teamTint(color: number, owner: PlayerId): number {
  const c = new THREE.Color(color);
  if (owner === "enemy") c.lerp(new THREE.Color(0x6b2b2b), 0.28);
  else c.offsetHSL(0, 0.05, 0.06);
  return c.getHex();
}

/** Add one axis-aligned voxel block, centred at (cx,cy,cz) in world units. */
function block(
  group: THREE.Group,
  color: number,
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geo(w, h, d), mat(color));
  m.position.set(cx, cy, cz);
  group.add(m);
  return m;
}

const S = VOXEL_SCALE;

/** Per-type voxel silhouettes. Coordinates are in tile space, y=0 is ground. */
function buildBuildingModel(b: Building): THREE.Group {
  const d = def(b.type);
  const g = new THREE.Group();
  const body = teamTint(d.colors.body, b.owner);
  const roof = teamTint(d.colors.roof, b.owner);
  const accent = teamTint(d.colors.accent, b.owner);
  const cx = b.x / TILE_SIZE;
  const cz = b.y / TILE_SIZE;
  const w = d.tilesW * S;
  const dp = d.tilesH * S;

  const add = (color: number, bw: number, bh: number, bd: number, ox: number, oy: number, oz: number) =>
    block(g, color, bw, bh, bd, cx + ox, oy, cz + oz);

  switch (b.type) {
    case "town_center":
      add(body, w, S * 3, dp, 0, S * 1.5, 0);
      add(accent, w * 0.8, S, dp * 0.8, 0, S * 3.5, 0);
      add(roof, w * 0.55, S, dp * 0.55, 0, S * 4.5, 0);
      break;
    case "house":
      add(body, w, S * 2, dp, 0, S, 0);
      add(roof, w * 1.05, S, dp * 1.05, 0, S * 2.5, 0);
      break;
    case "farm":
      add(body, w, S * 0.6, dp, 0, S * 0.3, 0);
      // crop rows
      for (let i = -1; i <= 1; i += 1) add(accent, w * 0.2, S * 0.5, dp * 0.9, i * S, S * 0.75, 0);
      break;
    case "storage":
      add(body, w, S * 2, dp, 0, S, 0);
      add(roof, w * 1.05, S * 0.7, dp * 1.05, 0, S * 2.35, 0);
      add(accent, S * 0.7, S * 0.7, S * 0.7, w * 0.2, S * 0.35, -dp * 0.2);
      break;
    case "army_camp":
      add(body, w, S * 1.4, dp, 0, S * 0.7, 0);
      add(accent, w * 1.1, S * 0.5, S * 0.4, 0, S * 1.6, -dp * 0.5);
      add(accent, w * 1.1, S * 0.5, S * 0.4, 0, S * 1.6, dp * 0.5);
      break;
    case "academy":
      add(body, w, S * 2, dp, 0, S, 0);
      add(roof, w * 0.9, S, dp * 0.9, 0, S * 2.5, 0);
      break;
    case "tower":
      add(body, w * 0.8, S * 4, dp * 0.8, 0, S * 2, 0);
      add(accent, w, S * 0.5, dp, 0, S * 4.25, 0);
      add(roof, w * 0.7, S, dp * 0.7, 0, S * 5, 0);
      break;
    case "wall":
      add(body, w, S * 1.2, dp, 0, S * 0.6, 0);
      add(accent, w, S * 0.3, dp, 0, S * 1.35, 0);
      break;
    case "forest":
      add(body, S * 0.5, S * 2, S * 0.5, -w * 0.25, S, -dp * 0.2);
      add(body, S * 0.5, S * 2.2, S * 0.5, w * 0.25, S * 1.1, dp * 0.2);
      add(roof, w * 0.8, S * 1.6, dp * 0.8, 0, S * 3, 0);
      add(accent, w * 0.6, S * 1.4, dp * 0.6, 0, S * 4, 0);
      break;
    case "gold_vein":
      add(body, w * 0.9, S * 1.4, dp * 0.9, 0, S * 0.7, 0);
      add(accent, S * 0.5, S * 0.5, S * 0.5, -w * 0.15, S * 1.5, -dp * 0.15);
      add(accent, S * 0.4, S * 0.4, S * 0.4, w * 0.2, S * 1.45, dp * 0.1);
      break;
  }
  return g;
}

/** Per-type unit silhouettes: body, head, and a weapon/tool accent. */
function buildUnitModel(u: Unit): THREE.Group {
  const d = unitDef(u.type);
  const g = new THREE.Group();
  const body = teamTint(d.color, u.owner);
  const skin = 0xe6b98a;
  const metal = 0xcfd6e0;
  const cx = u.x / TILE_SIZE;
  const cz = u.y / TILE_SIZE;
  const bw = S * 1.2;

  const add = (color: number, sw: number, sh: number, sd: number, ox: number, oy: number, oz: number) =>
    block(g, color, sw, sh, sd, cx + ox, oy, cz + oz);

  switch (u.type) {
    case "villager":
      add(body, bw, S * 1.6, bw, 0, S * 0.8, 0);
      add(skin, S * 0.9, S * 0.9, S * 0.9, 0, S * 2.05, 0);
      add(0x8b5a2b, S * 0.35, S * 1.2, S * 0.35, S * 0.8, S * 1.2, 0);
      break;
    case "swordsman":
      add(body, bw, S * 1.7, bw, 0, S * 0.85, 0);
      add(metal, S * 1.1, S * 0.7, S * 1.1, 0, S * 2.1, 0);
      add(metal, S * 0.25, S * 1.6, S * 0.25, S * 0.85, S * 1.4, 0);
      break;
    case "spearman":
      add(body, bw, S * 1.7, bw, 0, S * 0.85, 0);
      add(skin, S * 0.9, S * 0.9, S * 0.9, 0, S * 2.15, 0);
      add(metal, S * 0.2, S * 2.6, S * 0.2, S * 0.85, S * 1.9, 0);
      break;
    case "crossbowman":
      add(body, bw, S * 1.6, bw, 0, S * 0.8, 0);
      add(skin, S * 0.9, S * 0.9, S * 0.9, 0, S * 2.05, 0);
      add(0x6b4f2a, S * 1.4, S * 0.3, S * 0.3, S * 0.7, S * 1.2, 0);
      break;
    case "horse_rider":
      add(body, S * 1.0, S * 1.3, S * 2.2, 0, S * 0.9, 0);
      add(body, S * 0.9, S * 0.6, S * 0.7, 0, S * 1.85, -S * 0.5);
      add(metal, S * 0.7, S * 0.7, S * 0.7, 0, S * 2.2, S * 0.4);
      add(metal, S * 0.15, S * 2.4, S * 0.15, S * 0.6, S * 1.6, S * 0.6);
      break;
    case "hero":
      add(body, bw, S * 1.8, bw, 0, S * 0.9, 0);
      add(skin, S * 0.95, S * 0.95, S * 0.95, 0, S * 2.2, 0);
      add(0xf2c14e, S * 1.0, S * 0.3, S * 1.0, 0, S * 2.8, 0);
      break;
  }
  return g;
}

export class VoxelAssets {
  static building(b: Building): THREE.Group {
    return buildBuildingModel(b);
  }
  static unit(u: Unit): THREE.Group {
    return buildUnitModel(u);
  }
}

/** Swap the entity meshes in one go from a GameState. Materials/geometries
 *  are cached, so we only detach the groups here (no disposal churn). */
export function syncEntities(group: THREE.Group, state: GameState): void {
  group.clear();
  for (const b of state.players.player.buildings) {
    if (b.state !== "destroyed") group.add(VoxelAssets.building(b));
  }
  for (const b of state.players.enemy.buildings) {
    if (b.state !== "destroyed") group.add(VoxelAssets.building(b));
  }
  for (const u of [...state.players.player.units, ...state.players.enemy.units]) {
    if (u.state !== "dead") group.add(VoxelAssets.unit(u));
  }
}

export const buildingModel = buildBuildingModel;
export const unitModel = buildUnitModel;

