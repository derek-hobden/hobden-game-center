"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Card = {
  id: number;
  emoji: string;
  matched: boolean;
};

const KEIRA_EMOJIS = ["🦄", "🌈", "🧚", "🐘", "🧜", "👑"];
const LUKE_EMOJIS = ["🚀", "🦖", "🚗", "⚽", "🐠", "🤖"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(isKeira: boolean, pairs: number): Card[] {
  const pool = isKeira ? KEIRA_EMOJIS : LUKE_EMOJIS;
  const picks = pool.slice(0, pairs);
  const cards = picks.flatMap((emoji, i) => [
    { id: i * 2, emoji, matched: false },
    { id: i * 2 + 1, emoji, matched: false },
  ]);
  return shuffle(cards);
}

export default function Match2Game({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const pairs = 6;
  const [cards, setCards] = useState<Card[]>(() => buildDeck(isKeira, pairs));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [lock, setLock] = useState(false);
  const [moves, setMoves] = useState(0);
  const [matchPop, setMatchPop] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  const matchedCount = useMemo(
    () => cards.filter((c) => c.matched).length / 2,
    [cards],
  );

  useEffect(() => {
    onScoreChange?.(matchedCount);
  }, [matchedCount, onScoreChange]);

  // Rebuild themed deck when profile changes
  useEffect(() => {
    setCards(buildDeck(isKeira, pairs));
    setFlipped([]);
    setLock(false);
    setMoves(0);
    setMatchPop(null);
    setWon(false);
    onScoreChange?.(0);
  }, [isKeira, onScoreChange]);

  const reset = () => {
    setCards(buildDeck(isKeira, pairs));
    setFlipped([]);
    setLock(false);
    setMoves(0);
    setMatchPop(null);
    setWon(false);
    onScoreChange?.(0);
  };

  const onFlip = (index: number) => {
    if (paused || lock || won) return;
    const card = cards[index];
    if (card.matched || flipped.includes(index)) return;
    if (flipped.length >= 2) return;

    const nextFlipped = [...flipped, index];
    setFlipped(nextFlipped);

    if (nextFlipped.length < 2) return;

    setLock(true);
    setMoves((m) => m + 1);
    const [a, b] = nextFlipped;
    const match = cards[a].emoji === cards[b].emoji;

    window.setTimeout(() => {
      if (match) {
        setCards((prev) => {
          const copy = prev.map((c, i) =>
            i === a || i === b ? { ...c, matched: true } : c,
          );
          const done = copy.every((c) => c.matched);
          if (done) setWon(true);
          return copy;
        });
        setMatchPop(cards[a].emoji);
        window.setTimeout(() => setMatchPop(null), 700);
      }
      setFlipped([]);
      setLock(false);
    }, match ? 420 : 700);
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames["match-2"] ?? "Match 2"} · {matchedCount}/{pairs}
        </span>
        <span className="rounded-full bg-white/70 px-3 py-1 text-sm font-bold">
          Moves {moves}
        </span>
        <button
          type="button"
          className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 text-base font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={reset}
        >
          New game
        </button>
      </div>

      {matchPop ? (
        <p className="animate-bounce text-2xl font-black text-[var(--ink)]">
          Match! {matchPop}
        </p>
      ) : (
        <p className="text-sm font-medium text-[var(--ink)]/70">
          Flip two cards. Find the pairs!
        </p>
      )}

      <div className="grid w-full max-w-md grid-cols-3 gap-3 sm:grid-cols-4">
        {cards.map((card, index) => {
          const faceUp =
            card.matched || flipped.includes(index);
          return (
            <button
              key={`${card.id}-${index}`}
              type="button"
              disabled={paused || card.matched}
              aria-label={faceUp ? `Card ${card.emoji}` : "Hidden card"}
              className={cn(
                "flex aspect-square min-h-[88px] items-center justify-center rounded-3xl border-4 text-4xl shadow-md transition duration-200 touch-manipulation active:scale-95 sm:min-h-[96px] sm:text-5xl",
                faceUp
                  ? card.matched
                    ? isKeira
                      ? "border-pink-200 bg-pink-100"
                      : "border-sky-200 bg-sky-100"
                    : "border-white bg-white"
                  : isKeira
                    ? "border-pink-300/80 bg-gradient-to-br from-pink-400 to-violet-400"
                    : "border-sky-300/80 bg-gradient-to-br from-sky-500 to-emerald-400",
              )}
              onClick={() => onFlip(index)}
            >
              {faceUp ? card.emoji : isKeira ? "✨" : "❓"}
            </button>
          );
        })}
      </div>

      {won ? (
        <div className="w-full max-w-md rounded-3xl bg-emerald-200 px-4 py-5 text-center shadow-md">
          <p className="text-2xl font-black text-emerald-950">
            You matched them all! 🎉
          </p>
          <p className="mt-1 text-base font-semibold text-emerald-900">
            {moves} moves · tap New game to play again
          </p>
        </div>
      ) : null}
    </div>
  );
}
