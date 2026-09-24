/** Level-up upgrades: simple, visible, kid-friendly. */

export type Stats = {
  auraR: number;
  auraDmg: number;
  auraEvery: number;
  speed: number;
  magnetR: number;
  orbiters: number;
  hp: number;
  maxHp: number;
};

export type UpgradeId = "glow" | "zap" | "power" | "shoes" | "magnet" | "star" | "heal";

export type Upgrade = {
  id: UpgradeId;
  emoji: string;
  title: string;
  desc: string;
  can: (s: Stats) => boolean;
  apply: (s: Stats) => void;
};

export const UPGRADES: Upgrade[] = [
  {
    id: "glow",
    emoji: "🌟",
    title: "Bigger glow",
    desc: "Your zap circle grows",
    can: (s) => s.auraR < 140,
    apply: (s) => {
      s.auraR = Math.min(140, s.auraR + 16);
    },
  },
  {
    id: "zap",
    emoji: "⚡",
    title: "Faster zaps",
    desc: "Zap more often",
    can: (s) => s.auraEvery > 0.4,
    apply: (s) => {
      s.auraEvery = Math.max(0.4, s.auraEvery * 0.78);
    },
  },
  {
    id: "power",
    emoji: "💪",
    title: "Stronger zaps",
    desc: "Each zap hits harder",
    can: (s) => s.auraDmg < 5,
    apply: (s) => {
      s.auraDmg += 1;
    },
  },
  {
    id: "star",
    emoji: "💫",
    title: "Spinning star",
    desc: "A star circles and bonks foes",
    can: (s) => s.orbiters < 4,
    apply: (s) => {
      s.orbiters += 1;
    },
  },
  {
    id: "shoes",
    emoji: "👟",
    title: "Speedy shoes",
    desc: "Run faster",
    can: (s) => s.speed < 230,
    apply: (s) => {
      s.speed = Math.min(230, s.speed + 24);
    },
  },
  {
    id: "magnet",
    emoji: "🧲",
    title: "Gem magnet",
    desc: "Gems zoom to you from far",
    can: (s) => s.magnetR < 320,
    apply: (s) => {
      s.magnetR = Math.min(320, s.magnetR + 70);
    },
  },
  {
    id: "heal",
    emoji: "❤️",
    title: "Heal up",
    desc: "Get 2 hearts back",
    can: (s) => s.hp < s.maxHp,
    apply: (s) => {
      s.hp = Math.min(s.maxHp, s.hp + 2);
    },
  },
];

/** Pick two different eligible upgrades. Healing is offered first when low. */
export function pickTwo(s: Stats, rnd: () => number = Math.random): Upgrade[] {
  const pool = UPGRADES.filter((u) => u.can(s));
  const out: Upgrade[] = [];
  if (s.hp <= 2) {
    const heal = pool.find((u) => u.id === "heal");
    if (heal) out.push(heal);
  }
  const rest = pool.filter((u) => !out.includes(u));
  while (out.length < 2 && rest.length > 0) {
    const i = Math.floor(rnd() * rest.length);
    out.push(rest.splice(i, 1)[0]!);
  }
  return out;
}

/** Gems needed to reach the next level (gentle curve). */
export function xpNeeded(level: number): number {
  return 4 + level * 3;
}
