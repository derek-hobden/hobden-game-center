"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type House = { x: number; y: number; hit: boolean };
type Paper = { x: number; y: number; vx: number };

const W = 360;
const H = 480;

export default function PaperboyGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const py = useRef(H / 2);
  const houses = useRef<House[]>([]);
  const papers = useRef<Paper[]>([]);
  const scroll = useRef(0);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  function reset() {
    py.current = H / 2;
    scroll.current = 0;
    papers.current = [];
    houses.current = Array.from({ length: 8 }, (_, i) => ({
      x: 220,
      y: 40 + i * 70,
      hit: false,
    }));
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const throwPaper = () => {
    if (paused || over) return;
    papers.current.push({ x: 90, y: py.current, vx: 6 });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.skyFrom);
      g.addColorStop(1, theme.skyTo);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(40, 0, 70, H);
      for (const h of houses.current) {
        const y = ((h.y - scroll.current) % (H + 80)) + 20;
        ctx.font = "40px system-ui";
        ctx.fillText(isKeira ? "🏠" : "🏡", h.x, y);
        if (h.hit) {
          ctx.font = "22px system-ui";
          ctx.fillText("✅", h.x + 36, y - 10);
        }
      }
      for (const p of papers.current) {
        ctx.font = "22px system-ui";
        ctx.fillText(isKeira ? "💌" : "📰", p.x, p.y);
      }
      ctx.font = "36px system-ui";
      ctx.fillText(isKeira ? "👸" : "🚴", 55, py.current);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused || over) {
        draw();
        return;
      }
      scroll.current += 1.6;
      for (const p of papers.current) p.x += p.vx;
      for (const p of papers.current) {
        for (const h of houses.current) {
          if (h.hit) continue;
          const hy = ((h.y - scroll.current) % (H + 80)) + 20;
          if (Math.abs(p.x - (h.x + 10)) < 28 && Math.abs(p.y - hy) < 28) {
            h.hit = true;
            p.x = 999;
            setScore((s) => {
              const n = s + 1;
              onScoreChange?.(n);
              return n;
            });
          }
        }
      }
      papers.current = papers.current.filter((p) => p.x < W + 20);
      // recycle houses
      for (const h of houses.current) {
        const y = ((h.y - scroll.current) % (H + 80)) + 20;
        if (y > H + 40) {
          h.hit = false;
        }
      }
      if (scroll.current > 2400) setOver(true);
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, theme, isKeira, onScoreChange]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.paperboy} · {score}
        </span>
        {over ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Deliver again
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
          py.current = ((e.clientY - rect.top) / rect.height) * H;
        }}
        onPointerDown={throwPaper}
      />
      <div className="flex w-full max-w-md gap-2">
        <button
          type="button"
          className="h-16 flex-1 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onClick={() => {
            py.current = Math.max(40, py.current - 36);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="h-16 flex-[2] rounded-2xl bg-[var(--accent)] text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={throwPaper}
        >
          Toss paper!
        </button>
        <button
          type="button"
          className="h-16 flex-1 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onClick={() => {
            py.current = Math.min(H - 40, py.current + 36);
          }}
        >
          ↓
        </button>
      </div>
      {over ? (
        <p className="font-bold text-emerald-700">Route done! Deliveries: {score}</p>
      ) : (
        <p className="text-sm text-[var(--ink)]/70">Move + toss toward houses</p>
      )}
    </div>
  );
}
