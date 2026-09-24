"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";
import {
  CanvasStage,
  GameOverlay,
  PadButton,
  canvasPoint,
} from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import {
  BALL_R,
  FLIPPERS,
  H,
  LANE_X,
  PLUNGER_Y,
  W,
  buildTable,
  flipperTip,
  resolveContact,
  closestOnSegment,
  type Ball,
} from "@/games/pinball/physics";
import { skinFor, drawStaticTable, type Skin } from "@/games/pinball/skin";

type Phase = "ready" | "playing" | "over";
type BallState = "lane" | "live" | "drained";

type Pop = { x: number; y: number; text: string; life: number; color: string; big: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

const STEP = 1 / 480;
const MAX_SPEED = 1500;
const GRAVITY = 820;
const BALL_SAVE_S = 10;
const BALLS = 3;
const FLIP_UP_SPEED = 26;
const FLIP_DOWN_SPEED = 16;

function copyFor(profileId: ProfileId) {
  switch (profileId) {
    case "keira":
      return { emoji: "🦄", saved: "Ball saved!", ballWord: "sparkle ball" };
    case "luke":
      return { emoji: "🚀", saved: "Ball saved!", ballWord: "rocket ball" };
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export default function PinballGame({ profileId, paused, onScoreChange }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = PROFILES[profileId];
  const copy = useMemo(() => copyFor(profileId), [profileId]);
  const skin = useMemo<Skin>(() => skinFor(profileId), [profileId]);
  const table = useMemo(() => buildTable(), []);

  const [phase, setPhase] = useState<Phase>("ready");
  const [laneReady, setLaneReady] = useState(true);
  const [final, setFinal] = useState(0);

  // Mutable game state lives in refs; React only mirrors what the DOM needs.
  const g = useRef({
    phase: "ready" as Phase,
    ball: { x: LANE_X, y: PLUNGER_Y, vx: 0, vy: 0, spin: 0 } as Ball,
    state: "lane" as BallState,
    balls: BALLS,
    score: 0,
    mult: 1,
    saveUntil: 0,
    time: 0,
    charge: 0,
    charging: false,
    drainT: 0,
    stillT: 0,
    lanes: [false, false, false],
    targets: [false, false, false],
    bumperFlash: [0, 0, 0],
    slingFlash: [0, 0],
    targetFlash: [0, 0, 0],
    left: { angle: FLIPPERS[0].rest, omega: 0, held: false },
    right: { angle: FLIPPERS[1].rest, omega: 0, held: false },
    trail: [] as { x: number; y: number }[],
    pops: [] as Pop[],
    sparks: [] as Spark[],
    shake: 0,
    banner: "",
    bannerT: 0,
  });
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const pointers = useRef(new Map<number, "left" | "right" | "plunger">());
  const images = useRef<{ ball?: HTMLImageElement; bumper?: HTMLImageElement }>({});

  useEffect(() => {
    pausedRef.current = paused;
    scoreCb.current = onScoreChange;
    if (paused) {
      // Let go of everything so nothing is stuck "held" after resuming.
      g.current.left.held = false;
      g.current.right.held = false;
      g.current.charging = false;
      pointers.current.clear();
    }
  }, [paused, onScoreChange]);

  useEffect(() => {
    scoreCb.current?.(0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    images.current = {};
    Promise.all([loadImage(skin.ball), loadImage(skin.bumper)])
      .then(([ball, bumper]) => {
        if (!cancelled) images.current = { ball, bumper };
      })
      .catch(() => {
        /* drawn fallbacks */
      });
    return () => {
      cancelled = true;
    };
  }, [skin]);

  /* ---------------- game actions ---------------- */

  const addScore = useCallback((n: number, x: number, y: number, color?: string, big = false) => {
    const s = g.current;
    const pts = n * s.mult;
    s.score += pts;
    s.pops.push({ x, y, text: `+${pts}`, life: 1, color: color ?? "#ffffff", big });
    scoreCb.current?.(s.score);
  }, []);

  const toLane = useCallback(() => {
    const s = g.current;
    s.state = "lane";
    s.ball = { x: LANE_X, y: PLUNGER_Y, vx: 0, vy: 0, spin: 0 };
    s.charge = 0;
    s.charging = false;
    s.trail = [];
    setLaneReady(true);
  }, []);

  const start = useCallback(() => {
    const s = g.current;
    s.phase = "playing";
    s.balls = BALLS;
    s.score = 0;
    s.mult = 1;
    s.lanes = [false, false, false];
    s.targets = [false, false, false];
    s.pops = [];
    s.sparks = [];
    s.banner = "Ball 1";
    s.bannerT = 1.4;
    scoreCb.current?.(0);
    toLane();
    setPhase("playing");
    sfx("levelUp");
  }, [toLane]);

  const launch = useCallback(() => {
    const s = g.current;
    if (s.phase !== "playing" || s.state !== "lane") return;
    const p = Math.max(0.5, Math.min(1, s.charge));
    s.state = "live";
    s.ball.vy = -(1080 + 420 * p);
    s.ball.vx = 0;
    s.charging = false;
    s.charge = 0;
    if (s.saveUntil < s.time) s.saveUntil = s.time + BALL_SAVE_S;
    setLaneReady(false);
    sfx("zap", { pitch: 0.7 + p * 0.4 });
    haptic(20);
  }, []);

  const flip = useCallback((side: "left" | "right", down: boolean) => {
    const s = g.current;
    if (s.phase !== "playing" || pausedRef.current) return;
    const f = side === "left" ? s.left : s.right;
    if (down && !f.held) {
      sfx("flip", { pitch: side === "left" ? 0.95 : 1.05 });
      haptic(8);
      // Classic lane change: flipping rotates the lit rollover lanes.
      const l = s.lanes;
      s.lanes = side === "left" ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
    }
    f.held = down;
  }, []);

  const plunger = useCallback(
    (down: boolean) => {
      const s = g.current;
      if (s.phase !== "playing" || s.state !== "lane" || pausedRef.current) return;
      if (down) {
        if (!s.charging) {
          s.charging = true;
          s.charge = 0;
          sfx("tap");
        }
      } else if (s.charging) {
        launch();
      }
    },
    [launch],
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.repeat && down) {
        if (["ArrowLeft", "ArrowRight", "Space", "ArrowDown"].includes(e.code)) e.preventDefault();
        return;
      }
      switch (e.code) {
        case "ArrowLeft":
        case "KeyZ":
        case "KeyA":
          flip("left", down);
          break;
        case "ArrowRight":
        case "KeyX":
        case "KeyL":
        case "Slash":
          flip("right", down);
          break;
        case "Space":
        case "ArrowDown":
        case "Enter":
          plunger(down);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [flip, plunger]);

  /* ---------------- simulation + render loop ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const staticLayer = document.createElement("canvas");
    let staticKey = "";

    const burst = (x: number, y: number, colors: string[], n: number, speed: number) => {
      const s = g.current;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.9);
        const life = 0.35 + Math.random() * 0.4;
        s.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: colors[i % colors.length], size: 2 + Math.random() * 2.5 });
      }
    };

    const drain = () => {
      const s = g.current;
      if (s.time < s.saveUntil) {
        s.banner = copy.saved;
        s.bannerT = 1.5;
        sfx("bounce");
        toLane();
        return;
      }
      s.balls -= 1;
      s.state = "drained";
      s.drainT = 1.1;
      s.mult = 1;
      sfx("drop");
      haptic(40);
      if (s.balls <= 0) {
        s.phase = "over";
        setFinal(s.score);
        setPhase("over");
        sfx("lose");
      } else {
        s.banner = `Ball ${BALLS - s.balls + 1}`;
        s.bannerT = 1.6;
        sfx("miss");
      }
    };

    const stepFlipper = (idx: 0 | 1, dt: number) => {
      const s = g.current;
      const f = idx === 0 ? s.left : s.right;
      const def = FLIPPERS[idx];
      const target = f.held ? def.up : def.rest;
      const dir = Math.sign(target - f.angle);
      const speed = f.held ? FLIP_UP_SPEED : FLIP_DOWN_SPEED;
      const prev = f.angle;
      if (dir !== 0) {
        f.angle += dir * speed * dt;
        if (Math.sign(target - f.angle) !== dir) f.angle = target;
      }
      f.omega = (f.angle - prev) / dt;
    };

    const physicsStep = (dt: number) => {
      const s = g.current;
      stepFlipper(0, dt);
      stepFlipper(1, dt);
      const b = s.ball;
      if (s.state !== "live") return;

      b.vy += GRAVITY * dt;
      const damp = 1 - 0.12 * dt;
      b.vx *= damp;
      b.vy *= damp;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx *= MAX_SPEED / sp;
        b.vy *= MAX_SPEED / sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += (b.vx / BALL_R) * dt;

      // Walls & guides.
      for (const seg of table.walls) {
        const c = closestOnSegment(b.x, b.y, seg.ax, seg.ay, seg.bx, seg.by);
        const hit = resolveContact(b, c.x, c.y, BALL_R + seg.r, 0.42);
        if (hit > 180) sfx("bounce", { pitch: 0.6 });
      }
      // Posts (small round pegs).
      for (const p of table.posts) {
        resolveContact(b, p.x, p.y, BALL_R + p.r, 0.55);
      }
      // Pop bumpers.
      table.bumpers.forEach((bp, i) => {
        const hit = resolveContact(b, bp.x, bp.y, BALL_R + bp.r, 0.6);
        if (hit >= 0) {
          const dx = b.x - bp.x;
          const dy = b.y - bp.y;
          const d = Math.hypot(dx, dy) || 1;
          const nx = dx / d;
          const ny = dy / d;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 640) {
            b.vx += (640 - vn) * nx;
            b.vy += (640 - vn) * ny;
          }
          if (s.bumperFlash[i] < 0.75) {
            s.bumperFlash[i] = 1;
            s.shake = Math.max(s.shake, 0.12);
            addScore(100, bp.x, bp.y - bp.r - 6, skin.popColor);
            burst(b.x - nx * BALL_R, b.y - ny * BALL_R, skin.sparks, 10, 220);
            sfx("pop", { pitch: 0.9 + i * 0.12 });
            haptic(10);
          }
        }
      });
      // Slingshots.
      table.slings.forEach((sl, i) => {
        const c = closestOnSegment(b.x, b.y, sl.ax, sl.ay, sl.bx, sl.by);
        const hit = resolveContact(b, c.x, c.y, BALL_R + 5, 0.5);
        if (hit > 90 && s.slingFlash[i] < 0.6) {
          b.vx += sl.nx * 520;
          b.vy += sl.ny * 520;
          s.slingFlash[i] = 1;
          addScore(20, c.x + sl.nx * 20, c.y - 10, skin.popColor);
          burst(c.x, c.y, skin.sparks, 6, 160);
          sfx("bounce", { pitch: 1.3 });
        }
      });
      // Stand-up targets.
      table.targets.forEach((t, i) => {
        const c = closestOnSegment(b.x, b.y, t.ax, t.ay, t.bx, t.by);
        const hit = resolveContact(b, c.x, c.y, BALL_R + 4, 0.55);
        if (hit > 60 && s.targetFlash[i] < 0.5) {
          s.targetFlash[i] = 1;
          if (!s.targets[i]) {
            s.targets[i] = true;
            addScore(100, c.x + 26, c.y, skin.popColor);
            sfx("coin");
          } else {
            addScore(20, c.x + 26, c.y, skin.popColor);
            sfx("tap");
          }
          if (s.targets.every(Boolean)) {
            s.targets = [false, false, false];
            addScore(500, W / 2 - 20, 330, "#facc15", true);
            s.banner = "JACKPOT!";
            s.bannerT = 1.6;
            s.saveUntil = Math.max(s.saveUntil, s.time + 6);
            burst(c.x + 20, c.y, ["#facc15", "#ffffff", ...skin.sparks], 26, 300);
            sfx("win");
            haptic(30);
          }
        }
      });
      // Flippers — contact uses the flipper surface velocity, so a moving
      // flipper actually bats the ball.
      for (const idx of [0, 1] as const) {
        const def = FLIPPERS[idx];
        const f = idx === 0 ? s.left : s.right;
        const tip = flipperTip(def, f.angle);
        const c = closestOnSegment(b.x, b.y, def.x, def.y, tip.x, tip.y);
        const rad = def.r0 + (def.r1 - def.r0) * c.t;
        const rx = c.x - def.x;
        const ry = c.y - def.y;
        const svx = -f.omega * ry;
        const svy = f.omega * rx;
        const hit = resolveContact(b, c.x, c.y, BALL_R + rad, 0.28, svx, svy);
        if (hit > 500) haptic(6);
      }
      // Rollover lanes at the top.
      table.lanes.forEach((ln, i) => {
        if (Math.abs(b.x - ln.x) < 11 && Math.abs(b.y - ln.y) < 10 && !s.lanes[i]) {
          s.lanes[i] = true;
          addScore(50, ln.x, ln.y + 24, skin.popColor);
          sfx("coin", { pitch: 1.2 });
          if (s.lanes.every(Boolean)) {
            s.lanes = [false, false, false];
            s.mult = Math.min(5, s.mult + 1);
            s.banner = `x${s.mult} POINTS!`;
            s.bannerT = 1.6;
            burst(ln.x, ln.y, ["#facc15", "#ffffff", ...skin.sparks], 22, 260);
            sfx("levelUp");
          }
        }
      });

      // Rolled back into the plunger lane → re-serve without losing the ball.
      if (b.x > table.laneLeft && b.y > PLUNGER_Y - 4 && Math.abs(b.vy) < 120) {
        toLane();
        return;
      }
      if (b.y > H + BALL_R * 3) drain();
    };

    const frameUpdate = (dt: number) => {
      const s = g.current;
      s.time += dt;
      for (let i = 0; i < 3; i++) s.bumperFlash[i] = Math.max(0, s.bumperFlash[i] - dt * 3.2);
      for (let i = 0; i < 2; i++) s.slingFlash[i] = Math.max(0, s.slingFlash[i] - dt * 4);
      for (let i = 0; i < 3; i++) s.targetFlash[i] = Math.max(0, s.targetFlash[i] - dt * 3);
      s.shake = Math.max(0, s.shake - dt);
      s.bannerT = Math.max(0, s.bannerT - dt);
      if (s.charging) s.charge = Math.min(1, s.charge + dt * 1.1);
      if (s.state === "drained" && s.phase === "playing") {
        s.drainT -= dt;
        if (s.drainT <= 0) toLane();
      }
      // Unstick: a ball sitting still somewhere odd gets a gentle nudge.
      if (s.state === "live") {
        const b = s.ball;
        const held = s.left.held || s.right.held;
        if (Math.hypot(b.vx, b.vy) < 25 && !held) s.stillT += dt;
        else s.stillT = 0;
        if (s.stillT > 2.5) {
          s.stillT = 0;
          b.vx = (Math.random() - 0.5) * 300;
          b.vy = -300;
          s.banner = "Nudge!";
          s.bannerT = 0.9;
          sfx("bounce");
        }
        s.trail.push({ x: b.x, y: b.y });
        if (s.trail.length > 8) s.trail.shift();
      }
      for (const p of s.pops) {
        p.life -= dt * 1.1;
        p.y -= 34 * dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);
      for (const p of s.sparks) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
      }
      s.sparks = s.sparks.filter((p) => p.life > 0);
    };

    /* ---------- drawing ---------- */

    const draw = () => {
      const s = g.current;
      const k = canvas.width / W;
      const key = `${canvas.width}x${canvas.height}`;
      if (key !== staticKey && canvas.width > 0) {
        staticKey = key;
        staticLayer.width = canvas.width;
        staticLayer.height = canvas.height;
        const sctx = staticLayer.getContext("2d");
        if (sctx) {
          sctx.setTransform(k, 0, 0, k, 0, 0);
          drawStaticTable(sctx, table, skin);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const shx = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 20 * k : 0;
      const shy = s.shake > 0 ? (Math.random() - 0.5) * s.shake * 20 * k : 0;
      ctx.drawImage(staticLayer, shx, shy);
      ctx.setTransform(k, 0, 0, k, shx, shy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const t = s.time;

      // Multiplier in the middle of the playfield.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 64px system-ui, sans-serif";
      ctx.fillStyle = s.mult > 1 ? skin.multOn : skin.multOff;
      ctx.fillText(`x${s.mult}`, table.center, 395);

      // Rollover lane lights.
      table.lanes.forEach((ln, i) => {
        const on = s.lanes[i];
        ctx.beginPath();
        ctx.arc(ln.x, ln.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = on ? skin.lightOn : skin.lightOff;
        if (on) {
          ctx.shadowColor = skin.lightOn;
          ctx.shadowBlur = 14;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      // Stand-up targets.
      table.targets.forEach((tg, i) => {
        const on = s.targets[i];
        const fl = s.targetFlash[i];
        ctx.lineCap = "round";
        ctx.strokeStyle = on ? skin.lightOn : skin.target;
        ctx.lineWidth = 9 + fl * 3;
        if (on || fl > 0) {
          ctx.shadowColor = skin.lightOn;
          ctx.shadowBlur = 10 + fl * 10;
        }
        ctx.beginPath();
        ctx.moveTo(tg.ax, tg.ay);
        ctx.lineTo(tg.bx, tg.by);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tg.ax + 2, tg.ay + 3);
        ctx.lineTo(tg.bx + 2, tg.by - 3);
        ctx.stroke();
      });

      // Slingshots.
      table.slings.forEach((sl, i) => {
        const fl = s.slingFlash[i];
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.25)";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = skin.sling;
        ctx.strokeStyle = skin.slingEdge;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(sl.ax, sl.ay);
        ctx.lineTo(sl.bx, sl.by);
        ctx.lineTo(sl.cx, sl.cy);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
        ctx.restore();
        // Rubber on the kicking edge bulges out when it fires.
        const bulge = fl * 7;
        const mx = (sl.ax + sl.bx) / 2 + sl.nx * bulge;
        const my = (sl.ay + sl.by) / 2 + sl.ny * bulge;
        if (fl > 0) {
          ctx.shadowColor = skin.lightOn;
          ctx.shadowBlur = 18 * fl;
        }
        ctx.strokeStyle = fl > 0 ? skin.lightOn : "#ffffff";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(sl.ax, sl.ay);
        ctx.quadraticCurveTo(mx, my, sl.bx, sl.by);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Little lamp in the middle.
        const lx = (sl.ax + sl.bx + sl.cx) / 3;
        const ly = (sl.ay + sl.by + sl.cy) / 3;
        ctx.fillStyle = fl > 0 ? "#ffffff" : skin.lightOn;
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Pop bumpers.
      table.bumpers.forEach((bp, i) => {
        const fl = s.bumperFlash[i];
        const scale = 1 + Math.sin(fl * Math.PI) * 0.14;
        const size = bp.r * 2.35 * scale;
        // Glow ring
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, bp.r + 7 + fl * 8, 0, Math.PI * 2);
        ctx.fillStyle = fl > 0 ? skin.glow(fl) : skin.ringIdle;
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(bp.x + 3, bp.y + 5, bp.r + 2, bp.r, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = images.current.bumper;
        if (img) {
          ctx.save();
          ctx.translate(bp.x, bp.y);
          ctx.rotate(Math.sin(t * 1.3 + i) * 0.06);
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
          ctx.restore();
        } else {
          ctx.fillStyle = theme.accent;
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, bp.r * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        if (fl > 0) {
          ctx.strokeStyle = `rgba(255,255,255,${fl})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, bp.r + 4 + (1 - fl) * 18, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // Ball-save lamp.
      const saving = s.time < s.saveUntil && s.phase === "playing";
      const blink = saving && (s.saveUntil - s.time > 2.5 || Math.floor(t * 8) % 2 === 0);
      ctx.font = "900 12px system-ui, sans-serif";
      ctx.fillStyle = blink ? skin.lightOn : skin.lightOff;
      if (blink) {
        ctx.shadowColor = skin.lightOn;
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.roundRect(table.center - 30, 604, 60, 20, 10);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = blink ? "#ffffff" : skin.textDim;
      ctx.fillText("SAVE", table.center, 614.5);

      // Flippers.
      for (const idx of [0, 1] as const) {
        const def = FLIPPERS[idx];
        const f = idx === 0 ? s.left : s.right;
        const tip = flipperTip(def, f.angle);
        const ang = Math.atan2(tip.y - def.y, tip.x - def.x);
        const len = def.len;
        ctx.save();
        ctx.translate(def.x, def.y);
        ctx.rotate(ang);
        const path = () => {
          ctx.beginPath();
          ctx.arc(0, 0, def.r0, Math.PI / 2, (Math.PI * 3) / 2);
          ctx.lineTo(len, -def.r1);
          ctx.arc(len, 0, def.r1, -Math.PI / 2, Math.PI / 2);
          ctx.closePath();
        };
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        path();
        const grad = ctx.createLinearGradient(0, -def.r0, 0, def.r0);
        grad.addColorStop(0, skin.flipperHi);
        grad.addColorStop(1, skin.flipper);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = skin.flipperEdge;
        ctx.stroke();
        ctx.fillStyle = skin.flipperEdge;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Plunger + spring.
      const pull = s.state === "lane" ? s.charge * 26 : 0;
      const px = LANE_X;
      const top = PLUNGER_Y + BALL_R + 2 + pull;
      ctx.strokeStyle = skin.spring;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const yy = top + 8 + ((H - 8 - top - 8) * i) / 10;
        ctx.lineTo(px + (i % 2 ? -8 : 8), yy);
      }
      ctx.stroke();
      ctx.fillStyle = skin.plunger;
      ctx.beginPath();
      ctx.roundRect(px - 11, top, 22, 9, 4);
      ctx.fill();
      if (s.state === "lane" && s.phase === "playing") {
        const pulse = (Math.sin(t * 6) + 1) / 2;
        ctx.fillStyle = skin.lightOn;
        ctx.globalAlpha = 0.5 + pulse * 0.5;
        ctx.beginPath();
        ctx.moveTo(px, PLUNGER_Y - 40 - pulse * 6);
        ctx.lineTo(px - 8, PLUNGER_Y - 28 - pulse * 6);
        ctx.lineTo(px + 8, PLUNGER_Y - 28 - pulse * 6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        // Power meter
        if (s.charging) {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(px - 3, PLUNGER_Y - 130, 6, 80);
          ctx.fillStyle = skin.lightOn;
          ctx.fillRect(px - 3, PLUNGER_Y - 50 - 80 * s.charge, 6, 80 * s.charge);
        }
      }

      // Ball trail + ball.
      const b = s.ball;
      if (s.state !== "drained") {
        s.trail.forEach((p, i) => {
          ctx.globalAlpha = (i / s.trail.length) * 0.28;
          ctx.fillStyle = skin.trail;
          ctx.beginPath();
          ctx.arc(p.x, p.y, BALL_R * (0.5 + (i / s.trail.length) * 0.5), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.ellipse(b.x + 3, b.y + 5, BALL_R, BALL_R * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        const img = images.current.ball;
        if (img) {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.spin);
          const d = BALL_R * 2.3;
          ctx.drawImage(img, -d / 2, -d / 2, d, d);
          ctx.restore();
        } else {
          ctx.fillStyle = "#e5e7eb";
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.arc(b.x - 3.5, b.y - 4, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sparks.
      for (const p of s.sparks) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Floating points.
      for (const p of s.pops) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.font = `900 ${p.big ? 22 : 15}px system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = skin.popStroke;
        ctx.lineJoin = "round";
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      // Corner HUD: balls left + multiplier.
      ctx.textAlign = "left";
      ctx.font = "900 12px system-ui, sans-serif";
      ctx.fillStyle = skin.hudText;
      ctx.fillText("BALLS", 8, 14);
      for (let i = 0; i < BALLS; i++) {
        const live = i < s.balls;
        ctx.beginPath();
        ctx.arc(14 + i * 15, 30, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = live ? skin.lightOn : skin.lightOff;
        ctx.fill();
      }
      ctx.textAlign = "right";
      ctx.fillStyle = skin.hudText;
      ctx.fillText("BONUS", W - 8, 14);
      ctx.font = "900 17px system-ui, sans-serif";
      ctx.fillStyle = s.mult > 1 ? skin.lightOn : skin.hudText;
      ctx.fillText(`x${s.mult}`, W - 8, 32);

      // Banner.
      if (s.bannerT > 0 && s.banner) {
        const a = Math.min(1, s.bannerT * 3);
        const sc = 1 + Math.max(0, s.bannerT - 1.2) * 1.2;
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(table.center, 470);
        ctx.scale(sc, sc);
        ctx.textAlign = "center";
        ctx.font = "900 28px system-ui, sans-serif";
        ctx.lineWidth = 6;
        ctx.strokeStyle = skin.popStroke;
        ctx.strokeText(s.banner, 0, 0);
        ctx.fillStyle = skin.banner;
        ctx.fillText(s.banner, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Launch hint.
      if (s.phase === "playing" && s.state === "lane" && !s.charging) {
        const pulse = (Math.sin(t * 4) + 1) / 2;
        ctx.globalAlpha = 0.75 + pulse * 0.25;
        ctx.textAlign = "center";
        ctx.font = "900 15px system-ui, sans-serif";
        ctx.lineWidth = 4;
        ctx.strokeStyle = skin.popStroke;
        ctx.strokeText("Hold & let go to launch!", table.center, 520);
        ctx.fillStyle = "#ffffff";
        ctx.fillText("Hold & let go to launch!", table.center, 520);
        ctx.globalAlpha = 1;
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
      last = now;
      const s = g.current;
      if (!pausedRef.current && s.phase === "playing") {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 40) {
          physicsStep(STEP);
          acc -= STEP;
          n++;
          if (s.phase !== "playing") break;
        }
        frameUpdate(dt);
      } else {
        acc = 0;
        if (!pausedRef.current) {
          // Idle attract mode: flippers relax, particles finish.
          stepFlipper(0, dt);
          stepFlipper(1, dt);
          frameUpdate(dt);
        }
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [table, skin, theme, copy, addScore, toLane]);

  /* ---------------- touch on the table ---------------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = g.current;
    if (s.phase !== "playing" || paused) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    if (s.state === "lane") {
      pointers.current.set(e.pointerId, "plunger");
      plunger(true);
      return;
    }
    const p = canvasPoint(e, e.currentTarget, W, H);
    const side = p.x < W / 2 ? "left" : "right";
    pointers.current.set(e.pointerId, side);
    flip(side, true);
  };
  const release = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const what = pointers.current.get(e.pointerId);
    if (!what) return;
    pointers.current.delete(e.pointerId);
    if (what === "plunger") plunger(false);
    else if (![...pointers.current.values()].includes(what)) flip(what, false);
  };

  return (
    <div className="game-root">
      <CanvasStage
        width={W}
        height={H}
        canvasRef={canvasRef}
        canvasClassName="select-none"
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <GameOverlay
          show={phase === "ready"}
          emoji={copy.emoji}
          title={theme.gameNames.pinball}
          subtitle="Tap the left or right side to flip. Hold and let go to launch the ball!"
          actionLabel="Play!"
          onAction={start}
        />
        <GameOverlay
          show={phase === "over"}
          tone="lose"
          emoji="🎉"
          title="Game over!"
          subtitle={`Your ${copy.ballWord} scored ${final.toLocaleString()} points!`}
          actionLabel="Play again"
          onAction={start}
        />
      </CanvasStage>
      <div className="flex w-full max-w-[440px] gap-2 px-2 pb-1">
        <PadButton
          label="Left flipper"
          primary
          className="min-h-16 text-2xl"
          onPress={() => flip("left", true)}
          onRelease={() => flip("left", false)}
        >
          ◀
        </PadButton>
        <PadButton
          label="Launch"
          className="min-h-16 max-w-[7rem] text-base"
          disabled={!laneReady || phase !== "playing"}
          onPress={() => plunger(true)}
          onRelease={() => plunger(false)}
        >
          🚀 Launch
        </PadButton>
        <PadButton
          label="Right flipper"
          primary
          className="min-h-16 text-2xl"
          onPress={() => flip("right", true)}
          onRelease={() => flip("right", false)}
        >
          ▶
        </PadButton>
      </div>
    </div>
  );
}
