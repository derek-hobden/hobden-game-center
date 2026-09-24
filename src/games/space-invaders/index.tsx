"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import type { ProfileId } from "@/lib/profiles";
import {
  CanvasStage,
  GameOverlay,
  canvasPoint,
  prepareCanvas,
} from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import {
  bigText,
  boltPath,
  clamp,
  drawHeart,
  drawSprite,
  easeOutBack,
  easeOutCubic,
  heartPath,
  loadImage,
  rand,
  ready,
  roundRect,
  shieldPath,
  starPath,
  whiteSilhouette,
} from "./draw";
import { FORMATIONS, TOTAL_WAVES, type Formation } from "./waves";

/* ------------------------------------------------------------------ */
/* Tuning                                                               */
/* ------------------------------------------------------------------ */

const W = 360;
const H = 700;
const SHIP_Y = H - 84;
const SHIP_SIZE = 74;
const SHIP_HIT_R = 20; // forgiving: much smaller than the sprite
const INV = 52;
const GAP_X = 60;
const GAP_Y = 56;
const FORM_TOP = 96;
const MAX_LIVES = 5;
const START_LIVES = 3;
const FIRE_EVERY = 0.32;
const RAPID_EVERY = 0.16;
const POWER_TIME = 9;
const DANGER_Y = SHIP_Y - 58;

type Phase = "ready" | "play" | "clear" | "over" | "won";
type PowerKind = "triple" | "rapid" | "shield" | "heart";

type Invader = {
  x: number;
  y: number;
  sx: number; // slot offset in formation
  sy: number;
  kind: 0 | 1 | 2;
  hp: number;
  maxHp: number;
  alive: boolean;
  flash: number;
  phase: number;
  delay: number; // entrance delay (s)
  boss: boolean;
};
type Bullet = { x: number; y: number; vx: number; vy: number };
type Bomb = { x: number; y: number; vx: number; vy: number; t: number };
type Power = { x: number; y: number; kind: PowerKind; t: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  shape: "dot" | "star" | "ring" | "confetti";
  rot: number;
  vr: number;
};
type FloatText = { x: number; y: number; text: string; life: number; color: string; size: number };
type Star = { x: number; y: number; z: number; tw: number };

type World = {
  phase: Phase;
  time: number;
  shipX: number;
  targetX: number;
  tilt: number;
  lives: number;
  invuln: number;
  shield: boolean;
  triple: number;
  rapid: number;
  fireCd: number;
  wave: number;
  waveTime: number;
  formX: number;
  formY: number;
  formDir: number;
  bombCd: number;
  powerDropped: boolean;
  invaders: Invader[];
  bullets: Bullet[];
  bombs: Bomb[];
  powers: Power[];
  particles: Particle[];
  texts: FloatText[];
  stars: Star[];
  shake: number;
  flashRed: number;
  warp: number;
  clearT: number;
  banner: { text: string; sub: string; t: number } | null;
  score: number;
  hintT: number;
};

/* ------------------------------------------------------------------ */
/* Art                                                                  */
/* ------------------------------------------------------------------ */

type ArtPack = {
  bg: string;
  ship: string;
  invaders: [string, string, string];
  shot: [string, string]; // core, glow
  bomb: [string, string];
  sparks: string[];
  start: { emoji: string; title: string; subtitle: string };
  win: { emoji: string; title: string; subtitle: string };
  lose: { emoji: string; title: string };
  boss: string;
  cheers: string[];
};

function artFor(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        bg: "/games/space-invaders/keira-space-bg.jpg",
        ship: "/games/space-invaders/keira-ship.png",
        invaders: [
          "/games/space-invaders/keira-invader-star.png",
          "/games/space-invaders/keira-invader-fairy.png",
          "/games/space-invaders/keira-invader-mermaid.png",
        ],
        shot: ["#fff", "#f472b6"],
        bomb: ["#fef3c7", "#a855f7"],
        sparks: ["#f9a8d4", "#fde68a", "#a5f3fc", "#c4b5fd", "#ffffff"],
        start: {
          emoji: "🦄",
          title: "Ready, star pilot?",
          subtitle: "Drag to fly. Sparkles shoot all by themselves! Grab the glowing gifts.",
        },
        win: {
          emoji: "🌈",
          title: "Rainbow sky saved!",
          subtitle: "You sparkled every wave. Superstar!",
        },
        lose: { emoji: "💫", title: "Out of hearts!" },
        boss: "Star Queen",
        cheers: ["Sparkly!", "Wow!", "Magic!", "Yay!"],
      };
    case "luke":
      return {
        bg: "/games/space-invaders/luke-space-bg.jpg",
        ship: "/games/space-invaders/luke-ship.png",
        invaders: [
          "/games/space-invaders/luke-invader-alien.png",
          "/games/space-invaders/luke-invader-dino.png",
          "/games/space-invaders/luke-invader-meteor.png",
        ],
        shot: ["#fff", "#38bdf8"],
        bomb: ["#fef9c3", "#84cc16"],
        sparks: ["#7dd3fc", "#fde047", "#bef264", "#fb923c", "#ffffff"],
        start: {
          emoji: "🚀",
          title: "Ready, captain?",
          subtitle: "Drag to fly. Lasers fire all by themselves! Grab the glowing power-ups.",
        },
        win: {
          emoji: "🏆",
          title: "Space is safe!",
          subtitle: "Every wave blasted. Top gun!",
        },
        lose: { emoji: "💥", title: "Ship out of hearts!" },
        boss: "Alien King",
        cheers: ["Boom!", "Nice!", "Zap!", "Awesome!"],
      };
    default: {
      const never: never = profileId;
      throw new Error(`Unknown profile: ${String(never)}`);
    }
  }
}

