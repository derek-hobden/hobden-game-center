import type { ProfileId } from "@/lib/profiles";

export type PairId =
  | "unicorn"
  | "rainbow"
  | "fairy"
  | "mermaid"
  | "crown"
  | "castle"
  | "rocket"
  | "dino"
  | "bike"
  | "ball"
  | "robot"
  | "fish";

export type MatchPair = {
  id: PairId;
  src: string;
  label: string;
};

export type Match2Art = {
  bg: string;
  card: string;
  back: string;
  hintLabel: string;
  flipHint: string;
  matchYay: string;
  missCopy: string;
  win: string;
  pairs: MatchPair[];
};

const KEIRA: Match2Art = {
  bg: "/games/match-2/keira-bg.png",
  card: "/games/match-2/keira-card.png",
  back: "/games/match-2/keira-back.png",
  hintLabel: "Peek",
  flipHint: "Tap two sparkly cards. Same pictures make a pair!",
  matchYay: "Match!",
  missCopy: "Not yet — try another pair.",
  win: "You found every magic pair!",
  pairs: [
    { id: "unicorn", src: "/games/match-2/keira-unicorn.png", label: "Unicorn" },
    { id: "rainbow", src: "/games/match-2/keira-rainbow.png", label: "Rainbow" },
    { id: "fairy", src: "/games/match-2/keira-fairy.png", label: "Fairy" },
    { id: "mermaid", src: "/games/match-2/keira-mermaid.png", label: "Mermaid" },
    { id: "crown", src: "/games/match-2/keira-crown.png", label: "Crown" },
    { id: "castle", src: "/games/match-2/keira-castle.png", label: "Castle" },
  ],
};

const LUKE: Match2Art = {
  bg: "/games/match-2/luke-bg.png",
  card: "/games/match-2/luke-card.png",
  back: "/games/match-2/luke-back.png",
  hintLabel: "Peek",
  flipHint: "Tap two mission cards. Same pictures make a pair!",
  matchYay: "Match!",
  missCopy: "Not yet — try another pair.",
  win: "Mission complete — every pair found!",
  pairs: [
    { id: "rocket", src: "/games/match-2/luke-rocket.png", label: "Rocket" },
    { id: "dino", src: "/games/match-2/luke-dino.png", label: "Dino" },
    { id: "bike", src: "/games/match-2/luke-bike.png", label: "Bike" },
    { id: "ball", src: "/games/match-2/luke-ball.png", label: "Ball" },
    { id: "robot", src: "/games/match-2/luke-robot.png", label: "Robot" },
    { id: "fish", src: "/games/match-2/luke-fish.png", label: "Fish" },
  ],
};

export function match2Art(profileId: ProfileId): Match2Art {
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
