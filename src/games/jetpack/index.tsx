"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";

type Kind = "coin" | "rock";

type Obs = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: Kind;
  taken: boolean;
};

type Pop = { x: number; y: number; life: number; text: string };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

type ArtPack = {
  hero: string;
  hazard: string;
  coin: string;
  bg: string;
};

type LoadedArt = {
  hero: HTMLImageElement;
  hazard: HTMLImageElement;
  coin: HTMLImageElement;
  bg: HTMLImageElement;
};

const W = 360;
const H = 480;
const PLAYER_X = 78;
const GRAVITY = 0.2;
const BOOST = -0.42;
const MAX_V = 4.4;
const BASE_SPEED = 2.15;
const MAX_SPEED = 3.35;
const FIRST_SPAWN_MS = 1700;
const SPAWN_MS = 1050;
const GRACE_FRAMES = 70;
const CEIL = 44;
const FLOOR = H - 44;

function artFor(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        hero: "/games/jetpack/keira-hero.png?v=2",
        hazard: "/games/jetpack/keira-hazard.png?v=2",
        coin: "/games/jetpack/keira-coin.png?v=2",
        bg: "/games/jetpack/keira-bg.jpg?v=2",
      };
    case "luke":
      return {
        hero: "/games/jetpack/luke-hero.png?v=2",
        hazard: "/games/jetpack/luke-hazard.png?v=2",
        coin: "/games/jetpack/luke-coin.png?v=2",
        bg: "/games/jetpack/luke-bg.jpg?v=2",
      };
    default: {
      const _exhaustive: never = profileId;
      throw new Error(`Unhandled profile: ${_exhaustive}`);
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function hit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

function spriteFor(kind: Kind, art: LoadedArt): HTMLImageElement {
  switch (kind) {
    case "coin":
      return art.coin;
    case "rock":
      return art.hazard;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled kind: ${_exhaustive}`);
    }
  }
}

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
  const pops = useRef<Pop[]>([]);
  const sparks = useRef<Spark[]>([]);
  const bgX = useRef(0);
  const grace = useRef(GRACE_FRAMES);
  const shake = useRef(0);
  const pausedRef = useRef(paused);
  const overRef = useRef(false);
  const artRef = useRef<LoadedArt | null>(null);
  const scoreRef = useRef(0);
  const onScoreRef = useRef(onScoreChange);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const [artError, setArtError] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";

  const bumpScore = useCallback((n: number) => {
    scoreRef.current = n;
    setScore(n);
    onScoreRef.current?.(n);
  }, []);

  const reset = useCallback(() => {
    y.current = H / 2;
    vy.current = 0;
    holding.current = false;
    dist.current = 0;
    obs.current = [];
    pops.current = [];
    sparks.current = [];
    bgX.current = 0;
    grace.current = GRACE_FRAMES;
    shake.current = 0;
    scoreRef.current = 0;
    bumpScore(0);
    setOver(false);
    overRef.current = false;
  }, [bumpScore]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    overRef.current = over;
  }, [over]);

  useEffect(() => {
    onScoreRef.current = onScoreChange;
  }, [onScoreChange]);

  useEffect(() => {
    let cancelled = false;
    const pack = artFor(profileId);
    Promise.all([
      loadImage(pack.hero),
      loadImage(pack.hazard),
      loadImage(pack.coin),
      loadImage(pack.bg),
    ])
      .then(([hero, hazard, coin, bg]) => {
        if (cancelled) return;
        artRef.current = { hero, hazard, coin, bg };
        y.current = H / 2;
        vy.current = 0;
        holding.current = false;
        dist.current = 0;
        obs.current = [];
        pops.current = [];
        sparks.current = [];
        bgX.current = 0;
        grace.current = GRACE_FRAMES;
        shake.current = 0;
        scoreRef.current = 0;
        bumpScore(0);
        setOver(false);
        overRef.current = false;
        setArtError(false);
        setArtReady(true);
      })
      .catch(() => {
        if (!cancelled) setArtError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, bumpScore]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (overRef.current) return;
      holding.current = e.type === "keydown";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let spawnAt = 0;
    let lastTs = 0;

    const draw = () => {
      const art = artRef.current;
      const sx = (Math.random() - 0.5) * shake.current;
      const sy = (Math.random() - 0.5) * shake.current;
      ctx.save();
      ctx.translate(sx, sy);

      if (art) {
        const tileW = (art.bg.width / art.bg.height) * H;
        let x = -((bgX.current % tileW) + tileW) % tileW;
        while (x < W) {
          ctx.drawImage(art.bg, x, 0, tileW, H);
          x += tileW;
        }
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      const rim = ctx.createLinearGradient(0, 0, 0, H);
      rim.addColorStop(0, isKeira ? "rgba(244,114,182,0.35)" : "rgba(15,23,42,0.4)");
      rim.addColorStop(0.08, "rgba(0,0,0,0)");
      rim.addColorStop(0.92, "rgba(0,0,0,0)");
      rim.addColorStop(1, isKeira ? "rgba(251,113,133,0.4)" : "rgba(15,23,42,0.45)");
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, W, H);

      for (const s of sparks.current) {
        ctx.globalAlpha = Math.max(0, s.life / 18);
        ctx.fillStyle = isKeira ? "#f9a8d4" : "#fbbf24";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (art) {
        for (const o of obs.current) {
          if (o.taken) continue;
          const img = spriteFor(o.kind, art);
          const bob = o.kind === "coin" ? Math.sin(dist.current / 8 + o.y) * 3 : 0;
          ctx.drawImage(img, o.x - o.w / 2, o.y - o.h / 2 + bob, o.w, o.h);
        }
        const tilt = holding.current && !overRef.current ? -0.18 : 0.12;
        const flash = grace.current > 0 && Math.floor(grace.current / 6) % 2 === 0;
        ctx.save();
        ctx.translate(PLAYER_X, y.current);
        ctx.rotate(tilt);
        if (flash) ctx.globalAlpha = 0.55;
        ctx.drawImage(art.hero, -52, -52, 104, 104);
        ctx.restore();
      }

      for (const p of pops.current) {
        ctx.globalAlpha = Math.max(0, p.life / 40);
        ctx.fillStyle = "#3b1d4a";
        ctx.font = "bold 18px system-ui";
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      }

      if (grace.current > 40 && !overRef.current) {
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.font = "bold 16px system-ui";
        ctx.fillText("Get ready…", 128, 56);
      }

      ctx.restore();
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (!lastTs) lastTs = ts;
      lastTs = ts;

      if (pausedRef.current) {
        draw();
        return;
      }

      if (!overRef.current) {
        if (grace.current > 0) grace.current -= 1;
        vy.current += holding.current ? BOOST : GRAVITY;
        vy.current = Math.max(-MAX_V, Math.min(MAX_V, vy.current));
        y.current += vy.current;
        if (y.current < CEIL) {
          y.current = CEIL;
          vy.current = Math.abs(vy.current) * 0.35;
        }
        if (y.current > FLOOR) {
          y.current = FLOOR;
          vy.current = -Math.abs(vy.current) * 0.35;
        }

        dist.current += 1;
        const speed = Math.min(
          MAX_SPEED,
          BASE_SPEED + dist.current / 2800,
        );
        bgX.current += speed * 0.7;

        if (spawnAt === 0) spawnAt = ts + FIRST_SPAWN_MS;
        if (ts >= spawnAt) {
          spawnAt = ts + SPAWN_MS;
          const coin = Math.random() < 0.62;
          const kind: Kind = coin ? "coin" : "rock";
          const size = kind === "coin" ? 46 : 58;
          const lane = CEIL + 20 + Math.random() * (FLOOR - CEIL - 40);
          obs.current.push({
            x: W + 36,
            y: lane,
            w: size,
            h: size,
            kind,
            taken: false,
          });
        }

        for (const o of obs.current) o.x -= speed;

        const pr = 16;
        for (const o of obs.current) {
          if (o.taken) continue;
          if (!hit(PLAYER_X, y.current, pr, o.x, o.y, 20)) continue;
          if (o.kind === "coin") {
            o.taken = true;
            const n = scoreRef.current + 5;
            bumpScore(n);
            pops.current.push({
              x: o.x - 8,
              y: o.y,
              life: 40,
              text: "Yay! +5",
            });
          } else if (grace.current <= 0) {
            setOver(true);
            overRef.current = true;
            shake.current = 8;
            holding.current = false;
          }
        }

        obs.current = obs.current.filter((o) => o.x > -70 && !o.taken);

        if (holding.current) {
          sparks.current.push({
            x: PLAYER_X - 34,
            y: y.current + 10,
            vx: -2.2 - Math.random(),
            vy: (Math.random() - 0.5) * 1.6,
            life: 16,
          });
        }

        if (dist.current % 55 === 0) {
          bumpScore(scoreRef.current + 1);
        }
      }

      for (const p of pops.current) {
        p.y -= 0.7;
        p.life -= 1;
      }
      pops.current = pops.current.filter((p) => p.life > 0);
      for (const s of sparks.current) {
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 1;
      }
      sparks.current = sparks.current.filter((s) => s.life > 0);
      if (shake.current > 0) shake.current *= 0.86;

      draw();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bumpScore, isKeira, theme.skyFrom, theme.skyTo, artReady]);

  function setBoost(on: boolean) {
    if (overRef.current) return;
    holding.current = on;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
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
      {artError ? (
        <p className="text-sm font-bold text-rose-700">
          Pictures didn’t load. Try again in a moment.
        </p>
      ) : null}
      <div
        className="flex w-full max-w-md flex-col items-center gap-3"
        onPointerDown={() => setBoost(true)}
        onPointerUp={() => setBoost(false)}
        onPointerCancel={() => setBoost(false)}
        onPointerLeave={() => setBoost(false)}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
          style={{ width: "min(100%, 360px)" }}
        />
        <button
          type="button"
          className="min-h-16 w-full rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
        >
          Hold to boost ↑
        </button>
      </div>
      {over ? (
        <p className="text-center font-bold text-rose-700">
          {isKeira ? "Ouch, coral bump!" : "Ouch, rock bump!"} Score {score}.
        </p>
      ) : (
        <p className="text-center text-sm text-[var(--ink)]/70">
          Hold anywhere to fly up · walls bounce · grab{" "}
          {isKeira ? "stars" : "coins"}
        </p>
      )}
    </div>
  );
}
