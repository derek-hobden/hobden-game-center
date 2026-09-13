"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Pipe = { x: number; gapY: number; scored: boolean };

const W = 360;
const H = 480;

export default function FlappyGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const birdY = useRef(H / 2);
  const vel = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const started = useRef(false);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];

  function reset() {
    birdY.current = H / 2;
    vel.current = 0;
    pipes.current = [];
    started.current = false;
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
  }

  function flap() {
    if (over) {
      reset();
      return;
    }
    started.current = true;
    vel.current = -6.2;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let spawn = 0;

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // soft ground
      ctx.fillStyle =
        profileId === "keira" ? "rgba(244,114,182,0.35)" : "rgba(34,197,94,0.4)";
      ctx.fillRect(0, H - 48, W, 48);

      for (const p of pipes.current) {
        const gap = 130;
        ctx.fillStyle =
          profileId === "keira" ? "#86efac" : "#0ea5e9";
        ctx.beginPath();
        ctx.roundRect(p.x, 0, 54, p.gapY - gap / 2, 12);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(p.x, p.gapY + gap / 2, 54, H - (p.gapY + gap / 2) - 48, 12);
        ctx.fill();
      }

      // bird
      ctx.save();
      ctx.translate(90, birdY.current);
      ctx.rotate(Math.min(0.6, Math.max(-0.5, vel.current / 10)));
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(8, -4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(9, -4, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (!started.current && !over) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.font = "700 22px Fredoka, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Tap to flap!", W / 2, H / 2 - 40);
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused) {
        draw();
        return;
      }
      if (started.current && !over) {
        vel.current += 0.32;
        birdY.current += vel.current;

        if (ts - spawn > 1500) {
          spawn = ts;
          pipes.current.push({
            x: W + 20,
            gapY: 120 + Math.random() * 180,
            scored: false,
          });
        }

        for (const p of pipes.current) {
          p.x -= 2.4;
          const gap = 130;
          const inX = 90 + 14 > p.x && 90 - 14 < p.x + 54;
          const hit =
            inX &&
            (birdY.current - 12 < p.gapY - gap / 2 ||
              birdY.current + 12 > p.gapY + gap / 2);
          if (hit || birdY.current > H - 56 || birdY.current < 10) {
            setOver(true);
          }
          if (!p.scored && p.x + 54 < 90) {
            p.scored = true;
            setScore((s) => {
              const n = s + 1;
              onScoreChange?.(n);
              return n;
            });
          }
        }
        pipes.current = pipes.current.filter((p) => p.x > -70);
      }
      draw();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, profileId, theme, onScoreChange]);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-bold text-[var(--ink)]">
        <span>
          {theme.gameNames.flappy} · {score}
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
        width={W}
        height={H}
        className="max-w-full cursor-pointer rounded-3xl border-4 border-white/70 shadow-lg touch-manipulation"
        style={{ width: "min(100%, 360px)" }}
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
      />
      {over ? (
        <p className="text-center text-base font-semibold text-[var(--ink)]">
          Oof! Score {score}. Tap to retry.
        </p>
      ) : (
        <p className="text-center text-sm text-[var(--ink)]/70">
          Tap anywhere on the sky to flap
        </p>
      )}
    </div>
  );
}
