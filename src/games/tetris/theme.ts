import type { ProfileId } from "@/lib/profiles";

export type PieceKind = "i" | "o" | "t" | "l" | "j" | "s" | "z";

/** Order matches the tile sprite sheet (`<prefix>-tiles.webp`, 7 × 128px). */
export const PIECE_KINDS: PieceKind[] = ["i", "o", "t", "l", "j", "s", "z"];

/** Square matrices so rotation spins around the piece's middle. */
export const SHAPES: Record<PieceKind, number[][]> = {
  i: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  o: [
    [1, 1],
    [1, 1],
  ],
  t: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  l: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  j: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  s: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

export type TetrisPack = {
  prefix: "keira" | "luke";
  emoji: string;
  loseEmoji: string;
  loseTitle: string;
  rowWord: string;
  cheers: string[];
  wellTop: string;
  wellBottom: string;
  accentGlow: string;
};

export function tetrisPack(profileId: ProfileId): TetrisPack {
  switch (profileId) {
    case "keira":
      return {
        prefix: "keira",
        emoji: "🏰",
        loseEmoji: "🦄",
        loseTitle: "Castle's full!",
        rowWord: "sparkle rows",
        cheers: ["Sparkle!", "Double magic!", "Triple twinkle!", "RAINBOW!"],
        wellTop: "rgba(88, 40, 120, 0.50)",
        wellBottom: "rgba(56, 18, 84, 0.72)",
        accentGlow: "255, 150, 220",
      };
    case "luke":
      return {
        prefix: "luke",
        emoji: "🚀",
        loseEmoji: "🦖",
        loseTitle: "Hangar's full!",
        rowWord: "rows",
        cheers: ["Boom!", "Double blast!", "Triple turbo!", "MEGA ROCKET!"],
        wellTop: "rgba(8, 20, 48, 0.45)",
        wellBottom: "rgba(4, 10, 30, 0.72)",
        accentGlow: "120, 210, 255",
      };
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

export function tilesSrc(prefix: TetrisPack["prefix"]): string {
  return `/games/tetris/${prefix}-tiles.webp`;
}

export function bgSrc(prefix: TetrisPack["prefix"]): string {
  return `/games/tetris/${prefix}-bg.jpg`;
}

export const TETRIS_COLS = 10;
export const TETRIS_ROWS = 16;

/** Colour roughly matching each tile, for particles and fallbacks. */
export function kindFill(kind: PieceKind, isKeira: boolean): string {
  switch (kind) {
    case "i":
      return isKeira ? "#f472b6" : "#38bdf8";
    case "o":
      return isKeira ? "#d8b4fe" : "#4ade80";
    case "t":
      return isKeira ? "#fcd34d" : "#fb923c";
    case "l":
      return isKeira ? "#c4b5fd" : "#8b5cf6";
    case "j":
      return isKeira ? "#5eead4" : "#facc15";
    case "s":
      return isKeira ? "#86efac" : "#2dd4bf";
    case "z":
      return isKeira ? "#fdba74" : "#f87171";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
