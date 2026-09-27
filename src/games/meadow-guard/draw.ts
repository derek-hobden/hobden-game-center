import {
  CELL_H,
  CELL_W,
  COLS,
  H,
  LAWN_BOTTOM,
  LAWN_LEFT,
  LAWN_RIGHT,
  LAWN_TOP,
  ROWS,
  W,
  colCenter,
  rowFeet,
} from "./balance";
import type { Creeper, Match, Particle, Plant, Shot, SunOrb } from "./logic";
import type { PlantKind } from "./balance";

export type FrameView = {
  ox: number;
  oy: number;
  sw: number;
  sh: number;
};

type Palette = {
  dusk: boolean;
  even: string;
  odd: string;
  evenDeep: string;
  oddDeep: string;
  blades: string[];
  flowers: string[];
  hill: string;
  soil: string;
};

function hash(n: number) {
  const s = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return (s % 10000) / 10000;
}

function palette(level: number): Palette {
  if (level >= 4) {
    return {
      dusk: true,
      even: "#3f6846",
      odd: "#365c3d",
      evenDeep: "#2c4a32",
      oddDeep: "#26422c",
      blades: ["#243c28", "#31543a", "#3e6848", "#1d3222"],
      flowers: ["#f0c4d4", "#e6d8ff", "#f3e2a4", "#f7f3ea"],
      hill: "#243246",
      soil: "#3a3228",
    };
  }
  if (level === 3) {
    return {
      dusk: false,
      even: "#7ec24e",
      odd: "#71b646",
      evenDeep: "#5ea33c",
      oddDeep: "#549636",
      blades: ["#2f7a32", "#3d9440", "#57b04e", "#24662c"],
      flowers: ["#ffd1e0", "#fff3b0", "#ffffff", "#ffc2a0", "#e7d6ff"],
      hill: "#6eae58",
      soil: "#c4a06a",
    };
  }
  return {
    dusk: false,
    even: level === 2 ? "#73c84a" : "#6ec447",
    odd: level === 2 ? "#66bb42" : "#62b43e",
    evenDeep: "#4f9d34",
    oddDeep: "#47912e",
    blades: ["#2c7630", "#3c9842", "#5cba52", "#226628"],
    flowers: ["#ffe4ee", "#fff4b8", "#ffffff", "#ffd0b4", "#eadcff"],
    hill: "#7dcc62",
    soil: "#d2b07a",
  };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  m: Match,
  font: string,
  view: FrameView,
) {
  if (view.sw < 2 || view.sh < 2) return;
  const sx = view.sw / W;
  const sy = view.sh / H;
  const X = (x: number) => view.ox + x * sx;
  const Y = (y: number) => view.oy + y * sy;
  const cellW = CELL_W * sx;
  const cellH = CELL_H * sy;
  const sprite = Math.min(cellW / 28, cellH / 46);
  const unit = (sx + sy) * 0.5;

  ctx.save();
  if (m.shake > 0) {
    const mag = m.shake * Math.min(view.sw, view.sh) * 0.012;
    ctx.translate(Math.sin(m.time * 46) * mag, Math.cos(m.time * 39) * mag);
  }

  const colors = palette(m.level);
  drawLawn(ctx, m, colors, X, Y, view, cellW, cellH);
  drawCottage(ctx, m, X, Y, cellH);
  drawWoods(ctx, m, colors, X, Y, cellH);
  drawGhost(ctx, m, X, Y, sprite);
  const plants = [...m.plants].sort((a, b) => a.row - b.row);
  for (const p of plants) drawPlant(ctx, p, m.time, X, Y, sprite);
  for (const s of m.shots) drawShot(ctx, s, m.time, X, Y, unit);
  const creepers = [...m.creepers].sort((a, b) => a.row - b.row || a.x - b.x);
  for (const z of creepers) drawCreeper(ctx, z, m.time, X, Y, sprite);
  drawBees(ctx, m, X, Y, unit);
  for (const p of m.parts) drawPart(ctx, p, font, X, Y, unit);
  for (const s of m.suns) drawSunOrb(ctx, s, X, Y, unit);
  ctx.restore();
  if (m.bannerT > 0 && m.banner) drawBanner(ctx, m, font, view);
}

function drawLawn(
  ctx: CanvasRenderingContext2D,
  m: Match,
  colors: Palette,
  X: (n: number) => number,
  Y: (n: number) => number,
  view: FrameView,
  cellW: number,
  cellH: number,
) {
  const x0 = X(LAWN_LEFT);
  const x1 = X(LAWN_RIGHT);
  const top = Y(LAWN_TOP);
  const bot = Y(LAWN_BOTTOM);

  ctx.fillStyle = colors.hill;
  ctx.fillRect(view.ox, view.oy, view.sw, Math.max(0, top - view.oy));
  ctx.fillStyle = colors.soil;
  ctx.fillRect(view.ox, bot, view.sw, Math.max(0, view.oy + view.sh - bot));

  for (let r = 0; r < ROWS; r++) {
    const y0 = Y(LAWN_TOP + r * CELL_H);
    const y1 = Y(LAWN_TOP + (r + 1) * CELL_H);
    const alt = r % 2 === 0;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, alt ? colors.even : colors.odd);
    g.addColorStop(1, alt ? colors.evenDeep : colors.oddDeep);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.fillRect(x0, y0, x1 - x0, Math.max(2, cellH * 0.035));
    ctx.fillStyle = "rgba(40, 28, 12, 0.14)";
    ctx.fillRect(x0, y1 - Math.max(3, cellH * 0.06), x1 - x0, Math.max(3, cellH * 0.06));

    const h = y1 - y0;
    const bladeRows = Math.max(4, Math.round(h / 16));
    const bladeCols = Math.max(3, Math.round(cellW / 16));
    for (let c = 0; c < COLS; c++) {
      const cx0 = x0 + c * cellW;
      if ((c + r) % 2 === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.035)";
        ctx.fillRect(cx0, y0, cellW, h);
      }
      for (let br = 0; br < bladeRows; br++) {
        for (let bc = 0; bc < bladeCols; bc++) {
          const n = hash(r * 131 + c * 17 + br * 9 + bc * 3 + 4);
          const bx = cx0 + ((bc + 0.35 + n * 0.4) * cellW) / bladeCols;
          const by = y0 + ((br + 0.72) * h) / bladeRows;
          const lean = Math.sin(m.time * 1.7 + bx * 0.02 + r) * (3 + n * 4);
          const bh = (6 + n * 10) * Math.max(0.85, Math.min(1.7, h / 58));
          blade(ctx, bx, by, bh, lean, colors.blades[(br + bc + c) % colors.blades.length]);
        }
      }
      const shrub = Math.min(h * 0.32, cellW * 0.62);
      bush(ctx, cx0 + cellW * 0.28, y0 + h * 0.2, shrub, (c + r) % 2 === 0);
      bush(ctx, cx0 + cellW * 0.72, y0 + h * 0.14, shrub * 0.72, (c + r) % 3 === 0);
      const flowerN = 2;
      for (let f = 0; f < flowerN; f++) {
        const n = hash(r * 90 + c * 13 + f * 5 + 2);
        const fx = cx0 + cellW * (0.18 + n * 0.64);
        const fy = y0 + h * (0.38 + hash(r * 3 + c * 11 + f) * 0.28);
        const fs = Math.min(h * 0.2, cellW * 0.5) * (0.85 + n * 0.35);
        const petal = colors.flowers[(c + r + f) % colors.flowers.length];
        if (n > 0.78) clover(ctx, fx, fy, fs * 0.65);
        else if (n > 0.5) tulip(ctx, fx, fy, fs, petal, m.time, n * 6);
        else daisy(ctx, fx, fy, fs, petal, m.time, n * 8);
      }
      ctx.fillStyle = "rgba(92, 58, 24, 0.16)";
      ctx.beginPath();
      ctx.ellipse(cx0 + cellW * 0.5, y0 + h * 0.78, cellW * 0.22, Math.max(3, h * 0.06), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(92, 58, 24, 0.07)";
    ctx.fillRect(x0, y0 + h * 0.58, x1 - x0, h * 0.2);
  }
}

