import { Container, Graphics, Sprite } from "pixi.js";
import { worldToTile } from "../config/world";
import { unitDef } from "../sim/selectors";
import { isTileExplored, isTileVisible } from "../sim/visibility";
import type { VisibilityMap } from "../sim/visibility";
import type { GameState, PlayerId, Unit } from "../sim/types";
import { UNIT_FRAMES, unitTexture, USE_SPRITE_ASSETS, USE_V2_ASSET_PROTOTYPES } from "./Assets";
import { softShadowTexture } from "./softShadow";
import { STYLE } from "./style";
import { medievalCloth, medievalTorso, medievalHead, medievalShield as shieldGraphic } from "./MedievalCharacters";

const FACTION_COLORS: Record<PlayerId, number> = {
  player: 0x62889c,
  enemy: 0xac6d59,
};

const OUTLINE = 0x382e28;
const SKIN = STYLE.skin;
const STEEL = STYLE.steel;
const STEEL_DARK = STYLE.steelDark;
const LEATHER = STYLE.leather;
const WOOD = STYLE.wood;
const GOLD = STYLE.gold;
const HORSE = STYLE.horse;
const HORSE_DARK = STYLE.horseDark;

type AttackKind = "slash" | "thrust" | "shoot" | "tool" | "cavalry";

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
  headRestY: number;
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
  visualScale: number;
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
    const texture = USE_SPRITE_ASSETS || USE_V2_ASSET_PROTOTYPES
      ? unitTexture(unit.type, unit.owner, 0)
      : undefined;

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

    if (moving && Math.abs(cos) > 0.96 && unit.type !== "horse_rider") anim.dust = 1;
    if (anim.attack > 0.82 && anim.attack < 0.92) anim.dust = Math.max(anim.dust, 0.7);

    const prevFacing = anim.facing;
    const dx2 = unit.x - anim.lastX;
    if (Math.abs(dx2) > 1.5) {
      const newFace = dx2 > 0 ? 1 : -1;
      if (newFace !== prevFacing && moving) anim.dust = Math.max(anim.dust, 0.6);
    }

    const attackPhase = anim.attack * Math.PI;
    const windUp = Math.max(0, Math.sin(attackPhase * 0.7)) * (anim.attack < 0.4 ? 1 : 0);
    const attackK = Math.sin(attackPhase);
    const followThrough = Math.max(0, -Math.sin(attackPhase + 0.6)) * 0.3;
    const lunge = (attackK + followThrough) * (rig.attackKind === "thrust" || rig.attackKind === "cavalry" ? 4 : 2.5);

    rig.root.scale.set(anim.facing * rig.visualScale, rig.visualScale);
    rig.body.x = lunge;
    rig.body.y = -bob * 0.95;
    rig.body.rotation = 0.05 * anim.move + attackK * 0.07 - windUp * 0.12;

    const gatherK = Math.sin(nowSec * 6.5) * anim.gather;

    if (rig.horse) {
      const gallop = Math.sin(anim.phase * 1.7);
      rig.horse.legFront.rotation = 0.6 * gallop * (0.3 + anim.move * 0.9);
      rig.horse.legBack.rotation = 0.6 * -gallop * (0.3 + anim.move * 0.9);
      rig.horse.body.y = -Math.abs(gallop) * 1.8 * anim.move;
      rig.armFront.rotation = 0.15 + attackK * 1.0 - windUp * 0.4;
      rig.armBack.rotation = 0.45 - attackK * 0.3;
    } else {
      rig.legFront.rotation = rig.walkSwing * swing;
      rig.legBack.rotation = rig.walkSwing * -swing;

      if (rig.twoHanded) {
        rig.armFront.rotation = 0.35 + rig.armSwing * 0.18 * swing;
        rig.armBack.rotation = 0.85 + rig.armSwing * 0.18 * -swing;
        if (rig.attackKind === "shoot") rig.armFront.rotation += attackK * 0.25 - windUp * 0.3;
      } else if (rig.attackKind === "thrust") {
        rig.armFront.rotation = rig.armSpread - 0.9 * attackK + windUp * 0.5 + rig.armSwing * -swing * 0.4;
        rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.5;
      } else if (rig.attackKind === "slash") {
        rig.armFront.rotation = rig.armSpread - 1.7 * attackK + windUp * 0.6 + rig.armSwing * -swing * 0.4;
        rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.5;
      } else if (rig.attackKind === "tool") {
        rig.armFront.rotation = rig.armSpread - 1.3 * attackK - gatherK * 1.1 + windUp * 0.4;
        rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.4;
      } else {
        rig.armFront.rotation = rig.armSpread + rig.armSwing * -swing;
        rig.armBack.rotation = -rig.armSpread + rig.armSwing * swing * 0.7;
      }
    }

    const idle = 1 - anim.move;
    const breathe = Math.sin(nowSec * 2.2) * (0.02 + idle * 0.025);
    rig.torso.y = -bob * 0.25;
    rig.torso.scale.set(1 + breathe * 0.5 - bob * 0.025, 1 - breathe * 1.2 + bob * 0.04);
    rig.head.y = rig.headRestY - bob * 0.15 - r * 0.02 + idle * Math.sin(nowSec * 1.6) * 0.3;
    rig.head.rotation = Math.sin(anim.phase - 0.5) * 0.07 * anim.move + attackK * 0.05 + idle * Math.sin(nowSec * 1.8) * 0.035;

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
        color: STYLE.dust,
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
  g.poly([-width*.5,0,width*.5,0,width*.38,length*.68,-width*.36,length*.68])
    .fill(color).stroke({width:.75,color:OUTLINE});
  g.moveTo(-width*.18,length*.1).lineTo(-width*.07,length*.55)
    .stroke({width:.45,color:shade(color,-.32)});
  g.poly([-width*.42,length*.6,width*.42,length*.6,width*.4,length*.86,
    width*.7,length*.94,width*.65,length,-width*.43,length])
    .fill(boot).stroke({width:.75,color:OUTLINE});
  g.moveTo(-width*.35,length*.67).lineTo(width*.34,length*.67)
    .stroke({width:.55,color:0x9b8059});
  for (const t of [.75,.84]) {
    g.moveTo(-width*.15,length*t).lineTo(width*.17,length*(t+.035))
      .stroke({width:.4,color:0xb19b72});
  }
  return g;
}

