"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Pipe = { x: number; gapY: number; scored: boolean };

const W = 360;
const H = 520;
const GAP = 190;
const GRAVITY = 0.22;
const FLAP_V = -5.2;
const PIPE_SPEED = 1.55;
const SPAWN_MS = 2200;
const BIRD_X = 88;

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
  const isKeira = profileId === "keira";

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
    vel.current = FLAP_V;
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
    let firstDelay = true;

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // soft clouds
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (const c of [
        [40, 70],
        [180, 110],
        [280, 60],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], 36, 18, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = isKeira ? "rgba(244,114,182,0.4)" : "rgba(34,197,94,0.45)";
      ctx.fillRect(0, H - 56, W, 56);
      ctx.fillStyle = isKeira ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.25)";
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(i * 48 + 8, H - 40, 20, 8);
      }

      for (const p of pipes.current) {
        ctx.fillStyle = isKeira ? "#86efac" : "#38bdf8";
        ctx.beginPath();
        ctx.roundRect(p.x, 0, 58, p.gapY - GAP / 2, 14);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(
          p.x,
          p.gapY + GAP / 2,
          58,
          H - (p.gapY + GAP / 2) - 56,
          14,
        );
        ctx.fill();
        // themed caps
        ctx.fillStyle = isKeira ? "#f9a8d4" : "#0284c7";
        ctx.fillRect(p.x - 4, p.gapY - GAP / 2 - 14, 66, 14);
        ctx.fillRect(p.x - 4, p.gapY + GAP / 2, 66, 14);
      }

      // bird / fairy / jet
      ctx.save();
      ctx.translate(BIRD_X, birdY.current);
      ctx.rotate(Math.min(0.55, Math.max(-0.45, vel.current / 9)));
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(10, -5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(11, -5, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "18px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(isKeira ? "🧚" : "✈️", -2, 6);
      ctx.restore();

      if (!started.current && !over) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 110, H / 2 - 58, 220, 56, 16);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "800 24px Fredoka, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Tap to flap!", W / 2, H / 2 - 22);
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused) {
        draw();
        return;
      }
      if (started.current && !over) {
        vel.current += GRAVITY;
        birdY.current += vel.current;

        if (firstDelay) {
          if (ts - spawn > 900) {
            firstDelay = false;
            spawn = ts;
          }
        } else if (ts - spawn > SPAWN_MS) {
          spawn = ts;
          pipes.current.push({
            x: W + 24,
            gapY: 140 + Math.random() * 180,
            scored: false,
          });
        }

        for (const p of pipes.current) {
          p.x -= PIPE_SPEED;
          const inX = BIRD_X + 16 > p.x && BIRD_X - 16 < p.x + 58;
          const hit =
            inX &&
            (birdY.current - 14 < p.gapY - GAP / 2 ||
              birdY.current + 14 > p.gapY + GAP / 2);
          if (hit || birdY.current > H - 64 || birdY.current < 12) {
            setOver(true);
          }
          if (!p.scored && p.x + 58 < BIRD_X) {
            p.scored = true;
            setScore((s) => {
              const n = s + 1;
              onScoreChange?.(n);
              return n;
            });
          }
        }
        pipes.current = pipes.current.filter((p) => p.x > -80);
      }
      draw();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, profileId, theme, onScoreChange, isKeira]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.flappy} · {score}
        </span>
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
        width={W}
        height={H}
        className="max-w-full cursor-pointer touch-manipulation rounded-3xl border-4 border-white/70 shadow-lg"
        style={{ width: "min(100%, 360px)" }}
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
      />
      {over ? (
        <p className="rounded-2xl bg-white/70 px-4 py-3 text-center text-base font-bold text-[var(--ink)]">
          Soft landing! Score {score}. Tap to try again.
        </p>
      ) : (
        <p className="text-center text-sm font-medium text-[var(--ink)]/70">
          Tap the sky — wide gaps, gentle flaps
        </p>
      )}
    </div>
  );
}
