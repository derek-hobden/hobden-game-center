"use client";

import Link from "next/link";
import { Trophy, Users } from "lucide-react";
import { GAME_REGISTRY } from "@/lib/game-registry";
import { useProfile } from "@/context/profile-context";
import { getAllBest } from "@/lib/best-scores";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

export function GameMenu() {
  const { profile, clearProfile } = useProfile();
  if (!profile) return null;
  // Only mounted client-side (after the profile is read from storage).
  const best = getAllBest(profile.id);

  return (
    <section
      className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col gap-5 px-4 pb-10 sm:px-6"
      style={{ paddingTop: "max(env(safe-area-inset-top), 1rem)" }}
    >
      <header className="hero-enter flex items-center gap-3">
        <div
          className="grid size-16 shrink-0 place-items-center rounded-[1.4rem] border-4 border-white text-4xl shadow-lg"
          style={{
            background: `linear-gradient(145deg, ${profile.surface2}, ${profile.accent})`,
          }}
          aria-hidden
        >
          <span className="float-slow inline-block">{profile.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink)]/50">
            Hobden Game Center
          </p>
          <h1 className="brand-mark text-3xl font-black leading-tight sm:text-4xl">
            Hi {profile.name}!
          </h1>
          <p className="text-sm font-bold text-[var(--ink)]/65 sm:text-base">
            {profile.id === "keira" ? "Pick a game to play" : "Choose your mission"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            sfx("tap");
            clearProfile();
          }}
          className="kid-btn kid-btn-secondary min-h-12 shrink-0 px-3 text-sm"
          aria-label="Switch player"
        >
          <Users className="size-5" strokeWidth={2.75} />
          <span className="hidden sm:inline">Switch player</span>
          <span className="sm:hidden">Switch</span>
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {GAME_REGISTRY.map((game, i) => {
          const title = profile.gameNames[game.id] ?? game.title;
          const ready = game.status === "ready";
          const score = best[game.id] ?? 0;
          const card = (
            <div
              className={cn(
                "menu-tile relative flex h-full flex-col overflow-hidden rounded-[1.6rem] border-4 border-white bg-white shadow-lg",
                !ready && "opacity-70 grayscale",
              )}
              style={{
                boxShadow: `0 6px 0 ${game.accent}55, 0 14px 28px -10px ${profile.tileGlow}`,
                animationDelay: `${Math.min(i, 12) * 35}ms`,
              }}
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-t-[1.2rem] bg-[var(--surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/thumbs/${game.id}-${profile.id}.webp`}
                  alt=""
                  loading={i < 6 ? "eager" : "lazy"}
                  decoding="async"
                  className="menu-tile-art absolute inset-0 size-full object-cover"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent" />
                {score > 0 ? (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs font-black text-amber-600 shadow tabular-nums">
                    <Trophy className="size-3.5" strokeWidth={3} />
                    {score}
                  </span>
                ) : null}
                {!ready ? (
                  <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--ink)]">
                    Soon
                  </span>
                ) : null}
              </div>
              <div
                className="flex flex-1 flex-col justify-center px-3 py-2.5"
                style={{
                  background: `linear-gradient(180deg, #fff, ${game.accent}22)`,
                }}
              >
                <p className="text-[1.05rem] font-black leading-tight text-[var(--ink)] sm:text-lg">
                  {title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug font-bold text-[var(--ink)]/55 sm:text-sm">
                  {ready ? game.blurb : "Coming soon"}
                </p>
              </div>
            </div>
          );

          if (!ready) {
            return (
              <div key={game.id} aria-disabled className="h-full cursor-default">
                {card}
              </div>
            );
          }

          return (
            <Link
              key={game.id}
              href={`/play/${game.id}`}
              className="menu-card block h-full rounded-[1.6rem] focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
              onClick={() => sfx("pop")}
            >
              {card}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