function arm(color: number, skin: number, length: number, width: number): Graphics {
  const g = new Graphics();
  // The sleeve extends above the shoulder pivot and into the coat. An open
  // shoulder contour avoids the detached, outlined capsule of the old rig.
  const sleeve = [-width*.66,-length*.16, width*.64,-length*.16,
    width*.57,length*.27, width*.42,length*.64,
    -width*.43,length*.64, -width*.57,length*.27];
  g.poly(sleeve).fill(color);
  g.moveTo(width*.64,-length*.12).lineTo(width*.57,length*.27)
    .lineTo(width*.42,length*.64).lineTo(-width*.43,length*.64)
    .lineTo(-width*.57,length*.27)
    .stroke({width:.65,color:OUTLINE,alpha:.8});
  g.moveTo(-width*.2,length*.17).lineTo(width*.19,length*.32)
    .lineTo(-width*.14,length*.4)
    .stroke({width:.4,color:shade(color,-.25),alpha:.65});
  // A short mitten shares its wrist with the cuff instead of floating below it.
  g.poly([-width*.38,length*.6,width*.38,length*.6,
    width*.63,length*.75,width*.36,length*.86,-width*.5,length*.82])
    .fill(skin).stroke({width:.55,color:OUTLINE,alpha:.85});
  g.poly([-width*.44,length*.55,width*.44,length*.55,
    width*.42,length*.65,-width*.43,length*.65])
    .fill(shade(color,-.16));
  g.moveTo(-width*.4,length*.59).lineTo(width*.4,length*.59)
    .stroke({width:.4,color:0xc8b88f,alpha:.8});
  return g;
}

