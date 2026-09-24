"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Home,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getGame, type GameProps } from "@/lib/game-registry";
import { useProfile } from "@/context/profile-context";
import { Button } from "@/components/ui/button";
import { BrandLoading } from "@/components/brand-loading";
import { GameErrorBoundary } from "@/components/game-error-boundary";
import { SuppressIosCallout } from "@/components/suppress-ios-callout";
import { getBest, recordBest } from "@/lib/best-scores";
import { isMuted, onMutedChange, setMuted, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

function LazyGame({
  load,
  profileId,
  paused,
  onScoreChange,
}: GameProps & {
  load: () => Promise<{ default: ComponentType<GameProps> }>;
}) {
  const [Game] = useState(() => lazy(load));

  return (
    <Game
      profileId={profileId}
      paused={paused}
      onScoreChange={onScoreChange}
    />
  );
}

function GameCrashRecovery({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-auto flex flex-col items-center gap-3 rounded-[2rem] bg-white/80 p-6 text-center shadow-xl">
      <p className="text-5xl" aria-hidden>
        🙈
      </p>
      <p className="text-xl font-black text-[var(--ink)]">Oops! That game tripped.</p>
      <Button onClick={onRetry} size="lg">
        Try again
      </Button>
      <Button asChild variant="secondary">
        <Link href="/">Back to menu</Link>
      </Button>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "kid-btn size-12 shrink-0 rounded-2xl p-0",
        active ? "kid-btn-primary" : "kid-btn-secondary",
      )}
    >
      {children}
    </button>
  );
}

function useMuted() {
  return useSyncExternalStore(onMutedChange, isMuted, () => false);
}

