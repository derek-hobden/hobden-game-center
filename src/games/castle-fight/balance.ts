/**
 * Castle Fight tuning. Speeds are in "path lengths per second" (the path runs
 * from your gate at t=0 to their gate at t=1). Times are in seconds.
 */

export type Kind = "small" | "big";

export type FriendStats = {
  hp: number;
  dmg: number;
  rate: number;
  speed: number;
  castle: number;
  cost: number;
  size: number;
};

export type FoeStats = Omit<FriendStats, "cost"> & { reward: number };

export const START_GOLD = 15;
export const GOLD_PER_SEC = 3;
export const GOLD_CAP = 99;
export const HOME_HP = 60;

export const FRIEND_STATS: Record<Kind, FriendStats> = {
  small: { hp: 34, dmg: 9, rate: 0.75, speed: 0.1, castle: 4, cost: 10, size: 72 },
  big: { hp: 100, dmg: 20, rate: 0.95, speed: 0.072, castle: 9, cost: 25, size: 96 },
};

/** Foes get a little tougher and quicker each level. */
export function FOE_STATS(level: number): Record<Kind, FoeStats> {
  const hpK = 1 + 0.12 * (level - 1);
  const spK = 1 + Math.min(0.35, 0.05 * (level - 1));
  return {
    small: { hp: Math.round(26 * hpK), dmg: 7, rate: 0.8, speed: 0.08 * spK, castle: 4, reward: 4, size: 66 },
    big: { hp: Math.round(72 * hpK), dmg: 14, rate: 1.0, speed: 0.06 * spK, castle: 8, reward: 9, size: 92 },
  };
}

export function foeCastleHp(level: number) {
  return 60 + 15 * (level - 1);
}

/** Seconds between enemy sends: slow at first, ramps gently within and across levels. */
export function foeInterval(level: number, elapsed: number) {
  const base = Math.max(3, 6.5 - 0.5 * (level - 1));
  return Math.max(2.4, base - Math.min(1.5, elapsed * 0.02));
}

export function bigFoeChance(level: number, elapsed: number) {
  if (level < 2 && elapsed < 45) return 0;
  return Math.min(0.4, 0.12 + 0.07 * (level - 1));
}

export function maxFoes(level: number) {
  return Math.min(8, 3 + level);
}