function blade(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  lean: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 1.2, y);
  ctx.quadraticCurveTo(x + lean * 0.35, y - h * 0.55, x + lean, y - h);
  ctx.quadraticCurveTo(x + lean * 0.45 + 2.4, y - h * 0.42, x + 1.6, y);
  ctx.closePath();
  ctx.fill();
}

function daisy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  time: number,
  phase: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 1.3 + phase) * 0.1);
  ctx.strokeStyle = "#24662c";
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, s * 0.2);
  ctx.quadraticCurveTo(s * 0.35, -s * 0.2, 0, -s * 0.85);
  ctx.stroke();
  ctx.fillStyle = "#3d9a42";
  ctx.beginPath();
  ctx.ellipse(-s * 0.22, -s * 0.15, s * 0.22, s * 0.1, -0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -s * 0.9);
  ctx.fillStyle = petal;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.22, s * 0.11, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f0b429";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tulip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  petal: string,
  time: number,
  phase: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time + phase) * 0.08);
  ctx.strokeStyle = "#24662c";
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.15);
  ctx.lineTo(0, -s * 0.55);
  ctx.stroke();
  ctx.fillStyle = petal;
  ctx.strokeStyle = "rgba(80,30,40,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.95);
  ctx.quadraticCurveTo(s * 0.32, -s * 0.7, s * 0.18, -s * 0.45);
  ctx.quadraticCurveTo(0, -s * 0.62, -s * 0.18, -s * 0.45);
  ctx.quadraticCurveTo(-s * 0.32, -s * 0.7, 0, -s * 0.95);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function bush(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, deep: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = deep ? "#1f5c2c" : "#2f8a38";
  ctx.beginPath();
  ctx.ellipse(-s * 0.22, s * 0.08, s * 0.38, s * 0.28, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.2, s * 0.04, s * 0.34, s * 0.26, 0, 0, Math.PI * 2);
  ctx.ellipse(0, -s * 0.16, s * 0.3, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = deep ? "#3d9a44" : "#8ed36a";
  ctx.beginPath();
  ctx.ellipse(-s * 0.08, -s * 0.22, s * 0.12, s * 0.08, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function clover(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#2f8a38";
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.28, s * 0.18, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCottage(
  ctx: CanvasRenderingContext2D,
  m: Match,
  X: (n: number) => number,
  Y: (n: number) => number,
  cellH: number,
) {
  const x0 = X(0);
  const x1 = X(LAWN_LEFT + 8);
  const y0 = Y(LAWN_TOP);
  const y1 = Y(LAWN_BOTTOM);
  const w = Math.max(8, x1 - x0);
  const h = Math.max(8, y1 - y0);
  const hurt = m.houseHurt > 0;

  const wall = ctx.createLinearGradient(x0, 0, x1, 0);
  wall.addColorStop(0, hurt ? "#f3c2b6" : "#f7f1e6");
  wall.addColorStop(0.72, hurt ? "#e7a898" : "#eadcc4");
  wall.addColorStop(1, hurt ? "#d9897c" : "#d7c3a4");
  ctx.fillStyle = wall;
  round(ctx, x0 + w * 0.06, y0 + h * 0.045, w * 0.9, h * 0.94, Math.min(w * 0.12, 18));
  ctx.fill();
  ctx.strokeStyle = "#7d5a3c";
  ctx.lineWidth = Math.max(1.5, w * 0.035);
  ctx.stroke();

  ctx.strokeStyle = "rgba(120, 78, 42, 0.28)";
  ctx.lineWidth = Math.max(1, w * 0.02);
  for (let i = 1; i <= 6; i++) {
    const y = y0 + h * (0.12 + i * 0.12);
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.14, y);
    ctx.lineTo(x0 + w * 0.88, y);
    ctx.stroke();
  }

  const roofH = Math.min(h * 0.2, w * 0.95);
  ctx.fillStyle = "#d15a42";
  ctx.beginPath();
  ctx.moveTo(x0 + w * 0.02, y0 + roofH);
  ctx.lineTo(x0 + w * 0.5, y0 + roofH * 0.08);
  ctx.lineTo(x0 + w * 0.98, y0 + roofH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8a382c";
  ctx.lineWidth = Math.max(1.25, w * 0.03);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    ctx.beginPath();
    ctx.moveTo(x0 + w * (0.5 - t * 0.46), y0 + roofH * (0.08 + t * 0.92));
    ctx.lineTo(x0 + w * (0.5 + t * 0.46), y0 + roofH * (0.08 + t * 0.92));
    ctx.stroke();
  }

  const chimX = x0 + w * 0.66;
  const chimW = Math.max(4, w * 0.12);
  ctx.fillStyle = "#8d4a38";
  ctx.fillRect(chimX, y0 + h * 0.01, chimW, roofH * 0.72);
  ctx.fillStyle = "#6e3428";
  ctx.fillRect(chimX - 1, y0 + h * 0.01, chimW + 2, Math.max(3, roofH * 0.12));
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 3; i++) {
    const t = (m.time * 0.35 + i * 0.33) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(
      chimX + chimW * 0.5 + Math.sin(m.time + i) * 3,
      y0 + h * 0.02 - t * roofH * 0.7,
      3 + t * 5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (let r = 0; r < ROWS; r++) {
    const cy = Y(LAWN_TOP + (r + 0.48) * CELL_H);
    const s = Math.min(w * 0.34, cellH * 0.34);
    if (r === ROWS - 1) {
      const dw = Math.min(w * 0.42, cellH * 0.46);
      const dh = Math.min(cellH * 0.62, h * 0.16);
      const dx = x0 + (w - dw) * 0.5;
      const dy = Math.min(cy - dh * 0.35, y1 - dh - 4);
      ctx.fillStyle = "#6a3b28";
      round(ctx, dx, dy, dw, dh, dw * 0.35);
      ctx.fill();
      ctx.strokeStyle = "#4a2818";
      ctx.lineWidth = Math.max(1, dw * 0.06);
      ctx.stroke();
      ctx.fillStyle = "#f6d36b";
      ctx.beginPath();
      ctx.arc(dx + dw * 0.72, dy + dh * 0.55, Math.max(1.5, dw * 0.06), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const wx = x0 + w * 0.3;
    ctx.fillStyle = m.level >= 4 ? "#ffe3a0" : "#d7f1ff";
    round(ctx, wx, cy - s * 0.5, s, s * 0.86, s * 0.16);
    ctx.fill();
    ctx.strokeStyle = "#7a5136";
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wx + s * 0.5, cy - s * 0.5);
    ctx.lineTo(wx + s * 0.5, cy + s * 0.36);
    ctx.moveTo(wx, cy - s * 0.05);
    ctx.lineTo(wx + s, cy - s * 0.05);
    ctx.stroke();
    ctx.fillStyle = "#8a5430";
    ctx.fillRect(wx - s * 0.08, cy + s * 0.4, s * 1.16, Math.max(3, s * 0.22));
    ctx.fillStyle = r % 2 === 0 ? "#ff8fab" : "#ffd15c";
    ctx.beginPath();
    ctx.arc(wx + s * 0.22, cy + s * 0.36, s * 0.16, 0, Math.PI * 2);
    ctx.arc(wx + s * 0.72, cy + s * 0.34, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hurt) {
    ctx.strokeStyle = "rgba(120, 30, 24, 0.7)";
    ctx.lineWidth = Math.max(1.5, w * 0.04);
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.35, y0 + h * 0.4);
    ctx.lineTo(x0 + w * 0.48, y0 + h * 0.52);
    ctx.lineTo(x0 + w * 0.4, y0 + h * 0.66);
    ctx.stroke();
  }
}

function drawWoods(
  ctx: CanvasRenderingContext2D,
  m: Match,
  colors: Palette,
  X: (n: number) => number,
  Y: (n: number) => number,
  cellH: number,
) {
  const x0 = X(LAWN_RIGHT - 6);
  const x1 = X(W);
  const y0 = Y(LAWN_TOP);
  const y1 = Y(LAWN_BOTTOM);
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, "rgba(60, 90, 40, 0)");
  g.addColorStop(0.35, colors.dusk ? "#24361f" : "#2c6a34");
  g.addColorStop(1, colors.dusk ? "#121c14" : "#1d4e28");
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, Math.max(0, x1 - x0), y1 - y0);

  for (let r = 0; r < ROWS; r++) {
    const cy = Y(LAWN_TOP + (r + 0.62) * CELL_H);
    const s = Math.min((x1 - x0) * 0.72, cellH * 0.78);
    tree(ctx, x0 + (x1 - x0) * 0.58, cy, s, m.time, r, colors.dusk);
  }
}

function tree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  time: number,
  i: number,
  dusk: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time * 0.7 + i) * 0.03);
  ctx.fillStyle = dusk ? "#3a2a1c" : "#5c3b24";
  ctx.fillRect(-s * 0.07, -s * 0.05, s * 0.14, s * 0.42);
  const cols = dusk
    ? ["#1b2e1e", "#274232", "#35543c"]
    : ["#1d6430", "#2d8740", "#49a84c"];
  canopy(ctx, -s * 0.16, -s * 0.22, s * 0.28, cols[0]);
  canopy(ctx, s * 0.14, -s * 0.18, s * 0.24, cols[1]);
  canopy(ctx, 0, -s * 0.4, s * 0.3, cols[2]);
  ctx.fillStyle = dusk ? "#4d6e4e" : "#b6e38a";
  ctx.beginPath();
  ctx.ellipse(-s * 0.06, -s * 0.48, s * 0.08, s * 0.045, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function canopy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.2);
  ctx.quadraticCurveTo(x - r * 0.2, y - r * 1.05, x + r * 0.15, y - r * 0.85);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 0.4, x + r * 0.7, y + r * 0.25);
  ctx.quadraticCurveTo(x, y + r * 0.05, x - r, y + r * 0.2);
  ctx.fill();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  m: Match,
  X: (n: number) => number,
  Y: (n: number) => number,
  sprite: number,
) {
  if (m.phase !== "play" || m.hoverCol < 0 || m.hoverRow < 0) return;
  const x = X(LAWN_LEFT + m.hoverCol * CELL_W + 3);
  const y = Y(LAWN_TOP + m.hoverRow * CELL_H + 3);
  const w = X(LAWN_LEFT + (m.hoverCol + 1) * CELL_W - 3) - x;
  const h = Y(LAWN_TOP + (m.hoverRow + 1) * CELL_H - 3) - y;
  const occupied = m.plants.some((p) => p.col === m.hoverCol && p.row === m.hoverRow && p.hp > 0);
  ctx.save();
  ctx.fillStyle = occupied ? "rgba(196, 54, 48, 0.28)" : "rgba(255, 236, 170, 0.28)";
  round(ctx, x, y, w, h, Math.min(12, w * 0.12));
  ctx.fill();
  if (!occupied && m.selected && m.selected !== "trowel") {
    ctx.globalAlpha = 0.5;
    drawPlant(
      ctx,
      {
        kind: m.selected,
        col: m.hoverCol,
        row: m.hoverRow,
        hp: 1,
        maxHp: 1,
        cd: 0,
        sunCd: 0,
        age: 1,
        hurt: 0,
        mouth: 0,
      },
      m.time,
      X,
      Y,
      sprite,
    );
  }
  ctx.restore();
}

