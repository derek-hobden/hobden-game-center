"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  RotateCw,
} from "lucide-react";
import type { GameProps } from "@/lib/game-registry";
import {
  CanvasStage,
  GameOverlay,
  PadButton,
  StatPill,
  prepareCanvas,
} from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import {
  PIECE_KINDS,
  SHAPES,
  TETRIS_COLS as COLS,
  TETRIS_ROWS as ROWS,
  bgSrc,
  kindFill,
  tetrisPack,
  tilesSrc,
  type PieceKind,
} from "./theme";
import {
  LINES_PER_LEVEL,
  LINE_POINTS,
  collides,
  dropDistance,
  emptyBoard,
  fullRows,
  gravityMs,
  levelFor,
  lockPiece,
  newBag,
  removeRows,
  spawnPiece,
  tryRotate,
  type Board,
  type Piece,
} from "./logic";

/** Game units per cell. */
const C = 40;
const W = COLS * C;
const H = ROWS * C;
const LOCK_DELAY = 0.5;
const CLEAR_TIME = 0.38;
const SOFT_MS = 45;
const REPEAT_DELAY = 200;
const REPEAT_EVERY = 85;

type Phase = "ready" | "play" | "over";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  spark: boolean;
};

type Floater = {
  x: number;
  y: number;
  text: string;
  life: number;
  big: boolean;
};

type Game = {
  board: Board;
  piece: Piece | null;
  bag: PieceKind[];
  next: PieceKind;
  phase: Phase;
  lines: number;
  score: number;
  acc: number;
  lockT: number;
  lockResets: number;
  soft: boolean;
  clearing: { rows: number[]; t: number } | null;
  fell: number[];
  vx: number;
  vy: number;
  parts: Particle[];
  floats: Floater[];
  trail: {
    cols: { x: number; y0: number; y1: number }[];
    kind: PieceKind;
    t: number;
  } | null;
  land: number;
  shake: number;
  pop: number;
  time: number;
};

function takeKind(g: Pick<Game, "bag">) {
  if (g.bag.length === 0) g.bag = newBag();
  return g.bag.pop()!;
}

function freshGame(): Game {
  const g: Game = {
    board: emptyBoard(),
    piece: null,
    bag: newBag(),
    next: "t",
    phase: "ready",
    lines: 0,
    score: 0,
    acc: 0,
    lockT: 0,
    lockResets: 0,
    soft: false,
    clearing: null,
    fell: Array(ROWS).fill(0),
    vx: 0,
    vy: 0,
    parts: [],
    floats: [],
    trail: null,
    land: 0,
    shake: 0,
    pop: 0,
    time: 0,
  };
  g.piece = spawnPiece(takeKind(g));
  g.next = takeKind(g);
  g.vx = g.piece.x;
  g.vy = g.piece.y;
  return g;
}

