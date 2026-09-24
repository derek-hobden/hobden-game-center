"use client";

/**
 * Tiny synthesized sound kit shared by every game. No audio files: each cue is
 * a few oscillator/noise envelopes, so it works offline and costs nothing to
 * load. The AudioContext is created lazily on the first cue (always inside a
 * user gesture in practice, which satisfies iOS/Chrome autoplay rules).
 */

export type SfxName =
  | "tap"
  | "pop"
  | "coin"
  | "star"
  | "jump"
  | "flap"
  | "zap"
  | "boom"
  | "hit"
  | "bounce"
  | "flip"
  | "match"
  | "miss"
  | "drop"
  | "clear"
  | "levelUp"
  | "win"
  | "lose";

export const SFX_MUTE_KEY = "hobden-game-center-muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted: boolean | null = null;
const listeners = new Set<(muted: boolean) => void>();
const lastPlayed = new Map<SfxName, number>();

function readMuted(): boolean {
  if (muted !== null) return muted;
  try {
    muted = window.localStorage.getItem(SFX_MUTE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return readMuted();
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(SFX_MUTE_KEY, next ? "1" : "0");
  } catch {
    // Storage can be blocked (private mode); the in-memory flag still works.
  }
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 0.55, ctx.currentTime, 0.02);
  }
  listeners.forEach((fn) => fn(next));
}

export function onMutedChange(fn: (muted: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = readMuted() ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

type ToneOpts = {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  vol?: number;
  attack?: number;
};

function tone(c: AudioContext, out: AudioNode, o: ToneOpts) {
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.from, t0);
  if (o.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  }
  const vol = o.vol ?? 0.3;
  const attack = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;

function noise(
  c: AudioContext,
  out: AudioNode,
  o: { at?: number; dur: number; vol?: number; freq?: number; q?: number },
) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = o.freq ?? 1200;
  filter.Q.value = o.q ?? 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.3, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(out);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

/** Minimum gap per cue so a busy frame can't stack 20 copies of one sound. */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  coin: 45,
  zap: 60,
  bounce: 70,
  hit: 90,
  pop: 40,
  tap: 30,
};

export function sfx(name: SfxName, opts?: { pitch?: number }) {
  if (isMuted()) return;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const gap = MIN_GAP_MS[name] ?? 0;
  if (gap && now - (lastPlayed.get(name) ?? -1e9) < gap) return;
  lastPlayed.set(name, now);

  const a = audio();
  if (!a) return;
  const { ctx: c, out } = a;
  const p = opts?.pitch ?? 1;

  switch (name) {
    case "tap":
      tone(c, out, { type: "triangle", from: 660 * p, to: 520 * p, dur: 0.06, vol: 0.18 });
      break;
    case "pop":
      tone(c, out, { type: "sine", from: 400 * p, to: 900 * p, dur: 0.09, vol: 0.3 });
      break;
    case "coin":
      tone(c, out, { type: "square", from: 988 * p, dur: 0.07, vol: 0.12 });
      tone(c, out, { type: "square", from: 1319 * p, at: 0.06, dur: 0.16, vol: 0.12 });
      break;
    case "star":
      NOTES.slice(2, 6).forEach((f, i) =>
        tone(c, out, { type: "triangle", from: f * p, at: i * 0.05, dur: 0.14, vol: 0.2 }),
      );
      break;
    case "jump":
      tone(c, out, { type: "square", from: 260 * p, to: 720 * p, dur: 0.16, vol: 0.12 });
      break;
    case "flap":
      tone(c, out, { type: "triangle", from: 520 * p, to: 820 * p, dur: 0.08, vol: 0.2 });
      noise(c, out, { dur: 0.06, vol: 0.08, freq: 2500 });
      break;
    case "zap":
      tone(c, out, { type: "sawtooth", from: 1400 * p, to: 300 * p, dur: 0.12, vol: 0.09 });
      break;
    case "boom":
      noise(c, out, { dur: 0.35, vol: 0.45, freq: 500, q: 0.6 });
      tone(c, out, { type: "sine", from: 160 * p, to: 50, dur: 0.3, vol: 0.4 });
      break;
    case "hit":
      noise(c, out, { dur: 0.12, vol: 0.3, freq: 900 });
      tone(c, out, { type: "square", from: 220 * p, to: 110 * p, dur: 0.12, vol: 0.12 });
      break;
    case "bounce":
      tone(c, out, { type: "sine", from: 300 * p, to: 600 * p, dur: 0.1, vol: 0.28 });
      break;
    case "flip":
      noise(c, out, { dur: 0.07, vol: 0.18, freq: 3200, q: 1.2 });
      tone(c, out, { type: "triangle", from: 700 * p, to: 900 * p, dur: 0.05, vol: 0.08 });
      break;
    case "match":
      tone(c, out, { type: "triangle", from: 784 * p, dur: 0.12, vol: 0.22 });
      tone(c, out, { type: "triangle", from: 1175 * p, at: 0.09, dur: 0.22, vol: 0.22 });
      break;
    case "miss":
      tone(c, out, { type: "triangle", from: 330 * p, to: 260 * p, dur: 0.18, vol: 0.18 });
      break;
    case "drop":
      tone(c, out, { type: "sine", from: 180 * p, to: 90 * p, dur: 0.1, vol: 0.35 });
      noise(c, out, { dur: 0.05, vol: 0.12, freq: 700 });
      break;
    case "clear":
      NOTES.slice(0, 5).forEach((f, i) =>
        tone(c, out, { type: "square", from: f * p, at: i * 0.045, dur: 0.12, vol: 0.09 }),
      );
      break;
    case "levelUp":
      [0, 2, 4, 5].forEach((n, i) =>
        tone(c, out, { type: "triangle", from: NOTES[n] * p, at: i * 0.09, dur: 0.2, vol: 0.22 }),
      );
      break;
    case "win":
      [0, 2, 4, 7].forEach((n, i) =>
        tone(c, out, { type: "triangle", from: NOTES[n] * p, at: i * 0.12, dur: 0.3, vol: 0.24 }),
      );
      tone(c, out, { type: "sine", from: NOTES[7] * p, at: 0.48, dur: 0.6, vol: 0.2 });
      break;
    case "lose":
      [392, 330, 262].forEach((f, i) =>
        tone(c, out, { type: "triangle", from: f * p, at: i * 0.16, dur: 0.26, vol: 0.2 }),
      );
      break;
  }
}

/** Short vibration on devices that support it (Android). Silently no-ops elsewhere. */
export function haptic(ms = 12) {
  if (isMuted()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // ignore
  }
}
