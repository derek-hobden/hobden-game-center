"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

const W = 360;
const H = 240;

export default function ExcitebikeGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const x = useRef(40);
  const y = useRef(150);
  const vy = useRef(0);
  const speed = useRef(2.4);
  const hills = useRef<{ x: number; h: number }[]>([]);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  function reset() {
    x.current = 40;
    y.current = 150;
    vy.current = 0;
    speed.current = 2.4;
    hills.current = Array.from({ length: 8 }, (_, i) => ({
      x: 120 + i * 90,
      h: 20 + Math.random() * 40,
    }));
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

    const groundAt = (gx: number) => {
      let base = 180;
      for (const h of hills.current) {
        const d = Math.abs(gx - h.x);
        if (d < 40) base = 180 - h.h * (1 - d / 40);
      }
      return base;
    };

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = isKeira ? "#86efac" : "#a3e635";
      ctx.fillRect(0, 180, W, 60);
      ctx.strokeStyle = isKeira ? "#f9a8d4" : "#78716c";
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < W; i += 8) {
        const gy = groundAt(i);
        if (i === 0) ctx.moveTo(i, gy);
        else ctx.lineTo(i, gy);
      }
      ctx.stroke();
      ctx.font = "34px system-ui";
      ctx.fillText(isKeira ? "🦄" : "🏍️", x.current, y.current);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused || over) {
        draw();
        return;
      }
      for (const h of hills.current) h.x -= speed.current;
      if (hills.current[0]?.x < -50) {
        hills.current.shift();
        hills.current.push({
          x: hills.current[hills.current.length - 1].x + 90,
          h: 20 + Math.random() * 45,
        });
        setScore((s) => {
          const n = s + 1;
          onScoreChange?.(n);
          return n;
        });
        speed.current = Math.min(4.2, speed.current + 0.05);
      }
      const ground = groundAt(x.current + 10);
      vy.current += 0.5;
      y.current += vy.current;
      if (y.current > ground) {
        y.current = ground;
        vy.current = 0;
      }
      // wipeout if landing too hard on steep slope change
      const ahead = groundAt(x.current + 30);
      if (ground - ahead > 28 && y.current >= ground - 2) {
        // fine
      }
      if (y.current > 210) setOver(true);
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, isKeira, onScoreChange]);

  const jump = () => {
    if (paused || over) return;
    const ground = 180;
    if (y.current >= ground - 40) vy.current = -8;
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.excitebike} · {score}
        </span>
        {over ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Race again
          </button>
        ) : null}
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="max-w-full rounded-3xl border-4 border-white/70 shadow-lg"
        style={{ width: "min(100%, 360px)" }}
        onPointerDown={jump}
      />
      <button
        type="button"
        className="min-h-16 w-full max-w-md rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
        onClick={jump}
      >
        Jump!
      </button>
      <p className="text-sm text-[var(--ink)]/70">Tap to hop the bumps</p>
    </div>
  );
}
