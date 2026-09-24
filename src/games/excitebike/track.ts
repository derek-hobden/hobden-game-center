/**
 * Track layout + ground height for Dirt Bike. Heights are "up" in game units
 * above the flat base line. Deterministic per level so a retry is the same run.
 */

export type Bump = { kind: "bump"; x0: number; x1: number; h: number };
export type Ramp = { kind: "ramp"; x0: number; x1: number; h: number; back: number };
export type Terrain = Bump | Ramp;
export type Block = { x: number; w: number; h: number; smashed: boolean };
export type Mud = { x0: number; x1: number };
export type Gem = { x: number; alt: number; taken: boolean };

export type Track = {
  length: number;
  terrain: Terrain[];
  blocks: Block[];
  muds: Mud[];
  gems: Gem[];
};

export const BLOCK_W = 34;
export const BLOCK_H = 30;

function rng(seed: number) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Feature = "bump" | "bumps" | "ramp" | "block" | "mud";

/** The mix of features for a level: more of everything (and more blocks) as levels go up. */
export function featureDeck(level: number, r: () => number): Feature[] {
  const L = Math.min(level, 8);
  const deck: Feature[] = [];
  const add = (f: Feature, n: number) => {
    for (let i = 0; i < n; i++) deck.push(f);
  };
  add("bump", 2 + Math.ceil(L / 2));
  add("ramp", 2 + Math.floor(L / 2));
  add("block", 1 + L);
  add("mud", 1 + Math.floor(L / 3));
  add("bumps", L >= 2 ? 1 + Math.floor(L / 3) : 0);
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  // never two blocks in a row
  for (let i = 1; i < deck.length; i++) {
    if (deck[i] === "block" && deck[i - 1] === "block") {
      const k = deck.findIndex((f, idx) => f !== "block" && (idx === 0 || deck[idx - 1] !== "block") && deck[idx + 1] !== "block");
      if (k >= 0) [deck[i], deck[k]] = [deck[k], deck[i]];
    }
  }
  // warm up with a friendly bump
  return ["bump", ...deck];
}

export function buildTrack(level: number): Track {
  const r = rng(level * 7919 + 13);
  const terrain: Terrain[] = [];
  const blocks: Block[] = [];
  const muds: Mud[] = [];
  const gems: Gem[] = [];
  // A few friendly gems on the opening straight.
  for (let i = 0; i < 3; i++) gems.push({ x: 320 + i * 55, alt: 34, taken: false });

  let x = 560;
  const gapMin = Math.max(170, 215 - level * 8);
  for (const kind of featureDeck(level, r)) {
    if (kind === "block") {
      blocks.push({ x: x + BLOCK_W / 2, w: BLOCK_W, h: BLOCK_H, smashed: false });
      gems.push({ x: x + BLOCK_W / 2, alt: BLOCK_H + 62, taken: false });
      x += BLOCK_W;
    } else if (kind === "ramp") {
      const h = 46 + r() * 16 + Math.min(12, level * 2);
      const len = 108;
      const back = 26;
      terrain.push({ kind: "ramp", x0: x, x1: x + len, h, back });
      // arc of gems along the launch path
      for (let i = 0; i < 3; i++) {
        gems.push({ x: x + len + 50 + i * 45, alt: h + 50 - i * 16, taken: false });
      }
      x += len + back + 90;
    } else if (kind === "bump" || kind === "bumps") {
      const n = kind === "bumps" ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const w = 110 + r() * 40;
        const h = 16 + r() * 10;
        terrain.push({ kind: "bump", x0: x, x1: x + w, h });
        if (i === n - 1 || r() < 0.4) gems.push({ x: x + w / 2, alt: h + 44, taken: false });
        x += w;
      }
    } else {
      const w = 90 + r() * 30;
      muds.push({ x0: x, x1: x + w });
      x += w;
    }
    x += gapMin + r() * 70;
  }
  return { length: Math.round(x + 260), terrain, blocks, muds, gems };
}

/** Height of the ground above the base line at world x. */
export function groundAt(track: Track, x: number): number {
  let h = 0;
  for (const t of track.terrain) {
    if (t.kind === "bump") {
      if (x > t.x0 && x < t.x1) {
        const u = (x - t.x0) / (t.x1 - t.x0);
        h = Math.max(h, t.h * 0.5 * (1 - Math.cos(u * Math.PI * 2)));
      }
    } else if (x > t.x0 && x < t.x1 + t.back) {
      if (x <= t.x1) {
        const u = (x - t.x0) / (t.x1 - t.x0);
        h = Math.max(h, t.h * Math.pow(u, 1.6));
      } else {
        const u = (x - t.x1) / t.back;
        h = Math.max(h, t.h * (1 - u));
      }
    }
    if (t.x0 > x) break;
  }
  return h;
}

export function slopeAt(track: Track, x: number): number {
  return (groundAt(track, x + 2) - groundAt(track, x - 2)) / 4;
}
