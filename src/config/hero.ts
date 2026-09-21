export interface HeroLevel {
  hp: number;
  damage: number;
  upgradeCost: { food?: number; gold?: number };
}

export const HERO = {
  levels: [
    { hp: 600, damage: 50, upgradeCost: {} },
    { hp: 800, damage: 65, upgradeCost: { food: 150, gold: 100 } },
    { hp: 1000, damage: 80, upgradeCost: { food: 250, gold: 200 } },
  ] as HeroLevel[],
  ability: {
    name: "Rally",
    radius: 230,
    attackSpeedBonus: 0.2,
    moveSpeedBonus: 0.2,
    duration: 5,
    cooldown: 30,
  },
  respawn: 30,
  names: { player: "King", enemy: "Queen" } as const,
  icons: { player: "\u{1F934}", enemy: "\u{1F478}" } as const,
};
