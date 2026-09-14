"use client";

import Link from "next/link";
import { GAME_REGISTRY } from "@/lib/game-registry";
import { useProfile } from "@/context/profile-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GameMenu() {
  const { profile, clearProfile } = useProfile();
  if (!profile) return null;

  return (
    <section className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--ink)]/55">
            Hobden Game Center
          </p>
          <h1 className="mt-1 text-2xl font-black text-[var(--ink)] sm:text-3xl">
            {profile.greeting}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink)]/70">{profile.menuHint}</p>
        </div>
        <Button variant="secondary" size="default" onClick={clearProfile}>
          {profile.emoji} Switch
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 md:gap-4">
        {GAME_REGISTRY.map((game, i) => {
          const title = profile.gameNames[game.id] ?? game.title;
          const ready = game.status === "ready";
          const inner = (
            <div
              className={cn(
                "menu-tile relative flex min-h-36 flex-col justify-between overflow-hidden rounded-[1.6rem] border-4 border-white/60 p-4 text-left shadow-lg",
                ready ? "active:scale-[0.98]" : "opacity-80",
              )}
              style={{
                background: `linear-gradient(160deg, ${game.accent}cc, ${profile.surface})`,
                boxShadow: `0 12px 30px ${profile.tileGlow}`,
                animationDelay: `${i * 40}ms`,
              }}
            >
              <span className="text-4xl drop-shadow">{game.icon}</span>
              <div>
                <p className="text-lg font-black leading-tight text-[var(--ink)]">
                  {title}
                </p>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-[var(--ink)]/80">
                  {ready ? game.controlHint : "Coming soon"}
                </p>
              </div>
              {!ready ? (
                <span className="absolute right-3 top-3 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink)]">
                  Soon
                </span>
              ) : null}
            </div>
          );

          if (!ready) {
            return (
              <div key={game.id} aria-disabled className="cursor-default">
                {inner}
              </div>
            );
          }

          return (
            <Link key={game.id} href={`/play/${game.id}`} className="block">
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