function popScale(age: number) {
  const t = Math.min(1, age / 0.28);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 0.55 + 0.45 * (1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2);
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  p: Plant,
  time: number,
  X: (n: number) => number,
  Y: (n: number) => number,
  sprite: number,
) {
  const s = sprite * popScale(p.age);
  ctx.save();
  ctx.translate(X(colCenter(p.col)), Y(rowFeet(p.row)));
  ctx.scale(s, s);
  groundShadow(ctx, p.kind === "bramble" ? 20 : 14);
  if (p.kind === "sunbloom") drawSunbloom(ctx, time + p.col);
  else if (p.kind === "podsnap") drawPodsnap(ctx, time + p.row, p.mouth);
  else if (p.kind === "bramble") drawBramble(ctx, time + p.col);
  else if (p.kind === "dewburst") drawDewburst(ctx, time + p.row);
  else drawChillvine(ctx, time + p.col * 0.7);
  if (p.hurt > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55, p.hurt * 3)})`;
    ctx.beginPath();
    ctx.ellipse(0, -32, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (p.hp < p.maxHp && p.hp > 0) {
    bar(ctx, X(colCenter(p.col)), Y(rowFeet(p.row)) - 70 * s, 32 * s, p.hp / p.maxHp, "#7dce4e");
  }
}

function drawCreeper(
  ctx: CanvasRenderingContext2D,
  z: Creeper,
  time: number,
  X: (n: number) => number,
  Y: (n: number) => number,
  sprite: number,
) {
  const fade = z.dead > 0 ? Math.max(0, z.dead / 0.5) : 1;
  const sink = z.dead > 0 ? (0.5 - z.dead) * 18 : 0;
  ctx.save();
  ctx.translate(X(z.x), Y(rowFeet(z.row)));
  ctx.scale(sprite * (0.85 + fade * 0.15), sprite * fade);
  ctx.translate(0, sink);
  groundShadow(ctx, z.kind === "barkhelm" || z.kind === "gnasher" ? 18 : 13);
  if (z.kind === "mulchling") drawMulchling(ctx, z, time);
  else if (z.kind === "dashling") drawDashling(ctx, z, time);
  else if (z.kind === "barkhelm") drawBarkhelm(ctx, z, time);
  else drawGnasher(ctx, z, time);
  if (z.slow > 0 && z.dead <= 0) frostShell(ctx, time);
  if (z.hurt > 0 && z.dead <= 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.6, z.hurt * 4)})`;
    ctx.beginPath();
    ctx.ellipse(0, -28, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (z.hp > 0 && z.hp < z.maxHp && z.dead <= 0) {
    bar(ctx, X(z.x), Y(rowFeet(z.row)) - 66 * sprite, 30 * sprite, z.hp / z.maxHp, "#e07a5f");
  }
}

