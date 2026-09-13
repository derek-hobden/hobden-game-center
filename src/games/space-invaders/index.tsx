"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Inv = { x: number; y: number; alive: boolean };

const W = 360;
const H = 480;

export default function SpaceInvadersGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerX = useRef(W / 2);
  const bullets = useRef<{ x: number; y: number }[]>([]);
  const invaders = useRef<Inv[]>([]);
  const dir = useRef(1);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  function reset() {
    playerX.current = W / 2;
    bullets.current = [];
    invaders.current = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 6; c++) {
        invaders.current.push({ x: 40 + c * 48, y: 60 + r * 42, alive: true });
      }
    }
    dir.current = 1;
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
    setWon(false);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  function shoot() {
    if (over || won || paused) return;
    if (bullets.current.length >= 3) return;
    bullets.current.push({ x: playerX.current, y: H - 70 });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let acc = 0;

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      for (const inv of invaders.current) {
        if (!inv.alive) continue;
        ctx.font = "28px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(isKeira ? "✨" : "👾", inv.x, inv.y);
      }

      ctx.font = "32px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(isKeira ? "🦄" : "🚀", playerX.current, H - 40);

      ctx.fillStyle = theme.accent;
      for (const b of bullets.current) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused || over || won) {
        draw();
        return;
      }
      if (ts - acc > 40) {
        acc = ts;
        let hitEdge = false;
        for (const inv of invaders.current) {
          if (!inv.alive) continue;
          inv.x += dir.current * 1.2;
          if (inv.x < 24 || inv.x > W - 24) hitEdge = true;
        }
        if (hitEdge) {
          dir.current *= -1;
          for (const inv of invaders.current) {
            if (inv.alive) inv.y += 12;
          }
        }
        bullets.current = bullets.current
          .map((b) => ({ ...b, y: b.y - 8 }))
          .filter((b) => b.y > 0);
        for (const b of bullets.current) {
          for (const inv of invaders.current) {
            if (!inv.alive) continue;
            if (Math.hypot(b.x - inv.x, b.y - inv.y) < 22) {
              inv.alive = false;
              b.y = -99;
              setScore((s) => {
                const n = s + 1;
                onScoreChange?.(n);
                return n;
              });
            }
          }
        }
        bullets.current = bullets.current.filter((b) => b.y > 0);
        if (invaders.current.every((i) => !i.alive)) setWon(true);
        if (invaders.current.some((i) => i.alive && i.y > H - 90)) setOver(true);
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, won, theme, isKeira, onScoreChange]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames["space-invaders"]} · {score}
        </span>
        {over || won ? (
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
          const rect = e.currentTarget.getBoundingClientRect();
          playerX.current = ((e.clientX - rect.left) / rect.width) * W;
        }}
        onPointerDown={shoot}
      />
      <div className="flex gap-3">
        <button
          type="button"
          className="flex h-16 w-20 items-center justify-center rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onClick={() => {
            playerX.current = Math.max(30, playerX.current - 28);
          }}
        >
          ←
        </button>
        <button
          type="button"
          className="flex h-16 min-w-28 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={shoot}
        >
          Zap!
        </button>
        <button
          type="button"
          className="flex h-16 w-20 items-center justify-center rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onClick={() => {
            playerX.current = Math.min(W - 30, playerX.current + 28);
          }}
        >
          →
        </button>
      </div>
      {won ? (
        <p className="font-bold text-emerald-700">Sky clear! You win! 🎉</p>
      ) : null}
      {over ? (
        <p className="font-bold text-rose-700">They got too close — try again.</p>
      ) : null}
    </div>
  );
}