const POWER_INFO: Record<PowerKind, { color: string; label: string }> = {
  triple: { color: "#f59e0b", label: "Triple shot!" },
  rapid: { color: "#22c55e", label: "Super speed!" },
  shield: { color: "#38bdf8", label: "Bubble shield!" },
  heart: { color: "#f43f5e", label: "+1 heart!" },
};

/* ------------------------------------------------------------------ */
/* World setup                                                          */
/* ------------------------------------------------------------------ */

function makeStars(): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      z: [0.35, 0.65, 1][i % 3]!,
      tw: Math.random() * Math.PI * 2,
    });
  }
  return stars;
}

function buildWave(f: Formation, wave: number): Invader[] {
  const out: Invader[] = [];
  const rows = f.rows;
  const cols = Math.max(...rows.map((r) => r.length));
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === "." || ch === undefined) continue;
      const kind = Number(ch) as 0 | 1 | 2;
      const sx = (c - (cols - 1) / 2) * GAP_X;
      const sy = r * GAP_Y;
      const tough = wave >= 4 && kind === 2 ? 2 : 1;
      out.push({
        x: W / 2 + sx,
        y: FORM_TOP + sy,
        sx,
        sy,
        kind,
        hp: tough,
        maxHp: tough,
        alive: true,
        flash: 0,
        phase: Math.random() * Math.PI * 2,
        delay: 0.15 + c * 0.07 + r * 0.12,
        boss: false,
      });
    }
  });
  if (f.boss) {
    out.push({
      x: W / 2,
      y: FORM_TOP + 20,
      sx: 0,
      sy: 20,
      kind: 0,
      hp: 26,
      maxHp: 26,
      alive: true,
      flash: 0,
      phase: 0,
      delay: 0.8,
      boss: true,
    });
  }
  return out;
}

