import { Graphics } from "pixi.js";
import type { UnitType } from "../sim/types";

const INK = 0x382d24;
const GOLD = 0xc0a367;
const LINEN = 0xd8c9a1;
const MAIL = 0x858a80;
const LEATHER = 0x796044;

// Each part is drawn at the rig's radius, so equipment follows its existing
// walk/attack pivots. Fine material marks are created once, never per frame.
function pen(r: number) {
  const g = new Graphics();
  const poly = (p: number[], color: number, width = 0.07) => {
    g.poly(p.map(n => n * r)).fill(color);
    if (width) g.stroke({ color: INK, width: r * width });
  };
  const line = (p: number[], color = INK, width = 0.05) => {
    g.moveTo(p[0] * r, p[1] * r);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * r, p[i + 1] * r);
    g.stroke({ color, width: r * width });
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: number, width = 0.05) => {
    g.ellipse(x * r, y * r, rx * r, ry * r).fill(color);
    if (width) g.stroke({ color: INK, width: r * width });
  };
  const mail = (x: number, y: number, w: number, h: number) => {
    for (let row = 0; row < h / 0.12; row++) {
      for (let col = 0; col < w / 0.13; col++) {
        const xx = x + col * 0.13 + (row % 2) * 0.04;
        const yy = y + row * 0.12;
        line([xx, yy, xx + 0.045, yy + 0.05, xx + 0.09, yy], 0x444c47, 0.024);
      }
    }
  };
  return { g, poly, line, oval, mail };
}

export function medievalCloth(faction: number, role: UnitType): number {
  return role === "villager" ? 0xa38d60 : role === "crossbowman" ? 0x69755a : faction;
}

export function medievalTorso(r: number, faction: number, role: UnitType): Graphics {
  const { g, poly, line, oval, mail } = pen(r);
  const noble = role === "hero";
  const armored = noble || role === "swordsman" || role === "horse_rider";
  const cloth = medievalCloth(faction, role);
  if (noble || role === "horse_rider") {
    poly([-.57,-.5,.6,-.5,.84,.94,.48,1.16,-.7,1.03,-.85,.78], noble ? 0x775446 : 0x4c6265);
    for (const x of [-.64,-.43,.43,.64]) line([x,-.23,x * 1.05,.83], 0xb1946c, .035);
    line([-.73,.88,-.42,1.03,.46,1.06,.76,.89], GOLD, .055);
  }
  // Flared coat over trousers; broad color patches survive normal RTS zoom.
  poly([-.47,-.54,.46,-.54,.51,.13,.65,.83,.18,.96,0,.76,-.18,.96,-.62,.8,-.49,.1], cloth);
  poly([.26,-.45,.45,-.48,.48,.18,.6,.77,.34,.83], 0x4b5146, 0);
  if (armored) {
    poly([-.46,-.43,.45,-.43,.48,.26,.34,.62,-.36,.62,-.49,.23], MAIL);
    mail(-.38,-.32,.71,.87);
    // Split embroidered surcoat leaves chainmail visible at the sides.
    poly([-.25,-.49,.25,-.49,.25,.17,.39,.78,.1,.89,0,.69,-.1,.89,-.39,.78,-.25,.17], faction);
    line([-.21,-.4,-.21,.18,-.33,.74,-.13,.81,0,.61,.13,.81,.33,.74,.21,.18,.21,-.4], GOLD, .045);
    if (noble) {
      for (let row = 0; row < 3; row++) {
        const y = -.32 + row * .16;
        poly([-.23,y,0,y+.04,.23,y,.23,y+.12,0,y+.17,-.23,y+.12], 0xb39a60, .03);
      }
    }
  } else {
    // Quilted gambeson / worker's wrap, with a folded collar.
    for (let x = -.35; x < .4; x += .15) line([x,-.33,x+.03,.14,x*1.3,.71], 0x514b36,.027);
    poly([-.44,-.5,-.1,-.54,.06,-.24,-.09,.16,-.32,-.1], LINEN,.035);
    if (role === "villager") {
      poly([-.24,.16,.24,.16,.35,.79,-.33,.79],0xc8b88f,.045);
      line([-.19,.23,-.19,.65,.23,.65],0x998661,.035);
    }
  }
  poly([-.5,.07,.5,.07,.5,.2,-.5,.2],LEATHER,.045);
  poly([-.08,.065,.1,.065,.1,.22,-.08,.22],GOLD,.035);
  poly([-.035,.1,.055,.1,.055,.18,-.035,.18],INK,0);
  // Sword belt / satchel strap lies diagonally over the layered tunic.
  line([-.38,-.46,.37,.24], LEATHER,.105);
  line([-.38,-.46,.37,.24], GOLD,.022);
  poly([.34,.2,.57,.21,.56,.5,.32,.46],LEATHER,.04);
  line([.35,.27,.53,.29],GOLD,.03);
  for (const side of [-1,1]) {
    if (armored) {
      oval(side*.5,-.41,.2,.17,noble?GOLD:MAIL);
      line([side*.36,-.4,side*.63,-.38],LINEN,.03);
      for (let i=0;i<3;i++) oval(side*(.4+i*.07),-.34,.022,.022,GOLD,0);
    }
    line([side*.17,.42,side*.24,.7],noble?GOLD:LINEN,.03);
  }
  return g;
}

