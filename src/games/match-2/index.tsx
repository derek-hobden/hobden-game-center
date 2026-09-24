"use client";

/* eslint-disable @next/next/no-img-element -- small static card art */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { GameProps } from "@/lib/game-registry";
import { FitBox, GameOverlay, StatPill } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { match2Art } from "./art";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LABELS,
  buildDeck,
  gridLayout,
  difficultyConfig,
  resolveDifficulty,
  starRating,
  visibleDifficulties,
  type Difficulty,
} from "./deck";
import styles from "./match.module.css";

const PEEKS_PER_GAME = 2;
const FLIP_MS = 460;
const MISS_HOLD_MS = 900;
const PEEK_HOLD_MS = 1600;
const CONFETTI_COLORS = ["#f472b6", "#facc15", "#34d399", "#60a5fa", "#a78bfa", "#fb923c"];

const noopSubscribe = () => () => {};

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((p) =>
        Math.abs(p.width - r.width) < 1 && Math.abs(p.height - r.height) < 1
          ? p
          : { width: r.width, height: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export default function Match2Game({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const art = match2Art(profileId);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [roundNonce, setRoundNonce] = useState(0);
  const effectiveDifficulty = resolveDifficulty(difficulty, art.pairs.length);

  return (
    <Match2Round
      key={`${profileId}-${effectiveDifficulty}-${roundNonce}`}
      profileId={profileId}
      paused={paused}
      onScoreChange={onScoreChange}
      difficulty={effectiveDifficulty}
      onDifficultyChange={(d) => {
        setDifficulty(d);
        setRoundNonce((n) => n + 1);
      }}
      onNewGame={() => setRoundNonce((n) => n + 1)}
    />
  );
}

type Burst = { a: number; b: number; id: number; label: string };

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
  const art = match2Art(profileId);
  const levels = visibleDifficulties(art.pairs.length);
  const { columns: preferredCols } = difficultyConfig(difficulty);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const [cards, setCards] = useState(() => buildDeck(art.pairs, difficulty));
  const pairCount = cards.length / 2;
  const [flipped, setFlipped] = useState<number[]>([]);
  const [lock, setLock] = useState(false);
  const [moves, setMoves] = useState(0);
  const [peeksLeft, setPeeksLeft] = useState(PEEKS_PER_GAME);
  const [peeking, setPeeking] = useState(false);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [nope, setNope] = useState<number[]>([]);
  const [won, setWon] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [confetti, setConfetti] = useState<
    { dx: number; dy: number; rot: number; color: string; delay: number }[] | null
  >(null);

  const timers = useRef<number[]>([]);
  const missTimers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      missTimers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const matchedCount = useMemo(
    () => cards.filter((c) => c.matched).length / 2,
    [cards],
  );
  const stars = starRating(moves, pairCount);
  const score = matchedCount * 10 + (won ? stars * 10 : 0);

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const resolveMiss = useCallback(() => {
    missTimers.current.forEach((t) => window.clearTimeout(t));
    missTimers.current = [];
    setFlipped([]);
    setNope([]);
    setLock(false);
  }, []);

  const onFlip = (index: number) => {
    if (paused || won || peeking) return;
    const card = cards[index];
    if (!card || card.matched || flipped.includes(index)) return;

    let current = flipped;
    if (lock) {
      // Tapping a new card while a wrong pair is showing: flip them back now.
      if (nope.length === 0) return;
      resolveMiss();
      current = [];
    }

    const nextFlipped = [...current, index];
    setFlipped(nextFlipped);
    sfx("flip", { pitch: nextFlipped.length === 1 ? 1 : 1.15 });
    haptic(8);
    if (nextFlipped.length < 2) return;

    setLock(true);
    setMoves((m) => m + 1);
    const [a, b] = nextFlipped;
    if (cards[a].pairId === cards[b].pairId) {
      later(() => {
        const next = cards.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c));
        setCards(next);
        setFlipped([]);
        setLock(false);
        setBurst({ a, b, id: Date.now(), label: cards[a].label });
        sfx("match");
        haptic(30);
        if (next.every((c) => c.matched)) {
          setWon(true);
          later(() => {
            sfx("win");
            setConfetti(
              Array.from({ length: 48 }, (_, n) => {
                const ang = Math.random() * Math.PI * 2;
                const dist = 140 + Math.random() * 240;
                return {
                  dx: Math.cos(ang) * dist,
                  dy: Math.sin(ang) * dist + 150,
                  rot: (Math.random() - 0.5) * 900,
                  color: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
                  delay: Math.random() * 200,
                };
              }),
            );
          }, 450);
          later(() => {
            setShowOverlay(true);
            const s = starRating(moves + 1, pairCount);
            for (let i = 0; i < s; i++) {
              later(() => sfx("star", { pitch: 1 + i * 0.18 }), 350 + i * 220);
            }
          }, 1500);
        }
      }, FLIP_MS);
    } else {
      missTimers.current = [
        window.setTimeout(() => {
          setNope([a, b]);
          sfx("miss");
        }, FLIP_MS + 120),
        window.setTimeout(resolveMiss, FLIP_MS + MISS_HOLD_MS),
      ];
    }
  };

  const onPeek = () => {
    if (paused || won || peeking || lock || flipped.length > 0 || peeksLeft <= 0) return;
    setPeeksLeft((p) => p - 1);
    setPeeking(true);
    sfx("star");
    later(() => {
      setPeeking(false);
      sfx("flip", { pitch: 0.9 });
    }, PEEK_HOLD_MS);
  };

  // Layout: pick the column count that gives the biggest cards for this screen.
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const gap = box.width > 600 ? 12 : 8;
  const layout = gridLayout(cards.length, box.width - 12, box.height - 12, gap, preferredCols);
  const { cols, rows } = layout;
  const boardAspect =
    (cols * layout.cardW + gap * (cols - 1)) / (rows * layout.cardH + gap * (rows - 1));

  // Keyboard: arrows move, Space/Enter flip, P peeks.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (paused) return;
      const cur = cursor ?? 0;
      const move = (d: number) => {
        e.preventDefault();
        setCursor(Math.min(cards.length - 1, Math.max(0, cur + d)));
      };
      switch (e.key) {
        case "ArrowLeft":
          return move(-1);
        case "ArrowRight":
          return move(1);
        case "ArrowUp":
          return move(-cols);
        case "ArrowDown":
          return move(cols);
        case " ":
        case "Enter":
          if (cursor == null) return;
          e.preventDefault();
          onFlip(cursor);
          return;
        case "p":
        case "P":
          onPeek();
          return;
        default:
          return;
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nextLevel = levels[levels.indexOf(difficulty) + 1];

  return (
    <div className="game-root relative">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[1.75rem]"
        aria-hidden
      >
        <img src={art.bg} alt="" className="h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-white/5 to-white/35" />
      </div>

      {/* HUD */}
      <div className="flex w-full max-w-xl shrink-0 items-center gap-2 px-1 pt-1">
        {levels.length > 1 ? (
          <div
            role="group"
            aria-label="Difficulty"
            className="flex rounded-full bg-white/75 p-1 shadow-sm ring-1 ring-[var(--ink)]/10 backdrop-blur-sm"
          >
            {levels.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={difficulty === id}
                disabled={paused}
                className={cn(
                  "min-h-9 rounded-full px-2.5 text-sm font-black transition-colors",
                  difficulty === id
                    ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm"
                    : "text-[var(--ink)]/70 active:bg-black/5",
                )}
                onClick={() => {
                  if (paused) return;
                  sfx("tap");
                  if (id === difficulty) onNewGame();
                  else onDifficultyChange(id);
                }}
              >
                {DIFFICULTY_LABELS[id]}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex-1" />
        <StatPill className="min-h-11 px-3 text-base">
          <span aria-hidden>👆</span>
          <span aria-label={`${moves} moves`}>{moves}</span>
        </StatPill>
        <button
          type="button"
          onClick={onPeek}
          disabled={paused || won || (!peeking && (lock || flipped.length > 0 || peeksLeft <= 0))}
          aria-label={`${art.hintLabel}, ${peeksLeft} left`}
          className={cn(
            "kid-btn relative min-h-11 rounded-full px-3 text-base",
            peeking ? "kid-btn-primary" : "kid-btn-secondary",
          )}
        >
          <span aria-hidden>👀</span>
          {peeksLeft}
        </button>
      </div>

      <div ref={boxRef} className="flex min-h-0 w-full flex-1 flex-col">
        <FitBox aspect={boardAspect} className="p-1.5">
          {(size) => {
            const card = (size.width - gap * (cols - 1)) / cols;
            const cardH = (size.height - gap * (rows - 1)) / rows;
            const radius = Math.round(card * 0.16);
            const showLabel = cardH - card > 20;
            const labelSize = Math.max(12, Math.min(22, card * 0.15));
            return (
              <>
                <div
                  className={cn(styles.grid, "grid h-full w-full")}
                  role="group"
                  aria-label="Cards"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                    gap,
                  }}
                >
                  {cards.map((c, index) => {
                    const faceUp = c.matched || flipped.includes(index) || peeking;
                    const col = index % cols;
                    const row = Math.floor(index / cols);
                    const justMatched = burst && (burst.a === index || burst.b === index);
                    const deal = {
                      "--fx": `${((cols - 1) / 2 - col) * (card + gap)}px`,
                      "--fy": `${((rows - 1) / 2 - row) * (cardH + gap) + 60}px`,
                      "--glow": art.glow,
                      animationDelay: `${index * 35}ms`,
                    } as CSSProperties;
                    return (
                      <button
                        key={c.uid}
                        type="button"
                        tabIndex={-1}
                        disabled={paused}
                        aria-label={faceUp ? c.label : "Hidden card"}
                        className={cn(
                          styles.slot,
                          styles.deal,
                          "relative h-full w-full touch-manipulation outline-none",
                          cursor === index && "z-10 rounded-2xl ring-4 ring-sky-400 ring-offset-2",
                        )}
                        style={deal}
                        onClick={() => onFlip(index)}
                      >
                        <span
                          className={cn(
                            "block h-full w-full",
                            justMatched && styles.celebrate,
                            nope.includes(index) && styles.nope,
                          )}
                        >
                          <span className={cn(styles.inner, faceUp && styles.flipped)}>
                            <span
                              className={cn(styles.face, "bg-white")}
                              style={{ borderRadius: radius }}
                            >
                              <img
                                src={art.back}
                                alt=""
                                draggable={false}
                                className="h-full w-full object-cover"
                              />
                            </span>
                            <span
                              className={cn(
                                styles.face,
                                styles.front,
                                "flex flex-col bg-white",
                                c.matched && styles.glow,
                              )}
                              style={{
                                borderRadius: radius,
                                borderColor: c.matched ? "#fde047" : "white",
                              }}
                            >
                              {hydrated ? (
                                <img
                                  src={c.src}
                                  alt=""
                                  draggable={false}
                                  className="min-h-0 w-full flex-1 object-cover"
                                />
                              ) : null}
                              {showLabel ? (
                                <span
                                  className="flex shrink-0 items-center justify-center truncate px-1 font-black leading-none text-[var(--ink)]"
                                  style={{
                                    height: Math.min(cardH - card, labelSize * 2),
                                    fontSize: labelSize,
                                    background: c.matched ? "#fef3c7" : "white",
                                  }}
                                >
                                  {c.label}
                                </span>
                              ) : null}
                              {c.matched ? (
                                <span
                                  className={cn(
                                    styles.badge,
                                    "absolute right-[5%] top-[5%] flex items-center justify-center rounded-full bg-amber-400 font-black text-white shadow-md ring-2 ring-white",
                                  )}
                                  style={{
                                    width: Math.max(18, card * 0.26),
                                    height: Math.max(18, card * 0.26),
                                    fontSize: Math.max(11, card * 0.16),
                                  }}
                                >
                                  ★
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </span>
                        {justMatched ? (
                          <span key={`s-${burst.id}`} className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                            {Array.from({ length: 9 }, (_, i) => {
                              const ang = (i / 9) * Math.PI * 2 + (index % 2) * 0.35;
                              const dist = card * (0.6 + (i % 3) * 0.12);
                              return (
                                <span
                                  key={i}
                                  className={styles.spark}
                                  style={
                                    {
                                      "--dx": `${Math.cos(ang) * dist}px`,
                                      "--dy": `${Math.sin(ang) * dist}px`,
                                      "--rot": `${i * 40}deg`,
                                      animationDelay: `${(i % 3) * 40}ms`,
                                      fontSize: Math.max(14, card * 0.2),
                                    } as CSSProperties
                                  }
                                >
                                  {i % 2 ? "✨" : "⭐"}
                                </span>
                              );
                            })}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {burst && !won ? (
                  <div
                    key={burst.id}
                    className={cn(
                      styles.toast,
                      "pointer-events-none absolute left-1/2 top-[42%] z-20 whitespace-nowrap rounded-full border-4 border-white px-5 py-2 text-2xl font-black text-white shadow-xl",
                    )}
                    style={{ background: art.glow, textShadow: "0 2px 0 rgba(0,0,0,0.2)" }}
                  >
                    {burst.label}!
                  </div>
                ) : null}

                {confetti ? (
                  <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
                    {confetti.map((p, i) => (
                      <span
                        key={i}
                        className={styles.confetti}
                        style={
                          {
                            background: p.color,
                            borderRadius: i % 3 === 0 ? "50%" : 3,
                            animationDelay: `${p.delay}ms`,
                            "--dx": `${p.dx}px`,
                            "--dy": `${p.dy}px`,
                            "--rot": `${p.rot}deg`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                ) : null}

                <GameOverlay
                  show={showOverlay}
                  tone="win"
                  emoji={
                    <span className="flex items-end justify-center gap-1" aria-label={`${stars} stars`}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className={cn(styles.star, "inline-block", i === 1 ? "text-6xl" : "text-5xl", i >= stars && "opacity-25 grayscale")}
                          style={{ animationDelay: `${350 + i * 220}ms` }}
                        >
                          ⭐
                        </span>
                      ))}
                    </span>
                  }
                  title={art.winTitle}
                  subtitle={
                    <>
                      {art.win}
                      <br />
                      <span className="font-black text-[var(--ink)]">
                        {moves} moves · {pairCount} pairs
                      </span>
                    </>
                  }
                  actionLabel="Play again"
                  onAction={onNewGame}
                  secondary={
                    nextLevel ? (
                      <button
                        type="button"
                        className="kid-btn kid-btn-secondary mt-1 min-h-12 w-full text-base"
                        onClick={() => onDifficultyChange(nextLevel)}
                      >
                        Try {DIFFICULTY_LABELS[nextLevel]} →
                      </button>
                    ) : null
                  }
                />
              </>
            );
          }}
        </FitBox>
      </div>
    </div>
  );
}
