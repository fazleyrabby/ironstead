export type SfxName =
  | "place"
  | "complete"
  | "train"
  | "melee"
  | "bolt"
  | "tower"
  | "hit"
  | "destroyed"
  | "die"
  | "upgrade"
  | "rally"
  | "repair"
  | "victory"
  | "defeat"
  | "click"
  | "error";

const THROTTLE: Partial<Record<SfxName, number>> = {
  melee: 90,
  bolt: 90,
  tower: 140,
  hit: 80,
  die: 90,
  repair: 400,
  click: 60,
};

const STORAGE_KEY = "rts.audio";

interface ToneOptions {
  freq: number;
  freqEnd?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

interface NoiseOptions {
  dur: number;
  gain?: number;
  delay?: number;
  lowpass?: number;
}

export class SoundFX {
  private ctx?: AudioContext;
  private master?: GainNode;
  private readonly lastPlay = new Map<SfxName, number>();
  private enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      this.enabled = true;
    }
    const unlock = (): void => {
      this.ensure();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
    return this.enabled;
  }

  play(name: SfxName): void {
    if (!this.enabled) return;
    const now = performance.now();
    const limit = THROTTLE[name] ?? 0;
    if (limit > 0) {
      const last = this.lastPlay.get(name) ?? -Infinity;
      if (now - last < limit) return;
      this.lastPlay.set(name, now);
    }
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    RECIPES[name](ctx, this.master);
  }

  private ensure(): AudioContext | undefined {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return undefined;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }
}

function tone(ctx: AudioContext, out: GainNode, options: ToneOptions): void {
  const t0 = ctx.currentTime + (options.delay ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = options.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(options.freq, 1), t0);
  if (options.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(options.freqEnd, 1), t0 + options.dur);
  }
  const peak = options.gain ?? 1;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + options.dur);
  osc.connect(gain);
  gain.connect(out);
  osc.start(t0);
  osc.stop(t0 + options.dur + 0.05);
}

function noise(ctx: AudioContext, out: GainNode, options: NoiseOptions): void {
  const t0 = ctx.currentTime + (options.delay ?? 0);
  const length = Math.max(Math.floor(ctx.sampleRate * options.dur), 1);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = options.lowpass ?? 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(options.gain ?? 1, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + options.dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  source.start(t0);
}

type Recipe = (ctx: AudioContext, out: GainNode) => void;

const RECIPES: Record<SfxName, Recipe> = {
  place: (ctx, out) => {
    tone(ctx, out, { freq: 190, freqEnd: 95, dur: 0.09, type: "square", gain: 0.5 });
    noise(ctx, out, { dur: 0.06, gain: 0.4, lowpass: 2500 });
  },
  complete: (ctx, out) => {
    tone(ctx, out, { freq: 523, dur: 0.1, gain: 0.5 });
    tone(ctx, out, { freq: 659, dur: 0.1, gain: 0.5, delay: 0.09 });
    tone(ctx, out, { freq: 784, dur: 0.16, gain: 0.55, delay: 0.18 });
  },
  train: (ctx, out) => {
    tone(ctx, out, { freq: 220, freqEnd: 330, dur: 0.16, type: "sawtooth", gain: 0.35 });
  },
  melee: (ctx, out) => {
    tone(ctx, out, { freq: 740, freqEnd: 320, dur: 0.07, type: "square", gain: 0.3 });
    noise(ctx, out, { dur: 0.06, gain: 0.35, lowpass: 4200 });
  },
  bolt: (ctx, out) => {
    tone(ctx, out, { freq: 1250, freqEnd: 320, dur: 0.09, gain: 0.35 });
  },
  tower: (ctx, out) => {
    tone(ctx, out, { freq: 160, freqEnd: 65, dur: 0.16, gain: 0.6 });
    noise(ctx, out, { dur: 0.1, gain: 0.3, lowpass: 900 });
  },
  hit: (ctx, out) => {
    noise(ctx, out, { dur: 0.07, gain: 0.45, lowpass: 1400 });
  },
  destroyed: (ctx, out) => {
    noise(ctx, out, { dur: 0.55, gain: 0.8, lowpass: 420 });
    tone(ctx, out, { freq: 220, freqEnd: 45, dur: 0.5, type: "sawtooth", gain: 0.4 });
  },
  die: (ctx, out) => {
    tone(ctx, out, { freq: 420, freqEnd: 150, dur: 0.13, gain: 0.4 });
  },
  upgrade: (ctx, out) => {
    tone(ctx, out, { freq: 440, dur: 0.1, gain: 0.5 });
    tone(ctx, out, { freq: 660, dur: 0.14, gain: 0.5, delay: 0.09 });
  },
  rally: (ctx, out) => {
    tone(ctx, out, { freq: 392, dur: 0.12, type: "square", gain: 0.4 });
    tone(ctx, out, { freq: 523, dur: 0.12, type: "square", gain: 0.4, delay: 0.1 });
    tone(ctx, out, { freq: 659, dur: 0.2, type: "square", gain: 0.45, delay: 0.2 });
  },
  repair: (ctx, out) => {
    tone(ctx, out, { freq: 300, freqEnd: 180, dur: 0.07, type: "square", gain: 0.35 });
    noise(ctx, out, { dur: 0.05, gain: 0.3, lowpass: 3000 });
  },
  victory: (ctx, out) => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      tone(ctx, out, { freq, dur: 0.22, type: "triangle", gain: 0.6, delay: i * 0.14 });
    });
  },
  defeat: (ctx, out) => {
    const notes = [392, 330, 262];
    notes.forEach((freq, i) => {
      tone(ctx, out, { freq, dur: 0.3, type: "triangle", gain: 0.55, delay: i * 0.18 });
    });
  },
  click: (ctx, out) => {
    tone(ctx, out, { freq: 820, dur: 0.035, gain: 0.25 });
  },
  error: (ctx, out) => {
    tone(ctx, out, { freq: 140, dur: 0.13, type: "square", gain: 0.4 });
  },
};