export function medievalHead(r: number, faction: number, role: UnitType): Graphics {
  const { g, poly, line, oval, mail } = pen(r);
  const wrapped = role === "villager" || role === "crossbowman";
  const noble = role === "hero";
  poly([-.16,.2,.16,.2,.19,.65,-.19,.65],0xb18a60,.04);
  if (!wrapped) {
    poly([-.46,-.18,.44,-.18,.49,.53,.23,.7,-.31,.63,-.49,.32], MAIL);
    mail(-.4,.12,.78,.43);
  }
  // Hair, face, nose and beard give a face rather than a blank circular token.
  oval(0,0,.43,.48,0x47392b);
  poly([-.3,-.25,.24,-.28,.35,-.05,.32,.24,.16,.43,-.15,.4,-.31,.2],0xcfa777,.045);
  poly([.18,-.07,.28,.1,.17,.13],0xb7895e,.02);
  poly([-.29,.16,-.08,.24,.06,.19,.28,.18,.21,.45,-.02,.53,-.26,.37],0x51402d,.04);
  line([-.17,.09,-.09,.085],INK,.055);
  line([.12,.075,.2,.07],INK,.05);
  if (wrapped) {
    poly([-.46,-.14,-.4,-.47,-.12,-.6,.23,-.56,.43,-.31,.39,-.1,.05,-.04],role==="villager"?LINEN:0x6f7a59);
    for (const y of [-.41,-.26,-.13]) line([-.36,y+.09,.31,y-.07],role==="villager"?0x998c6d:0xb6b487,.04);
    poly([-.36,-.08,-.47,.09,-.5,.58,-.29,.46,-.28,.08],role==="villager"?LINEN:faction,.04);
  } else {
    const metal = noble ? GOLD : 0xa3a797;
    poly([-.49,-.12,-.4,-.46,-.12,-.69,0,-.89,.14,-.66,.39,-.45,.48,-.1],metal);
    line([0,-.8,0,-.13],0xe0d3a8,.06);
    poly([-.47,-.16,.47,-.16,.47,-.035,-.47,-.035],noble?0x957a43:0x626c64,.035);
    for (let x=-.35;x<.4;x+=.14) oval(x,-.1,.025,.025,LINEN,0);
    if (role === "swordsman" || noble) poly([-.045,-.06,.05,-.06,.09,.26,-.035,.23],metal,.025);
    if (role === "spearman") {
      // Wide kettle brim, distinct from the swordsman's nasal helmet.
      poly([-.63,-.02,-.43,-.19,.44,-.19,.64,-.02,.36,.04,-.36,.04],0x8c8060,.04);
    }
    if (noble) {
      poly([-.34,-.39,-.38,-.66,-.18,-.53,0,-.74,.16,-.53,.35,-.66,.32,-.39],GOLD,.04);
      oval(0,-.48,.075,.09,0x885343,.025);
    }
  }
  return g;
}

export function medievalShield(r: number, kind: "kite" | "round", color: number): Graphics {
  const {g,poly,line,oval} = pen(r);
  if(kind === "kite") {
    poly([-.46,-.53,0,-.65,.46,-.53,.43,.19,0,.86,-.43,.19],color);
    line([-.37,-.46,0,-.55,.37,-.46,.34,.16,0,.69,-.34,.16,-.37,-.46],GOLD,.045);
    poly([0,-.38,.1,-.12,.3,-.05,.11,.04,0,.39,-.1,.04,-.29,-.05,-.1,-.12],LINEN,.03);
  } else {
    oval(0,0,.59,.59,color,.075);
    g.circle(0,0,r*.49).stroke({color:GOLD,width:r*.045});
    for(let i=0;i<10;i++) {
      const a=i*Math.PI/5;
      oval(Math.cos(a)*.47,Math.sin(a)*.47,.027,.027,LINEN,0);
      line([Math.cos(a)*.2,Math.sin(a)*.2,Math.cos(a+.15)*.35,Math.sin(a+.15)*.35],GOLD,.026);
    }
  }
  oval(0,0,.14,.14,GOLD,.04);
  oval(-.04,-.04,.045,.045,LINEN,0);
  return g;
}
