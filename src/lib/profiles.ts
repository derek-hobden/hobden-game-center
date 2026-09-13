export type ProfileId = "keira" | "luke";

export type ProfileTheme = {
  id: ProfileId;
  name: string;
  tagline: string;
  greeting: string;
  menuHint: string;
  accent: string;
  accentFg: string;
  ink: string;
  surface: string;
  surface2: string;
  skyFrom: string;
  skyTo: string;
  tileGlow: string;
  pattern: string;
  emoji: string;
  gameNames: Record<string, string>;
};

export const PROFILES: Record<ProfileId, ProfileTheme> = {
  keira: {
    id: "keira",
    name: "Keira",
    tagline: "Rainbow trails & fairy gardens",
    greeting: "Hi Keira! Pick a game.",
    menuHint: "Big soft taps. Pause anytime.",
    accent: "#f472b6",
    accentFg: "#3b0a2a",
    ink: "#3b1d4a",
    surface: "#fff7fb",
    surface2: "#ffe4f1",
    skyFrom: "#ffe8f5",
    skyTo: "#d8f5ff",
    tileGlow: "rgba(244, 114, 182, 0.35)",
    pattern:
      "radial-gradient(circle at 20% 20%, rgba(255,182,193,0.45), transparent 40%), radial-gradient(circle at 80% 10%, rgba(167,243,208,0.4), transparent 35%), radial-gradient(circle at 60% 80%, rgba(125,211,252,0.35), transparent 40%)",
    emoji: "🦄",
    gameNames: {
      snake: "Rainbow Snake",
      flappy: "Fairy Flutter",
      minesweeper: "Treasure Meadow",
      "match-2": "Magic Match",
      "space-invaders": "Star Sparkles",
      tetris: "Block Castle",
      "vampire-survivors": "Sparkle Survivors",
      "castle-fight": "Fairy Castle Fight",
      jetpack: "Mermaid Jetpack",
      excitebike: "Unicorn Bike",
      paperboy: "Princess Post",
      solitaire: "Card Garden",
      mahjong: "Pearl Match",
      pinball: "Rainbow Pinball",
    },
  },
  luke: {
    id: "luke",
    name: "Luke",
    tagline: "Rockets, reefs & race tracks",
    greeting: "Hey Luke! Choose your mission.",
    menuHint: "Tap big buttons. Pause anytime.",
    accent: "#0ea5e9",
    accentFg: "#042f4a",
    ink: "#0b2a3d",
    surface: "#f0f9ff",
    surface2: "#dbeafe",
    skyFrom: "#e0f2fe",
    skyTo: "#bbf7d0",
    tileGlow: "rgba(14, 165, 233, 0.35)",
    pattern:
      "radial-gradient(circle at 15% 25%, rgba(56,189,248,0.4), transparent 40%), radial-gradient(circle at 85% 15%, rgba(250,204,21,0.35), transparent 35%), radial-gradient(circle at 55% 85%, rgba(34,197,94,0.3), transparent 40%)",
    emoji: "🚀",
    gameNames: {
      snake: "Rocket Snake",
      flappy: "Jet Flutter",
      minesweeper: "Mine Field Scout",
      "match-2": "Mission Match",
      "space-invaders": "Space Invaders",
      tetris: "Block Drop",
      "vampire-survivors": "Night Survivors",
      "castle-fight": "Castle Fight",
      jetpack: "Jetpack Dash",
      excitebike: "Dirt Bike",
      paperboy: "Paper Run",
      solitaire: "Card Deck",
      mahjong: "Tile Match",
      pinball: "Arcade Pinball",
    },
  },
};

export const PROFILE_STORAGE_KEY = "hobden-game-center-profile";
