"use client";

import { PROFILES, type ProfileId } from "@/lib/profiles";
import { useProfile } from "@/context/profile-context";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const HERO: Record<ProfileId, { img: string; bg: string; ring: string }> = {
  keira: {
    img: "/games/flappy/keira-flyer.png",
    bg: "linear-gradient(160deg, #ffd6ec 0%, #f9a8d4 45%, #c4b5fd 100%)",
    ring: "#f472b6",
  },
  luke: {
    img: "/games/flappy/luke-flyer.png",
    bg: "linear-gradient(160deg, #bae6fd 0%, #38bdf8 45%, #4ade80 100%)",
    ring: "#0ea5e9",
  },
};

export function ProfilePicker() {
  const { setProfile } = useProfile();

  return (
    <section
      className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col justify-center gap-7 px-5 py-8"
      style={{
        background:
          "radial-gradient(circle at 15% 15%, rgba(244,114,182,0.25), transparent 40%), radial-gradient(circle at 85% 20%, rgba(56,189,248,0.25), transparent 40%)",
      }}
    >
      <header className="hero-enter text-center">
        <p className="text-sm font-black uppercase tracking-[0.25em] text-[var(--ink)]/50">
          Welcome to
        </p>
        <p className="brand-mark mt-1 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
          Hobden
          <br />
          Game Center
        </p>
        <h1 className="mt-4 text-2xl font-black text-[var(--ink)] sm:text-3xl">
          Who’s playing?
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        {(Object.keys(PROFILES) as ProfileId[]).map((id, i) => {
          const p = PROFILES[id];
          const hero = HERO[id];
          return (
            <button
              key={id}
              type="button"
              className={cn(
                "profile-card menu-card group relative flex aspect-[3/4] flex-col items-center justify-end overflow-hidden rounded-[2rem] border-[6px] border-white p-4 text-center shadow-2xl sm:aspect-[4/5]",
              )}
              style={{
                background: hero.bg,
                animationDelay: `${i * 90}ms`,
                boxShadow: `0 8px 0 ${hero.ring}66, 0 24px 40px -16px ${hero.ring}`,
              }}
              onClick={() => {
                sfx("levelUp");
                setProfile(id);
              }}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background:
                    "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.9), transparent 55%)",
                }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.img}
                alt=""
                draggable={false}
                className="float-slow pointer-events-none absolute left-1/2 top-[8%] w-[78%] -translate-x-1/2 drop-shadow-[0_12px_14px_rgba(0,0,0,0.25)]"
                style={{ animationDelay: `${i * -2}s` }}
              />
              <span className="relative w-full rounded-[1.4rem] bg-white/90 px-3 py-2.5 shadow-lg backdrop-blur">
                <span className="block text-3xl font-black leading-none text-[var(--ink)] sm:text-4xl">
                  {p.name}
                </span>
                <span className="mt-1 block text-xs font-bold leading-snug text-[var(--ink)]/65 sm:text-sm">
                  {p.tagline}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