// Draw the fingers after the held tool, so the shaft visibly passes through
// the palm instead of hiding it. This shares the sleeve's animated arm pivot.
function handGrip(length: number, width: number): Graphics {
  const g = new Graphics();
  g.poly([-width*.51,length*.68,width*.38,length*.68,
    width*.61,length*.73,width*.48,length*.82,-width*.37,length*.82,
    -width*.58,length*.76])
    .fill(SKIN).stroke({width:.5,color:OUTLINE});
  g.moveTo(width*.12,length*.72).lineTo(width*.48,length*.74)
    .stroke({width:.4,color:0xb18a60});
  return g;
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
  const boot = STYLE.boot;

  const legLength = r * 1.4;
  const legWidth = r * 0.44;
  const legBack = pivot(limb(back, boot, legLength, legWidth), -r * 0.3, r * 0.34);
  const legFront = pivot(limb(faction, boot, legLength, legWidth), r * 0.3, r * 0.34);

  const torso = new Container();
  torso.position.set(0, r * 0.02);
  torso.addChild(medievalTorso(r, faction, type));

  const head = pivot(medievalHead(r, faction, type), 0, -r * 1.05);

  const sleeveColor = medievalCloth(faction, type);
  const armLength = r * 1.1;
  const armWidth = r * 0.4;
  const armBack = pivot(arm(shade(sleeveColor, -0.12), SKIN, armLength, armWidth), -r * 0.48, -r * 0.36);
  const armFront = pivot(arm(sleeveColor, SKIN, armLength, armWidth), r * 0.48, -r * 0.36);
  const weapon = buildWeapon(type);
  weapon.position.set(0, armLength * 0.72);
  armFront.addChild(weapon, handGrip(armLength, armWidth));

  if (type === "swordsman") {
    const shield = shieldGraphic(r, "kite", faction);
    shield.position.set(0, armLength * 0.35);
    armBack.addChild(shield);
  } else if (type === "spearman") {
    const shield = shieldGraphic(r, "round", faction);
    shield.position.set(0, armLength * 0.35);
    armBack.addChild(shield);
  } else if (type === "crossbowman") {
    const quiver = new Graphics();
    quiver.roundRect(-r * 0.18, -r * 0.45, r * 0.36, r * 1.05, r * 0.12).fill(LEATHER);
    quiver.roundRect(-r * 0.18, -r * 0.45, r * 0.36, r * 1.05, r * 0.12).stroke({ width: 0.81, color: OUTLINE, alpha: 0.85 });
    for (const x of [-0.11, 0, 0.11]) {
      quiver.moveTo(r * x, -r * 0.52).lineTo(r * x, -r * 1.0).stroke({ width: 0.74, color: STYLE.woodLight });
      quiver.poly([r * x - 1.8, -r * 0.95, r * x + 1.8, -r * 0.95, r * x, -r * 1.12]).fill(STYLE.steel);
    }
    quiver.rotation = -0.28;
    quiver.position.set(-r * 0.25, armLength * 0.15);
    armBack.addChild(quiver);
  }

  // Shoulder pivots inherit the coat's breathing/bob, so they cannot drift away.
  torso.addChildAt(armBack, 0);
  torso.addChild(armFront);
  body.addChild(legBack, legFront, torso, head);

  return {
    root,
    body,
    torso,
    head,
    headRestY: head.y,
    armBack,
    armFront,
    legBack,
    legFront,
    walkSwing: type === "villager" ? 0.55 : 0.7,
    armSwing: 0.55,
    armSpread: -0.18,
    stride: type === "villager" ? 8 : 7.2,
    twoHanded: type === "crossbowman",
    attackKind: attackKindFor(type),
    visualScale: type === "hero" ? 1.22 : type === "villager" ? 1.1 : 1.16,
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
  const hr = r * 1.15;

  const g = new Graphics();
  g.roundRect(-hr, -r * 0.55, hr * 2, r * 1.1, r * 0.45).fill(HORSE);
  g.roundRect(-hr, -r * 0.55, hr * 2, r * 1.1, r * 0.45).stroke({
    width: 1.36,
    color: OUTLINE,
    alpha: 0.9,
  });
  g.ellipse(-r * 0.3, -r * 0.25, r * 0.75, r * 0.32).fill({ color: shade(HORSE, 0.2), alpha: 0.45 });
  g.ellipse(r * 0.3, r * 0.1, r * 0.6, r * 0.25).fill({ color: HORSE_DARK, alpha: 0.3 });
  g.roundRect(-hr * 0.3, -r * 0.42, hr * 0.65, r * 0.32, r * 0.1).fill(faction);
  g.roundRect(-hr * 0.3, -r * 0.42, hr * 0.65, r * 0.32, r * 0.1).stroke({ width: 0.74, color: OUTLINE, alpha: 0.7 });
  g.moveTo(-r * 0.48, -r * 0.25).lineTo(r * 0.52, -r * 0.25)
    .stroke({ width: 0.87, color: LEATHER, alpha: 0.9 });
  g.circle(r * 0.1, -r * 0.25, r * 0.08).fill(STYLE.goldDark);
  g.roundRect(r * 0.75, -r * 1.45, r * 0.55, r * 1.3, r * 0.22).fill(HORSE);
  g.roundRect(r * 0.75, -r * 1.45, r * 0.55, r * 1.3, r * 0.22).stroke({
    width: 1.24,
    color: OUTLINE,
    alpha: 0.9,
  });
  for (let i = 0; i < 5; i += 1) {
    const mx = r * 0.78 + i * r * 0.08;
    const my = -r * 1.5 - i * r * 0.04;
    g.moveTo(mx, my).lineTo(mx - r * 0.15, my + r * 0.35).stroke({ width: 1.12, color: HORSE_DARK, alpha: 0.7 });
  }
  g.ellipse(r * 1.45, -r * 1.5, r * 0.45, r * 0.32).fill(HORSE);
  g.ellipse(r * 1.45, -r * 1.5, r * 0.45, r * 0.32).stroke({ width: 1.12, color: OUTLINE, alpha: 0.9 });
  g.ellipse(r * 1.6, -r * 1.48, r * 0.14, r * 0.1).fill({ color: shade(HORSE, 0.2), alpha: 0.5 });
  g.circle(r * 1.65, -r * 1.55, r * 0.09).fill(OUTLINE);
  g.circle(r * 1.62, -r * 1.58, r * 0.03).fill({ color: 0xffffff, alpha: 0.6 });
  g.moveTo(r * 1.2, -r * 1.34)
    .quadraticCurveTo(r * 1.65, -r * 0.62, r * 0.55, -r * 0.18)
    .stroke({ width: 0.74, color: LEATHER, alpha: 0.9 });
  g.poly([r * 0.9, -r * 1.6, r * 1.05, -r * 2.0, r * 1.18, -r * 1.58]).fill(HORSE_DARK);
  g.poly([-hr, -r * 0.35, -hr + r * 0.3, -r * 0.4, -hr - r * 0.5, r * 0.45]).fill(HORSE_DARK);
  g.poly([-hr - r * 0.3, r * 0.2, -hr - r * 0.55, r * 0.5, -hr - r * 0.15, r * 0.5]).fill({ color: HORSE_DARK, alpha: 0.7 });
  g.poly([-r * .85,-r * .35,r * .4,-r * .35,r * .55,r * .65,-r * .72,r * .72])
    .fill(faction).stroke({width:.8,color:OUTLINE});
  g.moveTo(-r*.7,-r*.22).lineTo(-r*.58,r*.58).lineTo(r*.39,r*.52).lineTo(r*.29,-r*.22)
    .stroke({width:.65,color:0xc0a367});
  for(let i=0;i<5;i++) {
    const x=r*(-.53+i*.18);
    g.poly([x,r*.34,x+r*.055,r*.43,x,r*.52,x-r*.055,r*.43]).fill(0xc0a367);
  }
  g.moveTo(r*.03,-r*.24).lineTo(r*.03,r*.57).stroke({width:1.1,color:LEATHER});
  g.ellipse(r*.03,r*.64,r*.13,r*.12).stroke({width:.8,color:STEEL});
  horseBody.addChild(g);

  const legWidth = r * 0.32;
  const legLen = r * 1.1;
  const hl = (color: number): Graphics => {
    const lg = new Graphics();
    lg.roundRect(-legWidth / 2, 0, legWidth, legLen, legWidth * 0.4).fill(color);
    lg.roundRect(-legWidth / 2, 0, legWidth, legLen, legWidth * 0.4).stroke({
      width: 0.99,
      color: OUTLINE,
      alpha: 0.9,
    });
    lg.rect(-legWidth * 0.7, legLen - legWidth * 0.5, legWidth * 1.4, legWidth * 0.6).fill(0x2b2320);
    return lg;
  };
  const horseLegBack = pivot(hl(HORSE_DARK), -r * 0.65, r * 0.35);
  const horseLegFront = pivot(hl(HORSE), r * 0.6, r * 0.35);
  horse.addChild(horseLegBack, horseBody, horseLegFront);

  const rider = new Container();
  rider.position.set(-r * 0.06, -r * 1.1);

  const backArm = pivot(arm(shade(faction, -0.35), SKIN, r * 1.15, r * 0.34), -r * 0.4, -r * 0.28);
  const torsoHolder = new Container();
  torsoHolder.addChild(medievalTorso(r * 1.2, faction, "horse_rider"));
  const riderHead = pivot(medievalHead(r * 1.2, faction, "horse_rider"), 0, -r * 1.0);
  const frontArm = pivot(arm(faction, SKIN, r * 1.15, r * 0.36), r * 0.44, -r * 0.26);

  const lance = new Graphics();
  lance.roundRect(0, -r * 0.08, r * 2.8, r * 0.16, r * 0.06).fill(WOOD);
  lance.roundRect(0, -r * 0.08, r * 2.8, r * 0.16, r * 0.06).stroke({
    width: 0.81,
    color: OUTLINE,
    alpha: 0.85,
  });
  lance.roundRect(r * 0.4, -r * 0.12, r * 0.3, r * 0.24, r * 0.04).fill(faction);
  lance.poly([r * 2.72, -r * 0.24, r * 2.72, r * 0.28, r * 3.15, r * 0.02]).fill(STEEL);
  lance.poly([r * 2.72, -r * 0.24, r * 2.72, r * 0.28, r * 3.15, r * 0.02]).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
  lance.position.set(0, r * 0.82);
  frontArm.addChild(lance, handGrip(r * 1.15, r * .36));

  torsoHolder.addChildAt(backArm, 0);
  torsoHolder.addChild(frontArm);
  rider.addChild(torsoHolder, riderHead);
  body.addChild(horse, rider);

  return {
    root,
    body,
    torso: torsoHolder,
    head: riderHead,
    headRestY: riderHead.y,
    armBack: backArm,
    armFront: frontArm,
    legBack: horseLegBack,
    legFront: horseLegFront,
    horse: { legBack: horseLegBack, legFront: horseLegFront, body: horseBody },
    walkSwing: 0,
    armSwing: 0.1,
    armSpread: 0,
    stride: 10,
    twoHanded: false,
    attackKind: "cavalry",
    visualScale: 1.08,
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
      g.roundRect(-1.3, -r * 0.55, 2.6, r * 0.6, 1.3).fill(WOOD);
      g.roundRect(-1.3, -r * 0.55, 2.6, r * 0.6, 1.3).stroke({ width: 0.74, color: OUTLINE, alpha: 0.8 });
      g.moveTo(1.3, -r * 0.5)
        .quadraticCurveTo(r * 1.0, -r * 1.05, 0.0, -r * 1.2)
        .stroke({ width: 2.4, color: STEEL });
      g.moveTo(0.8, -r * 0.5)
        .quadraticCurveTo(r * 0.8, -r * 0.85, 0.0, -r * 1.0)
        .stroke({ width: 0.74, color: shade(STEEL, 0.3), alpha: 0.5 });
      break;
    }
    case "swordsman": {
      g.roundRect(-1.5, -r * 0.15, 3, r * 0.55, 1.2).fill(LEATHER);
      g.roundRect(-1.5, -r * 0.15, 3, r * 0.55, 1.2).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
      g.rect(-4.8, -r * 0.38, 9.6, 2.8).fill(GOLD);
      g.rect(-4.8, -r * 0.38, 9.6, 1.2).fill({ color: shade(GOLD, 0.3), alpha: 0.5 });
      g.rect(-4.8, -r * 0.38, 9.6, 2.8).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
      g.roundRect(-1.8, -r * 1.95, 3.6, r * 1.6, 1.4).fill(STEEL);
      g.roundRect(-1.8, -r * 1.95, 3.6, r * 1.6, 1.4).stroke({ width: 0.87, color: OUTLINE, alpha: 0.85 });
      g.rect(-0.5, -r * 1.9, 1.0, r * 1.5).fill({ color: shade(STEEL, 0.3), alpha: 0.35 });
      g.poly([-1.8, -r * 1.95, 1.8, -r * 1.95, 0, -r * 2.35]).fill(STEEL);
      g.poly([-1.8, -r * 1.95, 1.8, -r * 1.95, 0, -r * 2.35]).stroke({ width: 0.74, color: OUTLINE, alpha: 0.8 });
      break;
    }
    case "spearman": {
      g.roundRect(-1.3, -r * 2.8, 2.6, r * 3.2, 1.2).fill(WOOD);
      g.roundRect(-1.3, -r * 2.8, 2.6, r * 3.2, 1.2).stroke({ width: 0.74, color: OUTLINE, alpha: 0.8 });
      g.rect(-0.4, -r * 2.0, 0.8, r * 2.0).fill({ color: shade(WOOD, 0.15), alpha: 0.3 });
      g.poly([-3, -r * 2.8, 3, -r * 2.8, 0, -r * 3.55]).fill(STEEL);
      g.poly([-3, -r * 2.8, 3, -r * 2.8, 0, -r * 3.55]).stroke({ width: 0.74, color: OUTLINE, alpha: 0.8 });
      g.rect(-0.3, -r * 3.5, 0.6, r * 0.8).fill({ color: shade(STEEL, 0.3), alpha: 0.4 });
      break;
    }
    case "crossbowman": {
      g.roundRect(-r * 0.4, -1.8, r * 1.9, 3.6, 1.4).fill(WOOD);
      g.roundRect(-r * 0.4, -1.8, r * 1.9, 3.6, 1.4).stroke({ width: 0.74, color: OUTLINE, alpha: 0.85 });
      g.rect(-r * 0.2, -0.6, r * 1.2, 1.2).fill({ color: shade(WOOD, 0.15), alpha: 0.3 });
      g.moveTo(r * 1.45, -4.0)
        .quadraticCurveTo(r * 1.9, 0, r * 1.45, 4.0)
        .stroke({ width: 1.36, color: STEEL_DARK });
      g.moveTo(r * 1.45, -4.0).lineTo(r * 1.0, 0).lineTo(r * 1.45, 4.0).stroke({
        width: 1.1,
        color: 0xf5f5f5,
        alpha: 0.6,
      });
      g.rect(r * 0.5, -r * 0.35, r * 0.3, r * 0.7).fill(STEEL_DARK);
      break;
    }
    case "hero": {
      g.roundRect(-1.6, -r * 0.15, 3.2, r * 0.55, 1.2).fill(LEATHER);
      g.rect(-5.2, -r * 0.42, 10.4, 3.2).fill(GOLD);
      g.rect(-5.2, -r * 0.42, 10.4, 1.4).fill({ color: shade(GOLD, 0.3), alpha: 0.5 });
      g.rect(-5.2, -r * 0.42, 10.4, 3.2).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
      g.circle(-4.5, -r * 0.26, 1.4).fill(0x9b1c2e);
      g.circle(4.5, -r * 0.26, 1.4).fill(0x9b1c2e);
      g.roundRect(-2.0, -r * 2.15, 4.0, r * 1.75, 1.4).fill(0xf6f1d6);
      g.roundRect(-2.0, -r * 2.15, 4.0, r * 1.75, 1.4).stroke({ width: 0.87, color: OUTLINE, alpha: 0.85 });
      g.rect(-0.5, -r * 2.1, 1.0, r * 1.65).fill({ color: 0xffffff, alpha: 0.2 });
      g.poly([-2.0, -r * 2.15, 2.0, -r * 2.15, 0, -r * 2.55]).fill(0xf6f1d6);
      g.poly([-2.0, -r * 2.15, 2.0, -r * 2.15, 0, -r * 2.55]).stroke({ width: 0.74, color: OUTLINE, alpha: 0.8 });
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
