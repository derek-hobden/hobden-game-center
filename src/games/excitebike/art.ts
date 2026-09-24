import type { ProfileId } from "@/lib/profiles";

const DIR = "/games/excitebike";

/**
 * The rider sprite is split into a body and two separately-drawn wheels so
 * the wheels can really spin. Geometry is in the ORIGINAL sprite's pixels
 * (`w` wide); the drawn size is scaled by riderWidth / w.
 */
export type RiderRig = {
  w: number;
  h: number;
  /** Wheel centre, horizontal/vertical radius and wheel-sprite half size. */
  wheels: [RigWheel, RigWheel];
};
type RigWheel = { cx: number; cy: number; rx: number; ry: number; S: number };

export type BikePack = {
  body: string;
  wheels: [string, string];
  rig: RiderRig;
  /** Drawn rider width in game units. */
  riderWidth: number;
  gem: string;
  mound: string;
  sky: string;
  card: string;
  riderName: string;
  gemName: string;
  // palette
  farHill: string;
  midHill: string;
  grass: string;
  grassLight: string;
  track: string;
  trackDots: string;
  dirtTop: string;
  dirtBottom: string;
  ramp: string[];
  rampEdge: string;
  block: "candy" | "hay";
  mud: string;
  mudShine: string;
  tree: string;
  treeTrunk: string;
  dust: string[];
  startCopy: string;
  winCopy: string;
  oopsCopy: string;
};

const KEIRA: BikePack = {
  body: `${DIR}/keira-body.png`,
  wheels: [`${DIR}/keira-wheel0.png`, `${DIR}/keira-wheel1.png`],
  rig: {
    w: 650,
    h: 796,
    wheels: [
      { cx: 151, cy: 665, rx: 108, ry: 119, S: 129 },
      { cx: 536, cy: 673, rx: 112, ry: 122, S: 132 },
    ],
  },
  riderWidth: 84,
  gem: `${DIR}/keira-gem.png`,
  mound: `${DIR}/keira-mound.png`,
  sky: `${DIR}/keira-sky.jpg`,
  card: `${DIR}/keira-card.jpg`,
  riderName: "Unicorn",
  gemName: "stars",
  farHill: "#d8c4f0",
  midHill: "#b9e4b0",
  grass: "#8fd694",
  grassLight: "#c6f1bf",
  track: "#f7b6d8",
  trackDots: "#ffffff",
  dirtTop: "#e9b3c9",
  dirtBottom: "#b98bb8",
  ramp: ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#a78bfa"],
  rampEdge: "#7c3aed",
  block: "candy",
  mud: "#a78bfa",
  mudShine: "#e9d5ff",
  tree: "#f9a8d4",
  treeTrunk: "#a16207",
  dust: ["#fbcfe8", "#ffffff", "#e9d5ff"],
  startCopy: "Hold GAS to ride. Tap JUMP to hop over the candy blocks!",
  winCopy: "Rainbow finish!",
  oopsCopy: "Out of hearts! Have another go.",
};

const LUKE: BikePack = {
  body: `${DIR}/luke-body.png`,
  wheels: [`${DIR}/luke-wheel0.png`, `${DIR}/luke-wheel1.png`],
  rig: {
    w: 803,
    h: 687,
    wheels: [
      { cx: 125, cy: 556, rx: 126, ry: 126, S: 137 },
      { cx: 668, cy: 556, rx: 127, ry: 127, S: 138 },
    ],
  },
  riderWidth: 100,
  gem: `${DIR}/luke-gem.png`,
  mound: `${DIR}/luke-mound.png`,
  sky: `${DIR}/luke-sky.jpg`,
  card: `${DIR}/luke-card.jpg`,
  riderName: "Dino",
  gemName: "coins",
  farHill: "#9fc6a0",
  midHill: "#7fb36a",
  grass: "#6aa84f",
  grassLight: "#a3d977",
  track: "#b07a45",
  trackDots: "#8a5a2b",
  dirtTop: "#9a6536",
  dirtBottom: "#5e3a1c",
  ramp: ["#d4a373", "#c08552"],
  rampEdge: "#6b4226",
  block: "hay",
  mud: "#6b4423",
  mudShine: "#a47148",
  tree: "#3f8f4a",
  treeTrunk: "#6b4226",
  dust: ["#d6b48a", "#c9a27a", "#eadbc8"],
  startCopy: "Hold GAS to ride. Tap JUMP to hop over the hay bales!",
  winCopy: "Track finished!",
  oopsCopy: "Out of hearts! Have another go.",
};

export function packFor(profileId: ProfileId): BikePack {
  switch (profileId) {
    case "keira":
      return KEIRA;
    case "luke":
      return LUKE;
    default: {
      const never: never = profileId;
      return never;
    }
  }
}
