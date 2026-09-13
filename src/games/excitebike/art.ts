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
  rider: "/games/excitebike/keira-rider.png?v=2",
  pickup: "/games/excitebike/keira-pickup.png?v=2",
  hill: "/games/excitebike/keira-hill.png?v=2",
  sky: "/games/excitebike/keira-sky.png?v=2",
  card: "/games/excitebike/keira-card.png?v=2",
  grass: "#86efac",
  dirt: "#f9a8d4",
  track: "#fb7185",
  pickupLabel: "Star!",
  winCopy: "Rainbow finish!",
  oopsCopy: "Splash! Try again.",
};

const LUKE: ExcitebikePack = {
  rider: "/games/excitebike/luke-rider.png?v=2",
  pickup: "/games/excitebike/luke-pickup.png?v=2",
  hill: "/games/excitebike/luke-hill.png?v=2",
  sky: "/games/excitebike/luke-sky.png?v=2",
  card: "/games/excitebike/luke-card.png?v=2",
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

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}
