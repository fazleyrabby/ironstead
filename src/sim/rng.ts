export interface Rng {
  next(): number;
}

export function mulberry32(seed: number): Rng {
  return new Mulberry32(seed);
}

export class Mulberry32 implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function splitmix64(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next(): number {
      s += 0x9e3779b9;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
