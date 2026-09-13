"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";

type Unit = { x: number; side: "you" | "them"; hp: number };

export default function CastleFightGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const [gold, setGold] = useState(30);
  const [youHp, setYouHp] = useState(100);
  const [themHp, setThemHp] = useState(100);
  const [msg, setMsg] = useState("Train a helper!");
  const [tick, setTick] = useState(0);
  const units = useRef<Unit[]>([]);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const done = youHp <= 0 || themHp <= 0;

  function reset() {
    units.current = [];
    setGold(30);
    setYouHp(100);
    setThemHp(100);
    setMsg("Train a helper!");
    onScoreChange?.(0);
  }

  function spawn(side: "you" | "them") {
    units.current.push({
      x: side === "you" ? 40 : 320,
      side,
      hp: 20,
    });
  }

  function train() {
    if (paused || done || gold < 10) return;
    setGold((g) => g - 10);
    spawn("you");
    setMsg(isKeira ? "Fairy friend!" : "Knight ready!");
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused || done) return;
      setGold((g) => Math.min(99, g + 2));
      if (Math.random() < 0.35) spawn("them");
      const next: Unit[] = [];
      for (const u of units.current) {
        const foeCastle = u.side === "you" ? 320 : 40;
        const speed = u.side === "you" ? 4 : -4;
        u.x += speed;
        // fight nearby opposite
        const enemy = units.current.find(
          (o) => o.side !== u.side && Math.abs(o.x - u.x) < 18,
        );
        if (enemy) {
          enemy.hp -= 4;
          u.hp -= 2;
        } else if (Math.abs(u.x - foeCastle) < 20) {
          if (u.side === "you") setThemHp((h) => Math.max(0, h - 6));
          else setYouHp((h) => Math.max(0, h - 6));
          u.hp = 0;
        }
        if (u.hp > 0) next.push(u);
      }
      units.current = next;
      setTick((t) => t + 1);
      const smashed = 100 - themHp;
      onScoreChange?.(Math.max(0, smashed));
    }, 400);
    return () => window.clearInterval(id);
  }, [paused, done, themHp, onScoreChange]);

  useEffect(() => {
    if (themHp <= 0) setMsg("You win the castle! 🏰");
    if (youHp <= 0) setMsg("Oh no — castle fell.");
  }, [themHp, youHp]);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>{theme.gameNames["castle-fight"]}</span>
        {done ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Rematch
          </button>
        ) : null}
      </div>
      <div className="rounded-3xl border-4 border-white/70 bg-[var(--surface)] p-4 shadow-lg">
        <div className="mb-3 flex justify-between text-sm font-bold">
          <span>
            {isKeira ? "🦄" : "🛡️"} You {youHp}
          </span>
          <span>🪙 {gold}</span>
          <span>
            Them {themHp} {isKeira ? "🧙" : "🐉"}
          </span>
        </div>
        <div className="relative h-28 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-100 to-sky-100">
          <div className="absolute left-2 top-6 text-3xl">{isKeira ? "🏰" : "🏯"}</div>
          <div className="absolute right-2 top-6 text-3xl">{isKeira ? "🗼" : "🏭"}</div>
          {units.current.map((u, i) => (
            <span
              key={`${u.side}-${i}-${Math.round(u.x)}-${tick}`}
              className="absolute top-10 text-2xl transition-all"
              style={{ left: `${(u.x / 360) * 100}%` }}
            >
              {u.side === "you" ? (isKeira ? "🧚" : "🗡️") : isKeira ? "😈" : "🧟"}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center font-semibold text-[var(--ink)]">{msg}</p>
      </div>
      <button
        type="button"
        disabled={paused || done || gold < 10}
        className="min-h-16 rounded-3xl bg-[var(--accent)] text-xl font-black text-[var(--accent-fg)] shadow-md disabled:opacity-50 active:scale-95"
        onClick={train}
      >
        Train helper (10 🪙)
      </button>
      <p className="text-center text-sm text-[var(--ink)]/70">
        Simple lane battle — send friends to the other castle.
      </p>
    </div>
  );
}
