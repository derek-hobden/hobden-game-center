import type { ProfileId } from "@/lib/profiles";

export const PAPERBOY_ART = {
  keira: {
    bg: "/games/paperboy/keira-bg.png",
    rider: "/games/paperboy/keira-rider.png",
    house: "/games/paperboy/keira-house.png",
    paper: "/games/paperboy/keira-paper.png",
    hazard: "/games/paperboy/keira-hazard.png",
  },
  luke: {
    bg: "/games/paperboy/luke-bg.png",
    rider: "/games/paperboy/luke-rider.png",
    house: "/games/paperboy/luke-house.png",
    paper: "/games/paperboy/luke-paper.png",
    hazard: "/games/paperboy/luke-hazard.png",
  },
  sparkle: "/games/paperboy/hit-sparkle.png",
} as const;

export type PaperboySpriteKey =
  | "bg"
  | "rider"
  | "house"
  | "paper"
  | "hazard"
  | "sparkle";

export type PaperboySprites = Record<PaperboySpriteKey, CanvasImageSource>;

export function artFor(profileId: ProfileId) {
  switch (profileId) {
    case "keira":
      return PAPERBOY_ART.keira;
    case "luke":
      return PAPERBOY_ART.luke;
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

function isMagenta(r: number, g: number, b: number) {
  return r > 170 && b > 170 && g < 140 && r + b - g > 260;
}

export function keyMagenta(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (isMagenta(px[i], px[i + 1], px[i + 2])) {
      px[i + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function loadPaperboySprites(
  profileId: ProfileId,
): Promise<PaperboySprites> {
  const pack = artFor(profileId);
  const [bg, rider, house, paper, hazard, sparkle] = await Promise.all([
    loadImage(pack.bg),
    loadImage(pack.rider),
    loadImage(pack.house),
    loadImage(pack.paper),
    loadImage(pack.hazard),
    loadImage(PAPERBOY_ART.sparkle),
  ]);
  return {
    bg,
    rider,
    house,
    paper: keyMagenta(paper),
    hazard,
    sparkle: keyMagenta(sparkle),
  };
}

export function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 16,
) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}
