import {
  CAP_H,
  GROUND_H,
  H,
  PLAY_BOTTOM,
  START_HEARTS,
  TOWER_W,
  flyerX,
  type State,
  type Tower,
} from "./engine";

export type Art = {
  sky: HTMLImageElement;
  ground: HTMLImageElement;
  flyer: HTMLImageElement;
  star: HTMLImageElement;
};

type Look = {
  hillFar: [string, string];
  hillNear: [string, string];
  towerBodies: [string, string][];
  towerLine: string;
  cap: [string, string];
  capEdge: string;
  groundEdge: string;
  heart: string;
};

const LOOKS: Record<"keira" | "luke", Look> = {
  keira: {
    hillFar: ["rgba(216,180,254,0.85)", "rgba(196,181,253,0.55)"],
    hillNear: ["#bbf7d0", "#86efac"],
    towerBodies: [
      ["#fbcfe8", "#f472b6"],
      ["#ddd6fe", "#a78bfa"],
      ["#bbf7d0", "#34d399"],
      ["#fde68a", "#fb923c"],
    ],
    towerLine: "rgba(112, 26, 117, 0.35)",
    cap: ["#ffffff", "#fce7f3"],
    capEdge: "rgba(190, 24, 93, 0.35)",
    groundEdge: "#86efac",
    heart: "#f43f5e",
  },
  luke: {
    hillFar: ["rgba(125,168,150,0.8)", "rgba(96,140,120,0.55)"],
    hillNear: ["#84cc16", "#4d7c0f"],
    towerBodies: [
      ["#e2a468", "#9a5325"],
      ["#d6a36f", "#8b5a2b"],
      ["#e8b27a", "#a4572a"],
    ],
    towerLine: "rgba(69, 26, 3, 0.55)",
    cap: ["#86efac", "#16a34a"],
    capEdge: "rgba(20, 83, 45, 0.6)",
    groundEdge: "#65a30d",
    heart: "#ef4444",
  },
};

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  h: number,
) {
  const k = Math.max(W / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, (W - dw) / 2, (h - dh) * 0.35, dw, dh);
}

function drawClouds(ctx: CanvasRenderingContext2D, W: number, scroll: number) {
  const par = scroll * 0.12;
  const cell = 230;
  const first = Math.floor(par / cell) - 1;
  const last = Math.floor((par + W) / cell) + 1;
  for (let c = first; c <= last; c++) {
    const h1 = hash(c);
    if (h1 < 0.3) continue;
    const x = c * cell - par + hash(c + 7) * 80;
    const y = 50 + hash(c + 3) * 170;
    const s = 0.6 + hash(c + 11) * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(120, 110, 170, 0.12)";
    puff(ctx, 4, 8);
    ctx.fillStyle = "#ffffff";
    puff(ctx, 0, 0);
    ctx.restore();
  }
}