function newWorld(): World {
  return {
    phase: "ready",
    time: 0,
    shipX: W / 2,
    targetX: W / 2,
    tilt: 0,
    lives: START_LIVES,
    invuln: 0,
    shield: false,
    triple: 0,
    rapid: 0,
    fireCd: 0.4,
    wave: 1,
    waveTime: 0,
    formX: 0,
    formY: 0,
    formDir: 1,
    bombCd: 2.5,
    powerDropped: false,
    invaders: buildWave(FORMATIONS[0]!, 1),
    bullets: [],
    bombs: [],
    powers: [],
    particles: [],
    texts: [],
    stars: makeStars(),
    shake: 0,
    flashRed: 0,
    warp: 0,
    clearT: 0,
    banner: null,
    score: 0,
    hintT: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function SpaceInvadersGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(newWorld());
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const keys = useRef({ left: false, right: false });
  const dragging = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState({ wave: 1, score: 0 });
  const art = artFor(profileId);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    scoreCb.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    // Dev-only hook so scripted playtests can inspect/skip waves.
    if (process.env.NODE_ENV === "production") return;
    const win = window as unknown as { __spaceInvaders?: typeof worldRef };
    win.__spaceInvaders = worldRef;
    return () => {
      delete win.__spaceInvaders;
    };
  }, []);

  const start = useCallback(() => {
    const w = newWorld();
    w.phase = "play";
    w.banner = { text: "Wave 1", sub: "Here they come!", t: 0 };
    w.hintT = 4;
    worldRef.current = w;
    scoreCb.current?.(0);
    setPhase("play");
    sfx("levelUp");
  }, []);

  // Main loop: one RAF for the component's lifetime; state lives in refs.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pack = artFor(profileId);
    const imgs = {
      bg: loadImage(pack.bg),
      ship: loadImage(pack.ship),
      inv: pack.invaders.map(loadImage),
    };
    const flashCache = new Map<HTMLImageElement, HTMLCanvasElement>();
    const whiteOf = (img: HTMLImageElement) => {
      let c = flashCache.get(img);
      if (!c) {
        c = whiteSilhouette(img);
        flashCache.set(img, c);
      }
      return c;
    };

    let raf = 0;
    let last = performance.now();

    const addScore = (w: World, n: number) => {
      w.score += n;
      scoreCb.current?.(w.score);
    };

    const burst = (
      w: World,
      x: number,
      y: number,
      n: number,
      power = 1,
      colors = pack.sparks,
    ) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(60, 220) * power;
        w.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(0.35, 0.8),
          max: 0.8,
          size: rand(2, 5) * (power > 1 ? 1.3 : 1),
          color: colors[i % colors.length]!,
          shape: i % 4 === 0 ? "star" : "dot",
          rot: Math.random() * 6,
          vr: rand(-8, 8),
        });
      }
      w.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        life: 0.4,
        max: 0.4,
        size: 34 * power,
        color: "#fff",
        shape: "ring",
        rot: 0,
        vr: 0,
      });
      if (w.particles.length > 500) w.particles.splice(0, w.particles.length - 500);
    };

    const confetti = (w: World, n: number) => {
      for (let i = 0; i < n; i++) {
        w.particles.push({
          x: rand(0, W),
          y: rand(-60, -10),
          vx: rand(-40, 40),
          vy: rand(120, 260),
          life: rand(1.6, 2.6),
          max: 2.6,
          size: rand(5, 9),
          color: pack.sparks[i % pack.sparks.length]!,
          shape: "confetti",
          rot: Math.random() * 6,
          vr: rand(-10, 10),
        });
      }
    };

    const text = (w: World, x: number, y: number, t: string, color = "#fff", size = 20) => {
      w.texts.push({ x, y, text: t, life: 0.9, color, size });
    };

    const invPos = (w: World, inv: Invader) => {
      // Entrance: swoop in from above with a little overshoot.
      const k = clamp((w.waveTime - inv.delay) / 0.9, 0, 1);
      const e = easeOutBack(k);
      const baseX = W / 2 + inv.sx + w.formX;
      const baseY = FORM_TOP + inv.sy + w.formY;
      const bob = Math.sin(w.time * 3 + inv.phase) * 4;
      if (inv.boss) {
        return {
          x: W / 2 + Math.sin(w.time * 0.9) * 90,
          y: baseY + (1 - e) * -260 + Math.sin(w.time * 2) * 8,
          entered: k >= 1,
        };
      }
      return {
        x: baseX + (1 - e) * inv.sx * 0.6,
        y: baseY + (1 - e) * -(360 + inv.sy) + bob,
        entered: k >= 1,
      };
    };

    const hurtShip = (w: World) => {
      if (w.invuln > 0) return;
      if (w.shield) {
        w.shield = false;
        w.invuln = 1;
        burst(w, w.shipX, SHIP_Y, 16, 1, ["#7dd3fc", "#e0f2fe", "#fff"]);
        text(w, w.shipX, SHIP_Y - 50, "Shield saved you!", "#bae6fd", 18);
        sfx("bounce");
        haptic(20);
        return;
      }
      w.lives -= 1;
      w.invuln = 2.2;
      w.shake = 10;
      w.flashRed = 0.5;
      w.triple = 0;
      w.rapid = 0;
      burst(w, w.shipX, SHIP_Y, 24, 1.2, ["#fb7185", "#fde68a", "#fff"]);
      sfx("hit");
      haptic(60);
      if (w.lives <= 0) {
        w.phase = "over";
        sfx("lose");
        setResult({ wave: w.wave, score: w.score });
        setPhase("over");
      } else {
        text(w, w.shipX, SHIP_Y - 50, "Ouch!", "#fecdd3", 22);
      }
    };

    const nextWave = (w: World) => {
      w.wave += 1;
      if (w.wave > TOTAL_WAVES) {
        w.phase = "won";
        confetti(w, 90);
        sfx("win");
        setResult({ wave: TOTAL_WAVES, score: w.score });
        setPhase("won");
        return;
      }
      const f = FORMATIONS[w.wave - 1]!;
      w.invaders = buildWave(f, w.wave);
      w.waveTime = 0;
      w.formX = 0;
      w.formY = 0;
      w.formDir = 1;
      w.bombCd = 2.4;
      w.powerDropped = false;
      w.phase = "play";
      w.banner = {
        text: f.boss ? pack.boss : `Wave ${w.wave}`,
        sub: f.boss ? "Big boss! Keep zapping!" : f.name,
        t: 0,
      };
      if (f.boss) sfx("boom", { pitch: 0.7 });
    };

    const dropPower = (w: World, x: number, y: number) => {
      const choices: PowerKind[] = ["triple", "rapid", "shield"];
      if (w.lives < MAX_LIVES) choices.push("heart", "heart");
      const kind = choices[Math.floor(Math.random() * choices.length)]!;
      w.powers.push({ x, y, kind, t: 0 });
      w.powerDropped = true;
    };

    const step = (w: World, dt: number) => {
      w.time += dt;
      // Stars + background always drift (warp speed during celebrations).
      const warpTarget = w.phase === "clear" ? 1 : 0;
      w.warp += (warpTarget - w.warp) * Math.min(1, dt * 3);
      const starSpeed = 30 + w.warp * 520;
      for (const s of w.stars) {
        s.y += starSpeed * s.z * dt;
        if (s.y > H + 10) {
          s.y = -10;
          s.x = Math.random() * W;
        }
      }

      // Particles & texts
      for (const p of w.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.shape === "confetti") {
          p.vx += Math.sin(w.time * 4 + p.rot) * 30 * dt;
        } else {
          p.vx *= 1 - dt * 2.5;
          p.vy *= 1 - dt * 2.5;
        }
        p.rot += p.vr * dt;
        p.life -= dt;
      }
      w.particles = w.particles.filter((p) => p.life > 0);
      for (const t of w.texts) {
        t.y -= 40 * dt;
        t.life -= dt;
      }
      w.texts = w.texts.filter((t) => t.life > 0);
      w.shake = Math.max(0, w.shake - dt * 40);
      w.flashRed = Math.max(0, w.flashRed - dt);
      if (w.banner) {
        w.banner.t += dt;
        if (w.banner.t > 2.2) w.banner = null;
      }
      if (w.hintT > 0) w.hintT -= dt;

      if (w.phase === "ready" || w.phase === "over" || w.phase === "won") {
        // Idle: formation gently floats for the attract screen.
        w.waveTime = Math.max(w.waveTime, 5);
        return;
      }

      // Ship movement (drag target or keyboard)
      if (keys.current.left) w.targetX -= 330 * dt;
      if (keys.current.right) w.targetX += 330 * dt;
      w.targetX = clamp(w.targetX, SHIP_SIZE / 2 - 6, W - SHIP_SIZE / 2 + 6);
      const prevX = w.shipX;
      w.shipX += (w.targetX - w.shipX) * Math.min(1, dt * 14);
      const vx = (w.shipX - prevX) / Math.max(dt, 0.001);
      w.tilt += (clamp(vx / 900, -0.35, 0.35) - w.tilt) * Math.min(1, dt * 10);
      w.invuln = Math.max(0, w.invuln - dt);
      w.triple = Math.max(0, w.triple - dt);
      w.rapid = Math.max(0, w.rapid - dt);

      // Auto-fire
      w.fireCd -= dt;
      if (w.fireCd <= 0) {
        w.fireCd = w.rapid > 0 ? RAPID_EVERY : FIRE_EVERY;
        const y = SHIP_Y - 30;
        if (w.triple > 0) {
          w.bullets.push({ x: w.shipX, y, vx: 0, vy: -600 });
          w.bullets.push({ x: w.shipX - 10, y: y + 6, vx: -130, vy: -580 });
          w.bullets.push({ x: w.shipX + 10, y: y + 6, vx: 130, vy: -580 });
        } else {
          w.bullets.push({ x: w.shipX, y, vx: 0, vy: -600 });
        }
        sfx("zap", { pitch: 1.4 + Math.random() * 0.2 });
      }
      for (const b of w.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }

      // Power-ups fall and get caught
      for (const p of w.powers) {
        p.t += dt;
        p.y += 85 * dt;
        p.x += Math.sin(p.t * 3) * 20 * dt;
        if (Math.abs(p.x - w.shipX) < 40 && Math.abs(p.y - SHIP_Y) < 42) {
          p.t = -99;
          const info = POWER_INFO[p.kind];
          if (p.kind === "triple") w.triple = POWER_TIME;
          if (p.kind === "rapid") w.rapid = POWER_TIME;
          if (p.kind === "shield") w.shield = true;
          if (p.kind === "heart") w.lives = Math.min(MAX_LIVES, w.lives + 1);
          text(w, w.shipX, SHIP_Y - 56, info.label, info.color, 22);
          burst(w, p.x, p.y, 18, 1, [info.color, "#fff", "#fde68a"]);
          addScore(w, 5);
          sfx("star");
          haptic(15);
        }
      }
      w.powers = w.powers.filter((p) => p.t >= 0 && p.y < H + 30);

      if (w.phase === "clear") {
        w.clearT -= dt;
        w.bullets = w.bullets.filter((b) => b.y > -20);
        if (w.clearT <= 0) nextWave(w);
        return;
      }

      w.waveTime += dt;

      // Formation drift: side to side, stepping down at the edges.
      const alive = w.invaders.filter((i) => i.alive && !i.boss);
      const total = w.invaders.filter((i) => !i.boss).length || 1;
      const entering = w.invaders.some(
        (i) => i.alive && w.waveTime - i.delay < 0.9,
      );
      if (!entering && alive.length > 0) {
        const speed =
          18 + w.wave * 5 + (1 - alive.length / total) * 34;
        w.formX += w.formDir * speed * dt;
        let minX = Infinity;
        let maxX = -Infinity;
        for (const i of alive) {
          minX = Math.min(minX, W / 2 + i.sx + w.formX);
          maxX = Math.max(maxX, W / 2 + i.sx + w.formX);
        }
        if (maxX > W - INV / 2 - 6 && w.formDir > 0) {
          w.formDir = -1;
          w.formY += 12;
        } else if (minX < INV / 2 + 6 && w.formDir < 0) {
          w.formDir = 1;
          w.formY += 12;
        }
      }

      // Positions
      let lowest = 0;
      for (const inv of w.invaders) {
        if (!inv.alive) continue;
        const p = invPos(w, inv);
        inv.x = p.x;
        inv.y = p.y;
        inv.flash = Math.max(0, inv.flash - dt);
        if (!inv.boss) lowest = Math.max(lowest, inv.y + INV / 2);
      }

      // Too close! Lose a heart and push them back up — never an instant loss.
      if (lowest > DANGER_Y) {
        w.formY = Math.max(-40, w.formY - 150);
        w.bombs = [];
        text(w, W / 2, DANGER_Y - 60, "Too close! Back up!", "#fde68a", 22);
        hurtShip(w);
        if (w.phase !== "play") return;
      }

      // Enemy bombs (slow, big, easy to see)
      if (!entering) w.bombCd -= dt;
      if (w.bombCd <= 0) {
        const boss = w.invaders.find((i) => i.boss && i.alive);
        const base = Math.max(1.0, 2.7 - w.wave * 0.28);
        w.bombCd = base * rand(0.75, 1.3);
        const bottoms = new Map<number, Invader>();
        for (const i of alive) {
          const prev = bottoms.get(i.sx);
          if (!prev || prev.sy < i.sy) bottoms.set(i.sx, i);
        }
        const shooters = [...bottoms.values()];
        const vy = 120 + w.wave * 10;
        if (boss && (shooters.length === 0 || Math.random() < 0.6)) {
          for (const dx of [-1, 0, 1]) {
            w.bombs.push({ x: boss.x + dx * 18, y: boss.y + 40, vx: dx * 55, vy: vy - 10, t: 0 });
          }
          sfx("drop", { pitch: 0.8 });
          w.bombCd = 1.8;
        } else if (shooters.length > 0) {
          const s = shooters[Math.floor(Math.random() * shooters.length)]!;
          w.bombs.push({ x: s.x, y: s.y + 20, vx: 0, vy, t: 0 });
          sfx("drop", { pitch: 1.3 });
        }
      }
      for (const b of w.bombs) {
        b.t += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (
          Math.hypot(b.x - w.shipX, b.y - (SHIP_Y + 6)) < SHIP_HIT_R + 8 &&
          w.invuln <= 0
        ) {
          b.y = H + 99;
          hurtShip(w);
          if (w.phase !== "play") return;
        }
      }
      w.bombs = w.bombs.filter((b) => b.y < H + 20 && b.x > -20 && b.x < W + 20);

      // Bullets hit invaders (generous boxes)
      for (const b of w.bullets) {
        for (const inv of w.invaders) {
          if (!inv.alive || b.y < -50) continue;
          const half = inv.boss ? 62 : INV / 2 + 6;
          if (Math.abs(b.x - inv.x) < half && Math.abs(b.y - inv.y) < half + 4) {
            b.y = -99;
            inv.hp -= 1;
            inv.flash = 0.12;
            if (inv.hp <= 0) {
              inv.alive = false;
              const pts = inv.boss ? 200 : 10;
              addScore(w, pts);
              burst(w, inv.x, inv.y, inv.boss ? 60 : 16, inv.boss ? 2 : 1);
              text(w, inv.x, inv.y - 10, `+${pts}`, "#fff", inv.boss ? 30 : 20);
              w.shake = Math.max(w.shake, inv.boss ? 14 : 3);
              sfx(inv.boss ? "boom" : "pop", { pitch: rand(0.9, 1.3) });
              haptic(inv.boss ? 50 : 8);
              const aliveNow = w.invaders.filter((i) => i.alive).length;
              const chance = w.powerDropped ? 0.08 : 0.16;
              if (
                w.powers.length === 0 &&
                (Math.random() < chance ||
                  (!w.powerDropped && aliveNow <= total / 2))
              ) {
                dropPower(w, inv.x, inv.y);
              }
            } else {
              sfx("hit", { pitch: inv.boss ? 1.6 : 1.3 });
              burst(w, b.x, b.y + 4, 4, 0.6);
            }
            break;
          }
        }
      }
      w.bullets = w.bullets.filter((b) => b.y > -20 && b.x > -20 && b.x < W + 20);

      // Wave cleared?
      if (w.invaders.every((i) => !i.alive)) {
        w.phase = "clear";
        w.clearT = 2.6;
        w.bombs = [];
        addScore(w, 50);
        confetti(w, 60);
        const last = w.wave >= TOTAL_WAVES;
        w.banner = {
          text: last ? "You did it!" : `Wave ${w.wave} clear!`,
          sub: pack.cheers[w.wave % pack.cheers.length]! + "  +50",
          t: 0,
        };
        sfx("clear");
        haptic(30);
      }
    };

    /* ----------------------------- drawing ----------------------------- */

    const drawBackground = (w: World) => {
      const bg = imgs.bg;
      if (ready(bg)) {
        // Cover-fit with a little extra room so it can sway (parallax) with the ship.
        const s = Math.max((W + 36) / bg.naturalWidth, (H + 24) / bg.naturalHeight);
        const dw = bg.naturalWidth * s;
        const dh = bg.naturalHeight * s;
        const px = -(w.shipX - W / 2) * 0.08 + Math.sin(w.time * 0.2) * 4;
        const py = Math.sin(w.time * 0.15) * 8 + w.warp * 6 * Math.sin(w.time * 30);
        ctx.drawImage(bg, (W - dw) / 2 + px, (H - dh) / 2 + py, dw, dh);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#1e1b4b");
        g.addColorStop(1, "#312e81");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      // Soft dim so sprites pop against the busy painting.
      const dim = ctx.createLinearGradient(0, 0, 0, H);
      dim.addColorStop(0, "rgba(10,5,40,0.45)");
      dim.addColorStop(0.5, "rgba(10,5,40,0.15)");
      dim.addColorStop(1, "rgba(10,5,40,0.4)");
      ctx.fillStyle = dim;
      ctx.fillRect(0, 0, W, H);

      // Parallax star layers
      for (const s of w.stars) {
        const tw = 0.55 + 0.45 * Math.sin(w.time * 3 + s.tw);
        ctx.globalAlpha = (0.35 + s.z * 0.6) * tw;
        ctx.fillStyle = "#fff";
        if (w.warp > 0.1) {
          ctx.fillRect(s.x - 0.8 * s.z, s.y, 1.6 * s.z, 4 + w.warp * 40 * s.z);
        } else {
          ctx.beginPath();
          ctx.arc(s.x, s.y, 0.6 + s.z * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawInvaders = (w: World) => {
      for (const inv of w.invaders) {
        if (!inv.alive) continue;
        const img = imgs.inv[inv.kind];
        if (!ready(img)) continue;
        const size = inv.boss ? 120 : INV;
        const squash = Math.sin(w.time * 6 + inv.phase) * 0.07;
        const rot = Math.sin(w.time * 2.2 + inv.phase) * (inv.boss ? 0.08 : 0.14);
        // Glow halo
        ctx.save();
        ctx.globalAlpha = 0.35;
        const halo = ctx.createRadialGradient(inv.x, inv.y, 4, inv.x, inv.y, size * 0.7);
        halo.addColorStop(0, pack.sparks[inv.kind]!);
        halo.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(inv.x, inv.y, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawSprite(ctx, img, inv.x, inv.y, size, size, rot, 1 + squash, 1 - squash);
        if (inv.flash > 0) {
          drawSprite(ctx, whiteOf(img), inv.x, inv.y, size, size, rot, 1 + squash, 1 - squash, 0.85);
        }
        if (inv.maxHp > 1 && !inv.boss && inv.hp < inv.maxHp) {
          // cracked: little dizzy stars
          for (let k = 0; k < 2; k++) {
            const a = w.time * 4 + k * Math.PI;
            starPath(ctx, inv.x + Math.cos(a) * 18, inv.y - 24 + Math.sin(a) * 4, 5, a);
            ctx.fillStyle = "#fde047";
            ctx.fill();
          }
        }
      }
    };

    const drawShip = (w: World) => {
      const x = w.shipX;
      const y = SHIP_Y + Math.sin(w.time * 4) * 2;
      // Engine flame
      const fl = 18 + Math.sin(w.time * 40) * 4 + Math.random() * 4;
      const g = ctx.createLinearGradient(x, y + 20, x, y + 20 + fl + 10);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.35, pack.shot[1]);
      g.addColorStop(1, "rgba(255,120,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 22);
      ctx.quadraticCurveTo(x, y + 30 + fl * 1.4, x + 11, y + 22);
      ctx.closePath();
      ctx.fill();

      const blink = w.invuln > 0 && Math.floor(w.time * 12) % 2 === 0;
      if (ready(imgs.ship)) {
        drawSprite(ctx, imgs.ship, x, y, SHIP_SIZE, SHIP_SIZE, w.tilt, 1, 1, blink ? 0.35 : 1);
      }
      if (w.shield) {
        const r = 44 + Math.sin(w.time * 5) * 2;
        const sg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
        sg.addColorStop(0, "rgba(125,211,252,0)");
        sg.addColorStop(0.85, "rgba(125,211,252,0.35)");
        sg.addColorStop(1, "rgba(224,242,254,0.9)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, -2.4, -1.6);
        ctx.stroke();
      }
    };

    const drawShots = (w: World) => {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const b of w.bullets) {
        const g = ctx.createLinearGradient(b.x, b.y - 14, b.x, b.y + 22);
        g.addColorStop(0, pack.shot[0]);
        g.addColorStop(0.4, pack.shot[1]);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        roundRect(ctx, b.x - 5, b.y - 14, 10, 40, 5);
        ctx.fill();
        const halo = ctx.createRadialGradient(b.x, b.y - 6, 1, b.x, b.y - 6, 16);
        halo.addColorStop(0, pack.shot[1]);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(b.x, b.y - 6, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      for (const b of w.bullets) {
        ctx.fillStyle = "#fff";
        starPath(ctx, b.x, b.y - 8, 7, w.time * 8);
        ctx.fill();
      }
      for (const b of w.bombs) {
        const pulse = 1 + Math.sin(b.t * 14) * 0.15;
        const r = 9 * pulse;
        const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, r * 2);
        g.addColorStop(0, pack.bomb[0]);
        g.addColorStop(0.45, pack.bomb[1]);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawPowerIcon = (kind: PowerKind, x: number, y: number, s: number) => {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#fff";
      if (kind === "heart") {
        heartPath(ctx, x, y + 1, s);
        ctx.fill();
      } else if (kind === "rapid") {
        boltPath(ctx, x, y, s);
        ctx.fill();
      } else if (kind === "shield") {
        shieldPath(ctx, x, y, s);
        ctx.fill();
      } else {
        for (const dx of [-1, 0, 1]) {
          ctx.save();
          ctx.translate(x + dx * s * 0.3, y + Math.abs(dx) * s * 0.08);
          ctx.rotate(dx * 0.35);
          roundRect(ctx, -s * 0.08, -s * 0.38, s * 0.16, s * 0.7, s * 0.08);
          ctx.fill();
          ctx.restore();
        }
      }
    };

    const drawPowers = (w: World) => {
      for (const p of w.powers) {
        const info = POWER_INFO[p.kind];
        const r = 18 + Math.sin(p.t * 6) * 1.5;
        ctx.save();
        ctx.globalAlpha = 0.5;
        const halo = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 2);
        halo.addColorStop(0, info.color);
        halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const g = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, r);
        g.addColorStop(0, "#fff");
        g.addColorStop(0.35, info.color);
        g.addColorStop(1, info.color);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        drawPowerIcon(p.kind, p.x, p.y, 18);
      }
    };

    const drawParticles = (w: World) => {
      for (const p of w.particles) {
        const a = clamp(p.life / (p.max * 0.6), 0, 1);
        ctx.globalAlpha = a;
        if (p.shape === "ring") {
          const k = 1 - p.life / p.max;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.3 + easeOutCubic(k)), 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.shape === "star") {
          ctx.fillStyle = p.color;
          starPath(ctx, p.x, p.y, p.size * 1.6, p.rot);
          ctx.fill();
        } else if (p.shape === "confetti") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.sin(p.rot * 2));
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const t of w.texts) {
        const k = 1 - t.life / 0.9;
        ctx.globalAlpha = clamp(t.life / 0.3, 0, 1);
        const s = t.size * (k < 0.15 ? easeOutBack(k / 0.15) : 1);
        bigText(ctx, t.text, t.x, t.y, Math.max(1, s), t.color);
      }
      ctx.globalAlpha = 1;
    };

    const drawHud = (w: World) => {
      for (let i = 0; i < Math.max(START_LIVES, w.lives); i++) {
        drawHeart(ctx, 24 + i * 28, 26, 24, i < w.lives);
      }
      // Wave chip
      const label = `Wave ${Math.min(w.wave, TOTAL_WAVES)}/${TOTAL_WAVES}`;
      ctx.font = `900 15px ui-rounded, "Nunito", system-ui, sans-serif`;
      const tw = ctx.measureText(label).width + 22;
      roundRect(ctx, W - tw - 10, 12, tw, 28, 14);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fill();
      ctx.fillStyle = "#3b1d4a";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, W - tw / 2 - 10, 27);
      // Active power timers
      let px = 18;
      const py = w.invaders.some((i) => i.boss && i.alive) ? 84 : 58;
      for (const [kind, t] of [
        ["triple", w.triple],
        ["rapid", w.rapid],
      ] as const) {
        if (t <= 0) continue;
        const info = POWER_INFO[kind];
        ctx.fillStyle = info.color;
        ctx.beginPath();
        ctx.arc(px + 10, py, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px + 10, py, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * t) / POWER_TIME);
        ctx.stroke();
        drawPowerIcon(kind, px + 10, py, 12);
        px += 30;
      }
      // Boss health bar
      const boss = w.invaders.find((i) => i.boss && i.alive);
      if (boss) {
        const bx = 20;
        const bw = W - 40;
        roundRect(ctx, bx - 2, 50, bw + 4, 16, 8);
        ctx.fillStyle = "rgba(20,10,40,0.75)";
        ctx.fill();
        const bg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        bg.addColorStop(0, "#fb7185");
        bg.addColorStop(1, "#f59e0b");
        roundRect(ctx, bx, 52, Math.max(10, (bw * boss.hp) / boss.maxHp), 12, 6);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.font = `900 11px ui-rounded, "Nunito", system-ui, sans-serif`;
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pack.boss, W / 2, 58.5);
      }
      // Danger line appears when the formation gets low.
      const lowest = Math.max(0, ...w.invaders.filter((i) => i.alive && !i.boss).map((i) => i.y + INV / 2));
      if (w.phase === "play" && lowest > DANGER_Y - 90) {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(w.time * 10);
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "#fb7185";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(10, DANGER_Y);
        ctx.lineTo(W - 10, DANGER_Y);
        ctx.stroke();
        ctx.restore();
      }
      if (w.hintT > 0 && w.phase === "play") {
        ctx.globalAlpha = clamp(w.hintT, 0, 1) * (0.7 + 0.3 * Math.sin(w.time * 6));
        bigText(ctx, "◀  drag to fly  ▶", W / 2, H - 22, 18);
        ctx.globalAlpha = 1;
      }
      if (w.banner) {
        const t = w.banner.t;
        const inK = clamp(t / 0.45, 0, 1);
        const outK = clamp((t - 1.7) / 0.5, 0, 1);
        const s = easeOutBack(inK) * (1 - outK * 0.3);
        ctx.save();
        ctx.globalAlpha = 1 - outK;
        ctx.translate(W / 2, H * 0.42);
        ctx.scale(s, s);
        ctx.rotate(Math.sin(t * 5) * 0.03);
        bigText(ctx, w.banner.text, 0, 0, 40, "#fff7ae", undefined, W - 28);
        bigText(ctx, w.banner.sub, 0, 40, 20, "#fff", undefined, W - 28);
        ctx.restore();
      }
      if (w.flashRed > 0) {
        ctx.fillStyle = `rgba(244,63,94,${w.flashRed * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const draw = (w: World) => {
      prepareCanvas(ctx, W);
      ctx.save();
      if (w.shake > 0) {
        ctx.translate(rand(-1, 1) * w.shake * 0.5, rand(-1, 1) * w.shake * 0.5);
      }
      drawBackground(w);
      drawInvaders(w);
      drawPowers(w);
      drawShots(w);
      if (w.phase !== "over") drawShip(w);
      drawParticles(w);
      ctx.restore();
      drawHud(w);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = worldRef.current;
      if (!pausedRef.current) step(w, dt);
      draw(w);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [profileId]);

  // Keyboard: arrows / A-D to move, Space/Enter to start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") keys.current.left = down;
      else if (k === "ArrowRight" || k === "d" || k === "D") keys.current.right = down;
      else if ((k === " " || k === "Enter") && down) {
        const ph = worldRef.current.phase;
        if (ph === "ready" && !pausedRef.current) start();
      } else return;
      e.preventDefault();
      // Keyboard steering moves the target from wherever the ship is now.
      if (down && !e.repeat) worldRef.current.targetX = worldRef.current.shipX;
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      keys.current = { left: false, right: false };
    };
  }, [start]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = worldRef.current;
    if (pausedRef.current) return;
    if (w.phase === "ready") {
      start();
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = e.pointerId;
    worldRef.current.targetX = canvasPoint(e, e.currentTarget, W, H).x;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current !== e.pointerId) return;
    worldRef.current.targetX = canvasPoint(e, e.currentTarget, W, H).x;
  };
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current === e.pointerId) dragging.current = null;
  };

  return (
    <div className="game-root">
      <CanvasStage
        width={W}
        height={H}
        canvasRef={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <GameOverlay
          show={phase === "ready"}
          emoji={art.start.emoji}
          title={art.start.title}
          subtitle={art.start.subtitle}
          actionLabel="Tap to start"
          onAction={start}
        />
        <GameOverlay
          show={phase === "over"}
          emoji={art.lose.emoji}
          title={art.lose.title}
          subtitle={`You reached wave ${result.wave} and scored ${result.score}!`}
          actionLabel="Play again"
          onAction={start}
          tone="lose"
        />
        <GameOverlay
          show={phase === "won"}
          emoji={art.win.emoji}
          title={art.win.title}
          subtitle={`${art.win.subtitle} Score: ${result.score}`}
          actionLabel="Play again"
          onAction={start}
          tone="win"
        />
      </CanvasStage>
    </div>
  );
}
