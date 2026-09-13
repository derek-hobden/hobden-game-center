"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Point = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";
type Spark = { x: number; y: number; life: number; hue: number };

const COLS = 11;
const ROWS = 11;
const CELL = 32;
const BASE_STEP_MS = 310;
const MIN_STEP_MS = 210;
const SWIPE_MIN = 18;

const START_SNAKE: Point[] = [
  { x: 3, y: 5 },
  { x: 2, y: 5 },
  { x: 1, y: 5 },
];

function opposite(a: Dir, b: Dir) {
  return (
    (a === "up" && b === "down") ||
    (a === "down" && b === "up") ||
    (a === "left" && b === "right") ||
    (a === "right" && b === "left")
  );
}

function stepMs(score: number) {
  return Math.max(MIN_STEP_MS, BASE_STEP_MS - score * 6);
}

function headingFor(dir: Dir): number {
  switch (dir) {
    case "right":
      return 0;
    case "down":
      return Math.PI / 2;
    case "left":
      return Math.PI;
    case "up":
      return -Math.PI / 2;
    default: {
      const _never: never = dir;
      return _never;
    }
  }
}

function useSprite(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const image = new Image();
    image.src = src;
    image.onload = () => setImg(image);
  }, [src]);
  return img;
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  angle = 0,
) {
  if (!img) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

export default function SnakeGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirRef = useRef<Dir>("right");
  const queueRef = useRef<Dir[]>([]);
  const snakeRef = useRef<Point[]>(START_SNAKE.map((p) => ({ ...p })));
  const foodRef = useRef<Point>({ x: 8, y: 5 });
  const flashRef = useRef(0);
  const wrapFlashRef = useRef(0);
  const sparksRef = useRef<Spark[]>([]);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [ate, setAte] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const pack = isKeira ? "keira" : "luke";

  const board = useSprite(`/games/snake/${pack}-board.png`);
  const head = useSprite(`/games/snake/${pack}-head.png`);
  const body = useSprite(`/games/snake/${pack}-body.png`);
  const tail = useSprite(`/games/snake/${pack}-tail.png`);
  const foodArt = useSprite(`/games/snake/${pack}-food.png`);
  const padUp = `/games/snake/pad-up.png`;
  const padDown = `/games/snake/pad-down.png`;
  const padLeft = `/games/snake/pad-left.png`;
  const padRight = `/games/snake/pad-right.png`;
  const artReady = Boolean(board && head && body && foodArt);

  const spawnFood = useCallback((snake: Point[]): Point | null => {
    const free: Point[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[Math.floor(Math.random() * free.length)];
  }, []);

  const reset = useCallback(() => {
    snakeRef.current = START_SNAKE.map((p) => ({ ...p }));
    dirRef.current = "right";
    queueRef.current = [];
    foodRef.current = { x: 8, y: 5 };
    flashRef.current = 0;
    wrapFlashRef.current = 0;
    sparksRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
    setWon(false);
    setAte(false);
  }, [onScoreChange]);

  const setDir = useCallback((next: Dir) => {
    const last = queueRef.current.at(-1) ?? dirRef.current;
    if (opposite(last, next) || last === next) return;
    if (queueRef.current.length >= 2) return;
    queueRef.current.push(next);
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

    const cssW = COLS * CELL;
    const cssH = ROWS * CELL;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let last = 0;

    const burst = (cell: Point, hueBase: number) => {
      for (let i = 0; i < 10; i++) {
        sparksRef.current.push({
          x: cell.x * CELL + CELL / 2 + (Math.random() - 0.5) * CELL,
          y: cell.y * CELL + CELL / 2 + (Math.random() - 0.5) * CELL,
          life: 14 + Math.random() * 8,
          hue: hueBase + Math.random() * 40,
        });
      }
    };

    const draw = (ts: number) => {
      ctx.clearRect(0, 0, cssW, cssH);
      if (board) {
        ctx.drawImage(board, 0, 0, cssW, cssH);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(0, 0, cssW, cssH);
      } else {
        const g = ctx.createLinearGradient(0, 0, cssW, cssH);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cssW, cssH);
      }

      ctx.strokeStyle = isKeira
        ? "rgba(244,114,182,0.7)"
        : "rgba(14,165,233,0.7)";
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, cssW - 8, cssH - 8);

      if (wrapFlashRef.current > 0) {
        ctx.fillStyle = `rgba(255,255,255,${wrapFlashRef.current / 18})`;
        ctx.fillRect(0, 0, cssW, cssH);
        wrapFlashRef.current -= 1;
      }

      const food = foodRef.current;
      const fx = food.x * CELL + CELL / 2;
      const fy = food.y * CELL + CELL / 2;
      const pulse = 1 + Math.sin(ts / 180) * 0.08;
      const foodSize = CELL * 0.92 * pulse;
      if (
        !drawSprite(ctx, foodArt, fx, fy, foodSize)
      ) {
        ctx.beginPath();
        ctx.fillStyle = isKeira ? "#f9a8d4" : "#fde047";
        ctx.arc(fx, fy, CELL * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }

      const snake = snakeRef.current;
      for (let i = snake.length - 1; i >= 0; i--) {
        const seg = snake[i];
        const cx = seg.x * CELL + CELL / 2;
        const cy = seg.y * CELL + CELL / 2;
        const isHead = i === 0;
        const isTail = i === snake.length - 1 && snake.length > 1;
        if (isHead) {
          drawSprite(ctx, head, cx, cy, CELL * 1.12, headingFor(dirRef.current));
        } else if (isTail) {
          const prev = snake[i - 1];
          let tailDir: Dir = "right";
          if (prev.x > seg.x) tailDir = "right";
          else if (prev.x < seg.x) tailDir = "left";
          else if (prev.y > seg.y) tailDir = "down";
          else tailDir = "up";
          if (!drawSprite(ctx, tail, cx, cy, CELL * 0.95, headingFor(tailDir))) {
            drawSprite(ctx, body, cx, cy, CELL * 0.9);
          }
        } else {
          drawSprite(ctx, body, cx, cy, CELL * 0.98);
        }
      }

      sparksRef.current = sparksRef.current.filter((s) => {
        s.life -= 1;
        ctx.fillStyle = `hsla(${s.hue} 90% 65% / ${Math.min(1, s.life / 12)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        return s.life > 0;
      });

      if (flashRef.current > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.35, flashRef.current / 14)})`;
        ctx.fillRect(0, 0, cssW, cssH);
        flashRef.current -= 1;
      }
    };

    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (paused || over || won) {
        draw(ts);
        return;
      }
      if (ts - last < stepMs(scoreRef.current)) {
        draw(ts);
        return;
      }
      last = ts;
      const queued = queueRef.current.shift();
      if (queued) dirRef.current = queued;
      const snake = snakeRef.current;
      const headSeg = snake[0];
      const next: Point = { ...headSeg };
      let wrapped = false;
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
          const _never: never = dirRef.current;
          void _never;
          break;
        }
      }

      if (next.x < 0) {
        next.x = COLS - 1;
        wrapped = true;
      }
      if (next.x >= COLS) {
        next.x = 0;
        wrapped = true;
      }
      if (next.y < 0) {
        next.y = ROWS - 1;
        wrapped = true;
      }
      if (next.y >= ROWS) {
        next.y = 0;
        wrapped = true;
      }

      if (wrapped) wrapFlashRef.current = 10;

      if (snake.some((s) => s.x === next.x && s.y === next.y)) {
        setOver(true);
        burst(next, isKeira ? 330 : 200);
        draw(ts);
        return;
      }

      const grew =
        next.x === foodRef.current.x && next.y === foodRef.current.y;
      const nextBody = [next, ...snake];
      if (!grew) nextBody.pop();
      else {
        burst(foodRef.current, isKeira ? 320 : 48);
        flashRef.current = 8;
        const spawned = spawnFood(nextBody);
        if (!spawned) {
          snakeRef.current = nextBody;
          setWon(true);
          scoreRef.current += 1;
          setScore(scoreRef.current);
          onScoreChange?.(scoreRef.current);
          draw(ts);
          return;
        }
        foodRef.current = spawned;
        setAte(true);
        window.setTimeout(() => setAte(false), 650);
        scoreRef.current += 1;
        setScore(scoreRef.current);
        onScoreChange?.(scoreRef.current);
      }
      snakeRef.current = nextBody;
      draw(ts);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    paused,
    over,
    won,
    theme,
    onScoreChange,
    spawnFood,
    isKeira,
    board,
    head,
    body,
    tail,
    foodArt,
  ]);

  const onPad = (dir: Dir) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDir(dir);
  };

  const onPointerDownBoard = (e: PointerEvent<HTMLCanvasElement>) => {
    swipeRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUpBoard = (e: PointerEvent<HTMLCanvasElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? "right" : "left");
    else setDir(dy > 0 ? "down" : "up");
  };

  const treatName = isKeira ? "heart gems" : "star coins";
  const bumpCopy = useMemo(() => {
    if (won) {
      return isKeira
        ? `You filled the whole garden! ${score} gems.`
        : `You filled the whole track! ${score} stars.`;
    }
    if (over) {
      return isKeira
        ? `Oops — rainbow bump! You got ${score} gems.`
        : `Oops — rocket bump! You got ${score} stars.`;
    }
    return isKeira
      ? `Swipe or tap arrows. Edges wrap. Nibble ${treatName}!`
      : `Swipe or tap arrows. Edges wrap. Grab ${treatName}!`;
  }, [isKeira, over, score, treatName, won]);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span className="truncate">
          {theme.gameNames.snake} · {score}
        </span>
        {ate ? (
          <span className="animate-bounce rounded-full bg-amber-300 px-3 py-1 text-sm text-amber-950">
            {isKeira ? "Yay! Sparkle!" : "Yay! Boost!"}
          </span>
        ) : null}
        {over || won ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-5 py-3 text-base font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
            onClick={reset}
          >
            Play again
          </button>
        ) : null}
      </div>

      {!artReady ? (
        <p className="text-sm font-semibold text-[var(--ink)]/70">
          Painting the garden…
        </p>
      ) : null}

      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="max-w-full touch-none rounded-3xl border-4 border-white/80 shadow-lg"
        style={{ width: "min(100%, 352px)", aspectRatio: "1 / 1" }}
        onPointerDown={onPointerDownBoard}
        onPointerUp={onPointerUpBoard}
        onPointerCancel={() => {
          swipeRef.current = null;
        }}
      />

      <div className="grid grid-cols-3 place-items-center gap-1">
        <div />
        <Pad
          label="up"
          src={padUp}
          onPress={onPad("up")}
        />
        <div />
        <Pad
          label="left"
          src={padLeft}
          onPress={onPad("left")}
        />
        <Pad
          label="down"
          src={padDown}
          onPress={onPad("down")}
        />
        <Pad
          label="right"
          src={padRight}
          onPress={onPad("right")}
        />
      </div>

      <p className="rounded-2xl bg-white/70 px-4 py-2 text-center text-sm font-bold text-[var(--ink)]">
        {bumpCopy}
      </p>
    </div>
  );
}

function Pad({
  label,
  src,
  onPress,
}: {
  label: Dir;
  src: string;
  onPress: (e: PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Move ${label}`}
      className="flex h-[4.5rem] w-[4.5rem] touch-manipulation items-center justify-center overflow-hidden rounded-3xl bg-transparent shadow-md active:scale-95 sm:h-20 sm:w-20"
      onPointerDown={onPress}
      style={{
        backgroundImage: `url(${src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}
