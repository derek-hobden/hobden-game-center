"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import {
  PIECE_KINDS,
  SHAPES,
  bgSrc,
  blockSrc,
  cardSrc,
  kindFill,
  tetrisPack,
  type PieceKind,
} from "./theme";

const COLS = 10;
const ROWS = 14;
const CELL = 34;
const GRAVITY_MS = 920;
const HOLD_REPEAT_MS = 140;

type Cell = PieceKind | 0;
type Piece = { kind: PieceKind; shape: number[][]; x: number; y: number };

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[]);
}

function cloneShape(kind: PieceKind) {
  return SHAPES[kind].map((row) => [...row]);
}

function rotate(shape: number[][]) {
  const h = shape.length;
  const w = shape[0].length;
  const next = Array.from({ length: w }, () => Array(h).fill(0));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) next[c][h - 1 - r] = shape[r][c];
  }
  return next;
}

function spawnFrom(kind: PieceKind): Piece {
  const shape = cloneShape(kind);
  return { kind, shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
}

function bagShuffle(): PieceKind[] {
  const bag = [...PIECE_KINDS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

function collides(board: Cell[][], p: Piece, ox = 0, oy = 0, shape = p.shape) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const x = p.x + c + ox;
      const y = p.y + r + oy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

function ghostY(board: Cell[][], p: Piece) {
  let dy = 0;
  while (!collides(board, p, 0, dy + 1)) dy += 1;
  return p.y + dy;
}

function drawRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fill: string,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  const r = 7;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, size - 2, size - 2, r);
  ctx.fill();
  ctx.restore();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  size: number,
  fill: string,
  alpha = 1,
) {
  if (!img || !img.complete || img.naturalWidth === 0) {
    drawRounded(ctx, x, y, size, fill, alpha);
    return;
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  const inset = img.naturalWidth * 0.12;
  ctx.drawImage(
    img,
    inset,
    inset,
    img.naturalWidth - inset * 2,
    img.naturalHeight - inset * 2,
    x,
    y,
    size,
    size,
  );
  ctx.restore();
}

export default function TetrisGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef(emptyBoard());
  const pieceRef = useRef<Piece | null>(null);
  const nextRef = useRef<PieceKind>("t");
  const bagRef = useRef<PieceKind[]>([]);
  const flashRowsRef = useRef<number[]>([]);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const holdTimerRef = useRef<number | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [yay, setYay] = useState<string | null>(null);
  const [nextKind, setNextKind] = useState<PieceKind>("t");
  const [artTick, setArtTick] = useState(0);

  const theme = PROFILES[profileId];
  const pack = tetrisPack(profileId);
  const isKeira = profileId === "keira";

  const takeKind = useCallback(() => {
    if (bagRef.current.length === 0) bagRef.current = bagShuffle();
    return bagRef.current.pop()!;
  }, []);

  const spawn = useCallback(() => {
    const kind = nextRef.current;
    const upcoming = takeKind();
    nextRef.current = upcoming;
    setNextKind(upcoming);
    return spawnFrom(kind);
  }, [takeKind]);

  const reset = useCallback(() => {
    boardRef.current = emptyBoard();
    bagRef.current = bagShuffle();
    nextRef.current = takeKind();
    pieceRef.current = spawn();
    flashRowsRef.current = [];
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
    setYay(null);
  }, [spawn, takeKind, onScoreChange]);

  useEffect(() => {
    reset();
  }, [reset, profileId]);

  useEffect(() => {
    const urls = [
      bgSrc(pack.prefix),
      cardSrc(pack.prefix),
      ...PIECE_KINDS.map((k) => blockSrc(pack.prefix, k)),
    ];
    let loaded = 0;
    urls.forEach((url) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        imagesRef.current[url] = img;
        loaded += 1;
        if (loaded === urls.length) setArtTick((n) => n + 1);
      };
    });
  }, [pack.prefix]);

  const finishClear = useCallback(
    (cleared: number) => {
      if (cleared) {
        const add = cleared === 1 ? 10 : cleared === 2 ? 25 : cleared === 3 ? 40 : 80;
        setScore((s) => {
          const n = s + add;
          onScoreChange?.(n);
          return n;
        });
        setYay(pack.yay);
        window.setTimeout(() => setYay(null), 900);
      }
      pieceRef.current = spawn();
      if (pieceRef.current && collides(boardRef.current, pieceRef.current)) {
        setOver(true);
      }
    },
    [onScoreChange, pack.yay, spawn],
  );

  const lock = useCallback(() => {
    const p = pieceRef.current;
    if (!p) return;
    for (let r = 0; r < p.shape.length; r++) {
      for (let c = 0; c < p.shape[r].length; c++) {
        if (!p.shape[r][c]) continue;
        const y = p.y + r;
        const x = p.x + c;
        if (y < 0) {
          setOver(true);
          return;
        }
        boardRef.current[y][x] = p.kind;
      }
    }
    const full: number[] = [];
    boardRef.current.forEach((row, i) => {
      if (row.every((v) => v !== 0)) full.push(i);
    });
    if (full.length) {
      flashRowsRef.current = full;
      window.setTimeout(() => {
        boardRef.current = boardRef.current.filter((_, i) => !full.includes(i));
        while (boardRef.current.length < ROWS) {
          boardRef.current.unshift(Array(COLS).fill(0) as Cell[]);
        }
        flashRowsRef.current = [];
        finishClear(full.length);
      }, 280);
      pieceRef.current = null;
      return;
    }
    finishClear(0);
  }, [finishClear]);

  const busy = useCallback(
    () => over || paused || flashRowsRef.current.length > 0,
    [over, paused],
  );

  const move = useCallback(
    (dx: number, dy: number) => {
      const p = pieceRef.current;
      if (!p || busy()) return;
      if (!collides(boardRef.current, p, dx, dy)) {
        p.x += dx;
        p.y += dy;
      } else if (dy > 0) lock();
    },
    [busy, lock],
  );

  const hardDrop = useCallback(() => {
    const p = pieceRef.current;
    if (!p || busy()) return;
    while (!collides(boardRef.current, p, 0, 1)) p.y += 1;
    lock();
  }, [busy, lock]);

  const rot = useCallback(() => {
    const p = pieceRef.current;
    if (!p || busy()) return;
    const next = rotate(p.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collides(boardRef.current, p, k, 0, next)) {
        p.shape = next;
        p.x += k;
        return;
      }
    }
  }, [busy]);

  const startHold = (fn: () => void) => {
    fn();
    if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
    holdTimerRef.current = window.setInterval(fn, HOLD_REPEAT_MS);
  };

  const stopHold = () => {
    if (holdTimerRef.current) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => () => stopHold(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") move(-1, 0);
      if (e.key === "ArrowRight") move(1, 0);
      if (e.key === "ArrowDown") move(0, 1);
      if (e.key === "ArrowUp") rot();
      if (e.key === " ") {
        e.preventDefault();
        hardDrop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, rot, hardDrop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = COLS * CELL;
    const h = ROWS * CELL;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let last = 0;

    const draw = (ts: number) => {
      const bg = imagesRef.current[bgSrc(pack.prefix)];
      if (bg && bg.complete) {
        ctx.drawImage(bg, 0, 0, w, h);
        ctx.fillStyle = "rgba(20, 12, 32, 0.38)";
        ctx.fillRect(0, 0, w, h);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL);
        ctx.lineTo(w, r * CELL);
        ctx.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL, 0);
        ctx.lineTo(c * CELL, h);
        ctx.stroke();
      }

      const flashing = flashRowsRef.current;
      const flashOn = flashing.length > 0 && Math.floor(ts / 80) % 2 === 0;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cell = boardRef.current[r][c];
          if (!cell) continue;
          const img = imagesRef.current[blockSrc(pack.prefix, cell)];
          const alpha = flashing.includes(r) && flashOn ? 0.35 : 1;
          drawSprite(ctx, img, c * CELL, r * CELL, CELL, kindFill(cell, isKeira), alpha);
        }
      }

      const p = pieceRef.current;
      if (p) {
        const gy = ghostY(boardRef.current, p);
        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (!p.shape[r][c]) continue;
            drawRounded(
              ctx,
              (p.x + c) * CELL,
              (gy + r) * CELL,
              CELL,
              pack.ghost,
              0.55,
            );
          }
        }
        const img = imagesRef.current[blockSrc(pack.prefix, p.kind)];
        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (!p.shape[r][c]) continue;
            drawSprite(
              ctx,
              img,
              (p.x + c) * CELL,
              (p.y + r) * CELL,
              CELL,
              kindFill(p.kind, isKeira),
            );
          }
        }
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!paused && !over && flashRowsRef.current.length === 0 && ts - last > GRAVITY_MS) {
        last = ts;
        move(0, 1);
      }
      draw(ts);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, isKeira, move, pack, artTick]);

  const onWellPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };

  const onWellPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      rot();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? 1 : -1, 0);
    } else if (dy > 0) {
      if (dy > 70) hardDrop();
      else move(0, 1);
    } else {
      rot();
    }
  };

  const nextImg = `/games/tetris/${pack.prefix}-${nextKind}.png`;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardSrc(pack.prefix)}
          alt=""
          className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-[var(--ink)]">
            {theme.gameNames.tetris} · {score}
          </p>
          {yay ? (
            <p className="text-sm font-bold text-emerald-700">{yay}</p>
          ) : over ? (
            <p className="text-sm font-bold text-rose-700">{pack.lose}</p>
          ) : (
            <p className="text-sm text-[var(--ink)]/70">{pack.hint}</p>
          )}
        </div>
        <div className="flex flex-col items-center rounded-2xl bg-[var(--surface)] px-2 py-1 shadow-md">
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]/60">
            {pack.nextLabel}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={nextImg} alt="" className="h-12 w-12 object-cover" />
        </div>
      </div>
      <div className="relative w-full max-w-[340px]">
        <canvas
          ref={canvasRef}
          width={COLS * CELL}
          height={ROWS * CELL}
          className="w-full touch-none rounded-3xl border-4 border-white/80 shadow-lg"
          onPointerDown={onWellPointerDown}
          onPointerUp={onWellPointerUp}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
        />
        {over ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-black/35 p-4">
            <p className="mb-3 text-center text-xl font-black text-white drop-shadow">
              {pack.lose}
            </p>
            <button
              type="button"
              className="min-h-14 rounded-2xl bg-[var(--accent)] px-6 py-3 text-lg font-black text-[var(--accent-fg)]"
              onClick={reset}
            >
              Play again
            </button>
          </div>
        ) : null}
      </div>
      <div className="grid w-full max-w-md grid-cols-3 gap-2">
        <button
          type="button"
          className="h-16 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onPointerDown={() => startHold(() => move(-1, 0))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          ←
        </button>
        <button
          type="button"
          className="h-16 rounded-2xl bg-[var(--accent)] text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={rot}
        >
          Turn
        </button>
        <button
          type="button"
          className="h-16 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onPointerDown={() => startHold(() => move(1, 0))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          →
        </button>
        <button
          type="button"
          className="h-14 rounded-2xl bg-[var(--surface)] text-base font-bold shadow-md active:scale-95"
          onPointerDown={() => startHold(() => move(0, 1))}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          onPointerCancel={stopHold}
        >
          Down
        </button>
        <button
          type="button"
          className="col-span-2 h-14 rounded-2xl bg-[var(--surface2)] text-base font-bold shadow-md active:scale-95"
          onClick={hardDrop}
        >
          Drop
        </button>
      </div>
    </div>
  );
}
