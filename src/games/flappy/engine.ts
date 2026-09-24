/**
 * Flappy game logic, kept free of React and canvas so it is easy to reason
 * about. Everything is in game units (the canvas is H units tall, W wide) and
 * seconds. `step` advances the world and pushes sound/score events that the
 * component turns into sfx and shell updates.
 */

export const H = 640;
export const GROUND_H = 92;
export const PLAY_BOTTOM = H - GROUND_H;
export const TOWER_W = 74;
export const CAP_H = 28;
export const HIT_R = 14;

const GRAVITY = 900;
const FLAP_V = -320;
const MAX_FALL = 400;
const CEILING = 22;
const INVULN_S = 1.8;
export const START_HEARTS = 3;

export type Phase = "ready" | "play" | "dying" | "over";

export type Tower = {
  x: number;
  gapY: number;
  gap: number;
  scored: boolean;
  seed: number;
  /** 0→1 pop-in when a tower has to appear inside a wide view. */
  grow: number;
};

export type Bonus = { x: number; y: number; taken: boolean; seed: number };

export type ParticleKind = "dot" | "sparkle" | "puff" | "ring";

export type Particle = {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
};

export type FloatText = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
};

export type GameEvent =
  | "flap"
  | "star"
  | "bonus"
  | "hit"
  | "bounce"
  | "level"
  | "die"
  | "over";

export type State = {
  W: number;
  phase: Phase;
  t: number;
  /** Total distance the world has scrolled (drives parallax). */
  scroll: number;
  speed: number;
  y: number;
  vy: number;
  angle: number;
  squash: number;
  towers: Tower[];
  bonuses: Bonus[];
  particles: Particle[];
  texts: FloatText[];
  score: number;
  hearts: number;
  invuln: number;
  shake: number;
  flash: number;
  scorePop: number;
  deadT: number;
  overShown: boolean;
  banner: { text: string; life: number } | null;
  events: GameEvent[];
  trailT: number;
  profile: "keira" | "luke";
};

export function flyerX(W: number) {
  return Math.round(Math.min(150, Math.max(92, W * 0.27)));
}

