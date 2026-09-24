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
  clamp,
  drawHeart,
  drawSprite,
  easeOutBack,
  easeOutCubic,
  loadImage,
  rand,
  ready,
  roundRect,
  starPath,
  whiteSilhouette,
} from "@/games/space-invaders/draw";
import { pickTwo, xpNeeded, type Stats, type Upgrade } from "./upgrades";

/* ------------------------------------------------------------------ */
/* Tuning                                                               */
/* ------------------------------------------------------------------ */

const W = 360;
const H = 700;
const SURVIVE = 120; // seconds to win
const HERO_H = 78;
const HERO_R = 16; // forgiving body radius
const FOE = 54;
const FOE_R = 15;
const JOY_R = 46;
const TOP = 64; // HUD band; play area starts below it
const START_STATS: Stats = {
  auraR: 72,
  auraDmg: 1,
  auraEvery: 0.9,
  speed: 145,
  magnetR: 90,
  orbiters: 0,
  hp: 5,
  maxHp: 5,
};

type Phase = "ready" | "play" | "levelup" | "over" | "won";

type Foe = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  flash: number;
  phase: number;
  big: boolean;
  spawn: number; // 0→1 pop-in
  kx: number;
  ky: number;
  orbitCd: number;
};
type Gem = { x: number; y: number; v: number; pull: boolean; t: number; value: number };
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
};
type FloatText = { x: number; y: number; text: string; life: number; color: string; size: number };

type World = {
  phase: Phase;
  time: number; // survival clock
  clock: number; // animation clock (always runs)
  x: number;
  y: number;
  vx: number;
  face: number;
  walk: number;
  invuln: number;
  stats: Stats;
  level: number;
  xp: number;
  pulseCd: number;
  pulseT: number; // time since last pulse (for ring anim)
  orbitA: number;
  foes: Foe[];
  gems: Gem[];
  particles: Particle[];
  texts: FloatText[];
  spawnCd: number;
  events: { opening: boolean; swarm30: boolean; big60: boolean; swarm75: boolean; big100: boolean };
  banner: { text: string; sub: string; t: number } | null;
  shake: number;
  hurtFlash: number;
  score: number;
  gemCombo: number;
  gemComboT: number;
  hintT: number;
  pendingLevels: number;
};

type ArtPack = {
  hero: string;
  foe: string;
  gem: string;
  ground: string;
  aura: [number, number, number];
  sparks: string[];
  start: { emoji: string; title: string; subtitle: string };
  win: { emoji: string; title: string };
  lose: { emoji: string; title: string };
  foeName: string;
  bigName: string;
};

function artFor(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        hero: "/games/vampire-survivors/keira-hero-cut.png",
        foe: "/games/vampire-survivors/keira-foe-cut.png",
        gem: "/games/vampire-survivors/keira-gem-cut.png",
        ground: "/games/vampire-survivors/keira-ground.jpg",
        aura: [244, 114, 182],
        sparks: ["#f9a8d4", "#fde68a", "#c4b5fd", "#a5f3fc", "#ffffff"],
        start: {
          emoji: "🧚",
          title: "Sparkle time!",
          subtitle:
            "Touch anywhere and slide to walk. Your glow zaps grumpy clouds. Grab hearts to level up! Last 2 minutes to win.",
        },
        win: { emoji: "🌈", title: "The meadow is safe!" },
        lose: { emoji: "💜", title: "Oh no, all out of hearts!" },
        foeName: "grumpy clouds",
        bigName: "Giant grumpy cloud!",
      };
    case "luke":
      return {
        hero: "/games/vampire-survivors/luke-hero-cut.png",
        foe: "/games/vampire-survivors/luke-foe-cut.png",
        gem: "/games/vampire-survivors/luke-gem-cut.png",
        ground: "/games/vampire-survivors/luke-ground.jpg",
        aura: [56, 189, 248],
        sparks: ["#7dd3fc", "#fde047", "#86efac", "#fdba74", "#ffffff"],
        start: {
          emoji: "🦖",
          title: "Night patrol!",
          subtitle:
            "Touch anywhere and slide to walk. Your glow zaps slime bots. Grab gems to level up! Last 2 minutes to win.",
        },
        win: { emoji: "🏆", title: "You survived the night!" },
        lose: { emoji: "💥", title: "Out of hearts!" },
        foeName: "slime bots",
        bigName: "Mega slime bot!",
      };
    default: {
      const never: never = profileId;
      throw new Error(`Unknown profile: ${String(never)}`);
    }
  }
}

