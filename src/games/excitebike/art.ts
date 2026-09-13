import type { ProfileId } from "@/lib/profiles";

export type ExcitebikePack = {
  rider: string;
  pickup: string;
  hill: string;
  sky: string;
  card: string;
  grass: string;
  dirt: string;
  track: string;
  pickupLabel: string;
  winCopy: string;
  oopsCopy: string;
};

const KEIRA: ExcitebikePack = {
  rider: "/games/excitebike/keira-rider.png",
  pickup: "/games/excitebike/keira-pickup.png",
  hill: "/games/excitebike/keira-hill.png",
  sky: "/games/excitebike/keira-sky.png",
  card: "/games/excitebike/keira-card.png",
  grass: "#86efac",
  dirt: "#f9a8d4",
  track: "#fb7185",
  pickupLabel: "Star!",
  winCopy: "Rainbow finish!",
  oopsCopy: "Splash! Try again.",
};

const LUKE: ExcitebikePack = {
  rider: "/games/excitebike/luke-rider.png",
  pickup: "/games/excitebike/luke-pickup.png",
  hill: "/games/excitebike/luke-hill.png",
  sky: "/games/excitebike/luke-sky.png",
  card: "/games/excitebike/luke-card.png",
  grass: "#a3e635",
  dirt: "#a16207",
  track: "#78716c",
  pickupLabel: "Coin!",
  winCopy: "Track finished!",
  oopsCopy: "Wipeout! Race again.",
};

export function packFor(profileId: ProfileId): ExcitebikePack {
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

export function chromaKeyImage(src: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(src, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 170 && b > 160 && g < 110) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}
