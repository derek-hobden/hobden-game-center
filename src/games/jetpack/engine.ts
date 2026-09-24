/**
 * Jetpack side-scroller logic (no React, no canvas). Units are game units
 * (the view is H tall and W wide) and seconds. `step` pushes events that the
 * component turns into sounds and score updates.
 */

export const H = 560;
export const CEIL_Y = 58;
export const FLOOR_Y = H - 62;
export const HERO_R = 17;
export const COIN_R = 15;
export const ROCK_R = 25;
export const MISSILE_R = 20;
export const START_HEARTS = 3;
/** Game units per metre shown on the distance meter. */
export const UNITS_PER_M = 20;
export const MILESTONE_M = 100;

const GRAVITY = 1000;
const THRUST = 2150;
const MAX_UP = -360;
const MAX_DOWN = 460;
const INVULN_S = 2;

export type Phase = "ready" | "play" | "dying" | "over";

export type Coin = { x: number; y: number; taken: boolean; spin: number; magnet: boolean };
export type Rock = { x: number; y: number; baseY: number; amp: number; phase: number; rot: number; hit: boolean };
export type Zapper = { x: number; y: number; len: number; angle: number; hit: boolean };
export type Missile = {
  y: number;
  /** Seconds of warning left before it launches (it tracks the hero at first). */
  warn: number;
  x: number;
  live: boolean;
  hit: boolean;
  spin: number;
};
export type PickupKind = "shield" | "heart";
export type Pickup = { x: number; y: number; kind: PickupKind; taken: boolean; t: number };

export type ParticleKind = "dot" | "spark" | "bubble" | "smoke" | "flame" | "ring";
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
};
export type FloatText = { x: number; y: number; text: string; life: number; big: boolean };

export type GameEvent =
  | "coin"
  | "hit"
  | "shieldPop"
  | "shield"
  | "heart"
  | "milestone"
  | "warn"
  | "launch"
  | "die"
  | "land"
  | "over";

export type State = {
  W: number;
  profile: "keira" | "luke";
  phase: Phase;
  t: number;
  scroll: number;
  speed: number;
  y: number;
  vy: number;
  tilt: number;
  holding: boolean;
  onFloor: boolean;
  coins: Coin[];
  rocks: Rock[];
  zappers: Zapper[];
  missiles: Missile[];
  pickups: Pickup[];
  particles: Particle[];
  texts: FloatText[];
  /** Distance (units) left until the next chunk spawns. */
  nextChunk: number;
  lastPickupM: number;
  score: number;
  coinCount: number;
  combo: number;
  comboT: number;
  hearts: number;
  shield: boolean;
  invuln: number;
  shake: number;
  flash: number;
  nextMilestone: number;
  banner: { text: string; life: number } | null;
  deadT: number;
  overShown: boolean;
  emitT: number;
  events: GameEvent[];
};

export function heroX(W: number) {
  return Math.round(Math.min(160, Math.max(78, W * 0.22)));
}

export function meters(s: State) {
  return Math.floor(s.scroll / UNITS_PER_M);
}

export function createState(W: number, profile: "keira" | "luke"): State {
  return {
    W,
    profile,
    phase: "ready",
    t: 0,
    scroll: 0,
    speed: 0,
    y: (CEIL_Y + FLOOR_Y) / 2,
    vy: 0,
    tilt: 0,
    holding: false,
    onFloor: false,
    coins: [],
    rocks: [],
    zappers: [],
    missiles: [],
    pickups: [],
    particles: [],
    texts: [],
    nextChunk: 200,
    lastPickupM: 0,
    score: 0,
    coinCount: 0,
    combo: 0,
    comboT: 0,
    hearts: START_HEARTS,
    shield: false,
    invuln: 0,
    shake: 0,
    flash: 0,
    nextMilestone: MILESTONE_M,
    banner: null,
    deadT: 0,
    overShown: false,
    emitT: 0,
    events: [],
  };
}

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

export function difficulty(s: State) {
  return Math.min(1, meters(s) / 1200);
}

/** World speed in units/s. Narrow (portrait) views scroll a bit slower so
 * there is always enough time to see what is coming. */
function targetSpeed(s: State) {
  const viewK = Math.min(1, Math.max(0.62, (s.W - heroX(s.W)) / 520));
  return (175 + 105 * difficulty(s)) * viewK;
}

