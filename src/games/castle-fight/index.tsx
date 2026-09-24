"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { CanvasStage, GameOverlay, prepareCanvas } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { castlePack, type CastlePack } from "./art";
import {
  FOE_STATS,
  FRIEND_STATS,
  HOME_HP,
  START_GOLD,
  GOLD_PER_SEC,
  GOLD_CAP,
  foeCastleHp,
  foeInterval,
  bigFoeChance,
  maxFoes,
  type Kind,
} from "./balance";

/* ------------------------------------------------------------------ */
/* Layout (game units)                                                  */
/* ------------------------------------------------------------------ */

const W = 360;
const H = 600;
const HOME_Y = 528; // path start (in front of the home gate)
const FOE_Y = 168; // path end (foe gate)
const ENGAGE = 0.06; // melee reach in path-t units
const ZAP_RANGE = 0.3;
const ZAP_EVERY = 1.4;
const ZAP_DMG = 12;
const COIN_HUD = { x: 30, y: 26 };

function pathX(t: number) {
  return W / 2 + 78 * Math.sin(t * Math.PI * 2) * (1 - 0.42 * t);
}
function pathY(t: number) {
  return HOME_Y - (HOME_Y - FOE_Y) * (1 - Math.pow(1 - t, 1.35));
}
function depth(t: number) {
  return 1 - 0.42 * t;
}
function pathDx(t: number) {
  return pathX(t + 0.01) - pathX(t - 0.01);
}

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Side = "you" | "them";
type Phase = "ready" | "play" | "winning" | "won" | "losing" | "lost";

type Unit = {
  id: number;
  side: Side;
  kind: Kind;
  t: number;
  hp: number;
  maxHp: number;
  cd: number;
  walk: number;
  face: number;
  lunge: number;
  flash: number;
  dying: number;
  lane: number;
  enter: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "dot" | "star" | "text" | "ring" | "smoke";
  text?: string;
  grav: number;
};

type FlyCoin = { x0: number; y0: number; t: number; delay: number; value: number };

type Sim = {
  phase: Phase;
  level: number;
  units: Unit[];
  parts: Particle[];
  coins: FlyCoin[];
  gold: number;
  goldFrac: number;
  homeHp: number;
  foeHp: number;
  foeMax: number;
  spawnIn: number;
  elapsed: number;
  zapCd: number;
  zapBeam: { x: number; y: number; life: number } | null;
  shake: number;
  homeFlash: number;
  foeFlash: number;
  coinBump: number;
  endTimer: number;
  hint: number;
  sent: number;
  score: number;
  levelStartScore: number;
  castleSfxCd: number;
  smokeCd: number;
  warn: number;
};

function freshSim(level: number, score: number): Sim {
  const foeMax = foeCastleHp(level);
  return {
    phase: "ready",
    level,
    units: [],
    parts: [],
    coins: [],
    gold: START_GOLD,
    goldFrac: 0,
    homeHp: HOME_HP,
    foeHp: foeMax,
    foeMax,
    spawnIn: 5,
    elapsed: 0,
    zapCd: 0,
    zapBeam: null,
    shake: 0,
    homeFlash: 0,
    foeFlash: 0,
    coinBump: 0,
    endTimer: 0,
    hint: level === 1 ? 1 : 0,
    sent: 0,
    score,
    levelStartScore: score,
    castleSfxCd: 0,
    smokeCd: 0,
    warn: 0,
  };
}

type Art = {
  bg: HTMLImageElement;
  home: HTMLImageElement;
  foeCastle: HTMLImageElement;
  small: HTMLImageElement;
  big: HTMLImageElement;
  foe: HTMLImageElement;
  coin: HTMLImageElement;
};

function img(src: string) {
  const i = new Image();
  i.decoding = "async";
  i.src = src;
  return i;
}
function ready(i: HTMLImageElement | undefined): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}

/* Seeded RNG so the painted meadow is identical every frame/resize. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Static backdrop (painted once per size into an offscreen canvas)     */
/* ------------------------------------------------------------------ */