function puff(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.beginPath();
  ctx.arc(ox + 0, oy + 0, 26, 0, Math.PI * 2);
  ctx.arc(ox + 30, oy - 12, 32, 0, Math.PI * 2);
  ctx.arc(ox + 64, oy - 2, 26, 0, Math.PI * 2);
  ctx.arc(ox + 88, oy + 8, 18, 0, Math.PI * 2);
  ctx.rect(ox - 4, oy + 4, 96, 22);
  ctx.fill();
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  W: number,
  scroll: number,
  factor: number,
  base: number,
  amp: number,
  colors: [string, string],
  seed: number,
) {
  const off = scroll * factor;
  ctx.beginPath();
  ctx.moveTo(0, PLAY_BOTTOM + 4);
  for (let x = 0; x <= W + 8; x += 8) {
    const wx = x + off;
    const y =
      base -
      amp *
        (0.55 * Math.sin(wx * 0.006 + seed) +
          0.3 * Math.sin(wx * 0.013 + seed * 2.3) +
          0.15 * Math.sin(wx * 0.031 + seed * 0.7));
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W + 8, PLAY_BOTTOM + 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, base - amp, 0, PLAY_BOTTOM);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawStarShape(
  ctx: CanvasRenderingContext2D,
  r: number,
  inner = 0.45,
  points = 5,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function towerBody(
  ctx: CanvasRenderingContext2D,
  look: Look,
  profile: "keira" | "luke",
  t: Tower,
  y: number,
  h: number,
  capAtBottom: boolean,
) {
  if (h <= 0) return;
  const x = t.x;
  const colors = look.towerBodies[Math.floor(t.seed) % look.towerBodies.length];
  const g = ctx.createLinearGradient(x, 0, x + TOWER_W, 0);
  g.addColorStop(0, colors[1]);
  g.addColorStop(0.18, colors[0]);
  g.addColorStop(0.42, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, TOWER_W, h);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();

  if (profile === "keira") {
    // Candy stripes.
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    const step = 34;
    const start = Math.floor((y - TOWER_W) / step) * step;
    for (let sy = start; sy < y + h + TOWER_W; sy += step) {
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + TOWER_W, sy - 26);
      ctx.lineTo(x + TOWER_W, sy - 12);
      ctx.lineTo(x, sy + 14);
      ctx.closePath();
      ctx.fill();
    }
    // Frosting drips running down from the cap.
    if (!capAtBottom) {
      ctx.fillStyle = look.cap[1];
      for (let i = 0; i < 5; i++) {
        const dx = x + 8 + i * 15;
        const len = 10 + hash(t.seed + i) * 22;
        ctx.beginPath();
        ctx.roundRect(dx - 5, y - 6, 10, len + 6, 5);
        ctx.fill();
      }
    }
  } else {
    // Rock strata.
    ctx.strokeStyle = "rgba(69, 26, 3, 0.25)";
    ctx.lineWidth = 3;
    const step = 30;
    const start = Math.floor(y / step) * step;
    for (let sy = start; sy < y + h + step; sy += step) {
      const wob = hash(sy * 0.1 + t.seed) * 8;
      ctx.beginPath();
      ctx.moveTo(x, sy + wob);
      ctx.quadraticCurveTo(x + TOWER_W / 2, sy - 6 + wob, x + TOWER_W, sy + 4);
      ctx.stroke();
    }
    // A fossil bone for fun.
    const by = capAtBottom ? y + h - 90 : y + 80;
    if (h > 130) {
      ctx.save();
      ctx.translate(x + TOWER_W / 2, by);
      ctx.rotate(hash(t.seed) - 0.5);
      ctx.fillStyle = "rgba(255, 247, 230, 0.85)";
      ctx.beginPath();
      ctx.roundRect(-16, -4, 32, 8, 4);
      ctx.arc(-16, -4, 5, 0, Math.PI * 2);
      ctx.arc(-16, 4, 5, 0, Math.PI * 2);
      ctx.arc(16, -4, 5, 0, Math.PI * 2);
      ctx.arc(16, 4, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // Glossy highlight.
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(x + 12, y, 8, h);
  ctx.restore();

  ctx.strokeStyle = look.towerLine;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y - 2, TOWER_W - 3, h + 4);
}

function towerCap(
  ctx: CanvasRenderingContext2D,
  look: Look,
  profile: "keira" | "luke",
  t: Tower,
  capY: number,
  facingDown: boolean,
) {
  const x = t.x - 8;
  const w = TOWER_W + 16;
  const g = ctx.createLinearGradient(0, capY, 0, capY + CAP_H);
  g.addColorStop(0, look.cap[0]);
  g.addColorStop(1, look.cap[1]);
  ctx.fillStyle = g;
  ctx.strokeStyle = look.capEdge;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, capY, w, CAP_H, 12);
  ctx.fill();
  ctx.stroke();

  if (profile === "keira") {
    if (facingDown) {
      ctx.fillStyle = look.cap[1];
      for (let i = 0; i < 5; i++) {
        const dx = x + 14 + i * 15;
        const len = 5 + hash(t.seed + i * 7) * 9;
        ctx.beginPath();
        ctx.roundRect(dx - 4, capY + CAP_H - 6, 8, len + 6, 4);
        ctx.fill();
      }
    }
    const cols = ["#f472b6", "#60a5fa", "#facc15", "#34d399", "#a78bfa"];
    for (let i = 0; i < 9; i++) {
      const sx = x + 10 + hash(t.seed + i * 3) * (w - 20);
      const sy = capY + 6 + hash(t.seed + i * 5) * (CAP_H - 12);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(hash(t.seed + i) * Math.PI);
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath();
      ctx.roundRect(-4, -1.5, 8, 3, 1.5);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // Grass tufts pointing into the gap.
    ctx.fillStyle = look.cap[1];
    const edge = facingDown ? capY + CAP_H - 2 : capY + 2;
    const dir = facingDown ? 1 : -1;
    for (let i = 0; i < 8; i++) {
      const gx = x + 6 + i * ((w - 12) / 7);
      const len = 6 + hash(t.seed + i * 2) * 8;
      ctx.beginPath();
      ctx.moveTo(gx - 4, edge);
      ctx.lineTo(gx, edge + len * dir);
      ctx.lineTo(gx + 4, edge);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.roundRect(x + 8, capY + 5, w - 16, 5, 3);
    ctx.fill();
  }
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  look: Look,
  profile: "keira" | "luke",
  t: Tower,
) {
  const g = t.grow;
  const e = g >= 1 ? 1 : 1 - Math.pow(1 - g, 3);
  const top = (t.gapY - t.gap / 2) * e - 30 * (1 - e);
  const bot = PLAY_BOTTOM - (PLAY_BOTTOM - (t.gapY + t.gap / 2)) * e + 30 * (1 - e);
  // Soft shadow to the right for depth.
  ctx.fillStyle = "rgba(40, 20, 60, 0.12)";
  ctx.fillRect(t.x + TOWER_W, 0, 8, top);
  ctx.fillRect(t.x + TOWER_W, bot, 8, PLAY_BOTTOM - bot);

  towerBody(ctx, look, profile, t, -4, top - CAP_H + 4, true);
  towerBody(ctx, look, profile, t, bot + CAP_H, PLAY_BOTTOM - bot - CAP_H, false);
  towerCap(ctx, look, profile, t, top - CAP_H, true);
  towerCap(ctx, look, profile, t, bot, false);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  scroll: number,
  look: Look,
) {
  const dh = GROUND_H + 6;
  const dw = (img.width / img.height) * dh;
  const off = scroll % (dw * 2);
  for (let i = -1; i * dw - off < W; i++) {
    const x = i * dw - off;
    if (x + dw < 0) continue;
    ctx.save();
    if (((i % 2) + 2) % 2 === 1) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, PLAY_BOTTOM - 4, dw + 0.5, dh);
    } else {
      ctx.drawImage(img, x, PLAY_BOTTOM - 4, dw + 0.5, dh);
    }
    ctx.restore();
  }
  ctx.fillStyle = look.groundEdge;
  ctx.fillRect(0, PLAY_BOTTOM - 6, W, 6);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(0, PLAY_BOTTOM - 6, W, 2);
  const g = ctx.createLinearGradient(0, PLAY_BOTTOM, 0, PLAY_BOTTOM + 18);
  g.addColorStop(0, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, PLAY_BOTTOM, W, 18);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.closePath();
}

function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
  fill: string,
  stroke: string,
) {
  ctx.font = `700 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function draw(
  ctx: CanvasRenderingContext2D,
  s: State,
  art: Art | null,
  font: string,
  ink: string,
) {
  const W = s.W;
  const look = LOOKS[s.profile];
  ctx.save();
  if (s.shake > 0) {
    ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
  }

  // Sky.
  if (art) {
    drawCover(ctx, art.sky, W, PLAY_BOTTOM + 40);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#fbcfe8");
    g.addColorStop(1, "#bae6fd");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // Wash the top a touch so the score reads well.
  const wash = ctx.createLinearGradient(0, 0, 0, 160);
  wash.addColorStop(0, "rgba(255,255,255,0.25)");
  wash.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 160);

  drawClouds(ctx, W, s.scroll);
  drawHills(ctx, W, s.scroll, 0.22, PLAY_BOTTOM - 110, 50, look.hillFar, 1.3);
  drawHills(ctx, W, s.scroll, 0.5, PLAY_BOTTOM - 40, 34, look.hillNear, 4.1);

  // Towers + stars.
  for (const t of s.towers) drawTower(ctx, look, s.profile, t);
  for (const t of s.towers) {
    if (t.scored || t.grow < 1) continue;
    const cx = t.x + TOWER_W / 2;
    const pulse = 1 + Math.sin(s.t * 5 + t.seed) * 0.08;
    const glow = ctx.createRadialGradient(cx, t.gapY, 4, cx, t.gapY, 42);
    glow.addColorStop(0, "rgba(255,250,200,0.8)");
    glow.addColorStop(1, "rgba(255,250,200,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 42, t.gapY - 42, 84, 84);
    if (art) {
      ctx.save();
      ctx.translate(cx, t.gapY);
      ctx.rotate(Math.sin(s.t * 2 + t.seed) * 0.2);
      ctx.scale(pulse, pulse);
      ctx.drawImage(art.star, -21, -20, 42, 40);
      ctx.restore();
    }
  }
  for (const b of s.bonuses) {
    if (b.taken) continue;
    const bob = Math.sin(s.t * 4 + b.seed) * 5;
    ctx.save();
    ctx.translate(b.x, b.y + bob);
    ctx.rotate(s.t * 1.5 + b.seed);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    drawStarShape(ctx, 17, 0.42, 4);
    ctx.fill();
    ctx.fillStyle = s.profile === "keira" ? "#f0abfc" : "#fde047";
    drawStarShape(ctx, 12, 0.42, 4);
    ctx.fill();
    ctx.restore();
  }

  if (art) drawGround(ctx, art.ground, W, s.scroll, look);
  else {
    ctx.fillStyle = look.hillNear[1];
    ctx.fillRect(0, PLAY_BOTTOM, W, GROUND_H);
  }

  // Particles behind the flyer.
  for (const p of s.particles) {
    const a = Math.max(0, p.life / p.max);
    ctx.globalAlpha = p.kind === "puff" ? a * 0.7 : a;
    ctx.fillStyle = p.color;
    if (p.kind === "sparkle") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      drawStarShape(ctx, p.size * 1.4, 0.4, 4);
      ctx.fill();
      ctx.restore();
    } else if (p.kind === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4 * a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + (1 - a) * 40, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Flyer.
  const fx = flyerX(W);
  const blink = s.invuln > 0 && Math.floor(s.invuln * 10) % 2 === 0;
  ctx.save();
  ctx.translate(fx, s.y);
  // Shadow on the ground.
  const shadowK = Math.max(0.25, 1 - (PLAY_BOTTOM - s.y) / 500);
  ctx.fillStyle = `rgba(30, 20, 50, ${0.18 * shadowK})`;
  ctx.beginPath();
  ctx.ellipse(0, PLAY_BOTTOM - s.y + 2, 26 * shadowK, 6 * shadowK, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(s.angle);
  const sq = s.squash;
  const flutter = s.phase === "dying" ? 0 : Math.sin(s.t * 22) * 0.04;
  ctx.scale(1 + sq * 0.14, 1 - sq * 0.14 + flutter);
  if (blink) ctx.globalAlpha = 0.45;
  if (s.invuln > 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (art) {
    const img = art.flyer;
    const k = 78 / Math.max(img.width, img.height);
    const dw = img.width * k;
    const dh = img.height * k;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.fillStyle = "#f472b6";
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Floating "+1".
  for (const t of s.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    const k = 1 + (1 - t.life) * 0.3;
    outlinedText(ctx, t.text, t.x, t.y, 26 * k, font, "#fff", ink);
  }
  ctx.globalAlpha = 1;

  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();

  // HUD (not shaken).
  if (s.phase !== "ready") {
    const pop = 1 + s.scorePop * 0.35;
    ctx.save();
    ctx.translate(W / 2, 62);
    ctx.scale(pop, pop);
    outlinedText(ctx, String(s.score), 0, 0, 58, font, "#ffffff", ink);
    ctx.restore();

    for (let i = 0; i < START_HEARTS; i++) {
      const hx = 26 + i * 32;
      const hy = 30;
      drawHeart(ctx, hx, hy, 12);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = i < s.hearts ? look.heart : "rgba(100, 90, 120, 0.35)";
      ctx.fill();
      if (i < s.hearts) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.beginPath();
        ctx.arc(hx - 5, hy - 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (s.banner) {
    const b = s.banner;
    const inT = Math.min(1, (1.6 - b.life) * 6);
    const outA = Math.min(1, b.life * 3);
    const k = 0.6 + 0.4 * easeOutBack(inT);
    ctx.save();
    ctx.globalAlpha = outA;
    ctx.translate(W / 2, H * 0.3);
    ctx.scale(k, k);
    ctx.rotate(-0.05);
    outlinedText(ctx, b.text, 0, 0, 44, font, "#fde047", ink);
    ctx.restore();
  }
}

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
