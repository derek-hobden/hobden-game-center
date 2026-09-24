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
      return "/games/mahjong/keira-unicorn.jpg";
    case "rainbow":
      return "/games/mahjong/keira-rainbow.jpg";
    case "fairy":
      return "/games/mahjong/keira-fairy.jpg";
    case "mermaid":
      return "/games/mahjong/keira-mermaid.jpg";
    case "crown":
      return "/games/mahjong/keira-crown.jpg";
    case "pearl":
      return "/games/mahjong/keira-pearl.jpg";
    case "blossom":
      return "/games/mahjong/keira-blossom.jpg";
    case "star":
      return "/games/mahjong/keira-star.jpg";
    case "rocket":
      return "/games/mahjong/luke-rocket.jpg";
    case "dino":
      return "/games/mahjong/luke-dino.jpg";
    case "bike":
      return "/games/mahjong/luke-bike.jpg";
    case "ball":
      return "/games/mahjong/luke-ball.jpg";
    case "fish":
      return "/games/mahjong/luke-fish.jpg";
    case "robot":
      return "/games/mahjong/luke-robot.jpg";
    case "car":
      return "/games/mahjong/luke-car.jpg";
    case "planet":
      return "/games/mahjong/luke-planet.jpg";
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
      return "/games/mahjong/keira-table.jpg";
    case "luke":
      return "/games/mahjong/luke-table.jpg";
    default:
      return assertNever(profileId);
  }
}

export function winSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/mahjong/keira-win.jpg";
    case "luke":
      return "/games/mahjong/luke-win.jpg";
    default:
      return assertNever(profileId);
  }
}

/** Side (thickness) colour per layer, so stacked tiles read at a glance. */
export function layerColors(profileId: ProfileId): string[] {
  switch (profileId) {
    case "keira":
      return ["#dcb994", "#f472b6", "#a78bfa", "#2dd4bf"];
    case "luke":
      return ["#c9ab7c", "#0ea5e9", "#f59e0b", "#22c55e"];
    default:
      return assertNever(profileId);
  }
}

export function blockedCopy(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Hiding! Take the tile on top first.";
    case "luke":
      return "Buried! Clear the tile on top first.";
    default:
      return assertNever(profileId);
  }
}

export function introCopy(level: number): string {
  return level === 0
    ? "Tap two tiles that match!"
    : `Level ${level + 1} — bright tiles are free!`;
}