function newWorld(): World {
  return {
    phase: "ready",
    time: 0,
    clock: 0,
    x: W / 2,
    y: (H + TOP) / 2,
    vx: 0,
    face: 1,
    walk: 0,
    invuln: 0,
    stats: { ...START_STATS },
    level: 1,
    xp: 0,
    pulseCd: 0.6,
    pulseT: 9,
    orbitA: 0,
    foes: [],
    gems: [],
    particles: [],
    texts: [],
    spawnCd: 0,
    events: { opening: false, swarm30: false, big60: false, swarm75: false, big100: false },
    banner: null,
    shake: 0,
    hurtFlash: 0,
    score: 0,
    gemCombo: 0,
    gemComboT: 0,
    hintT: 0,
    pendingLevels: 0,
  };
}

/** Apply a level-up pick: buff, brief safety bubble, and push nearby foes back. */
function applyChoice(w: World, u: Upgrade) {
  u.apply(w.stats);
  w.texts.push({ x: w.x, y: w.y - 50, text: u.title + "!", life: 1.2, color: "#fff7ae", size: 22 });
  w.invuln = Math.max(w.invuln, 1.2);
  for (const f of w.foes) {
    const dx = f.x - w.x;
    const dy = f.y - w.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 140) {
      f.kx += (dx / d) * 160;
      f.ky += (dy / d) * 160;
    }
  }
  w.pendingLevels -= 1;
  if (w.pendingLevels <= 0) w.phase = "play";
}

const fmtTime = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

