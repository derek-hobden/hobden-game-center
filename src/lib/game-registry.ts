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
    blurb: "Grow longer. Don't bump yourself!",
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
    ages: "4+",
    controlHint: "Move + Zap",
    blurb: "Clear the sparkly sky invaders.",
    status: "ready",
    accent: "#a78bfa",
    icon: "👾",
    load: () => import("@/games/space-invaders"),
  },
  {
    id: "tetris",
    title: "Tetris",
    ages: "4+",
    controlHint: "Move, rotate, drop",
    blurb: "Stack blocks and clear rows.",
    status: "ready",
    accent: "#fb7185",
    icon: "🧱",
    load: () => import("@/games/tetris"),
  },
  {
    id: "vampire-survivors",
    title: "Sparkle Survivors",
    ages: "4+",
    controlHint: "Walk with aura",
    blurb: "Your glow zaps nearby foes.",
    status: "ready",
    accent: "#c084fc",
    icon: "⚔️",
    load: () => import("@/games/vampire-survivors"),
  },
  {
    id: "castle-fight",
    title: "Castle Fight",
    ages: "4+",
    controlHint: "Train helpers",
    blurb: "Send friends to the other castle.",
    status: "ready",
    accent: "#f97316",
    icon: "🏰",
    load: () => import("@/games/castle-fight"),
  },
  {
    id: "jetpack",
    title: "Jetpack Dash",
    ages: "4+",
    controlHint: "Hold to boost",
    blurb: "Fly the cave and grab stars.",
    status: "ready",
    accent: "#22d3ee",
    icon: "🎒",
    load: () => import("@/games/jetpack"),
  },
  {
    id: "excitebike",
    title: "Dirt Bike",
    ages: "4+",
    controlHint: "Tap to jump",
    blurb: "Hop the bumps and keep rolling.",
    status: "ready",
    accent: "#84cc16",
    icon: "🏍️",
    load: () => import("@/games/excitebike"),
  },
  {
    id: "paperboy",
    title: "Paper Run",
    ages: "4+",
    controlHint: "Move + toss",
    blurb: "Deliver papers to every house.",
    status: "ready",
    accent: "#60a5fa",
    icon: "📰",
    load: () => import("@/games/paperboy"),
  },
  {
    id: "solitaire",
    title: "Solitaire",
    ages: "4+",
    controlHint: "Tap cards to move",
    blurb: "Calm card stacking to home piles.",
    status: "ready",
    accent: "#4ade80",
    icon: "🃏",
    load: () => import("@/games/solitaire"),
  },
  {
    id: "mahjong",
    title: "Mahjong",
    ages: "4+",
    controlHint: "Tap matching tiles",
    blurb: "Match pretty pairs on an open board.",
    status: "ready",
    accent: "#f472b6",
    icon: "🀄",
    load: () => import("@/games/mahjong"),
  },
  {
    id: "pinball",
    title: "Pinball",
    ages: "4+",
    controlHint: "Hold flippers",
    blurb: "Bounce the ball for points.",
    status: "ready",
    accent: "#f43f5e",
    icon: "🕹️",
    load: () => import("@/games/pinball"),
  },
];

export function getGame(id: string): GameMeta | undefined {
  return GAME_REGISTRY.find((g) => g.id === id);
}
