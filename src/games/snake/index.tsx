"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Point = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const CELL = 28;
const COLS = 12;
const ROWS = 12;
const STEP_MS = 260;

function opposite(a: Dir, b: Dir) {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

export default function SnakeGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirRef = useRef<Dir>("right");
  const pendingRef = useRef<Dir>("right");
  const snakeRef = useRef<Point[]>([
    { x: 3, y: 6 },
    { x: 2, y: 6 },
    { x: 1, y: 6 },
  ]);
  const foodRef = useRef<Point>({ x: 8, y: 6 });
  const flashRef = useRef(0);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [ate, setAte] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  const spawnFood = useCallback((snake: Point[]): Point => {
    while (true) {
      const p = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      };
      if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
    }
  }, []);

  const reset = useCallback(() => {
    snakeRef.current = [
      { x: 3, y: 6 },
      { x: 2, y: 6 },
      { x: 1, y: 6 },
    ];
    dirRef.current = "right";
    pendingRef.current = "right";
    foodRef.current = { x: 8, y: 6 };
    flashRef.current = 0;
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
    setAte(false);
  }, [onScoreChange]);

  const setDir = useCallback((next: Dir) => {
    if (!opposite(dirRef.current, next)) pendingRef.current = next;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      const d = map[e.key];
      if (d) {
        e.preventDefault();
        setDir(d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDir]);

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
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = isKeira
        ? "rgba(244,114,182,0.45)"
        : "rgba(14,165,233,0.45)";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 2 === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          }
        }
      }

      const food = foodRef.current;
      const fx = food.x * CELL + CELL / 2;
      const fy = food.y * CELL + CELL / 2;
      ctx.beginPath();
      ctx.fillStyle = isKeira ? "#f9a8d4" : "#fde047";
      ctx.arc(fx, fy, CELL * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.floor(CELL * 0.72)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(isKeira ? "💖" : "⭐", fx, fy + 1);

      snakeRef.current.forEach((seg, i) => {
        const t = i / Math.max(snakeRef.current.length - 1, 1);
        ctx.fillStyle = isKeira
          ? `hsl(${330 - t * 70} 85% ${58 + t * 8}%)`
          : `hsl(${200 - t * 35} 90% ${48 + t * 12}%)`;
        const pad = i === 0 ? 2 : 4;
        ctx.beginPath();
        ctx.roundRect(
          seg.x * CELL + pad,
          seg.y * CELL + pad,
          CELL - pad * 2,
          CELL - pad * 2,
          i === 0 ? 10 : 8,
        );
        ctx.fill();
        if (i === 0) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(
            seg.x * CELL + CELL * 0.62,
            seg.y * CELL + CELL * 0.38,
            3.5,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.fillStyle = "#111";
          ctx.beginPath();
          ctx.arc(
            seg.x * CELL + CELL * 0.65,
            seg.y * CELL + CELL * 0.38,
            1.8,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      });

      if (flashRef.current > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.4, flashRef.current / 12)})`;
        ctx.fillRect(0, 0, w, h);
        flashRef.current -= 1;
      }
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (paused || over) {
        draw();
        return;
      }
      if (ts - last < STEP_MS) {
        draw();
        return;
      }
      last = ts;
      dirRef.current = pendingRef.current;
      const snake = snakeRef.current;
      const head = snake[0];
      const next: Point = { ...head };
      switch (dirRef.current) {
        case "up":
          next.y -= 1;
          break;
        case "down":
          next.y += 1;
          break;
        case "left":
          next.x -= 1;
          break;
        case "right":
          next.x += 1;
          break;
      }

      // Wrap edges — avoids wall deaths for young kids
      if (next.x < 0) next.x = COLS - 1;
      if (next.x >= COLS) next.x = 0;
      if (next.y < 0) next.y = ROWS - 1;
      if (next.y >= ROWS) next.y = 0;

      if (snake.some((s) => s.x === next.x && s.y === next.y)) {
        setOver(true);
        draw();
        return;
      }

      const grew =
        next.x === foodRef.current.x && next.y === foodRef.current.y;
      const body = [next, ...snake];
      if (!grew) body.pop();
      else {
        foodRef.current = spawnFood(body);
        flashRef.current = 8;
        setAte(true);
        window.setTimeout(() => setAte(false), 500);
        setScore((s) => {
          const n = s + 1;
          onScoreChange?.(n);
          return n;
        });
      }
      snakeRef.current = body;
      draw();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, onScoreChange, spawnFood, isKeira]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span className="truncate">
          {theme.gameNames.snake} · {score}
        </span>
        {ate ? (
          <span className="animate-bounce rounded-full bg-amber-300 px-3 py-1 text-sm text-amber-950">
            Yay! +1
          </span>
        ) : null}
        {over ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-5 py-3 text-base font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
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
        className="max-w-full touch-none rounded-3xl border-4 border-white/80 shadow-lg"
        style={{ width: "min(100%, 340px)", aspectRatio: "1 / 1" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          const c = canvasRef.current as HTMLCanvasElement & {
            _sx?: number;
            _sy?: number;
          };
          c._sx = t.clientX;
          c._sy = t.clientY;
        }}
        onTouchEnd={(e) => {
          const c = canvasRef.current as HTMLCanvasElement & {
            _sx?: number;
            _sy?: number;
          };
          if (c._sx == null || c._sy == null) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - c._sx;
          const dy = t.clientY - c._sy;
          if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
          if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
          else setDir(dy > 0 ? "down" : "up");
        }}
      />

      <div className="grid grid-cols-3 gap-3">
        <div />
        <Pad label="↑" onPress={() => setDir("up")} />
        <div />
        <Pad label="←" onPress={() => setDir("left")} />
        <Pad label="↓" onPress={() => setDir("down")} />
        <Pad label="→" onPress={() => setDir("right")} />
      </div>

      {over ? (
        <p className="rounded-2xl bg-white/70 px-4 py-3 text-center text-base font-bold text-[var(--ink)]">
          Oops — you bumped yourself! Score {score}. Try again.
        </p>
      ) : (
        <p className="text-center text-sm font-medium text-[var(--ink)]/70">
          Swipe the board or tap the big arrows
        </p>
      )}
    </div>
  );
}

function Pad({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Move ${label}`}
      className="flex h-20 w-20 touch-manipulation items-center justify-center rounded-3xl bg-[var(--surface)] text-3xl font-black text-[var(--ink)] shadow-md active:scale-95"
      onClick={onPress}
    >
      {label}
    </button>
  );
}
