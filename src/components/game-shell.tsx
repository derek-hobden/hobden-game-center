"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getGame, type GameProps } from "@/lib/game-registry";
import { useProfile } from "@/context/profile-context";
import { Button } from "@/components/ui/button";

export function GameShell({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { profile, profileId, ready } = useProfile();
  const meta = getGame(gameId);
  const [paused, setPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const Game = useMemo(() => {
    if (!meta?.load) return null;
    return lazy(async () => {
      try {
        return await meta.load!();
      } catch {
        setError("Could not load this game.");
        return {
          default: (() => null) as ComponentType<GameProps>,
        };
      }
    });
  }, [meta]);

  useEffect(() => {
    if (ready && !profileId) router.replace("/");
  }, [ready, profileId, router]);

  if (!ready || !profile || !profileId) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-[var(--ink)]">
        Loading…
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-xl font-bold text-[var(--ink)]">Game not found</p>
        <Button asChild>
          <Link href="/">Back to menu</Link>
        </Button>
      </div>
    );
  }

  if (meta.status !== "ready" || !Game) {
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

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-5">
      <header className="flex items-center justify-between gap-2">
        <Button asChild variant="secondary" size="default">
          <Link href="/" aria-label="Back to menu">
            ← Back
          </Link>
        </Button>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--ink)]/50">
            Hobden Game Center
          </p>
          <h1 className="text-lg font-black text-[var(--ink)] sm:text-xl">
            {title}
          </h1>
        </div>
        <Button
          variant={paused ? "default" : "secondary"}
          size="default"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? "Resume" : "Pause"}
        </Button>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center rounded-[2rem] border-4 border-white/50 bg-white/25 p-3 shadow-inner backdrop-blur-sm sm:p-5">
        {paused ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[1.7rem] bg-[var(--ink)]/45 text-white backdrop-blur-sm">
            <p className="text-3xl font-black">Paused</p>
            <p className="text-sm opacity-90">Score {score}</p>
            <Button onClick={() => setPaused(false)}>Resume</Button>
          </div>
        ) : null}

        {error ? (
          <p className="text-center font-semibold text-rose-700">{error}</p>
        ) : (
          <Suspense
            fallback={
              <p className="animate-pulse text-lg font-semibold text-[var(--ink)]">
                Loading {title}…
              </p>
            }
          >
            <Game
              profileId={profileId}
              paused={paused}
              onScoreChange={setScore}
            />
          </Suspense>
        )}
      </div>

      <p className="pb-2 text-center text-sm text-[var(--ink)]/60">
        {meta.controlHint}
      </p>
    </div>
  );
}
