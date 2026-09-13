"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

const COLS = 10;
const ROWS = 16;
const CELL = 22;
const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
];

type Piece = { shape: number[][]; x: number; y: number; color: string };

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as number[]);
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

export default function TetrisGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef(emptyBoard());
  const pieceRef = useRef<Piece | null>(null);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const colors = isKeira
    ? ["#f9a8d4", "#c4b5fd", "#86efac", "#7dd3fc", "#fcd34d"]
    : ["#38bdf8", "#4ade80", "#fbbf24", "#fb7185", "#a78bfa"];

  const spawn = useCallback((): Piece => {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)].map((r) => [
      ...r,
    ]);
    return {
      shape,
      x: 3,
      y: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
  }, [colors]);

  const collides = useCallback((p: Piece, ox = 0, oy = 0, shape = p.shape) => {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const x = p.x + c + ox;
        const y = p.y + r + oy;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && boardRef.current[y][x]) return true;
      }
    }
    return false;
  }, []);

  const reset = useCallback(() => {
    boardRef.current = emptyBoard();
    pieceRef.current = spawn();
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
  }, [spawn, onScoreChange]);

  useEffect(() => {
    reset();
  }, [reset]);

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
        boardRef.current[y][x] = 1;
      }
    }
    let cleared = 0;
    boardRef.current = boardRef.current.filter((row) => {
      const full = row.every((v) => v);
      if (full) cleared += 1;
      return !full;
    });
    while (boardRef.current.length < ROWS) {
      boardRef.current.unshift(Array(COLS).fill(0));
    }
    if (cleared) {
      setScore((s) => {
        const n = s + cleared * 10;
        onScoreChange?.(n);
        return n;
      });
    }
    pieceRef.current = spawn();
    if (pieceRef.current && collides(pieceRef.current)) setOver(true);
  }, [spawn, collides, onScoreChange]);

  const move = useCallback(
    (dx: number, dy: number) => {
      const p = pieceRef.current;
      if (!p || over || paused) return;
      if (!collides(p, dx, dy)) {
        p.x += dx;
        p.y += dy;
      } else if (dy > 0) lock();
    },
    [collides, lock, over, paused],
  );

  const hardDrop = useCallback(() => {
    const p = pieceRef.current;
    if (!p || over || paused) return;
    while (!collides(p, 0, 1)) p.y += 1;
    lock();
  }, [collides, lock, over, paused]);

  const rot = useCallback(() => {
    const p = pieceRef.current;
    if (!p || over || paused) return;
    const next = rotate(p.shape);
    if (!collides(p, 0, 0, next)) p.shape = next;
  }, [collides, over, paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") move(-1, 0);
      if (e.key === "ArrowRight") move(1, 0);
      if (e.key === "ArrowDown") move(0, 1);
      if (e.key === "ArrowUp") rot();
      if (e.key === " ") hardDrop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, rot, hardDrop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = 0;

    const draw = () => {
      const w = COLS * CELL;
      const h = ROWS * CELL;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (boardRef.current[r][c]) {
            ctx.fillStyle = isKeira ? "#f472b6" : "#0ea5e9";
            ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
          }
        }
      }
      const p = pieceRef.current;
      if (p) {
        ctx.fillStyle = p.color;
        for (let r = 0; r < p.shape.length; r++) {
          for (let c = 0; c < p.shape[r].length; c++) {
            if (!p.shape[r][c]) continue;
            ctx.fillRect(
              (p.x + c) * CELL + 1,
              (p.y + r) * CELL + 1,
              CELL - 2,
              CELL - 2,
            );
          }
        }
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!paused && !over && ts - last > 650) {
        last = ts;
        move(0, 1);
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, isKeira, move]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.tetris} · {score}
        </span>
        {over ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Play again
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="rounded-3xl border-4 border-white/70 shadow-lg"
      />
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="h-16 w-16 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onClick={() => move(-1, 0)}
        >
          ←
        </button>
        <button
          type="button"
          className="h-16 w-16 rounded-2xl bg-[var(--accent)] text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={rot}
        >
          ⟳
        </button>
        <button
          type="button"
          className="h-16 w-16 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onClick={() => move(1, 0)}
        >
          →
        </button>
        <button
          type="button"
          className="col-span-3 h-14 rounded-2xl bg-[var(--surface)] text-base font-bold shadow-md active:scale-95"
          onClick={hardDrop}
        >
          Drop ↓
        </button>
      </div>
      {over ? (
        <p className="font-bold text-rose-700">Stack full — try again!</p>
      ) : (
        <p className="text-sm text-[var(--ink)]/70">Slow blocks · clear rows</p>
      )}
    </div>
  );
}
