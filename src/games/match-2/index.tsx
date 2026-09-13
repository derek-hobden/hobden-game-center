"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { match2Art, type PairId } from "./art";

type Card = {
  uid: number;
  pairId: PairId;
  src: string;
  label: string;
  matched: boolean;
};

const PAIR_COUNT = 6;
const HINTS_PER_GAME = 2;
const MATCH_HOLD_MS = 480;
const MISS_HOLD_MS = 980;
const PEEK_HOLD_MS = 1300;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(art: ReturnType<typeof match2Art>): Card[] {
  const picks = art.pairs.slice(0, PAIR_COUNT);
  const cards = picks.flatMap((pair, i) => [
    {
      uid: i * 2,
      pairId: pair.id,
      src: pair.src,
      label: pair.label,
      matched: false,
    },
    {
      uid: i * 2 + 1,
      pairId: pair.id,
      src: pair.src,
      label: pair.label,
      matched: false,
    },
  ]);
  return shuffle(cards);
}

export default function Match2Game({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const art = match2Art(profileId);
  const [cards, setCards] = useState<Card[]>(() => buildDeck(art));
  const [flipped, setFlipped] = useState<number[]>([]);
  const [lock, setLock] = useState(false);
  const [moves, setMoves] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(HINTS_PER_GAME);
  const [matchPop, setMatchPop] = useState<string | null>(null);
  const [missPop, setMissPop] = useState(false);
  const [won, setWon] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  };

  const matchedCount = useMemo(
    () => cards.filter((c) => c.matched).length / 2,
    [cards],
  );

  useEffect(() => {
    onScoreChange?.(matchedCount);
  }, [matchedCount, onScoreChange]);

  useEffect(() => {
    clearTimers();
    setCards(buildDeck(art));
    setFlipped([]);
    setLock(false);
    setMoves(0);
    setHintsLeft(HINTS_PER_GAME);
    setMatchPop(null);
    setMissPop(false);
    setWon(false);
    onScoreChange?.(0);
    return clearTimers;
  }, [profileId, art]);

  const reset = () => {
    clearTimers();
    setCards(buildDeck(art));
    setFlipped([]);
    setLock(false);
    setMoves(0);
    setHintsLeft(HINTS_PER_GAME);
    setMatchPop(null);
    setMissPop(false);
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
    setMissPop(false);

    if (nextFlipped.length < 2) return;

    setLock(true);
    setMoves((m) => m + 1);
    const [a, b] = nextFlipped;
    const match = cards[a].pairId === cards[b].pairId;

    later(() => {
      if (match) {
        setCards((prev) => {
          const copy = prev.map((c, i) =>
            i === a || i === b ? { ...c, matched: true } : c,
          );
          if (copy.every((c) => c.matched)) setWon(true);
          return copy;
        });
        setMatchPop(cards[a].label);
        later(() => setMatchPop(null), 900);
      } else {
        setMissPop(true);
        later(() => setMissPop(false), 700);
      }
      setFlipped([]);
      setLock(false);
    }, match ? MATCH_HOLD_MS : MISS_HOLD_MS);
  };

  const onHint = () => {
    if (paused || lock || won || hintsLeft <= 0) return;
    const unmatched = cards
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => !card.matched);
    if (unmatched.length < 2) return;

    const first = unmatched[0];
    const partner = unmatched.find(
      (entry) =>
        entry.index !== first.index && entry.card.pairId === first.card.pairId,
    );
    if (!partner) return;

    setLock(true);
    setHintsLeft((h) => h - 1);
    setFlipped([first.index, partner.index]);
    setMissPop(false);
    later(() => {
      setFlipped([]);
      setLock(false);
    }, PEEK_HOLD_MS);
  };

  const statusLine = matchPop
    ? `${art.matchYay} ${matchPop}`
    : missPop
      ? art.missCopy
      : art.flipHint;

  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      <div
        className="absolute inset-0 -z-10 overflow-hidden rounded-[1.75rem] opacity-80"
        aria-hidden
      >
        <img src={art.bg} alt="" className="h-full w-full object-cover" />
      </div>

      <div className="flex w-full max-w-md items-center gap-2 rounded-3xl bg-white/85 px-3 py-2 shadow-sm backdrop-blur-sm">
        <img
          src={art.card}
          alt=""
          className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-[var(--ink)]">
            {theme.gameNames["match-2"] ?? "Match 2"}
          </p>
          <p className="text-sm font-bold text-[var(--ink)]/75">
            {matchedCount}/{PAIR_COUNT} pairs · Moves {moves}
          </p>
        </div>
        <button
          type="button"
          className="min-h-12 shrink-0 rounded-2xl bg-[var(--accent)] px-3 py-3 text-sm font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={reset}
        >
          New game
        </button>
      </div>

      <button
        type="button"
        disabled={paused || won || hintsLeft <= 0 || lock}
        className={cn(
          "flex min-h-12 w-full max-w-md items-center justify-center rounded-2xl border-4 px-3 py-2 text-base font-black shadow-sm active:scale-[0.99] disabled:opacity-50",
          hintsLeft > 0
            ? "border-amber-300 bg-amber-100 text-amber-950"
            : "border-white/70 bg-white/80 text-[var(--ink)]",
        )}
        onClick={onHint}
      >
        {art.hintLabel} · {hintsLeft} left
      </button>

      {won ? (
        <div className="w-full max-w-md rounded-3xl bg-emerald-200/95 px-4 py-3 text-center shadow-md">
          <p className="text-xl font-black text-emerald-950">{art.win}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">
            {moves} moves · tap New game to play again
          </p>
        </div>
      ) : (
        <p
          className={cn(
            "min-h-8 px-2 text-center text-base font-black text-[var(--ink)]",
            matchPop && "animate-bounce",
          )}
        >
          {statusLine}
        </p>
      )}

      <div className="grid w-full max-w-md grid-cols-3 gap-2.5 rounded-3xl border-4 border-white/70 bg-white/40 p-2 shadow-lg backdrop-blur-[2px] sm:gap-3 sm:p-3">
        {cards.map((card, index) => {
          const faceUp = card.matched || flipped.includes(index);
          return (
            <button
              key={card.uid}
              type="button"
              disabled={paused || card.matched}
              aria-label={faceUp ? card.label : "Hidden card"}
              className={cn(
                "relative aspect-square min-h-[80px] overflow-hidden rounded-3xl border-4 shadow-md transition duration-200 touch-manipulation [perspective:700px] active:scale-95 sm:min-h-[108px]",
                card.matched
                  ? "border-emerald-300"
                  : faceUp
                    ? "border-white"
                    : "border-white/80",
              )}
              onClick={() => onFlip(index)}
            >
              <span
                className={cn(
                  "relative block h-full w-full [transform-style:preserve-3d] transition-transform duration-300",
                  faceUp && "[transform:rotateY(180deg)]",
                )}
              >
                <span className="absolute inset-0 [backface-visibility:hidden]">
                  <img
                    src={art.back}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]">
                  <img
                    src={card.src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
