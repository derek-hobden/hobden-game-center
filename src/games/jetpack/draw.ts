import {
  CEIL_Y,
  COIN_R,
  FLOOR_Y,
  H,
  MILESTONE_M,
  MISSILE_R,
  ROCK_R,
  START_HEARTS,
  UNITS_PER_M,
  heroX,
  meters,
  type Missile,
  type Pickup,
  type State,
  type Zapper,
} from "./engine";

export type Art = {
  hero: HTMLImageElement;
  hazard: HTMLImageElement;
  coin: HTMLImageElement;
  bg: HTMLImageElement;
};

type Look = {
  tint: string;
  midA: string;
  midB: string;
  rockTop: [string, string];
  rockBottom: [string, string];
  rim: string;
  deco: string[];
  beam: string;
  beamGlow: string;
  orb: [string, string];
  heart: string;
  ambient: string[];
};

const LOOKS: Record<"keira" | "luke", Look> = {
  keira: {
    tint: "rgba(56, 189, 248, 0.10)",
    midA: "rgba(136, 90, 170, 0.28)",
    midB: "rgba(20, 150, 170, 0.22)",
    rockTop: ["#b35c8f", "#e59ab8"],
    rockBottom: ["#f4d6a0", "#d9a86b"],
    rim: "#fff1f7",
    deco: ["#fb7185", "#f472b6", "#fb923c", "#c084fc", "#34d399"],
    beam: "#f0abfc",
    beamGlow: "rgba(240, 171, 252, 0.45)",
    orb: ["#fdf4ff", "#d946ef"],
    heart: "#f43f5e",
    ambient: ["rgba(255,255,255,0.7)", "rgba(224,242,254,0.7)"],
  },
  luke: {
    tint: "rgba(15, 23, 42, 0.12)",
    midA: "rgba(8, 20, 30, 0.45)",
    midB: "rgba(20, 45, 55, 0.4)",
    rockTop: ["#1f2d36", "#3b5566"],
    rockBottom: ["#3f3a2c", "#252219"],
    rim: "#6aa0a8",
    deco: ["#22d3ee", "#a3e635", "#38bdf8", "#facc15"],
    beam: "#fde047",
    beamGlow: "rgba(56, 189, 248, 0.5)",
    orb: ["#f0f9ff", "#0ea5e9"],
    heart: "#ef4444",
    ambient: ["rgba(251,146,60,0.8)", "rgba(253,224,71,0.7)"],
  },
};

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawBg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, scroll: number) {
  const k = H / img.height;
  const dw = img.width * k;
  const off = (scroll * 0.18) % (dw * 2);
  for (let i = 0; i * dw - off < W; i++) {
    const x = i * dw - off;
    if (x + dw < 0) continue;
    ctx.save();
    if (i % 2 === 1) {
      ctx.translate(x + dw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw + 1, H);
    } else {
      ctx.drawImage(img, x, 0, dw + 1, H);
    }
    ctx.restore();
  }
}

