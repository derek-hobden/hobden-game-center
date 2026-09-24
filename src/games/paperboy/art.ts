import type { ProfileId } from "@/lib/profiles";

/**
 * Art + palette for the paper route. All sprites are real transparent PNG
 * cut-outs (see public/games/paperboy/*-cut.png); the street itself is drawn
 * on the canvas so it can scroll forever.
 */

export type StreetPalette = {
  verge: string;
  vergeDark: string;
  tree: string[];
  road: string;
  roadSpeck: string;
  roadEdge: string;
  centerLine: string[];
  curb: string;
  sidewalk: string;
  sidewalkLine: string;
  lawn: string;
  lawnDark: string;
  hedge: string;
  hedgeLight: string;
  flowers: string[];
  confetti: string[];
  ring: string;
};

export type RouteArt = {
  rider: string;
  house: string;
  paper: string;
  /** Static road hazard sprite. */
  hazard: string;
  /** Moving hazard sprite (luke's dino); keira gets a drawn rolling ball. */
  walker: string | null;
  /** Mailbox centre / door as fractions of the house sprite. */
  mailbox: { x: number; y: number };
  door: { x: number; y: number };
  palette: StreetPalette;
};

const KEIRA: RouteArt = {
  rider: "/games/paperboy/keira-rider-cut.png",
  house: "/games/paperboy/keira-house-cut.png",
  paper: "/games/paperboy/keira-paper-cut.png",
  hazard: "/games/paperboy/keira-hazard-cut.png",
  walker: null,
  mailbox: { x: 0.13, y: 0.7 },
  door: { x: 0.57, y: 0.72 },
  palette: {
    verge: "#c9f2d6",
    vergeDark: "#a6e3bb",
    tree: ["#f9a8d4", "#c4b5fd", "#a7f3d0"],
    road: "#f6dcec",
    roadSpeck: "rgba(190,120,170,0.16)",
    roadEdge: "#ffffff",
    centerLine: ["#f472b6", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa"],
    curb: "#fff7fb",
    sidewalk: "#ffeccf",
    sidewalkLine: "rgba(200,140,90,0.25)",
    lawn: "#b8efc6",
    lawnDark: "#9fe3b2",
    hedge: "#6fcf97",
    hedgeLight: "#9be7b8",
    flowers: ["#f9a8d4", "#fde68a", "#c4b5fd", "#ffffff"],
    confetti: ["#f472b6", "#fbbf24", "#a78bfa", "#34d399", "#60a5fa"],
    ring: "#f472b6",
  },
};

const LUKE: RouteArt = {
  rider: "/games/paperboy/luke-rider-cut.png",
  house: "/games/paperboy/luke-house-cut.png",
  paper: "/games/paperboy/luke-paper-cut.png",
  hazard: "/games/paperboy/luke-cone-cut.png",
  walker: "/games/paperboy/luke-dino-cut.png",
  mailbox: { x: 0.085, y: 0.66 },
  door: { x: 0.34, y: 0.56 },
  palette: {
    verge: "#86d46f",
    vergeDark: "#6cc257",
    tree: ["#3f9d4a", "#57b560", "#2f8a3d"],
    road: "#5d6675",
    roadSpeck: "rgba(255,255,255,0.07)",
    roadEdge: "#f8fafc",
    centerLine: ["#facc15"],
    curb: "#d6dbe3",
    sidewalk: "#e8ebef",
    sidewalkLine: "rgba(80,90,110,0.22)",
    lawn: "#8fdc72",
    lawnDark: "#7ccd60",
    hedge: "#3f9d4a",
    hedgeLight: "#62bb5e",
    flowers: ["#facc15", "#ffffff", "#f87171", "#60a5fa"],
    confetti: ["#0ea5e9", "#facc15", "#22c55e", "#f97316", "#ffffff"],
    ring: "#0ea5e9",
  },
};

export function artFor(profileId: ProfileId): RouteArt {
  switch (profileId) {
    case "keira":
      return KEIRA;
    case "luke":
      return LUKE;
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

export const SPARKLE_SRC = "/games/paperboy/sparkle-cut.png";

export type RouteSprites = {
  rider: HTMLImageElement;
  house: HTMLImageElement;
  paper: HTMLImageElement;
  hazard: HTMLImageElement;
  walker: HTMLImageElement | null;
  sparkle: HTMLImageElement;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadRouteSprites(art: RouteArt): Promise<RouteSprites> {
  const [rider, house, paper, hazard, walker, sparkle] = await Promise.all([
    loadImage(art.rider),
    loadImage(art.house),
    loadImage(art.paper),
    loadImage(art.hazard),
    art.walker ? loadImage(art.walker) : Promise.resolve(null),
    loadImage(SPARKLE_SRC),
  ]);
  return { rider, house, paper, hazard, walker, sparkle };
}

/** Cheap deterministic hash → [0,1) for scenery placement. */
export function hash01(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
