import type { ProfileId } from "@/lib/profiles";

const DIR = "/games/castle-fight";

export type CastlePack = {
  battlefield: string;
  homeCastle: string;
  foeCastle: string;
  small: string;
  big: string;
  foe: string;
  coin: string;
  smallName: string;
  bigName: string;
  foeName: string;
  /** Sky gradient for the top band (behind the painted backdrop). */
  sky: [string, string];
  /** Meadow gradient, top → bottom. */
  meadow: [string, string];
  path: string;
  pathEdge: string;
  flowers: string[];
  tuft: string;
  zap: string;
  startTitle: string;
  startCopy: string;
  winCopy: string;
  loseCopy: string;
};

const KEIRA: CastlePack = {
  battlefield: `${DIR}/battlefield-keira.jpg`,
  homeCastle: `${DIR}/castle-home-keira-cut.png`,
  foeCastle: `${DIR}/castle-foe-keira-cut.png`,
  small: `${DIR}/unit-fairy-cut.png`,
  big: `${DIR}/unit-unicorn-cut.png`,
  foe: `${DIR}/unit-foe-sprite-cut.png`,
  coin: `${DIR}/gold-coin-cut.png`,
  smallName: "Fairy",
  bigName: "Unicorn",
  foeName: "Grumble",
  sky: ["#ffd3ea", "#fff1e2"],
  meadow: ["#cdeeb4", "#9fd98c"],
  path: "#f6e2c6",
  pathEdge: "#e2bf97",
  flowers: ["#f9a8d4", "#c4b5fd", "#fde68a", "#ffffff", "#f472b6"],
  tuft: "#86c46f",
  zap: "#f472b6",
  startTitle: "Fairy Castle Fight",
  startCopy: "Send fairies and unicorns up the path to knock down the crystal castle!",
  winCopy: "The crystal castle tumbled down!",
  loseCopy: "The Grumbles reached your castle. Try again!",
};

const LUKE: CastlePack = {
  battlefield: `${DIR}/battlefield-luke.jpg`,
  homeCastle: `${DIR}/castle-home-luke-cut.png`,
  foeCastle: `${DIR}/castle-foe-luke-cut.png`,
  small: `${DIR}/unit-knight-cut.png`,
  big: `${DIR}/unit-dino-cut.png`,
  foe: `${DIR}/unit-foe-robot-cut.png`,
  coin: `${DIR}/gold-coin-cut.png`,
  smallName: "Knight",
  bigName: "Dino",
  foeName: "Robot",
  sky: ["#8fd3ff", "#e3f6ff"],
  meadow: ["#b5dd7a", "#86bf4f"],
  path: "#d9b27c",
  pathEdge: "#a97c47",
  flowers: ["#fde047", "#ffffff", "#fb923c", "#a3e635"],
  tuft: "#5f9e35",
  zap: "#38bdf8",
  startTitle: "Castle Fight",
  startCopy: "Send knights and dinos up the path to knock down the robot fort!",
  winCopy: "The robot fort crumbled!",
  loseCopy: "The robots reached your castle. Try again!",
};

export function castlePack(profileId: ProfileId): CastlePack {
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
