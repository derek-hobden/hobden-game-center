import type { ProfileId } from "@/lib/profiles";

export type TileKind =
  | "unicorn"
  | "rainbow"
  | "fairy"
  | "mermaid"
  | "crown"
  | "pearl"
  | "blossom"
  | "star"
  | "rocket"
  | "dino"
  | "bike"
  | "ball"
  | "fish"
  | "robot"
  | "car"
  | "planet";

export type Slot = {
  id: number;
  col: number;
  row: number;
  layer: 0 | 1;
  covers: number[];
};

const KEIRA_KINDS: TileKind[] = [
  "unicorn",
  "rainbow",
  "fairy",
  "mermaid",
  "crown",
  "pearl",
  "blossom",
  "star",
];

const LUKE_KINDS: TileKind[] = [
  "rocket",
  "dino",
  "bike",
  "ball",
  "fish",
  "robot",
  "car",
  "planet",
];

function assertNever(value: never): never {
  throw new Error(`Unhandled mahjong variant: ${String(value)}`);
}

export function kindsFor(profileId: ProfileId): TileKind[] {
  switch (profileId) {
    case "keira":
      return KEIRA_KINDS;
    case "luke":
      return LUKE_KINDS;
    default:
      return assertNever(profileId);
  }
}

export function tileSrc(kind: TileKind): string {
  switch (kind) {
    case "unicorn":
      return "/games/mahjong/keira-unicorn.png";
    case "rainbow":
      return "/games/mahjong/keira-rainbow.png";
    case "fairy":
      return "/games/mahjong/keira-fairy.png";
    case "mermaid":
      return "/games/mahjong/keira-mermaid.png";
    case "crown":
      return "/games/mahjong/keira-crown.png";
    case "pearl":
      return "/games/mahjong/keira-pearl.png";
    case "blossom":
      return "/games/mahjong/keira-blossom.png";
    case "star":
      return "/games/mahjong/keira-star.png";
    case "rocket":
      return "/games/mahjong/luke-rocket.png";
    case "dino":
      return "/games/mahjong/luke-dino.png";
    case "bike":
      return "/games/mahjong/luke-bike.png";
    case "ball":
      return "/games/mahjong/luke-ball.png";
    case "fish":
      return "/games/mahjong/luke-fish.png";
    case "robot":
      return "/games/mahjong/luke-robot.png";
    case "car":
      return "/games/mahjong/luke-car.png";
    case "planet":
      return "/games/mahjong/luke-planet.png";
    default:
      return assertNever(kind);
  }
}

export function kindLabel(kind: TileKind): string {
  switch (kind) {
    case "unicorn":
      return "Unicorn";
    case "rainbow":
      return "Rainbow";
    case "fairy":
      return "Fairy";
    case "mermaid":
      return "Mermaid";
    case "crown":
      return "Crown";
    case "pearl":
      return "Pearl";
    case "blossom":
      return "Blossom";
    case "star":
      return "Star";
    case "rocket":
      return "Rocket";
    case "dino":
      return "Dino";
    case "bike":
      return "Bike";
    case "ball":
      return "Ball";
    case "fish":
      return "Fish";
    case "robot":
      return "Robot";
    case "car":
      return "Car";
    case "planet":
      return "Planet";
    default:
      return assertNever(kind);
  }
}

export function tableSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/mahjong/keira-table.png";
    case "luke":
      return "/games/mahjong/luke-table.png";
    default:
      return assertNever(profileId);
  }
}

export function winSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/mahjong/keira-win.png";
    case "luke":
      return "/games/mahjong/luke-win.png";
    default:
      return assertNever(profileId);
  }
}

export function hintCopy(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Tap two matching pictures. Top tiles come off first.";
    case "luke":
      return "Tap two matching pictures. Clear the top tiles first.";
    default:
      return assertNever(profileId);
  }
}

export function blockedCopy(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "That tile is hiding — tap the one on top first.";
    case "luke":
      return "Buried! Clear the tile sitting on top first.";
    default:
      return assertNever(profileId);
  }
}

export function missCopy(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Not a pair — try two that look the same.";
    case "luke":
      return "Not a match — pick two that look the same.";
    default:
      return assertNever(profileId);
  }
}

/** 4×4 base plus four stacked tiles on the center. */
export const SLOTS: Slot[] = [
  ...Array.from({ length: 16 }, (_, id) => ({
    id,
    col: id % 4,
    row: Math.floor(id / 4),
    layer: 0 as const,
    covers: [] as number[],
  })),
  { id: 16, col: 1, row: 1, layer: 1, covers: [5] },
  { id: 17, col: 2, row: 1, layer: 1, covers: [6] },
  { id: 18, col: 1, row: 2, layer: 1, covers: [9] },
  { id: 19, col: 2, row: 2, layer: 1, covers: [10] },
];

export const PAIR_COUNT = 10;