function groundShadow(ctx: CanvasRenderingContext2D, rx: number) {
  ctx.fillStyle = "rgba(28, 48, 16, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 1, rx, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function soilMound(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#6a4328";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8d5d38";
  ctx.beginPath();
  ctx.ellipse(-1, -1.2, 8, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function eye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  look: number,
  time: number,
  seed: number,
  mood: "soft" | "focus" | "angry" = "soft",
) {
  s *= 1.45;
  const blink = Math.sin(time * 1.35 + seed) > 0.972;
  ctx.fillStyle = "rgba(30, 20, 10, 0.12)";
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.15, s * 1.25, s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fffaf3";
  ctx.beginPath();
  ctx.ellipse(x, y, s * 1.12, blink ? s * 0.12 : s * 0.98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2c2418";
  ctx.lineWidth = Math.max(0.8, s * 0.22);
  ctx.stroke();
  if (!blink) {
    const iris = mood === "angry" ? "#6a3030" : "#2f6a38";
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(x + look, y + s * 0.08, s * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a120c";
    ctx.beginPath();
    ctx.arc(x + look, y + s * 0.12, s * 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + look - s * 0.22, y - s * 0.18, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#2c2418";
  ctx.lineWidth = Math.max(0.9, s * 0.28);
  ctx.lineCap = "round";
  ctx.beginPath();
  if (mood === "angry") {
    ctx.moveTo(x - s * 1.25, y - s * 0.85);
    ctx.quadraticCurveTo(x, y - s * 1.55, x + s * 1.2, y - s * 0.7);
  } else if (mood === "focus") {
    ctx.moveTo(x - s * 1.15, y - s * 1.25);
    ctx.lineTo(x + s * 1.15, y - s * 1.05);
  } else {
    ctx.moveTo(x - s * 1.1, y - s * 1.2);
    ctx.quadraticCurveTo(x, y - s * 1.7, x + s * 1.15, y - s * 1.15);
  }
  ctx.stroke();
}

function blush(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = "rgba(255, 112, 96, 0.35)";
  ctx.beginPath();
  ctx.ellipse(-9, y, 2.4, 1.4, 0, 0, Math.PI * 2);
  ctx.ellipse(9, y, 2.4, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function smile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.strokeStyle = "#6a3d18";
  ctx.lineWidth = Math.max(1, s * 0.22);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, s, 0.25, Math.PI - 0.25);
  ctx.stroke();
}

type LimbColors = {
  cloth: string;
  clothDark: string;
  boot: string;
  outline: string;
  hand: string;
};

function drawLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  phase: number,
  style: LimbColors,
  length = 1,
) {
  const swing = Math.sin(phase);
  const lift = Math.max(0, swing);
  ctx.save();
  ctx.translate(hipX, -lift * 3.2);
  ctx.rotate(swing * 0.55);
  const thigh = 11 * length;
  ctx.fillStyle = style.cloth;
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-6.4, 0);
  ctx.quadraticCurveTo(-8, thigh * 0.55, -5.4, thigh);
  ctx.lineTo(5.6, thigh);
  ctx.quadraticCurveTo(8, thigh * 0.4, 6.4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.ellipse(-1.4, thigh * 0.42, 1.5, thigh * 0.24, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(-swing * 0.4, thigh - 1);
  ctx.rotate(-swing * 0.9);
  const calf = 10 * length;
  ctx.fillStyle = style.clothDark;
  ctx.strokeStyle = style.outline;
  ctx.beginPath();
  ctx.moveTo(-4.2, 0);
  ctx.quadraticCurveTo(-4.8, calf * 0.6, -3.2, calf);
  ctx.lineTo(3.5, calf);
  ctx.quadraticCurveTo(4.8, calf * 0.45, 4, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = style.boot;
  ctx.beginPath();
  ctx.ellipse(3, calf + 1.6, 8.4, 4, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = style.outline;
  ctx.stroke();
  ctx.fillStyle = style.outline;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-3.6, calf - 2.2, 7.2, 2.6);
  ctx.restore();
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  style: LimbColors,
  reach = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = style.cloth;
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = 1.25;
  ctx.lineJoin = "round";
  const len = 14 * reach;
  ctx.beginPath();
  ctx.moveTo(-2, -3.3);
  ctx.quadraticCurveTo(len * 0.5, -5, len, -2.4);
  ctx.quadraticCurveTo(len * 0.55, 4.2, -2, 3.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.translate(len, 0);
  ctx.fillStyle = style.hand;
  ctx.beginPath();
  ctx.arc(0, 0, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2.4, -2.3, 1.45, 0, Math.PI * 2);
  ctx.arc(3.3, 0.4, 1.45, 0, Math.PI * 2);
  ctx.arc(2.2, 2.7, 1.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSunbloom(ctx: CanvasRenderingContext2D, time: number) {
  const sway = Math.sin(time * 1.5) * 0.05;
  soilMound(ctx);
  leafFoot(ctx, -10, 0.5, -0.6);
  leafFoot(ctx, 10, -0.4, 0.5);
  ctx.save();
  ctx.rotate(sway);
  ctx.fillStyle = "#2f8a34";
  ctx.strokeStyle = "#1b4e22";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.bezierCurveTo(-10, -16, -7, -30, -5, -42);
  ctx.quadraticCurveTo(0, -46, 5, -42);
  ctx.bezierCurveTo(8, -28, 10, -14, 6, -2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#67c24e";
  ctx.beginPath();
  ctx.ellipse(-1.5, -22, 2.6, 8, 0.15, 0, Math.PI * 2);
  ctx.fill();
  leafArm(ctx, -6, -24, -1.15 + Math.sin(time * 2) * 0.08, 1);
  leafArm(ctx, 7, -26, 1.05 + Math.sin(time * 2 + 1) * 0.08, -1);
  ctx.translate(Math.sin(time * 1.2) * 1.2, -50);
  ctx.rotate(Math.sin(time * 0.7) * 0.06);
  const pulse = 1 + Math.sin(time * 2.4) * 0.025;
  ctx.scale(pulse, pulse);
  for (let i = 0; i < 12; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 6);
    ctx.fillStyle = i % 2 === 0 ? "#e39412" : "#f2b423";
    ctx.strokeStyle = "#a85a0e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -16, 5.2, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4 + 0.2);
    ctx.fillStyle = i % 2 === 0 ? "#ffd15c" : "#ffb703";
    ctx.beginPath();
    ctx.ellipse(0, -12, 4.2, 7.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const face = ctx.createRadialGradient(-4, -5, 2, 0, 0, 14);
  face.addColorStop(0, "#fff1c2");
  face.addColorStop(0.55, "#ffc44d");
  face.addColorStop(1, "#f08a1a");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a85a10";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  eye(ctx, -4.3, -1.2, 2.35, 0.7, time, 1);
  eye(ctx, 4.5, -1.2, 2.35, 0.7, time, 2.2);
  smile(ctx, 0, 3.2, 3.4);
  blush(ctx, 4.2);
  ctx.restore();
}

function leafFoot(ctx: CanvasRenderingContext2D, x: number, rot: number, flip: number) {
  ctx.save();
  ctx.translate(x, -1);
  ctx.rotate(rot);
  ctx.scale(flip, 1);
  ctx.fillStyle = "#3aaa40";
  ctx.strokeStyle = "#1d5a24";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(8, -2, 16, 1);
  ctx.quadraticCurveTo(8, 5, 0, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function leafArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  flip: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(flip, 1);
  ctx.fillStyle = "#4cba48";
  ctx.strokeStyle = "#1d5a24";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(10, -8, 20, -2);
  ctx.quadraticCurveTo(12, 2, 8, 4);
  ctx.quadraticCurveTo(4, 1, 0, 0);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#2f7a32";
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.quadraticCurveTo(10, -3, 16, -1);
  ctx.stroke();
  ctx.restore();
}

function drawPodsnap(ctx: CanvasRenderingContext2D, time: number, mouth: number) {
  const bob = Math.sin(time * 3.2) * 0.8;
  const open = Math.min(1, mouth / 0.18);
  soilMound(ctx);
  leafFoot(ctx, -9, 0.4, -1);
  leafFoot(ctx, 8, -0.2, 1);
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = "#2e9a3c";
  ctx.strokeStyle = "#165226";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -24, 13, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d7f5b0";
  ctx.beginPath();
  ctx.ellipse(-1, -22, 7.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8ed36a";
  ctx.beginPath();
  ctx.arc(-6, -18, 1.3, 0, Math.PI * 2);
  ctx.arc(-2, -14, 1.1, 0, Math.PI * 2);
  ctx.arc(2, -20, 1.2, 0, Math.PI * 2);
  ctx.fill();
  leafArm(ctx, -8, -30, -1.4, 1);
  leafArm(ctx, 2, -36, 2.2, -1);
  ctx.save();
  ctx.translate(4, -26);
  ctx.fillStyle = "#14381c";
  ctx.beginPath();
  ctx.ellipse(14, 0, 9, 2.4 + open * 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#145022";
  ctx.lineWidth = 1.4;
  ctx.save();
  ctx.rotate(-0.08 - open * 0.42);
  ctx.fillStyle = "#2f9a3e";
  ctx.beginPath();
  ctx.ellipse(14, -3.6, 16, 6, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#b6e98a";
  ctx.beginPath();
  ctx.ellipse(8, -4.4, 6, 1.6, -0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.rotate(0.05 + open * 0.38);
  ctx.fillStyle = "#1f7a30";
  ctx.beginPath();
  ctx.ellipse(14, 4, 15.5, 5.4, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f4fff0";
  for (const tx of [4, 8, 12]) {
    ctx.beginPath();
    ctx.moveTo(tx, 1.2);
    ctx.lineTo(tx + 1.3, 4.2);
    ctx.lineTo(tx - 1.3, 4.2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  ctx.restore();
  ctx.save();
  ctx.translate(0, bob - 40);
  eye(ctx, -3, 0, 2.5, 1.1, time, 3, "focus");
  eye(ctx, 3.2, 0, 2.5, 1.1, time, 4, "focus");
  blush(ctx, 5);
  ctx.restore();
}

function drawBramble(ctx: CanvasRenderingContext2D, time: number) {
  const rustle = Math.sin(time * 2.1) * 1.4;
  soilMound(ctx);
  const masses: Array<[number, number, number, string]> = [
    [-12, -16, 12, "#245c30"],
    [10, -18 + rustle * 0.2, 13, "#2f7a38"],
    [0, -12, 14, "#1f5228"],
    [-4, -26, 11, "#36843c"],
    [8, -28 - rustle * 0.15, 9, "#2a6e34"],
  ];
  ctx.strokeStyle = "#14361c";
  ctx.lineWidth = 1.4;
  for (const [x, y, r, color] of masses) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - r, y + 2);
    ctx.quadraticCurveTo(x - r * 0.2, y - r, x + r * 0.3, y - r * 0.7);
    ctx.quadraticCurveTo(x + r, y - r * 0.2, x + r * 0.7, y + r * 0.35);
    ctx.quadraticCurveTo(x, y + r * 0.15, x - r, y + 2);
    ctx.fill();
    ctx.stroke();
  }
  thorn(ctx, -18, -22, -0.8);
  thorn(ctx, 16, -30, 0.4);
  thorn(ctx, 14, -10, 1.1);
  thorn(ctx, -16, -8, 2.2);
  thorn(ctx, 2, -34, -0.2);
  vineCurl(ctx, 12, -8, time);
  ctx.fillStyle = "#d4527a";
  ctx.strokeStyle = "#8a3050";
  ctx.lineWidth = 1;
  for (const [bx, by] of [
    [-8, -14],
    [6, -16],
    [0, -26],
  ] as const) {
    ctx.beginPath();
    ctx.arc(bx, by, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(bx - 0.7, by - 0.7, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4527a";
  }
  eye(ctx, -3.2, -20, 2.05, 0.4, time, 5, "angry");
  eye(ctx, 3.4, -20, 2.05, 0.4, time, 6, "angry");
  smile(ctx, 0, -15.5, 2.4);
}

function thorn(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#f4f1e4";
  ctx.strokeStyle = "#6d6448";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(3.4, 3);
  ctx.lineTo(-3.4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function vineCurl(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(time) * 0.1);
  ctx.strokeStyle = "#1d4e28";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(8, -4, 10, -14, 4, -16);
  ctx.stroke();
  ctx.restore();
}

function drawDewburst(ctx: CanvasRenderingContext2D, time: number) {
  const bob = Math.sin(time * 2.6) * 1;
  soilMound(ctx);
  ctx.fillStyle = "#1f8f62";
  ctx.beginPath();
  ctx.ellipse(0, -2, 16, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#146846";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.quadraticCurveTo(0, 2, 14, -3);
  ctx.stroke();
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = "#1f7a58";
  ctx.fillRect(-3.2, -18, 6.4, 16);
  const g = ctx.createRadialGradient(-4, -36, 3, 0, -30, 16);
  g.addColorStop(0, "#e9fbff");
  g.addColorStop(0.35, "#7ad7ea");
  g.addColorStop(1, "#1c7f96");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#145868";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -32, 14, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-4, -36, 3.2, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0e4e5c";
  ctx.beginPath();
  ctx.ellipse(0, -44, 6, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a = time * 1.4 + i * 2.1;
    drop(ctx, Math.sin(a) * 10, -48 - ((time * 12 + i * 9) % 14), 2.2 + (i % 2));
  }
  eye(ctx, -4, -32, 2.15, 0.5, time, 7);
  eye(ctx, 4.2, -32, 2.15, 0.5, time, 8);
  smile(ctx, 0, -27.5, 2.6);
  ctx.restore();
}

function drop(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e7f8ff";
  ctx.strokeStyle = "#6fb9d4";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s, 0, 0, s);
  ctx.quadraticCurveTo(-s, 0, 0, -s);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawChillvine(ctx: CanvasRenderingContext2D, time: number) {
  const sway = Math.sin(time * 1.6) * 2;
  soilMound(ctx);
  const pts = [
    { x: 0, y: -4 },
    { x: -7, y: -14 },
    { x: -4 + sway * 0.2, y: -26 },
    { x: 6, y: -36 },
    { x: 2 + sway * 0.3, y: -48 },
  ];
  ribbon(ctx, pts, 4.2, "#b7efe4", "#3e8f86");
  frostedLeaf(ctx, -12, -22, -0.8);
  frostedLeaf(ctx, 12, -34, 0.7);
  crystal(ctx, -8, -30, 5, 0.4, time);
  crystal(ctx, 8, -40, 4.5, -0.5, time);
  crystal(ctx, 1, -56, 9, Math.sin(time * 0.8) * 0.08, time);
  ctx.save();
  ctx.translate(1, -56);
  eye(ctx, -2.4, 0.4, 1.5, 0.3, time, 9);
  eye(ctx, 2.6, 0.4, 1.5, 0.3, time, 10);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (let i = 0; i < 4; i++) {
    const a = time * 2 + i;
    ctx.beginPath();
    ctx.arc(Math.sin(a) * 12, -20 - ((time * 20 + i * 10) % 36), 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function ribbon(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  width: number,
  fill: string,
  stroke: string,
) {
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    const r = pts[Math.max(0, i - 1)];
    const dx = q.x - r.x;
    const dy = q.y - r.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * width;
    const ny = (dx / len) * width;
    left.push([p.x + nx, p.y + ny]);
    right.push([p.x - nx, p.y - ny]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function frostedLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#e7fbff";
  ctx.strokeStyle = "#6fb9d4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function crystal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  rot: number,
  time: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot + Math.sin(time + x) * 0.04);
  const g = ctx.createLinearGradient(-s, -s, s, s);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#d9f6ff");
  g.addColorStop(1, "#7ec4e4");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#4f8eae";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.62, -s * 0.05);
  ctx.lineTo(s * 0.28, s * 0.85);
  ctx.lineTo(-s * 0.28, s * 0.85);
  ctx.lineTo(-s * 0.62, -s * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.8);
  ctx.lineTo(-s * 0.16, s * 0.4);
  ctx.stroke();
  ctx.restore();
}

const MULCH: LimbColors = {
  cloth: "#6d8a3c",
  clothDark: "#556e30",
  boot: "#5c4030",
  outline: "#2c2418",
  hand: "#c4a574",
};

const DASH: LimbColors = {
  cloth: "#e0893a",
  clothDark: "#c46e28",
  boot: "#6b3e22",
  outline: "#4a2814",
  hand: "#ffd7a8",
};

const BARK: LimbColors = {
  cloth: "#6b4a32",
  clothDark: "#543824",
  boot: "#3e2c1e",
  outline: "#2a1c12",
  hand: "#a67c52",
};

const GNASH: LimbColors = {
  cloth: "#8d4a62",
  clothDark: "#6e384c",
  boot: "#4a2434",
  outline: "#3a2030",
  hand: "#e7b3c4",
};

function drawMulchling(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  drawLeg(ctx, -6, z.walk, MULCH, 0.82);
  drawLeg(ctx, 6, z.walk + Math.PI, MULCH, 0.82);
  const lumps: Array<[number, number, number, number, string]> = [
    [0, -16, 16, 11, "#6f8f3a"],
    [-2, -26, 14, 10, "#7ea244"],
    [1, -34, 11, 8, "#8fb552"],
  ];
  ctx.strokeStyle = "#314818";
  ctx.lineWidth = 1.45;
  for (const [x, y, rx, ry, color] of lumps) {
    const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry);
    g.addColorStop(0, "#c5de78");
    g.addColorStop(0.4, color);
    g.addColorStop(1, "#3f5c22");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = "#5a4632";
  ctx.beginPath();
  ctx.ellipse(-6, -22, 3.2, 2.2, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e07a3a";
  ctx.beginPath();
  ctx.ellipse(7, -18, 3.4, 2.2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2f6a28";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(1, -40);
  ctx.quadraticCurveTo(8, -54, 3, -62);
  ctx.stroke();
  ctx.fillStyle = "#67c15a";
  ctx.strokeStyle = "#1d5a24";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(9, -60, 8, 3.4, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-1, -63, 6.5, 3, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const reach = z.eating ? -2.1 + Math.sin(z.walk * 2) * 0.35 : -0.9;
  drawArm(ctx, -10, -24, reach, MULCH, 0.95);
  drawArm(ctx, 10, -22, 2.4, MULCH, 0.8);
  eye(ctx, -4, -30, 2.3, -0.6, time, 11, "soft");
  eye(ctx, 4.2, -30, 2.3, -0.6, time, 12, "soft");
  smile(ctx, 0, -24, 3);
}

function drawDashling(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  ctx.save();
  ctx.rotate(z.eating ? -0.05 : -0.22);
  drawLeg(ctx, -5, z.walk, DASH, 1.25);
  drawLeg(ctx, 5, z.walk + Math.PI, DASH, 1.25);
  ctx.fillStyle = "#67c15a";
  ctx.strokeStyle = "#24662c";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const wave = Math.sin(time * 8 + i) * 2;
    ctx.save();
    ctx.translate(10 + i * 4 + wave, -28 + i * 2);
    ctx.rotate(0.5 + i * 0.15);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  const body = ctx.createLinearGradient(-8, -48, 8, -16);
  body.addColorStop(0, "#ffd7a8");
  body.addColorStop(0.45, "#f0a04a");
  body.addColorStop(1, "#c46a22");
  ctx.fillStyle = body;
  ctx.strokeStyle = "#8a4416";
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.moveTo(-6, -16);
  ctx.quadraticCurveTo(-10, -32, -4, -46);
  ctx.quadraticCurveTo(2, -52, 7, -44);
  ctx.quadraticCurveTo(12, -30, 7, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3d9a42";
  ctx.beginPath();
  ctx.ellipse(0, -48, 8, 3.4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1d5a24";
  ctx.stroke();
  drawArm(ctx, -4, -32, z.eating ? -2.2 : -1.6 + Math.sin(z.walk) * 0.4, DASH, 0.85);
  drawArm(ctx, 5, -30, 0.8 + Math.sin(z.walk + 1) * 0.5, DASH, 0.75);
  eye(ctx, -2.2, -40, 2.15, -1, time, 13, "focus");
  eye(ctx, 3.4, -40, 2.15, -1, time, 14, "focus");
  ctx.strokeStyle = "#8a4416";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-2, -34);
  ctx.quadraticCurveTo(0, -32.5, 2.5, -34);
  ctx.stroke();
  if (!z.eating) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(12, -18);
    ctx.lineTo(20, -16);
    ctx.moveTo(13, -12);
    ctx.lineTo(22, -12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBarkhelm(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  drawLeg(ctx, -7, z.walk, BARK, 0.7);
  drawLeg(ctx, 7, z.walk + Math.PI, BARK, 0.7);
  ctx.fillStyle = "#6b4a32";
  ctx.strokeStyle = "#3a2618";
  ctx.lineWidth = 1.5;
  round(ctx, -14, -36, 28, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(90, 56, 32, 0.7)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-12, -32 + i * 4);
    ctx.quadraticCurveTo(0, -30 + i * 4, 12, -32 + i * 4);
    ctx.stroke();
  }
  ctx.fillStyle = "#8a6244";
  ctx.beginPath();
  ctx.ellipse(6, -24, 3.2, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a2618";
  ctx.beginPath();
  ctx.arc(6, -24, 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#5c4030";
  ctx.strokeStyle = "#2a1c12";
  ctx.lineWidth = 1.4;
  round(ctx, -18, -52, 36, 18, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3e2c1e";
  ctx.fillRect(-16, -38, 32, 4);
  ctx.fillStyle = "#e0b15a";
  ctx.beginPath();
  ctx.arc(-8, -42, 1.5, 0, Math.PI * 2);
  ctx.arc(0, -43, 1.6, 0, Math.PI * 2);
  ctx.arc(8, -42, 1.5, 0, Math.PI * 2);
  ctx.fill();
  drawArm(ctx, -12, -28, z.eating ? -1.8 : -0.7, BARK, 0.7);
  drawArm(ctx, 12, -26, 2.5, BARK, 0.65);
  eye(ctx, -4, -32, 1.9, -0.4, time, 15, "angry");
  eye(ctx, 4.5, -32, 1.9, -0.4, time, 16, "angry");
  ctx.fillStyle = "#4a3424";
  ctx.fillRect(-4, -26, 8, 2.4);
  void time;
}

function drawGnasher(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  drawLeg(ctx, -4, z.walk, GNASH, 0.9);
  drawLeg(ctx, 7, z.walk + Math.PI, GNASH, 0.95);
  ctx.fillStyle = "#a45a72";
  ctx.strokeStyle = "#5a2438";
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.ellipse(4, -20, 10, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const chomp = z.eating ? 5 + Math.abs(Math.sin(z.walk * 2.2)) * 8 : 2.5;
  ctx.fillStyle = "#8d4a62";
  ctx.beginPath();
  ctx.ellipse(-6, -32, 16, 11, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#6e384c";
  ctx.beginPath();
  ctx.ellipse(-8, -16 + chomp * 0.12, 14, 7 + chomp * 0.12, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2a1520";
  ctx.beginPath();
  ctx.ellipse(-6, -22, 8, 2 + chomp * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6ea";
  for (const tx of [-12, -8, -4, 0]) {
    ctx.beginPath();
    ctx.moveTo(tx, -24);
    ctx.lineTo(tx + 1.6, -19);
    ctx.lineTo(tx - 1.6, -19);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx, -20);
    ctx.lineTo(tx + 1.5, -24 - chomp * 0.15);
    ctx.lineTo(tx - 1.5, -24 - chomp * 0.15);
    ctx.fill();
  }
  drawArm(ctx, 2, -24, z.eating ? -2 : -1.1, GNASH, 0.7);
  eye(ctx, -8, -34, 2.3, -0.8, time, 17, "angry");
  eye(ctx, -1.5, -33, 2.3, -0.8, time, 18, "angry");
  blush(ctx, -28);
}

function frostShell(ctx: CanvasRenderingContext2D, time: number) {
  ctx.save();
  ctx.translate(0, -28);
  ctx.strokeStyle = "rgba(210, 240, 255, 0.9)";
  ctx.fillStyle = "rgba(190, 230, 255, 0.18)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate(time * 0.4 + (i * Math.PI) / 2);
    crystal(ctx, 0, -18, 4, 0, time);
    ctx.restore();
  }
  ctx.restore();
}

function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  pct: number,
  fill: string,
) {
  const h = Math.max(4, w * 0.16);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  round(ctx, x - w / 2, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fill;
  const inner = Math.max(h * 0.4, (w - 2) * Math.max(0, Math.min(1, pct)));
  round(ctx, x - w / 2 + 1, y + 1, inner, h - 2, h / 2);
  ctx.fill();
}

function drawShot(
  ctx: CanvasRenderingContext2D,
  s: Shot,
  time: number,
  X: (n: number) => number,
  Y: (n: number) => number,
  unit: number,
) {
  ctx.save();
  ctx.translate(X(s.x), Y(s.y));
  ctx.scale(unit, unit);
  if (s.kind === "pod") {
    ctx.rotate(time * 10);
    ctx.fillStyle = "#8ed36a";
    ctx.strokeStyle = "#2f6a28";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#eaffc8";
    ctx.beginPath();
    ctx.ellipse(-2, -1, 2.6, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3aaa40";
    ctx.beginPath();
    ctx.ellipse(-7, 0, 3, 1.4, 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.kind === "chill") {
    ctx.rotate(time * 6);
    crystal(ctx, 0, 0, 7, 0, time);
  } else {
    const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 9);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#b9ecff");
    g.addColorStop(1, "rgba(90,190,220,0.2)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSunOrb(
  ctx: CanvasRenderingContext2D,
  s: SunOrb,
  X: (n: number) => number,
  Y: (n: number) => number,
  unit: number,
) {
  const bob = s.landed && !s.collecting ? Math.sin(s.age * 3) * 3 * unit : 0;
  const pulse = 1 + Math.sin(s.age * 5) * 0.05;
  ctx.save();
  ctx.translate(X(s.x), Y(s.y) + bob);
  ctx.scale(unit * pulse, unit * pulse);
  ctx.strokeStyle = "rgba(255, 210, 90, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 20 + Math.sin(s.age * 4) * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.rotate(s.age * 0.6);
  ctx.fillStyle = "#f0a202";
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -16, 2.4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 14);
  g.addColorStop(0, "#fff6c4");
  g.addColorStop(0.55, "#ffd15c");
  g.addColorStop(1, "#f0a202");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c47d08";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  eye(ctx, -3.2, -1, 1.7, 0.3, s.age, 2);
  eye(ctx, 3.2, -1, 1.7, 0.3, s.age, 3);
  smile(ctx, 0, 3, 2.2);
  ctx.restore();
}

function drawBees(
  ctx: CanvasRenderingContext2D,
  m: Match,
  X: (n: number) => number,
  Y: (n: number) => number,
  unit: number,
) {
  const n = m.level >= 4 ? 5 : 2;
  for (let i = 0; i < n; i++) {
    const t = m.time * (m.level >= 4 ? 0.35 : 0.55) + i * 2.2;
    const lx = LAWN_LEFT + 40 + (Math.sin(t * 0.7) * 0.5 + 0.5) * (LAWN_RIGHT - LAWN_LEFT - 80);
    const ly = LAWN_TOP + 18 + (Math.sin(t * 1.3 + i) * 0.5 + 0.5) * (ROWS * CELL_H - 50);
    if (m.level >= 4) {
      const a = 0.45 + Math.sin(t * 3) * 0.4;
      ctx.fillStyle = `rgba(255, 226, 140, ${0.35 + a * 0.45})`;
      ctx.beginPath();
      ctx.arc(X(lx), Y(ly), 2.4 * unit, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.save();
    ctx.translate(X(lx), Y(ly));
    ctx.scale(unit, unit);
    const flap = Math.sin(m.time * 24 + i) * 0.4;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-3, -4, 4, 2, -0.5 + flap, 0, Math.PI * 2);
    ctx.ellipse(3, -4, 4, 2, 0.5 - flap, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c14b";
    ctx.strokeStyle = "#5c4632";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#3a2a18";
    ctx.beginPath();
    ctx.moveTo(-1.5, -2.4);
    ctx.lineTo(-1.5, 2.4);
    ctx.moveTo(1.2, -2.4);
    ctx.lineTo(1.2, 2.4);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  p: Particle,
  font: string,
  X: (n: number) => number,
  Y: (n: number) => number,
  unit: number,
) {
  const a = Math.max(0, p.life / p.max);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(X(p.x), Y(p.y));
  ctx.rotate(p.rot);
  const size = p.size * unit;
  if (p.kind === "text") {
    ctx.font = `700 ${Math.max(12, size)}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(40, 24, 8, 0.45)";
    ctx.fillText(p.text ?? "", 1, 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text ?? "", 0, 0);
  } else if (p.kind === "ring") {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3 * unit;
    ctx.beginPath();
    ctx.arc(0, 0, size * (1.4 - a), 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.kind === "leaf") {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  m: Match,
  font: string,
  view: FrameView,
) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, m.bannerT * 2);
  const fontPx = Math.max(13, Math.min(20, view.sw / 34));
  ctx.font = `700 ${fontPx}px ${font}`;
  const w = Math.min(view.sw - 24, ctx.measureText(m.banner).width + 28);
  const h = fontPx + 12;
  const x = view.ox + (view.sw - w) / 2;
  const y = view.oy + view.sh - h - 8;
  ctx.fillStyle = "rgba(24, 48, 22, 0.9)";
  round(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = "#f4ffe8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(m.banner, view.ox + view.sw / 2, y + h / 2);
  ctx.restore();
}

function drawTrowel(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.translate(2, -28);
  ctx.rotate(-0.7);
  ctx.fillStyle = "#8a5434";
  ctx.strokeStyle = "#4a2c18";
  ctx.lineWidth = 1.35;
  ctx.lineJoin = "round";
  round(ctx, -3.4, -2, 7, 34, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c47a45";
  ctx.fillRect(-3.4, 18, 7, 4);
  const blade = ctx.createLinearGradient(-8, -30, 8, 0);
  blade.addColorStop(0, "#f4f7f8");
  blade.addColorStop(0.5, "#c5ccd1");
  blade.addColorStop(1, "#8b939a");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(-7, -4);
  ctx.quadraticCurveTo(-11, -24, 0, -32);
  ctx.quadraticCurveTo(11, -24, 7, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5c656c";
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.ellipse(-2, -20, 1.6, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawTrayIcon(
  ctx: CanvasRenderingContext2D,
  kind: PlantKind | "trowel",
  time: number,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const s = w / 96;
  ctx.setTransform(s, 0, 0, s, w / 2, h * 0.9);
  ctx.fillStyle = "rgba(70, 46, 24, 0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 1, 16, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "trowel") drawTrowel(ctx);
  else if (kind === "sunbloom") drawSunbloom(ctx, time);
  else if (kind === "podsnap") drawPodsnap(ctx, time, 0.05);
  else if (kind === "bramble") drawBramble(ctx, time);
  else if (kind === "dewburst") drawDewburst(ctx, time);
  else drawChillvine(ctx, time);
}

function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
}
