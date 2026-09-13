"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

const W = 360;
const H = 520;

export default function PinballGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ball = useRef({ x: W / 2, y: 120, vx: 2.2, vy: 2.8 });
  const left = useRef(false);
  const right = useRef(false);
  const [score, setScore] = useState(0);
  const [balls, setBalls] = useState(3);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  function resetBall() {
    ball.current = {
      x: W / 2,
      y: 100,
      vx: (Math.random() > 0.5 ? 1 : -1) * 2.4,
      vy: 2.5,
    };
  }

  function reset() {
    resetBall();
    setScore(0);
    setBalls(3);
    setOver(false);
    onScoreChange?.(0);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const bumpers = [
      { x: 110, y: 160, r: 22 },
      { x: 250, y: 160, r: 22 },
      { x: 180, y: 240, r: 26 },
    ];

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = isKeira ? "#f9a8d4" : "#38bdf8";
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, W - 16, H - 16);

      for (const b of bumpers) {
        ctx.beginPath();
        ctx.fillStyle = isKeira ? "#f472b6" : "#0ea5e9";
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "18px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(isKeira ? "💫" : "💥", b.x, b.y + 6);
      }

      // flippers
      const lf = left.current ? -0.55 : 0.25;
      const rf = right.current ? 0.55 : -0.25;
      ctx.strokeStyle = isKeira ? "#db2777" : "#0369a1";
      ctx.lineWidth = 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(70, 450);
      ctx.lineTo(70 + Math.cos(lf) * 70, 450 + Math.sin(lf) * 70);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(290, 450);
      ctx.lineTo(290 + Math.cos(Math.PI + rf) * 70, 450 + Math.sin(Math.PI + rf) * 70);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = "#fff";
      ctx.arc(ball.current.x, ball.current.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.stroke();
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused || over) {
        draw();
        return;
      }
      const b = ball.current;
      b.vy += 0.18;
      b.x += b.vx;
      b.y += b.vy;
      if (b.x < 20 || b.x > W - 20) b.vx *= -1;
      if (b.y < 20) b.vy = Math.abs(b.vy);
      for (const bump of bumpers) {
        const dx = b.x - bump.x;
        const dy = b.y - bump.y;
        const d = Math.hypot(dx, dy);
        if (d < bump.r + 10) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          b.vx = nx * 4;
          b.vy = ny * 4;
          b.x = bump.x + nx * (bump.r + 11);
          b.y = bump.y + ny * (bump.r + 11);
          setScore((s) => {
            const n = s + 5;
            onScoreChange?.(n);
            return n;
          });
        }
      }
      // flipper hits (approx)
      if (b.y > 420 && b.y < 470) {
        if (left.current && b.x > 60 && b.x < 150) {
          b.vy = -8;
          b.vx = 3;
        }
        if (right.current && b.x > 210 && b.x < 300) {
          b.vy = -8;
          b.vx = -3;
        }
      }
      if (b.y > H - 10) {
        setBalls((n) => {
          const leftBalls = n - 1;
          if (leftBalls <= 0) setOver(true);
          else resetBall();
          return leftBalls;
        });
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, isKeira, onScoreChange]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.pinball} · {score}
        </span>
        <span className="rounded-full bg-white/70 px-3 py-1 text-sm">
          Balls {balls}
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
          className="h-20 flex-1 rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onPointerDown={() => {
            left.current = true;
          }}
          onPointerUp={() => {
            left.current = false;
          }}
          onPointerLeave={() => {
            left.current = false;
          }}
        >
          ◀ Flip
        </button>
        <button
          type="button"
          className="h-20 flex-1 rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onPointerDown={() => {
            right.current = true;
          }}
          onPointerUp={() => {
            right.current = false;
          }}
          onPointerLeave={() => {
            right.current = false;
          }}
        >
          Flip ▶
        </button>
      </div>
      {over ? (
        <p className="font-bold text-rose-700">Game over — score {score}</p>
      ) : (
        <p className="text-sm text-[var(--ink)]/70">Hold flippers to bounce the ball</p>
      )}
    </div>
  );
}
