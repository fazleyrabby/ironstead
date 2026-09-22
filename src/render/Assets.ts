import { Assets, Texture } from "pixi.js";
import type { BuildingType, PlayerId, UnitType } from "../sim/types";

const BASE = import.meta.env.BASE_URL;
const FACTIONS = ["blue", "red"] as const;
export type SpriteFaction = (typeof FACTIONS)[number];
export const UNIT_FRAMES = 6;

// Blender sprite pipeline is wired up but parked: flip to true to render the
// game with the exported sprites instead of the procedural Graphics art.
export const USE_SPRITE_ASSETS: boolean = false;
// Gradually replaces procedural art with the new authored pixel-art set.
// Only assets present in /assets/v2 are used; every other entity keeps its
// procedural renderer until a matching v2 sprite is approved.
// Keep prototypes opt-in until a complete set passes in-game scale, camera,
// outline, and animation consistency checks. Mixing them with procedural art
// makes the world visually incoherent.
export const USE_V2_ASSET_PROTOTYPES: boolean = false;

const BUILDING_FILE: Record<BuildingType, (faction: SpriteFaction) => string> = {
  town_center: (f) => `tc_${f}`,
  house: (f) => `house_${f}`,
  farm: () => "farm",
  storage: (f) => `storage_${f}`,
  army_camp: (f) => `army_camp_${f}`,
  tower: (f) => `tower_${f}`,
  wall: () => "wall",
  academy: (f) => `academy_${f}`,
  forest: () => "forest",
  gold_vein: () => "gold_vein",
};

const UNIT_TYPES: UnitType[] = [
  "villager",
  "swordsman",
  "spearman",
  "crossbowman",
  "horse_rider",
  "hero",
];

const buildingTextures = new Map<string, Texture>();
const unitTextures = new Map<string, Texture[]>();

export function factionOf(owner: PlayerId): SpriteFaction {
  return owner === "player" ? "blue" : "red";
}

async function loadTexture(url: string): Promise<Texture | undefined> {
  try {
    return await Assets.load<Texture>(url);
  } catch (error) {
    console.warn("[rts] sprite missing, using procedural art:", url, error);
    return undefined;
  }
}

export async function loadGameAssets(): Promise<void> {
  const jobs: Array<Promise<void>> = [];

  if (USE_V2_ASSET_PROTOTYPES) {
    jobs.push(
      loadTexture(`${BASE}assets/v2/buildings/tc_blue.png`).then((texture) => {
        if (texture) buildingTextures.set("town_center_blue", texture);
      }),
      loadTexture(`${BASE}assets/v2/buildings/house_blue.png`).then((texture) => {
        if (texture) buildingTextures.set("house_blue", texture);
      }),
      loadTexture(`${BASE}assets/v2/units/swordsman_blue_idle.png`).then((texture) => {
        if (texture) unitTextures.set("swordsman_blue", Array(UNIT_FRAMES).fill(texture));
      }),
      loadTexture(`${BASE}assets/v2/units/villager_blue_idle.png`).then((texture) => {
        if (texture) unitTextures.set("villager_blue", Array(UNIT_FRAMES).fill(texture));
      }),
    );
  }

  if (USE_SPRITE_ASSETS) {
    for (const type of Object.keys(BUILDING_FILE) as BuildingType[]) {
      for (const faction of FACTIONS) {
        const url = `${BASE}assets/buildings/${BUILDING_FILE[type](faction)}.png`;
        jobs.push(
          loadTexture(url).then((texture) => {
            if (texture) buildingTextures.set(`${type}_${faction}`, texture);
          }),
        );
      }
    }

    for (const type of UNIT_TYPES) {
      for (const faction of FACTIONS) {
        const frameJobs: Array<Promise<Texture | undefined>> = [];
        for (let i = 0; i < UNIT_FRAMES; i += 1) {
          frameJobs.push(loadTexture(`${BASE}assets/units/${type}_${faction}_${i}.png`));
        }
        jobs.push(
          Promise.all(frameJobs).then((frames) => {
            const valid = frames.filter((f): f is Texture => f !== undefined);
            if (valid.length === UNIT_FRAMES) unitTextures.set(`${type}_${faction}`, valid);
          }),
        );
      }
    }
  }

  await Promise.all(jobs);
}

export function buildingTexture(type: BuildingType, owner: PlayerId): Texture | undefined {
  return buildingTextures.get(`${type}_${factionOf(owner)}`);
}

export function unitTexture(
  type: UnitType,
  owner: PlayerId,
  frame: number,
): Texture | undefined {
  const frames = unitTextures.get(`${type}_${factionOf(owner)}`);
  if (!frames) return undefined;
  return frames[((frame % UNIT_FRAMES) + UNIT_FRAMES) % UNIT_FRAMES];
}
