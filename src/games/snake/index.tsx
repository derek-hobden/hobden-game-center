"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Point = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const CELL = 20;
const COLS = 16;
const ROWS = 16;

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
    { x: 4, y: 8 },
    { x: 3, y: 8 },
    { x: 2, y: 8 },
  ]);
  const foodRef = useRef<Point>({ x: 10, y: 8 });
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];

  function spawnFood(snake: Point[]): Point {
    while (true) {
      const p = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * ROWS),
      };
      if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
    }
  }

  function reset() {
    snakeRef.current = [
      { x: 4, y: 8 },
      { x: 3, y: 8 },
      { x: 2, y: 8 },
    ];
    dirRef.current = "right";
    pendingRef.current = "right";
    foodRef.current = { x: 10, y: 8 };
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
  }

  function setDir(next: Dir) {
    if (!opposite(dirRef.current, next)) pendingRef.current = next;
  }

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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = 0;
    const stepMs = 160;

    const draw = () => {
      const w = COLS * CELL;
      const h = ROWS * CELL;
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if ((x + y) % 2 === 0) {
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
          }
        }
      }

      const food = foodRef.current;
      ctx.beginPath();
      ctx.fillStyle = theme.accent;
      ctx.arc(
        food.x * CELL + CELL / 2,
        food.y * CELL + CELL / 2,
        CELL * 0.35,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      snakeRef.current.forEach((seg, i) => {
        const t = i / Math.max(snakeRef.current.length - 1, 1);
        ctx.fillStyle =
          profileId === "keira"
            ? `hsl(${320 - t * 80} 80% ${55 + t * 10}%)`
            : `hsl(${200 - t * 40} 85% ${45 + t * 15}%)`;
        ctx.beginPath();
        ctx.roundRect(
          seg.x * CELL + 2,
          seg.y * CELL + 2,
          CELL - 4,
          CELL - 4,
          6,
        );
        ctx.fill();
      });
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (paused || over) {
        draw();
        return;
      }
      if (ts - last < stepMs) {
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
        default: {
          const _exhaustive: never = dirRef.current;
          return _exhaustive;
        }
      }

      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= COLS ||
        next.y >= ROWS ||
        snake.some((s) => s.x === next.x && s.y === next.y)
      ) {
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
  }, [paused, over, profileId, theme, onScoreChange]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-bold text-[var(--ink)]">
        <span>
          {theme.gameNames.snake} · {score}
        </span>
        {over ? (
          <button
            type="button"
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[var(--accent-fg)]"
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
        className="max-w-full rounded-3xl border-4 border-white/70 shadow-lg touch-none"
        style={{ width: "min(100%, 360px)", aspectRatio: "1 / 1" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          (canvasRef.current as HTMLCanvasElement & { _sx?: number; _sy?: number })._sx =
            t.clientX;
          (canvasRef.current as HTMLCanvasElement & { _sx?: number; _sy?: number })._sy =
            t.clientY;
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
          if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
          if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
          else setDir(dy > 0 ? "down" : "up");
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        <div />
        <Pad label="↑" onPress={() => setDir("up")} />
        <div />
        <Pad label="←" onPress={() => setDir("left")} />
        <Pad label="↓" onPress={() => setDir("down")} />
        <Pad label="→" onPress={() => setDir("right")} />
      </div>
      {over ? (
        <p className="text-center text-base font-semibold text-[var(--ink)]">
          Bump! Score {score}. Try again.
        </p>
      ) : null}
    </div>
  );
}

function Pad({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Move ${label}`}
      className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] text-2xl font-bold text-[var(--ink)] shadow-md active:scale-95"
      onClick={onPress}
    >
      {label}
    </button>
  );
}
