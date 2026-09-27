import {
  CELL_H,
  CELL_W,
  COLS,
  H,
  LAWN_BOTTOM,
  LAWN_LEFT,
  LAWN_RIGHT,
  LAWN_TOP,
  LEVELS,
  ROWS,
  W,
  colCenter,
  rowFeet,
} from "./balance";
import type { Creeper, Match, Plant, Shot, SunOrb } from "./logic";

const FLOWERS = Array.from({ length: COLS * ROWS }, (_, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS) % ROWS;
  const h = hash(i * 19 + 4);
  return {
    x: LAWN_LEFT + col * CELL_W + 8 + hash(i * 3 + 1) * (CELL_W - 18),
    y: LAWN_TOP + row * CELL_H + 10 + h * (CELL_H * 0.55),
    c: ["#ffe4ee", "#fff3b0", "#ffffff", "#ffc2a8", "#e4d4ff"][i % 5],
    r: 2 + (i % 3),
  };
});

function hash(n: number) {
  const s = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return (s % 10000) / 10000;
}

export function drawFrame(ctx: CanvasRenderingContext2D, m: Match, font: string) {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (m.shake > 0) {
    const mag = m.shake * 10;
    ctx.translate(Math.sin(m.time * 46) * mag, Math.cos(m.time * 39) * mag);
  }
  drawSky(ctx, m);
  drawLawn(ctx, m);
  drawHouse(ctx, m);
  drawGhost(ctx, m);
  const plants = [...m.plants].sort((a, b) => a.row - b.row);
  for (const p of plants) drawPlant(ctx, p, m.time);
  for (const s of m.shots) drawShot(ctx, s, m.time);
  const creepers = [...m.creepers].sort((a, b) => a.row - b.row || a.x - b.x);
  for (const z of creepers) drawCreeper(ctx, z, m.time);
  drawBees(ctx, m);
  for (const p of m.parts) drawPart(ctx, p, font);
  for (const s of m.suns) drawSunOrb(ctx, s);
  ctx.restore();
  drawHud(ctx, m, font);
  if (m.bannerT > 0 && m.banner) drawBanner(ctx, m, font);
}

function skyColors(level: number): [string, string, string] {
  if (level <= 1) return ["#8fd0ff", "#d7f3ff", "#e7f8c8"];
  if (level === 2) return ["#79c4ff", "#c9ecff", "#dff6b0"];
  if (level === 3) return ["#f2b56b", "#ffd7a1", "#d7ef9a"];
  return ["#3c4d86", "#7d6aa8", "#e7b0c8"];
}

