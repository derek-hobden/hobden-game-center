"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { loadImage, packFor, type ExcitebikePack } from "./art";

const W = 360;
const H = 260;
const GROUND = 198;
const RIDER_X = 72;
const WIN_SCORE = 10;
const START_LIVES = 3;

type Hill = { x: number; h: number; hopped: boolean };
type Pickup = { x: number; y: number; taken: boolean };
type Puddle = { x: number; hit: boolean };
type EndKind = "win" | "lose" | null;

type ArtKit = {
  rider: CanvasImageSource;
  pickup: CanvasImageSource;
  hill: CanvasImageSource;
  sky: HTMLImageElement;
  card: HTMLImageElement;
};

function groundAt(hills: Hill[], gx: number) {
  let base = GROUND;
  for (const hill of hills) {
    const d = Math.abs(gx - hill.x);
    const span = 48 + hill.h * 0.35;
    if (d < span) {
      const lift = hill.h * (1 - d / span);
      base = Math.min(base, GROUND - lift);
    }
  }
  return base;
}

function seedCourse(): { hills: Hill[]; pickups: Pickup[]; puddles: Puddle[] } {
  const hills: Hill[] = Array.from({ length: 8 }, (_, i) => ({
    x: 180 + i * 150,
    h: 28 + (i % 3) * 10 + (i % 2) * 6,
    hopped: false,
  }));
  const pickups: Pickup[] = hills.map((hill) => ({
    x: hill.x,
    y: GROUND - hill.h - 62,
    taken: false,
  }));
  const puddles: Puddle[] = [
    { x: 320, hit: false },
    { x: 620, hit: false },
    { x: 980, hit: false },
  ];
  return { hills, pickups, puddles };
}

