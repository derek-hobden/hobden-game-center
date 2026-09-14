"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getGame, type GameProps } from "@/lib/game-registry";
import { useProfile } from "@/context/profile-context";
import { Button } from "@/components/ui/button";
import { BrandLoading } from "@/components/brand-loading";
import { GameErrorBoundary } from "@/components/game-error-boundary";
import { SuppressIosCallout } from "@/components/suppress-ios-callout";

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
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-center font-semibold text-rose-700">
        Could not load this game.
      </p>
      <Button onClick={onRetry}>Try again</Button>
      <Button asChild variant="secondary">
        <Link href="/">Back to menu</Link>
      </Button>
    </div>
  );
}

export function GameShell({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { profile, profileId, ready } = useProfile();
  const meta = getGame(gameId);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (ready && !profileId) router.replace("/");
  }, [ready, profileId, router]);

  if (!ready || !profile || !profileId) {
    return <BrandLoading />;
  }

  if (!meta) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-5xl" aria-hidden>
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
        <p className="text-4xl">{meta.icon}</p>
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

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-5">
      <header className="flex items-center justify-between gap-2">
        <Button
          asChild
          variant="secondary"
          size="default"
          className="shrink-0 px-3 sm:px-5"
        >
          <Link href="/" aria-label="Back to menu">
            ← <span className="hidden sm:inline">Back</span>
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate px-1 text-center text-lg font-black text-[var(--ink)] sm:text-xl">
          {title}
        </h1>
        <Button
          variant={paused ? "default" : "secondary"}
          size="default"
          className="shrink-0 px-3 sm:px-5"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? "Resume" : "Pause"}
        </Button>
      </header>

      <SuppressIosCallout className="relative flex flex-1 flex-col items-center justify-center rounded-[2rem] border-4 border-white/50 bg-white/25 p-3 shadow-inner backdrop-blur-sm sm:p-5">
        {paused ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-[1.7rem] bg-[var(--ink)]/50 text-white backdrop-blur-sm">
            <p className="text-4xl font-black">Paused</p>
            <p className="text-2xl font-black">Score {score}</p>
            <Button size="xl" onClick={() => setPaused(false)}>
              Resume
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/">Back to menu</Link>
            </Button>
          </div>
        ) : null}

        <GameErrorBoundary
          key={`${gameId}-${loadAttempt}`}
          fallback={
            <GameCrashRecovery
              onRetry={() => setLoadAttempt((n) => n + 1)}
            />
          }
        >
          <Suspense
            fallback={
              <div className="flex flex-col items-center gap-3 py-10">
                <div
                  className="h-2 w-36 overflow-hidden rounded-full bg-[var(--ink)]/15"
                  aria-hidden
                >
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--accent)]" />
                </div>
                <p className="text-lg font-semibold text-[var(--ink)]">
                  Loading {title}…
                </p>
              </div>
            }
          >
            <LazyGame
              load={load}
              profileId={profileId}
              paused={paused}
              onScoreChange={setScore}
            />
          </Suspense>
        </GameErrorBoundary>
      </SuppressIosCallout>

      <p className="pb-2 text-center text-base font-semibold text-[var(--ink)]/80">
        {meta.controlHint}
      </p>
    </div>
  );
}