export function spark(
  s: State,
  x: number,
  y: number,
  n: number,
  kind: ParticleKind,
  colors: string[],
  o: {
    speed?: [number, number];
    size?: [number, number];
    life?: [number, number];
    g?: number;
    dir?: number;
    spread?: number;
    vx?: number;
  } = {},
) {
  const [s0, s1] = o.speed ?? [60, 200];
  const [z0, z1] = o.size ?? [2, 5];
  const [l0, l1] = o.life ?? [0.35, 0.7];
  for (let i = 0; i < n; i++) {
    const a = o.dir !== undefined ? o.dir + rand(-(o.spread ?? 0.5), o.spread ?? 0.5) : rand(0, Math.PI * 2);
    const sp = rand(s0, s1);
    const life = rand(l0, l1);
    s.particles.push({
      kind,
      x,
      y,
      vx: Math.cos(a) * sp + (o.vx ?? 0),
      vy: Math.sin(a) * sp,
      g: o.g ?? 0,
      life,
      max: life,
      size: rand(z0, z1),
      color: pick(colors),
    });
  }
}

// ---------------------------------------------------------------- spawning

const TOP = CEIL_Y + 24;
const BOT = FLOOR_Y - 24;

function addCoin(s: State, x: number, y: number) {
  s.coins.push({ x, y: Math.max(TOP, Math.min(BOT, y)), taken: false, spin: rand(0, 6), magnet: false });
}

