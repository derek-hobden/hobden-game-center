import type { ProfileId } from "@/lib/profiles";

export type MinesweeperArt = {
  /** Cover texture for un-dug squares (sampled at different offsets per tile). */
  cover: string;
  hazard: string;
  flag: string;
  bg: string;
  digLabel: string;
  digIcon: string;
  markLabel: string;
  hazardWord: string;
  hazardWordOne: string;
  startTitle: string;
  startHint: string;
  winTitle: string;
  win: string;
  loseTitle: string;
  lose: string;
  /** Hidden-square colour (fallback + checker tint), open-square colours. */
  coverTint: [string, string];
  openTint: [string, string];
  frame: string;
};

const KEIRA: MinesweeperArt = {
  cover: "/games/minesweeper/keira-grass.jpg",
  hazard: "/games/minesweeper/keira-hazard-cut.png",
  flag: "/games/minesweeper/keira-flag-cut.png",
  bg: "/games/minesweeper/keira-bg.jpg",
  digLabel: "Peek",
  digIcon: "🪄",
  markLabel: "Flower",
  hazardWord: "dragons",
  hazardWordOne: "dragon",
  startTitle: "Tap the grass!",
  startHint: "Numbers tell how many sleepy dragons are next door. Hold a square to plant a flower.",
  winTitle: "Meadow cleared!",
  win: "Every sleepy dragon is snug under a flower.",
  loseTitle: "Shh… a dragon!",
  lose: "You woke a sleepy dragon.",
  coverTint: ["#86d86c", "#74cc5c"],
  openTint: ["#fff6ea", "#fcebd9"],
  frame: "linear-gradient(160deg, #f9a8d4 0%, #c4b5fd 55%, #93c5fd 100%)",
};

const LUKE: MinesweeperArt = {
  cover: "/games/minesweeper/luke-dirt.jpg",
  hazard: "/games/minesweeper/luke-hazard-cut.png",
  flag: "/games/minesweeper/luke-flag-cut.png",
  bg: "/games/minesweeper/luke-bg.jpg",
  digLabel: "Dig",
  digIcon: "⛏️",
  markLabel: "Flag",
  hazardWord: "dino eggs",
  hazardWordOne: "dino egg",
  startTitle: "Tap to dig!",
  startHint: "Numbers tell how many dino eggs are next door. Hold a square to plant a flag.",
  winTitle: "Field scouted!",
  win: "Every dino egg is safely flagged.",
  loseTitle: "Crack! A dino!",
  lose: "A baby dino hatched on that square.",
  coverTint: ["#d9a05b", "#c98e4a"],
  openTint: ["#fbf0d8", "#f3e2c0"],
  frame: "linear-gradient(160deg, #fbbf24 0%, #f97316 55%, #b45309 100%)",
};

export function minesweeperArt(profileId: ProfileId): MinesweeperArt {
  switch (profileId) {
    case "keira":
      return KEIRA;
    case "luke":
      return LUKE;
    default: {
      const _exhaustive: never = profileId;
      return _exhaustive;
    }
  }
}

/** Bright, distinct, kid-friendly number colours. */
export const NUMBER_COLORS: Record<number, string> = {
  1: "#2563eb",
  2: "#16a34a",
  3: "#e11d48",
  4: "#7c3aed",
  5: "#ea580c",
  6: "#0d9488",
  7: "#334155",
  8: "#64748b",
};
