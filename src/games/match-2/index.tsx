"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { match2Art } from "./art";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  buildDeck,
  difficultyConfig,
  type Difficulty,
} from "./deck";

const HINTS_PER_GAME = 2;
const MATCH_HOLD_MS = 480;
const MISS_HOLD_MS = 980;
const PEEK_HOLD_MS = 1300;

export default function Match2Game({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [roundNonce, setRoundNonce] = useState(0);

  return (
    <Match2Round
      key={`${profileId}-${difficulty}-${roundNonce}`}
      profileId={profileId}
      paused={paused}
      onScoreChange={onScoreChange}
      difficulty={difficulty}
      onDifficultyChange={setDifficulty}
      onNewGame={() => setRoundNonce((n) => n + 1)}
    />
  );
}

function Match2Round({
  profileId,
  paused,
  onScoreChange,
  difficulty,
  onDifficultyChange,
  onNewGame,
}: GameProps & {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onNewGame: () => void;
}) {
  const theme = PROFILES[profileId];
  const art = match2Art(profileId);
  const { pairCount, columns } = difficultyConfig(difficulty);
  const [cards, setCards] = useState(() => buildDeck(art.pairs, difficulty));
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

  useEffect(() => clearTimers, []);

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
            {matchedCount}/{pairCount} pairs · Moves {moves}
          </p>
        </div>
        <button
          type="button"
          className="min-h-12 shrink-0 rounded-2xl bg-[var(--accent)] px-3 py-3 text-sm font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={onNewGame}
        >
          New game
        </button>
      </div>

      <div
        className="grid w-full max-w-md grid-cols-3 gap-2"
        role="group"
        aria-label="Difficulty"
      >
        {DIFFICULTIES.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={difficulty === id}
            className={cn(
              "flex min-h-12 items-center justify-center rounded-2xl border-4 px-2 py-2 text-sm font-black shadow-sm active:scale-[0.99]",
              difficulty === id
                ? "border-emerald-300 bg-emerald-100 text-emerald-950"
                : "border-white/70 bg-white/80 text-[var(--ink)]",
            )}
            onClick={() => {
              if (id === difficulty) return;
              onDifficultyChange(id);
            }}
          >
            {DIFFICULTY_LABELS[id]}
          </button>
        ))}
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

      <div className="relative w-full max-w-md shrink-0">
        {won ? (
          <div className="rounded-3xl bg-emerald-200/95 px-4 py-3 text-center shadow-md">
            <p className="text-xl font-black text-emerald-950">{art.win}</p>
            <p className="mt-1 text-sm font-semibold text-emerald-900">
              {moves} moves · tap New game to play again
            </p>
          </div>
        ) : (
          <p className="flex h-[4.5rem] items-center justify-center px-2 text-center text-base font-black leading-snug text-[var(--ink)]">
            {statusLine}
          </p>
        )}
      </div>

      <div
        className="grid w-full max-w-md gap-2.5 rounded-3xl border-4 border-white/70 bg-white/40 p-2 shadow-lg backdrop-blur-[2px] sm:gap-3 sm:p-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {cards.map((card, index) => {
          const faceUp = card.matched || flipped.includes(index);
          return (
            <button
              key={card.uid}
              type="button"
              disabled={paused || card.matched}
              aria-label={faceUp ? card.label : "Hidden card"}
              className={cn(
                "relative aspect-square overflow-hidden rounded-3xl border-4 shadow-md transition duration-200 touch-manipulation [perspective:700px] active:scale-95",
                columns === 3 && "min-h-[80px] sm:min-h-[108px]",
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
