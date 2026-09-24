import type { ProfileId } from "@/lib/profiles";
import { ARC, BALL_R, FLIPPERS, H, LANE_X, PLUNGER_Y, W, type Table } from "@/games/pinball/physics";

export type Skin = {
  id: ProfileId;
  ball: string;
  bumper: string;
  bgStops: [number, string][];
  frame: string;
  frameHi: string;
  rail: string;
  railHi: string;
  railShadow: string;
  stud: string;
  popColor: string;
  popStroke: string;
  sparks: string[];
  lightOn: string;
  lightOff: string;
  target: string;
  sling: string;
  slingEdge: string;
  ringIdle: string;
  glow: (a: number) => string;
  multOn: string;
  multOff: string;
  textDim: string;
  hudText: string;
  banner: string;
  flipper: string;
  flipperHi: string;
  flipperEdge: string;
  spring: string;
  plunger: string;
  trail: string;
  deco: string;
};

const KEIRA: Skin = {
  id: "keira",
  ball: "/games/pinball/keira-ball-s.png",
  bumper: "/games/pinball/keira-bumper-s.png",
  bgStops: [
    [0, "#ffd1ea"],
    [0.35, "#f3d4ff"],
    [0.7, "#d6e8ff"],
    [1, "#c9f7e4"],
  ],
  frame: "#f9c5e0",
  frameHi: "#fff1f8",
  rail: "#f5a3cd",
  railHi: "#ffe4f2",
  railShadow: "rgba(170,60,120,0.35)",
  stud: "#fcd34d",
  popColor: "#db2777",
  popStroke: "#ffffff",
  sparks: ["#f472b6", "#c084fc", "#fde68a", "#ffffff", "#5eead4"],
  lightOn: "#ec4899",
  lightOff: "rgba(255,255,255,0.55)",
  target: "#c084fc",
  sling: "#e9d5ff",
  slingEdge: "#c084fc",
  ringIdle: "rgba(255,255,255,0.45)",
  glow: (a) => `rgba(253,224,71,${0.35 + a * 0.5})`,
  multOn: "rgba(236,72,153,0.35)",
  multOff: "rgba(255,255,255,0.35)",
  textDim: "rgba(131,24,67,0.55)",
  hudText: "#9d174d",
  banner: "#db2777",
  flipper: "#f472b6",
  flipperHi: "#ffe4f1",
  flipperEdge: "#be185d",
  spring: "#c084fc",
  plunger: "#f472b6",
  trail: "#f9a8d4",
  deco: "rgba(255,255,255,0.55)",
};

const LUKE: Skin = {
  id: "luke",
  ball: "/games/pinball/luke-ball-s.png",
  bumper: "/games/pinball/luke-bumper-s.png",
  bgStops: [
    [0, "#0b1c3d"],
    [0.5, "#0f3557"],
    [1, "#0a2238"],
  ],
  frame: "#1e293b",
  frameHi: "#475569",
  rail: "#94a3b8",
  railHi: "#f1f5f9",
  railShadow: "rgba(0,0,0,0.5)",
  stud: "#f59e0b",
  popColor: "#fde047",
  popStroke: "#0b1c3d",
  sparks: ["#fde047", "#f97316", "#38bdf8", "#ffffff", "#4ade80"],
  lightOn: "#facc15",
  lightOff: "rgba(255,255,255,0.16)",
  target: "#f97316",
  sling: "#164e63",
  slingEdge: "#38bdf8",
  ringIdle: "rgba(56,189,248,0.25)",
  glow: (a) => `rgba(250,204,21,${0.3 + a * 0.55})`,
  multOn: "rgba(250,204,21,0.3)",
  multOff: "rgba(255,255,255,0.08)",
  textDim: "rgba(226,232,240,0.5)",
  hudText: "#bae6fd",
  banner: "#facc15",
  flipper: "#f97316",
  flipperHi: "#fed7aa",
  flipperEdge: "#ffffff",
  spring: "#cbd5e1",
  plunger: "#f97316",
  trail: "#38bdf8",
  deco: "rgba(255,255,255,0.7)",
};

