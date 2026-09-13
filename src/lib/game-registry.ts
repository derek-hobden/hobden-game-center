import type { ComponentType } from "react";
import type { ProfileId } from "@/lib/profiles";

export type GameStatus = "ready" | "coming-soon";

export type GameProps = {
  profileId: ProfileId;
  paused: boolean;
  onScoreChange?: (score: number) => void;
};

export type GameMeta = {
  id: string;
  title: string;
  ages: string;
  controlHint: string;
  blurb: string;
  status: GameStatus;
  accent: string;
  icon: string;
  load?: () => Promise<{ default: ComponentType<GameProps> }>;
};

export const GAME_REGISTRY: GameMeta[] = [
  {
    id: "snake",
    title: "Snake",
    ages: "4+",
    controlHint: "Swipe or tap arrows",
    blurb: "Grow longer. Don't bump walls!",
    status: "ready",
    accent: "#34d399",
    icon: "🐍",
    load: () => import("@/games/snake"),
  },
  {
    id: "flappy",
    title: "Flappy",
    ages: "4+",
    controlHint: "Tap to flap",
    blurb: "Fly between the soft clouds.",
    status: "ready",
    accent: "#38bdf8",
    icon: "🕊️",
    load: () => import("@/games/flappy"),
  },
  {
    id: "minesweeper",
    title: "Minesweeper",
    ages: "4+",
    controlHint: "Tap to open, use Flag mode",
    blurb: "Find safe squares. Flag the danger.",
    status: "ready",
    accent: "#fbbf24",
    icon: "🧭",
    load: () => import("@/games/minesweeper"),
  },
  {
    id: "match-2",
    title: "Match 2",
    ages: "4+",
    controlHint: "Tap two cards to match",
    blurb: "Flip cards and find the pairs!",
    status: "ready",
    accent: "#c084fc",
    icon: "🃏",
    load: () => import("@/games/match-2"),
  },
  {
    id: "space-invaders",
    title: "Space Invaders",
    ages: "5+",
    controlHint: "Coming soon",
    blurb: "Defend the sky.",
    status: "coming-soon",
    accent: "#a78bfa",
    icon: "👾",
  },
  {
    id: "tetris",
    title: "Tetris",
    ages: "5+",
    controlHint: "Coming soon",
    blurb: "Stack colorful blocks.",
    status: "coming-soon",
    accent: "#fb7185",
    icon: "🧱",
  },
  {
    id: "vampire-survivors",
    title: "Sparkle Survivors",
    ages: "6+",
    controlHint: "Coming soon",
    blurb: "Survive the night crowd.",
    status: "coming-soon",
    accent: "#c084fc",
    icon: "⚔️",
  },
  {
    id: "castle-fight",
    title: "Castle Fight",
    ages: "6+",
    controlHint: "Coming soon",
    blurb: "Build and battle castles.",
    status: "coming-soon",
    accent: "#f97316",
    icon: "🏰",
  },
  {
    id: "jetpack",
    title: "Jetpack Dash",
    ages: "5+",
    controlHint: "Coming soon",
    blurb: "Hold to boost through caves.",
    status: "coming-soon",
    accent: "#22d3ee",
    icon: "🎒",
  },
  {
    id: "excitebike",
    title: "Dirt Bike",
    ages: "5+",
    controlHint: "Coming soon",
    blurb: "Race bumpy tracks.",
    status: "coming-soon",
    accent: "#84cc16",
    icon: "🏍️",
  },
  {
    id: "paperboy",
    title: "Paper Run",
    ages: "5+",
    controlHint: "Coming soon",
    blurb: "Deliver papers down the lane.",
    status: "coming-soon",
    accent: "#60a5fa",
    icon: "📰",
  },
  {
    id: "solitaire",
    title: "Solitaire",
    ages: "6+",
    controlHint: "Coming soon",
    blurb: "Calm card stacking.",
    status: "coming-soon",
    accent: "#4ade80",
    icon: "🃏",
  },
  {
    id: "mahjong",
    title: "Mahjong",
    ages: "6+",
    controlHint: "Coming soon",
    blurb: "Match pretty tiles.",
    status: "coming-soon",
    accent: "#f472b6",
    icon: "🀄",
  },
  {
    id: "pinball",
    title: "Pinball",
    ages: "5+",
    controlHint: "Coming soon",
    blurb: "Flippers and bounce.",
    status: "coming-soon",
    accent: "#f43f5e",
    icon: "🕹️",
  },
];

export function getGame(id: string): GameMeta | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}
