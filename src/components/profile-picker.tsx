"use client";

import { PROFILES, type ProfileId } from "@/lib/profiles";
import { useProfile } from "@/context/profile-context";
import { cn } from "@/lib/utils";

export function ProfilePicker() {
  const { setProfile } = useProfile();

  return (
    <section className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col justify-center gap-8 px-5 py-10">
      <header className="hero-enter text-center">
        <p className="brand-mark mb-3 text-5xl font-black tracking-tight sm:text-6xl">
          Hobden Game Center
        </p>
        <h1 className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">
          Who is playing?
        </h1>
        <p className="mt-2 text-base text-[var(--ink)]/70">
          Same games. Your own look.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(PROFILES) as ProfileId[]).map((id, i) => {
          const p = PROFILES[id];
          return (
            <button
              key={id}
              type="button"
              className={cn(
                "profile-card group relative overflow-hidden rounded-[2rem] border-4 border-white/70 p-6 text-left shadow-xl transition",
                "min-h-44 active:scale-[0.98]",
              )}
              style={{
                background: `linear-gradient(145deg, ${p.skyFrom}, ${p.skyTo})`,
                animationDelay: `${i * 80}ms`,
              }}
              onClick={() => setProfile(id)}
            >
              <span className="absolute -right-2 -top-2 text-7xl opacity-30 transition group-hover:rotate-6">
                {p.emoji}
              </span>
              <span className="relative text-4xl">{p.emoji}</span>
              <span className="relative mt-3 block text-3xl font-black text-[var(--ink)]">
                {p.name}
              </span>
              <span className="relative mt-1 block text-base font-medium text-[var(--ink)]/75">
                {p.tagline}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
