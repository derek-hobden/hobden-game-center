"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import type { ProfileId } from "@/lib/profiles";
import { PROFILES } from "@/lib/profiles";

const W = 360;
const H = 540;
const BALL_R = 12;
const GRAVITY = 0.1;
const MAX_SPEED = 9.6;
const FLIP_LINGER_MS = 320;
const FLIP_LEN = 86;
const FLIP_HALF = 11;
const LEFT_PIVOT = { x: 74, y: 462 };
const RIGHT_PIVOT = { x: 286, y: 462 };
const LEFT_REST = 0.38;
const LEFT_UP = -0.58;
const RIGHT_REST = Math.PI - 0.38;
const RIGHT_UP = Math.PI + 0.58;

type ArtPack = {
  table: string;
  bumper: string;
  ball: string;
  flip: string;
  hint: string;
  over: string;
};

type Bumper = { x: number; y: number; r: number; cool: number; flash: number };
type Pop = { x: number; y: number; life: number; text: string };
type Segment = { ax: number; ay: number; bx: number; by: number };

function artPack(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        table: "/games/pinball/keira-table.png",
        bumper: "/games/pinball/keira-bumper.png",
        ball: "/games/pinball/keira-ball.png",
        flip: "Magic paddle",
        hint: "Hold the paddles when the ball comes down.",
        over: "The sparkle ball rolled away — try again!",
      };
    case "luke":
      return {
        table: "/games/pinball/luke-table.png",
        bumper: "/games/pinball/luke-bumper.png",
        ball: "/games/pinball/luke-ball.png",
        flip: "Rocket paddle",
        hint: "Hold the paddles when the ball comes down.",
        over: "The rocket ball rolled away — try again!",
      };
    default: {
      const _never: never = profileId;
      throw new Error(`Unhandled profile: ${_never}`);
    }
  }
}

function clampSpeed(vx: number, vy: number) {
  const s = Math.hypot(vx, vy);
  if (s <= MAX_SPEED || s === 0) return { vx, vy };
  const k = MAX_SPEED / s;
  return { vx: vx * k, vy: vy * k };
}

function closestOnSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const denom = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / denom));
  return { x: ax + t * abx, y: ay + t * aby, t };
}

function bounceCircle(
  ball: { x: number; y: number; vx: number; vy: number },
  cx: number,
  cy: number,
  radius: number,
  restitution: number,
  extra = 0,
) {
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  const d = Math.hypot(dx, dy) || 1;
  if (d >= radius) return false;
  const nx = dx / d;
  const ny = dy / d;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + restitution) * vn * nx;
    ball.vy -= (1 + restitution) * vn * ny;
  }
  ball.vx += nx * extra;
  ball.vy += ny * extra;
  ball.x = cx + nx * (radius + 0.5);
  ball.y = cy + ny * (radius + 0.5);
  const clipped = clampSpeed(ball.vx, ball.vy);
  ball.vx = clipped.vx;
  ball.vy = clipped.vy;
  return true;
}

function bounceSegment(
  ball: { x: number; y: number; vx: number; vy: number },
  seg: Segment,
  half: number,
  restitution: number,
  extra = 0,
) {
  const p = closestOnSeg(ball.x, ball.y, seg.ax, seg.ay, seg.bx, seg.by);
  return bounceCircle(ball, p.x, p.y, BALL_R + half, restitution, extra);
}

