/**
 * Meadow Guard — lane defense tuning.
 * Distances are canvas pixels. Times are seconds.
 */

export const COLS = 8;
export const ROWS = 5;
export const W = 800;
export const H = 340;

export const LAWN_LEFT = 108;
export const LAWN_TOP = 8;
export const CELL_W = 76;
export const CELL_H = 64;

export const LAWN_RIGHT = LAWN_LEFT + COLS * CELL_W;
export const LAWN_BOTTOM = LAWN_TOP + ROWS * CELL_H;
export const HOUSE_LINE = LAWN_LEFT - 6;
export const SPAWN_X = W - 18;

export const SUN_VALUE = 25;
export const SUN_HIT = 64;
export const BRAMBLE_THORN = 2;

export type PlantKind =
  | "sunbloom"
  | "podsnap"
  | "bramble"
  | "dewburst"
  | "chillvine";

export type CreeperKind = "mulchling" | "dashling" | "barkhelm" | "gnasher";

export type PlantStats = {
  name: string;
  cost: number;
  hp: number;
  recharge: number;
  fire: number;
  dmg: number;
  shot: "pod" | "dew" | "chill" | "none";
  sunEvery: number;
  unlock: number;
  blurb: string;
};

export type CreeperStats = {
  name: string;
  hp: number;
  speed: number;
  bite: number;
  biteEvery: number;
};

export const PLANT_ORDER: PlantKind[] = [
  "sunbloom",
  "podsnap",
  "bramble",
  "dewburst",
  "chillvine",
];

export const PLANTS: Record<PlantKind, PlantStats> = {
  sunbloom: {
    name: "Sunbloom",
    cost: 50,
    hp: 90,
    recharge: 4.5,
    fire: 0,
    dmg: 0,
    shot: "none",
    sunEvery: 7.5,
    unlock: 1,
    blurb: "Drops sun",
  },
  podsnap: {
    name: "Podsnap",
    cost: 100,
    hp: 120,
    recharge: 4.2,
    fire: 1.15,
    dmg: 34,
    shot: "pod",
    sunEvery: 0,
    unlock: 1,
    blurb: "Shoots pods",
  },
  bramble: {
    name: "Bramble",
    cost: 50,
    hp: 460,
    recharge: 6,
    fire: 0,
    dmg: 0,
    shot: "none",
    sunEvery: 0,
    unlock: 1,
    blurb: "Blocks bites",
  },
  dewburst: {
    name: "Dewburst",
    cost: 150,
    hp: 110,
    recharge: 7,
    fire: 2.15,
    dmg: 36,
    shot: "dew",
    sunEvery: 0,
    unlock: 3,
    blurb: "Splash drops",
  },
  chillvine: {
    name: "Chillvine",
    cost: 125,
    hp: 100,
    recharge: 6,
    fire: 1.45,
    dmg: 12,
    shot: "chill",
    sunEvery: 0,
    unlock: 2,
    blurb: "Slows creepers",
  },
};

export const CREEPERS: Record<CreeperKind, CreeperStats> = {
  mulchling: { name: "Mulchling", hp: 96, speed: 24, bite: 14, biteEvery: 0.95 },
  dashling: { name: "Dashling", hp: 64, speed: 40, bite: 12, biteEvery: 0.7 },
  barkhelm: { name: "Barkhelm", hp: 230, speed: 17, bite: 18, biteEvery: 1.05 },
  gnasher: { name: "Gnasher", hp: 150, speed: 30, bite: 36, biteEvery: 0.55 },
};

export const SLOW_FACTOR = 0.42;
export const SLOW_TIME = 3.1;
export const DEW_SPLASH = 78;

export type Spawn = { at: number; kind: CreeperKind; row: number };

export type LevelDef = {
  id: number;
  name: string;
  blurb: string;
  sun: number;
  hearts: number;
  sunEvery: number;
  spawns: Spawn[];
};

function wave(
  start: number,
  every: number,
  rows: number[],
  kinds: CreeperKind[],
): Spawn[] {
  return kinds.map((kind, i) => ({
    at: Math.round((start + i * every) * 10) / 10,
    kind,
    row: rows[i % rows.length],
  }));
}

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: "First Light",
    blurb: "Collect sun. Plant Podsnaps on open rows.",
    sun: 200,
    hearts: 3,
    sunEvery: 6,
    spawns: [
      { at: 7, kind: "mulchling", row: 1 },
      { at: 11, kind: "mulchling", row: 2 },
      { at: 15.5, kind: "mulchling", row: 1 },
      { at: 20, kind: "mulchling", row: 3 },
      { at: 25, kind: "mulchling", row: 2 },
      { at: 30, kind: "mulchling", row: 3 },
    ],
  },
  {
    id: 2,
    name: "Breezy Rows",
    blurb: "Dashlings are fast. Chillvine slows them.",
    sun: 250,
    hearts: 3,
    sunEvery: 5.5,
    spawns: wave(
      6,
      3.6,
      [0, 2, 4, 1, 3, 0, 4, 2, 1, 3],
      [
        "mulchling",
        "mulchling",
        "dashling",
        "mulchling",
        "dashling",
        "mulchling",
        "dashling",
        "mulchling",
        "dashling",
        "mulchling",
      ],
    ),
  },
  {
    id: 3,
    name: "Bark Parade",
    blurb: "Barkhelms soak hits. Dewburst splashes.",
    sun: 325,
    hearts: 3,
    sunEvery: 5.5,
    spawns: wave(
      5.5,
      3.4,
      [1, 3, 0, 4, 2, 1, 3, 0, 4, 2, 1, 3],
      [
        "mulchling",
        "dashling",
        "barkhelm",
        "mulchling",
        "dashling",
        "barkhelm",
        "mulchling",
        "dashling",
        "barkhelm",
        "mulchling",
        "dashling",
        "barkhelm",
      ],
    ),
  },
  {
    id: 4,
    name: "Gnasher Hour",
    blurb: "Gnashers bite hard. Cover every row.",
    sun: 375,
    hearts: 3,
    sunEvery: 5,
    spawns: wave(
      5,
      3.05,
      [0, 2, 4, 1, 3, 0, 4, 2, 1, 3, 0, 2, 4, 1],
      [
        "dashling",
        "mulchling",
        "gnasher",
        "barkhelm",
        "dashling",
        "dashling",
        "gnasher",
        "mulchling",
        "barkhelm",
        "dashling",
        "gnasher",
        "barkhelm",
        "dashling",
        "gnasher",
      ],
    ),
  },
];

export function rowFeet(row: number) {
  return LAWN_TOP + (row + 1) * CELL_H - 6;
}

export function colCenter(col: number) {
  return LAWN_LEFT + (col + 0.5) * CELL_W;
}

export function cellAt(x: number, y: number) {
  const col = Math.floor((x - LAWN_LEFT) / CELL_W);
  const row = Math.floor((y - LAWN_TOP) / CELL_H);
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
  return { col, row };
}