function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  pack: CastlePack,
  bg: HTMLImageElement | undefined,
) {
  const sky = ctx.createLinearGradient(0, 0, 0, 240);
  sky.addColorStop(0, pack.sky[0]);
  sky.addColorStop(1, pack.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 260);
  if (ready(bg)) ctx.drawImage(bg, 0, 0, W, 270);

  // Meadow fades in over the lower part of the painting.
  const meadowTop = 150;
  const fade = ctx.createLinearGradient(0, meadowTop, 0, meadowTop + 110);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, pack.meadow[0]);
  ctx.fillStyle = fade;
  ctx.fillRect(0, meadowTop, W, 110);
  const meadow = ctx.createLinearGradient(0, meadowTop + 110, 0, H);
  meadow.addColorStop(0, pack.meadow[0]);
  meadow.addColorStop(1, pack.meadow[1]);
  ctx.fillStyle = meadow;
  ctx.fillRect(0, meadowTop + 109, W, H - meadowTop - 109);

  // Soft light pools on the grass.
  const r = rng(7);
  for (let i = 0; i < 7; i++) {
    const x = r() * W;
    const y = 260 + r() * 320;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 70 + r() * 60);
    g.addColorStop(0, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 140, y - 140, 280, 280);
  }

  // Winding path with perspective width.
  const edge = (t: number, side: number, extra: number) => {
    const w = (30 + extra) * depth(t);
    const dx = pathDx(t);
    const dy = pathY(t + 0.01) - pathY(t - 0.01);
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: pathX(t) + (-dy / len) * w * side,
      y: pathY(t) + (dx / len) * w * side,
    };
  };
  const band = (extra: number, color: string) => {
    ctx.beginPath();
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = -0.12 + (1.16 * i) / steps;
      const p = edge(t, 1, extra);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let i = steps; i >= 0; i--) {
      const t = -0.12 + (1.16 * i) / steps;
      const p = edge(t, -1, extra);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  band(9, "rgba(0,0,0,0.08)");
  band(6, pack.pathEdge);
  band(0, pack.path);

  // Cobbles / pebbles on the path.
  const rp = rng(11);
  for (let i = 0; i < 110; i++) {
    const t = -0.1 + rp() * 1.12;
    const s = depth(t);
    const off = (rp() - 0.5) * 50 * s;
    const x = pathX(t) + off;
    const y = pathY(t) + (rp() - 0.5) * 6;
    ctx.fillStyle = rp() < 0.5 ? pack.pathEdge : "rgba(255,255,255,0.45)";
    ctx.globalAlpha = 0.35 + rp() * 0.3;
    ctx.beginPath();
    ctx.ellipse(x, y, (2 + rp() * 3.5) * s, (1.2 + rp() * 2) * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Grass tufts & flowers away from the path.
  const rf = rng(23);
  for (let i = 0; i < 170; i++) {
    const y = 215 + rf() * 385;
    const x = rf() * W;
    const tApprox = Math.min(1, Math.max(0, (HOME_Y - y) / (HOME_Y - FOE_Y)));
    if (Math.abs(x - pathX(tApprox)) < 44 * depth(tApprox)) continue;
    const s = 0.55 + ((y - 215) / 385) * 0.8;
    if (rf() < 0.55) {
      ctx.strokeStyle = pack.tuft;
      ctx.lineWidth = 1.6 * s;
      ctx.lineCap = "round";
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(x + b * 2 * s, y);
        ctx.quadraticCurveTo(x + b * 3 * s, y - 5 * s, x + b * 5 * s, y - 8 * s);
        ctx.stroke();
      }
    } else {
      const c = pack.flowers[Math.floor(rf() * pack.flowers.length)];
      ctx.fillStyle = c;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 2.6 * s, y + Math.sin(a) * 2.6 * s, 2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fcd34d";
      ctx.beginPath();
      ctx.arc(x, y, 1.5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Gentle vignette at the bottom corners.
  const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, H * 0.8);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(40,20,60,0.18)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

/* ------------------------------------------------------------------ */
/* Drawing helpers                                                      */
/* ------------------------------------------------------------------ */

function roundRect(
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

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: string,
) {
  roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(40,20,50,0.35)";
  ctx.fill();
  const f = Math.max(0, Math.min(1, frac));
  if (f > 0) {
    roundRect(ctx, x, y, Math.max(h, w * f), h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
    roundRect(ctx, x + 2, y + 1.5, Math.max(0, w * f - 4), h * 0.32, h / 4);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function CastleFightGame({ profileId, paused, onScoreChange }: GameProps) {
  const pack = castlePack(profileId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim>(freshSim(1, 0));
  const artRef = useRef<Partial<Art>>({});
  const bgRef = useRef<{ canvas: HTMLCanvasElement; w: number; ok: boolean } | null>(null);
  const pausedRef = useRef(paused);
  const idRef = useRef(1);
  const scoreCb = useRef(onScoreChange);
  const fontRef = useRef("system-ui, sans-serif");

  const [phase, setPhase] = useState<Phase>("ready");
  const [gold, setGold] = useState(START_GOLD);
  const [level, setLevel] = useState(1);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    scoreCb.current = onScoreChange;
  }, [onScoreChange]);

  useEffect(() => {
    onScoreChange?.(0);
    fontRef.current = getComputedStyle(document.body).fontFamily || fontRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report 0 once on mount
  }, []);

  // Load art for this profile.
  useEffect(() => {
    const a: Partial<Art> = {
      bg: img(pack.battlefield),
      home: img(pack.homeCastle),
      foeCastle: img(pack.foeCastle),
      small: img(pack.small),
      big: img(pack.big),
      foe: img(pack.foe),
      coin: img(pack.coin),
    };
    artRef.current = a;
    bgRef.current = null;
    a.bg?.addEventListener("load", () => {
      bgRef.current = null;
    });
  }, [pack]);

  /* ---------------- actions ---------------- */

  const addScore = useCallback((n: number) => {
    const s = simRef.current;
    s.score += n;
    scoreCb.current?.(s.score);
  }, []);

  const burst = useCallback(
    (x: number, y: number, n: number, colors: string[], opts?: Partial<Particle>) => {
      const s = simRef.current;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 110;
        s.parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          life: 0,
          max: 0.45 + Math.random() * 0.35,
          size: 2 + Math.random() * 3,
          color: colors[i % colors.length],
          kind: "dot",
          grav: 260,
          ...opts,
        });
      }
    },
    [],
  );

  const floatText = useCallback((x: number, y: number, text: string, color: string, size = 18) => {
    simRef.current.parts.push({
      x,
      y,
      vx: 0,
      vy: -46,
      life: 0,
      max: 0.9,
      size,
      color,
      kind: "text",
      text,
      grav: 0,
    });
  }, []);

  const spawnUnit = useCallback((side: Side, kind: Kind) => {
    const s = simRef.current;
    const st = side === "you" ? FRIEND_STATS[kind] : FOE_STATS(s.level)[kind];
    s.units.push({
      id: idRef.current++,
      side,
      kind,
      t: side === "you" ? 0 : 1,
      hp: st.hp,
      maxHp: st.hp,
      cd: 0.3,
      walk: Math.random() * 6,
      face: side === "you" ? 1 : -1,
      lunge: 0,
      flash: 0,
      dying: 0,
      lane: (Math.random() - 0.5) * 22,
      enter: 0,
    });
  }, []);

  const send = useCallback(
    (kind: Kind) => {
      const s = simRef.current;
      if (pausedRef.current || s.phase !== "play") return;
      const cost = FRIEND_STATS[kind].cost;
      if (s.gold < cost) {
        sfx("miss");
        return;
      }
      s.gold -= cost;
      setGold(Math.floor(s.gold));
      spawnUnit("you", kind);
      s.sent += 1;
      if (s.hint > 0) s.hint = Math.min(s.hint, 0.99);
      burst(pathX(0), pathY(0) - 20, 16, ["#fff", "#fde68a", pack.zap], {
        kind: "star",
        grav: 60,
      });
      floatText(COIN_HUD.x + 40, COIN_HUD.y + 28, `-${cost}`, "#fff", 15);
      sfx("pop", { pitch: kind === "big" ? 0.7 : 1.1 });
      haptic(10);
    },
    [burst, floatText, pack.zap, spawnUnit],
  );

  const begin = useCallback(
    (lvl: number, keepScore: boolean) => {
      const prev = simRef.current;
      const score = keepScore ? prev.score : prev.levelStartScore;
      simRef.current = freshSim(lvl, score);
      simRef.current.phase = "play";
      scoreCb.current?.(score);
      setLevel(lvl);
      setGold(START_GOLD);
      setPhase("play");
      sfx(lvl > 1 ? "levelUp" : "tap");
    },
    [],
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const s = simRef.current;
      if (e.key === "1" || e.key === "ArrowLeft" || e.key === "a") {
        send("small");
        e.preventDefault();
      } else if (e.key === "2" || e.key === "ArrowRight" || e.key === "d") {
        send("big");
        e.preventDefault();
      } else if ((e.key === " " || e.key === "Enter") && !pausedRef.current) {
        if (s.phase === "ready") begin(s.level, true);
        else if (s.phase === "won") begin(s.level + 1, true);
        else if (s.phase === "lost") begin(s.level, false);
        else return;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [begin, send]);

  /* ---------------- main loop ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let shownGold = -1;

    const killUnit = (u: Unit) => {
      const s = simRef.current;
      u.dying = 0.0001;
      const x = pathX(u.t) + u.lane * depth(u.t);
      const y = pathY(u.t) - 26 * depth(u.t);
      if (u.side === "them") {
        const reward = FOE_STATS(s.level)[u.kind].reward;
        for (let i = 0; i < reward; i++) {
          s.coins.push({ x0: x + (Math.random() - 0.5) * 20, y0: y, t: 0, delay: i * 0.08, value: 1 });
        }
        burst(x, y, 18, ["#fde68a", "#fff", "#fca5a5", pack.zap], { kind: "star", grav: 120 });
        floatText(x, y - 18, u.kind === "big" ? "BIG POW!" : "POW!", "#fde047", u.kind === "big" ? 22 : 18);
        addScore(u.kind === "big" ? 10 : 5);
        sfx("pop", { pitch: 0.8 });
      } else {
        burst(x, y, 12, ["#fff", "#e9d5ff", "#cbd5e1"], { kind: "smoke", grav: -30 });
        sfx("miss", { pitch: 1.2 });
      }
    };

    const hitCastle = (side: Side, dmg: number, x: number, y: number) => {
      const s = simRef.current;
      if (side === "them") {
        s.foeHp = Math.max(0, s.foeHp - dmg);
        s.foeFlash = 1;
        s.shake = Math.max(s.shake, 3);
        addScore(dmg);
        floatText(x, y - 10, `-${dmg}`, "#fff", 16);
        burst(x, y, 8, ["#a8a29e", "#d6d3d1", "#fde68a"], { grav: 300 });
        if (s.castleSfxCd <= 0) {
          sfx("boom", { pitch: 1.4 });
          s.castleSfxCd = 0.25;
        }
      } else {
        s.homeHp = Math.max(0, s.homeHp - dmg);
        s.homeFlash = 1;
        s.shake = Math.max(s.shake, 4);
        floatText(x, y - 10, `-${dmg}`, "#fecaca", 16);
        burst(x, y, 8, ["#a8a29e", "#fecaca"], { grav: 300 });
        sfx("hit", { pitch: 0.6 });
        haptic(20);
      }
    };

    const update = (dt: number) => {
      const s = simRef.current;
      s.shake = Math.max(0, s.shake - dt * 14);
      s.homeFlash = Math.max(0, s.homeFlash - dt * 4);
      s.foeFlash = Math.max(0, s.foeFlash - dt * 4);
      s.coinBump = Math.max(0, s.coinBump - dt * 4);
      s.castleSfxCd -= dt;
      if (s.warn > 0) s.warn = Math.max(0, s.warn - dt);
      if (s.hint > 0 && s.hint < 1) s.hint = Math.max(0, s.hint - dt * 2);

      // particles
      for (const p of s.parts) {
        p.life += dt;
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind !== "text") {
          p.vx *= 1 - dt * 1.5;
        }
      }
      s.parts = s.parts.filter((p) => p.life < p.max);

      // flying coins → HUD
      for (const c of s.coins) {
        if (c.delay > 0) {
          c.delay -= dt;
          continue;
        }
        c.t += dt * 1.6;
        if (c.t >= 1) {
          s.gold = Math.min(GOLD_CAP, s.gold + c.value);
          s.coinBump = 1;
          sfx("coin", { pitch: 1 + Math.random() * 0.2 });
        }
      }
      s.coins = s.coins.filter((c) => c.t < 1);

      if (s.phase === "winning" || s.phase === "losing") {
        s.endTimer += dt;
        const cx = W / 2;
        if (Math.random() < dt * 22) {
          const y = s.phase === "winning" ? 130 : 540;
          burst(cx + (Math.random() - 0.5) * 120, y + Math.random() * 30, 3, ["#d6d3d1", "#a8a29e", "#fff"], {
            kind: "smoke",
            grav: -40,
            size: 6,
          });
          s.shake = Math.max(s.shake, 2.5);
        }
        if (s.phase === "winning" && Math.random() < dt * 10) {
          burst(40 + Math.random() * (W - 80), 60 + Math.random() * 120, 10, ["#f472b6", "#fde047", "#60a5fa", "#34d399", "#fff"], {
            kind: "star",
            grav: 140,
          });
        }
        if (s.endTimer > 1.6) {
          s.phase = s.phase === "winning" ? "won" : "lost";
          setPhase(s.phase);
          if (s.phase === "won") sfx("win");
          else sfx("lose");
        }
        for (const u of s.units) if (u.dying > 0) u.dying += dt;
        s.units = s.units.filter((u) => u.dying === 0 || u.dying < 0.5);
        return;
      }
      if (s.phase !== "play") return;

      s.elapsed += dt;

      // income
      s.goldFrac += GOLD_PER_SEC * dt;
      if (s.goldFrac >= 1) {
        const whole = Math.floor(s.goldFrac);
        s.goldFrac -= whole;
        s.gold = Math.min(GOLD_CAP, s.gold + whole);
      }

      // enemy AI
      s.spawnIn -= dt;
      const foesAlive = s.units.filter((u) => u.side === "them" && u.dying === 0).length;
      if (s.spawnIn <= 0) {
        if (foesAlive < maxFoes(s.level)) {
          const big = Math.random() < bigFoeChance(s.level, s.elapsed);
          spawnUnit("them", big ? "big" : "small");
          if (s.elapsed < 8) s.warn = 1.6;
          sfx("zap", { pitch: big ? 0.45 : 0.7 });
        }
        s.spawnIn = foeInterval(s.level, s.elapsed) * (0.85 + Math.random() * 0.3);
      }

      // units
      const alive = s.units.filter((u) => u.dying === 0);
      for (const u of s.units) {
        if (u.dying > 0) {
          u.dying += dt;
          continue;
        }
        u.enter = Math.min(1, u.enter + dt * 3);
        u.lunge = Math.max(0, u.lunge - dt * 5);
        u.flash = Math.max(0, u.flash - dt * 5);
        const you = u.side === "you";
        const st = you ? FRIEND_STATS[u.kind] : FOE_STATS(s.level)[u.kind];
        let target: Unit | null = null;
        let best = Infinity;
        for (const o of alive) {
          if (o.side === u.side || o.dying > 0) continue;
          const d = you ? o.t - u.t : u.t - o.t;
          if (d > -0.02 && d < ENGAGE && d < best) {
            best = d;
            target = o;
          }
        }
        const dir = you ? 1 : -1;
        let wantFace = Math.sign(pathDx(u.t) * dir) || u.face;
        u.cd -= dt;
        if (target) {
          const tx = pathX(target.t) + target.lane * depth(target.t);
          const ux = pathX(u.t) + u.lane * depth(u.t);
          if (Math.abs(tx - ux) > 4) wantFace = Math.sign(tx - ux);
          if (u.cd <= 0) {
            u.cd = st.rate;
            u.lunge = 1;
            target.hp -= st.dmg;
            target.flash = 1;
            const hx = (tx + ux) / 2;
            const hy = pathY((u.t + target.t) / 2) - 28 * depth(target.t);
            burst(hx, hy, 6, ["#fff", "#fde68a", you ? "#86efac" : "#fca5a5"], { kind: "star", grav: 80, max: 0.4 });
            s.parts.push({ x: hx, y: hy, vx: 0, vy: 0, life: 0, max: 0.25, size: 18, color: "#fff", kind: "ring", grav: 0 });
            sfx("hit", { pitch: 0.9 + Math.random() * 0.4 });
            if (target.hp <= 0) killUnit(target);
          }
        } else if ((you && u.t >= 1) || (!you && u.t <= 0)) {
          // at the gate: bash the castle
          u.t = you ? 1 : 0;
          if (u.cd <= 0) {
            u.cd = st.rate;
            u.lunge = 1;
            hitCastle(you ? "them" : "you", st.castle, pathX(u.t) + u.lane, pathY(u.t) - 34);
          }
        } else {
          u.t += dir * st.speed * dt;
          u.walk += dt * 9;
        }
        u.face += (wantFace - u.face) * Math.min(1, dt * 10);
      }
      s.units = s.units.filter((u) => u.dying === 0 || u.dying < 0.5);

      // home castle zaps nearby foes (keeps it forgiving)
      s.zapCd -= dt;
      if (s.zapBeam) {
        s.zapBeam.life -= dt;
        if (s.zapBeam.life <= 0) s.zapBeam = null;
      }
      if (s.zapCd <= 0) {
        const near = s.units
          .filter((u) => u.side === "them" && u.dying === 0 && u.t < ZAP_RANGE)
          .sort((a, b) => a.t - b.t)[0];
        if (near) {
          s.zapCd = ZAP_EVERY;
          near.hp -= ZAP_DMG;
          near.flash = 1;
          const x = pathX(near.t) + near.lane * depth(near.t);
          const y = pathY(near.t) - 26 * depth(near.t);
          s.zapBeam = { x, y, life: 0.22 };
          burst(x, y, 10, ["#fff", pack.zap, "#fde68a"], { kind: "star", grav: 40 });
          sfx("zap", { pitch: 1.3 });
          if (near.hp <= 0) killUnit(near);
        }
      }

      // damage smoke
      s.smokeCd -= dt;
      if (s.smokeCd <= 0) {
        s.smokeCd = 0.35;
        if (s.foeHp / s.foeMax < 0.5) {
          burst(W / 2 + (Math.random() - 0.5) * 60, 70 + Math.random() * 40, 1, ["#d6d3d1"], {
            kind: "smoke",
            grav: -50,
            size: 7,
            max: 1.2,
          });
        }
        if (s.homeHp / HOME_HP < 0.5) {
          burst(W / 2 + (Math.random() - 0.5) * 80, 460 + Math.random() * 40, 1, ["#d6d3d1"], {
            kind: "smoke",
            grav: -50,
            size: 7,
            max: 1.2,
          });
        }
      }

      // end states
      if (s.foeHp <= 0) {
        s.phase = "winning";
        s.endTimer = 0;
        addScore(50);
        for (const u of s.units) if (u.side === "them" && u.dying === 0) killUnit(u);
        sfx("boom", { pitch: 0.8 });
        setPhase("winning");
      } else if (s.homeHp <= 0) {
        s.phase = "losing";
        s.endTimer = 0;
        for (const u of s.units) if (u.side === "you" && u.dying === 0) killUnit(u);
        sfx("boom", { pitch: 0.6 });
        setPhase("losing");
      }
    };

    const drawUnit = (u: Unit, now: number) => {
      const art = artRef.current;
      const s = simRef.current;
      const im = u.side === "them" ? art.foe : u.kind === "big" ? art.big : art.small;
      const d = depth(u.t);
      const baseH = (u.side === "you" ? FRIEND_STATS[u.kind] : FOE_STATS(s.level)[u.kind]).size;
      const h = baseH * d * (0.4 + 0.6 * u.enter);
      const x = pathX(u.t) + u.lane * d;
      const y = pathY(u.t) + 4 * d;
      const moving = u.lunge === 0 && u.flash === 0;
      const bob = moving ? Math.abs(Math.sin(u.walk)) * 5 * d : 0;
      const squash = 1 + Math.sin(u.walk * 2) * 0.05;
      const dieK = u.dying > 0 ? Math.min(1, u.dying / 0.5) : 0;
      const lungeDx = Math.sin(u.lunge * Math.PI) * 9 * d * Math.sign(u.face || 1);

      // shadow + team ring
      ctx.save();
      ctx.globalAlpha = 1 - dieK;
      ctx.fillStyle = "rgba(30,20,40,0.22)";
      ctx.beginPath();
      ctx.ellipse(x, y, h * 0.36, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = u.side === "you" ? "rgba(34,197,94,0.75)" : "rgba(239,68,68,0.75)";
      ctx.lineWidth = 2.2 * d;
      ctx.beginPath();
      ctx.ellipse(x, y, h * 0.34, h * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (ready(im)) {
        const iw = (im.naturalWidth / im.naturalHeight) * h;
        ctx.save();
        ctx.translate(x + lungeDx, y - bob);
        ctx.rotate((moving ? Math.sin(u.walk) * 0.07 : -u.lunge * 0.15 * Math.sign(u.face || 1)) + dieK * 1.2 * Math.sign(u.face || 1));
        const sc = 1 - dieK * 0.6;
        ctx.scale(u.face * sc / squash, squash * sc);
        ctx.globalAlpha = 1 - dieK;
        ctx.drawImage(im, -iw / 2, -h, iw, h);
        if (u.flash > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = u.flash * 0.6 * (1 - dieK);
          ctx.drawImage(im, -iw / 2, -h, iw, h);
        }
        ctx.restore();
      }

      if (u.dying === 0) {
        const bw = Math.max(26, 40 * d);
        drawBar(ctx, x - bw / 2, y - h - 10 * d - bob, bw, 5, u.hp / u.maxHp, u.side === "you" ? "#22c55e" : "#ef4444");
      }
      void now;
    };

    const draw = (now: number) => {
      const s = simRef.current;
      const art = artRef.current;
      const k = prepareCanvas(ctx, W);
      const font = fontRef.current;

      // backdrop cache
      const bgW = canvas.width;
      if (!bgRef.current || bgRef.current.w !== bgW || (!bgRef.current.ok && ready(art.bg))) {
        const off = document.createElement("canvas");
        off.width = canvas.width;
        off.height = canvas.height;
        const octx = off.getContext("2d");
        if (octx) {
          octx.setTransform(k, 0, 0, k, 0, 0);
          paintBackdrop(octx, pack, art.bg);
        }
        bgRef.current = { canvas: off, w: bgW, ok: ready(art.bg) };
      }

      ctx.save();
      if (s.shake > 0) {
        ctx.translate((Math.random() - 0.5) * s.shake * 2, (Math.random() - 0.5) * s.shake * 2);
      }
      ctx.drawImage(bgRef.current.canvas, -4, -4, W + 8, H + 8);

      // foe castle
      if (ready(art.foeCastle)) {
        const sink = s.phase === "winning" || s.phase === "won" ? Math.min(1, s.endTimer / 1.4) : 0;
        const cw = 168;
        const ch = (art.foeCastle.naturalHeight / art.foeCastle.naturalWidth) * cw;
        const bottom = FOE_Y + 6;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, bottom + 2);
        ctx.clip();
        const wob = s.foeFlash * Math.sin(now / 25) * 2;
        ctx.translate(W / 2 + wob, bottom + sink * ch * 0.85);
        ctx.rotate(sink * 0.08);
        ctx.drawImage(art.foeCastle, -cw / 2, -ch, cw, ch);
        if (s.foeFlash > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = s.foeFlash * 0.45;
          ctx.drawImage(art.foeCastle, -cw / 2, -ch, cw, ch);
        }
        ctx.restore();
      }

      // units, far → near
      const sorted = [...s.units].sort((a, b) => pathY(a.t) - pathY(b.t));
      for (const u of sorted) drawUnit(u, now);

      // home castle (nearest, drawn last so friends step out of the gate)
      if (ready(art.home)) {
        const sink = s.phase === "losing" || s.phase === "lost" ? Math.min(1, s.endTimer / 1.4) : 0;
        const cw = 176;
        const ch = (art.home.naturalHeight / art.home.naturalWidth) * cw;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.clip();
        const wob = s.homeFlash * Math.sin(now / 25) * 2;
        ctx.translate(W / 2 + wob, H + 10 + sink * ch * 0.8);
        ctx.rotate(-sink * 0.08);
        ctx.globalAlpha = 1;
        // front units walking out should stay visible — draw castle slightly translucent near the gate? keep solid.
        ctx.drawImage(art.home, -cw / 2, -ch, cw, ch);
        if (s.homeFlash > 0) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = s.homeFlash * 0.4;
          ctx.drawImage(art.home, -cw / 2, -ch, cw, ch);
        }
        ctx.restore();
      }
      // freshly sent units still emerging are drawn again on top of the castle
      for (const u of sorted) if (u.side === "you" && u.t < 0.12 && u.dying === 0) drawUnit(u, now);

      // zap beam
      if (s.zapBeam) {
        const a = s.zapBeam.life / 0.22;
        ctx.save();
        ctx.strokeStyle = pack.zap;
        ctx.globalAlpha = a;
        ctx.lineWidth = 6 * a + 2;
        ctx.lineCap = "round";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        const sx = W / 2 + 40;
        const sy = 470;
        ctx.moveTo(sx, sy);
        const mx = (sx + s.zapBeam.x) / 2 + (Math.random() - 0.5) * 20;
        const my = (sy + s.zapBeam.y) / 2 + (Math.random() - 0.5) * 20;
        ctx.lineTo(mx, my);
        ctx.lineTo(s.zapBeam.x, s.zapBeam.y);
        ctx.stroke();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // particles
      for (const p of s.parts) {
        const f = 1 - p.life / p.max;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, f * 1.4));
        ctx.fillStyle = p.color;
        if (p.kind === "star") {
          star(ctx, p.x, p.y, p.size * 1.3, p.life * 6);
        } else if (p.kind === "text") {
          const sc = p.life < 0.12 ? 0.6 + (p.life / 0.12) * 0.6 : 1.2 - Math.min(0.2, p.life);
          ctx.font = `900 ${p.size * sc}px ${font}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(60,20,70,0.85)";
          ctx.lineJoin = "round";
          ctx.strokeText(p.text ?? "", p.x, p.y);
          ctx.fillText(p.text ?? "", p.x, p.y);
        } else if (p.kind === "ring") {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * f;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.2 - f), 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === "smoke") {
          ctx.globalAlpha = f * 0.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - f), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * f + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // flying coins
      if (ready(art.coin)) {
        for (const c of s.coins) {
          if (c.delay > 0) continue;
          const t = c.t;
          const e = t * t * (3 - 2 * t);
          const x = c.x0 + (COIN_HUD.x - c.x0) * e;
          const y = c.y0 + (COIN_HUD.y - c.y0) * e - Math.sin(t * Math.PI) * 60;
          const sz = 18 + Math.sin(t * Math.PI) * 6;
          ctx.drawImage(art.coin, x - sz / 2, y - sz / 2, sz, sz);
        }
      }
      ctx.restore();

      /* ---- HUD ---- */
      // coins pill
      const bump = 1 + s.coinBump * 0.18;
      ctx.save();
      ctx.translate(COIN_HUD.x, COIN_HUD.y);
      ctx.scale(bump, bump);
      roundRect(ctx, -20, -17, 104, 34, 17);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = "transparent";
      if (ready(art.coin)) ctx.drawImage(art.coin, -17, -14, 28, 28);
      ctx.fillStyle = "#3b1d4a";
      ctx.font = `900 21px ${font}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(Math.floor(s.gold)), 16, 1.5);
      ctx.restore();

      // level pill
      ctx.save();
      roundRect(ctx, W - 76, 9, 68, 34, 17);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fill();
      ctx.fillStyle = "#3b1d4a";
      ctx.font = `900 16px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Lv ${s.level}`, W - 42, 27);
      ctx.restore();

      // castle HP bars
      drawBar(ctx, W / 2 - 58, 16, 116, 14, s.foeHp / s.foeMax, "#ef4444");
      drawBar(ctx, W / 2 - 66, H - 22, 132, 14, s.homeHp / HOME_HP, "#22c55e");
      ctx.save();
      ctx.font = `900 11px ${font}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(60,20,70,0.8)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeText("THEIR CASTLE", W / 2, 39);
      ctx.fillText("THEIR CASTLE", W / 2, 39);
      ctx.strokeText("YOUR CASTLE", W / 2, H - 30);
      ctx.fillText("YOUR CASTLE", W / 2, H - 30);
      ctx.restore();

      // "here they come" warning & first-send hint
      if (s.warn > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.warn * 2);
        ctx.font = `900 18px ${font}`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#b91c1c";
        ctx.lineWidth = 5;
        ctx.lineJoin = "round";
        const y = 205 + Math.sin(now / 120) * 2;
        ctx.strokeText("Here they come!", W / 2, y);
        ctx.fillText("Here they come!", W / 2, y);
        ctx.restore();
      }
      if (s.phase === "play" && s.hint > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.hint);
        const y = H - 56 + Math.sin(now / 160) * 5;
        roundRect(ctx, W / 2 - 118, y - 44, 236, 36, 18);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();
        ctx.fillStyle = "#3b1d4a";
        ctx.font = `900 16px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Tap a button below to send!", W / 2, y - 26);
        ctx.beginPath();
        ctx.moveTo(W / 2 - 10, y - 8);
        ctx.lineTo(W / 2 + 10, y - 8);
        ctx.lineTo(W / 2, y + 4);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();
        ctx.restore();
      }

      const g = Math.floor(s.gold);
      if (g !== shownGold) {
        shownGold = g;
        setGold(g);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (pausedRef.current) return;
      update(dt);
      draw(now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [addScore, burst, floatText, pack, spawnUnit]);

  /* ---------------- UI ---------------- */

  const playing = phase === "play";
  const kinds: Kind[] = ["small", "big"];

  return (
    <div className="game-root">
      <CanvasStage width={W} height={H} canvasRef={canvasRef}>
        <GameOverlay
          show={phase === "ready"}
          emoji="🏰"
          title={level > 1 ? `Level ${level}` : pack.startTitle}
          subtitle={pack.startCopy}
          actionLabel="Play!"
          onAction={() => begin(level, true)}
        />
        <GameOverlay
          show={phase === "won"}
          tone="win"
          emoji="🎉"
          title={`Level ${level} won!`}
          subtitle={pack.winCopy}
          actionLabel={`Level ${level + 1} →`}
          onAction={() => begin(level + 1, true)}
        />
        <GameOverlay
          show={phase === "lost"}
          tone="lose"
          emoji="🙈"
          title="Oh no!"
          subtitle={pack.loseCopy}
          actionLabel="Try again"
          onAction={() => begin(level, false)}
        />
      </CanvasStage>
      <div className="grid w-full max-w-md shrink-0 grid-cols-2 gap-3 px-1 pb-1">
        {kinds.map((kind) => {
          const cost = FRIEND_STATS[kind].cost;
          const afford = gold >= cost;
          const pct = Math.min(100, (gold / cost) * 100);
          return (
            <button
              key={kind}
              type="button"
              disabled={!playing || paused || !afford}
              onPointerDown={(e) => {
                e.preventDefault();
                send(kind);
              }}
              onClick={(e) => {
                // keyboard activation (Enter/Space on a focused button)
                if (e.detail === 0) send(kind);
              }}
              aria-label={`Send ${kind === "small" ? pack.smallName : pack.bigName} for ${cost} coins`}
              className={cn(
                "kid-btn relative min-h-[76px] overflow-hidden !px-2 !py-1.5",
                afford && playing ? "kid-btn-primary" : "kid-btn-secondary",
                "disabled:!opacity-100",
              )}
            >
              {!afford && playing ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-[var(--accent)]/25 transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              ) : null}
              <span className={cn("relative flex w-full items-center gap-2", !afford && "opacity-60 grayscale-[60%]")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={kind === "small" ? pack.small : pack.big}
                  alt=""
                  draggable={false}
                  className={cn("h-14 w-14 shrink-0 object-contain drop-shadow", afford && playing && "float-slow")}
                />
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className="truncate text-lg font-black">
                    {kind === "small" ? pack.smallName : pack.bigName}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-base font-black text-[var(--ink)] shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={pack.coin} alt="" className="h-5 w-5" draggable={false} />
                    {cost}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