export default function VampireSurvivorsGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(newWorld());
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const keys = useRef({ up: false, down: false, left: false, right: false });
  const joy = useRef<{ id: number; ox: number; oy: number; dx: number; dy: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [choices, setChoices] = useState<Upgrade[]>([]);
  const [levelShown, setLevelShown] = useState(1);
  const [result, setResult] = useState({ time: 0, score: 0, level: 1 });
  const art = artFor(profileId);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    scoreCb.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    // Dev-only hook so scripted playtests can inspect the world.
    if (process.env.NODE_ENV === "production") return;
    const win = window as unknown as { __survivors?: typeof worldRef };
    win.__survivors = worldRef;
    return () => {
      delete win.__survivors;
    };
  }, []);

  const start = useCallback(() => {
    const w = newWorld();
    w.phase = "play";
    w.hintT = 5;
    w.banner = { text: "Go go go!", sub: `Zap the ${artFor(profileId).foeName}!`, t: 0 };
    worldRef.current = w;
    joy.current = null;
    scoreCb.current?.(0);
    setPhase("play");
    sfx("levelUp");
  }, [profileId]);

  const choose = useCallback((u: Upgrade) => {
    const w = worldRef.current;
    if (w.phase !== "levelup") return;
    applyChoice(w, u);
    sfx("star");
    haptic(20);
    if (w.pendingLevels > 0) {
      setChoices(pickTwo(w.stats));
      setLevelShown(w.level - w.pendingLevels + 1);
    } else {
      setPhase("play");
    }
  }, []);

  /* ------------------------------ main loop ------------------------------ */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pack = artFor(profileId);
    const imgs = {
      hero: loadImage(pack.hero),
      foe: loadImage(pack.foe),
      gem: loadImage(pack.gem),
      ground: loadImage(pack.ground),
    };
    let foeWhite: HTMLCanvasElement | null = null;
    let heroWhite: HTMLCanvasElement | null = null;
    const [ar, ag, ab] = pack.aura;
    const auraRgba = (a: number) => `rgba(${ar},${ag},${ab},${a})`;

    let raf = 0;
    let last = performance.now();

    const addScore = (w: World, n: number) => {
      w.score += n;
      scoreCb.current?.(w.score);
    };

    const burst = (w: World, x: number, y: number, n: number, power = 1, colors = pack.sparks) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(50, 190) * power;
        w.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(0.3, 0.7),
          max: 0.7,
          size: rand(2, 4.5),
          color: colors[i % colors.length]!,
          shape: i % 3 === 0 ? "star" : "dot",
          rot: Math.random() * 6,
        });
      }
      w.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size: 28 * power, color: "#fff", shape: "ring", rot: 0 });
      if (w.particles.length > 500) w.particles.splice(0, w.particles.length - 500);
    };

    const confetti = (w: World, n: number) => {
      for (let i = 0; i < n; i++) {
        w.particles.push({
          x: rand(0, W),
          y: rand(-80, -10),
          vx: rand(-40, 40),
          vy: rand(110, 240),
          life: rand(2, 3),
          max: 3,
          size: rand(5, 9),
          color: pack.sparks[i % pack.sparks.length]!,
          shape: "confetti",
          rot: Math.random() * 6,
        });
      }
    };

    const text = (w: World, x: number, y: number, t: string, color = "#fff", size = 18) => {
      w.texts.push({ x, y, text: t, life: 0.9, color, size });
    };

    /** Spawn at a visible spot near an edge, far enough from the hero. */
    const spawnFoe = (w: World, opts?: { big?: boolean; x?: number; y?: number }) => {
      let x = opts?.x ?? 0;
      let y = opts?.y ?? 0;
      if (opts?.x === undefined) {
        for (let tries = 0; tries < 12; tries++) {
          const edge = Math.floor(Math.random() * 4);
          const m = 26;
          if (edge === 0) [x, y] = [rand(m, W - m), TOP + m];
          else if (edge === 1) [x, y] = [W - m, rand(TOP + m, H - m)];
          else if (edge === 2) [x, y] = [rand(m, W - m), H - m];
          else [x, y] = [m, rand(TOP + m, H - m)];
          if (Math.hypot(x - w.x, y - w.y) > 170) break;
        }
      }
      const t = w.time;
      const big = !!opts?.big;
      const toughChance = clamp((t - 25) / 80, 0, 0.6);
      const hp = big ? 14 : Math.random() < toughChance ? (t > 80 && Math.random() < 0.4 ? 3 : 2) : 1;
      w.foes.push({
        x,
        y,
        hp,
        maxHp: hp,
        speed: big ? 26 : Math.min(58, 30 + t * 0.22) * rand(0.85, 1.15),
        flash: 0,
        phase: Math.random() * Math.PI * 2,
        big,
        spawn: 0,
        kx: 0,
        ky: 0,
        orbitCd: 0,
      });
      burst(w, x, y, 6, 0.5, ["#ffffff", "#e9d5ff"]);
    };

    const swarm = (w: World, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = clamp(w.x + Math.cos(a) * 200, 26, W - 26);
        const y = clamp(w.y + Math.sin(a) * 200, TOP + 26, H - 26);
        spawnFoe(w, { x, y });
      }
    };

    const killFoe = (w: World, f: Foe) => {
      f.hp = 0;
      burst(w, f.x, f.y, f.big ? 40 : 12, f.big ? 1.8 : 1);
      const n = f.big ? 8 : 1;
      for (let i = 0; i < n; i++) {
        w.gems.push({
          x: f.x + (n > 1 ? rand(-30, 30) : 0),
          y: f.y + (n > 1 ? rand(-30, 30) : 0),
          v: 0,
          pull: false,
          t: 0,
          value: 1,
        });
      }
      const pts = f.big ? 100 : 10;
      addScore(w, pts);
      text(w, f.x, f.y - 20, `+${pts}`, "#fff", f.big ? 28 : 18);
      w.shake = Math.max(w.shake, f.big ? 12 : 2);
      sfx(f.big ? "boom" : "pop", { pitch: rand(0.9, 1.3) });
      if (f.big) haptic(40);
      if (w.gems.length > 90) w.gems.splice(0, w.gems.length - 90);
    };

    const damageFoe = (w: World, f: Foe, dmg: number, fromX: number, fromY: number, push: number) => {
      if (f.hp <= 0 || f.spawn < 1) return;
      f.hp -= dmg;
      f.flash = 0.14;
      const dx = f.x - fromX;
      const dy = f.y - fromY;
      const d = Math.hypot(dx, dy) || 1;
      const k = f.big ? push * 0.3 : push;
      f.kx += (dx / d) * k;
      f.ky += (dy / d) * k;
      if (f.hp <= 0) killFoe(w, f);
    };

    const hurtHero = (w: World) => {
      if (w.invuln > 0) return;
      w.stats.hp -= 1;
      w.invuln = 1.4;
      w.hurtFlash = 0.6;
      w.shake = 10;
      burst(w, w.x, w.y, 18, 1.1, ["#fb7185", "#fecdd3", "#fff"]);
      sfx("hit");
      haptic(60);
      for (const f of w.foes) {
        const dx = f.x - w.x;
        const dy = f.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 110) {
          f.kx += (dx / d) * 220;
          f.ky += (dy / d) * 220;
        }
      }
      if (w.stats.hp <= 0) {
        w.phase = "over";
        sfx("lose");
        setResult({ time: w.time, score: w.score, level: w.level });
        setPhase("over");
      } else {
        text(w, w.x, w.y - 52, "Ouch!", "#fecdd3", 22);
      }
    };

    const step = (w: World, dt: number) => {
      w.clock += dt;
      for (const p of w.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.shape === "confetti") p.vx += Math.sin(w.clock * 4 + p.rot) * 30 * dt;
        else {
          p.vx *= 1 - dt * 3;
          p.vy *= 1 - dt * 3;
        }
        p.rot += dt * 6;
        p.life -= dt;
      }
      w.particles = w.particles.filter((p) => p.life > 0);
      for (const t of w.texts) {
        t.y -= 36 * dt;
        t.life -= dt;
      }
      w.texts = w.texts.filter((t) => t.life > 0);
      w.shake = Math.max(0, w.shake - dt * 40);
      w.hurtFlash = Math.max(0, w.hurtFlash - dt);
      if (w.banner) {
        w.banner.t += dt;
        if (w.banner.t > 2.2) w.banner = null;
      }
      if (w.phase !== "play") return;

      w.time += dt;
      if (w.hintT > 0) w.hintT -= dt;

      // Move hero: joystick or keyboard
      let mx = 0;
      let my = 0;
      const j = joy.current;
      if (j) {
        const d = Math.hypot(j.dx, j.dy);
        if (d > 5) {
          const m = Math.min(1, d / JOY_R);
          mx = (j.dx / d) * m;
          my = (j.dy / d) * m;
        }
      }
      const k = keys.current;
      const kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      const ky = (k.down ? 1 : 0) - (k.up ? 1 : 0);
      if (kx || ky) {
        const d = Math.hypot(kx, ky);
        mx = kx / d;
        my = ky / d;
      }
      const sp = w.stats.speed;
      w.x = clamp(w.x + mx * sp * dt, 22, W - 22);
      w.y = clamp(w.y + my * sp * dt, TOP + HERO_H / 2 - 6, H - HERO_H / 2 + 2);
      w.vx = mx;
      if (Math.abs(mx) > 0.15) w.face = mx > 0 ? 1 : -1;
      if (mx || my) w.walk += dt * Math.hypot(mx, my);
      w.invuln = Math.max(0, w.invuln - dt);

      // Timed events: gentle ramp with a few exciting moments.
      const ev = w.events;
      if (!ev.opening) {
        // Three foes pop in right away so there's something to do at once.
        ev.opening = true;
        for (let i = 0; i < 3; i++) spawnFoe(w);
        w.spawnCd = 2;
      }
      if (!ev.swarm30 && w.time > 30) {
        ev.swarm30 = true;
        swarm(w, 8);
        w.banner = { text: "Swarm!", sub: "Keep moving!", t: 0 };
        sfx("drop", { pitch: 0.8 });
      }
      if (!ev.big60 && w.time > 60) {
        ev.big60 = true;
        spawnFoe(w, { big: true });
        w.banner = { text: pack.bigName, sub: "It drops lots of gems!", t: 0 };
        sfx("boom", { pitch: 0.6 });
      }
      if (!ev.swarm75 && w.time > 75) {
        ev.swarm75 = true;
        swarm(w, 10);
        w.banner = { text: "Big swarm!", sub: "Zap zap zap!", t: 0 };
        sfx("drop", { pitch: 0.8 });
      }
      if (!ev.big100 && w.time > 100) {
        ev.big100 = true;
        spawnFoe(w, { big: true });
        spawnFoe(w, { big: true });
        w.banner = { text: "Almost there!", sub: "Two big ones!", t: 0 };
        sfx("boom", { pitch: 0.6 });
      }

      // Regular spawning
      w.spawnCd -= dt;
      const prog = clamp(w.time / SURVIVE, 0, 1);
      const maxFoes = Math.round(5 + prog * 15);
      if (w.spawnCd <= 0) {
        w.spawnCd = 1.35 - prog * 0.8;
        const alive = w.foes.length;
        if (alive < maxFoes) {
          spawnFoe(w);
          if (w.time > 45 && Math.random() < 0.35) spawnFoe(w);
        }
      }

      // Foes move toward hero; separate a little so they don't stack.
      for (const f of w.foes) {
        f.flash = Math.max(0, f.flash - dt);
        f.orbitCd = Math.max(0, f.orbitCd - dt);
        if (f.spawn < 1) {
          f.spawn = Math.min(1, f.spawn + dt * 2.2);
          continue;
        }
        const dx = w.x - f.x;
        const dy = w.y - f.y;
        const d = Math.hypot(dx, dy) || 1;
        f.x += (dx / d) * f.speed * dt + f.kx * dt;
        f.y += (dy / d) * f.speed * dt + f.ky * dt;
        f.kx *= 1 - Math.min(1, dt * 6);
        f.ky *= 1 - Math.min(1, dt * 6);
        f.x = clamp(f.x, 10, W - 10);
        f.y = clamp(f.y, TOP + 10, H - 10);
        const reach = HERO_R + (f.big ? FOE_R * 1.8 : FOE_R);
        if (d < reach) hurtHero(w);
        if (w.phase !== "play") return;
      }
      for (let i = 0; i < w.foes.length; i++) {
        const a = w.foes[i]!;
        for (let jx = i + 1; jx < w.foes.length; jx++) {
          const b = w.foes[jx]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const min = (a.big ? 34 : 20) + (b.big ? 34 : 20);
          if (d > 0 && d < min) {
            const push = ((min - d) / d) * 0.5;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
          }
        }
      }

      // Aura pulse
      w.pulseT += dt;
      w.pulseCd -= dt;
      if (w.pulseCd <= 0) {
        w.pulseCd = w.stats.auraEvery;
        w.pulseT = 0;
        let hit = 0;
        for (const f of w.foes) {
          const reach = w.stats.auraR + (f.big ? 26 : 10);
          if (Math.hypot(f.x - w.x, f.y - w.y) < reach) {
            damageFoe(w, f, w.stats.auraDmg, w.x, w.y, 120);
            hit += 1;
          }
        }
        sfx(hit ? "zap" : "tap", { pitch: hit ? 1.1 : 1.8 });
      }

      // Orbiting stars
      w.orbitA += dt * 3.2;
      const orbitR = w.stats.auraR + 16;
      for (let i = 0; i < w.stats.orbiters; i++) {
        const a = w.orbitA + (i * Math.PI * 2) / w.stats.orbiters;
        const ox = w.x + Math.cos(a) * orbitR;
        const oy = w.y + Math.sin(a) * orbitR;
        for (const f of w.foes) {
          if (f.hp <= 0 || f.orbitCd > 0) continue;
          if (Math.hypot(f.x - ox, f.y - oy) < (f.big ? 40 : 24)) {
            f.orbitCd = 0.45;
            damageFoe(w, f, 1, ox, oy, 180);
            sfx("bounce", { pitch: 1.5 });
          }
        }
      }
      w.foes = w.foes.filter((f) => f.hp > 0);

      // Gems: magnet pull then collect
      w.gemComboT -= dt;
      if (w.gemComboT <= 0) w.gemCombo = 0;
      for (const g of w.gems) {
        g.t += dt;
        const dx = w.x - g.x;
        const dy = w.y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        if (!g.pull && d < w.stats.magnetR) g.pull = true;
        if (g.pull) {
          g.v = Math.min(650, g.v + 900 * dt);
          const step = Math.min(d, g.v * dt);
          g.x += (dx / d) * step;
          g.y += (dy / d) * step;
        }
        if (d < 22) {
          g.t = -99;
          w.xp += g.value;
          w.gemCombo += 1;
          w.gemComboT = 0.6;
          sfx("coin", { pitch: 1 + Math.min(0.8, w.gemCombo * 0.06) });
          burst(w, w.x, w.y - 10, 4, 0.5, ["#fff", pack.sparks[0]!]);
        }
      }
      w.gems = w.gems.filter((g) => g.t >= 0);

      // Level up?
      let leveled = 0;
      while (w.xp >= xpNeeded(w.level)) {
        w.xp -= xpNeeded(w.level);
        w.level += 1;
        leveled += 1;
      }
      if (leveled > 0) {
        w.pendingLevels = leveled;
        w.phase = "levelup";
        joy.current = null;
        confetti(w, 30);
        burst(w, w.x, w.y, 30, 1.4);
        sfx("levelUp");
        haptic(30);
        setChoices(pickTwo(w.stats));
        setLevelShown(w.level - leveled + 1);
        setPhase("levelup");
        return;
      }

      // Survived!
      if (w.time >= SURVIVE) {
        w.phase = "won";
        for (const f of w.foes) burst(w, f.x, f.y, 10, 1);
        addScore(w, 100 + w.stats.hp * 20);
        w.foes = [];
        confetti(w, 100);
        sfx("win");
        setResult({ time: SURVIVE, score: w.score, level: w.level });
        setPhase("won");
      }
    };

    /* ------------------------------ drawing ------------------------------ */

    const drawGround = (w: World) => {
      const g = imgs.ground;
      if (ready(g)) {
        // cover-fit
        const s = Math.max(W / g.naturalWidth, H / g.naturalHeight);
        const dw = g.naturalWidth * s;
        const dh = g.naturalHeight * s;
        ctx.drawImage(g, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, W, H);
      }
      // Soften the painting so characters read clearly
      ctx.fillStyle = "rgba(20,10,40,0.22)";
      ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(15,5,35,0.5)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      // Drifting fireflies
      for (let i = 0; i < 14; i++) {
        const fx = ((i * 97 + w.clock * (8 + (i % 3) * 4)) % (W + 40)) - 20;
        const fy = TOP + ((i * 151) % (H - TOP)) + Math.sin(w.clock * 1.3 + i) * 12;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(w.clock * 3 + i * 2);
        ctx.fillStyle = i % 2 ? "#fef08a" : "#fff";
        ctx.beginPath();
        ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const shadow = (x: number, y: number, rx: number) => {
      ctx.fillStyle = "rgba(10,0,30,0.28)";
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawAura = (w: World) => {
      const R = w.stats.auraR;
      const breathe = 1 + Math.sin(w.clock * 3) * 0.025;
      const r = R * breathe;
      const g = ctx.createRadialGradient(w.x, w.y, r * 0.2, w.x, w.y, r);
      g.addColorStop(0, auraRgba(0.05));
      g.addColorStop(0.75, auraRgba(0.16));
      g.addColorStop(1, auraRgba(0.4));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -w.clock * 20;
      ctx.stroke();
      ctx.setLineDash([]);
      // Rim sparkles
      for (let i = 0; i < 6; i++) {
        const a = w.clock * 0.8 + (i * Math.PI) / 3;
        starPath(ctx, w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, 4, a * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }
      // Pulse ring (expands on each zap)
      if (w.pulseT < 0.45) {
        const k = w.pulseT / 0.45;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(w.x, w.y, 20 + (r - 20) * easeOutCubic(k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = auraRgba(0.25 * (1 - k));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    const drawGems = (w: World) => {
      const img = imgs.gem;
      for (const g of w.gems) {
        const bob = g.pull ? 0 : Math.sin(w.clock * 4 + g.x) * 3;
        const pop = g.t < 0.25 ? easeOutBack(g.t / 0.25) : 1;
        const s = 20 * pop;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(g.x, g.y + bob, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (ready(img)) {
          const a = img.naturalWidth / img.naturalHeight;
          drawSprite(ctx, img, g.x, g.y + bob, s * Math.min(1, a), s / Math.max(1, a), Math.sin(w.clock * 3 + g.y) * 0.15);
        }
      }
    };

    const drawFoes = (w: World) => {
      const img = imgs.foe;
      if (!ready(img)) return;
      if (!foeWhite) foeWhite = whiteSilhouette(img);
      const a = img.naturalWidth / img.naturalHeight;
      const sorted = [...w.foes].sort((p, q) => p.y - q.y);
      for (const f of sorted) {
        const size = (f.big ? FOE * 1.9 : FOE) * easeOutBack(f.spawn);
        const fw = a >= 1 ? size : size * a;
        const fh = a >= 1 ? size / a : size;
        const bounce = Math.abs(Math.sin(w.clock * 5 + f.phase)) * 5;
        const squash = Math.sin(w.clock * 10 + f.phase) * 0.06;
        const flip = w.x < f.x ? -1 : 1;
        shadow(f.x, f.y + fh / 2 - 2, fw * 0.35);
        drawSprite(ctx, img, f.x, f.y - bounce, fw, fh, Math.sin(w.clock * 3 + f.phase) * 0.1, flip * (1 + squash), 1 - squash);
        if (f.flash > 0) {
          drawSprite(ctx, foeWhite, f.x, f.y - bounce, fw, fh, 0, flip * (1 + squash), 1 - squash, 0.85);
        }
        if (f.maxHp > 1) {
          const bw = f.big ? 60 : 30;
          const y0 = f.y - fh / 2 - bounce - 10;
          roundRect(ctx, f.x - bw / 2 - 1, y0 - 1, bw + 2, 7, 3.5);
          ctx.fillStyle = "rgba(20,10,40,0.6)";
          ctx.fill();
          roundRect(ctx, f.x - bw / 2, y0, Math.max(3, (bw * f.hp) / f.maxHp), 5, 2.5);
          ctx.fillStyle = f.big ? "#f43f5e" : "#fbbf24";
          ctx.fill();
        }
      }
    };

    const drawHero = (w: World) => {
      const img = imgs.hero;
      const moving = Math.abs(w.vx) > 0.05 || joy.current || keys.current.up || keys.current.down;
      const hop = moving ? Math.abs(Math.sin(w.walk * 9)) * 6 : Math.sin(w.clock * 2.5) * 1.5;
      const squash = moving ? Math.sin(w.walk * 18) * 0.05 : Math.sin(w.clock * 2.5) * 0.02;
      shadow(w.x, w.y + HERO_H / 2 - 4, 18 - hop * 0.8);
      if (!ready(img)) return;
      if (!heroWhite) heroWhite = whiteSilhouette(img);
      const a = img.naturalWidth / img.naturalHeight;
      const blink = w.invuln > 0 && Math.floor(w.clock * 14) % 2 === 0;
      const lean = clamp(w.vx, -1, 1) * 0.12;
      drawSprite(ctx, img, w.x, w.y - hop, HERO_H * a, HERO_H, lean, w.face * (1 + squash), 1 - squash, blink ? 0.4 : 1);
      if (w.hurtFlash > 0.35) {
        drawSprite(ctx, heroWhite, w.x, w.y - hop, HERO_H * a, HERO_H, lean, w.face, 1, 0.7);
      }
    };

    const drawOrbiters = (w: World) => {
      const r = w.stats.auraR + 16;
      for (let i = 0; i < w.stats.orbiters; i++) {
        const a = w.orbitA + (i * Math.PI * 2) / w.stats.orbiters;
        const x = w.x + Math.cos(a) * r;
        const y = w.y + Math.sin(a) * r;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        starPath(ctx, x, y, 12, a * 3);
        ctx.fillStyle = "#fde047";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      }
    };

    const drawParticles = (w: World) => {
      for (const p of w.particles) {
        ctx.globalAlpha = clamp(p.life / (p.max * 0.6), 0, 1);
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
        const s = t.size * (k < 0.15 ? easeOutBack(Math.max(0, k) / 0.15) : 1);
        bigText(ctx, t.text, t.x, t.y, Math.max(1, s), t.color);
      }
      ctx.globalAlpha = 1;
    };

    const drawJoystick = () => {
      const j = joy.current;
      if (!j) return;
      const d = Math.hypot(j.dx, j.dy);
      const m = d > JOY_R ? JOY_R / d : 1;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(j.ox, j.oy, JOY_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const kx = j.ox + j.dx * m;
      const ky = j.oy + j.dy * m;
      const g = ctx.createRadialGradient(kx - 6, ky - 6, 2, kx, ky, 22);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, auraRgba(0.95));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(kx, ky, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const drawHud = (w: World) => {
      // Top band
      const band = ctx.createLinearGradient(0, 0, 0, TOP + 10);
      band.addColorStop(0, "rgba(20,8,45,0.7)");
      band.addColorStop(1, "rgba(20,8,45,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, W, TOP + 10);
      for (let i = 0; i < w.stats.maxHp; i++) {
        drawHeart(ctx, 20 + i * 24, 22, 21, i < w.stats.hp);
      }
      // Timer (center)
      const left = SURVIVE - w.time;
      const cx = W / 2 - 16;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(cx, 22, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = left < 15 ? "#fde047" : "#fff";
      ctx.beginPath();
      ctx.arc(cx, 22, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(w.time / SURVIVE, 0, 1));
      ctx.stroke();
      const urgent = left < 10 && w.phase === "play";
      const ts = urgent ? 22 + Math.sin(w.clock * 12) * 2 : 22;
      bigText(ctx, fmtTime(left), cx + 42, 23, ts, left < 15 ? "#fde047" : "#fff");
      // Level badge
      roundRect(ctx, W - 58, 9, 48, 26, 13);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.fillStyle = "#3b1d4a";
      ctx.font = `900 14px ui-rounded, "Nunito", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Lv ${w.level}`, W - 34, 23);
      // XP bar
      const need = xpNeeded(w.level);
      const bx = 12;
      const bw = W - 24;
      roundRect(ctx, bx, 42, bw, 12, 6);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
      const fillW = Math.max(12, (bw * Math.min(w.xp, need)) / need);
      roundRect(ctx, bx, 42, fillW, 12, 6);
      const xg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      xg.addColorStop(0, "#a5f3fc");
      xg.addColorStop(0.5, auraRgba(1));
      xg.addColorStop(1, "#fde68a");
      ctx.fillStyle = xg;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx, 42, bw, 12, 6);
      ctx.stroke();

      if (w.hintT > 0 && w.phase === "play") {
        ctx.globalAlpha = clamp(w.hintT, 0, 1) * (0.75 + 0.25 * Math.sin(w.clock * 6));
        bigText(ctx, "Touch & slide to walk", W / 2, H - 40, 20);
        ctx.globalAlpha = 1;
      }
      if (w.banner) {
        const t = w.banner.t;
        const inK = clamp(t / 0.45, 0, 1);
        const outK = clamp((t - 1.7) / 0.5, 0, 1);
        const s = easeOutBack(inK) * (1 - outK * 0.3);
        ctx.save();
        ctx.globalAlpha = 1 - outK;
        ctx.translate(W / 2, TOP + 70);
        ctx.scale(s, s);
        bigText(ctx, w.banner.text, 0, 0, 34, "#fff7ae", undefined, W - 28);
        bigText(ctx, w.banner.sub, 0, 34, 18, "#fff", undefined, W - 28);
        ctx.restore();
      }
      if (w.hurtFlash > 0) {
        const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7);
        v.addColorStop(0, "rgba(244,63,94,0)");
        v.addColorStop(1, `rgba(244,63,94,${w.hurtFlash})`);
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const draw = (w: World) => {
      prepareCanvas(ctx, W);
      ctx.save();
      if (w.shake > 0) ctx.translate(rand(-1, 1) * w.shake * 0.5, rand(-1, 1) * w.shake * 0.5);
      drawGround(w);
      drawAura(w);
      drawGems(w);
      // Depth-sort hero among foes loosely: foes above hero first.
      drawFoes(w);
      if (w.phase !== "over") drawHero(w);
      drawOrbiters(w);
      drawParticles(w);
      ctx.restore();
      drawHud(w);
      drawJoystick();
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

  /* ------------------------------ keyboard ------------------------------ */
  const choicesRef = useRef(choices);
  useEffect(() => {
    choicesRef.current = choices;
  }, [choices]);

  useEffect(() => {
    const map: Record<string, keyof typeof keys.current> = {
      ArrowUp: "up",
      w: "up",
      W: "up",
      ArrowDown: "down",
      s: "down",
      S: "down",
      ArrowLeft: "left",
      a: "left",
      A: "left",
      ArrowRight: "right",
      d: "right",
      D: "right",
    };
    const kd = (e: KeyboardEvent) => {
      const w = worldRef.current;
      if (w.phase === "levelup" && (e.key === "1" || e.key === "2")) {
        const u = choicesRef.current[Number(e.key) - 1];
        if (u) choose(u);
        e.preventDefault();
        return;
      }
      if ((e.key === " " || e.key === "Enter") && w.phase === "ready" && !pausedRef.current) {
        e.preventDefault();
        start();
        return;
      }
      const k = map[e.key];
      if (k) {
        keys.current[k] = true;
        e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => {
      const k = map[e.key];
      if (k) keys.current[k] = false;
    };
    const blur = () => {
      keys.current = { up: false, down: false, left: false, right: false };
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", blur);
      blur();
    };
  }, [choose, start]);

  /* ------------------------------ joystick ------------------------------ */
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pausedRef.current || worldRef.current.phase !== "play") return;
    if (joy.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = canvasPoint(e, e.currentTarget, W, H);
    joy.current = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const j = joy.current;
    if (!j || j.id !== e.pointerId) return;
    const p = canvasPoint(e, e.currentTarget, W, H);
    let dx = p.x - j.ox;
    let dy = p.y - j.oy;
    const d = Math.hypot(dx, dy);
    // Floating stick: if the finger runs past the rim, drag the base along.
    if (d > JOY_R * 1.4) {
      const over = d - JOY_R * 1.4;
      j.ox += (dx / d) * over;
      j.oy += (dy / d) * over;
      dx = p.x - j.ox;
      dy = p.y - j.oy;
    }
    j.dx = dx;
    j.dy = dy;
  };
  const endJoy = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (joy.current?.id === e.pointerId) joy.current = null;
  };

  return (
    <div className="game-root">
      <CanvasStage
        width={W}
        height={H}
        canvasRef={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
      >
        <GameOverlay
          show={phase === "ready"}
          emoji={art.start.emoji}
          title={art.start.title}
          subtitle={art.start.subtitle}
          actionLabel="Tap to start"
          onAction={start}
        />
        {phase === "levelup" && choices.length > 0 ? (
          <div className="overlay-in absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[1.4rem] bg-[var(--ink)]/45 p-4 backdrop-blur-[2px]">
            <p className="card-pop text-center text-3xl font-black text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.35)]">
              Level {levelShown}!
            </p>
            <p className="text-center text-base font-bold text-white/90">Pick one power:</p>
            <div className="flex w-full max-w-[20rem] flex-col gap-3">
              {choices.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => choose(u)}
                  className="kid-btn kid-btn-secondary card-pop min-h-24 w-full justify-start gap-3 whitespace-normal rounded-[1.5rem] px-4 text-left"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span className="text-5xl leading-none" aria-hidden>
                    {u.emoji}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-xl font-black leading-tight">{u.title}</span>
                    <span className="text-sm font-bold text-[var(--ink)]/65">{u.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <GameOverlay
          show={phase === "over"}
          emoji={art.lose.emoji}
          title={art.lose.title}
          subtitle={`You lasted ${fmtTime(result.time)} and reached level ${result.level}. Score ${result.score}!`}
          actionLabel="Play again"
          onAction={start}
          tone="lose"
        />
        <GameOverlay
          show={phase === "won"}
          emoji={art.win.emoji}
          title={art.win.title}
          subtitle={`2 whole minutes! Level ${result.level}, score ${result.score}.`}
          actionLabel="Play again"
          onAction={start}
          tone="win"
        />
      </CanvasStage>
    </div>
  );
}
