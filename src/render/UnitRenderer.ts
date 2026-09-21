import { Container, Graphics, Sprite } from "pixi.js";
import { PALETTE, worldToTile } from "../config/world";
import { unitDef } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { GameState, PlayerId, Unit } from "../sim/types";
import { UNIT_FRAMES, unitTexture, USE_SPRITE_ASSETS } from "./Assets";
import { softShadowTexture } from "./softShadow";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: PALETTE.playerUnit,
  enemy: PALETTE.enemyUnit,
};

const OUTLINE = PALETTE.outline;
const SKIN = 0xf0c49a;
const SKIN_DARK = 0xd39b6e;
const STEEL = 0xc3ccd8;
const STEEL_DARK = 0x7c8794;
const LEATHER = 0x6b4a2a;
const WOOD = 0x8a5a2b;
const GOLD = 0xf2c14e;
const HORSE = 0x7a5230;
const HORSE_DARK = 0x54371d;

type AttackKind = "slash" | "thrust" | "shoot" | "tool" | "cavalry";
type HeadGear = "hood" | "helm" | "cap" | "crown" | "bare";

function shade(color: number, amount: number): number {
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number): number => Math.round(c + (target - c) * t);
  return (mix((color >> 16) & 0xff) << 16) | (mix((color >> 8) & 0xff) << 8) | mix(color & 0xff);
}

interface Rig {
  root: Container;
  body: Container;
  torso: Container;
  head: Container;
  armBack: Container;
  armFront: Container;
  legBack: Container;
  legFront: Container;
  horse?: { legBack: Container; legFront: Container; body: Container };
  walkSwing: number;
  armSwing: number;
  armSpread: number;
  stride: number;
  twoHanded: boolean;
  attackKind: AttackKind;
}

interface Anim {
  phase: number;
  move: number;
  attack: number;
  gather: number;
  facing: number;
  lastX: number;
  lastHp: number;
  hit: number;
  death: number;
  dust: number;
  fxActive: boolean;
}

interface Entry {
  container: Container;
  sprite?: Sprite;
  rig?: Rig;
  overlay: Graphics;
  fx: Graphics;
  selected: boolean;
  hpBucket: number;
  rallyOn: boolean;
  z: number;
  anim: Anim;
}

export class UnitRenderer {
  private readonly layer: Container;
  private readonly entries = new Map<string, Entry>();

  constructor(layer: Container) {
    this.layer = layer;
  }