export function skinFor(profileId: ProfileId): Skin {
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

function rand(seed: number) {
  const s = Math.sin(seed * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

function tablePath(ctx: CanvasRenderingContext2D, t: Table) {
  ctx.beginPath();
  ctx.moveTo(t.pfL, H + 10);
  ctx.lineTo(t.pfL, ARC.y);
  ctx.arc(ARC.x, ARC.y, ARC.r, Math.PI, 0, false);
  ctx.lineTo(t.laneR, H + 10);
  ctx.closePath();
}

function rail(
  ctx: CanvasRenderingContext2D,
  skin: Skin,
  draw: () => void,
  width: number,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.save();
  ctx.shadowColor = skin.railShadow;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.strokeStyle = skin.rail;
  ctx.lineWidth = width;
  draw();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = skin.railHi;
  ctx.lineWidth = Math.max(1.5, width * 0.28);
  ctx.globalAlpha = 0.8;
  draw();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Everything that never moves, rendered once into an offscreen layer. */
export function drawStaticTable(ctx: CanvasRenderingContext2D, t: Table, skin: Skin) {
  const keira = skin.id === "keira";
  // Cabinet frame.
  const fg = ctx.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, skin.frameHi);
  fg.addColorStop(1, skin.frame);
  ctx.fillStyle = fg;
  ctx.fillRect(0, 0, W, H);

  // Playfield.
  ctx.save();
  tablePath(ctx, t);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  for (const [o, c] of skin.bgStops) bg.addColorStop(o, c);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (keira) {
    // Rainbow arch behind the bumpers.
    const cols = ["#fda4af", "#fdba74", "#fde68a", "#86efac", "#93c5fd", "#c4b5fd"];
    cols.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(t.center, 300, 150 - i * 9, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // Mermaid-scale pattern low on the table.
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 14; col++) {
        const x = t.pfL + col * 24 + (row % 2) * 12;
        const y = 380 + row * 14;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
    }
    // Clouds
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const [cx, cy, s] of [
      [70, 120, 1],
      [262, 118, 0.9],
      [60, 360, 0.7],
      [270, 380, 0.75],
    ] as const) {
      for (const [ox, oy, r] of [
        [-14, 2, 10],
        [0, -4, 14],
        [15, 2, 10],
      ] as const) {
        ctx.beginPath();
        ctx.arc(cx + ox * s, cy + oy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Sparkles
    for (let i = 0; i < 46; i++) {
      const x = t.pfL + rand(i) * (t.laneR - t.pfL);
      const y = 20 + rand(i + 100) * 520;
      const s = 1.5 + rand(i + 200) * 2.5;
      ctx.fillStyle = i % 3 ? "rgba(255,255,255,0.9)" : "rgba(253,224,71,0.9)";
      ctx.beginPath();
      ctx.moveTo(x, y - s * 2);
      ctx.lineTo(x + s * 0.5, y - s * 0.5);
      ctx.lineTo(x + s * 2, y);
      ctx.lineTo(x + s * 0.5, y + s * 0.5);
      ctx.lineTo(x, y + s * 2);
      ctx.lineTo(x - s * 0.5, y + s * 0.5);
      ctx.lineTo(x - s * 2, y);
      ctx.lineTo(x - s * 0.5, y - s * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Starfield
    for (let i = 0; i < 120; i++) {
      const x = rand(i) * W;
      const y = rand(i + 300) * H;
      const r = rand(i + 600) * 1.4 + 0.3;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + rand(i + 900) * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Planet
    const pg = ctx.createRadialGradient(262, 110, 4, 270, 120, 34);
    pg.addColorStop(0, "#fdba74");
    pg.addColorStop(1, "#c2410c");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(270, 118, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(253,230,138,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(270, 118, 42, 10, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    // Comets
    for (const [x, y, len, c] of [
      [60, 150, 60, "#fb923c"],
      [250, 420, 70, "#38bdf8"],
      [70, 380, 50, "#facc15"],
    ] as const) {
      const cg = ctx.createLinearGradient(x - len, y - len * 0.5, x, y);
      cg.addColorStop(0, "rgba(255,255,255,0)");
      cg.addColorStop(1, c);
      ctx.strokeStyle = cg;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x - len, y - len * 0.5);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Radar rings under the bumpers
    ctx.strokeStyle = "rgba(56,189,248,0.18)";
    ctx.lineWidth = 2;
    for (let r = 40; r <= 130; r += 30) {
      ctx.beginPath();
      ctx.arc(t.center, 232, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Inlane arrows pointing up the table (decor).
  ctx.fillStyle = skin.deco;
  for (const [x, y] of [
    [t.center, 330],
    [t.center - 18, 346],
    [t.center + 18, 346],
  ] as const) {
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x + 7, y + 3);
    ctx.lineTo(x - 7, y + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Drain shading at the bottom.
  const dg = ctx.createLinearGradient(0, 560, 0, H);
  dg.addColorStop(0, "rgba(0,0,0,0)");
  dg.addColorStop(1, keira ? "rgba(157,23,77,0.25)" : "rgba(0,0,0,0.55)");
  ctx.fillStyle = dg;
  ctx.fillRect(0, 560, W, 80);

  // Plunger lane floor.
  ctx.fillStyle = keira ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
  ctx.fillRect(t.laneLeft, 200, t.laneR - t.laneLeft, H);
  ctx.restore();

  // Aprons under the inlane guides.
  ctx.fillStyle = skin.frame;
  const [lf, rf] = FLIPPERS;
  for (const pts of [
    [
      [t.pfL - 4, 452],
      [lf.x - 4, lf.y - 4],
      [lf.x - 4, H],
      [t.pfL - 4, H],
    ],
    [
      [t.pfR + 4, 452],
      [rf.x + 4, rf.y - 4],
      [rf.x + 4, H],
      [t.pfR + 4, H],
    ],
  ]) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }

  // Rails.
  rail(ctx, skin, () => {
    ctx.beginPath();
    ctx.moveTo(t.pfL, 452);
    ctx.lineTo(t.pfL, ARC.y);
    ctx.arc(ARC.x, ARC.y, ARC.r, Math.PI, 0, false);
    ctx.lineTo(t.laneR, H + 10);
  }, 8);
  rail(ctx, skin, () => {
    ctx.beginPath();
    ctx.moveTo(t.pfR, 204);
    ctx.lineTo(t.pfR, H + 10);
  }, 7);
  rail(ctx, skin, () => {
    ctx.beginPath();
    ctx.moveTo(t.pfL, 452);
    ctx.lineTo(lf.x - 6, lf.y - 6);
    ctx.moveTo(t.pfR, 452);
    ctx.lineTo(rf.x + 6, rf.y - 6);
  }, 9);
  for (const x of t.laneXs) {
    rail(ctx, skin, () => {
      ctx.beginPath();
      ctx.moveTo(x, 74);
      ctx.lineTo(x, 100);
    }, 6);
  }
  // Posts
  for (const p of t.posts) {
    ctx.fillStyle = skin.rail;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.stud;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Studs along the arch.
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    ctx.fillStyle = skin.stud;
    ctx.beginPath();
    ctx.arc(ARC.x + Math.cos(a) * (ARC.r + 7), ARC.y - Math.sin(a) * (ARC.r + 7), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Lane labels
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 9px system-ui, sans-serif";
  ctx.fillStyle = skin.textDim;
  ctx.fillText("LIGHT ALL 3 = BONUS x", t.center, 62);
  ctx.save();
  ctx.translate(t.pfL + 24, 318);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("JACKPOT", 0, 0);
  ctx.restore();

  // Plunger housing
  ctx.fillStyle = skin.frame;
  ctx.fillRect(t.laneLeft + 3, PLUNGER_Y + BALL_R + 4, t.laneR - t.laneLeft - 6, H);
  ctx.fillStyle = skin.textDim;
  ctx.font = "900 8px system-ui, sans-serif";
  ctx.save();
  ctx.translate(LANE_X, 420);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("▲ LAUNCH ▲", 0, 0);
  ctx.restore();
}