export function GameShell({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { profile, profileId, ready } = useProfile();
  const meta = getGame(gameId);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  // Bumped when a new best is saved so the render below re-reads storage.
  const [, setBestVersion] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [bump, setBump] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [gameCrashed, setGameCrashed] = useState(false);
  const muted = useMuted();
  const scoreRef = useRef(0);

  useEffect(() => {
    if (ready && !profileId) router.replace("/");
  }, [ready, profileId, router]);

  // Games report score from effects, rAF loops and sometimes from inside
  // state updaters. Deferring the shell update keeps all of those legal.
  const onScoreChange = useCallback(
    (n: number) => {
      queueMicrotask(() => {
        if (n === scoreRef.current) return;
        const rose = n > scoreRef.current;
        scoreRef.current = n;
        setScore(n);
        if (rose) setBump((b) => b + 1);
        if (profileId && recordBest(profileId, gameId, n)) {
          setBestVersion((v) => v + 1);
          setNewBest(true);
        }
        if (n === 0) setNewBest(false);
      });
    },
    [profileId, gameId],
  );

  // Auto-pause when the app is backgrounded (tab switch, phone lock).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") setPaused(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready || !profile || !profileId) {
    return <BrandLoading />;
  }

  if (!meta) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-6xl" aria-hidden>
          🎮
        </p>
        <p className="brand-mark text-2xl font-black">Hobden Game Center</p>
        <h1 className="text-2xl font-black text-[var(--ink)]">Game not found</h1>
        <p className="max-w-md text-base text-[var(--ink)]/75">
          That game isn’t on the shelf. Pick another from the menu.
        </p>
        <Button asChild size="lg">
          <Link href="/">Back to menu</Link>
        </Button>
      </div>
    );
  }

  if (meta.status !== "ready" || !meta.load) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-5xl">{meta.icon}</p>
        <p className="text-2xl font-black text-[var(--ink)]">
          {profile.gameNames[meta.id] ?? meta.title}
        </p>
        <p className="text-[var(--ink)]/70">Coming soon — pick another game.</p>
        <Button asChild>
          <Link href="/">Back to menu</Link>
        </Button>
      </div>
    );
  }

  const title = profile.gameNames[meta.id] ?? meta.title;
  const load = meta.load;
  const best = getBest(profileId, gameId);

  const restart = () => {
    sfx("tap");
    scoreRef.current = 0;
    setScore(0);
    setNewBest(false);
    setPaused(false);
    setGameCrashed(false);
    setLoadAttempt((n) => n + 1);
  };

  return (
    <div
      className="mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 0.6rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 0.6rem)",
        paddingLeft: "max(env(safe-area-inset-left), 0.6rem)",
        paddingRight: "max(env(safe-area-inset-right), 0.6rem)",
      }}
    >
      <header className="flex shrink-0 items-center gap-2 pb-2">
        <Link
          href="/"
          aria-label="Back to menu"
          className="kid-btn kid-btn-secondary size-12 shrink-0 rounded-2xl p-0"
          onClick={() => sfx("tap")}
        >
          <ArrowLeft className="size-6" strokeWidth={3} />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col items-center leading-none">
          <h1 className="w-full truncate text-center text-lg font-black text-[var(--ink)] sm:text-xl">
            {title}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm font-black tabular-nums">
            <span
              key={bump}
              className="score-bump inline-flex min-w-10 justify-center rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[var(--accent-fg)] shadow-sm"
              aria-label={`Score ${score}`}
            >
              {score}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[var(--ink)]/60",
                newBest && "text-amber-600",
              )}
              aria-label={`Best ${best}`}
            >
              <Trophy className="size-3.5" strokeWidth={3} />
              {best}
              {newBest ? <span className="ml-0.5">New!</span> : null}
            </span>
          </div>
        </div>

        <IconButton
          label={muted ? "Sound on" : "Sound off"}
          onClick={() => {
            setMuted(!muted);
            if (muted) sfx("pop");
          }}
        >
          {muted ? (
            <VolumeX className="size-6" strokeWidth={2.75} />
          ) : (
            <Volume2 className="size-6" strokeWidth={2.75} />
          )}
        </IconButton>
        <IconButton
          label={paused ? "Resume" : "Pause"}
          active={paused}
          disabled={gameCrashed}
          onClick={() => {
            sfx("tap");
            setPaused((p) => !p);
          }}
        >
          {paused ? (
            <Play className="size-6" strokeWidth={3} fill="currentColor" />
          ) : (
            <Pause className="size-6" strokeWidth={3} fill="currentColor" />
          )}
        </IconButton>
      </header>

      <SuppressIosCallout className="relative flex min-h-0 flex-1 flex-col">
        <GameErrorBoundary
          key={`${gameId}-${loadAttempt}`}
          onError={() => {
            setGameCrashed(true);
            setPaused(false);
          }}
          fallback={<GameCrashRecovery onRetry={restart} />}
        >
          {paused ? (
            <div className="overlay-in absolute inset-0 z-40 flex items-center justify-center rounded-[1.75rem] bg-[var(--ink)]/45 p-4 backdrop-blur-md">
              <div className="card-pop flex w-full max-w-xs flex-col items-stretch gap-3 rounded-[2rem] border-4 border-white bg-[var(--surface)] p-5 text-center shadow-2xl">
                <p className="text-3xl font-black text-[var(--ink)]">Paused</p>
                <p className="-mt-1 text-base font-bold text-[var(--ink)]/65">
                  Score {score} · Best {best}
                </p>
                <button
                  type="button"
                  className="kid-btn kid-btn-primary min-h-16 text-2xl"
                  onClick={() => {
                    sfx("pop");
                    setPaused(false);
                  }}
                  autoFocus
                >
                  <Play className="size-7" fill="currentColor" /> Keep playing
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="kid-btn kid-btn-secondary min-h-14 text-lg"
                    onClick={restart}
                  >
                    <RotateCcw className="size-5" strokeWidth={3} /> Restart
                  </button>
                  <Link
                    href="/"
                    className="kid-btn kid-btn-secondary min-h-14 text-lg"
                    onClick={() => sfx("tap")}
                  >
                    <Home className="size-5" strokeWidth={3} /> Menu
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <Suspense
            fallback={
              <div className="m-auto flex flex-col items-center gap-3 py-10">
                <div
                  className="h-3 w-40 overflow-hidden rounded-full bg-[var(--ink)]/15"
                  aria-hidden
                >
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
                </div>
                <p className="text-lg font-bold text-[var(--ink)]">
                  Loading {title}…
                </p>
              </div>
            }
          >
            <LazyGame
              load={load}
              profileId={profileId}
              paused={paused}
              onScoreChange={onScoreChange}
            />
          </Suspense>
        </GameErrorBoundary>
      </SuppressIosCallout>
    </div>
  );
}
