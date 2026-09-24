"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { GameProps } from "@/lib/game-registry";
import {
  CanvasStage,
  GameOverlay,
  PadButton,
  StatPill,
  canvasPoint,
  prepareCanvas,
} from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import {
  FOODS_PER_LEVEL,
  chooseGrid,
  levelFor,
  opposite,
  pickFood,
  smoothPath,
  stepMs,
  tryMove,
  unwrapChain,
  type Dir,
  type Point,
} from "./logic";

/** Game units per grid cell. The canvas is cols*C × rows*C units. */
const C = 40;
const SWIPE_PX = 22;

type Phase = "ready" | "play" | "dead" | "won";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hue: number;
  star: boolean;
};

type Floater = { x: number; y: number; text: string; life: number };

type Game = {
  cols: number;
  rows: number;
  cells: Point[];
  prevTail: Point;
  dir: Dir;
  queue: Dir[];
  food: Point;
  foodAge: number;
  acc: number;
  held: boolean;
  phase: Phase;
  eaten: number;
  parts: Particle[];
  floats: Floater[];
  shake: number;
  gulp: number;
  flash: number;
  time: number;
  faceLeft: boolean;
};

type Skin = {
  head: string;
  food: string;
  treat: string;
  emoji: string;
  tileA: string;
  tileB: string;
  edge: string;
  glow: string;
  hues: number[];
  headScale: number;
};

const SKINS: Record<"keira" | "luke", Skin> = {
  keira: {
    head: "/games/snake/keira-head-cut.png",
    food: "/games/snake/keira-food-cut.png",
    treat: "hearts",
    emoji: "🦄",
    tileA: "#ffe0ef",
    tileB: "#dcf6ea",
    edge: "rgba(236, 72, 153, 0.22)",
    glow: "255, 120, 190",
    hues: [330, 290, 200, 50, 150],
    headScale: 1.55,
  },
  luke: {
    head: "/games/snake/luke-head-cut.png",
    food: "/games/snake/luke-food-cut.png",
    treat: "stars",
    emoji: "🐠",
    tileA: "#8edcff",
    tileB: "#75cdf4",
    edge: "rgba(3, 60, 110, 0.35)",
    glow: "255, 214, 70",
    hues: [48, 40, 190, 20, 170],
    headScale: 1.6,
  },
};

function newGame(cols: number, rows: number): Game {
  const y = Math.max(2, rows - 4);
  return {
    cols,
    rows,
    cells: [
      { x: 4, y },
      { x: 3, y },
      { x: 2, y },
      { x: 1, y },
    ],
    prevTail: { x: 0, y },
    dir: "right",
    queue: [],
    food: { x: Math.min(cols - 2, 8), y },
    foodAge: 1,
    acc: 0,
    held: true,
    phase: "ready",
    eaten: 0,
    parts: [],
    floats: [],
    shake: 0,
    gulp: 0,
    flash: 0,
    time: 0,
    faceLeft: false,
  };
}

