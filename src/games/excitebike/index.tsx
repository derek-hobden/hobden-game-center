"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { CanvasStage, GameOverlay, PadButton, prepareCanvas } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { packFor } from "./art";
import { buildTrack, groundAt, slopeAt, type Track } from "./track";

/* ------------------------------------------------------------------ */
/* Tuning                                                               */
/* ------------------------------------------------------------------ */

const H = 540;
const BASE_Y = 452; // screen y of the flat ground line
const GRAVITY = 1350;
const JUMP_V = 450;
const MAX_SPEED = 235;
const MUD_SPEED = 95;
const ACCEL = 240;
const COAST = 150;
const HEARTS = 3;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;
const CONTROLS_H = 92;

type Phase = "ready" | "ride" | "crash" | "finish" | "won" | "lost";

type Particle = {
  x: number; // world x
  y: number; // screen-space y (camera independent enough for short lives)
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "dust" | "spark" | "text" | "confetti" | "splash";
  text?: string;
  grav: number;
  rot: number;
};

type Sim = {
  phase: Phase;
  level: number;
  track: Track;
  x: number;
  alt: number;
  vAlt: number;
  speed: number;
  grounded: boolean;
  air: number;
  coyote: number;
  jumpBuf: number;
  angle: number;
  wheelRot: number;
  squash: number;
  hearts: number;
  invuln: number;
  crashT: number;
  crashFrom: number;
  finishT: number;
  gems: number;
  gemsTotal: number;
  score: number;
  levelStartScore: number;
  parts: Particle[];
  shake: number;
  camY: number;
  gas: boolean;
  everGas: boolean;
  jumpsDone: number;
  dustCd: number;
  time: number;
  inMud: boolean;
};

function newSim(level: number, score: number): Sim {
  const track = buildTrack(level);
  return {
    phase: "ready",
    level,
    track,
    x: 120,
    alt: 0,
    vAlt: 0,
    speed: 0,
    grounded: true,
    air: 0,
    coyote: 0,
    jumpBuf: 0,
    angle: 0,
    wheelRot: 0,
    squash: 0,
    hearts: HEARTS,
    invuln: 0,
    crashT: 0,
    crashFrom: 0,
    finishT: 0,
    gems: 0,
    gemsTotal: track.gems.length,
    score,
    levelStartScore: score,
    parts: [],
    shake: 0,
    camY: 0,
    gas: false,
    everGas: false,
    jumpsDone: 0,
    dustCd: 0,
    time: 0,
    inMud: false,
  };
}

type Art = {
  body: HTMLImageElement;
  wheel0: HTMLImageElement;
  wheel1: HTMLImageElement;
  gem: HTMLImageElement;
  mound: HTMLImageElement;
  sky: HTMLImageElement;
};

