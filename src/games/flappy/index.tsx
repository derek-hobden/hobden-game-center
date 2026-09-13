"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import type { ProfileId } from "@/lib/profiles";
import { PROFILES } from "@/lib/profiles";

type Pipe = { x: number; gapY: number; scored: boolean };
type Burst = { x: number; y: number; life: number };

type ArtPack = {
  sky: string;
  ground: string;
  pipe: string;
  flyer: string;
  star: string;
};

const W = 360;
const H = 540;
const GAP = 228;
const GRAVITY = 0.15;
const FLAP_V = -4.6;
const PIPE_SPEED = 1.22;
const SPAWN_MS = 2500;
const BIRD_X = 92;
const HIT_R = 11;
const GROUND_H = 78;
const PIPE_W = 64;
const FIRST_PIPE_MS = 1400;

function artFor(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        sky: "/games/flappy/keira-sky.jpg",
        ground: "/games/flappy/keira-ground.jpg",
        pipe: "/games/flappy/keira-pipe.jpg",
        flyer: "/games/flappy/keira-flyer.png",
        star: "/games/flappy/star.png",
      };
    case "luke":
      return {
        sky: "/games/flappy/luke-sky.jpg",
        ground: "/games/flappy/luke-ground.jpg",
        pipe: "/games/flappy/luke-pipe.jpg",
        flyer: "/games/flappy/luke-flyer.png",
        star: "/games/flappy/star.png",
      };
    default: {
      const _never: never = profileId;
      return _never;
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

function drawTiledY(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (h <= 0 || w <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.clip();
  const scale = w / img.width;
  const tileH = img.height * scale;
  let yy = y;
  while (yy < y + h) {
    ctx.drawImage(img, x, yy, w, tileH);
    yy += tileH - 1;
  }
  ctx.restore();
}

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
  const overRef = useRef(false);
  const bursts = useRef<Burst[]>([]);
  const groundX = useRef(0);
  const skyX = useRef(0);
  const flapPulse = useRef(0);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [pop, setPop] = useState<string | null>(null);
  const [artReady, setArtReady] = useState(false);
  const [artError, setArtError] = useState(false);
  const art = useRef<Partial<Record<keyof ArtPack, HTMLImageElement>>>({});
  const theme = PROFILES[profileId];

  const reset = useCallback(() => {
    birdY.current = H / 2;
    vel.current = 0;
    pipes.current = [];
    started.current = false;
    overRef.current = false;
    bursts.current = [];
    flapPulse.current = 0;
    setScore(0);
    onScoreChange?.(0);
    setOver(false);
    setPop(null);
  }, [onScoreChange]);

  const flap = useCallback(() => {
    if (paused) return;
    if (overRef.current) {
      reset();
      return;
    }
    started.current = true;
    vel.current = FLAP_V;
    flapPulse.current = 1;
  }, [paused, reset]);

  useEffect(() => {
    let cancelled = false;
    setArtReady(false);
    setArtError(false);
    const urls = artFor(profileId);
    Promise.all([
      loadImage(urls.sky),
      loadImage(urls.ground),
      loadImage(urls.pipe),
      loadImage(urls.flyer),
      loadImage(urls.star),
    ])
      .then(([sky, ground, pipe, flyer, star]) => {
        if (cancelled) return;
        art.current = { sky, ground, pipe, flyer, star };
        setArtReady(true);
      })
      .catch(() => {
        if (!cancelled) setArtError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    reset();
  }, [profileId, reset]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let spawn = 0;
    let firstDelay = true;
    let last = 0;

    const draw = (ts: number) => {
      const imgs = art.current;
      if (imgs.sky) {
        const sw = imgs.sky.width;
        const sh = imgs.sky.height;
        const scale = H / sh;
        const dw = sw * scale;
        const ox = -(skyX.current % dw);
        ctx.drawImage(imgs.sky, ox, 0, dw, H);
        ctx.drawImage(imgs.sky, ox + dw - 1, 0, dw, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      for (const p of pipes.current) {
        const topH = p.gapY - GAP / 2;
        const botY = p.gapY + GAP / 2;
        const botH = H - GROUND_H - botY;
        if (imgs.pipe) {
          drawTiledY(ctx, imgs.pipe, p.x, 0, PIPE_W, topH);
          drawTiledY(ctx, imgs.pipe, p.x, botY, PIPE_W, botH);
        } else {
          ctx.fillStyle = theme.accent;
          ctx.beginPath();
          ctx.roundRect(p.x, 0, PIPE_W, topH, 12);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(p.x, botY, PIPE_W, botH, 12);
          ctx.fill();
        }
        if (imgs.star && !p.scored) {
          const pulse = 18 + Math.sin(ts / 180) * 3;
          ctx.drawImage(
            imgs.star,
            p.x + PIPE_W / 2 - pulse,
            p.gapY - pulse,
            pulse * 2,
            pulse * 2,
          );
        }
      }

      if (imgs.ground) {
        const dw = (imgs.ground.width / imgs.ground.height) * GROUND_H;
        const ox = -(groundX.current % dw);
        ctx.drawImage(imgs.ground, ox, H - GROUND_H, dw, GROUND_H);
        ctx.drawImage(imgs.ground, ox + dw - 1, H - GROUND_H, dw, GROUND_H);
      } else {
        ctx.fillStyle = theme.surface2;
        ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
      }

      for (const b of bursts.current) {
        const a = Math.max(0, b.life);
        ctx.globalAlpha = a;
        if (imgs.star) {
          ctx.drawImage(imgs.star, b.x - 16, b.y - 16 - (1 - a) * 24, 32, 32);
        }
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.translate(BIRD_X, birdY.current);
      ctx.rotate(Math.min(0.42, Math.max(-0.5, vel.current / 10)));
      const bounce = 1 + flapPulse.current * 0.12;
      ctx.scale(bounce, 2 - bounce);
      if (imgs.flyer) {
        ctx.drawImage(imgs.flyer, -34, -28, 72, 56);
      } else {
        ctx.fillStyle = theme.accent;
        ctx.beginPath();
        ctx.ellipse(0, 0, 22, 17, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (!started.current && !overRef.current) {
        ctx.fillStyle = "rgba(20,10,30,0.45)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 128, H / 2 - 64, 256, 72, 20);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "800 26px Fredoka, system-ui";
        ctx.textAlign = "center";
        ctx.fillText("Tap to flutter!", W / 2, H / 2 - 22);
      }

      if (overRef.current) {
        ctx.fillStyle = "rgba(20,10,30,0.28)";
        ctx.fillRect(0, 0, W, H);
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(32, ts - last) : 16;
      last = ts;

      if (!paused && !overRef.current) {
        flapPulse.current = Math.max(0, flapPulse.current - dt / 220);
        if (started.current) {
          vel.current += GRAVITY;
          birdY.current += vel.current;

          if (birdY.current < 26) {
            birdY.current = 26;
            vel.current = Math.abs(vel.current) * 0.25;
          }

          groundX.current += PIPE_SPEED * 0.85;
          skyX.current += PIPE_SPEED * 0.18;

          if (firstDelay) {
            if (ts - spawn > FIRST_PIPE_MS) {
              firstDelay = false;
              spawn = ts;
            }
          } else if (ts - spawn > SPAWN_MS) {
            spawn = ts;
            pipes.current.push({
              x: W + 28,
              gapY: 150 + Math.random() * 160,
              scored: false,
            });
          }

          for (const p of pipes.current) {
            p.x -= PIPE_SPEED;
            const inX =
              BIRD_X + HIT_R > p.x && BIRD_X - HIT_R < p.x + PIPE_W;
            const hit =
              inX &&
              (birdY.current - HIT_R < p.gapY - GAP / 2 ||
                birdY.current + HIT_R > p.gapY + GAP / 2);
            if (hit || birdY.current > H - GROUND_H - 10) {
              overRef.current = true;
              setOver(true);
            }
            if (!p.scored && p.x + PIPE_W < BIRD_X - 4) {
              p.scored = true;
              setScore((s) => {
                const n = s + 1;
                onScoreChange?.(n);
                return n;
              });
              bursts.current.push({
                x: BIRD_X + 18,
                y: birdY.current,
                life: 1,
              });
              setPop("Yay! +1");
              window.setTimeout(() => setPop(null), 700);
            }
          }
          pipes.current = pipes.current.filter((p) => p.x > -90);
        }
        bursts.current = bursts.current
          .map((b) => ({ ...b, life: b.life - dt / 650, y: b.y - dt / 40 }))
          .filter((b) => b.life > 0);
      }
      draw(ts);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, profileId, theme, onScoreChange, artReady, artError]);

  let hint: string;
  switch (profileId) {
    case "keira":
      hint = "Tap the sky — flutter through candy towers";
      break;
    case "luke":
      hint = "Tap the sky — zip through dino canyons";
      break;
    default: {
      const _never: never = profileId;
      hint = _never;
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.flappy} · {score}
        </span>
        {pop ? (
          <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-black text-[var(--accent-fg)]">
            {pop}
          </span>
        ) : over ? (
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
      <button
        type="button"
        className="min-h-16 w-full max-w-md rounded-3xl bg-[var(--accent)] px-6 text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
      >
        {over ? "Play again" : "Flap!"}
      </button>
      {over ? (
        <p className="rounded-2xl bg-white/70 px-4 py-3 text-center text-base font-bold text-[var(--ink)]">
          Soft landing! Stars {score}. Tap to flutter again.
        </p>
      ) : (
        <p className="text-center text-sm font-medium text-[var(--ink)]/70">
          {hint}
        </p>
      )}
    </div>
  );
}