export default function ExcitebikeGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const y = useRef(GROUND);
  const vy = useRef(0);
  const speed = useRef(1.7);
  const holdingGas = useRef(false);
  const coyote = useRef(8);
  const invuln = useRef(0);
  const popTimer = useRef(0);
  const popText = useRef<string | null>(null);
  const hills = useRef<Hill[]>([]);
  const pickups = useRef<Pickup[]>([]);
  const puddles = useRef<Puddle[]>([]);
  const artRef = useRef<ArtKit | null>(null);
  const scoreRef = useRef(0);
  const livesRef = useRef(START_LIVES);
  const endRef = useRef<EndKind>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [end, setEnd] = useState<EndKind>(null);
  const [artReady, setArtReady] = useState(false);
  const [artError, setArtError] = useState<string | null>(null);
  const theme = PROFILES[profileId];
  const pack = packFor(profileId);

  const flash = (text: string) => {
    popText.current = text;
    popTimer.current = 55;
  };

  const bumpScore = useCallback(
    (delta: number) => {
      const n = scoreRef.current + delta;
      scoreRef.current = n;
      setScore(n);
      onScoreChange?.(n);
      if (n >= WIN_SCORE && endRef.current === null) {
        endRef.current = "win";
        setEnd("win");
      }
    },
    [onScoreChange],
  );

  const loseLife = useCallback((reason: string) => {
    if (invuln.current > 0 || endRef.current) return;
    invuln.current = 50;
    livesRef.current = Math.max(0, livesRef.current - 1);
    setLives(livesRef.current);
    flash(reason);
    if (livesRef.current <= 0) {
      endRef.current = "lose";
      setEnd("lose");
    }
  }, []);

  const reset = useCallback(() => {
    y.current = GROUND;
    vy.current = 0;
    speed.current = 1.7;
    holdingGas.current = false;
    coyote.current = 8;
    invuln.current = 0;
    popTimer.current = 0;
    popText.current = null;
    const course = seedCourse();
    hills.current = course.hills;
    pickups.current = course.pickups;
    puddles.current = course.puddles;
    scoreRef.current = 0;
    livesRef.current = START_LIVES;
    endRef.current = null;
    setScore(0);
    onScoreChange?.(0);
    setLives(START_LIVES);
    setEnd(null);
  }, [onScoreChange]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- profile is the source of truth for a fresh race
    reset();
  }, [profileId, reset]);

  useEffect(() => {
    let cancelled = false;

    async function loadPack(next: ExcitebikePack) {
      try {
        const [riderImg, pickupImg, hillImg, sky, card] = await Promise.all([
          loadImage(next.rider),
          loadImage(next.pickup),
          loadImage(next.hill),
          loadImage(next.sky),
          loadImage(next.card),
        ]);
        if (cancelled) return;
        artRef.current = {
          rider: riderImg,
          pickup: pickupImg,
          hill: hillImg,
          sky,
          card,
        };
        setArtError(null);
        setArtReady(true);
      } catch {
        if (!cancelled) {
          setArtReady(false);
          setArtError("Pictures are still rolling in.");
        }
      }
    }

    void loadPack(pack);
    return () => {
      cancelled = true;
    };
  }, [pack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const art = artRef.current;
      if (art) {
        ctx.drawImage(art.sky, 0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.fillStyle = pack.grass;
      ctx.fillRect(0, GROUND, W, H - GROUND);

      const artKit = artRef.current;
      for (const hill of hills.current) {
        const span = 48 + hill.h * 0.35;
          if (artKit) {
          const hw = span * 2.2;
          const hh = hill.h + 36;
          ctx.drawImage(artKit.hill, hill.x - hw / 2, GROUND - hh + 8, hw, hh);
        }
      }

      ctx.strokeStyle = pack.track;
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < W; i += 6) {
        const gy = groundAt(hills.current, i);
        if (i === 0) ctx.moveTo(i, gy);
        else ctx.lineTo(i, gy);
      }
      ctx.stroke();

      for (const puddle of puddles.current) {
        if (puddle.hit) continue;
        ctx.fillStyle = pack.dirt;
        ctx.beginPath();
        ctx.ellipse(puddle.x, GROUND + 8, 28, 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (artKit) {
        for (const p of pickups.current) {
          if (p.taken) continue;
          ctx.drawImage(artKit.pickup, p.x - 18, p.y - 18, 36, 36);
        }
        const bob = Math.sin(performance.now() / 90) * (speed.current * 0.6);
        const tilt = Math.min(0.25, Math.max(-0.2, -vy.current * 0.03));
        ctx.save();
        ctx.translate(RIDER_X, y.current + bob);
        ctx.rotate(tilt);
        if (invuln.current > 0 && Math.floor(invuln.current / 4) % 2 === 0) {
          ctx.globalAlpha = 0.45;
        }
        ctx.drawImage(artKit.rider, -52, -70, 96, 72);
        ctx.restore();
      }

      if (popText.current && popTimer.current > 0) {
        ctx.font = "bold 22px system-ui";
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 4;
        ctx.strokeText(popText.current, 200, 48);
        ctx.fillText(popText.current, 200, 48);
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused || endRef.current) {
        draw();
        return;
      }

      const target = holdingGas.current ? 3.15 : 1.55;
      speed.current += (target - speed.current) * 0.08;

      for (const hill of hills.current) hill.x -= speed.current;
      for (const p of pickups.current) p.x -= speed.current;
      for (const puddle of puddles.current) puddle.x -= speed.current;

      if (hills.current[0] && hills.current[0].x < -80) {
        hills.current.shift();
        const last = hills.current[hills.current.length - 1];
        const next: Hill = {
          x: last.x + 140 + Math.random() * 40,
          h: 26 + Math.random() * 28,
          hopped: false,
        };
        hills.current.push(next);
        pickups.current.push({
          x: next.x,
          y: GROUND - next.h - 62,
          taken: false,
        });
        if (Math.random() > 0.45) {
          puddles.current.push({ x: next.x + 70, hit: false });
        }
      }
      pickups.current = pickups.current.filter((p) => p.x > -40 || !p.taken);
      puddles.current = puddles.current.filter((p) => p.x > -50);

      const ground = groundAt(hills.current, RIDER_X + 8);
      vy.current += 0.42;
      y.current += vy.current;
      if (y.current >= ground) {
        y.current = ground;
        vy.current = 0;
        coyote.current = 10;
      } else if (coyote.current > 0) {
        coyote.current -= 1;
      }

      if (invuln.current > 0) invuln.current -= 1;
      if (popTimer.current > 0) {
        popTimer.current -= 1;
        if (popTimer.current <= 0) {
          popText.current = null;
        }
      }

      for (const hill of hills.current) {
        if (!hill.hopped && hill.x < RIDER_X - 10) {
          hill.hopped = true;
          const airborne = y.current < ground - 12;
          if (airborne) bumpScore(1);
        }
      }

      for (const p of pickups.current) {
        if (p.taken) continue;
        if (Math.abs(p.x - RIDER_X) < 30 && Math.abs(p.y - (y.current - 48)) < 32) {
          p.taken = true;
          bumpScore(2);
          flash(pack.pickupLabel);
        }
      }

      for (const puddle of puddles.current) {
        if (puddle.hit || invuln.current > 0) continue;
        const grounded = y.current >= ground - 3;
        if (grounded && Math.abs(puddle.x - RIDER_X) < 26) {
          puddle.hit = true;
          speed.current = 1.2;
          loseLife("Mud!");
        }
      }

      draw();
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, theme, pack, bumpScore, loseLife]);

  const jump = () => {
    if (paused || endRef.current) return;
    if (coyote.current > 0) {
      vy.current = -8.4;
      coyote.current = 0;
    }
  };

  const gasDown = () => {
    if (paused || endRef.current) return;
    holdingGas.current = true;
  };

  const gasUp = () => {
    holdingGas.current = false;
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.excitebike} · {score}
        </span>
        <span aria-label={`${lives} lives`} className="text-base">
          {"♥".repeat(lives)}
          {"♡".repeat(Math.max(0, START_LIVES - lives))}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
        style={{ width: "min(100%, 360px)" }}
        onPointerDown={jump}
      />
      {artError ? (
        <p className="text-sm font-semibold text-rose-700">{artError}</p>
      ) : null}
      {!artReady && !artError ? (
        <p className="text-sm font-semibold text-[var(--ink)]/70">Painting the track…</p>
      ) : null}
      {end === "win" ? (
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pack.card}
            alt=""
            className="h-28 w-28 rounded-2xl border-4 border-white object-cover shadow-md"
          />
          <p className="text-center text-xl font-black text-[var(--ink)]">
            {pack.winCopy}
          </p>
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-5 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Race again
          </button>
        </div>
      ) : null}
      {end === "lose" ? (
        <div className="flex w-full max-w-md flex-col items-center gap-2">
          <p className="text-center font-bold text-rose-700">{pack.oopsCopy}</p>
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-5 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Race again
          </button>
        </div>
      ) : null}
      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        <button
          type="button"
          className="min-h-16 rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md active:scale-95"
          onPointerDown={gasDown}
          onPointerUp={gasUp}
          onPointerCancel={gasUp}
          onPointerLeave={gasUp}
        >
          Hold gas
        </button>
        <button
          type="button"
          className="min-h-16 rounded-3xl bg-white/80 text-xl font-black text-[var(--ink)] shadow-md active:scale-95"
          onPointerDown={jump}
        >
          Jump!
        </button>
      </div>
      {end ? null : (
        <p className="text-sm text-[var(--ink)]/70">
          Hold gas to zoom · tap Jump over bumps and mud
        </p>
      )}
    </div>
  );
}
