"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";

type Inv = { x: number; y: number; alive: boolean; kind: 0 | 1 | 2 };
type Shot = { x: number; y: number };
type Pop = { x: number; y: number; life: number; hue: string };

const W = 360;
const H = 480;
const PLAYER_Y = H - 58;
const INV_SIZE = 52;
const SHIP_SIZE = 72;
const HIT_R = 38;
const COLS = 5;
const ROWS = 3;

type ArtPack = {
  bg: string;
  ship: string;
  invaders: [string, string, string];
  shot: string;
  win: string;
  lose: string;
  zapLabel: string;
};

function artFor(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        bg: "/games/space-invaders/keira-space-bg.png",
        ship: "/games/space-invaders/keira-ship.png",
        invaders: [
          "/games/space-invaders/keira-invader-star.png",
          "/games/space-invaders/keira-invader-fairy.png",
          "/games/space-invaders/keira-invader-mermaid.png",
        ],
        shot: "#f472b6",
        win: "Rainbow sky is clear!",
        lose: "They floated too close — try again.",
        zapLabel: "Sparkle!",
      };
    case "luke":
      return {
        bg: "/games/space-invaders/luke-space-bg.png",
        ship: "/games/space-invaders/luke-ship.png",
        invaders: [
          "/games/space-invaders/luke-invader-alien.png",
          "/games/space-invaders/luke-invader-dino.png",
          "/games/space-invaders/luke-invader-meteor.png",
        ],
        shot: "#38bdf8",
        win: "Space is clear, captain!",
        lose: "Too close! Blast off again.",
        zapLabel: "Zap!",
      };
    default: {
      const _never: never = profileId;
      throw new Error(`Unknown profile: ${_never}`);
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  size: number,
) {
  if (!img) return;
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

function clampPlayer(x: number): number {
  return Math.max(SHIP_SIZE / 2, Math.min(W - SHIP_SIZE / 2, x));
}

export default function SpaceInvadersGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerX = useRef(W / 2);
  const bullets = useRef<Shot[]>([]);
  const invaders = useRef<Inv[]>([]);
  const pops = useRef<Pop[]>([]);
  const dir = useRef(1);
  const lastShot = useRef(0);
  const holdDir = useRef(0);
  const autoFire = useRef(true);
  const scoreRef = useRef(0);
  const images = useRef<Map<string, HTMLImageElement>>(new Map());
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const [artError, setArtError] = useState(false);
  const [popText, setPopText] = useState<string | null>(null);
  const theme = PROFILES[profileId];
  const art = artFor(profileId);

  const reset = useCallback(() => {
    playerX.current = W / 2;
    bullets.current = [];
    pops.current = [];
    invaders.current = [];
    const gapX = 62;
    const startX = 46;
    for (let r = 0; r < ROWS; r++) {
      const kind = r as 0 | 1 | 2;
      for (let c = 0; c < COLS; c++) {
        invaders.current.push({
          x: startX + c * gapX,
          y: 58 + r * 58,
          alive: true,
          kind,
        });
      }
    }
    dir.current = 1;
    lastShot.current = 0;
    scoreRef.current = 0;
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
    setWon(false);
    setPopText(null);
  }, [onScoreChange]);

  useEffect(() => {
    reset();
  }, [profileId, reset]);

  useEffect(() => {
    let cancelled = false;
    setArtReady(false);
    setArtError(false);
    const pack = artFor(profileId);
    const srcs = [pack.bg, pack.ship, ...pack.invaders];
    Promise.all(srcs.map((src) => loadImage(src)))
      .then((imgs) => {
        if (cancelled) return;
        const map = new Map<string, HTMLImageElement>();
        srcs.forEach((src, i) => map.set(src, imgs[i]!));
        images.current = map;
        setArtReady(true);
      })
      .catch(() => {
        if (!cancelled) setArtError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const shoot = useCallback(() => {
    if (over || won || paused) return;
    if (bullets.current.length >= 2) return;
    bullets.current.push({ x: playerX.current, y: PLAYER_Y - 28 });
  }, [over, won, paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let acc = 0;
    const pack = artFor(profileId);

    const draw = () => {
      const bg = images.current.get(pack.bg);
      if (bg) {
        ctx.drawImage(bg, 0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      for (const inv of invaders.current) {
        if (!inv.alive) continue;
        const src = pack.invaders[inv.kind];
        drawSprite(ctx, images.current.get(src), inv.x, inv.y, INV_SIZE);
      }

      drawSprite(
        ctx,
        images.current.get(pack.ship),
        playerX.current,
        PLAYER_Y,
        SHIP_SIZE,
      );

      ctx.fillStyle = pack.shot;
      ctx.shadowColor = pack.shot;
      ctx.shadowBlur = 10;
      for (const b of bullets.current) {
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 5, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      for (const p of pops.current) {
        ctx.globalAlpha = Math.max(0, p.life / 18);
        ctx.fillStyle = p.hue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16 + (18 - p.life), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused || over || won) {
        draw();
        return;
      }
      if (holdDir.current !== 0) {
        playerX.current = clampPlayer(playerX.current + holdDir.current * 6);
      }
      if (autoFire.current && ts - lastShot.current > 520) {
        lastShot.current = ts;
        shoot();
      }
      if (ts - acc > 40) {
        acc = ts;
        let hitEdge = false;
        for (const inv of invaders.current) {
          if (!inv.alive) continue;
          inv.x += dir.current * 0.7;
          if (inv.x < 28 || inv.x > W - 28) hitEdge = true;
        }
        if (hitEdge) {
          dir.current *= -1;
          for (const inv of invaders.current) {
            if (inv.alive) inv.y += 6;
          }
        }
        bullets.current = bullets.current
          .map((b) => ({ ...b, y: b.y - 9 }))
          .filter((b) => b.y > -12);
        let hits = 0;
        for (const b of bullets.current) {
          for (const inv of invaders.current) {
            if (!inv.alive) continue;
            if (Math.hypot(b.x - inv.x, b.y - inv.y) < HIT_R) {
              inv.alive = false;
              b.y = -99;
              pops.current.push({ x: inv.x, y: inv.y, life: 18, hue: pack.shot });
              hits += 1;
            }
          }
        }
        if (hits > 0) {
          scoreRef.current += hits;
          const n = scoreRef.current;
          setScore(n);
          onScoreChange?.(n);
          setPopText("Yay! +1");
        }
        bullets.current = bullets.current.filter((b) => b.y > 0);
        pops.current = pops.current
          .map((p) => ({ ...p, life: p.life - 1 }))
          .filter((p) => p.life > 0);
        if (invaders.current.every((i) => !i.alive)) setWon(true);
        if (invaders.current.some((i) => i.alive && i.y > H - 100)) setOver(true);
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, over, won, theme, profileId, onScoreChange, shoot, artReady]);

  useEffect(() => {
    if (!popText) return;
    const id = window.setTimeout(() => setPopText(null), 700);
    return () => window.clearTimeout(id);
  }, [popText]);

  useEffect(() => {
    return () => {
      holdDir.current = 0;
    };
  }, []);

  function startHold(dirN: number) {
    holdDir.current = dirN;
  }

  function stopHold() {
    holdDir.current = 0;
  }

  function pointerToX(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    playerX.current = clampPlayer(((e.clientX - rect.left) / rect.width) * W);
  }

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
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
          style={{ width: "min(100%, 360px)" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointerToX(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 0 && e.pointerType === "mouse") return;
            pointerToX(e);
          }}
        />
        {!artReady && !artError ? (
          <p className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/20 text-lg font-bold text-white">
            Painting the sky…
          </p>
        ) : null}
        {popText ? (
          <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-black text-pink-600 shadow">
            {popText}
          </p>
        ) : null}
      </div>
      <p className="text-center text-sm font-semibold text-[var(--ink)]/70">
        Drag to fly. Auto-sparkles. Hold arrows to slide.
      </p>
      <div className="flex w-full max-w-md gap-2">
        <button
          type="button"
          className="flex h-20 flex-1 items-center justify-center rounded-2xl bg-[var(--surface)] text-3xl font-black shadow-md active:scale-95"
          onPointerDown={() => startHold(-1)}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onPointerLeave={stopHold}
        >
          ←
        </button>
        <button
          type="button"
          className="flex h-20 min-w-28 flex-[1.4] items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-lg font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onPointerDown={() => {
            autoFire.current = true;
            shoot();
          }}
        >
          {art.zapLabel}
        </button>
        <button
          type="button"
          className="flex h-20 flex-1 items-center justify-center rounded-2xl bg-[var(--surface)] text-3xl font-black shadow-md active:scale-95"
          onPointerDown={() => startHold(1)}
          onPointerUp={stopHold}
          onPointerCancel={stopHold}
          onPointerLeave={stopHold}
        >
          →
        </button>
      </div>
      {won ? (
        <p className="font-bold text-emerald-700">{art.win}</p>
      ) : null}
      {over ? (
        <p className="font-bold text-rose-700">{art.lose}</p>
      ) : null}
    </div>
  );
}
