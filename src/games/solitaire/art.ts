import type { ProfileId } from "@/lib/profiles";

export const RANKS = ["A", "2", "3", "4", "5", "6", "7"] as const;

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
      return `/games/solitaire/keira-suit-${safe}.jpg`;
    case "luke":
      return `/games/solitaire/luke-suit-${safe}.jpg`;
    default:
      return assertNever(profileId);
  }
}

export function rankTone(profileId: ProfileId, suit: number): string {
  const even = suit % 2 === 0;
  switch (profileId) {
    case "keira":
      return even ? "text-[#c02677]" : "text-[#6d28d9]";
    case "luke":
      return even ? "text-[#0369a1]" : "text-[#b45309]";
    default:
      return assertNever(profileId);
  }
}

export function hintCopy(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Tap a card, then a glowing nest. Double-tap sends it home.";
    case "luke":
      return "Tap a card, then a glowing pad. Double-tap sends it home.";
    default:
      return assertNever(profileId);
  }
}
