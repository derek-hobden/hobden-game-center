import type { ProfileId } from "@/lib/profiles";

export type PairId =
  | "unicorn"
  | "rainbow"
  | "fairy"
  | "mermaid"
  | "crown"
  | "castle"
  | "pearl"
  | "blossom"
  | "star"
  | "gem"
  | "rocket"
  | "dino"
  | "bike"
  | "ball"
  | "robot"
  | "fish"
  | "car"
  | "planet";

export type MatchPair = {
  id: PairId;
  src: string;
  label: string;
};

export type Match2Art = {
  bg: string;
  back: string;
  hintLabel: string;
  flipHint: string;
  matchYay: string;
  missCopy: string;
  winTitle: string;
  win: string;
  /** Card frame + glow colours. */
  frame: string;
  glow: string;
  pairs: MatchPair[];
};

const KEIRA: Match2Art = {
  bg: "/games/match-2/keira-bg.jpg",
  back: "/games/match-2/keira-back.jpg",
  hintLabel: "Peek",
  flipHint: "Tap two sparkly cards. Same pictures make a pair!",
  matchYay: "Match!",
  missCopy: "Not yet — try another pair.",
  winTitle: "Magic!",
  win: "You found every magic pair!",
  frame: "linear-gradient(160deg, #fbcfe8, #ddd6fe)",
  glow: "#f472b6",
  pairs: [
    { id: "unicorn", src: "/games/match-2/keira-unicorn.jpg", label: "Unicorn" },
    { id: "rainbow", src: "/games/match-2/keira-rainbow.jpg", label: "Rainbow" },
    { id: "fairy", src: "/games/match-2/keira-fairy.jpg", label: "Fairy" },
    { id: "mermaid", src: "/games/match-2/keira-mermaid.jpg", label: "Mermaid" },
    { id: "crown", src: "/games/match-2/keira-crown.jpg", label: "Crown" },
    { id: "castle", src: "/games/match-2/keira-castle.jpg", label: "Castle" },
    { id: "pearl", src: "/games/match-2/keira-pearl.jpg", label: "Pearl" },
    { id: "blossom", src: "/games/match-2/keira-blossom.jpg", label: "Blossom" },
    { id: "star", src: "/games/match-2/keira-star.jpg", label: "Star" },
    { id: "gem", src: "/games/match-2/keira-gem.jpg", label: "Gem" },
  ],
};

const LUKE: Match2Art = {
  bg: "/games/match-2/luke-bg.jpg",
  back: "/games/match-2/luke-back.jpg",
  hintLabel: "Peek",
  flipHint: "Tap two mission cards. Same pictures make a pair!",
  matchYay: "Match!",
  missCopy: "Not yet — try another pair.",
  winTitle: "Mission complete!",
  win: "You found every pair!",
  frame: "linear-gradient(160deg, #bae6fd, #fde68a)",
  glow: "#38bdf8",
  pairs: [
    { id: "rocket", src: "/games/match-2/luke-rocket.jpg", label: "Rocket" },
    { id: "dino", src: "/games/match-2/luke-dino.jpg", label: "Dino" },
    { id: "bike", src: "/games/match-2/luke-bike.jpg", label: "Bike" },
    { id: "ball", src: "/games/match-2/luke-ball.jpg", label: "Ball" },
    { id: "robot", src: "/games/match-2/luke-robot.jpg", label: "Robot" },
    { id: "fish", src: "/games/match-2/luke-fish.jpg", label: "Fish" },
    { id: "car", src: "/games/match-2/luke-car.jpg", label: "Car" },
    { id: "planet", src: "/games/match-2/luke-planet.jpg", label: "Planet" },
    { id: "star", src: "/games/match-2/luke-star.jpg", label: "Star" },
    { id: "gem", src: "/games/match-2/luke-gem.jpg", label: "Gem" },
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
