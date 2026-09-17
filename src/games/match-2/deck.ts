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
  const { pairCount } = difficultyConfig(difficulty);
  const picks = pairs.slice(0, pairCount);
  if (picks.length < pairCount) {
    throw new Error(`Need ${pairCount} pair kinds, got ${picks.length}`);
  }
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
