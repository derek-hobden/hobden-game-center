"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";

type Mob = { x: number; y: number; hp: number };
type Gem = { x: number; y: number; life: number };
type Pop = { x: number; y: number; life: number; kind: "zap" | "plus" };

type ArtPack = {
  hero: string;
  foe: string;
  ground: string;
  gem: string;
  zap: string;
  aura: string;
  hint: string;
  caught: string;
  win: string;
};

const W = 360;
const H = 480;
const AURA = 86;
const TOUCH_HIT = 20;
const WIN_SCORE = 12;
const MOVE_SPEED = 3.2;
const PAD_STEP = 5.8;

function artFor(profileId: ProfileId): ArtPack {
  switch (profileId) {
    case "keira":
      return {
        hero: "/games/vampire-survivors/keira-hero.png",
        foe: "/games/vampire-survivors/keira-foe.png",
        ground: "/games/vampire-survivors/keira-ground.png",
        gem: "/games/vampire-survivors/keira-gem.png",
        zap: "/games/vampire-survivors/zap-burst.png",
        aura: "rgba(244,114,182,0.28)",
        hint: "Drag the fairy — her sparkle hug zaps the grumpy bats!",
        caught: "Oops, a hug too close! Try again.",
        win: "Rainbow win! The meadow is safe.",
      };
    case "luke":
      return {
        hero: "/games/vampire-survivors/luke-hero.png",
        foe: "/games/vampire-survivors/luke-foe.png",
        ground: "/games/vampire-survivors/luke-ground.png",
        gem: "/games/vampire-survivors/luke-gem.png",
        zap: "/games/vampire-survivors/zap-burst.png",
        aura: "rgba(14,165,233,0.3)",
        hint: "Drag the dino — his glow zaps the slime bots!",
        caught: "Bumped! Hop back in.",
        win: "Mission clear! Night arena is safe.",
      };
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

export default function VampireSurvivorsGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const px = useRef(W / 2);
  const py = useRef(H / 2);
  const mobs = useRef<Mob[]>([]);
  const gems = useRef<Gem[]>([]);
  const pops = useRef<Pop[]>([]);
  const t = useRef(0);
  const dragging = useRef(false);
  const padDir = useRef({ x: 0, y: 0 });
  const images = useRef<Record<string, HTMLImageElement>>({});
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [alive, setAlive] = useState(true);
  const [won, setWon] = useState(false);
  const [yay, setYay] = useState(false);
  const theme = PROFILES[profileId];
  const art = useMemo(() => artFor(profileId), [profileId]);
  const onScoreChangeRef = useRef(onScoreChange);
  onScoreChangeRef.current = onScoreChange;

  const reset = useCallback(() => {
    px.current = W / 2;
    py.current = H / 2;
    mobs.current = [];
    gems.current = [];
    pops.current = [];
    t.current = 0;
    padDir.current = { x: 0, y: 0 };
    dragging.current = false;
    scoreRef.current = 0;
    setScore(0);
    onScoreChangeRef.current?.(0);
    setAlive(true);
    setWon(false);
    setYay(false);
  }, []);

  useEffect(() => {
    reset();
  }, [profileId, reset]);

  useEffect(() => {
    images.current = {
      hero: loadImage(art.hero),
      foe: loadImage(art.foe),
      ground: loadImage(art.ground),
      gem: loadImage(art.gem),
      zap: loadImage(art.zap),
    };
  }, [art]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = 0;

    const clampHero = () => {
      px.current = Math.max(28, Math.min(W - 28, px.current));
      py.current = Math.max(36, Math.min(H - 28, py.current));
    };

    const drawSprite = (
      img: HTMLImageElement | undefined,
      x: number,
      y: number,
      size: number,
      clip: "circle" | "none" = "circle",
    ) => {
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        if (clip === "circle") {
          ctx.beginPath();
          ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          ctx.clip();
        }
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
        ctx.restore();
        return;
      }
      ctx.fillStyle = art.aura;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      const ground = images.current.ground;
      if (ground && ground.complete && ground.naturalWidth > 0) {
        ctx.drawImage(ground, 0, 0, W, H);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, theme.skyFrom);
        g.addColorStop(1, theme.skyTo);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.beginPath();
      ctx.fillStyle = art.aura;
      ctx.arc(px.current, py.current, AURA, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 3;
      ctx.arc(px.current, py.current, AURA, 0, Math.PI * 2);
      ctx.stroke();

      for (const gem of gems.current) {
        drawSprite(images.current.gem, gem.x, gem.y, 28);
      }
      for (const m of mobs.current) {
        drawSprite(images.current.foe, m.x, m.y, 52);
      }
      drawSprite(images.current.hero, px.current, py.current, 72);

      for (const p of pops.current) {
        if (p.kind === "zap") {
          ctx.globalAlpha = Math.min(1, p.life / 18);
                  drawSprite(images.current.zap, p.x, p.y, 64, "none");
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = Math.min(1, p.life / 24);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 22px system-ui";
          ctx.textAlign = "center";
          ctx.fillText("Yay! +1", p.x, p.y);
          ctx.globalAlpha = 1;
        }
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      if (paused || !alive || won) {
        draw();
        return;
      }
      if (ts - last > 33) {
        last = ts;
        t.current += 1;

        if (padDir.current.x || padDir.current.y) {
          px.current += padDir.current.x * PAD_STEP;
          py.current += padDir.current.y * PAD_STEP;
          clampHero();
        }

        const spawnEvery = t.current < 90 ? 70 : 55;
        if (t.current % spawnEvery === 0 && mobs.current.length < 5) {
          const ang = Math.random() * Math.PI * 2;
          mobs.current.push({
            x: W / 2 + Math.cos(ang) * 230,
            y: H / 2 + Math.sin(ang) * 230,
            hp: 1,
          });
        }

          const speed = 0.48 + Math.min(0.28, scoreRef.current * 0.02);
        for (const m of mobs.current) {
          const dx = px.current - m.x;
          const dy = py.current - m.y;
          const d = Math.hypot(dx, dy) || 1;
          m.x += (dx / d) * speed;
          m.y += (dy / d) * speed;
          if (d < AURA) {
            m.hp = 0;
            gems.current.push({ x: m.x, y: m.y, life: 90 });
            pops.current.push({ x: m.x, y: m.y, life: 18, kind: "zap" });
            pops.current.push({
              x: m.x,
              y: m.y - 18,
              life: 24,
              kind: "plus",
            });
            setYay(true);
            window.setTimeout(() => setYay(false), 500);
            scoreRef.current += 1;
            const n = scoreRef.current;
            setScore(n);
            onScoreChangeRef.current?.(n);
            if (n >= WIN_SCORE) setWon(true);
          }
          const grace = t.current < 50;
          if (!grace && d < TOUCH_HIT) setAlive(false);
        }
        mobs.current = mobs.current.filter((m) => m.hp > 0);

        for (const gem of gems.current) {
          const dx = px.current - gem.x;
          const dy = py.current - gem.y;
          const d = Math.hypot(dx, dy) || 1;
          gem.x += (dx / d) * 2.4;
          gem.y += (dy / d) * 2.4;
          gem.life -= 1;
        }
        gems.current = gems.current.filter((g) => g.life > 0);
        pops.current = pops.current
          .map((p) => ({ ...p, life: p.life - 1 }))
          .filter((p) => p.life > 0);
      }
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused, alive, won, theme, art]);

  const pointerToWorld = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const follow = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!alive || paused || won) return;
    const p = pointerToWorld(e);
    const dx = p.x - px.current;
    const dy = p.y - py.current;
    const d = Math.hypot(dx, dy) || 1;
    const step = Math.min(MOVE_SPEED * 4, d);
    px.current += (dx / d) * step;
    py.current += (dy / d) * step;
    px.current = Math.max(28, Math.min(W - 28, px.current));
    py.current = Math.max(36, Math.min(H - 28, py.current));
  };

  const ended = !alive || won;

  const nudge = (dx: number, dy: number) => {
    if (!alive || paused || won) return;
    px.current = Math.max(28, Math.min(W - 28, px.current + dx));
    py.current = Math.max(36, Math.min(H - 28, py.current + dy));
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames["vampire-survivors"]} · {score}/{WIN_SCORE}
        </span>
        {ended ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Play again
          </button>
        ) : null}
      </div>
      {yay ? (
        <p className="text-base font-black text-[var(--accent)]">Yay! Zapped!</p>
      ) : (
        <p className="text-base font-bold text-[var(--ink)]/60">
          Glow hug radius is big — stay in the sparkle.
        </p>
      )}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="max-w-full touch-none rounded-3xl border-4 border-white/70 shadow-lg"
        style={{ width: "min(100%, 360px)", touchAction: "none" }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          follow(e);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          follow(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      />
      <div className="grid grid-cols-3 gap-3">
        <div />
        <Pad
          label="↑"
          onHold={(on) => {
            padDir.current.y = on ? -1 : 0;
          }}
          onTap={() => nudge(0, -28)}
        />
        <div />
        <Pad
          label="←"
          onHold={(on) => {
            padDir.current.x = on ? -1 : 0;
          }}
          onTap={() => nudge(-28, 0)}
        />
        <Pad
          label="↓"
          onHold={(on) => {
            padDir.current.y = on ? 1 : 0;
          }}
          onTap={() => nudge(0, 28)}
        />
        <Pad
          label="→"
          onHold={(on) => {
            padDir.current.x = on ? 1 : 0;
          }}
          onTap={() => nudge(28, 0)}
        />
      </div>
      <p className="text-center text-sm font-medium text-[var(--ink)]/70">
        {art.hint}
      </p>
      {won ? (
        <p className="text-center text-lg font-black text-emerald-700">
          {art.win}
        </p>
      ) : null}
      {!alive ? (
        <p className="text-center font-bold text-rose-700">
          {art.caught} Score {score}.
        </p>
      ) : null}
    </div>
  );
}

function Pad({
  label,
  onHold,
  onTap,
}: {
  label: string;
  onHold: (down: boolean) => void;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--surface)] text-3xl font-black shadow-md active:scale-95"
      onPointerDown={(e) => {
        e.preventDefault();
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerLeave={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onClick={onTap}
    >
      {label}
    </button>
  );
}
