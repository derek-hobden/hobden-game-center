"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";
import {
  drawRoundedImage,
  loadPaperboySprites,
  type PaperboySprites,
} from "@/games/paperboy/art";

type House = { worldY: number; hit: boolean; missed: boolean };
type Hazard = { worldY: number; bumped: boolean };
type Paper = { x: number; y: number; vx: number; vy: number };
type Pop = { x: number; y: number; life: number };

const W = 360;
const H = 460;
const RIDER_X = 52;
const HOUSE_X = 198;
const MAILBOX_X = 188;
const HOUSE_COUNT = 8;
const SCROLL_SPEED = 0.7;
const HIT_X = 52;
const HIT_Y = 58;
const ROUTE_END = 2100;

function copyFor(profileId: ProfileId) {
  switch (profileId) {
    case "keira":
      return {
        toss: "Toss letter!",
        hint: "Steer the bike. Toss mail at cottages.",
        bump: "Whoops! Rainbow puddle!",
        hit: "Yay! Delivered!",
        done: (n: number) =>
          n >= HOUSE_COUNT
            ? "Every cottage got a letter!"
            : `Route done! ${n} of ${HOUSE_COUNT} letters.`,
        again: "Ride again",
      };
    case "luke":
      return {
        toss: "Toss paper!",
        hint: "Steer the bike. Toss papers at houses.",
        bump: "Whoops! Watch the cone!",
        hit: "Nice throw!",
        done: (n: number) =>
          n >= HOUSE_COUNT
            ? "Perfect route — every house!"
            : `Route done! ${n} of ${HOUSE_COUNT} papers.`,
        again: "Ride again",
      };
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

function buildHouses(): House[] {
  return Array.from({ length: HOUSE_COUNT }, (_, i) => ({
    worldY: 250 + i * 220,
    hit: false,
    missed: false,
  }));
}

function buildHazards(): Hazard[] {
  return [400, 720, 1180, 1600].map((worldY) => ({ worldY, bumped: false }));
}

export default function PaperboyGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riderY = useRef(H / 2);
  const scroll = useRef(0);
  const houses = useRef<House[]>([]);
  const hazards = useRef<Hazard[]>([]);
  const papers = useRef<Paper[]>([]);
  const pops = useRef<Pop[]>([]);
  const steer = useRef(0);
  const wobble = useRef(0);
  const warmup = useRef(75);
  const scoreRef = useRef(0);
  const sprites = useRef<PaperboySprites | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [artError, setArtError] = useState(false);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const theme = PROFILES[profileId];
  const copy = copyFor(profileId);
  const pausedRef = useRef(paused);
  const overRef = useRef(over);
  const copyRef = useRef(copy);
  const onScoreRef = useRef(onScoreChange);

  useEffect(() => {
    pausedRef.current = paused;
    overRef.current = over;
    copyRef.current = copy;
    onScoreRef.current = onScoreChange;
  }, [paused, over, copy, onScoreChange]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 900);
  }, []);

  const reset = useCallback(() => {
    riderY.current = H / 2;
    scroll.current = 0;
    houses.current = buildHouses();
    hazards.current = buildHazards();
    papers.current = [];
    pops.current = [];
    wobble.current = 0;
    warmup.current = 75;
    scoreRef.current = 0;
    setScore(0);
    onScoreRef.current?.(0);
    setOver(false);
    setToast(null);
  }, []);

  useEffect(() => {
    // Fresh route when Keira/Luke switches.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- profile change remounts the route
    reset();
  }, [profileId, reset]);

  useEffect(() => {
    let cancelled = false;
    sprites.current = null;
    loadPaperboySprites(profileId)
      .then((loaded) => {
        if (cancelled) return;
        sprites.current = loaded;
        setArtReady(true);
      })
      .catch(() => {
        if (!cancelled) setArtError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const throwPaper = useCallback(() => {
    if (paused || over) return;
    if (papers.current.length >= 3) return;
    const startX = RIDER_X + 70;
    const startY = riderY.current + 28;
    const vx = 6.4;
    let vy = 0;
    let best: House | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const h of houses.current) {
      if (h.hit || h.missed) continue;
      const hy = h.worldY - scroll.current;
      if (hy < 24 || hy > H - 24) continue;
      const dist = Math.abs(hy - startY) + hy * 0.15;
      if (dist < bestScore) {
        bestScore = dist;
        best = h;
      }
    }
    if (best) {
      const hy = best.worldY - scroll.current;
      const frames = Math.max(8, (MAILBOX_X - startX) / vx);
      vy = (hy - startY) / frames;
    }
    papers.current.push({ x: startX, y: startY, vx, vy });
  }, [paused, over]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const screenY = (worldY: number) => worldY - scroll.current;

    const draw = () => {
      const art = sprites.current;
      if (art) {
        const bgShift = -(scroll.current % H);
        ctx.drawImage(art.bg, 0, bgShift, W, H);
        ctx.drawImage(art.bg, 0, bgShift + H, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(28, 0, 92, H);

      for (const h of houses.current) {
        const y = screenY(h.worldY);
        if (y < -140 || y > H + 40) continue;
        if (art) {
          drawRoundedImage(ctx, art.house, HOUSE_X, y - 70, 150, 150, 18);
        } else {
          ctx.fillStyle = theme.surface;
          ctx.fillRect(HOUSE_X, y - 50, 120, 90);
        }
        ctx.fillStyle = h.hit ? "#34d399" : "rgba(15,23,42,0.35)";
        ctx.beginPath();
        ctx.arc(MAILBOX_X, y, 7, 0, Math.PI * 2);
        ctx.fill();
        if (h.hit && art) {
          ctx.drawImage(art.sparkle, HOUSE_X + 88, y - 78, 56, 56);
        }
      }

      for (const z of hazards.current) {
        const y = screenY(z.worldY);
        if (y < -80 || y > H + 40) continue;
        if (art) {
          drawRoundedImage(ctx, art.hazard, 38, y - 36, 72, 72, 14);
        } else {
          ctx.fillStyle = "#fb7185";
          ctx.beginPath();
          ctx.arc(74, y, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const p of papers.current) {
        if (art) {
          ctx.drawImage(art.paper, p.x - 18, p.y - 18, 40, 40);
        } else {
          ctx.fillStyle = "#fff";
          ctx.fillRect(p.x - 10, p.y - 8, 22, 14);
        }
      }

      const rx = RIDER_X + Math.sin(wobble.current * 12) * 6;
      if (art) {
        drawRoundedImage(ctx, art.rider, rx, riderY.current - 8, 96, 96, 20);
      } else {
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.arc(rx + 36, riderY.current + 28, 28, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const pop of pops.current) {
        ctx.globalAlpha = Math.max(0, pop.life);
        if (art) ctx.drawImage(art.sparkle, pop.x - 24, pop.y - 24, 48, 48);
        ctx.globalAlpha = 1;
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (pausedRef.current) {
        draw();
        return;
      }
      if (!overRef.current) {
        if (warmup.current > 0) {
          warmup.current -= 1;
        } else {
          scroll.current += SCROLL_SPEED;
        }
        riderY.current += steer.current * 4.2;
        riderY.current = Math.max(36, Math.min(H - 110, riderY.current));
        if (wobble.current > 0) wobble.current -= 0.02;

        for (const p of papers.current) {
          p.x += p.vx;
          p.y += p.vy;
        }

        for (const p of papers.current) {
          for (const h of houses.current) {
            if (h.hit || h.missed) continue;
            const hy = screenY(h.worldY);
            if (Math.abs(p.x - MAILBOX_X) < HIT_X && Math.abs(p.y - hy) < HIT_Y) {
              h.hit = true;
              p.x = 999;
              pops.current.push({ x: MAILBOX_X, y: hy, life: 1 });
              scoreRef.current += 1;
              setScore(scoreRef.current);
              onScoreRef.current?.(scoreRef.current);
              flash(copyRef.current.hit);
            }
          }
        }
        papers.current = papers.current.filter((p) => p.x < W + 30 && p.y > -20 && p.y < H + 20);

        for (const h of houses.current) {
          if (h.hit || h.missed) continue;
          if (screenY(h.worldY) < -70) h.missed = true;
        }

        const riderMid = riderY.current + 40;
        for (const z of hazards.current) {
          if (z.bumped) continue;
          const y = screenY(z.worldY);
          if (Math.abs(y - riderMid) < 28) {
            z.bumped = true;
            wobble.current = 1;
            flash(copyRef.current.bump);
          }
        }

        pops.current = pops.current
          .map((p) => ({ ...p, life: p.life - 0.03 }))
          .filter((p) => p.life > 0);

        if (scroll.current > ROUTE_END) setOver(true);
      }
      draw();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [profileId, flash, artReady, theme]);

  const holdSteer = (dir: number) => {
    steer.current = dir;
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.paperboy} · {score}/{HOUSE_COUNT}
        </span>
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: HOUSE_COUNT }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < score ? "bg-emerald-400" : "bg-white/50"
              }`}
            />
          ))}
        </span>
      </div>
      <div className="relative">
        {!artReady && !artError ? (
          <p className="absolute inset-x-0 top-4 z-10 text-center text-sm font-bold text-[var(--ink)]">
            Loading neighborhood…
          </p>
        ) : null}
        {artError ? (
          <p className="absolute inset-x-0 top-4 z-10 text-center text-sm font-bold text-rose-700">
            Pictures could not load — playing with colors.
          </p>
        ) : null}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
          style={{ width: "min(100%, 360px)" }}
          onPointerMove={(e) => {
            if (paused || over) return;
            const rect = e.currentTarget.getBoundingClientRect();
            riderY.current = ((e.clientY - rect.top) / rect.height) * H - 40;
          }}
        />
        {toast ? (
          <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-[var(--ink)] shadow">
            {toast}
          </p>
        ) : null}
        {over ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl bg-[var(--ink)]/45 px-4 text-center text-white backdrop-blur-sm">
            <p className="text-2xl font-black">{copy.done(score)}</p>
            <button
              type="button"
              className="min-h-12 rounded-2xl bg-[var(--accent)] px-5 py-3 font-bold text-[var(--accent-fg)]"
              onClick={reset}
            >
              {copy.again}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex w-full max-w-md gap-2">
        <button
          type="button"
          className="h-16 flex-1 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onPointerDown={() => holdSteer(-1)}
          onPointerUp={() => holdSteer(0)}
          onPointerCancel={() => holdSteer(0)}
          onPointerLeave={() => holdSteer(0)}
        >
          ↑
        </button>
        <button
          type="button"
          className="h-16 flex-[2] rounded-2xl bg-[var(--accent)] text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={throwPaper}
        >
          {copy.toss}
        </button>
        <button
          type="button"
          className="h-16 flex-1 rounded-2xl bg-[var(--surface)] text-2xl font-black shadow-md active:scale-95"
          onPointerDown={() => holdSteer(1)}
          onPointerUp={() => holdSteer(0)}
          onPointerCancel={() => holdSteer(0)}
          onPointerLeave={() => holdSteer(0)}
        >
          ↓
        </button>
      </div>
      <p className="text-sm text-[var(--ink)]/70">{copy.hint}</p>
    </div>
  );
}