export function createState(W: number, profile: "keira" | "luke"): State {
  return {
    W,
    phase: "ready",
    t: 0,
    scroll: 0,
    speed: 60,
    y: PLAY_BOTTOM * 0.46,
    vy: 0,
    angle: 0,
    squash: 0,
    towers: [],
    bonuses: [],
    particles: [],
    texts: [],
    score: 0,
    hearts: START_HEARTS,
    invuln: 0,
    shake: 0,
    flash: 0,
    scorePop: 0,
    deadT: 0,
    overShown: false,
    banner: null,
    events: [],
    trailT: 0,
    profile,
  };
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

const SPARKLE_COLORS = ["#f9a8d4", "#c4b5fd", "#a5f3fc", "#fde68a", "#ffffff"];
const STAR_COLORS = ["#fde047", "#facc15", "#fff7ae", "#ffffff", "#fb923c"];

export function burst(
  s: State,
  x: number,
  y: number,
  n: number,
  opts: {
    kind?: ParticleKind;
    colors?: string[];
    speed?: [number, number];
    size?: [number, number];
    life?: [number, number];
    g?: number;
    dir?: number;
    spread?: number;
  } = {},
) {
  const colors = opts.colors ?? STAR_COLORS;
  const [s0, s1] = opts.speed ?? [80, 220];
  const [z0, z1] = opts.size ?? [3, 7];
  const [l0, l1] = opts.life ?? [0.4, 0.8];
  for (let i = 0; i < n; i++) {
    const a =
      opts.dir !== undefined
        ? opts.dir + rand(-(opts.spread ?? 0.6), opts.spread ?? 0.6)
        : rand(0, Math.PI * 2);
    const sp = rand(s0, s1);
    const life = rand(l0, l1);
    s.particles.push({
      kind: opts.kind ?? "sparkle",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      g: opts.g ?? 260,
      life,
      max: life,
      size: rand(z0, z1),
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: rand(0, Math.PI),
      vr: rand(-6, 6),
    });
  }
}

/** Difficulty eases in over the first ~30 stars. */
function difficulty(score: number) {
  return Math.min(1, score / 30);
}

function spawnTower(s: State, x: number) {
  const d = difficulty(s.score + s.towers.length);
  const gap = 236 - 56 * d;
  const margin = 64;
  const minY = margin + gap / 2;
  const maxY = PLAY_BOTTOM - margin - gap / 2;
  const prev = s.towers[s.towers.length - 1];
  let gapY: number;
  if (!prev) {
    gapY = PLAY_BOTTOM * 0.5 + rand(-30, 30);
  } else {
    // Keep consecutive gaps within reach so no pattern is unfair.
    const reach = 110 + 60 * d;
    gapY = prev.gapY + rand(-reach, reach);
  }
  gapY = Math.max(minY, Math.min(maxY, gapY));
  s.towers.push({
    x,
    gapY,
    gap,
    scored: false,
    seed: Math.random() * 1000,
    grow: x < s.W ? 0 : 1,
  });

  // Sometimes put a bonus sparkle half way to the next tower.
  if (prev && Math.random() < 0.35) {
    const bx = x - spacing(s) / 2 + TOWER_W / 2;
    const by = (prev.gapY + gapY) / 2 + rand(-30, 30);
    s.bonuses.push({ x: bx, y: by, taken: false, seed: Math.random() * 10 });
  }
}

function spacing(s: State) {
  return 290 - 50 * difficulty(s.score);
}

export function flap(s: State) {
  if (s.phase === "ready") {
    s.phase = "play";
    s.speed = 130;
  }
  if (s.phase !== "play") return;
  s.vy = FLAP_V;
  s.squash = 1;
  s.events.push("flap");
  const fx = flyerX(s.W);
  if (s.profile === "keira") {
    burst(s, fx - 18, s.y + 4, 6, {
      colors: SPARKLE_COLORS,
      dir: Math.PI * 0.75,
      spread: 0.7,
      speed: [60, 150],
      size: [3, 6],
      g: 120,
    });
  } else {
    burst(s, fx - 34, s.y + 6, 5, {
      kind: "puff",
      colors: ["#ffffff", "#e2e8f0", "#fde68a"],
      dir: Math.PI,
      spread: 0.5,
      speed: [60, 140],
      size: [5, 10],
      life: [0.35, 0.6],
      g: -40,
    });
  }
}

function circleRect(
  cx: number,
  cy: number,
  r: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const nx = Math.max(x, Math.min(cx, x + w));
  const ny = Math.max(y, Math.min(cy, y + h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

const CHEERS = ["Super!", "Amazing!", "Wow!", "Fantastic!", "Superstar!"];

function addScore(s: State, x: number, y: number, n: number) {
  s.score += n;
  s.scorePop = 1;
  s.texts.push({ x, y: y - 20, text: `+${n}`, life: 1, color: "#fff" });
  if (s.score % 10 === 0) {
    s.banner = {
      text: CHEERS[Math.min(CHEERS.length - 1, s.score / 10 - 1)],
      life: 1.6,
    };
    s.events.push("level");
  }
}

export function step(s: State, dt: number) {
  s.t += dt;
  const fx = flyerX(s.W);

  // Timers and particles always tick (also on the game-over screen).
  s.squash = Math.max(0, s.squash - dt * 4.5);
  s.shake = Math.max(0, s.shake - dt * 30);
  s.flash = Math.max(0, s.flash - dt * 3);
  s.scorePop = Math.max(0, s.scorePop - dt * 4);
  if (s.banner) {
    s.banner.life -= dt;
    if (s.banner.life <= 0) s.banner = null;
  }
  for (const p of s.particles) {
    p.life -= dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.kind === "puff") {
      p.vx *= 1 - dt * 2;
      p.size += dt * 16;
    }
  }
  s.particles = s.particles.filter((p) => p.life > 0);
  for (const t of s.texts) {
    t.life -= dt * 1.1;
    t.y -= dt * 50;
  }
  s.texts = s.texts.filter((t) => t.life > 0);

  if (s.phase === "ready") {
    s.scroll += 60 * dt;
    s.y = PLAY_BOTTOM * 0.46 + Math.sin(s.t * 3) * 10;
    s.angle = Math.sin(s.t * 3 + 1) * 0.08;
    return;
  }

  if (s.phase === "over") {
    s.deadT += dt;
    return;
  }

  // World scroll.
  const d = difficulty(s.score);
  if (s.phase === "play") {
    s.speed += ((130 + 55 * d) - s.speed) * Math.min(1, dt * 2);
  } else {
    s.speed *= 1 - Math.min(1, dt * 3);
  }
  const dx = s.speed * dt;
  s.scroll += dx;
  for (const t of s.towers) {
    t.x -= dx;
    t.grow = Math.min(1, t.grow + dt * 2.2);
  }
  for (const b of s.bonuses) b.x -= dx;
  s.towers = s.towers.filter((t) => t.x > -TOWER_W - 40);
  s.bonuses = s.bonuses.filter((b) => b.x > -40 && !b.taken);

  if (s.phase === "play") {
    const last = s.towers[s.towers.length - 1];
    if (!last) spawnTower(s, Math.min(s.W + 170, fx + 440));
    else if (last.x < s.W + 60 - spacing(s) + TOWER_W)
      spawnTower(s, last.x + spacing(s));
  }

  // Flyer physics.
  s.vy = Math.min(MAX_FALL, s.vy + GRAVITY * dt);
  s.y += s.vy * dt;
  const targetAngle =
    s.phase === "dying"
      ? s.angle + dt * 9
      : Math.max(-0.45, Math.min(1.05, s.vy / 420));
  s.angle =
    s.phase === "dying"
      ? targetAngle
      : s.angle + (targetAngle - s.angle) * Math.min(1, dt * (s.vy < 0 ? 14 : 5));

  if (s.y < CEILING) {
    s.y = CEILING;
    s.vy = Math.max(0, s.vy);
  }

  const groundY = PLAY_BOTTOM - HIT_R - 4;
  if (s.y > groundY) {
    s.y = groundY;
    if (s.phase === "dying") {
      s.phase = "over";
      s.deadT = 0;
      s.shake = 8;
      burst(s, fx, groundY + 10, 14, {
        kind: "puff",
        colors: ["#ffffff", "#f1f5f9", "#e2e8f0"],
        dir: -Math.PI / 2,
        spread: 1.3,
        speed: [40, 140],
        size: [6, 12],
        g: -30,
      });
      s.events.push("over");
      return;
    }
    // Soft ground: bounce back up instead of an instant game over.
    s.vy = -300;
    s.squash = 1;
    s.events.push("bounce");
    burst(s, fx, groundY + 12, 6, {
      kind: "puff",
      colors: ["#ffffff", "#f8fafc"],
      dir: -Math.PI / 2,
      spread: 1.2,
      speed: [30, 90],
      size: [4, 8],
      g: -20,
    });
  }

  if (s.phase !== "play") return;

  s.invuln = Math.max(0, s.invuln - dt);

  // Trail sparkles.
  s.trailT -= dt;
  if (s.trailT <= 0) {
    s.trailT = 0.05;
    if (s.profile === "keira") {
      burst(s, fx - 22, s.y + 6, 1, {
        colors: SPARKLE_COLORS,
        dir: Math.PI,
        spread: 0.4,
        speed: [30, 60],
        size: [2, 4],
        life: [0.4, 0.7],
        g: 40,
      });
    } else {
      burst(s, fx - 38, s.y + 8, 1, {
        kind: "puff",
        colors: ["#ffffff", "#e2e8f0"],
        dir: Math.PI,
        spread: 0.2,
        speed: [40, 70],
        size: [3, 5],
        life: [0.3, 0.5],
        g: -10,
      });
    }
  }

  for (const t of s.towers) {
    const top = t.gapY - t.gap / 2;
    const bot = t.gapY + t.gap / 2;
    if (!t.scored && t.x + TOWER_W / 2 < fx) {
      t.scored = true;
      addScore(s, fx + 10, s.y, 1);
      s.events.push("star");
      burst(s, t.x + TOWER_W / 2, t.gapY, 14, { speed: [90, 240] });
      s.particles.push({
        kind: "ring",
        x: t.x + TOWER_W / 2,
        y: t.gapY,
        vx: 0,
        vy: 0,
        g: 0,
        life: 0.45,
        max: 0.45,
        size: 16,
        color: "#fff7ae",
        rot: 0,
        vr: 0,
      });
    }
    if (s.invuln > 0) continue;
    const r = HIT_R;
    if (
      circleRect(fx, s.y, r, t.x + 3, -50, TOWER_W - 6, top + 50) ||
      circleRect(fx, s.y, r, t.x + 3, bot, TOWER_W - 6, PLAY_BOTTOM - bot + 40)
    ) {
      hitTower(s, fx);
      break;
    }
  }

  for (const b of s.bonuses) {
    if (b.taken) continue;
    const ddx = b.x - fx;
    const ddy = b.y - s.y;
    if (ddx * ddx + ddy * ddy < 34 * 34) {
      b.taken = true;
      addScore(s, b.x, b.y, 1);
      s.events.push("bonus");
      burst(s, b.x, b.y, 10, {
        colors: s.profile === "keira" ? SPARKLE_COLORS : STAR_COLORS,
        speed: [70, 180],
      });
    }
  }
}

function hitTower(s: State, fx: number) {
  s.hearts -= 1;
  s.shake = 12;
  s.flash = 1;
  burst(s, fx, s.y, 16, {
    colors: ["#ffffff", "#fda4af", "#fde68a"],
    speed: [100, 260],
    size: [3, 7],
  });
  if (s.hearts > 0) {
    s.invuln = INVULN_S;
    s.vy = Math.min(s.vy, -150);
    s.events.push("hit");
  } else {
    s.phase = "dying";
    s.vy = -260;
    s.events.push("die");
  }
}

export type Medal = {
  min: number;
  emoji: string;
  name: string;
};

export const MEDALS: Medal[] = [
  { min: 35, emoji: "🏆", name: "Super trophy" },
  { min: 20, emoji: "🥇", name: "Gold medal" },
  { min: 10, emoji: "🥈", name: "Silver medal" },
  { min: 5, emoji: "🥉", name: "Bronze medal" },
];

export function medalFor(score: number): Medal | null {
  return MEDALS.find((m) => score >= m.min) ?? null;
}

export function nextMedal(score: number): Medal | null {
  const up = [...MEDALS].reverse().find((m) => score < m.min);
  return up ?? null;
}