  update(
    state: GameState,
    selectedIds: readonly string[],
    playerMap: VisibilityMap,
    nowSec: number,
    frameDt: number,
  ): void {
    const selected = new Set(selectedIds);
    const seen = new Set<string>();

    for (const id of ["player", "enemy"] as const) {
      for (const unit of state.players[id].units) {
        let entry = this.entries.get(unit.id);

        if (unit.state === "dead") {
          // brief death animation; the sim reaps dead units shortly after
          if (entry) {
            seen.add(unit.id);
            this.syncDeath(entry, frameDt);
          }
          continue;
        }

        const mode = id === "player" ? "sync" : this.enemyMode(playerMap, unit);
        if (mode === "hide") continue;
        seen.add(unit.id);

        if (!entry) {
          entry = this.createEntry(unit);
          this.entries.set(unit.id, entry);
        }
        if (mode === "sync") {
          entry.container.visible = true;
          entry.container.alpha = 1;
          this.sync(entry, unit, selected.has(unit.id), nowSec, frameDt);
        }
      }
    }

    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      entry.container.destroy({ children: true });
      this.entries.delete(id);
    }
  }

  private enemyMode(map: VisibilityMap, unit: Unit): "sync" | "freeze" | "hide" {
    const tile = worldToTile(unit.x, unit.y);
    if (isTileVisible(map, tile.x, tile.y)) return "sync";
    const entry = this.entries.get(unit.id);
    if (!entry) return "hide";
    if (isTileExplored(map, tile.x, tile.y)) {
      entry.container.visible = true;
      entry.container.alpha = 0.55;
      return "freeze";
    }
    entry.container.visible = false;
    return "hide";
  }

  private createEntry(unit: Unit): Entry {
    const container = new Container();
    const overlay = new Graphics();
    const fx = new Graphics();
    const texture = USE_SPRITE_ASSETS ? unitTexture(unit.type, unit.owner, 0) : undefined;

    let sprite: Sprite | undefined;
    let rig: Rig | undefined;

    if (texture) {
      const radius = unitDef(unit.type).radius;
      const shadow = new Sprite(softShadowTexture());
      shadow.anchor.set(0.5);
      shadow.width = radius * 2.6;
      shadow.height = radius * 1.2;
      shadow.y = radius * 0.9;
      container.addChild(shadow);
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 1);
      container.addChild(sprite);
    } else {
      rig = buildRig(unit);
      container.addChild(rig.root);
    }
    container.addChild(fx, overlay);
    this.layer.addChild(container);

    return {
      container,
      sprite,
      rig,
      overlay,
      fx,
      selected: false,
      hpBucket: -1,
      rallyOn: false,
      z: Number.NaN,
      anim: {
        phase: Math.random() * Math.PI * 2,
        move: 0,
        attack: 0,
        gather: 0,
        facing: 1,
        lastX: unit.x,
        lastHp: unit.hp,
        hit: 0,
        death: 0,
        dust: 0,
        fxActive: false,
      },
    };
  }

  private sync(entry: Entry, unit: Unit, selected: boolean, nowSec: number, frameDt: number): void {
    entry.container.position.set(unit.x, unit.y);
    if (entry.z !== unit.y) {
      entry.z = unit.y;
      entry.container.zIndex = unit.y;
    }

    const anim = entry.anim;
    const dx = unit.x - anim.lastX;
    if (Math.abs(dx) > 1.5) {
      anim.facing = dx > 0 ? 1 : -1;
      anim.lastX = unit.x;
    } else if (unit.state === "idle") {
      anim.lastX = unit.x;
    }

    if (unit.hp < anim.lastHp - 0.01) anim.hit = 1;
    anim.lastHp = unit.hp;

    const radius = unitDef(unit.type).radius;

    if (entry.sprite) {
      const moving = unit.state === "moving";
      const frame = moving ? Math.floor(nowSec * 9) % UNIT_FRAMES : 0;
      const texture = unitTexture(unit.type, unit.owner, frame) ?? entry.sprite.texture;
      entry.sprite.texture = texture;
      if (texture.height > 0) {
        const target = unit.type === "horse_rider" ? radius * 2.6 : radius * 3.6;
        const scale = target / texture.height;
        entry.sprite.scale.set(anim.facing * scale, scale);
      }
      entry.sprite.y = radius * 0.9;
    } else if (entry.rig) {
      this.animate(entry, unit, nowSec, frameDt);
    }

    const hpBucket = Math.ceil((unit.hp / unit.maxHp) * 10);
    const rallyOn = unit.rallyTimer > 0;
    if (entry.selected !== selected || entry.hpBucket !== hpBucket || entry.rallyOn !== rallyOn) {
      entry.selected = selected;
      entry.hpBucket = hpBucket;
      entry.rallyOn = rallyOn;
      redrawOverlay(entry.overlay, unit, selected, rallyOn);
    }
  }

  private syncDeath(entry: Entry, frameDt: number): void {
    const anim = entry.anim;
    anim.death = Math.min(1, anim.death + frameDt * 5);
    entry.container.alpha = 1 - anim.death;
    entry.container.rotation = anim.facing * anim.death * 1.2;
    entry.container.y += anim.death * 1.5;
    entry.overlay.clear();
    if (anim.fxActive) {
      entry.fx.clear();
      anim.fxActive = false;
    }
  }

  private animate(entry: Entry, unit: Unit, nowSec: number, frameDt: number): void {
    const rig = entry.rig;
    if (!rig) return;
    const anim = entry.anim;
    const r = unitDef(unit.type).radius;

    const moving = unit.state === "moving";
    const working = unit.state === "gathering" || unit.state === "repairing";
    const attacking = unit.state === "attacking";

    anim.move += ((moving ? 1 : 0) - anim.move) * Math.min(1, frameDt * 6 + 0.03);
    anim.gather += ((working ? 1 : 0) - anim.gather) * Math.min(1, frameDt * 5 + 0.03);

    const speedFactor = Math.max(0.7, Math.min(1.6, unitDef(unit.type).speed / 70));
    anim.phase += frameDt * rig.stride * speedFactor * (0.35 + anim.move);

    anim.attack = attacking
      ? Math.min(1, anim.attack + frameDt * 6)
      : Math.max(0, anim.attack - frameDt * 5);
    anim.hit = Math.max(0, anim.hit - frameDt * 4);
    anim.dust = Math.max(0, anim.dust - frameDt * 2.5);

    const sin = Math.sin(anim.phase);
    const cos = Math.cos(anim.phase);
    const swing = anim.move * sin;
    const bob = Math.abs(cos) * anim.move;

    // step dust: spawn near foot contact
    if (moving && Math.abs(cos) > 0.96 && unit.type !== "horse_rider") anim.dust = 1;

    const attackK = Math.sin(anim.attack * Math.PI);
    const lunge = attackK * (rig.attackKind === "thrust" || rig.attackKind === "cavalry" ? 4 : 2.5);

    rig.root.scale.set(anim.facing, 1);
    rig.body.x = lunge;
    rig.body.y = -bob * 0.95;
    rig.body.rotation = 0.05 * anim.move + attackK * 0.07;

    rig.legFront.rotation = rig.walkSwing * swing;
    rig.legBack.rotation = rig.walkSwing * -swing;

    // gather/tool motion for villagers
    const gatherK = Math.sin(nowSec * 6.5) * anim.gather;

    if (rig.twoHanded) {
      rig.armFront.rotation = 0.35 + rig.armSwing * 0.18 * swing;
      rig.armBack.rotation = 0.85 + rig.armSwing * 0.18 * -swing;
      if (rig.attackKind === "shoot") rig.armFront.rotation += attackK * 0.25;
    } else if (rig.attackKind === "thrust") {
      rig.armFront.rotation = rig.armSpread - 0.9 * attackK + rig.armSwing * -swing * 0.4;
      rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.5;
    } else if (rig.attackKind === "slash") {
      rig.armFront.rotation = rig.armSpread - 1.7 * attackK + rig.armSwing * -swing * 0.4;
      rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.5;
    } else if (rig.attackKind === "tool") {
      rig.armFront.rotation = rig.armSpread - 1.3 * attackK - gatherK * 1.1;
      rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.4;
    } else {
      rig.armFront.rotation = rig.armSpread + rig.armSwing * -swing;
      rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.7;
    }

    // secondary motion: torso squash + head follow-through
    const breathe = Math.sin(nowSec * 2.2) * 0.02;
    rig.torso.y = -bob * 0.25;
    rig.torso.scale.set(1 + breathe * 0.4 - bob * 0.02, 1 - breathe + bob * 0.035);
    rig.head.y = -bob * 0.15 - r * 0.02;
    rig.head.rotation = Math.sin(anim.phase - 0.5) * 0.07 * anim.move + attackK * 0.05;

    if (rig.horse) {
      const gallop = Math.sin(anim.phase * 1.7);
      rig.horse.legFront.rotation = 0.55 * gallop * (0.3 + anim.move * 0.9);
      rig.horse.legBack.rotation = 0.55 * -gallop * (0.3 + anim.move * 0.9);
      rig.horse.body.y = -Math.abs(gallop) * 1.6 * anim.move;
    }

    this.drawFx(entry, r, anim);
  }

  private drawFx(entry: Entry, r: number, anim: Anim): void {
    const active = anim.hit > 0.01 || anim.dust > 0.01;
    if (!active) {
      if (anim.fxActive) {
        entry.fx.clear();
        anim.fxActive = false;
      }
      return;
    }
    anim.fxActive = true;
    const g = entry.fx;
    g.clear();

    if (anim.dust > 0.01) {
      const dx = -anim.facing * r * 0.6;
      g.ellipse(dx, r * 1.15, r * 0.5 * (1.4 - anim.dust), r * 0.24 * (1.4 - anim.dust)).fill({
        color: 0xe6dcc0,
        alpha: 0.45 * anim.dust,
      });
    }
    if (anim.hit > 0.01) {
      const k = anim.hit;
      g.circle(0, -r * 0.6, r * (0.7 + (1 - k) * 0.9)).stroke({
        width: 2,
        color: 0xffffff,
        alpha: 0.7 * k,
      });
      g.poly([0, -r * 1.5, r * 0.28, -r * 0.9, -r * 0.28, -r * 0.9]).fill({
        color: 0xffffff,
        alpha: 0.75 * k,
      });
    }
  }
}