function subscribeLandscape(cb: () => void) {
  const mq = window.matchMedia(
    "(orientation: landscape) and (min-width: 640px)",
  );
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getLandscape = () =>
  window.matchMedia("(orientation: landscape) and (min-width: 640px)").matches;

/** Next-piece preview drawn with the same tile art (DOM, no canvas). */
function NextPreview({ kind, sheet }: { kind: PieceKind; sheet: string }) {
  const shape = SHAPES[kind].filter((row) => row.some(Boolean));
  const colsUsed = shape[0]
    .map((_, c) => shape.some((row) => row[c]))
    .map((v, c) => (v ? c : -1))
    .filter((c) => c >= 0);
  const c0 = colsUsed[0];
  const w = colsUsed.length;
  const idx = PIECE_KINDS.indexOf(kind);
  const tile: CSSProperties = {
    backgroundImage: `url(${sheet})`,
    backgroundSize: "700% 100%",
    backgroundPosition: `${(idx / 6) * 100}% 0`,
  };
  return (
    <div
      key={kind}
      className="card-pop grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${w}, 1rem)` }}
    >
      {shape.flatMap((row, r) =>
        row
          .slice(c0, c0 + w)
          .map((v, c) => (
            <span
              key={`${r}-${c}`}
              className="size-4 rounded-[4px]"
              style={v ? tile : undefined}
            />
          )),
      )}
    </div>
  );
}

function roundRectPath(
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

export default function TetrisGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const pack = tetrisPack(profileId);
  const isKeira = profileId === "keira";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [initialGame] = useState(freshGame);
  const gameRef = useRef<Game>(initialGame);
  const pausedRef = useRef(paused);
  const packRef = useRef(pack);
  const isKeiraRef = useRef(isKeira);
  const scoreCb = useRef(onScoreChange);
  const imgs = useRef<{ tiles?: HTMLImageElement; bg?: HTMLImageElement }>({});
  const repeat = useRef<{ t1: number | null; t2: number | null }>({
    t1: null,
    t2: null,
  });
  const gesture = useRef<{
    id: number;
    sx: number;
    sy: number;
    ax: number;
    ay: number;
    t0: number;
    moved: boolean;
    dropped: boolean;
  } | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState({ lines: 0, next: initialGame.next });
  const landscape = useSyncExternalStore(
    subscribeLandscape,
    getLandscape,
    () => false,
  );

  useEffect(() => {
    pausedRef.current = paused;
    packRef.current = pack;
    isKeiraRef.current = isKeira;
    scoreCb.current = onScoreChange;
  });

  useEffect(() => {
    const tiles = new Image();
    tiles.src = tilesSrc(pack.prefix);
    const bg = new Image();
    bg.src = bgSrc(pack.prefix);
    imgs.current = { tiles, bg };
  }, [pack.prefix]);

  const syncHud = useCallback(() => {
    const g = gameRef.current;
    setHud({ lines: g.lines, next: g.next });
  }, []);

  const start = useCallback(() => {
    if (gameRef.current.phase === "play") return;
    if (gameRef.current.phase === "over") gameRef.current = freshGame();
    gameRef.current.phase = "play";
    gameRef.current.acc = 0;
    setPhase("play");
    syncHud();
    scoreCb.current?.(0);
    sfx("pop");
  }, [syncHud]);

  const canAct = () => {
    const g = gameRef.current;
    return g.phase === "play" && !pausedRef.current && !g.clearing && g.piece;
  };

  const touchLock = () => {
    const g = gameRef.current;
    if (!g.piece) return;
    if (collides(g.board, g.piece, 0, 1) && g.lockResets < 15) {
      g.lockT = 0;
      g.lockResets += 1;
    }
  };

  const shift = useCallback((dx: number) => {
    const g = gameRef.current;
    if (!canAct() || !g.piece) return false;
    if (collides(g.board, g.piece, dx, 0)) {
      return false;
    }
    g.piece.x += dx;
    touchLock();
    sfx("tap", { pitch: 1.3 });
    return true;
  }, []);

  const rotate = useCallback(() => {
    const g = gameRef.current;
    if (g.phase === "ready") {
      start();
      return;
    }
    if (!canAct() || !g.piece) return;
    if (tryRotate(g.board, g.piece)) {
      g.pop = 1;
      touchLock();
      sfx("flip");
      haptic(8);
    } else {
      sfx("miss", { pitch: 1.4 });
    }
  }, [start]);

  const softStep = useCallback(() => {
    const g = gameRef.current;
    if (!canAct() || !g.piece) return;
    if (!collides(g.board, g.piece, 0, 1)) {
      g.piece.y += 1;
      g.acc = 0;
    }
  }, []);

  const hardDrop = useCallback(() => {
    const g = gameRef.current;
    if (!canAct() || !g.piece) return;
    const p = g.piece;
    const d = dropDistance(g.board, p);
    const cols: { x: number; y0: number; y1: number }[] = [];
    p.shape.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        const x = p.x + c;
        const top = p.y + r;
        const e = cols.find((k) => k.x === x);
        if (!e) cols.push({ x, y0: top, y1: top + d });
        else {
          e.y0 = Math.min(e.y0, top);
          e.y1 = Math.max(e.y1, top + d);
        }
      }),
    );
    g.trail = { cols, kind: p.kind, t: 0 };
    p.y += d;
    g.vy = p.y;
    g.lockT = LOCK_DELAY; // lock on the next frame
    g.lockResets = 99;
    g.land = 1;
    g.shake = Math.min(8, 3 + d * 0.4);
    sfx("drop");
    haptic(25);
  }, []);

  const setSoft = useCallback((on: boolean) => {
    const g = gameRef.current;
    g.soft = on;
    if (on) g.acc = SOFT_MS;
  }, []);

  const stopRepeat = useCallback(() => {
    const r = repeat.current;
    if (r.t1) window.clearTimeout(r.t1);
    if (r.t2) window.clearInterval(r.t2);
    r.t1 = null;
    r.t2 = null;
  }, []);

  const startRepeat = useCallback(
    (dx: number) => {
      stopRepeat();
      shift(dx);
      repeat.current.t1 = window.setTimeout(() => {
        repeat.current.t2 = window.setInterval(() => shift(dx), REPEAT_EVERY);
      }, REPEAT_DELAY);
    },
    [shift, stopRepeat],
  );

  useEffect(() => stopRepeat, [stopRepeat]);
  useEffect(() => {
    if (paused) {
      stopRepeat();
      setSoft(false);
    }
  }, [paused, stopRepeat, setSoft]);

  // Keyboard.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (g.phase !== "play") {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          start();
        }
        return;
      }
      switch (e.key) {
        case "ArrowLeft":
        case "a":
          e.preventDefault();
          shift(-1);
          break;
        case "ArrowRight":
        case "d":
          e.preventDefault();
          shift(1);
          break;
        case "ArrowDown":
        case "s":
          e.preventDefault();
          if (!e.repeat) setSoft(true);
          break;
        case "ArrowUp":
        case "w":
        case "x":
          e.preventDefault();
          if (!e.repeat) rotate();
          break;
        case " ":
          e.preventDefault();
          if (!e.repeat) hardDrop();
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "s") setSoft(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [shift, rotate, hardDrop, setSoft, start]);

  // Game loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();

    const burst = (
      x: number,
      y: number,
      n: number,
      color: string,
      speed = 180,
    ) => {
      const g = gameRef.current;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random());
        g.parts.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 80,
          life: 0,
          max: 0.45 + Math.random() * 0.5,
          size: 3 + Math.random() * 4,
          color,
          spark: Math.random() < 0.4,
        });
      }
    };

    const gameOver = () => {
      const g = gameRef.current;
      g.phase = "over";
      g.shake = 10;
      sfx("lose");
      haptic(80);
      window.setTimeout(() => setPhase("over"), 600);
    };

    const spawnNext = () => {
      const g = gameRef.current;
      const p = spawnPiece(g.next);
      g.next = takeKind(g);
      g.piece = p;
      g.vx = p.x;
      g.vy = p.y - 0.6;
      g.acc = 0;
      g.lockT = 0;
      g.lockResets = 0;
      g.pop = 0.6;
      setHud({ lines: g.lines, next: g.next });
      if (collides(g.board, p)) {
        g.piece = null;
        gameOver();
      }
    };

    const lock = () => {
      const g = gameRef.current;
      const p = g.piece;
      if (!p) return;
      const ok = lockPiece(g.board, p);
      g.piece = null;
      if (!ok) {
        gameOver();
        return;
      }
      if (!g.land) g.land = 0.5;
      // Little puff under the piece.
      p.shape.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return;
          const below = p.y + r + 1;
          if (below >= ROWS || g.board[below][p.x + c]) {
            for (let i = 0; i < 2; i++) {
              g.parts.push({
                x: (p.x + c + Math.random()) * C,
                y: (p.y + r + 1) * C,
                vx: (Math.random() - 0.5) * 80,
                vy: -30 - Math.random() * 40,
                life: 0,
                max: 0.35,
                size: 2.5,
                color: "rgba(255,255,255,0.8)",
                spark: false,
              });
            }
          }
        }),
      );
      const rows = fullRows(g.board);
      if (rows.length) {
        g.clearing = { rows, t: 0 };
        const n = rows.length;
        const level = levelFor(g.lines);
        const add = LINE_POINTS[n] * level;
        g.score += add;
        scoreCb.current?.(g.score);
        for (const r of rows) {
          for (let c = 0; c < COLS; c++) {
            const k = g.board[r][c];
            if (k)
              burst(
                (c + 0.5) * C,
                (r + 0.5) * C,
                3,
                kindFill(k, isKeiraRef.current),
                220,
              );
          }
        }
        const cheer = packRef.current.cheers[n - 1];
        const cy = Math.min(
          H - 120,
          (rows.reduce((a, b) => a + b, 0) / n + 0.5) * C - 30,
        );
        g.floats.push({ x: W / 2, y: cy, text: cheer, life: 0, big: true });
        g.floats.push({
          x: W / 2,
          y: cy + 46,
          text: `+${add}`,
          life: -0.1,
          big: false,
        });
        g.shake = 4 + n * 2;
        sfx(n >= 4 ? "win" : "clear", { pitch: 1 + (n - 1) * 0.12 });
        haptic(30 + n * 15);
      } else {
        sfx("tap", { pitch: 0.7 });
        spawnNext();
      }
    };

    const finishClear = () => {
      const g = gameRef.current;
      if (!g.clearing) return;
      const before = levelFor(g.lines);
      const { board, fell } = removeRows(g.board, g.clearing.rows);
      g.board = board;
      g.fell = fell;
      g.lines += g.clearing.rows.length;
      g.clearing = null;
      const after = levelFor(g.lines);
      if (after > before) {
        sfx("levelUp");
        g.floats.push({
          x: W / 2,
          y: H * 0.35,
          text: `Level ${after}!`,
          life: -0.15,
          big: true,
        });
      }
      spawnNext();
    };

    const update = (dt: number) => {
      const g = gameRef.current;
      g.time += dt;
      g.land = Math.max(0, g.land - dt * 5);
      g.shake = Math.max(0, g.shake - dt * 30);
      g.pop = Math.max(0, g.pop - dt * 6);
      g.fell = g.fell.map((f) => Math.max(0, f - dt * 14));
      if (g.trail) {
        g.trail.t += dt;
        if (g.trail.t > 0.28) g.trail = null;
      }
      g.parts = g.parts.filter((p) => {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * dt;
        return p.life < p.max;
      });
      g.floats = g.floats.filter((f) => {
        f.life += dt;
        if (f.life > 0) f.y -= 30 * dt;
        return f.life < 1.2;
      });

      if (g.phase !== "play") return;
      if (g.clearing) {
        g.clearing.t += dt;
        if (g.clearing.t >= CLEAR_TIME) finishClear();
        return;
      }
      const p = g.piece;
      if (!p) return;
      const interval = g.soft ? SOFT_MS : gravityMs(levelFor(g.lines));
      g.acc += dt * 1000;
      while (g.acc >= interval) {
        g.acc -= interval;
        if (!collides(g.board, p, 0, 1)) {
          p.y += 1;
          g.lockT = 0;
        } else {
          g.acc = 0;
          break;
        }
      }
      if (collides(g.board, p, 0, 1)) {
        g.lockT += dt * (g.soft ? 2.5 : 1);
        if (g.lockT >= LOCK_DELAY) lock();
      }
      // Smoothly chase the logical position.
      const k = Math.min(1, dt * 28);
      g.vx += (p.x - g.vx) * k;
      g.vy += (p.y - g.vy) * k;
      if (Math.abs(p.y - g.vy) > 3) g.vy = p.y;
    };

    const drawTile = (
      kind: PieceKind,
      x: number,
      y: number,
      size = C,
      alpha = 1,
    ) => {
      const tiles = imgs.current.tiles;
      ctx.globalAlpha = alpha;
      const inset = 1;
      if (tiles && tiles.complete && tiles.naturalWidth > 0) {
        const idx = PIECE_KINDS.indexOf(kind);
        ctx.drawImage(
          tiles,
          idx * 128,
          0,
          128,
          128,
          x + inset,
          y + inset,
          size - inset * 2,
          size - inset * 2,
        );
      } else {
        ctx.fillStyle = kindFill(kind, isKeiraRef.current);
        roundRectPath(ctx, x + 2, y + 2, size - 4, size - 4, 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      const g = gameRef.current;
      const pk = packRef.current;
      prepareCanvas(ctx, W);
      ctx.save();
      if (g.shake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * g.shake,
          (Math.random() - 0.5) * g.shake * 0.6,
        );
      }
      ctx.translate(0, g.land * 4);

      // Background: picture + tint + soft cells.
      const bg = imgs.current.bg;
      if (bg && bg.complete && bg.naturalWidth > 0) {
        const s = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
        const bw = bg.naturalWidth * s;
        const bh = bg.naturalHeight * s;
        ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
      }
      const tint = ctx.createLinearGradient(0, 0, 0, H);
      tint.addColorStop(0, pk.wellTop);
      tint.addColorStop(1, pk.wellBottom);
      ctx.fillStyle = tint;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          roundRectPath(ctx, c * C + 3, r * C + 3, C - 6, C - 6, 7);
          ctx.fill();
        }
      }

      // Danger glow when the stack gets tall.
      let top = ROWS;
      for (let r = 0; r < ROWS; r++) {
        if (g.board[r].some(Boolean)) {
          top = r;
          break;
        }
      }
      if (top < 4 && g.phase === "play") {
        const a = (0.25 + 0.15 * Math.sin(g.time * 6)) * ((4 - top) / 4);
        const dg = ctx.createLinearGradient(0, 0, 0, C * 3);
        dg.addColorStop(0, `rgba(255,80,110,${a})`);
        dg.addColorStop(1, "rgba(255,80,110,0)");
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, W, C * 3);
      }

      // Settled blocks.
      const clearing = g.clearing;
      for (let r = 0; r < ROWS; r++) {
        const isClearing = clearing?.rows.includes(r);
        const off = g.fell[r] ?? 0;
        for (let c = 0; c < COLS; c++) {
          const k = g.board[r][c];
          if (!k) continue;
          if (isClearing && clearing) {
            const t = clearing.t / CLEAR_TIME;
            const delay = Math.abs(c - (COLS - 1) / 2) * 0.04;
            const s = Math.max(0, 1 - Math.max(0, t - delay) * 1.8);
            const sz = C * s;
            drawTile(k, c * C + (C - sz) / 2, r * C + (C - sz) / 2, sz);
          } else {
            drawTile(k, c * C, (r - off) * C);
          }
        }
        if (isClearing && clearing) {
          const t = clearing.t / CLEAR_TIME;
          ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - t)})`;
          roundRectPath(ctx, 2, r * C + 2, W - 4, C - 4, 10);
          ctx.fill();
        }
      }

      // Hard-drop streak.
      if (g.trail) {
        const a = 1 - g.trail.t / 0.28;
        for (const col of g.trail.cols) {
          const y0 = col.y0 * C;
          const y1 = (col.y1 + 1) * C;
          const tg = ctx.createLinearGradient(0, y0, 0, y1);
          tg.addColorStop(0, "rgba(255,255,255,0)");
          tg.addColorStop(1, `rgba(255,255,255,${0.55 * a})`);
          ctx.fillStyle = tg;
          ctx.fillRect(col.x * C + 6, y0, C - 12, y1 - y0);
        }
      }

      // Ghost + falling piece.
      const p = g.piece;
      if (p && g.phase !== "over") {
        const d = dropDistance(g.board, p);
        const color = kindFill(p.kind, isKeiraRef.current);
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 2.5;
        p.shape.forEach((row, r) =>
          row.forEach((v, c) => {
            if (!v || d === 0) return;
            const x = (p.x + c) * C;
            const y = (p.y + r + d) * C;
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = color;
            roundRectPath(ctx, x + 3, y + 3, C - 6, C - 6, 8);
            ctx.fill();
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.stroke();
          }),
        );
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        const n = p.shape.length;
        const cx = (g.vx + n / 2) * C;
        const cy = (g.vy + n / 2) * C;
        const sc = 1 + g.pop * 0.08;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);
        ctx.translate(-cx, -cy);
        ctx.shadowColor = `rgba(${pk.accentGlow},0.55)`;
        ctx.shadowBlur = 14;
        p.shape.forEach((row, r) =>
          row.forEach((v, c) => {
            if (!v) return;
            const y = (g.vy + r) * C;
            if (y < -C) return;
            drawTile(p.kind, (g.vx + c) * C, y);
          }),
        );
        ctx.restore();
      }

      // Particles.
      for (const pt of g.parts) {
        const a = 1 - pt.life / pt.max;
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        if (pt.spark) {
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.life * 6);
          ctx.fillRect(-pt.size, -pt.size * 0.3, pt.size * 2, pt.size * 0.6);
          ctx.fillRect(-pt.size * 0.3, -pt.size, pt.size * 0.6, pt.size * 2);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Floating words.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of g.floats) {
        if (f.life < 0) continue;
        const a = Math.max(0, Math.min(1, (1.2 - f.life) * 2.5));
        const s =
          Math.min(1, f.life * 7) * (1 + Math.max(0, 0.15 - f.life) * 2);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(f.x, f.y);
        ctx.scale(s, s);
        ctx.font = `900 ${f.big ? 46 : 30}px ui-rounded, system-ui, sans-serif`;
        ctx.lineWidth = f.big ? 9 : 7;
        ctx.lineJoin = "round";
        ctx.strokeStyle = isKeiraRef.current ? "#9d174d" : "#0c4a6e";
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.big
          ? isKeiraRef.current
            ? "#fff1f8"
            : "#fef9c3"
          : "#ffffff";
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
      ctx.restore();
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
    const w = window as unknown as { __tetrisState?: () => unknown };
    if (process.env.NODE_ENV !== "production") {
      w.__tetrisState = () => {
        const g = gameRef.current;
        return {
          board: g.board,
          piece: g.piece,
          phase: g.phase,
          clearing: !!g.clearing,
          lines: g.lines,
        };
      };
    }
    return () => {
      cancelAnimationFrame(raf);
      delete w.__tetrisState;
    };
  }, []);

  // Touch gestures on the well: tap = turn, drag = slide, flick down = drop.
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gameRef.current.phase !== "play") return;
    gesture.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ax: e.clientX,
      ay: e.clientY,
      t0: performance.now(),
      moved: false,
      dropped: false,
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const gs = gesture.current;
    const canvas = canvasRef.current;
    if (!gs || gs.id !== e.pointerId || gs.dropped || !canvas) return;
    const cell = canvas.getBoundingClientRect().width / COLS;
    const step = Math.max(18, cell * 0.85);
    while (e.clientX - gs.ax >= step) {
      shift(1);
      gs.ax += step;
      gs.moved = true;
    }
    while (gs.ax - e.clientX >= step) {
      shift(-1);
      gs.ax -= step;
      gs.moved = true;
    }
    while (e.clientY - gs.ay >= step) {
      softStep();
      gs.ay += step;
      gs.moved = true;
    }
    if (gs.ay - e.clientY > step) gs.ay = e.clientY;
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const gs = gesture.current;
    gesture.current = null;
    if (!gs || gs.id !== e.pointerId || gs.dropped) return;
    const dt = performance.now() - gs.t0;
    const dx = e.clientX - gs.sx;
    const dy = e.clientY - gs.sy;
    const dist = Math.hypot(dx, dy);
    if (dy > 50 && dy > Math.abs(dx) * 1.3 && dt < 320) {
      hardDrop();
    } else if (dy < -40 && -dy > Math.abs(dx) && dt < 400) {
      rotate();
    } else if (!gs.moved && dist < 14 && dt < 400) {
      rotate();
    }
  };

  const level = levelFor(hud.lines);
  const inLevel = hud.lines % LINES_PER_LEVEL;
  const sheet = tilesSrc(pack.prefix);

  const hudBlock = (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2",
        landscape ? "w-full flex-col items-stretch" : "w-full max-w-md",
      )}
    >
      <StatPill accent className="justify-center text-base">
        Level {level}
      </StatPill>
      <StatPill className={cn("gap-1 px-2.5", landscape && "justify-center")}>
        {Array.from({ length: LINES_PER_LEVEL }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-3 w-3 rounded-[4px] transition-colors",
              i < inLevel ? "bg-[var(--accent)]" : "bg-[var(--ink)]/15",
            )}
          />
        ))}
      </StatPill>
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-1.5 shadow-sm ring-1 ring-[var(--ink)]/10",
          landscape ? "flex-col" : "ml-auto",
        )}
      >
        <span className="text-xs font-black uppercase tracking-wide text-[var(--ink)]/55">
          Next
        </span>
        <div className="flex h-9 min-w-12 items-center justify-center">
          <NextPreview kind={hud.next} sheet={sheet} />
        </div>
      </div>
    </div>
  );

  const moveButtons: ReactNode = (
    <>
      <PadButton
        label="Move left"
        onPress={() => startRepeat(-1)}
        onRelease={stopRepeat}
      >
        <ArrowLeft className="size-7" strokeWidth={3.5} />
      </PadButton>
      <PadButton
        label="Soft drop"
        onPress={() => setSoft(true)}
        onRelease={() => setSoft(false)}
      >
        <ArrowDown className="size-7" strokeWidth={3.5} />
      </PadButton>
      <PadButton
        label="Move right"
        onPress={() => startRepeat(1)}
        onRelease={stopRepeat}
      >
        <ArrowRight className="size-7" strokeWidth={3.5} />
      </PadButton>
    </>
  );
  const actionButtons: ReactNode = (
    <>
      <PadButton label="Turn" primary onPress={rotate}>
        <RotateCw className="size-7" strokeWidth={3.5} />
      </PadButton>
      <PadButton label="Drop" primary onPress={hardDrop}>
        <ChevronsDown className="size-8" strokeWidth={3.5} />
      </PadButton>
    </>
  );

  const well = (
    <div
      className="flex min-h-0 w-full flex-1 touch-none flex-col"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        gesture.current = null;
      }}
    >
      <CanvasStage width={W} height={H} canvasRef={canvasRef}>
        <GameOverlay
          show={phase === "ready"}
          emoji={pack.emoji}
          title="Tap to start"
          subtitle="Tap the blocks to turn. Swipe to slide. Flick down to drop!"
          actionLabel="Let's build!"
          onAction={start}
        />
        <GameOverlay
          show={phase === "over"}
          emoji={pack.loseEmoji}
          tone="lose"
          title={pack.loseTitle}
          subtitle={`You cleared ${hud.lines} ${pack.rowWord} and reached level ${level}!`}
          actionLabel="Play again"
          onAction={start}
        />
      </CanvasStage>
    </div>
  );

  if (landscape) {
    return (
      <div className="game-root select-none !flex-row !items-stretch justify-center">
        <div className="flex w-44 shrink-0 flex-col justify-between gap-3">
          {hudBlock}
          <div className="grid grid-cols-3 gap-2">{moveButtons}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">{well}</div>
        <div className="flex w-44 shrink-0 flex-col justify-end">
          <div className="grid grid-cols-2 gap-2">{actionButtons}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-root select-none">
      {hudBlock}
      {well}
      <div className="flex w-full max-w-md shrink-0 gap-2">
        <div className="grid flex-[3] grid-cols-3 gap-2">{moveButtons}</div>
        <div className="grid flex-[2] grid-cols-2 gap-2">{actionButtons}</div>
      </div>
    </div>
  );
}