function img(src: string) {
  const i = new Image();
  i.decoding = "async";
  i.src = src;
  return i;
}
function ok(i: HTMLImageElement | undefined): i is HTMLImageElement {
  return !!i && i.complete && i.naturalWidth > 0;
}
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function ExcitebikeGame({ profileId, paused, onScoreChange }: GameProps) {
  const pack = packFor(profileId);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim>(newSim(1, 0));
  const artRef = useRef<Partial<Art>>({});
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const fontRef = useRef("system-ui, sans-serif");
  const [W, setW] = useState(360);
  const wRef = useRef(360);
  const [phase, setPhase] = useState<Phase>("ready");
  const [level, setLevel] = useState(1);
  const [result, setResult] = useState({ gems: 0, total: 0 });
  const [gasHeld, setGasHeld] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) simRef.current.gas = false;
  }, [paused]);
  useEffect(() => {
    scoreCb.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    onScoreChange?.(0);
    fontRef.current = getComputedStyle(document.body).fontFamily || fontRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report 0 once on mount
  }, []);

  // Pick a logical width that matches the free space (wide on tablets).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const h = Math.max(120, r.height - CONTROLS_H);
      const aspect = r.width / h;
      const w = Math.round(Math.min(960, Math.max(340, H * aspect)));
      if (Math.abs(w - wRef.current) > 4) {
        wRef.current = w;
        setW(w);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    artRef.current = {
      body: img(pack.body),
      wheel0: img(pack.wheels[0]),
      wheel1: img(pack.wheels[1]),
      gem: img(pack.gem),
      mound: img(pack.mound),
      sky: img(pack.sky),
    };
  }, [pack]);

  /* ---------------- input ---------------- */

  const jump = useCallback(() => {
    const s = simRef.current;
    if (pausedRef.current || s.phase !== "ride") return;
    s.jumpBuf = JUMP_BUFFER;
  }, []);
  const gasOn = useCallback(() => {
    const s = simRef.current;
    if (pausedRef.current) return;
    s.gas = true;
    s.everGas = true;
    setGasHeld(true);
  }, []);
  const gasOff = useCallback(() => {
    simRef.current.gas = false;
    setGasHeld(false);
  }, []);

  const begin = useCallback((lvl: number, keepScore: boolean) => {
    const prev = simRef.current;
    const score = keepScore ? prev.score : prev.levelStartScore;
    const s = newSim(lvl, score);
    s.phase = "ride";
    s.everGas = prev.everGas || lvl > 1;
    simRef.current = s;
    scoreCb.current?.(score);
    setLevel(lvl);
    setPhase("ride");
    setGasHeld(false);
    sfx(lvl > 1 ? "levelUp" : "tap");
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = simRef.current;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        if (!e.repeat) gasOn();
      } else if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        if (e.repeat) return;
        if (s.phase === "ready") begin(s.level, true);
        else if (s.phase === "won") begin(s.level + 1, true);
        else if (s.phase === "lost") begin(s.level, false);
        else jump();
      } else if (e.key === "Enter") {
        if (s.phase === "ready") begin(s.level, true);
        else if (s.phase === "won") begin(s.level + 1, true);
        else if (s.phase === "lost") begin(s.level, false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") gasOff();
    };
    const blur = () => gasOff();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [begin, gasOff, gasOn, jump]);

  /* ---------------- loop ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let skyCache: { c: HTMLCanvasElement; w: number; ok: boolean } | null = null;

    const riderX = () => Math.max(96, Math.min(220, wRef.current * 0.27));

    const addScore = (n: number) => {
      const s = simRef.current;
      s.score += n;
      scoreCb.current?.(s.score);
    };

    const puff = (
      x: number,
      y: number,
      n: number,
      colors: string[],
      o: Partial<Particle> & { spread?: number; up?: number } = {},
    ) => {
      const s = simRef.current;
      const spread = o.spread ?? 90;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = spread * (0.4 + Math.random() * 0.6);
        s.parts.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (o.up ?? 30),
          life: 0,
          max: 0.5 + Math.random() * 0.4,
          size: 3 + Math.random() * 3,
          color: colors[i % colors.length],
          kind: "dust",
          grav: 0,
          rot: Math.random() * 6,
          ...o,
        });
      }
    };
    const text = (x: number, y: number, t: string, color = "#fff", size = 20) => {
      simRef.current.parts.push({
        x,
        y,
        vx: 0,
        vy: -50,
        life: 0,
        max: 1,
        size,
        color,
        kind: "text",
        text: t,
        grav: 0,
        rot: 0,
      });
    };

    const screenY = (alt: number) => BASE_Y - alt + simRef.current.camY;

    const update = (dt: number) => {
      const s = simRef.current;
      s.time += dt;
      s.shake = Math.max(0, s.shake - dt * 16);
      s.squash = Math.max(0, s.squash - dt * 5);
      s.invuln = Math.max(0, s.invuln - dt);

      for (const p of s.parts) {
        p.life += dt;
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === "dust") {
          p.vx *= 1 - dt * 2;
          p.vy *= 1 - dt * 2;
        }
        p.rot += dt * 6;
      }
      s.parts = s.parts.filter((p) => p.life < p.max);

      if (s.phase === "ready" || s.phase === "won" || s.phase === "lost") return;
      const tr = s.track;

      if (s.phase === "crash") {
        s.crashT += dt;
        s.vAlt -= GRAVITY * dt;
        s.alt += s.vAlt * dt;
        s.x += 60 * dt * Math.max(0, 1 - s.crashT);
        const g = groundAt(tr, s.x);
        if (s.alt < g) {
          s.alt = g;
          s.vAlt = Math.abs(s.vAlt) > 120 ? -s.vAlt * 0.35 : 0;
        }
        s.angle = -s.crashT * Math.PI * 2.4;
        if (s.crashT > 1.05) {
          if (s.hearts <= 0) {
            s.phase = "lost";
            setPhase("lost");
            sfx("lose");
            return;
          }
          // respawn just past the thing we hit
          s.phase = "ride";
          s.x = Math.max(s.x, s.crashFrom + 46);
          s.alt = groundAt(tr, s.x);
          s.vAlt = 0;
          s.angle = 0;
          s.speed = 40;
          s.invuln = 1.6;
          s.grounded = true;
          puff(riderX(), screenY(s.alt), 14, ["#fff", ...pack.dust], { spread: 120 });
          sfx("pop");
        }
        return;
      }

      // speed
      s.inMud = tr.muds.some((m) => s.x > m.x0 && s.x < m.x1) && s.grounded;
      const cap = s.inMud ? MUD_SPEED : MAX_SPEED;
      if (s.phase === "finish") {
        s.speed = Math.max(0, s.speed - 160 * dt);
      } else if (s.gas) {
        s.speed = Math.min(cap, s.speed + ACCEL * dt);
      } else {
        s.speed = Math.max(0, s.speed - COAST * dt);
      }
      if (s.speed > cap) s.speed = Math.max(cap, s.speed - 500 * dt);
      s.x += s.speed * dt;

      // vertical
      const slope = slopeAt(tr, s.x);
      if (s.grounded) {
        s.vAlt = slope * s.speed;
        s.coyote = COYOTE;
      } else {
        s.coyote = Math.max(0, s.coyote - dt);
      }
      s.jumpBuf = Math.max(0, s.jumpBuf - dt);
      if (s.jumpBuf > 0 && (s.grounded || s.coyote > 0) && s.phase === "ride") {
        s.vAlt = Math.max(0, s.vAlt) + JUMP_V;
        s.grounded = false;
        s.coyote = 0;
        s.jumpBuf = 0;
        s.jumpsDone += 1;
        s.squash = 0.6;
        sfx("jump");
        haptic(8);
        puff(riderX() - 20, screenY(s.alt), 8, pack.dust, { spread: 70, up: 10 });
      }
      s.vAlt -= GRAVITY * dt;
      s.alt += s.vAlt * dt;
      const g = groundAt(tr, s.x);
      if (s.alt <= g) {
        if (!s.grounded) {
          const hard = -s.vAlt;
          if (hard > 260) {
            s.squash = Math.min(1, hard / 700);
            puff(riderX(), screenY(g), 10, pack.dust, { spread: 110, up: 20 });
            sfx("drop", { pitch: 1.2 });
            if (hard > 520) s.shake = 3;
          }
          if (s.air > 0.75 && s.phase === "ride") {
            addScore(5);
            text(s.x, screenY(g) - 90, "Big air! +5", "#fde047", 20);
            sfx("star", { pitch: 1.2 });
          }
        }
        s.alt = g;
        s.grounded = true;
        s.air = 0;
      } else if (s.alt > g + 1.5) {
        s.grounded = false;
        s.air += dt;
      }

      // bike angle
      const target = s.grounded
        ? -Math.atan(slope) - (s.gas && s.speed < 120 ? 0.08 : 0)
        : Math.max(-0.55, Math.min(0.5, -Math.atan2(s.vAlt, Math.max(80, s.speed)) * 0.7));
      s.angle += (target - s.angle) * Math.min(1, dt * (s.grounded ? 18 : 5));
      s.wheelRot += (s.speed * dt) / 22;

      // dust trail
      s.dustCd -= dt;
      if (s.grounded && s.speed > 60 && s.dustCd <= 0) {
        s.dustCd = s.inMud ? 0.03 : 0.07;
        const colors = s.inMud ? [pack.mud, pack.mudShine] : pack.dust;
        s.parts.push({
          x: s.x - 32,
          y: screenY(s.alt) - 4,
          vx: -40 - Math.random() * 40,
          vy: -30 - Math.random() * 50,
          life: 0,
          max: 0.5,
          size: 4 + Math.random() * 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          kind: s.inMud ? "splash" : "dust",
          grav: s.inMud ? 400 : 0,
          rot: 0,
        });
        if (s.inMud) sfx("tap", { pitch: 0.5 });
      }

      // gems
      const rx = s.x;
      const ry = s.alt + 34;
      for (const gm of tr.gems) {
        if (gm.taken) continue;
        if (Math.abs(gm.x - rx) < 36 && Math.abs(gm.alt - ry) < 42) {
          gm.taken = true;
          s.gems += 1;
          addScore(10);
          text(gm.x, screenY(gm.alt) - 20, "+10", "#fff", 20);
          puff(gm.x, screenY(gm.alt), 14, ["#fde047", "#fff", "#f9a8d4", "#a5f3fc"], {
            kind: "spark",
            spread: 140,
            up: 0,
            max: 0.6,
          });
          sfx("coin", { pitch: 1 + (s.gems % 5) * 0.08 });
        }
      }

      // blocks
      if (s.phase === "ride" && s.invuln <= 0) {
        for (const b of tr.blocks) {
          if (b.smashed) continue;
          const bg = groundAt(tr, b.x);
          if (Math.abs(b.x - s.x) < b.w / 2 + 14 && s.alt < bg + b.h - 8) {
            b.smashed = true;
            s.hearts -= 1;
            s.phase = "crash";
            s.crashT = 0;
            s.crashFrom = b.x;
            s.vAlt = 330;
            s.grounded = false;
            s.speed = 0;
            s.shake = 6;
            text(s.x, screenY(s.alt) - 90, s.hearts > 0 ? "Oops!" : "Oh no!", "#fecaca", 24);
            puff(b.x, screenY(bg + b.h / 2), 18, pack.block === "hay" ? ["#fde68a", "#facc15", "#ca8a04"] : ["#f9a8d4", "#fff", "#f472b6"], {
              spread: 160,
              grav: 500,
              kind: "confetti",
            });
            sfx("hit");
            haptic(40);
            setPhase("crash");
            return;
          }
        }
      }

      // camera: keep big jumps on screen
      const wantCam = Math.max(0, s.alt - 230);
      s.camY += (wantCam - s.camY) * Math.min(1, dt * 4);

      // finish line
      if (s.phase === "ride" && s.x >= tr.length) {
        s.phase = "finish";
        s.finishT = 0;
        addScore(50 + s.hearts * 10);
        sfx("win");
        setPhase("finish");
      }
      if (s.phase === "finish") {
        s.finishT += dt;
        if (Math.random() < dt * 30) {
          puff(s.x + (Math.random() - 0.3) * wRef.current * 0.8, 40 + Math.random() * 60, 6, ["#f472b6", "#fde047", "#60a5fa", "#34d399", "#fff", "#fb923c"], {
            kind: "confetti",
            spread: 120,
            grav: 260,
            max: 1.4,
          });
        }
        if (s.finishT > 1.8) {
          s.phase = "won";
          setResult({ gems: s.gems, total: s.gemsTotal });
          setPhase("won");
        }
      }
    };

    /* ---------------- drawing ---------------- */

    const drawSky = (camX: number, W: number) => {
      const art = artRef.current;
      const k = canvas.width / W;
      // Cache the (static) sky gradient + far hills per width.
      if (!skyCache || skyCache.w !== canvas.width || (!skyCache.ok && ok(art.sky))) {
        const c = document.createElement("canvas");
        c.width = canvas.width;
        c.height = canvas.height;
        const o = c.getContext("2d");
        if (o) {
          o.setTransform(k, 0, 0, k, 0, 0);
          const g = o.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, pack.block === "hay" ? "#7cc8f8" : "#ffc8e6");
          g.addColorStop(1, pack.block === "hay" ? "#dff3ff" : "#fff3e8");
          o.fillStyle = g;
          o.fillRect(0, 0, W, H);
        }
        skyCache = { c, w: canvas.width, ok: ok(art.sky) };
      }
      ctx.drawImage(skyCache.c, 0, 0, W, H);

      // painted backdrop, very slow parallax, mirrored tiling
      if (ok(art.sky)) {
        const sh = BASE_Y + 30;
        const sw = (art.sky.naturalWidth / art.sky.naturalHeight) * sh;
        const off = -((camX * 0.06) % (sw * 2));
        for (let i = -1; i < Math.ceil(W / sw) + 2; i++) {
          const x = off + i * sw;
          if (x > W || x + sw < 0) continue;
          ctx.save();
          if (((i % 2) + 2) % 2 === 1) {
            ctx.translate(x + sw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(art.sky, 0, -10, sw, sh);
          } else {
            ctx.drawImage(art.sky, x, -10, sw, sh);
          }
          ctx.restore();
        }
      }
      // haze to push the painting back
      const haze = ctx.createLinearGradient(0, BASE_Y - 200, 0, BASE_Y);
      haze.addColorStop(0, "rgba(255,255,255,0)");
      haze.addColorStop(1, "rgba(255,255,255,0.35)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, BASE_Y - 200, W, 200);

      // drifting clouds
      const t = simRef.current.time;
      for (let i = 0; i < 5; i++) {
        const span = W + 240;
        const cx = ((i * 263 - camX * 0.12 - t * (6 + i * 2)) % span + span) % span - 120;
        const cy = 40 + hash(i) * 110;
        const s = 0.7 + hash(i + 9) * 0.6;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.ellipse(cx, cy, 34 * s, 14 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - 22 * s, cy + 4 * s, 20 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 20 * s, cy - 6 * s, 22 * s, 15 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawHills = (camX: number, W: number, factor: number, color: string, amp: number, base: number, seed: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let sx = 0; sx <= W + 8; sx += 8) {
        const wx = sx + camX * factor + seed;
        const y =
          base -
          amp * (0.55 + 0.45 * Math.sin(wx * 0.006)) -
          amp * 0.35 * Math.sin(wx * 0.017 + 1.3) -
          amp * 0.15 * Math.sin(wx * 0.041 + 0.4);
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    };

    const drawMidground = (camX: number, W: number) => {
      const art = artRef.current;
      const f = 0.55;
      const spacing = 190;
      const start = Math.floor((camX * f - 200) / spacing);
      for (let i = start; i < start + Math.ceil(W / spacing) + 4; i++) {
        const wx = i * spacing + hash(i) * 90;
        const sx = wx - camX * f;
        const kind = hash(i + 3);
        if (kind < 0.35 && ok(art.mound)) {
          const w = 90 + hash(i + 5) * 34;
          const h = (art.mound.naturalHeight / art.mound.naturalWidth) * w;
          ctx.globalAlpha = 0.8;
          ctx.drawImage(art.mound, sx - w / 2, BASE_Y - h - 34, w, h);
          ctx.globalAlpha = 1;
        } else {
          // lollipop / pine trees
          const s = 0.7 + hash(i + 7) * 0.5;
          const bx = sx;
          const by = BASE_Y + 6;
          ctx.fillStyle = pack.treeTrunk;
          ctx.fillRect(bx - 3 * s, by - 40 * s, 6 * s, 40 * s);
          if (pack.block === "hay") {
            ctx.fillStyle = pack.tree;
            for (let j = 0; j < 3; j++) {
              ctx.beginPath();
              ctx.moveTo(bx, by - (86 - j * 18) * s);
              ctx.lineTo(bx - (22 + j * 6) * s, by - (40 - j * 14 + 20) * s + 20 * s);
              ctx.lineTo(bx + (22 + j * 6) * s, by - (40 - j * 14 + 20) * s + 20 * s);
              ctx.closePath();
              ctx.fill();
            }
          } else {
            ctx.fillStyle = pack.tree;
            ctx.beginPath();
            ctx.arc(bx, by - 52 * s, 20 * s, 0, Math.PI * 2);
            ctx.arc(bx - 12 * s, by - 44 * s, 14 * s, 0, Math.PI * 2);
            ctx.arc(bx + 12 * s, by - 44 * s, 14 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,0.45)";
            ctx.beginPath();
            ctx.arc(bx - 6 * s, by - 58 * s, 6 * s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    };

    const drawGround = (camX: number, W: number) => {
      const s = simRef.current;
      const tr = s.track;
      const pts: number[] = [];
      for (let sx = -4; sx <= W + 8; sx += 4) pts.push(screenY(groundAt(tr, camX + sx)));
      // dirt body
      const dg = ctx.createLinearGradient(0, BASE_Y - 60, 0, H);
      dg.addColorStop(0, pack.dirtTop);
      dg.addColorStop(1, pack.dirtBottom);
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.moveTo(-4, H + 10);
      pts.forEach((y, i) => ctx.lineTo(-4 + i * 4, y));
      ctx.lineTo(W + 8, H + 10);
      ctx.closePath();
      ctx.fill();

      // dirt texture (world-anchored pebbles & strata)
      const step = 26;
      const first = Math.floor(camX / step) - 1;
      for (let i = first; i < first + W / step + 3; i++) {
        const wx = i * step + hash(i) * step;
        const sx = wx - camX;
        const gy = screenY(groundAt(tr, wx));
        const yy = gy + 22 + hash(i + 1) * (H - gy - 26);
        ctx.fillStyle = hash(i + 2) < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.16)";
        ctx.beginPath();
        ctx.ellipse(sx, yy, 3 + hash(i + 3) * 5, 2 + hash(i + 4) * 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // track surface band
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = pack.track;
      ctx.lineWidth = 14;
      ctx.beginPath();
      pts.forEach((y, i) => (i === 0 ? ctx.moveTo(-4, y + 7) : ctx.lineTo(-4 + i * 4, y + 7)));
      ctx.stroke();
      // grass lip
      ctx.strokeStyle = pack.grass;
      ctx.lineWidth = 6;
      ctx.beginPath();
      pts.forEach((y, i) => (i === 0 ? ctx.moveTo(-4, y + 1) : ctx.lineTo(-4 + i * 4, y + 1)));
      ctx.stroke();
      ctx.strokeStyle = pack.grassLight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((y, i) => (i === 0 ? ctx.moveTo(-4, y - 1) : ctx.lineTo(-4 + i * 4, y - 1)));
      ctx.stroke();
      // track dots / ruts
      const dstep = 18;
      const df = Math.floor(camX / dstep);
      ctx.fillStyle = pack.trackDots;
      for (let i = df; i < df + W / dstep + 2; i++) {
        const wx = i * dstep;
        const sx = wx - camX;
        const gy = screenY(groundAt(tr, wx));
        ctx.globalAlpha = 0.55;
        ctx.fillRect(sx, gy + 8, 6, 2);
      }
      ctx.globalAlpha = 1;

      // ramps (drawn as special striped kickers)
      for (const t of tr.terrain) {
        if (t.kind !== "ramp") continue;
        if (t.x1 + t.back < camX - 10 || t.x0 > camX + W + 10) continue;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(t.x0 - camX, screenY(0));
        for (let wx = t.x0; wx <= t.x1 + t.back; wx += 3) ctx.lineTo(wx - camX, screenY(groundAt(tr, wx)));
        ctx.lineTo(t.x1 + t.back - camX, screenY(0));
        ctx.closePath();
        ctx.clip();
        const n = pack.ramp.length;
        for (let j = 0; j < 12; j++) {
          ctx.fillStyle = pack.ramp[j % n];
          const x = t.x0 - camX + j * 14;
          ctx.beginPath();
          ctx.moveTo(x, screenY(0) + 4);
          ctx.lineTo(x + 14, screenY(0) + 4);
          ctx.lineTo(x + 14 + 40, screenY(t.h) - 10);
          ctx.lineTo(x + 40, screenY(t.h) - 10);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = pack.rampEdge;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let wx = t.x0; wx <= t.x1 + t.back; wx += 3) {
          const p = [wx - camX, screenY(groundAt(tr, wx))] as const;
          if (wx === t.x0) ctx.moveTo(...p);
          else ctx.lineTo(...p);
        }
        ctx.stroke();
        // chevrons
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (let j = 0; j < 2; j++) {
          const wx = t.x0 + 50 + j * 22;
          const y = screenY(groundAt(tr, wx)) + 14;
          const x = wx - camX;
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x + 8, y);
          ctx.lineTo(x, y + 6);
          ctx.lineTo(x + 3, y);
          ctx.closePath();
          ctx.fill();
        }
      }

      // mud
      for (const m of tr.muds) {
        if (m.x1 < camX - 10 || m.x0 > camX + W + 10) continue;
        const cx = (m.x0 + m.x1) / 2 - camX;
        const w = (m.x1 - m.x0) / 2;
        const y = screenY(0) + 6;
        ctx.fillStyle = pack.mud;
        ctx.beginPath();
        ctx.ellipse(cx, y, w, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pack.mudShine;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.ellipse(cx - w * 0.3, y - 3, w * 0.35, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        const bt = s.time * 2 + m.x0;
        ctx.beginPath();
        ctx.arc(cx + Math.sin(bt) * w * 0.5, y - 1, 2 + (bt % 1) * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // blocks
      for (const b of tr.blocks) {
        if (b.x < camX - 40 || b.x > camX + W + 40) continue;
        const x = b.x - camX;
        const gy = screenY(groundAt(tr, b.x));
        if (b.smashed) {
          ctx.fillStyle = pack.block === "hay" ? "#e7c35a" : "#f9a8d4";
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.ellipse(x, gy - 2, b.w * 0.7, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          continue;
        }
        const top = gy - b.h;
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.ellipse(x, gy + 2, b.w * 0.65, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - b.w / 2, top, b.w, b.h, 7);
        ctx.clip();
        if (pack.block === "hay") {
          ctx.fillStyle = "#f2c94c";
          ctx.fillRect(x - b.w / 2, top, b.w, b.h);
          ctx.strokeStyle = "#c99a1e";
          ctx.lineWidth = 1.5;
          for (let j = 0; j < 7; j++) {
            ctx.beginPath();
            ctx.moveTo(x - b.w / 2, top + 3 + j * 4.2);
            ctx.lineTo(x + b.w / 2, top + 5 + j * 4.2);
            ctx.stroke();
          }
          ctx.fillStyle = "#8b5a2b";
          ctx.fillRect(x - 9, top, 3, b.h);
          ctx.fillRect(x + 6, top, 3, b.h);
        } else {
          ctx.fillStyle = "#fff";
          ctx.fillRect(x - b.w / 2, top, b.w, b.h);
          ctx.fillStyle = "#f472b6";
          for (let j = -3; j < 5; j++) {
            ctx.beginPath();
            ctx.moveTo(x - b.w / 2 + j * 12, gy);
            ctx.lineTo(x - b.w / 2 + j * 12 + 6, gy);
            ctx.lineTo(x - b.w / 2 + j * 12 + 6 + b.h, top);
            ctx.lineTo(x - b.w / 2 + j * 12 + b.h, top);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(x - b.w / 2, top, b.w, 5);
        ctx.restore();
        ctx.strokeStyle = pack.block === "hay" ? "#9a6b12" : "#be185d";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(x - b.w / 2, top, b.w, b.h, 7);
        ctx.stroke();

        // teach: bouncing "JUMP!" over the first blocks of track 1
        const idx = tr.blocks.indexOf(b);
        if (s.level === 1 && idx < 2 && b.x - s.x > 30 && b.x - s.x < 330 && s.phase === "ride") {
          const by = top - 30 + Math.sin(s.time * 8) * 4;
          ctx.font = `900 16px ${fontRef.current}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(60,20,70,0.85)";
          ctx.strokeText("JUMP!", x, by);
          ctx.fillStyle = "#fde047";
          ctx.fillText("JUMP!", x, by);
        }
      }

      // finish line
      const fx = tr.length - camX;
      if (fx > -60 && fx < W + 60) {
        const gy = screenY(groundAt(tr, tr.length));
        // checker strip on the ground
        for (let j = 0; j < 6; j++) {
          for (let r2 = 0; r2 < 2; r2++) {
            ctx.fillStyle = (j + r2) % 2 ? "#111" : "#fff";
            ctx.fillRect(fx - 12 + r2 * 12, gy + j * 7, 12, 7);
          }
        }
        ctx.fillStyle = "#e5e7eb";
        ctx.fillRect(fx - 26, gy - 150, 6, 150);
        ctx.fillRect(fx + 20, gy - 150, 6, 150);
        const wave = Math.sin(s.time * 5) * 3;
        ctx.save();
        ctx.translate(fx - 23, gy - 150);
        for (let j = 0; j < 8; j++) {
          for (let r2 = 0; r2 < 3; r2++) {
            ctx.fillStyle = (j + r2) % 2 ? "#111" : "#fff";
            ctx.fillRect(j * 6, r2 * 8 + Math.sin(s.time * 5 + j * 0.8) * 2 + wave * 0.2, 6, 8);
          }
        }
        ctx.restore();
        ctx.font = `900 15px ${fontRef.current}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(60,20,70,0.85)";
        ctx.strokeText("FINISH", fx, gy - 164);
        ctx.fillStyle = "#fff";
        ctx.fillText("FINISH", fx, gy - 164);
      }

      // gems
      const art = artRef.current;
      for (const gm of tr.gems) {
        if (gm.taken) continue;
        const x = gm.x - camX;
        if (x < -30 || x > W + 30) continue;
        const y = screenY(gm.alt) + Math.sin(s.time * 4 + gm.x) * 4;
        const glow = ctx.createRadialGradient(x, y, 2, x, y, 26);
        glow.addColorStop(0, "rgba(255,255,255,0.8)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 26, y - 26, 52, 52);
        if (ok(art.gem)) {
          const sw = pack.block === "hay" ? Math.abs(Math.cos(s.time * 3 + gm.x)) * 0.8 + 0.2 : 1;
          const sz = 30 + (pack.block === "hay" ? 0 : Math.sin(s.time * 5 + gm.x) * 2);
          ctx.drawImage(art.gem, x - (sz * sw) / 2, y - sz / 2, sz * sw, sz);
        }
        // twinkle
        const tw = (s.time * 2 + gm.x * 0.01) % 1;
        if (tw < 0.4) {
          ctx.fillStyle = `rgba(255,255,255,${1 - tw / 0.4})`;
          const r2 = 4 + tw * 10;
          ctx.beginPath();
          ctx.moveTo(x + 10, y - 12 - r2);
          ctx.lineTo(x + 11.5, y - 13.5);
          ctx.lineTo(x + 10 + r2, y - 12);
          ctx.lineTo(x + 11.5, y - 10.5);
          ctx.lineTo(x + 10, y - 12 + r2);
          ctx.lineTo(x + 8.5, y - 10.5);
          ctx.lineTo(x + 10 - r2, y - 12);
          ctx.lineTo(x + 8.5, y - 13.5);
          ctx.closePath();
          ctx.fill();
        }
      }
    };

    const drawRider = (sx: number) => {
      const s = simRef.current;
      const art = artRef.current;
      const rig = pack.rig;
      const k = pack.riderWidth / rig.w;
      const [w0, w1] = rig.wheels;
      const contactY = ((w0.cy + w0.ry + w1.cy + w1.ry) / 2) * k;
      const midX = ((w0.cx + w1.cx) / 2) * k;
      const gy = screenY(s.alt);
      // shadow on the ground under the bike
      const groundH = groundAt(s.track, s.x);
      const lift = Math.max(0, s.alt - groundH);
      ctx.fillStyle = `rgba(30,20,40,${Math.max(0.06, 0.25 - lift / 600)})`;
      ctx.beginPath();
      ctx.ellipse(sx, screenY(groundH) + 2, 34 * Math.max(0.5, 1 - lift / 300), 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (s.invuln > 0 && Math.floor(s.invuln * 10) % 2 === 0) return;
      ctx.save();
      const vib = s.gas && s.grounded && s.phase === "ride" ? Math.sin(s.time * 60) * 0.6 : 0;
      if (s.phase === "crash") {
        // tumble around the middle of the bike so it never dips into the ground
        const half = (rig.h * k) / 2;
        ctx.translate(sx, gy - half);
        ctx.rotate(s.angle);
        ctx.translate(-midX, -half);
      } else {
        ctx.translate(sx, gy + vib);
        ctx.rotate(s.angle);
        ctx.scale(1 + s.squash * 0.06, 1 - s.squash * 0.12);
        ctx.translate(-midX, -contactY);
      }
      // wheels (spinning)
      const wimgs = [art.wheel0, art.wheel1];
      rig.wheels.forEach((wh, i) => {
        const im = wimgs[i];
        if (!ok(im)) return;
        const size = (2 * wh.S + 1) * k;
        ctx.save();
        ctx.translate(wh.cx * k, wh.cy * k);
        ctx.scale(wh.rx / wh.ry, 1);
        ctx.rotate(s.wheelRot);
        ctx.drawImage(im, -size / 2, -size / 2, size, size);
        ctx.restore();
      });
      if (ok(art.body)) ctx.drawImage(art.body, 0, 0, rig.w * k, rig.h * k);
      ctx.restore();
    };

    const drawParticles = (camX: number) => {
      const s = simRef.current;
      for (const p of s.parts) {
        const f = 1 - p.life / p.max;
        const x = p.x - camX;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, f * 1.5));
        ctx.fillStyle = p.color;
        if (p.kind === "text") {
          const sc = p.life < 0.12 ? 0.6 + (p.life / 0.12) * 0.5 : 1.1;
          ctx.font = `900 ${p.size * sc}px ${fontRef.current}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineWidth = 4;
          ctx.lineJoin = "round";
          ctx.strokeStyle = "rgba(60,20,70,0.85)";
          ctx.strokeText(p.text ?? "", x, p.y);
          ctx.fillText(p.text ?? "", x, p.y);
        } else if (p.kind === "spark") {
          ctx.translate(x, p.y);
          ctx.rotate(p.rot);
          const r = p.size * 1.4;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI) / 4;
            const rr = i % 2 === 0 ? r : r * 0.4;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
        } else if (p.kind === "confetti") {
          ctx.translate(x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.globalAlpha = f * 0.75;
          ctx.beginPath();
          ctx.arc(x, p.y, p.size * (p.kind === "dust" ? 1.6 - f * 0.8 : f + 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    const drawHud = (W: number) => {
      const s = simRef.current;
      const art = artRef.current;
      const font = fontRef.current;
      // hearts
      for (let i = 0; i < HEARTS; i++) {
        const x = 22 + i * 30;
        const y = 24;
        const full = i < s.hearts;
        ctx.save();
        ctx.translate(x, y);
        const pulse = full && s.hearts === 1 ? 1 + Math.sin(s.time * 8) * 0.08 : 1;
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.bezierCurveTo(-14, -2, -8, -14, 0, -6);
        ctx.bezierCurveTo(8, -14, 14, -2, 0, 8);
        ctx.fillStyle = full ? "#f43f5e" : "rgba(255,255,255,0.55)";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
        if (full) {
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.beginPath();
          ctx.arc(-5, -4, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // gems counter
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(W - 92, 8, 84, 32, 16);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      if (ok(art.gem)) ctx.drawImage(art.gem, W - 88, 11, 26, 26);
      ctx.fillStyle = "#3b1d4a";
      ctx.font = `900 18px ${font}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${s.gems}`, W - 56, 25);
      ctx.restore();

      // progress bar
      const px0 = 110;
      const px1 = W - 106;
      const py = 24;
      const prog = Math.min(1, s.x / s.track.length);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(px0, py - 6, px1 - px0, 12, 6);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(px0, py - 6, Math.max(12, (px1 - px0) * prog), 12, 6);
      ctx.fillStyle = pack.block === "hay" ? "#f97316" : "#ec4899";
      ctx.fill();
      // flag
      for (let j = 0; j < 3; j++)
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (j + r) % 2 ? "#111" : "#fff";
          ctx.fillRect(px1 - 2 + j * 5, py - 16 + r * 5, 5, 5);
        }
      ctx.fillStyle = "#6b7280";
      ctx.fillRect(px1 - 3, py - 16, 2, 22);
      // rider dot
      const dx = px0 + (px1 - px0) * prog;
      ctx.beginPath();
      ctx.arc(dx, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = pack.block === "hay" ? "#0d9488" : "#a855f7";
      ctx.stroke();
      ctx.font = `900 11px ${font}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#3b1d4a";
      ctx.fillText(`TRACK ${s.level}`, (px0 + px1) / 2, py + 17);
      ctx.restore();

      // "hold gas" hint
      if (s.phase === "ride" && !s.everGas) {
        const y = H - 40 + Math.sin(s.time * 6) * 5;
        const x = W * 0.25;
        ctx.save();
        ctx.font = `900 18px ${font}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.beginPath();
        ctx.roundRect(x - 80, y - 20, 160, 34, 17);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();
        ctx.fillStyle = "#3b1d4a";
        ctx.fillText("Hold GAS ↓", x, y - 3);
        ctx.restore();
      }
    };

    const draw = () => {
      const s = simRef.current;
      const W = wRef.current;
      prepareCanvas(ctx, W);
      const rx = riderX();
      const camX = s.x - rx;
      ctx.save();
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake * 2, (Math.random() - 0.5) * s.shake * 2);
      drawSky(camX, W);
      drawHills(camX, W, 0.2, pack.farHill, 70, BASE_Y - 40 + s.camY * 0.3, 0);
      ctx.globalAlpha = 0.9;
      drawHills(camX, W, 0.38, pack.midHill, 44, BASE_Y - 4 + s.camY * 0.5, 900);
      ctx.globalAlpha = 1;
      drawMidground(camX, W);
      drawGround(camX, W);
      drawRider(rx);
      drawParticles(camX);
      // speed lines at full throttle
      if (s.speed > MAX_SPEED * 0.92 && s.phase === "ride") {
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const y = 90 + hash(i + Math.floor(s.time * 12)) * (BASE_Y - 120);
          const x = ((s.time * 900 + i * 173) % (W + 100)) - 50;
          ctx.beginPath();
          ctx.moveTo(W - x, y);
          ctx.lineTo(W - x + 40, y);
          ctx.stroke();
        }
      }
      ctx.restore();
      drawHud(W);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (pausedRef.current) return;
      update(dt);
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pack]);

  const riding = phase === "ride" || phase === "crash";

  return (
    <div ref={rootRef} className="game-root">
      <CanvasStage
        width={W}
        height={H}
        canvasRef={canvasRef}
        onPointerDown={(e) => {
          e.preventDefault();
          jump();
        }}
      >
        <GameOverlay
          show={phase === "ready"}
          emoji={pack.block === "hay" ? "🏍️" : "🦄"}
          title={level > 1 ? `Track ${level}` : `${pack.riderName} Bike`}
          subtitle={pack.startCopy}
          actionLabel="Ride!"
          onAction={() => begin(level, true)}
        />
        <GameOverlay
          show={phase === "won"}
          tone="win"
          emoji={
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pack.card} alt="" className="mx-auto h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-md" />
          }
          title={pack.winCopy}
          subtitle={`You got ${result.gems} of ${result.total} ${pack.gemName}!`}
          actionLabel={`Track ${level + 1} →`}
          onAction={() => begin(level + 1, true)}
        />
        <GameOverlay
          show={phase === "lost"}
          tone="lose"
          emoji="💫"
          title="Bumpy ride!"
          subtitle={pack.oopsCopy}
          actionLabel="Try again"
          onAction={() => begin(level, false)}
        />
      </CanvasStage>
      <div className="grid w-full max-w-xl shrink-0 grid-cols-[1.4fr_1fr] gap-3 px-1 pb-1">
        <PadButton
          primary
          label="Gas (hold)"
          onPress={gasOn}
          onRelease={gasOff}
          disabled={!riding || paused}
          className={gasHeld && !paused ? "!min-h-[72px] translate-y-1 text-2xl font-black" : "!min-h-[72px] text-2xl font-black"}
        >
          <span aria-hidden className="text-3xl">
            {gasHeld && !paused ? "💨" : "⛽"}
          </span>
          GAS
        </PadButton>
        <PadButton
          label="Jump"
          onPress={jump}
          disabled={!riding || paused}
          className="!min-h-[72px] text-2xl font-black"
        >
          <span aria-hidden className="text-3xl">
            ⤴️
          </span>
          JUMP
        </PadButton>
      </div>
    </div>
  );
}