/** Coin patterns. Returns the width they occupy. */
function coinPattern(s: State, x0: number, yHint?: number): number {
  const kind = pick(["line", "arc", "wave", "block", "diag"] as const);
  const gap = 34;
  const midY = yHint ?? rand(TOP + 60, BOT - 60);
  switch (kind) {
    case "line": {
      const n = Math.floor(rand(6, 10));
      for (let i = 0; i < n; i++) addCoin(s, x0 + i * gap, midY);
      return n * gap;
    }
    case "arc": {
      const n = 9;
      const up = midY > (TOP + BOT) / 2 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        addCoin(s, x0 + i * gap, midY + up * Math.sin(k * Math.PI) * 90);
      }
      return n * gap;
    }
    case "wave": {
      const n = 12;
      for (let i = 0; i < n; i++) addCoin(s, x0 + i * gap, midY + Math.sin(i * 0.7) * 60);
      return n * gap;
    }
    case "block": {
      const cols = 5;
      const rows = 3;
      for (let c = 0; c < cols; c++)
        for (let r = 0; r < rows; r++) addCoin(s, x0 + c * gap, midY + (r - 1) * gap);
      return cols * gap;
    }
    case "diag": {
      const n = 8;
      const dir = midY > (TOP + BOT) / 2 ? -1 : 1;
      for (let i = 0; i < n; i++) addCoin(s, x0 + i * gap, midY + dir * i * 22);
      return n * gap;
    }
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function spawnChunk(s: State) {
  const d = difficulty(s);
  const m = meters(s);
  const x0 = s.W + 60;
  let width = 0;
  const r = Math.random();

  // Occasional helpful pickup.
  if (m - s.lastPickupM > 260 && Math.random() < 0.5) {
    s.lastPickupM = m;
    const hurtNow = s.hearts < START_HEARTS;
    const kind: PickupKind | null =
      hurtNow && (s.shield || Math.random() < 0.6) ? "heart" : s.shield ? null : "shield";
    if (kind) {
      s.pickups.push({ x: x0, y: rand(TOP + 50, BOT - 50), kind, taken: false, t: 0 });
      s.nextChunk = 200;
      return;
    }
  }

  if (m < 40) {
    width = coinPattern(s, x0);
  } else if (r < 0.34 - 0.1 * d) {
    width = coinPattern(s, x0);
  } else if (r < 0.6) {
    // Floating rocks with coins leading through the safe side.
    const count = d > 0.4 && Math.random() < 0.5 ? 2 : 1;
    const y = rand(TOP + 40, BOT - 40);
    const amp = m > 150 ? rand(0, 40) * (0.4 + d) : 0;
    s.rocks.push({ x: x0 + 40, y, baseY: y, amp, phase: rand(0, 6), rot: 0, hit: false });
    if (count === 2) {
      const y2 = y < (TOP + BOT) / 2 ? y + rand(210, 260) : y - rand(210, 260);
      s.rocks.push({ x: x0 + 200, y: y2, baseY: y2, amp: 0, phase: 0, rot: 0, hit: false });
    }
    const safeY = y < (TOP + BOT) / 2 ? Math.min(BOT - 20, y + 130) : Math.max(TOP + 20, y - 130);
    for (let i = 0; i < 5; i++) addCoin(s, x0 + i * 34, safeY);
    width = count === 2 ? 260 : 180;
  } else if (r < 0.88 || m < 120) {
    // Zapper: a glowing beam between two orbs.
    const len = rand(110, 150 + 50 * d);
    const angle = pick([Math.PI / 2, Math.PI / 2, 0, Math.PI / 4, -Math.PI / 4]);
    const half = (Math.abs(Math.sin(angle)) * len) / 2 + 16;
    const y = rand(TOP + half, BOT - half);
    s.zappers.push({ x: x0 + 40, y, len, angle, hit: false });
    // Coins hint at the way round.
    const room = y - TOP > BOT - y ? "up" : "down";
    const cy = room === "up" ? (TOP + (y - half)) / 2 : (BOT + (y + half)) / 2;
    for (let i = 0; i < 4; i++) addCoin(s, x0 + 5 + i * 34, cy);
    width = 170;
  } else {
    // Incoming! A warned, fast mover on the hero's line.
    s.missiles.push({ y: s.y, warn: 1.7 - 0.3 * d, x: s.W + 60, live: false, hit: false, spin: 0 });
    s.events.push("warn");
    width = 120;
  }

  const spacing = 250 - 70 * d + rand(0, 90);
  s.nextChunk = width + spacing;
}

// ---------------------------------------------------------------- update

function distToSegment(px: number, py: number, z: Zapper) {
  const hx = (Math.cos(z.angle) * z.len) / 2;
  const hy = (Math.sin(z.angle) * z.len) / 2;
  const ax = z.x - hx;
  const ay = z.y - hy;
  const bx = z.x + hx;
  const by = z.y + hy;
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

export function begin(s: State) {
  if (s.phase !== "ready") return;
  s.phase = "play";
  s.speed = targetSpeed(s) * 0.6;
}

function hurt(s: State, hx: number) {
  if (s.invuln > 0 || s.phase !== "play") return;
  s.shake = 12;
  s.flash = 1;
  if (s.shield) {
    s.shield = false;
    s.invuln = 1.2;
    s.events.push("shieldPop");
    spark(s, hx, s.y, 18, "bubble", ["#bae6fd", "#ffffff", "#a5f3fc"], { speed: [80, 220], size: [3, 7] });
    return;
  }
  s.hearts -= 1;
  spark(s, hx, s.y, 18, "spark", ["#ffffff", "#fda4af", "#fde68a"], { speed: [100, 260], size: [3, 6], g: 300 });
  if (s.hearts > 0) {
    s.invuln = INVULN_S;
    s.vy = 0;
    s.events.push("hit");
  } else {
    s.phase = "dying";
    s.holding = false;
    s.vy = -220;
    s.events.push("die");
  }
}

export function step(s: State, dt: number) {
  s.t += dt;
  const hx = heroX(s.W);
  const d = difficulty(s);

  s.shake = Math.max(0, s.shake - dt * 30);
  s.flash = Math.max(0, s.flash - dt * 3);
  s.comboT = Math.max(0, s.comboT - dt);
  if (s.comboT === 0) s.combo = 0;
  if (s.banner) {
    s.banner.life -= dt;
    if (s.banner.life <= 0) s.banner = null;
  }
  for (const p of s.particles) {
    p.life -= dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === "smoke") p.size += dt * 18;
  }
  s.particles = s.particles.filter((p) => p.life > 0);
  for (const t of s.texts) {
    t.life -= dt * 1.2;
    t.y -= dt * 40;
  }
  s.texts = s.texts.filter((t) => t.life > 0);

  if (s.phase === "ready") {
    s.scroll += 50 * dt;
    s.y = (CEIL_Y + FLOOR_Y) / 2 + Math.sin(s.t * 2.5) * 12;
    s.tilt = Math.sin(s.t * 2.5 + 1) * 0.06;
    emitThrust(s, hx, dt, 0.4);
    return;
  }
  if (s.phase === "over") {
    s.deadT += dt;
    return;
  }

  // Scroll the world.
  if (s.phase === "play") s.speed += (targetSpeed(s) - s.speed) * Math.min(1, dt * 1.5);
  else s.speed *= 1 - Math.min(1, dt * 1.6);
  const dx = s.speed * dt;
  s.scroll += dx;
  for (const c of s.coins) c.x -= dx;
  for (const r of s.rocks) r.x -= dx;
  for (const z of s.zappers) z.x -= dx;
  for (const p of s.pickups) p.x -= dx;

  if (s.phase === "play") {
    s.nextChunk -= dx;
    if (s.nextChunk <= 0) spawnChunk(s);
  }

  // Hero physics.
  const thrusting = s.holding && s.phase === "play";
  s.vy += (GRAVITY - (thrusting ? THRUST : 0)) * dt;
  s.vy = Math.max(MAX_UP, Math.min(MAX_DOWN, s.vy));
  s.y += s.vy * dt;
  if (s.y < CEIL_Y + HERO_R) {
    s.y = CEIL_Y + HERO_R;
    s.vy = Math.max(0, s.vy) * 0.3;
  }
  const floor = FLOOR_Y - HERO_R - 8;
  const wasFloor = s.onFloor;
  s.onFloor = false;
  if (s.y >= floor) {
    s.y = floor;
    if (s.vy > 200 && !wasFloor) {
      s.events.push("land");
      spark(s, hx, FLOOR_Y - 6, 8, "smoke", ["#ffffff", "#e2e8f0"], { dir: -Math.PI / 2, spread: 1.3, speed: [30, 90], size: [4, 8], g: -20 });
    }
    s.vy = 0;
    s.onFloor = true;
    if (s.phase === "dying") {
      s.phase = "over";
      s.deadT = 0;
      s.shake = 8;
      s.events.push("over");
    }
  }
  const tiltTarget = s.phase === "dying" ? s.tilt + dt * 6 : s.onFloor ? 0 : Math.max(-0.28, Math.min(0.3, s.vy / 1300));
  s.tilt = s.phase === "dying" ? tiltTarget : s.tilt + (tiltTarget - s.tilt) * Math.min(1, dt * 8);

  if (thrusting) emitThrust(s, hx, dt, 1);

  if (s.phase !== "play") return;
  s.invuln = Math.max(0, s.invuln - dt);

  // Coins (with a gentle magnet so near-misses still count).
  for (const c of s.coins) {
    if (c.taken) continue;
    c.spin += dt * 5;
    const ddx = hx - c.x;
    const ddy = s.y - c.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 70) c.magnet = true;
    if (c.magnet) {
      const pull = Math.min(1, dt * 10);
      c.x += ddx * pull;
      c.y += ddy * pull;
    }
    if (dist < HERO_R + COIN_R + 4) {
      c.taken = true;
      s.coinCount += 1;
      s.score += 1;
      s.combo += 1;
      s.comboT = 0.5;
      s.events.push("coin");
      spark(s, c.x, c.y, 6, "spark", s.profile === "keira" ? ["#fbcfe8", "#fde68a", "#c4b5fd", "#ffffff"] : ["#fde047", "#facc15", "#ffffff"], { speed: [60, 160], size: [2, 4] });
      if (s.combo > 0 && s.combo % 10 === 0) {
        s.texts.push({ x: hx + 20, y: s.y - 30, text: `${s.combo} in a row!`, life: 1, big: false });
      }
    }
  }
  s.coins = s.coins.filter((c) => !c.taken && c.x > -40);

  // Pickups.
  for (const p of s.pickups) {
    p.t += dt;
    if (p.taken) continue;
    const py = p.y + Math.sin(p.t * 3) * 10;
    if (Math.hypot(hx - p.x, s.y - py) < HERO_R + 26) {
      p.taken = true;
      if (p.kind === "shield") {
        s.shield = true;
        s.events.push("shield");
        s.texts.push({ x: p.x, y: py - 20, text: "Bubble shield!", life: 1, big: false });
      } else {
        s.hearts = Math.min(START_HEARTS, s.hearts + 1);
        s.events.push("heart");
        s.texts.push({ x: p.x, y: py - 20, text: "+1 heart", life: 1, big: false });
      }
      spark(s, p.x, py, 16, "spark", ["#ffffff", "#f9a8d4", "#a5f3fc", "#fde68a"], { speed: [80, 200] });
    }
  }
  s.pickups = s.pickups.filter((p) => !p.taken && p.x > -60);

  // Rocks.
  for (const r of s.rocks) {
    r.phase += dt * 1.6;
    r.y = r.baseY + Math.sin(r.phase) * r.amp;
    r.rot += dt * (s.profile === "luke" ? -2 : 0.6);
    if (!r.hit && Math.hypot(hx - r.x, s.y - r.y) < HERO_R + ROCK_R - 4) {
      r.hit = true;
      hurt(s, hx);
    }
  }
  s.rocks = s.rocks.filter((r) => r.x > -60);

  // Zappers.
  for (const z of s.zappers) {
    if (!z.hit && distToSegment(hx, s.y, z) < HERO_R + 6) {
      z.hit = true;
      hurt(s, hx);
    }
  }
  s.zappers = s.zappers.filter((z) => z.x > -z.len);

  // Incoming movers: warn, track, then fly.
  for (const m of s.missiles) {
    if (!m.live) {
      const wasWarn = m.warn;
      m.warn -= dt;
      if (m.warn > 0.7) m.y += (s.y - m.y) * Math.min(1, dt * 3);
      m.y = Math.max(TOP, Math.min(BOT, m.y));
      if (wasWarn > 0 && m.warn <= 0) {
        m.live = true;
        m.x = s.W + 40;
        s.events.push("launch");
      }
      continue;
    }
    m.x -= (s.speed + 250 + 60 * d) * dt;
    m.spin += dt * 8;
    if (Math.random() < dt * 40) {
      if (s.profile === "luke") spark(s, m.x + 18, m.y, 1, "flame", ["#fb923c", "#facc15", "#ef4444"], { dir: 0, spread: 0.3, speed: [40, 90], size: [5, 9], life: [0.2, 0.4] });
      else spark(s, m.x + 18, m.y, 1, "bubble", ["#bae6fd", "#ffffff"], { dir: 0, spread: 0.4, speed: [30, 60], size: [2, 4], life: [0.4, 0.6] });
    }
    if (!m.hit && Math.hypot(hx - m.x, s.y - m.y) < HERO_R + MISSILE_R - 4) {
      m.hit = true;
      hurt(s, hx);
    }
  }
  s.missiles = s.missiles.filter((m) => !m.live || m.x > -80);

  // Milestones.
  const mm = meters(s);
  if (mm >= s.nextMilestone) {
    s.banner = { text: `${s.nextMilestone} m!`, life: 1.8 };
    s.score += 10;
    s.texts.push({ x: s.W / 2, y: H * 0.36, text: "+10", life: 1.2, big: true });
    s.nextMilestone += MILESTONE_M;
    s.events.push("milestone");
  }
}

