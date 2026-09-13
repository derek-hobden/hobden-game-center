"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Mob = { x: number; y: number; hp: number };

const W = 360;
const H = 480;

export default function VampireSurvivorsGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const px = useRef(W / 2);
  const py = useRef(H / 2);
  const mobs = useRef<Mob[]>([]);
  const t = useRef(0);
  const [score, setScore] = useState(0);
  const [alive, setAlive] = useState(true);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  function reset() {
    px.current = W / 2;
    py.current = H / 2;
    mobs.current = [];
    t.current = 0;
    setScore(0);
    onScoreChange?.(0);
    setAlive(true);
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
    let last = 0;

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // aura
      ctx.beginPath();
      ctx.fillStyle = isKeira ? "rgba(244,114,182,0.25)" : "rgba(14,165,233,0.25)";
      ctx.arc(px.current, py.current, 54, 0, Math.PI * 2);
      ctx.fill();
      for (const m of mobs.current) {
        ctx.font = "24px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(isKeira ? "🦇" : "👻", m.x, m.y);
      }
      ctx.font = "34px system-ui";
      ctx.fillText(isKeira ? "🧚" : "🛡️", px.current, py.current + 8);
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused || !alive) {
        draw();
        return;
      }
      if (ts - last > 33) {
        last = ts;
        t.current += 1;
        if (t.current % 45 === 0) {
          const ang = Math.random() * Math.PI * 2;
          mobs.current.push({
            x: W / 2 + Math.cos(ang) * 220,
            y: H / 2 + Math.sin(ang) * 220,
            hp: 1,
          });
        }
        for (const m of mobs.current) {
          const dx = px.current - m.x;
          const dy = py.current - m.y;
          const d = Math.hypot(dx, dy) || 1;
          m.x += (dx / d) * 1.1;
          m.y += (dy / d) * 1.1;
          if (d < 54) {
            m.hp = 0;
            setScore((s) => {
              const n = s + 1;
              onScoreChange?.(n);
              return n;
            });
          }
          if (d < 18) setAlive(false);
        }
        mobs.current = mobs.current.filter((m) => m.hp > 0);
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, alive, theme, isKeira, onScoreChange]);

  const nudge = (dx: number, dy: number) => {
    if (!alive || paused) return;
    px.current = Math.max(24, Math.min(W - 24, px.current + dx));
    py.current = Math.max(24, Math.min(H - 24, py.current + dy));
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames["vampire-survivors"]} · {score}
        </span>
        {!alive ? (
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
        onPointerMove={(e) => {
          if (!alive || paused) return;
          const rect = e.currentTarget.getBoundingClientRect();
          px.current = ((e.clientX - rect.left) / rect.width) * W;
          py.current = ((e.clientY - rect.top) / rect.height) * H;
        }}
      />
      <div className="grid grid-cols-3 gap-2">
        <div />
        <Pad label="↑" onPress={() => nudge(0, -28)} />
        <div />
        <Pad label="←" onPress={() => nudge(-28, 0)} />
        <Pad label="↓" onPress={() => nudge(0, 28)} />
        <Pad label="→" onPress={() => nudge(28, 0)} />
      </div>
      <p className="text-center text-sm font-medium text-[var(--ink)]/70">
        Walk near foes — your sparkle aura zaps them!
      </p>
      {!alive ? (
        <p className="font-bold text-rose-700">Caught! Score {score}.</p>
      ) : null}
    </div>
  );
}

function Pad({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
      onClick={onPress}
    >
      {label}
    </button>
  );
}
