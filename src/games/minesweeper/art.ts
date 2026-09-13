import type { ProfileId } from "@/lib/profiles";

export type MinesweeperArt = {
  hidden: string;
  open: string;
  hazard: string;
  flag: string;
  bg: string;
  card: string;
  peekLabel: string;
  markLabel: string;
  markHint: string;
  peekHint: string;
  win: string;
  lose: string;
  counterWord: string;
};

const KEIRA: MinesweeperArt = {
  hidden: "/games/minesweeper/keira-hidden.png",
  open: "/games/minesweeper/keira-open.png",
  hazard: "/games/minesweeper/keira-hazard.png",
  flag: "/games/minesweeper/keira-flag.png",
  bg: "/games/minesweeper/keira-bg.png",
  card: "/games/minesweeper/keira-card.png",
  peekLabel: "Peek",
  markLabel: "Flower",
  markHint: "Flower on — tap to mark sleepy dragons",
  peekHint: "Peek on — tap grass to look",
  win: "You found every safe flower patch!",
  lose: "Shh — a sleepy dragon was napping here.",
  counterWord: "dragons",
};

const LUKE: MinesweeperArt = {
  hidden: "/games/minesweeper/luke-hidden.png",
  open: "/games/minesweeper/luke-open.png",
  hazard: "/games/minesweeper/luke-hazard.png",
  flag: "/games/minesweeper/luke-flag.png",
  bg: "/games/minesweeper/luke-bg.png",
  card: "/games/minesweeper/luke-card.png",
  peekLabel: "Scout",
  markLabel: "Flag",
  markHint: "Flag on — tap to mark dino eggs",
  peekHint: "Scout on — tap dirt to look",
  win: "Scout complete — every safe square is clear!",
  lose: "A baby dino hatched on that square!",
  counterWord: "eggs",
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

export function adjTone(adj: number): string {
  switch (adj) {
    case 1:
      return "text-sky-700";
    case 2:
      return "text-emerald-700";
    case 3:
      return "text-violet-700";
    case 4:
      return "text-amber-800";
    case 5:
      return "text-rose-700";
    case 6:
      return "text-fuchsia-800";
    case 7:
      return "text-orange-800";
    case 8:
      return "text-stone-800";
    default:
      return "text-[var(--ink)]";
  }
}
