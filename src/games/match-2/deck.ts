import type { MatchPair } from "./art";

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const DEFAULT_DIFFICULTY: Difficulty = "easy";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export type DifficultyConfig = {
  pairCount: number;
  columns: number;
};

export type Card = {
  uid: number;
  pairId: MatchPair["id"];
  src: string;
  label: string;
  matched: boolean;
};

export function difficultyConfig(difficulty: Difficulty): DifficultyConfig {
  switch (difficulty) {
    case "easy":
      return { pairCount: 6, columns: 3 };
    case "medium":
      return { pairCount: 8, columns: 4 };
    case "hard":
      return { pairCount: 10, columns: 4 };
    default: {
      const _exhaustive: never = difficulty;
      return _exhaustive;
    }
  }
}

export function visibleDifficulties(available: number): Difficulty[] {
  const fits = DIFFICULTIES.filter(
    (id) => available >= difficultyConfig(id).pairCount,
  );
  return fits.length > 0 ? fits : [DEFAULT_DIFFICULTY];
}

export function resolveDifficulty(
  requested: Difficulty,
  available: number,
): Difficulty {
  const visible = visibleDifficulties(available);
  if (visible.includes(requested)) return requested;
  return visible[visible.length - 1] ?? DEFAULT_DIFFICULTY;
}

export function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(
  pairs: MatchPair[],
  difficulty: Difficulty,
  random: () => number = Math.random,
): Card[] {
  const resolved = resolveDifficulty(difficulty, pairs.length);
  const wanted = difficultyConfig(resolved).pairCount;
  const pairCount = Math.min(wanted, Math.max(0, pairs.length));
  const picks = pairs.slice(0, pairCount);
  const cards = picks.flatMap((pair, i) => [
    {
      uid: i * 2,
      pairId: pair.id,
      src: pair.src,
      label: pair.label,
      matched: false,
    },
    {
      uid: i * 2 + 1,
      pairId: pair.id,
      src: pair.src,
      label: pair.label,
      matched: false,
    },
  ]);
  return shuffle(cards, random);
}

export const CARD_ASPECT_MIN = 0.66; // tallest card (w/h)
export const CARD_ASPECT_MAX = 1; // squarest card

export type GridLayout = {
  cols: number;
  rows: number;
  cardW: number;
  cardH: number;
};

/**
 * Pick the grid that gives the biggest cards for `count` cards inside a W×H
 * box (with `gap` px between cards). Cards may be square or a little taller
 * than wide (like real playing cards). Only full grids are considered.
 * `preferred` columns win near-ties.
 */
export function gridLayout(
  count: number,
  width: number,
  height: number,
  gap: number,
  preferred: number,
): GridLayout {
  const fallback: GridLayout = {
    cols: preferred,
    rows: Math.max(1, Math.ceil(count / preferred)),
    cardW: 1,
    cardH: 1,
  };
  if (count <= 0 || width <= 0 || height <= 0) return fallback;
  let best = fallback;
  let bestScore = -1;
  for (let cols = 2; cols <= Math.min(count, 10); cols++) {
    const rows = Math.ceil(count / cols);
    if (rows * cols !== count) continue;
    const w = (width - gap * (cols - 1)) / cols;
    const h = (height - gap * (rows - 1)) / rows;
    if (w <= 0 || h <= 0) continue;
    const cardW = Math.min(w, h * CARD_ASPECT_MAX);
    const cardH = Math.min(h, cardW / CARD_ASPECT_MIN);
    const area = cardW * cardH * (cols === preferred ? 1.04 : 1);
    if (area > bestScore) {
      bestScore = area;
      best = { cols, rows, cardW, cardH };
    }
  }
  return best;
}

/** Column count from `gridLayout` (kept for callers that only need columns). */
export function bestColumns(
  count: number,
  width: number,
  height: number,
  gap: number,
  preferred: number,
): number {
  return gridLayout(count, width, height, gap, preferred).cols;
}

/** 3 stars for a sharp memory, never fewer than 1. */
export function starRating(moves: number, pairs: number): 1 | 2 | 3 {
  if (moves <= Math.ceil(pairs * 1.5)) return 3;
  if (moves <= Math.ceil(pairs * 2.25)) return 2;
  return 1;
}