/** Tiny deterministic RNG so the board decoration doesn't shimmer on redraw. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  petal: string,
) {
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.35;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function paintBoard(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  skin: Skin,
  keira: boolean,
) {
  const W = cols * C;
  const H = rows * C;
  const rand = rng(cols * 97 + rows * 13 + (keira ? 1 : 2));
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? skin.tileA : skin.tileB;
      ctx.fillRect(x * C, y * C, C, C);
      // Soft top-left light on every tile for a pillowy look.
      const g = ctx.createLinearGradient(x * C, y * C, x * C + C, y * C + C);
      g.addColorStop(0, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x * C, y * C, C, C);
    }
  }
  // Decorations.
  for (let i = 0; i < cols * rows * 0.22; i++) {
    const x = rand() * W;
    const y = rand() * H;
    if (keira) {
      const petal = ["#ffffff", "#fbcfe8", "#e9d5ff", "#bae6fd"][
        Math.floor(rand() * 4)
      ];
      ctx.globalAlpha = 0.55;
      drawFlower(ctx, x, y, 2.2 + rand() * 1.6, petal);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#86efac";
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 4, 3, 1.4, 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + rand() * 3, 0, Math.PI * 2);
      ctx.stroke();
      if (rand() < 0.35) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#fde68a";
        ctx.beginPath();
        ctx.arc(x + 6, y + 3, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
  if (!keira) {
    // Light rays from the surface.
    for (let i = 0; i < 5; i++) {
      const x0 = rand() * W;
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + 40, 0);
      ctx.lineTo(x0 + 140, H * 0.8);
      ctx.lineTo(x0 + 60, H * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Vignette for depth.
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.35,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, skin.edge);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  return img;
}

function ready(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

export default function SnakeGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const keira = profileId === "keira";
  const skin = SKINS[keira ? "keira" : "luke"];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<{ cols: number; rows: number } | null>(null);
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  const gameRef = useRef<Game>(newGame(10, 16));
  const [phase, setPhase] = useState<Phase>("ready");
  const [showEnd, setShowEnd] = useState(false);
  const [eaten, setEaten] = useState(0);
  const pausedRef = useRef(paused);
  const skinRef = useRef(skin);
  const keiraRef = useRef(keira);
  const imgsRef = useRef<{ head?: HTMLImageElement; food?: HTMLImageElement }>(
    {},
  );
  const endTimer = useRef<number | null>(null);
  const swipe = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const scoreCb = useRef(onScoreChange);
  const showEndRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
    skinRef.current = skin;
    keiraRef.current = keira;
    scoreCb.current = onScoreChange;
    showEndRef.current = showEnd;
  });

  useEffect(() => {
    imgsRef.current = {
      head: loadImage(skin.head),
      food: loadImage(skin.food),
    };
  }, [skin.head, skin.food]);

  // Pick a board shape that fills the stage (only between rounds).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 50 || r.height < 50) return;
      if (gameRef.current.phase === "play") return;
      const g = chooseGrid(r.width, r.height);
      const cur = gridRef.current;
      if (cur && cur.cols === g.cols && cur.rows === g.rows) return;
      gridRef.current = g;
      gameRef.current = newGame(g.cols, g.rows);
      setGrid(g);
      setPhase("ready");
      setShowEnd(false);
      setEaten(0);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (endTimer.current) window.clearTimeout(endTimer.current);
    },
    [],
  );

  const start = useCallback(() => {
    const cur = gameRef.current;
    if (cur.phase === "play") return;
    if (cur.phase !== "ready") gameRef.current = newGame(cur.cols, cur.rows);
    gameRef.current.phase = "play";
    gameRef.current.held = true; // first update moves at once, no visual jump
    gameRef.current.acc = stepMs(0);
    setPhase("play");
    setShowEnd(false);
    setEaten(0);
    scoreCb.current?.(0);
    sfx("pop");
  }, []);

  const steer = useCallback(
    (d: Dir) => {
      const g = gameRef.current;
      if (pausedRef.current) return;
      if (g.phase !== "play") {
        if (g.phase === "ready") {
          start();
          if (!opposite(d, "right") && d !== "right") g.queue.push(d);
        }
        return;
      }
      const last = g.queue.at(-1) ?? g.dir;
      if (d === last || opposite(d, last) || g.queue.length >= 3) return;
      g.queue.push(d);
      haptic(6);
    },
    [start],
  );

  // Keyboard.
  useEffect(() => {
    const map: Record<string, Dir> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
    };
    const onKey = (e: KeyboardEvent) => {
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        steer(d);
      } else if (e.key === " " || e.key === "Enter") {
        const g = gameRef.current;
        if (g.phase === "ready" || (g.phase !== "play" && showEndRef.current)) {
          e.preventDefault();
          start();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steer, start]);

  // Main loop — mounted once per board shape; reads everything via refs.
  useEffect(() => {
    if (!grid) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = grid.cols * C;
    const H = grid.rows * C;
    let bg: HTMLCanvasElement | null = null;
    let bgKey = "";
    let raf = 0;
    let last = performance.now();

    const burst = (cx: number, cy: number, n: number, speed: number) => {
      const g = gameRef.current;
      const hues = skinRef.current.hues;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        g.parts.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 40,
          life: 0,
          max: 0.5 + Math.random() * 0.45,
          size: 3 + Math.random() * 4,
          hue: hues[i % hues.length] + Math.random() * 20,
          star: Math.random() < 0.45,
        });
      }
    };

    const endRound = (won: boolean) => {
      const g = gameRef.current;
      g.phase = won ? "won" : "dead";
      setPhase(g.phase);
      if (endTimer.current) window.clearTimeout(endTimer.current);
      endTimer.current = window.setTimeout(() => setShowEnd(true), 900);
    };

    const step = () => {
      const g = gameRef.current;
      const res = tryMove(g);
      if (res.kind === "blocked") {
        if (!g.held) {
          // One step of grace: freeze and wobble so a quick turn can save it.
          g.held = true;
          sfx("hit", { pitch: 0.8 });
          haptic(20);
          return;
        }
        const h = g.cells[0];
        burst((h.x + 0.5) * C, (h.y + 0.5) * C, 26, 220);
        g.shake = 12;
        g.flash = 0.5;
        sfx("lose");
        haptic(60);
        endRound(false);
        return;
      }
      g.held = false;
      g.dir = res.dir;
      g.queue = res.queue;
      g.prevTail = res.prevTail;
      g.cells = res.cells;
      if (res.ate) {
        const fx = (g.food.x + 0.5) * C;
        const fy = (g.food.y + 0.5) * C;
        g.eaten += 1;
        g.gulp = 1;
        burst(fx, fy, 16, 160);
        g.floats.push({ x: fx, y: fy - 10, text: "+1", life: 0 });
        const lvlBefore = levelFor(g.eaten - 1);
        const lvl = levelFor(g.eaten);
        sfx("coin", { pitch: 1 + ((g.eaten - 1) % FOODS_PER_LEVEL) * 0.08 });
        haptic(15);
        if (lvl > lvlBefore) {
          window.setTimeout(() => sfx("levelUp"), 160);
          g.floats.push({
            x: W / 2,
            y: H / 2,
            text: `Level ${lvl}!`,
            life: -0.2,
          });
        }
        setEaten(g.eaten);
        scoreCb.current?.(g.eaten);
        const next = pickFood(g.cells, g.cols, g.rows);
        if (!next) {
          sfx("win");
          endRound(true);
          return;
        }
        g.food = next;
        g.foodAge = 0;
      }
    };

    const update = (dt: number) => {
      const g = gameRef.current;
      g.time += dt;
      if (g.phase === "play") {
        const ms = stepMs(g.eaten);
        g.acc += dt * 1000;
        if (g.acc >= ms) {
          g.acc -= ms;
          if (g.acc > ms) g.acc = 0;
          step();
        }
      }
      g.foodAge += dt;
      g.gulp = Math.max(0, g.gulp - dt * 4);
      g.shake = Math.max(0, g.shake - dt * 40);
      g.flash = Math.max(0, g.flash - dt * 1.5);
      g.parts = g.parts.filter((p) => {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt;
        p.vx *= 1 - 1.5 * dt;
        return p.life < p.max;
      });
      g.floats = g.floats.filter((f) => {
        f.life += dt;
        f.y -= 40 * dt;
        return f.life < 1.1;
      });
    };

    const drawSnake = (pts: Point[], ox: number, oy: number, time: number) => {
      const g = gameRef.current;
      const isKeira = keiraRef.current;
      const n = pts.length;
      const dist: number[] = [0];
      for (let i = 1; i < n; i++) {
        dist.push(
          dist[i - 1] +
            Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
        );
      }
      const total = Math.max(0.001, dist[n - 1]);
      const widthAt = (i: number) => {
        const f = dist[i] / total;
        const tail = Math.min(1, (total - dist[i]) / 1.6); // taper last 1.6 cells
        return C * (0.52 + 0.3 * (1 - f * 0.4)) * (0.45 + 0.55 * tail);
      };
      const X = (p: Point) => p.x * C + ox;
      const Y = (p: Point) => p.y * C + oy;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pass = (
        color: (i: number) => string,
        wMul: number,
        wAdd: number,
        dx: number,
        dy: number,
        from = 0,
      ) => {
        for (let i = n - 1; i >= Math.max(1, from); i--) {
          ctx.strokeStyle = color(i);
          ctx.lineWidth = widthAt(i) * wMul + wAdd;
          ctx.beginPath();
          ctx.moveTo(X(pts[i]) + dx, Y(pts[i]) + dy);
          ctx.lineTo(X(pts[i - 1]) + dx, Y(pts[i - 1]) + dy);
          ctx.stroke();
        }
      };
      // Translucent layers are filled as one ribbon polygon so overlapping
      // round caps don't show up as beads.
      const ribbon = (
        fill: string,
        wMul: number,
        dx: number,
        dy: number,
        from = 0,
      ) => {
        if (n - from < 2) return;
        const L: Point[] = [];
        const R: Point[] = [];
        const A: number[] = [];
        for (let i = from; i < n; i++) {
          const a = pts[Math.max(from, i - 1)];
          const b = pts[Math.min(n - 1, i + 1)];
          let tx = b.x - a.x;
          let ty = b.y - a.y;
          const len = Math.hypot(tx, ty) || 1;
          tx /= len;
          ty /= len;
          const hw = (widthAt(i) * wMul) / 2;
          const px = X(pts[i]) + dx;
          const py = Y(pts[i]) + dy;
          L.push({ x: px - ty * hw, y: py + tx * hw });
          R.push({ x: px + ty * hw, y: py - tx * hw });
          A.push(Math.atan2(tx, -ty));
        }
        const m = L.length - 1;
        const r0 = (widthAt(from) * wMul) / 2;
        const r1 = (widthAt(n - 1) * wMul) / 2;
        ctx.beginPath();
        ctx.moveTo(L[0].x, L[0].y);
        for (let i = 1; i <= m; i++) ctx.lineTo(L[i].x, L[i].y);
        ctx.arc(
          X(pts[n - 1]) + dx,
          Y(pts[n - 1]) + dy,
          r1,
          A[m],
          A[m] + Math.PI,
          true,
        );
        for (let i = m; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
        ctx.arc(
          X(pts[from]) + dx,
          Y(pts[from]) + dy,
          r0,
          A[0] + Math.PI,
          A[0],
          true,
        );
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      // Drop shadow.
      ribbon("rgba(40, 20, 60, 0.18)", 1, 3, 6);
      // Outline.
      pass(() => (isKeira ? "#c084fc" : "#0b6b66"), 1, 4, 0, 0);
      // Body.
      pass(
        (i) =>
          isKeira
            ? `hsl(${(dist[i] * 34 - time * 60 + 3600) % 360} 92% 70%)`
            : `hsl(${174 + Math.sin(dist[i] * 1.3) * 4} 60% ${44 + Math.sin(dist[i] * 3.1) * 3}%)`,
        1,
        0,
        0,
        0,
      );
      // Belly shading (lower edge a little darker).
      ribbon(
        isKeira ? "rgba(190, 90, 200, 0.16)" : "rgba(3, 60, 70, 0.22)",
        0.45,
        0,
        C * 0.14,
      );
      // Spots / sparkles along the back.
      for (let d = 0.9; d < total - 0.6; d += 0.9) {
        let i = 1;
        while (i < n - 1 && dist[i] < d) i++;
        const p = pts[i];
        const w = widthAt(i);
        if (isKeira) {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          const tw = 0.6 + 0.4 * Math.sin(time * 5 + d * 2);
          drawStar(ctx, X(p) - w * 0.12, Y(p) - w * 0.12, w * 0.16 * tw);
        } else {
          ctx.fillStyle = "#fb923c";
          ctx.beginPath();
          ctx.arc(X(p), Y(p) - w * 0.08, w * 0.17, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(X(p) - w * 0.05, Y(p) - w * 0.13, w * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Glossy highlight.
      ribbon("rgba(255,255,255,0.5)", 0.22, -C * 0.07, -C * 0.12, 2);

      // Head sprite.
      const h = pts[0];
      const back = pts[Math.min(3, n - 1)];
      let ang = Math.atan2(h.y - back.y, h.x - back.x);
      if (g.phase === "play" && g.held) ang += Math.sin(time * 40) * 0.12;
      const img = imgsRef.current.head;
      const hs = C * skinRef.current.headScale;
      const hx = X(h) + Math.cos(ang) * C * 0.12;
      const hy = Y(h) + Math.sin(ang) * C * 0.12;
      ctx.save();
      ctx.translate(hx, hy);
      // Keep the face upright: mirror for left, tilt (not flip) for up/down.
      const cos = Math.cos(ang);
      if (Math.abs(cos) > 0.3) g.faceLeft = cos < 0;
      let tilt = g.faceLeft ? Math.PI - ang : ang;
      tilt = Math.atan2(Math.sin(tilt), Math.cos(tilt));
      tilt = Math.max(-0.95, Math.min(0.95, tilt));
      if (g.faceLeft) ctx.scale(-1, 1);
      ctx.rotate(tilt);
      const sq = g.gulp;
      ctx.scale(1 + sq * 0.22, 1 - sq * 0.12);
      if (ready(img)) {
        const aspect = img.naturalWidth / img.naturalHeight;
        const w = aspect >= 1 ? hs : hs * aspect;
        const hh = aspect >= 1 ? hs / aspect : hs;
        ctx.shadowColor = "rgba(40,20,60,0.25)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 4;
        ctx.drawImage(img, -w / 2, -hh / 2, w, hh);
      } else {
        ctx.fillStyle = isKeira ? "#e9d5ff" : "#14b8a6";
        ctx.beginPath();
        ctx.arc(0, 0, C * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const draw = () => {
      const g = gameRef.current;
      const k = prepareCanvas(ctx, W);
      const s = skinRef.current;
      const isKeira = keiraRef.current;
      const key = `${canvas.width}x${canvas.height}-${isKeira}`;
      if (!bg || bgKey !== key) {
        bg = document.createElement("canvas");
        bg.width = canvas.width;
        bg.height = canvas.height;
        const bctx = bg.getContext("2d");
        if (bctx) {
          bctx.setTransform(k, 0, 0, k, 0, 0);
          paintBoard(bctx, g.cols, g.rows, s, isKeira);
        }
        bgKey = key;
      }
      ctx.save();
      if (g.shake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * g.shake,
          (Math.random() - 0.5) * g.shake,
        );
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.restore();

      const t = g.time;
      // Ambient life: twinkles / bubbles.
      for (let i = 0; i < 9; i++) {
        const r = rng(i * 31 + 7);
        const x = r() * W;
        if (isKeira) {
          const y = r() * H;
          const a = Math.max(0, Math.sin(t * 1.6 + i * 1.7));
          ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`;
          drawStar(ctx, x, y, 3 + 4 * a);
        } else {
          const speed = 18 + r() * 20;
          const y = H - ((t * speed + r() * H) % (H + 20));
          ctx.strokeStyle = "rgba(255,255,255,0.55)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(
            x + Math.sin(t * 2 + i) * 4,
            y,
            2.5 + (i % 3),
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
      }

      // Food.
      const fx = (g.food.x + 0.5) * C;
      const fy = (g.food.y + 0.5) * C;
      const pop = Math.min(1, g.foodAge / 0.35);
      const back = 1.70158;
      const pe =
        1 + (back + 1) * Math.pow(pop - 1, 3) + back * Math.pow(pop - 1, 2);
      const bob = Math.sin(t * 3) * 2.5;
      const glow = ctx.createRadialGradient(fx, fy, 2, fx, fy, C * 0.9);
      glow.addColorStop(0, `rgba(${s.glow}, ${0.55 + 0.15 * Math.sin(t * 4)})`);
      glow.addColorStop(1, `rgba(${s.glow}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy, C * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(40,20,60,0.15)";
      ctx.beginPath();
      ctx.ellipse(
        fx,
        fy + C * 0.36,
        C * 0.3 * pe,
        C * 0.09 * pe,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      const fimg = imgsRef.current.food;
      const fs = C * 0.95 * pe * (1 + Math.sin(t * 5) * 0.04);
      if (ready(fimg)) {
        ctx.drawImage(fimg, fx - fs / 2, fy - fs / 2 + bob - 3, fs, fs);
      } else {
        ctx.fillStyle = isKeira ? "#f472b6" : "#facc15";
        ctx.beginPath();
        ctx.arc(fx, fy + bob, fs * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Snake — interpolated between grid steps for smooth gliding.
      const tt =
        g.phase === "play" && !g.held
          ? Math.min(1, g.acc / stepMs(g.eaten))
          : 1;
      const U = unwrapChain(g.cells, g.prevTail, g.cols, g.rows);
      const pts = smoothPath(U, tt).map((p) => ({
        x: p.x + 0.5,
        y: p.y + 0.5,
      }));
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      // Draw wrapped copies where the snake crosses an edge.
      for (const sx of [-1, 0, 1]) {
        if (sx === -1 && maxX < g.cols - 1) continue;
        if (sx === 1 && minX > 1) continue;
        for (const sy of [-1, 0, 1]) {
          if (sy === -1 && maxY < g.rows - 1) continue;
          if (sy === 1 && minY > 1) continue;
          drawSnake(pts, sx * W, sy * H, t);
        }
      }

      // Particles.
      for (const p of g.parts) {
        const a = 1 - p.life / p.max;
        ctx.fillStyle = `hsla(${p.hue} 95% ${isKeira ? 72 : 60}% / ${a})`;
        if (p.star) drawStar(ctx, p.x, p.y, p.size * 1.4);
        else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Floating text.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of g.floats) {
        if (f.life < 0) continue;
        const big = f.text.startsWith("Level");
        const a = Math.min(1, 2.4 - f.life * 2.2);
        const sc = Math.min(1, f.life * 6) * (big ? 1 : 0.8);
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(f.x, f.y);
        ctx.scale(sc, sc);
        ctx.font = `900 ${big ? 44 : 26}px ui-rounded, system-ui, sans-serif`;
        ctx.lineWidth = big ? 8 : 6;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = isKeira ? "#db2777" : "#0369a1";
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
      if (g.flash > 0) {
        ctx.fillStyle = `rgba(255,80,120,${g.flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (!pausedRef.current) update(dt);
      draw();
    };
    raf = requestAnimationFrame(frame);
    // Dev-only peek used by automated play-throughs.
    const w = window as unknown as { __snakeState?: () => unknown };
    if (process.env.NODE_ENV !== "production") {
      w.__snakeState = () => {
        const g = gameRef.current;
        return {
          cells: g.cells,
          food: g.food,
          dir: g.dir,
          cols: g.cols,
          rows: g.rows,
          phase: g.phase,
        };
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      delete w.__snakeState;
    };
  }, [grid]);

  // Swipe anywhere on the board; tap turns toward the tap.
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      moved: false,
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? "right" : "left");
    else steer(dy > 0 ? "down" : "up");
    swipe.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      moved: true,
    };
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.moved || s.id !== e.pointerId) return;
    const g = gameRef.current;
    if (g.phase !== "play" || !canvasRef.current || !grid) return;
    const p = canvasPoint(e, canvasRef.current, grid.cols * C, grid.rows * C);
    const h = g.cells[0];
    const dx = p.x - (h.x + 0.5) * C;
    const dy = p.y - (h.y + 0.5) * C;
    const cur = g.queue.at(-1) ?? g.dir;
    if (cur === "left" || cur === "right") {
      if (Math.abs(dy) > C * 0.5) steer(dy > 0 ? "down" : "up");
    } else if (Math.abs(dx) > C * 0.5) steer(dx > 0 ? "right" : "left");
  };

  const level = levelFor(eaten);
  const inLevel = eaten % FOODS_PER_LEVEL;

  return (
    <div className="game-root select-none">
      <div
        ref={boxRef}
        className="relative flex min-h-0 w-full flex-1 touch-none flex-col"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        {grid ? (
          <CanvasStage
            width={grid.cols * C}
            height={grid.rows * C}
            canvasRef={canvasRef}
          >
            <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5">
              <StatPill className="bg-white/85">⭐ Level {level}</StatPill>
              <StatPill className="gap-1 bg-white/85 px-2.5">
                {Array.from({ length: FOODS_PER_LEVEL }, (_, i) => (
                  <span
                    key={i}
                    className={
                      i < inLevel
                        ? "size-2.5 rounded-full bg-[var(--accent)]"
                        : "size-2.5 rounded-full bg-[var(--ink)]/15"
                    }
                  />
                ))}
              </StatPill>
            </div>
            <GameOverlay
              show={phase === "ready"}
              emoji={skin.emoji}
              title="Tap to start"
              subtitle={`Swipe or tap the arrows to steer. Gobble the ${skin.treat}!`}
              actionLabel="Let's go!"
              onAction={start}
            />
            <GameOverlay
              show={showEnd && (phase === "dead" || phase === "won")}
              emoji={phase === "won" ? "🏆" : keira ? "🌈" : "💫"}
              tone={phase === "won" ? "win" : "lose"}
              title={phase === "won" ? "You filled it all!" : "Oops, bonk!"}
              subtitle={`You gobbled ${eaten} ${skin.treat} and reached level ${level}.`}
              actionLabel="Play again"
              onAction={start}
            />
          </CanvasStage>
        ) : null}
      </div>
      <div className="grid w-full max-w-md shrink-0 grid-cols-4 gap-2">
        <PadButton label="Left" onPress={() => steer("left")}>
          <ArrowLeft className="size-7" strokeWidth={3.5} />
        </PadButton>
        <PadButton label="Up" onPress={() => steer("up")}>
          <ArrowUp className="size-7" strokeWidth={3.5} />
        </PadButton>
        <PadButton label="Down" onPress={() => steer("down")}>
          <ArrowDown className="size-7" strokeWidth={3.5} />
        </PadButton>
        <PadButton label="Right" onPress={() => steer("right")}>
          <ArrowRight className="size-7" strokeWidth={3.5} />
        </PadButton>
      </div>
    </div>
  );
}