function flipperTip(pivot: { x: number; y: number }, angle: number) {
  return {
    x: pivot.x + Math.cos(angle) * FLIP_LEN,
    y: pivot.y + Math.sin(angle) * FLIP_LEN,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export default function PinballGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ball = useRef({ x: 318, y: 430, vx: 0, vy: 0 });
  const leftHeld = useRef(false);
  const rightHeld = useRef(false);
  const leftUntil = useRef(0);
  const rightUntil = useRef(0);
  const leftAngle = useRef(LEFT_REST);
  const rightAngle = useRef(RIGHT_REST);
  const launching = useRef(true);
  const launchAt = useRef(0);
  const drainedLock = useRef(false);
  const pops = useRef<Pop[]>([]);
  const bumpersRef = useRef<Bumper[]>([
    { x: 112, y: 168, r: 30, cool: 0, flash: 0 },
    { x: 248, y: 168, r: 30, cool: 0, flash: 0 },
    { x: 180, y: 262, r: 34, cool: 0, flash: 0 },
  ]);
  const [score, setScore] = useState(0);
  const [ballsLeft, setBallsLeft] = useState(3);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];
  const art = artPack(profileId);

  function resetBall(now: number) {
    ball.current = { x: 318, y: 430, vx: 0, vy: 0 };
    launching.current = true;
    launchAt.current = now + 480;
    drainedLock.current = false;
  }

  function reset() {
    resetBall(performance.now());
    setScore(0);
    setBallsLeft(3);
    setOver(false);
    onScoreChange?.(0);
    pops.current = [];
    for (const b of bumpersRef.current) {
      b.cool = 0;
      b.flash = 0;
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyZ" || e.code === "KeyA") {
        leftHeld.current = true;
      }
      if (e.code === "ArrowRight" || e.code === "KeyX" || e.code === "KeyL") {
        rightHeld.current = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyZ" || e.code === "KeyA") {
        leftHeld.current = false;
        leftUntil.current = performance.now() + FLIP_LINGER_MS;
      }
      if (e.code === "ArrowRight" || e.code === "KeyX" || e.code === "KeyL") {
        rightHeld.current = false;
        rightUntil.current = performance.now() + FLIP_LINGER_MS;
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const images: Partial<{
      table: HTMLImageElement;
      bumper: HTMLImageElement;
      ball: HTMLImageElement;
    }> = {};

    void Promise.all([
      loadImage(art.table).then((img) => {
        images.table = img;
      }),
      loadImage(art.bumper).then((img) => {
        images.bumper = img;
      }),
      loadImage(art.ball).then((img) => {
        images.ball = img;
      }),
    ]).catch(() => {
      /* keep color fallbacks */
    });

    const walls: Segment[] = [
      { ax: 28, ay: 36, bx: 332, by: 36 },
      { ax: 28, ay: 36, bx: 28, by: 390 },
      { ax: 332, ay: 36, bx: 332, by: 390 },
      { ax: 28, ay: 390, bx: 78, by: 458 },
      { ax: 332, ay: 390, bx: 282, by: 458 },
      { ax: 42, ay: 300, bx: 78, by: 430 },
      { ax: 318, ay: 300, bx: 282, by: 430 },
    ];

    const addScore = (n: number, x: number, y: number) => {
      setScore((s) => {
        const next = s + n;
        onScoreChange?.(next);
        return next;
      });
      pops.current.push({ x, y, life: 1, text: `+${n}` });
    };

    const holdFlip = (side: "left" | "right") => {
      const now = performance.now();
      if (side === "left") {
        return leftHeld.current || now < leftUntil.current;
      }
      return rightHeld.current || now < rightUntil.current;
    };

    const draw = () => {
      if (images.table) {
        ctx.drawImage(images.table, 0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      const bumpers = bumpersRef.current;
      for (const b of bumpers) {
        const size = (b.r + (b.flash > 0 ? 6 : 0)) * 2.15;
        if (images.bumper) {
          ctx.drawImage(images.bumper, b.x - size / 2, b.y - size / 2, size, size);
        } else {
          ctx.beginPath();
          ctx.fillStyle = theme.accent;
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (b.flash > 0) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.lineWidth = 4;
          ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const drawFlipper = (
        pivot: { x: number; y: number },
        angle: number,
        color: string,
      ) => {
        const tip = flipperTip(pivot, angle);
        ctx.strokeStyle = color;
        ctx.lineWidth = FLIP_HALF * 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(pivot.x, pivot.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(pivot.x, pivot.y, 8, 0, Math.PI * 2);
        ctx.fill();
      };

      drawFlipper(LEFT_PIVOT, leftAngle.current, theme.accent);
      drawFlipper(RIGHT_PIVOT, rightAngle.current, theme.accent);

      const b = ball.current;
      if (images.ball) {
        ctx.drawImage(
          images.ball,
          b.x - BALL_R - 2,
          b.y - BALL_R - 2,
          (BALL_R + 2) * 2,
          (BALL_R + 2) * 2,
        );
      } else {
        ctx.beginPath();
        ctx.fillStyle = "#fff";
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = "800 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = theme.ink;
      for (const pop of pops.current) {
        ctx.globalAlpha = Math.max(0, pop.life);
        ctx.fillText(pop.text, pop.x, pop.y);
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const leftOn = holdFlip("left");
      const rightOn = holdFlip("right");
      const prevL = leftAngle.current;
      const prevR = rightAngle.current;
      const lTarget = leftOn ? LEFT_UP : LEFT_REST;
      const rTarget = rightOn ? RIGHT_UP : RIGHT_REST;
      leftAngle.current += (lTarget - leftAngle.current) * 0.42;
      rightAngle.current += (rTarget - rightAngle.current) * 0.42;
      const leftRising = leftAngle.current < prevL - 0.02;
      const rightRising = rightAngle.current > prevR + 0.02;

      if (paused || over) {
        draw();
        return;
      }

      const b = ball.current;
      if (launching.current) {
        if (now >= launchAt.current) {
          launching.current = false;
          b.vx = -1.1;
          b.vy = -9.2;
        }
      } else {
        b.vy += GRAVITY;
        b.vx *= 0.999;
        b.vy *= 0.999;
        b.x += b.vx;
        b.y += b.vy;
      }

      for (const wall of walls) {
        bounceSegment(b, wall, 7, 0.72);
      }

      if (b.x < 22) {
        b.x = 22;
        b.vx = Math.abs(b.vx) * 0.8;
      }
      if (b.x > W - 22) {
        b.x = W - 22;
        b.vx = -Math.abs(b.vx) * 0.8;
      }
      if (b.y < 28) {
        b.y = 28;
        b.vy = Math.abs(b.vy) * 0.85;
      }

      for (const bump of bumpersRef.current) {
        if (bump.cool > 0) bump.cool -= 1;
        if (bump.flash > 0) bump.flash -= 1;
        const dx = b.x - bump.x;
        const dy = b.y - bump.y;
        const d = Math.hypot(dx, dy);
        if (d < bump.r + BALL_R && bump.cool === 0) {
          bounceCircle(b, bump.x, bump.y, bump.r + BALL_R, 1.15, 2.4);
          bump.cool = 14;
          bump.flash = 12;
          addScore(10, bump.x, bump.y - bump.r - 8);
        } else if (d < bump.r + BALL_R) {
          bounceCircle(b, bump.x, bump.y, bump.r + BALL_R, 0.6);
        }
      }

      const leftSeg: Segment = {
        ax: LEFT_PIVOT.x,
        ay: LEFT_PIVOT.y,
        bx: flipperTip(LEFT_PIVOT, leftAngle.current).x,
        by: flipperTip(LEFT_PIVOT, leftAngle.current).y,
      };
      const rightSeg: Segment = {
        ax: RIGHT_PIVOT.x,
        ay: RIGHT_PIVOT.y,
        bx: flipperTip(RIGHT_PIVOT, rightAngle.current).x,
        by: flipperTip(RIGHT_PIVOT, rightAngle.current).y,
      };
      const leftKick = leftRising ? 5.6 : 0;
      const rightKick = rightRising ? 5.6 : 0;
      bounceSegment(b, leftSeg, FLIP_HALF, 0.55, leftKick);
      bounceSegment(b, rightSeg, FLIP_HALF, 0.55, rightKick);

      pops.current = pops.current
        .map((p) => ({ ...p, y: p.y - 0.6, life: p.life - 0.018 }))
        .filter((p) => p.life > 0);

      const clipped = clampSpeed(b.vx, b.vy);
      b.vx = clipped.vx;
      b.vy = clipped.vy;

      const inDrain =
        !launching.current &&
        b.y > 518 &&
        b.x > 132 &&
        b.x < 228;
      if (inDrain && !drainedLock.current) {
        drainedLock.current = true;
        setBallsLeft((n) => {
          const next = n - 1;
          if (next <= 0) setOver(true);
          else resetBall(performance.now() + 80);
          return next;
        });
      }

      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, art, onScoreChange]);

  function press(side: "left" | "right", down: boolean) {
    if (side === "left") {
      leftHeld.current = down;
      if (!down) leftUntil.current = performance.now() + FLIP_LINGER_MS;
    } else {
      rightHeld.current = down;
      if (!down) rightUntil.current = performance.now() + FLIP_LINGER_MS;
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.pinball} · {score}
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1 text-sm" aria-live="polite">
          Balls {"●".repeat(Math.max(0, ballsLeft))}
          {"○".repeat(Math.max(0, 3 - ballsLeft))}
        </span>
        {over ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            New game
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
        style={{ width: "min(100%, 360px)" }}
      />
      <div className="flex w-full max-w-md gap-3">
        <button
          type="button"
          className="h-24 flex-1 rounded-3xl bg-[var(--accent)] text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press("left", true);
          }}
          onPointerUp={() => press("left", false)}
          onPointerCancel={() => press("left", false)}
        >
          ◀ {art.flip}
        </button>
        <button
          type="button"
          className="h-24 flex-1 rounded-3xl bg-[var(--accent)] text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            press("right", true);
          }}
          onPointerUp={() => press("right", false)}
          onPointerCancel={() => press("right", false)}
        >
          {art.flip} ▶
        </button>
      </div>
      {over ? (
        <p className="text-center font-bold text-rose-700">{art.over}</p>
      ) : (
        <p className="text-center text-sm text-[var(--ink)]/70">{art.hint}</p>
      )}
    </div>
  );
}