/** Mid-distance silhouettes (seaweed & coral, or rock columns). */
function drawMid(ctx: CanvasRenderingContext2D, s: State, look: Look) {
  const par = s.scroll * 0.45;
  const cell = 90;
  const first = Math.floor(par / cell) - 1;
  const last = Math.floor((par + s.W) / cell) + 1;
  for (let c = first; c <= last; c++) {
    const h = hash(c);
    if (h < 0.35) continue;
    const x = c * cell - par + hash(c + 5) * 40;
    const tall = 60 + hash(c + 9) * 150;
    ctx.fillStyle = hash(c + 2) > 0.5 ? look.midA : look.midB;
    if (s.profile === "keira") {
      // Swaying kelp: a wavy ribbon with little leaves.
      ctx.save();
      ctx.strokeStyle = hash(c + 2) > 0.5 ? "rgba(16, 150, 140, 0.38)" : "rgba(120, 90, 180, 0.3)";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      const segs = 8;
      for (let j = 0; j <= segs; j++) {
        const k = j / segs;
        const px = x + Math.sin(k * 5 + s.t * 1.6 + c) * 8 * k;
        const py = FLOOR_Y + 8 - k * tall;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      // Stalagmite + stalactite pair.
      const wdt = 26 + hash(c + 3) * 20;
      ctx.beginPath();
      ctx.moveTo(x - wdt, FLOOR_Y);
      ctx.lineTo(x, FLOOR_Y - tall);
      ctx.lineTo(x + wdt, FLOOR_Y);
      ctx.fill();
      if (hash(c + 17) > 0.45) {
        const t2 = 40 + hash(c + 21) * 90;
        ctx.beginPath();
        ctx.moveTo(x + 30 - wdt * 0.7, CEIL_Y);
        ctx.lineTo(x + 30, CEIL_Y + t2);
        ctx.lineTo(x + 30 + wdt * 0.7, CEIL_Y);
        ctx.fill();
      }
    }
  }
}

function terrainY(wx: number, top: boolean) {
  const n =
    Math.sin(wx * 0.021) * 0.5 +
    Math.sin(wx * 0.047 + 1.7) * 0.3 +
    Math.sin(wx * 0.11 + 0.4) * 0.2;
  return top ? CEIL_Y - 14 + n * 10 : FLOOR_Y + 12 + n * 8;
}

function drawTerrain(ctx: CanvasRenderingContext2D, s: State, look: Look) {
  const W = s.W;
  const off = s.scroll;
  // Ceiling.
  ctx.beginPath();
  ctx.moveTo(-4, -4);
  for (let x = -4; x <= W + 8; x += 6) ctx.lineTo(x, terrainY(x + off, true));
  ctx.lineTo(W + 8, -4);
  ctx.closePath();
  let g = ctx.createLinearGradient(0, 0, 0, CEIL_Y + 10);
  g.addColorStop(0, look.rockTop[0]);
  g.addColorStop(1, look.rockTop[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = look.rim;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Floor.
  ctx.beginPath();
  ctx.moveTo(-4, H + 4);
  for (let x = -4; x <= W + 8; x += 6) ctx.lineTo(x, terrainY(x + off, false));
  ctx.lineTo(W + 8, H + 4);
  ctx.closePath();
  g = ctx.createLinearGradient(0, FLOOR_Y, 0, H);
  g.addColorStop(0, look.rockBottom[0]);
  g.addColorStop(1, look.rockBottom[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = look.rim;
  ctx.stroke();

  // Decorations that scroll with the ground.
  const cell = 46;
  const first = Math.floor(off / cell) - 1;
  const last = Math.floor((off + W) / cell) + 1;
  for (let c = first; c <= last; c++) {
    const h = hash(c * 3.1);
    const x = c * cell - off + h * 20;
    const col = look.deco[Math.floor(hash(c + 0.5) * look.deco.length)];
    const fy = terrainY(x + off, false);
    const cy = terrainY(x + off, true);
    if (s.profile === "keira") {
      if (h > 0.68) {
        // Little branching coral with round tips.
        const sway = Math.sin(s.t * 1.8 + c) * 1.5;
        const tall = 16 + hash(c + 4) * 12;
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, fy + 4);
        ctx.lineTo(x + sway, fy - tall);
        ctx.moveTo(x + sway * 0.5, fy - tall * 0.45);
        ctx.quadraticCurveTo(x - 10, fy - tall * 0.5, x - 11 + sway, fy - tall * 0.85);
        ctx.moveTo(x + sway * 0.6, fy - tall * 0.6);
        ctx.quadraticCurveTo(x + 10, fy - tall * 0.65, x + 11 + sway, fy - tall * 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + sway, fy - tall, 3.6, 0, Math.PI * 2);
        ctx.arc(x - 11 + sway, fy - tall * 0.85, 3.4, 0, Math.PI * 2);
        ctx.arc(x + 11 + sway, fy - tall * 1.05, 3.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (h > 0.45) {
        ctx.fillStyle = "#fff7ed";
        ctx.beginPath();
        ctx.ellipse(x, fy + 4, 7, 4, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, fy + 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (hash(c + 7) > 0.6) {
        // Soft spots on the coral ceiling.
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath();
        ctx.ellipse(x, cy - 12, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Sand ripples.
      ctx.strokeStyle = "rgba(180, 120, 60, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 12, fy + 22 + h * 20);
      ctx.quadraticCurveTo(x, fy + 16 + h * 20, x + 12, fy + 22 + h * 20);
      ctx.stroke();
    } else {
      if (h > 0.6) {
        // Glowing crystal.
        ctx.save();
        ctx.translate(x, fy + 4);
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-2, -16 - h * 6);
        ctx.lineTo(3, -12);
        ctx.lineTo(6, 0);
        ctx.fill();
        ctx.restore();
      } else if (h > 0.35) {
        ctx.fillStyle = "rgba(20,20,15,0.6)";
        ctx.beginPath();
        ctx.ellipse(x, fy + 6, 10, 6, 0, Math.PI, 0);
        ctx.fill();
      }
      if (hash(c + 7) > 0.55) {
        ctx.fillStyle = look.rockTop[1];
        const len = 12 + hash(c + 8) * 18;
        ctx.beginPath();
        ctx.moveTo(x - 7, cy - 2);
        ctx.lineTo(x, cy + len);
        ctx.lineTo(x + 7, cy - 2);
        ctx.fill();
      }
    }
  }
}

function drawAmbient(ctx: CanvasRenderingContext2D, s: State, look: Look) {
  // Light rays (keira) and drifting motes/bubbles (both).
  if (s.profile === "keira") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const x = ((i * 190 - s.scroll * 0.1) % (s.W + 300) + s.W + 300) % (s.W + 300) - 150;
      const a = 0.05 + Math.sin(s.t * 0.8 + i) * 0.025;
      const g = ctx.createLinearGradient(x, 0, x + 120, H);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 50, 0);
      ctx.lineTo(x + 190, H);
      ctx.lineTo(x + 90, H);
      ctx.fill();
    }
    ctx.restore();
  }
  const n = 22;
  for (let i = 0; i < n; i++) {
    const speed = 0.3 + hash(i) * 0.4;
    const span = s.W + 40;
    const x = ((hash(i + 3) * span - s.scroll * speed) % span + span) % span - 20;
    const rise = (s.t * (14 + hash(i + 9) * 18) + hash(i + 4) * H) % H;
    const y = s.profile === "keira" ? H - rise : H - rise;
    const r = 1.5 + hash(i + 6) * 2.5;
    ctx.globalAlpha = 0.6;
    if (s.profile === "keira") {
      ctx.strokeStyle = look.ambient[i % 2];
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = look.ambient[i % 2];
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawZapper(ctx: CanvasRenderingContext2D, z: Zapper, s: State, look: Look) {
  const hx = (Math.cos(z.angle) * z.len) / 2;
  const hy = (Math.sin(z.angle) * z.len) / 2;
  const ax = z.x - hx;
  const ay = z.y - hy;
  const bx = z.x + hx;
  const by = z.y + hy;
  ctx.save();
  ctx.lineCap = "round";
  // Glow.
  ctx.strokeStyle = look.beamGlow;
  ctx.lineWidth = 22 + Math.sin(s.t * 20) * 3;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // Core bolt.
  const segs = 9;
  const nx = -Math.sin(z.angle);
  const ny = Math.cos(z.angle);
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? look.beam : "#ffffff";
    ctx.lineWidth = pass === 0 ? 6 : 2.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < segs; i++) {
      const k = i / segs;
      const j = (Math.random() - 0.5) * 12;
      ctx.lineTo(ax + (bx - ax) * k + nx * j, ay + (by - ay) * k + ny * j);
    }
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  // End orbs.
  for (const [ox, oy] of [
    [ax, ay],
    [bx, by],
  ]) {
    const g = ctx.createRadialGradient(ox - 4, oy - 4, 2, ox, oy, 16);
    g.addColorStop(0, look.orb[0]);
    g.addColorStop(1, look.orb[1]);
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ox, oy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (s.profile === "keira") {
      // Jellyfish frills.
      ctx.strokeStyle = look.orb[1];
      ctx.lineWidth = 2;
      for (let t = -1; t <= 1; t++) {
        ctx.beginPath();
        ctx.moveTo(ox + t * 6, oy + 13);
        ctx.quadraticCurveTo(ox + t * 6 + Math.sin(s.t * 6 + t) * 4, oy + 20, ox + t * 7, oy + 26);
        ctx.stroke();
      }
      ctx.fillStyle = "#3b1d4a";
      ctx.beginPath();
      ctx.arc(ox - 4, oy - 1, 1.8, 0, Math.PI * 2);
      ctx.arc(ox + 4, oy - 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMissile(ctx: CanvasRenderingContext2D, m: Missile, s: State, font: string) {
  if (!m.live) {
    // Warning marker on the right edge.
    const blink = m.warn < 0.7 ? Math.sin(s.t * 30) > 0 : Math.sin(s.t * 12) > -0.3;
    const x = s.W - 30;
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = "rgba(255, 80, 80, 0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 20, m.y);
    ctx.lineTo(Math.max(heroX(s.W) + 60, x - 180), m.y);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(x, m.y);
    const k = 1 + (blink ? 0.12 : 0);
    ctx.scale(k, k);
    ctx.fillStyle = blink ? "#ef4444" : "#fb923c";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 26px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 1);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(m.x, m.y);
  if (s.profile === "keira") {
    // Grumpy pufferfish.
    ctx.rotate(Math.sin(m.spin) * 0.15);
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.15) * 18, Math.sin(a - 0.15) * 18);
      ctx.lineTo(Math.cos(a) * 27, Math.sin(a) * 27);
      ctx.lineTo(Math.cos(a + 0.15) * 18, Math.sin(a + 0.15) * 18);
      ctx.fill();
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(-6, -6, 3, 0, 0, MISSILE_R);
    g.addColorStop(0, "#fef3c7");
    g.addColorStop(1, "#f59e0b");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, MISSILE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fb7185";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(30, -9);
    ctx.lineTo(30, 9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-8, -5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.arc(-10, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#92400e";
    ctx.beginPath();
    ctx.arc(-10, 8, 4, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else {
    // Meteor with a fiery tail.
    const tail = ctx.createLinearGradient(0, 0, 70, 0);
    tail.addColorStop(0, "rgba(251,146,60,0.9)");
    tail.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(0, -MISSILE_R);
    ctx.quadraticCurveTo(50, -10 + Math.sin(s.t * 30) * 3, 75, 0);
    ctx.quadraticCurveTo(50, 10, 0, MISSILE_R);
    ctx.fill();
    ctx.rotate(m.spin);
    const g = ctx.createRadialGradient(-6, -6, 3, 0, 0, MISSILE_R);
    g.addColorStop(0, "#a8a29e");
    g.addColorStop(1, "#57534e");
    ctx.fillStyle = g;
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = MISSILE_R * (0.85 + hash(i) * 0.2);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(41,37,36,0.6)";
    ctx.beginPath();
    ctx.arc(5, -4, 4, 0, Math.PI * 2);
    ctx.arc(-6, 6, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.closePath();
}

function drawPickup(ctx: CanvasRenderingContext2D, p: Pickup, s: State, look: Look) {
  const y = p.y + Math.sin(p.t * 3) * 10;
  ctx.save();
  ctx.translate(p.x, y);
  const pulse = 1 + Math.sin(s.t * 6) * 0.06;
  ctx.scale(pulse, pulse);
  const g = ctx.createRadialGradient(-8, -8, 4, 0, 0, 26);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.6, "rgba(186,230,253,0.45)");
  g.addColorStop(1, "rgba(125,211,252,0.7)");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (p.kind === "heart") {
    drawHeart(ctx, 0, 2, 11);
    ctx.fillStyle = look.heart;
    ctx.fill();
  } else {
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(11, -7);
    ctx.lineTo(9, 6);
    ctx.lineTo(0, 13);
    ctx.lineTo(-9, 6);
    ctx.lineTo(-11, -7);
    ctx.closePath();
    ctx.fillStyle = "#7dd3fc";
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function outlined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
  fill: string,
  stroke: string,
  align: CanvasTextAlign = "center",
) {
  ctx.font = `700 ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.18);
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
  const hx = heroX(W);

  ctx.save();
  if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);

  if (art) drawBg(ctx, art.bg, W, s.scroll);
  else {
    ctx.fillStyle = s.profile === "keira" ? "#7dd3fc" : "#1e293b";
    ctx.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = look.tint;
  ctx.fillRect(0, 0, W, H);
  drawAmbient(ctx, s, look);
  drawMid(ctx, s, look);
  drawTerrain(ctx, s, look);

  // Coins.
  for (const c of s.coins) {
    if (c.taken || c.x < -30 || c.x > W + 30) continue;
    const sx = Math.abs(Math.cos(c.spin * 0.6)) * 0.75 + 0.25;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(sx, 1);
    if (art) ctx.drawImage(art.coin, -COIN_R - 3, -COIN_R - 3, (COIN_R + 3) * 2, (COIN_R + 3) * 2);
    else {
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(0, 0, COIN_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const p of s.pickups) if (!p.taken) drawPickup(ctx, p, s, look);
  for (const z of s.zappers) drawZapper(ctx, z, s, look);
  for (const r of s.rocks) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.globalAlpha = r.hit ? 0.5 : 1;
    const size = ROCK_R * 2.6;
    if (art) ctx.drawImage(art.hazard, -size / 2, -size / 2, size, size);
    else {
      ctx.fillStyle = "#78716c";
      ctx.beginPath();
      ctx.arc(0, 0, ROCK_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Particles.
  for (const p of s.particles) {
    const a = Math.max(0, p.life / p.max);
    if (p.kind === "flame") {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.globalAlpha = p.kind === "smoke" ? a * 0.55 : a;
    if (p.kind === "bubble") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (const m of s.missiles) if (m.live) drawMissile(ctx, m, s, font);

  // Hero.
  const blink = s.invuln > 0 && Math.floor(s.invuln * 10) % 2 === 0;
  ctx.save();
  ctx.translate(hx, s.y);
  // Ground shadow.
  const hk = Math.max(0.2, 1 - (FLOOR_Y - s.y) / 420);
  ctx.fillStyle = `rgba(0,0,0,${0.22 * hk})`;
  ctx.beginPath();
  ctx.ellipse(0, FLOOR_Y - s.y + 4, 26 * hk, 6 * hk, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = s.onFloor && s.phase === "play" ? Math.abs(Math.sin(s.t * 14)) * -3 : 0;
  ctx.translate(0, bob);
  ctx.rotate(s.tilt);
  if (s.holding && s.phase === "play" && s.profile === "luke") {
    // Flame cone.
    const fl = 16 + Math.random() * 10;
    ctx.save();
    ctx.translate(-21, 17);
    ctx.rotate(0.25);
    const g = ctx.createLinearGradient(0, 0, 0, fl + 8);
    g.addColorStop(0, "#fff7ae");
    g.addColorStop(0.4, "#fb923c");
    g.addColorStop(1, "rgba(239,68,68,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(0, fl + 14, 6, 0);
    ctx.fill();
    ctx.restore();
  }
  if (blink) ctx.globalAlpha = 0.4;
  const size = 96;
  if (art) ctx.drawImage(art.hero, -size / 2, -size / 2, size, size);
  else {
    ctx.fillStyle = "#f472b6";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (s.shield) {
    const g = ctx.createRadialGradient(-10, -12, 6, 0, 0, 50);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(0.75, "rgba(186,230,253,0.18)");
    g.addColorStop(1, "rgba(125,211,252,0.55)");
    ctx.fillStyle = g;
    ctx.strokeStyle = `rgba(255,255,255,${0.7 + Math.sin(s.t * 5) * 0.2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  for (const m of s.missiles) if (!m.live) drawMissile(ctx, m, s, font);

  for (const t of s.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    outlined(ctx, t.text, t.x, t.y, t.big ? 40 : 20, font, t.big ? "#fde047" : "#ffffff", ink);
  }
  ctx.globalAlpha = 1;

  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  // HUD.
  if (s.phase !== "ready") {
    for (let i = 0; i < START_HEARTS; i++) {
      const x = 24 + i * 30;
      drawHeart(ctx, x, 26, 11);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = i < s.hearts ? look.heart : "rgba(100,100,120,0.45)";
      ctx.fill();
    }
    if (s.shield) {
      ctx.fillStyle = "rgba(186,230,253,0.9)";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(24 + START_HEARTS * 30, 26, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Distance pill with progress to the next milestone.
    const m = meters(s);
    const label = `${m} m`;
    ctx.font = `700 20px ${font}`;
    const tw = Math.max(64, ctx.measureText(label).width + 26);
    const px = W - tw - 12;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.beginPath();
    ctx.roundRect(px, 10, tw, 34, 17);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, px + tw / 2, 28);
    const prog = ((s.scroll / UNITS_PER_M) % MILESTONE_M) / MILESTONE_M;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.roundRect(px + 8, 48, tw - 16, 6, 3);
    ctx.fill();
    ctx.fillStyle = s.profile === "keira" ? "#f472b6" : "#facc15";
    ctx.beginPath();
    ctx.roundRect(px + 8, 48, Math.max(6, (tw - 16) * prog), 6, 3);
    ctx.fill();
  }

  if (s.banner) {
    const b = s.banner;
    const inT = Math.min(1, (1.8 - b.life) * 6);
    const k = 0.6 + 0.4 * inT;
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life * 3);
    ctx.translate(W / 2, H * 0.26);
    ctx.scale(k, k);
    outlined(ctx, b.text, 0, 0, 46, font, "#fde047", ink);
    ctx.restore();
  }
}
