import type { ProfileId } from "@/lib/profiles";

/** Kids count 1–7 instead of A–7. */
export const RANKS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export const KEIRA_SUIT_NAMES = ["Blossom", "Gem", "Moon", "Star"] as const;
export const LUKE_SUIT_NAMES = ["Rocket", "Dino", "Bike", "Ball"] as const;

function assertNever(value: never): never {
  throw new Error(`Unhandled solitaire variant: ${String(value)}`);
}

export function suitName(profileId: ProfileId, suit: number): string {
  switch (profileId) {
    case "keira":
      return KEIRA_SUIT_NAMES[suit] ?? "Suit";
    case "luke":
      return LUKE_SUIT_NAMES[suit] ?? "Suit";
    default:
      return assertNever(profileId);
  }
}

export function feltSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/solitaire/keira-felt.jpg";
    case "luke":
      return "/games/solitaire/luke-felt.jpg";
    default:
      return assertNever(profileId);
  }
}

export function backSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/solitaire/keira-back.jpg";
    case "luke":
      return "/games/solitaire/luke-back.jpg";
    default:
      return assertNever(profileId);
  }
}

export function winSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/solitaire/keira-win.jpg";
    case "luke":
      return "/games/solitaire/luke-win.jpg";
    default:
      return assertNever(profileId);
  }
}

export function suitSrc(profileId: ProfileId, suit: number): string {
  const safe = Math.max(0, Math.min(3, suit));
  switch (profileId) {
    case "keira":
      return `/games/solitaire/keira-suit-${safe}-cut.png`;
    case "luke":
      return `/games/solitaire/luke-suit-${safe}-cut.png`;
    default:
      return assertNever(profileId);
  }
}

/** Rank colour by "team" (suits alternate teams, like red/black). */
export function rankColor(profileId: ProfileId, suit: number): string {
  const even = suit % 2 === 0;
  switch (profileId) {
    case "keira":
      return even ? "#d6247a" : "#6d28d9";
    case "luke":
      return even ? "#0369a1" : "#c2410c";
    default:
      return assertNever(profileId);
  }
}

export function teamNames(profileId: ProfileId): [string, string] {
  switch (profileId) {
    case "keira":
      return ["pink", "purple"];
    case "luke":
      return ["blue", "orange"];
    default:
      return assertNever(profileId);
  }
}

export function homeWord(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "nests";
    case "luke":
      return "launch pads";
    default:
      return assertNever(profileId);
  }
}
