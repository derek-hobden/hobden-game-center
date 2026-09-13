import type { ProfileId } from "@/lib/profiles";

export type PieceKind = "i" | "o" | "t" | "l" | "j" | "s" | "z";

export const PIECE_KINDS: PieceKind[] = ["i", "o", "t", "l", "j", "s", "z"];

export const SHAPES: Record<PieceKind, number[][]> = {
  i: [[1, 1, 1, 1]],
  o: [
    [1, 1],
    [1, 1],
  ],
  t: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  l: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  j: [
    [0, 0, 1],
    [1, 1, 1],
  ],
  s: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  z: [
    [0, 1, 1],
    [1, 1, 0],
  ],
};

export type TetrisPack = {
  prefix: "keira" | "luke";
  yay: string;
  lose: string;
  hint: string;
  nextLabel: string;
  ghost: string;
};

export function tetrisPack(profileId: ProfileId): TetrisPack {
  switch (profileId) {
    case "keira":
      return {
        prefix: "keira",
        yay: "Yay! Sparkle row!",
        lose: "Castle full — build again!",
        hint: "Swipe the well or tap the big buttons.",
        nextLabel: "Next gem",
        ghost: "rgba(255,255,255,0.35)",
      };
    case "luke":
      return {
        prefix: "luke",
        yay: "Yay! Stack cleared!",
        lose: "Hangar full — stack again!",
        hint: "Swipe the well or tap the big buttons.",
        nextLabel: "Next block",
        ghost: "rgba(255,255,255,0.32)",
      };
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

export function blockSrc(prefix: TetrisPack["prefix"], kind: PieceKind): string {
  return `/games/tetris/${prefix}-${kind}.png`;
}

export function bgSrc(prefix: TetrisPack["prefix"]): string {
  return `/games/tetris/${prefix}-bg.png`;
}

export function cardSrc(prefix: TetrisPack["prefix"]): string {
  return `/games/tetris/${prefix}-card.png`;
}

export function kindFill(kind: PieceKind, isKeira: boolean): string {
  switch (kind) {
    case "i":
      return isKeira ? "#7dd3fc" : "#38bdf8";
    case "o":
      return isKeira ? "#f9a8d4" : "#4ade80";
    case "t":
      return isKeira ? "#fcd34d" : "#fb923c";
    case "l":
      return isKeira ? "#c4b5fd" : "#a78bfa";
    case "j":
      return isKeira ? "#67e8f9" : "#facc15";
    case "s":
      return isKeira ? "#86efac" : "#2dd4bf";
    case "z":
      return isKeira ? "#fda4af" : "#fb7185";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}