function limb(color: number, boot: number, length: number, width: number): Graphics {
  const g = new Graphics();
  g.roundRect(-width / 2, 0, width, length * 0.62, width * 0.45).fill(color);
  g.roundRect(-width / 2, 0, width, length * 0.62, width * 0.45).stroke({
    width: 1.8,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.roundRect(-width * 0.62, length * 0.58, width * 1.24, length * 0.42, width * 0.4).fill(boot);
  g.roundRect(-width * 0.62, length * 0.58, width * 1.24, length * 0.42, width * 0.4).stroke({
    width: 1.8,
    color: OUTLINE,
    alpha: 0.9,
  });
  return g;
}

function arm(color: number, skin: number, length: number, width: number): Graphics {
  const g = new Graphics();
  g.roundRect(-width / 2, 0, width, length * 0.7, width * 0.45).fill(color);
  g.roundRect(-width / 2, 0, width, length * 0.7, width * 0.45).stroke({
    width: 1.7,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.circle(0, length * 0.72, width * 0.62).fill(skin);
  g.circle(0, length * 0.72, width * 0.62).stroke({ width: 1.5, color: OUTLINE, alpha: 0.85 });
  return g;
}

function torsoGraphic(r: number, tunic: number, cape: number | undefined): Graphics {
  const g = new Graphics();
  const w = r * 1.08;
  const h = r * 0.98;
  if (cape !== undefined) {
    g.poly([-w * 0.6, -h * 0.1, w * 0.6, -h * 0.1, w * 0.36, h * 1.0, -w * 0.36, h * 1.0]).fill(cape);
    g.poly([-w * 0.6, -h * 0.1, w * 0.6, -h * 0.1, w * 0.36, h * 1.0, -w * 0.36, h * 1.0]).stroke({
      width: 1.8,
      color: OUTLINE,
      alpha: 0.85,
    });
  }
  g.roundRect(-w / 2, -h / 2, w, h, r * 0.42).fill(tunic);
  g.roundRect(-w / 2, -h / 2, w, h, r * 0.42).stroke({ width: 2.1, color: OUTLINE, alpha: 0.9 });
  g.roundRect(-w / 2, h * 0.16, w, h * 0.16, r * 0.1).fill(shade(tunic, -0.35));
  g.ellipse(-w * 0.22, -h * 0.2, w * 0.26, h * 0.22).fill({ color: shade(tunic, 0.3), alpha: 0.45 });
  return g;
}

function headGraphic(r: number, faction: number, gear: HeadGear): Graphics {
  const g = new Graphics();
  const hr = r * 0.62;
  g.roundRect(-hr * 0.34, hr * 0.35, hr * 0.68, hr * 1.15, hr * 0.22).fill(SKIN_DARK);
  g.roundRect(-hr * 0.34, hr * 0.35, hr * 0.68, hr * 1.15, hr * 0.22).stroke({
    width: 1.6,
    color: OUTLINE,
    alpha: 0.85,
  });
  g.circle(0, 0, hr).fill(SKIN);
  g.circle(0, 0, hr).stroke({ width: 2, color: OUTLINE, alpha: 0.9 });
  g.ellipse(-hr * 0.3, hr * 0.18, hr * 0.26, hr * 0.2).fill({ color: SKIN_DARK, alpha: 0.5 });

  const dome = (color: number): void => {
    g.moveTo(-hr * 1.02, -hr * 0.06)
      .arc(0, -hr * 0.06, hr * 1.02, Math.PI, 0, false)
      .lineTo(-hr * 1.02, -hr * 0.06)
      .fill(color)
      .stroke({ width: 1.9, color: OUTLINE, alpha: 0.9 });
  };

  if (gear === "hood") {
    dome(shade(faction, -0.34));
    g.moveTo(-hr * 1.02, -hr * 0.06).lineTo(hr * 1.02, -hr * 0.06).stroke({
      width: 1.6,
      color: OUTLINE,
      alpha: 0.6,
    });
  } else if (gear === "helm") {
    dome(STEEL);
    g.rect(-hr * 1.08, -hr * 0.16, hr * 2.16, hr * 0.2).fill(STEEL_DARK);
    g.rect(-hr * 0.1, -hr * 0.1, hr * 0.2, hr * 0.75).fill(STEEL_DARK);
    g.poly([-hr * 0.12, -hr * 1.1, hr * 0.12, -hr * 1.1, 0, -hr * 1.55]).fill(STEEL_DARK);
  } else if (gear === "cap") {
    dome(LEATHER);
    g.rect(-hr * 1.12, -hr * 0.18, hr * 2.24, hr * 0.18).fill(shade(LEATHER, -0.25));
    g.poly([hr * 0.55, -hr * 1.0, hr * 1.9, -hr * 1.8, hr * 1.05, -hr * 0.55]).fill(0xc792ea);
    g.poly([hr * 0.55, -hr * 1.0, hr * 1.9, -hr * 1.8, hr * 1.05, -hr * 0.55]).stroke({
      width: 1.2,
      color: OUTLINE,
      alpha: 0.7,
    });
  } else if (gear === "crown") {
    dome(shade(faction, -0.2));
    g.rect(-hr * 0.95, -hr * 1.2, hr * 1.9, hr * 0.36).fill(GOLD);
    g.rect(-hr * 0.95, -hr * 1.2, hr * 1.9, hr * 0.36).stroke({ width: 1.5, color: OUTLINE, alpha: 0.85 });
    for (const px of [-hr * 0.65, 0, hr * 0.65]) {
      g.poly([px - hr * 0.18, -hr * 1.2, px + hr * 0.18, -hr * 1.2, px, -hr * 1.72]).fill(GOLD);
    }
    g.circle(0, -hr * 1.02, hr * 0.14).fill(0x9b1c2e);
  } else {
    dome(0x6b4a2a);
  }

  g.circle(-hr * 0.34, hr * 0.12, hr * 0.13).fill(OUTLINE);
  g.circle(hr * 0.34, hr * 0.12, hr * 0.13).fill(OUTLINE);
  return g;
}

function headGear(type: Unit["type"]): HeadGear {
  switch (type) {
    case "villager":
      return "hood";
    case "crossbowman":
      return "cap";
    case "hero":
      return "crown";
    case "swordsman":
    case "spearman":
    case "horse_rider":
      return "helm";
    default:
      return "bare";
  }
}

function buildRig(unit: Unit): Rig {
  const r = unitDef(unit.type).radius;
  const faction = FACTION_COLORS[unit.owner];
  const type = unit.type;

  const root = new Container();
  const body = new Container();
  root.addChild(body);

  const shadow = new Graphics();
  shadow.ellipse(0, r * 1.05, r * 0.95, r * 0.36).fill({ color: 0x000000, alpha: 0.24 });
  root.addChildAt(shadow, 0);

  if (type === "horse_rider") return buildHorseRig(r, faction, root, body);

  const back = shade(faction, -0.4);
  const boot = 0x5a3d22;

  const legLength = r * 1.25;
  const legWidth = r * 0.44;
  const legBack = pivot(limb(back, boot, legLength, legWidth), -r * 0.3, r * 0.34);
  const legFront = pivot(limb(faction, boot, legLength, legWidth), r * 0.3, r * 0.34);

  const torso = new Container();
  torso.position.set(0, r * 0.02);
  torso.addChild(torsoGraphic(r, faction, type === "hero" ? shade(faction, -0.45) : undefined));

  const head = pivot(headGraphic(r, faction, headGear(type)), 0, -r * 1.3);

  const armLength = r * 1.08;
  const armWidth = r * 0.34;
  const armBack = pivot(arm(back, SKIN, armLength, armWidth), -r * 0.8, -r * 0.1);
  const armFront = pivot(arm(faction, SKIN, armLength, armWidth), r * 0.8, -r * 0.1);
  const weapon = buildWeapon(type);
  weapon.position.set(0, armLength * 0.72);
  armFront.addChild(weapon);

  body.addChild(legBack, armBack, torso, legFront, head, armFront);

  return {
    root,
    body,
    torso,
    head,
    armBack,
    armFront,
    legBack,
    legFront,
    walkSwing: type === "villager" ? 0.55 : 0.7,
    armSwing: 0.55,
    armSpread: 0.14,
    stride: type === "villager" ? 8 : 7.2,
    twoHanded: type === "crossbowman",
    attackKind: attackKindFor(type),
  };
}

function attackKindFor(type: Unit["type"]): AttackKind {
  switch (type) {
    case "swordsman":
    case "hero":
      return "slash";
    case "spearman":
      return "thrust";
    case "crossbowman":
      return "shoot";
    case "villager":
      return "tool";
    case "horse_rider":
      return "cavalry";
    default:
      return "slash";
  }
}

function buildHorseRig(r: number, faction: number, root: Container, body: Container): Rig {
  const horse = new Container();
  const horseBody = new Container();

  const g = new Graphics();
  g.roundRect(-r * 1.15, -r * 0.5, r * 2.3, r * 1.0, r * 0.42).fill(HORSE);
  g.roundRect(-r * 1.15, -r * 0.5, r * 2.3, r * 1.0, r * 0.42).stroke({
    width: 2.2,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.ellipse(-r * 0.35, -r * 0.2, r * 0.7, r * 0.28).fill({ color: shade(HORSE, 0.2), alpha: 0.5 });
  g.roundRect(r * 0.75, -r * 1.35, r * 0.5, r * 1.2, r * 0.2).fill(HORSE);
  g.roundRect(r * 0.75, -r * 1.35, r * 0.5, r * 1.2, r * 0.2).stroke({
    width: 2,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.ellipse(r * 1.35, -r * 1.4, r * 0.42, r * 0.3).fill(HORSE);
  g.ellipse(r * 1.35, -r * 1.4, r * 0.42, r * 0.3).stroke({ width: 1.8, color: OUTLINE, alpha: 0.9 });
  g.circle(r * 1.55, -r * 1.45, r * 0.08).fill(OUTLINE);
  g.poly([r * 0.85, -r * 1.5, r * 1.0, -r * 1.9, r * 1.12, -r * 1.48]).fill(HORSE_DARK);
  g.poly([-r * 1.15, -r * 0.3, -r * 0.85, -r * 0.35, -r * 1.6, r * 0.4]).fill(HORSE_DARK);
  horseBody.addChild(g);

  const legWidth = r * 0.3;
  const legLen = r * 1.05;
  const hl = (color: number): Graphics => {
    const lg = new Graphics();
    lg.roundRect(-legWidth / 2, 0, legWidth, legLen, legWidth * 0.4).fill(color);
    lg.roundRect(-legWidth / 2, 0, legWidth, legLen, legWidth * 0.4).stroke({
      width: 1.6,
      color: OUTLINE,
      alpha: 0.9,
    });
    lg.rect(-legWidth * 0.7, legLen - legWidth * 0.5, legWidth * 1.4, legWidth * 0.6).fill(0x2b2320);
    return lg;
  };
  const horseLegBack = pivot(hl(HORSE_DARK), -r * 0.62, r * 0.3);
  const horseLegFront = pivot(hl(HORSE), r * 0.55, r * 0.3);
  horse.addChild(horseLegBack, horseBody, horseLegFront);

  const rider = new Container();
  rider.position.set(-r * 0.05, -r * 0.92);
  rider.addChild(torsoGraphic(r * 0.9, faction, undefined));
  const riderHead = pivot(headGraphic(r * 0.9, faction, "helm"), 0, -r * 1.02);
  rider.addChild(riderHead);
  const riderArm = pivot(arm(faction, SKIN, r * 1.0, r * 0.3), r * 0.34, -r * 0.3);
  const lance = new Graphics();
  lance.roundRect(-r * 0.06, -r * 0.06, r * 2.6, r * 0.13, r * 0.06).fill(WOOD);
  lance.roundRect(-r * 0.06, -r * 0.06, r * 2.6, r * 0.13, r * 0.06).stroke({
    width: 1.3,
    color: OUTLINE,
    alpha: 0.85,
  });
  lance.poly([r * 2.54, -r * 0.2, r * 2.54, r * 0.24, r * 2.95, r * 0.02]).fill(STEEL);
  riderArm.addChild(lance);
  rider.addChild(riderArm);

  body.addChild(horse, rider);

  return {
    root,
    body,
    torso: rider,
    head: riderHead,
    armBack: riderArm,
    armFront: riderArm,
    legBack: horseLegBack,
    legFront: horseLegFront,
    horse: { legBack: horseLegBack, legFront: horseLegFront, body: horseBody },
    walkSwing: 0,
    armSwing: 0.1,
    armSpread: 0,
    stride: 10,
    twoHanded: true,
    attackKind: "cavalry",
  };
}

function pivot(child: Container, x: number, y: number): Container {
  const c = new Container();
  c.position.set(x, y);
  c.addChild(child);
  return c;
}

function buildWeapon(type: Unit["type"]): Container {
  const g = new Graphics();
  const holder = new Container();
  const r = 10;

  switch (type) {
    case "villager": {
      // short handle in the hand with a small sickle blade at the top
      g.roundRect(-1.3, -r * 0.55, 2.6, r * 0.6, 1.3).fill(WOOD);
      g.roundRect(-1.3, -r * 0.55, 2.6, r * 0.6, 1.3).stroke({ width: 1.2, color: OUTLINE, alpha: 0.8 });
      g.moveTo(1.3, -r * 0.5)
        .quadraticCurveTo(r * 1.0, -r * 1.05, 0.0, -r * 1.2)
        .stroke({ width: 2.4, color: STEEL });
      break;
    }
    case "swordsman": {
      g.roundRect(-1.5, -r * 0.15, 3, r * 0.55, 1.2).fill(LEATHER);
      g.rect(-4.2, -r * 0.35, 8.4, 2.4).fill(GOLD);
      g.roundRect(-1.6, -r * 1.85, 3.2, r * 1.5, 1.4).fill(STEEL);
      g.roundRect(-1.6, -r * 1.85, 3.2, r * 1.5, 1.4).stroke({ width: 1.3, color: OUTLINE, alpha: 0.85 });
      g.poly([-1.6, -r * 1.85, 1.6, -r * 1.85, 0, -r * 2.2]).fill(STEEL);
      break;
    }
    case "spearman": {
      g.roundRect(-1.2, -r * 2.7, 2.4, r * 3.1, 1.2).fill(WOOD);
      g.roundRect(-1.2, -r * 2.7, 2.4, r * 3.1, 1.2).stroke({ width: 1.2, color: OUTLINE, alpha: 0.8 });
      g.poly([-2.4, -r * 2.7, 2.4, -r * 2.7, 0, -r * 3.4]).fill(STEEL);
      break;
    }
    case "crossbowman": {
      g.roundRect(-r * 0.4, -1.6, r * 1.8, 3.2, 1.4).fill(WOOD);
      g.roundRect(-r * 0.4, -1.6, r * 1.8, 3.2, 1.4).stroke({ width: 1.2, color: OUTLINE, alpha: 0.85 });
      g.moveTo(r * 1.35, -3.6)
        .quadraticCurveTo(r * 1.75, 0, r * 1.35, 3.6)
        .stroke({ width: 2, color: STEEL_DARK });
      g.moveTo(r * 1.35, -3.6).lineTo(r * 0.95, 0).lineTo(r * 1.35, 3.6).stroke({
        width: 1.1,
        color: 0xf5f5f5,
        alpha: 0.6,
      });
      break;
    }
    case "hero": {
      g.roundRect(-1.6, -r * 0.15, 3.2, r * 0.55, 1.2).fill(LEATHER);
      g.rect(-4.6, -r * 0.38, 9.2, 2.8).fill(GOLD);
      g.roundRect(-1.7, -r * 2.0, 3.4, r * 1.65, 1.4).fill(0xf6f1d6);
      g.roundRect(-1.7, -r * 2.0, 3.4, r * 1.65, 1.4).stroke({ width: 1.3, color: OUTLINE, alpha: 0.85 });
      g.poly([-1.7, -r * 2.0, 1.7, -r * 2.0, 0, -r * 2.38]).fill(0xf6f1d6);
      break;
    }
    default:
      break;
  }
  holder.addChild(g);
  return holder;
}

function redrawOverlay(g: Graphics, unit: Unit, selected: boolean, rallyOn: boolean): void {
  g.clear();
  const definition = unitDef(unit.type);
  const radius = definition.radius;

  if (rallyOn) {
    g.circle(0, 0, radius + 9).stroke({ width: 2, color: 0xf2c14e, alpha: 0.85 });
  }

  if (selected) {
    g.circle(0, 0, radius + 6).stroke({ width: 2.5, color: 0x7ee081, alpha: 0.95 });
  }

  if (unit.type === "hero") {
    g.circle(0, 0, radius + 12).stroke({ width: 1.5, color: 0xf2c14e, alpha: 0.4 });
  }

  if (selected || unit.hp < unit.maxHp) {
    const barW = Math.max(24, radius * 2 + 6);
    const x = -barW / 2;
    const y = -radius - 12;
    const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
    g.roundRect(x, y, barW, 5, 2.5).fill({ color: 0x000000, alpha: 0.6 });
    g.roundRect(x, y, barW * ratio, 5, 2.5).fill({
      color: ratio > 0.55 ? 0x7ee081 : ratio > 0.25 ? 0xf2c14e : 0xef4444,
    });
  }
}
