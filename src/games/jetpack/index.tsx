"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";
import { CanvasStage, GameOverlay, prepareCanvas } from "@/components/game-kit";
import { getBest } from "@/lib/best-scores";
import { haptic, sfx } from "@/lib/sfx";
import {
  H,
  begin,
  createState,
  meters,
  setHolding,
  step,
  type GameEvent,
  type State,
} from "./engine";
import { draw, type Art } from "./draw";

const MIN_W = 300;
const MAX_W = 1100;

function artFor(profileId: ProfileId) {
  switch (profileId) {
    case "keira":
      return {
        hero: "/games/jetpack/keira-hero.png",
        hazard: "/games/jetpack/keira-hazard.png",
        coin: "/games/jetpack/keira-coin.png",
        bg: "/games/jetpack/keira-bg.jpg",
      };
    case "luke":
      return {
        hero: "/games/jetpack/luke-hero.png",
        hazard: "/games/jetpack/luke-hazard.png",
        coin: "/games/jetpack/luke-coin.png",
        bg: "/games/jetpack/luke-bg.jpg",
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

function useStageWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(420);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const next =
        Math.round(Math.min(MAX_W, Math.max(MIN_W, (H * r.width) / r.height)) / 2) * 2;
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

export default function JetpackGame({
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
  const pointers = useRef(new Set<number>());
  const keyDown = useRef(false);
  const bestAtStart = useRef(0);
  const overLockUntil = useRef(0);
  const [ui, setUi] = useState<UiPhase>("loading");
  const [result, setResult] = useState({ score: 0, meters: 0, coins: 0, best: false });
  const theme = PROFILES[profileId];

  const getState = useCallback(() => {
    if (!stateRef.current) stateRef.current = createState(W, profileId);
    return stateRef.current;
  }, [W, profileId]);

  const syncHold = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    setHolding(s, !pausedRef.current && (pointers.current.size > 0 || keyDown.current));
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      pointers.current.clear();
      keyDown.current = false;
    }
    syncHold();
  }, [paused, syncHold]);
  useEffect(() => {
    onScoreRef.current = onScoreChange;
  }, [onScoreChange]);
  useEffect(() => {
    getState().W = W;
  }, [W, getState]);

  useEffect(() => {
    let cancelled = false;
    const u = artFor(profileId);
    Promise.all([loadImage(u.hero), loadImage(u.hazard), loadImage(u.coin), loadImage(u.bg)])
      .then(([hero, hazard, coin, bg]) => {
        if (cancelled) return;
        artRef.current = { hero, hazard, coin, bg };
        setUi((x) => (x === "loading" ? "ready" : x));
      })
      .catch(() => {
        if (!cancelled) setUi((x) => (x === "loading" ? "ready" : x));
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const start = useCallback(() => {
    const s = getState();
    if (s.phase !== "ready" || ui === "loading") return;
    bestAtStart.current = getBest(profileId, "jetpack");
    begin(s);
    sfx("zap", { pitch: 1.4 });
    setUi("play");
    syncHold();
  }, [getState, profileId, ui, syncHold]);

  const restart = useCallback(() => {
    if (performance.now() < overLockUntil.current) return;
    sfx("tap");
    stateRef.current = createState(W, profileId);
    onScoreRef.current?.(0);
    pointers.current.clear();
    keyDown.current = false;
    setUi("ready");
  }, [W, profileId]);

  useEffect(() => {
    const isKey = (e: KeyboardEvent) =>
      e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || e.key === "W";
    const down = (e: KeyboardEvent) => {
      if (!isKey(e)) return;
      e.preventDefault();
      if (e.repeat) return;
      const s = getState();
      if (s.phase === "over") {
        restart();
        return;
      }
      keyDown.current = true;
      if (s.phase === "ready") start();
      syncHold();
    };
    const up = (e: KeyboardEvent) => {
      if (!isKey(e)) return;
      keyDown.current = false;
      syncHold();
    };
    const releaseAll = () => {
      pointers.current.clear();
      keyDown.current = false;
      syncHold();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
    };
  }, [getState, restart, start, syncHold]);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    let raf = 0;
    let last = 0;
    let coinSfxAt = 0;

    const handle = (ev: GameEvent, s: State, ts: number) => {
      switch (ev) {
        case "coin":
          // Rising pitch while a coin streak continues; throttled so trails
          // of coins don't turn into noise.
          if (ts - coinSfxAt > 45) {
            coinSfxAt = ts;
            sfx("coin", { pitch: 1 + Math.min(0.8, s.combo * 0.04) });
          }
          onScoreRef.current?.(s.score);
          break;
        case "milestone":
          sfx("levelUp");
          onScoreRef.current?.(s.score);
          break;
        case "shield":
        case "heart":
          sfx("star");
          break;
        case "shieldPop":
          sfx("pop");
          haptic(30);
          break;
        case "hit":
          sfx("hit");
          haptic(50);
          break;
        case "die":
          sfx("boom");
          haptic(90);
          break;
        case "warn":
          sfx("tap", { pitch: 1.8 });
          break;
        case "launch":
          sfx("zap", { pitch: 0.8 });
          break;
        case "land":
          sfx("drop");
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
        (window as unknown as { __jetpack?: State }).__jetpack = s;
      }
      if (!pausedRef.current) {
        step(s, dt);
        for (const ev of s.events) handle(ev, s, ts);
        s.events.length = 0;
        if (s.phase === "over" && !s.overShown && s.deadT > 0.9) {
          s.overShown = true;
          sfx("lose");
          overLockUntil.current = performance.now() + 500;
          setResult({
            score: s.score,
            meters: meters(s),
            coins: s.coinCount,
            best: s.score > bestAtStart.current && s.score > 0,
          });
          setUi("over");
        }
      }
      prepareCanvas(ctx, s.W);
      draw(ctx, s, artRef.current, font, theme.ink);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getState, theme.ink]);

  const isKeira = profileId === "keira";

  return (
    <div
      ref={rootRef}
      className="game-root touch-none select-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Capture is a nicety; holding still works without it.
        }
        const s = getState();
        if (s.phase === "over" || pausedRef.current) return;
        pointers.current.add(e.pointerId);
        if (s.phase === "ready") start();
        syncHold();
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        syncHold();
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        syncHold();
      }}
      onLostPointerCapture={(e) => {
        pointers.current.delete(e.pointerId);
        syncHold();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CanvasStage width={W} height={H} canvasRef={canvasRef}>
        <GameOverlay
          show={ui === "ready"}
          className="items-end bg-transparent pb-[10%] backdrop-blur-none"
          emoji={isKeira ? "🧜‍♀️" : "🚀"}
          title="Hold to fly!"
          subtitle={`Hold anywhere to zoom up, let go to float down. Grab ${isKeira ? "stars" : "coins"} and dodge the ${isKeira ? "jellies" : "zappers"}!`}
          actionLabel="Let's go!"
          onAction={start}
        />
        <GameOverlay
          show={ui === "over"}
          tone={result.best ? "win" : "neutral"}
          emoji={result.best ? "🏆" : isKeira ? "🐚" : "🪐"}
          title={result.best ? "New best!" : "What a trip!"}
          subtitle={
            <>
              <span className="block text-2xl font-black text-[var(--ink)]">
                🏁 {result.meters} m
              </span>
              <span className="block">
                {isKeira ? "⭐" : "🪙"} {result.coins} {isKeira ? "stars" : "coins"} · Score{" "}
                {result.score}
              </span>
            </>
          }
          actionLabel="Play again"
          onAction={restart}
        />
      </CanvasStage>
    </div>
  );
}
