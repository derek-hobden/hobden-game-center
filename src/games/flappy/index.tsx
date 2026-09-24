"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import type { ProfileId } from "@/lib/profiles";
import { PROFILES } from "@/lib/profiles";
import { CanvasStage, GameOverlay, prepareCanvas } from "@/components/game-kit";
import { getBest } from "@/lib/best-scores";
import { haptic, sfx } from "@/lib/sfx";
import {
  H,
  createState,
  flap,
  medalFor,
  nextMedal,
  step,
  type GameEvent,
  type State,
} from "./engine";
import { draw, type Art } from "./draw";

const MIN_W = 340;
const MAX_W = 1000;

function artFor(profileId: ProfileId) {
  switch (profileId) {
    case "keira":
      return {
        sky: "/games/flappy/keira-sky.jpg",
        ground: "/games/flappy/keira-ground.jpg",
        flyer: "/games/flappy/keira-flyer.png",
        star: "/games/flappy/star.png",
      };
    case "luke":
      return {
        sky: "/games/flappy/luke-sky.jpg",
        ground: "/games/flappy/luke-ground.jpg",
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

/** Width in game units that makes an H-tall canvas fill the stage box. */
function useStageWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(400);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const next = Math.round(
        Math.min(MAX_W, Math.max(MIN_W, (H * r.width) / r.height)) / 2,
      ) * 2;
      setW((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

type UiPhase = "loading" | "ready" | "play" | "over";

export default function FlappyGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = useStageWidth(rootRef);
  const stateRef = useRef<State | null>(null);
  const artRef = useRef<Art | null>(null);
  const pausedRef = useRef(paused);
  const onScoreRef = useRef(onScoreChange);
  const bestAtStart = useRef(0);
  const overLockUntil = useRef(0);
  const [ui, setUi] = useState<UiPhase>("loading");
  const [finalScore, setFinalScore] = useState(0);
  const [wasBest, setWasBest] = useState(false);
  const theme = PROFILES[profileId];

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    onScoreRef.current = onScoreChange;
  }, [onScoreChange]);

  const getState = useCallback(() => {
    if (!stateRef.current) stateRef.current = createState(W, profileId);
    return stateRef.current;
  }, [W, profileId]);

  // Keep the world width in sync with the stage.
  useEffect(() => {
    getState().W = W;
  }, [W, getState]);

  const reset = useCallback(() => {
    stateRef.current = createState(W, profileId);
    onScoreRef.current?.(0);
    setUi(artRef.current ? "ready" : "loading");
  }, [W, profileId]);

  // Load art for this profile.
  useEffect(() => {
    let cancelled = false;
    const urls = artFor(profileId);
    Promise.all([
      loadImage(urls.sky),
      loadImage(urls.ground),
      loadImage(urls.flyer),
      loadImage(urls.star),
    ])
      .then(([sky, ground, flyer, star]) => {
        if (cancelled) return;
        artRef.current = { sky, ground, flyer, star };
        setUi((u) => (u === "loading" ? "ready" : u));
      })
      .catch(() => {
        // Fall back to drawn shapes rather than getting stuck.
        if (!cancelled) setUi((u) => (u === "loading" ? "ready" : u));
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const start = useCallback(() => {
    const s = getState();
    if (s.phase !== "ready") return;
    bestAtStart.current = getBest(profileId, "flappy");
    flap(s);
    setUi("play");
  }, [getState, profileId]);

  const restart = useCallback(() => {
    if (performance.now() < overLockUntil.current) return;
    sfx("tap");
    reset();
  }, [reset]);

  const press = useCallback(() => {
    if (pausedRef.current) return;
    const s = getState();
    if (s.phase === "ready") {
      if (ui === "loading") return;
      start();
    } else if (s.phase === "play") {
      flap(s);
    }
  }, [getState, start, ui]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== "ArrowUp" && e.key !== "w") return;
      e.preventDefault();
      if (e.repeat) return;
      const s = getState();
      if (s.phase === "over") restart();
      else press();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, restart, getState]);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const font =
      getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    let raf = 0;
    let last = 0;

    const handle = (ev: GameEvent, s: State) => {
      switch (ev) {
        case "flap":
          sfx("flap", { pitch: 0.95 + Math.random() * 0.15 });
          break;
        case "star":
        case "bonus":
          sfx("coin", { pitch: 1 + Math.min(0.5, (s.score % 10) * 0.05) });
          onScoreRef.current?.(s.score);
          break;
        case "level":
          sfx("levelUp");
          break;
        case "bounce":
          sfx("bounce");
          break;
        case "hit":
          sfx("hit");
          haptic(40);
          break;
        case "die":
          sfx("boom");
          haptic(80);
          break;
        case "over":
          break;
        default: {
          const _never: never = ev;
          return _never;
        }
      }
    };

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(1 / 30, (ts - last) / 1000) : 1 / 60;
      last = ts;
      const s = stateRef.current ?? getState();
      if (process.env.NODE_ENV !== "production") {
        // Lets the automated gameplay recordings peek at the world.
        (window as unknown as { __flappy?: State }).__flappy = s;
      }
      if (!pausedRef.current) {
        step(s, dt);
        for (const ev of s.events) handle(ev, s);
        s.events.length = 0;
        if (s.phase === "over" && !s.overShown && s.deadT > 0.65) {
          s.overShown = true;
          const medal = medalFor(s.score);
          sfx(medal && medal.min >= 20 ? "win" : "lose");
          overLockUntil.current = performance.now() + 500;
          setFinalScore(s.score);
          setWasBest(s.score > bestAtStart.current && s.score > 0);
          setUi("over");
        }
      }
      prepareCanvas(ctx, s.W);
      draw(ctx, s, artRef.current, font, theme.ink);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getState, theme.ink]);

  const medal = medalFor(finalScore);
  const next = nextMedal(finalScore);
  const towers = profileId === "keira" ? "candy towers" : "rock towers";

  return (
    <div
      ref={rootRef}
      className="game-root select-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        press();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CanvasStage width={W} height={H} canvasRef={canvasRef}>
        <GameOverlay
          show={ui === "ready"}
          className="items-end bg-transparent pb-[12%] backdrop-blur-none"
          emoji={profileId === "keira" ? "🧚" : "🦖"}
          title="Tap to fly!"
          subtitle={`Tap anywhere to flap. Zoom between the ${towers} and grab the stars!`}
          actionLabel="Let's go!"
          onAction={start}
        />
        <GameOverlay
          show={ui === "over"}
          tone={medal ? "win" : "neutral"}
          emoji={medal ? medal.emoji : "🎈"}
          title={medal ? `${medal.name}!` : "Good flying!"}
          subtitle={
            <>
              <span className="text-3xl font-black text-[var(--ink)]">
                ⭐ {finalScore}
              </span>
              {wasBest ? (
                <span className="mt-1 block text-amber-600">New best!</span>
              ) : null}
              {next ? (
                <span className="mt-1 block text-sm">
                  {next.emoji} at {next.min} stars
                </span>
              ) : null}
            </>
          }
          actionLabel="Play again"
          onAction={restart}
        />
      </CanvasStage>
    </div>
  );
}