function drawSky(ctx: CanvasRenderingContext2D, m: Match) {
  const [a, b, c] = skyColors(m.level);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, a);
  g.addColorStop(0.45, b);
  g.addColorStop(1, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const dusk = m.level >= 4;
  if (dusk) {
    ctx.fillStyle = "#f4f0ff";
    ctx.beginPath();
    ctx.arc(690, 48, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skyColors(4)[0];
    ctx.beginPath();
    ctx.arc(698, 44, 16, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const sun = ctx.createRadialGradient(78, 36, 4, 78, 36, 42);
    sun.addColorStop(0, "#fff6c2");
    sun.addColorStop(0.45, "#ffd15c");
    sun.addColorStop(1, "rgba(255,209,92,0)");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(78, 36, 42, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = dusk ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.72)";
  for (let i = 0; i < 4; i++) {
    const x = ((m.time * (10 + i * 3) + i * 210) % (W + 140)) - 70;
    const y = 18 + (i % 3) * 16;
    cloud(ctx, x, y, 0.7 + (i % 3) * 0.15);
  }

  // Soft hills behind the lawn.
  ctx.fillStyle = dusk ? "#6d8a62" : "#8ed36a";
  ctx.beginPath();
  ctx.moveTo(0, LAWN_TOP + 18);
  for (let x = 0; x <= W; x += 20) {
    ctx.lineTo(x, LAWN_TOP + 8 + Math.sin(x * 0.02 + 1) * 8);
  }
  ctx.lineTo(W, LAWN_TOP + 30);
  ctx.lineTo(0, LAWN_TOP + 30);
  ctx.fill();
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, 26 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 18 * s, y + 2, 18 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 16 * s, y + 3, 16 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLawn(ctx: CanvasRenderingContext2D, m: Match) {
  const dusk = m.level >= 4;
  for (let r = 0; r < ROWS; r++) {
    const y = LAWN_TOP + r * CELL_H;
    ctx.fillStyle = r % 2 === 0 ? (dusk ? "#4f7a45" : "#7dce4e") : dusk ? "#456c3d" : "#6cbf43";
    ctx.fillRect(LAWN_LEFT, y, COLS * CELL_W, CELL_H);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(LAWN_LEFT, y, COLS * CELL_W, 3);
    ctx.fillStyle = dusk ? "rgba(40,30,20,0.18)" : "rgba(120,78,40,0.16)";
    ctx.fillRect(LAWN_LEFT, y + CELL_H - 3, COLS * CELL_W, 3);
  }

  for (const f of FLOWERS) {
    const sway = Math.sin(m.time * 1.6 + f.x * 0.05) * 1.2;
    ctx.fillStyle = f.c;
    ctx.beginPath();
    ctx.ellipse(f.x + sway, f.y, f.r, f.r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c14b";
    ctx.beginPath();
    ctx.arc(f.x + sway, f.y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = dusk ? "rgba(220,255,220,0.18)" : "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  for (let r = 0; r < ROWS; r++) {
    const base = LAWN_TOP + (r + 1) * CELL_H - 5;
    for (let c = 0; c < COLS; c++) {
      for (let b = 0; b < 3; b++) {
        const x = LAWN_LEFT + c * CELL_W + 10 + b * 22;
        const h = 7 + (b % 2) * 3;
        const sway = Math.sin(m.time * 2.2 + x * 0.08 + r) * 3;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.quadraticCurveTo(x + sway * 0.4, base - h * 0.6, x + sway, base - h);
        ctx.stroke();
      }
    }
  }

  // Entry dirt where creepers step onto the grass.
  const dirt = ctx.createLinearGradient(LAWN_RIGHT - 8, 0, W, 0);
  dirt.addColorStop(0, "rgba(196, 150, 90, 0)");
  dirt.addColorStop(1, dusk ? "#5a4634" : "#d7b07a");
  ctx.fillStyle = dirt;
  ctx.fillRect(LAWN_RIGHT - 8, LAWN_TOP, W - LAWN_RIGHT + 8, ROWS * CELL_H);

  ctx.strokeStyle = "rgba(90,60,30,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(LAWN_LEFT + 0.5, LAWN_TOP + 0.5, COLS * CELL_W - 1, ROWS * CELL_H - 1);
}

function drawHouse(ctx: CanvasRenderingContext2D, m: Match) {
  const top = LAWN_TOP;
  const bot = LAWN_BOTTOM;
  ctx.fillStyle = m.houseHurt > 0 ? "#e7b1a4" : "#efe2cf";
  round(ctx, 8, top + 8, 92, bot - top - 16, 16);
  ctx.fill();
  ctx.fillStyle = "#e7d3b5";
  for (let y = top + 18; y < bot - 16; y += 16) {
    ctx.fillRect(14, y, 78, 2);
  }

  // Coral roof over the middle of the wall.
  ctx.fillStyle = "#e07a5f";
  ctx.beginPath();
  ctx.moveTo(4, top + 118);
  ctx.lineTo(52, top + 62);
  ctx.lineTo(104, top + 118);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c45d48";
  ctx.fillRect(46, top + 48, 14, 28);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(52, top + 66);
  ctx.lineTo(78, top + 104);
  ctx.lineTo(70, top + 108);
  ctx.lineTo(48, top + 74);
  ctx.fill();

  // Smoke
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (let i = 0; i < 3; i++) {
    const t = (m.time * 0.35 + i * 0.33) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.arc(54 + Math.sin(m.time + i) * 4, top + 46 - t * 36, 4 + t * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Door and windows
  ctx.fillStyle = "#6b3f2a";
  round(ctx, 36, top + 150, 28, 40, 14);
  ctx.fill();
  ctx.fillStyle = "#f6d36b";
  ctx.beginPath();
  ctx.arc(58, top + 170, 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = m.level >= 4 ? "#f6e3a1" : "#bfe7ff";
  round(ctx, 22, top + 126, 16, 16, 4);
  ctx.fill();
  round(ctx, 66, top + 126, 16, 16, 4);
  ctx.fill();
  ctx.strokeStyle = "#8a5a3c";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(22.5, top + 126.5, 15, 15);
  ctx.strokeRect(66.5, top + 126.5, 15, 15);

  // Ivy and flower boxes along the wall so every lane reads as "home".
  ctx.fillStyle = "#3f8f45";
  for (let r = 0; r < ROWS; r++) {
    const y = rowFeet(r);
    ctx.beginPath();
    ctx.ellipse(96, y - 8, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = r % 2 ? "#ff8fab" : "#ffd15c";
    ctx.beginPath();
    ctx.arc(100, y - 14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f8f45";
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, m: Match) {
  if (m.phase !== "play" || !m.selected || m.selected === "trowel") return;
  if (m.hoverCol < 0 || m.hoverRow < 0) return;
  const occupied = m.plants.some(
    (p) => p.col === m.hoverCol && p.row === m.hoverRow && p.hp > 0,
  );
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = occupied ? "rgba(220,70,70,0.35)" : "rgba(255,255,255,0.28)";
  ctx.fillRect(
    LAWN_LEFT + m.hoverCol * CELL_W + 3,
    LAWN_TOP + m.hoverRow * CELL_H + 3,
    CELL_W - 6,
    CELL_H - 6,
  );
  if (!occupied) {
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
    );
  }
  ctx.restore();
}

function popScale(age: number) {
  const t = Math.min(1, age / 0.28);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 0.4 + 0.6 * (1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2);
}

function drawPlant(ctx: CanvasRenderingContext2D, p: Plant, time: number) {
  const x = colCenter(p.col);
  const y = rowFeet(p.row);
  ctx.save();
  ctx.translate(x, y);
  const s = popScale(p.age);
  ctx.scale(s, s);
  shadow(ctx, 0, -2, 16, 5);
  if (p.kind === "sunbloom") drawSunbloom(ctx, time + p.col);
  else if (p.kind === "podsnap") drawPodsnap(ctx, time + p.row, p.mouth);
  else if (p.kind === "bramble") drawBramble(ctx, time);
  else if (p.kind === "dewburst") drawDewburst(ctx, time);
  else drawChillvine(ctx, time);
  if (p.hurt > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, p.hurt * 4)})`;
    ctx.beginPath();
    ctx.ellipse(0, -28, 20, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (p.hp < p.maxHp && p.hp > 0) bar(ctx, x, y - 62, p.hp / p.maxHp, "#7dce4e");
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = "rgba(40,70,20,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number, look = 0) {
  const blink = Math.sin(time * 1.7 + x) > 0.96;
  const h = blink ? 1 : r;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(x - r * 1.5, y, r * 1.15, h, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 1.5, y, r * 1.15, h, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!blink) {
    ctx.fillStyle = "#243023";
    ctx.beginPath();
    ctx.arc(x - r * 1.5 + look, y + 0.4, r * 0.48, 0, Math.PI * 2);
    ctx.arc(x + r * 1.5 + look, y + 0.4, r * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSunbloom(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = "#3e8f3a";
  ctx.fillRect(-3, -26, 6, 26);
  ctx.fillStyle = "#67c15a";
  ctx.beginPath();
  ctx.ellipse(-12, -12, 8, 4, -0.8, 0, Math.PI * 2);
  ctx.ellipse(12, -14, 8, 4, 0.7, 0, Math.PI * 2);
  ctx.fill();
  const pulse = 1 + Math.sin(time * 3) * 0.05;
  ctx.save();
  ctx.translate(0, -36);
  ctx.scale(pulse, pulse);
  ctx.rotate(Math.sin(time * 0.8) * 0.08);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i % 2 ? "#ffd15c" : "#ffb703";
    ctx.beginPath();
    ctx.ellipse(0, -14, 6, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ff9f1c";
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe08a";
  ctx.beginPath();
  ctx.arc(-3, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, 0, -1, 2.4, time);
  ctx.strokeStyle = "#7a4b12";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 3, 3, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

function drawPodsnap(ctx: CanvasRenderingContext2D, time: number, mouth: number) {
  ctx.fillStyle = "#2f8a3a";
  ctx.fillRect(-3, -18, 6, 18);
  ctx.fillStyle = "#8ed36a";
  leaf(ctx, -16, -20, -0.9);
  leaf(ctx, 16, -22, 0.9);
  ctx.fillStyle = "#3aaa4a";
  ctx.beginPath();
  ctx.ellipse(0, -34, 16, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d7f5a8";
  ctx.beginPath();
  ctx.ellipse(0, -30, 10, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  const open = 3 + mouth * 28;
  ctx.fillStyle = "#214c28";
  ctx.beginPath();
  ctx.ellipse(10, -32, open, 5 + mouth * 6, 0, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, -2, -40, 3.1, time, 1);
  ctx.fillStyle = "#ffb7c8";
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(-10, -32, 2.4, 0, Math.PI * 2);
  ctx.arc(4, -31, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Bob
  ctx.translate(0, Math.sin(time * 4) * 0.6);
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBramble(ctx: CanvasRenderingContext2D, time: number) {
  const wob = Math.sin(time * 2) * 1;
  ctx.fillStyle = "#2f6a32";
  ctx.beginPath();
  ctx.arc(-10, -22 + wob, 12, 0, Math.PI * 2);
  ctx.arc(8, -26, 14, 0, Math.PI * 2);
  ctx.arc(0, -14, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f8a40";
  ctx.beginPath();
  ctx.arc(-4, -24, 8, 0, Math.PI * 2);
  ctx.fill();
  thorn(ctx, -16, -30, -0.6);
  thorn(ctx, 14, -36, 0.4);
  thorn(ctx, 12, -16, 1.2);
  thorn(ctx, -14, -12, 2.4);
  ctx.fillStyle = "#d4527a";
  ctx.beginPath();
  ctx.arc(-8, -18, 3, 0, Math.PI * 2);
  ctx.arc(6, -20, 2.6, 0, Math.PI * 2);
  ctx.arc(1, -30, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function thorn(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#f4f1e6";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(3, 2);
  ctx.lineTo(-3, 2);
  ctx.fill();
  ctx.restore();
}

function drawDewburst(ctx: CanvasRenderingContext2D, time: number) {
  ctx.fillStyle = "#2f8f78";
  ctx.fillRect(-3, -20, 6, 20);
  ctx.save();
  ctx.translate(0, -32 + Math.sin(time * 3) * 1);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.fillStyle = i % 2 ? "#7ad7ea" : "#49c2d8";
    ctx.beginPath();
    ctx.ellipse(0, -12, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1b6f86";
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.ellipse(0, -16, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawChillvine(ctx: CanvasRenderingContext2D, time: number) {
  ctx.strokeStyle = "#7ec8b0";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.quadraticCurveTo(-8, -20, 0, -36 + Math.sin(time * 2) * 2);
  ctx.stroke();
  ctx.fillStyle = "#c8f3ea";
  leaf(ctx, -12, -22, -0.6);
  leaf(ctx, 10, -30, 0.8);
  crystal(ctx, 0, -42, 7 + Math.sin(time * 4) * 0.4);
  crystal(ctx, -14, -34, 4);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(6, -48, 1.4, 0, Math.PI * 2);
  ctx.arc(-8, -44, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e8fbff";
  ctx.strokeStyle = "#6fb9d4";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.65, 0);
  ctx.lineTo(0, s);
  ctx.lineTo(-s * 0.65, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawShot(ctx: CanvasRenderingContext2D, s: Shot, time: number) {
  if (s.kind === "pod") {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(time * 10);
    ctx.fillStyle = "#8ed36a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#eaffc8";
    ctx.beginPath();
    ctx.ellipse(-2, -1, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (s.kind === "chill") {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(time * 6);
    ctx.strokeStyle = "#f4fbff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
    }
    ctx.fillStyle = "#dff6ff";
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const g = ctx.createRadialGradient(s.x - 2, s.y - 2, 1, s.x, s.y, 9);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, "#b9ecff");
  g.addColorStop(1, "rgba(90,190,220,0.15)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawCreeper(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  const y = rowFeet(z.row);
  const fade = z.dead > 0 ? Math.max(0.15, z.dead / 0.5) : 1;
  ctx.save();
  ctx.translate(z.x, y);
  ctx.globalAlpha = fade;
  ctx.scale(fade, fade);
  shadow(ctx, 0, -2, z.kind === "barkhelm" ? 20 : 14, 5);
  if (z.kind === "mulchling") drawMulchling(ctx, z, time);
  else if (z.kind === "dashling") drawDashling(ctx, z, time);
  else if (z.kind === "barkhelm") drawBarkhelm(ctx, z, time);
  else drawGnasher(ctx, z, time);
  if (z.slow > 0) {
    ctx.fillStyle = "rgba(190, 235, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, -24, 18, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (z.hurt > 0 && z.dead <= 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, z.hurt * 5)})`;
    ctx.beginPath();
    ctx.ellipse(0, -26, 16, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (z.hp > 0 && z.hp < z.maxHp && z.dead <= 0) {
    bar(ctx, z.x, y - 58, z.hp / z.maxHp, "#e07a5f");
  }
}

function legs(ctx: CanvasRenderingContext2D, walk: number, reach: number, color: string) {
  const a = Math.sin(walk) * reach;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-5, -12);
  ctx.lineTo(-6 - a, 0);
  ctx.moveTo(5, -12);
  ctx.lineTo(6 + a, 0);
  ctx.stroke();
}

function drawMulchling(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  legs(ctx, z.walk, 4, "#3e5a28");
  ctx.fillStyle = "#6f8f3a";
  ctx.beginPath();
  ctx.ellipse(0, -28, 16, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#587432";
  ctx.beginPath();
  ctx.arc(-6, -24, 3, 0, Math.PI * 2);
  ctx.arc(5, -32, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fbf4a";
  ctx.beginPath();
  ctx.ellipse(0, -42, 7, 4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, 0, -30, 3, time, -1);
  arm(ctx, -14, -28, -0.8 - (z.eating ? Math.sin(z.walk * 2) * 0.4 : 0));
  arm(ctx, 14, -26, 0.6);
}

function arm(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(10, 2);
  ctx.stroke();
  ctx.restore();
}

function drawDashling(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  legs(ctx, z.walk, 7, "#a85a22");
  ctx.fillStyle = "#e0893a";
  ctx.beginPath();
  ctx.ellipse(0, -32, 11, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd7a8";
  ctx.beginPath();
  ctx.ellipse(0, -28, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Leaf scarf trailing behind (to the right, since they walk left).
  ctx.fillStyle = "#67c15a";
  ctx.beginPath();
  ctx.ellipse(12 + Math.sin(time * 8) * 2, -30, 10, 3.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, 0, -38, 2.8, time, -1.2);
  if (!z.eating) {
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, -20);
    ctx.lineTo(26, -18);
    ctx.moveTo(18, -12);
    ctx.lineTo(28, -12);
    ctx.stroke();
  }
}

function drawBarkhelm(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  legs(ctx, z.walk, 3, "#3e2c1e");
  ctx.fillStyle = "#6b4a32";
  ctx.beginPath();
  ctx.ellipse(0, -28, 18, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3e2c1e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -30, 14, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.fillStyle = "#8a6244";
  ctx.fillRect(-16, -24, 32, 5);
  // Wooden helmet
  ctx.fillStyle = "#5c4030";
  round(ctx, -14, -48, 28, 16, 8);
  ctx.fill();
  ctx.fillStyle = "#e0b15a";
  ctx.beginPath();
  ctx.arc(0, -40, 2, 0, Math.PI * 2);
  ctx.fill();
  eyes(ctx, 0, -30, 2.6, time, -0.6);
  ctx.fillStyle = "#4a3424";
  ctx.fillRect(-4, -22, 8, 3);
}

function drawGnasher(ctx: CanvasRenderingContext2D, z: Creeper, time: number) {
  legs(ctx, z.walk, 4, "#5a2434");
  ctx.fillStyle = "#8d4a62";
  ctx.beginPath();
  ctx.ellipse(0, -26, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  const chomp = z.eating ? 4 + Math.abs(Math.sin(z.walk * 2)) * 7 : 3;
  ctx.fillStyle = "#3a2030";
  ctx.beginPath();
  ctx.ellipse(-2, -20, 8, chomp, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6e8";
  for (const tx of [-6, -2, 2]) {
    ctx.beginPath();
    ctx.moveTo(tx, -20 - chomp * 0.3);
    ctx.lineTo(tx + 2, -16);
    ctx.lineTo(tx - 2, -16);
    ctx.fill();
  }
  eyes(ctx, 1, -32, 3.2, time, -1);
  ctx.fillStyle = "#ffb7c8";
  ctx.beginPath();
  ctx.arc(-10, -24, 2.5, 0, Math.PI * 2);
  ctx.arc(8, -24, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, pct: number, fill: string) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  round(ctx, x - 16, y, 32, 5, 2);
  ctx.fill();
  ctx.fillStyle = fill;
  round(ctx, x - 15, y + 1, Math.max(2, 30 * Math.max(0, Math.min(1, pct))), 3, 1.5);
  ctx.fill();
}

function drawSunOrb(ctx: CanvasRenderingContext2D, s: SunOrb) {
  const bob = s.landed && !s.collecting ? Math.sin(s.age * 3) * 3 : 0;
  const y = s.y + bob;
  const pulse = 1 + Math.sin(s.age * 5) * 0.06;
  ctx.save();
  ctx.translate(s.x, y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 26 + Math.sin(s.age * 4) * 2, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createRadialGradient(-4, -4, 2, 0, 0, 18);
  g.addColorStop(0, "#fff6c4");
  g.addColorStop(0.55, "#ffd15c");
  g.addColorStop(1, "#f0a202");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff3bf";
  ctx.lineWidth = 2;
  ctx.save();
  ctx.rotate(s.age * 0.8);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -23);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawBees(ctx: CanvasRenderingContext2D, m: Match) {
  const dusk = m.level >= 4;
  const n = dusk ? 5 : 2;
  for (let i = 0; i < n; i++) {
    const t = m.time * (dusk ? 0.35 : 0.55) + i * 2.2;
    const x = LAWN_LEFT + 40 + ((Math.sin(t * 0.7) * 0.5 + 0.5) * (LAWN_RIGHT - LAWN_LEFT - 80));
    const y = LAWN_TOP + 20 + ((Math.sin(t * 1.3 + i) * 0.5 + 0.5) * (ROWS * CELL_H - 40));
    if (dusk) {
      const a = 0.35 + Math.sin(t * 3) * 0.35;
      ctx.fillStyle = `rgba(255, 230, 140, ${0.35 + a * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-3, -4, 4, 2, -0.4 + Math.sin(m.time * 20) * 0.4, 0, Math.PI * 2);
    ctx.ellipse(3, -4, 4, 2, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2c14b";
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5c4632";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-2, 0);
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 3);
    ctx.moveTo(2, -3);
    ctx.lineTo(2, 3);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  p: import("./logic").Particle,
  font: string,
) {
  const a = Math.max(0, p.life / p.max);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  if (p.kind === "text") {
    ctx.font = `700 ${p.size}px ${font}`;
    ctx.fillStyle = "#5c3b12";
    ctx.textAlign = "center";
    ctx.fillText(p.text ?? "", 1, 1);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text ?? "", 0, 0);
  } else if (p.kind === "ring") {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, p.size * (1 - a * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.kind === "leaf") {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, m: Match, font: string) {
  const def = LEVELS[m.level - 1];
  // Sun pill
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  round(ctx, 8, 6, 92, 32, 16);
  ctx.fill();
  const g = ctx.createRadialGradient(26, 22, 1, 28, 22, 12);
  g.addColorStop(0, "#fff6c4");
  g.addColorStop(1, "#ffc107");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(28, 22, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a4a12";
  ctx.font = `700 20px ${font}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(String(m.sun), 44, 23);

  // Hearts
  for (let i = 0; i < def.hearts; i++) {
    heart(ctx, 118 + i * 22, 22, i < m.hearts ? "#e85d75" : "rgba(255,255,255,0.35)");
  }

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const label = `Meadow ${m.level} · ${def.name}`;
  ctx.font = `700 15px ${font}`;
  const w = ctx.measureText(label).width + 22;
  round(ctx, W / 2 - w / 2, 6, w, 28, 14);
  ctx.fill();
  ctx.fillStyle = "#24502a";
  ctx.textAlign = "center";
  ctx.fillText(label, W / 2, 21);

  const left = `${m.kills}/${def.spawns.length}`;
  ctx.font = `700 14px ${font}`;
  const lw = ctx.measureText(left).width + 20;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  round(ctx, W - lw - 10, 8, lw, 26, 13);
  ctx.fill();
  ctx.fillStyle = "#24502a";
  ctx.textAlign = "center";
  ctx.fillText(left, W - lw / 2 - 10, 22);
  ctx.textBaseline = "alphabetic";
}

function drawBanner(ctx: CanvasRenderingContext2D, m: Match, font: string) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, m.bannerT * 2);
  ctx.font = `700 16px ${font}`;
  const w = Math.min(W - 40, ctx.measureText(m.banner).width + 28);
  ctx.fillStyle = "rgba(36, 64, 28, 0.88)";
  round(ctx, (W - w) / 2, H - 36, w, 26, 13);
  ctx.fill();
  ctx.fillStyle = "#f4ffe8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(m.banner, W / 2, H - 22);
  ctx.restore();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + 4);
  ctx.bezierCurveTo(x - 8, y - 2, x - 4, y - 8, x, y - 3);
  ctx.bezierCurveTo(x + 4, y - 8, x + 8, y - 2, x, y + 4);
  ctx.fill();
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
  ctx.roundRect(x, y, w, h, r);
}
