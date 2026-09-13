"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Obs = { x: number; y: number; w: number; h: number; kind: "rock" | "coin" };

const W = 360;
const H = 480;

export default function JetpackGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const y = useRef(H / 2);
  const vy = useRef(0);
  const holding = useRef(false);
  const dist = useRef(0);
  const obs = useRef<Obs[]>([]);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  function reset() {
    y.current = H / 2;
    vy.current = 0;
    holding.current = false;
    dist.current = 0;
    obs.current = [];
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
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
    let spawn = 0;

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = isKeira ? "#f9a8d4" : "#64748b";
      ctx.fillRect(0, 0, W, 36);
      ctx.fillRect(0, H - 36, W, 36);
      for (const o of obs.current) {
        ctx.font = "28px system-ui";
        ctx.fillText(o.kind === "coin" ? "⭐" : isKeira ? "🪸" : "🪨", o.x, o.y + 24);
      }
      ctx.font = "36px system-ui";
      ctx.fillText(isKeira ? "🧜" : "🧑‍🚀", 70, y.current);
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused || over) {
        draw();
        return;
      }
      vy.current += holding.current ? -0.45 : 0.35;
      vy.current = Math.max(-6, Math.min(6, vy.current));
      y.current += vy.current;
      dist.current += 1;
      if (ts - spawn > 900) {
        spawn = ts;
        const coin = Math.random() > 0.45;
        obs.current.push({
          x: W + 20,
          y: 60 + Math.random() * (H - 140),
          w: 28,
          h: 28,
          kind: coin ? "coin" : "rock",
        });
      }
      for (const o of obs.current) o.x -= 3.2;
      for (const o of obs.current) {
        if (Math.abs(o.x - 70) < 28 && Math.abs(o.y - y.current) < 30) {
          if (o.kind === "coin") {
            o.x = -99;
            setScore((s) => {
              const n = s + 1;
              onScoreChange?.(n);
              return n;
            });
          } else setOver(true);
        }
      }
      obs.current = obs.current.filter((o) => o.x > -40);
      if (y.current < 50 || y.current > H - 50) setOver(true);
      if (dist.current % 40 === 0) {
        setScore((s) => {
          const n = s + 1;
          onScoreChange?.(n);
          return n;
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
          {theme.gameNames.jetpack} · {score}
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
        width={W}
        height={H}
        className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
        style={{ width: "min(100%, 360px)" }}
        onPointerDown={() => {
          holding.current = true;
        }}
        onPointerUp={() => {
          holding.current = false;
        }}
        onPointerLeave={() => {
          holding.current = false;
        }}
      />
      <button
        type="button"
        className="min-h-16 w-full max-w-md rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
        onPointerDown={() => {
          holding.current = true;
        }}
        onPointerUp={() => {
          holding.current = false;
        }}
        onPointerLeave={() => {
          holding.current = false;
        }}
      >
        Hold to boost ↑
      </button>
      {over ? (
        <p className="font-bold text-rose-700">Bump! Score {score}.</p>
      ) : (
        <p className="text-sm text-[var(--ink)]/70">Hold to fly up · release to fall</p>
      )}
    </div>
  );
}