function emitThrust(s: State, hx: number, dt: number, rate: number) {
  s.emitT -= dt * rate;
  if (s.emitT > 0) return;
  s.emitT = 0.022;
  const c = Math.cos(s.tilt);
  const sn = Math.sin(s.tilt);
  if (s.profile === "keira") {
    const ox = -30;
    const oy = 12;
    const x = hx + ox * c - oy * sn;
    const y = s.y + ox * sn + oy * c;
    spark(s, x, y, 1, "bubble", ["#bae6fd", "#ffffff", "#fbcfe8", "#ddd6fe"], { dir: Math.PI * 0.62, spread: 0.35, speed: [90, 170], size: [3, 7], life: [0.4, 0.8], vx: -s.speed * 0.3, g: -80 });
    spark(s, x, y, 1, "spark", ["#f472b6", "#fde047", "#34d399", "#60a5fa", "#a78bfa"], { dir: Math.PI * 0.6, spread: 0.4, speed: [80, 140], size: [2, 4], life: [0.3, 0.5] });
  } else {
    const ox = -21;
    const oy = 17;
    const x = hx + ox * c - oy * sn;
    const y = s.y + ox * sn + oy * c;
    spark(s, x, y, 2, "flame", ["#fde047", "#fb923c", "#f97316", "#fef3c7"], { dir: Math.PI / 2 + 0.25, spread: 0.25, speed: [160, 240], size: [4, 8], life: [0.12, 0.26], vx: -s.speed * 0.4 });
    spark(s, x, y + 8, 1, "smoke", ["#cbd5e1", "#e2e8f0", "#94a3b8"], { dir: Math.PI / 2 + 0.4, spread: 0.4, speed: [60, 110], size: [4, 7], life: [0.4, 0.7], vx: -s.speed * 0.6, g: -60 });
  }
}

export function setHolding(s: State, on: boolean) {
  s.holding = on && s.phase === "play";
}
