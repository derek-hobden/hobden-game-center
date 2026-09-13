"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { RANKS, feltSrc, hintCopy, suitName, winSrc } from "./art";
import {
  CardBack,
  CardFace,
  EmptySlot,
  type SolitaireCard,
} from "./card-face";

type Selection =
  | { kind: "waste" }
  | { kind: "tableau"; col: number };

type ShakeTarget =
  | { kind: "foundation"; suit: number }
  | { kind: "tableau"; col: number }
  | { kind: "home" };

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildDeck(): SolitaireCard[] {
  const cards: SolitaireCard[] = [];
  let id = 0;
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 0; rank < RANKS.length; rank++) {
      cards.push({ id: id++, rank, suit });
    }
  }
  return shuffle(cards);
}

function dealFresh() {
  const deck = buildDeck();
  const tableau: SolitaireCard[][] = [[], [], [], []];
  for (let col = 0; col < 4; col++) {
    for (let n = 0; n <= col; n++) {
      tableau[col].push(deck.pop()!);
    }
  }
  return { deck, tableau };
}

function canStackOn(card: SolitaireCard, top: SolitaireCard | undefined) {
  if (!top) return true;
  return card.rank === top.rank - 1 && card.suit % 2 !== top.suit % 2;
}

function canHome(card: SolitaireCard, foundations: SolitaireCard[][]) {
  return card.rank === foundations[card.suit].length;
}

function peekSelected(
  selected: Selection | null,
  waste: SolitaireCard[],
  tableau: SolitaireCard[][],
): SolitaireCard | null {
  if (!selected) return null;
  switch (selected.kind) {
    case "waste":
      return waste[waste.length - 1] ?? null;
    case "tableau":
      return tableau[selected.col][tableau[selected.col].length - 1] ?? null;
    default: {
      const _never: never = selected;
      return _never;
    }
  }
}

function sameSelection(a: Selection | null, b: Selection) {
  if (!a) return false;
  switch (b.kind) {
    case "waste":
      return a.kind === "waste";
    case "tableau":
      return a.kind === "tableau" && a.col === b.col;
    default: {
      const _never: never = b;
      return _never;
    }
  }
}

function shakeMatches(shake: ShakeTarget | null, target: ShakeTarget) {
  if (!shake) return false;
  switch (target.kind) {
    case "home":
      return shake.kind === "home";
    case "foundation":
      return shake.kind === "foundation" && shake.suit === target.suit;
    case "tableau":
      return shake.kind === "tableau" && shake.col === target.col;
    default: {
      const _never: never = target;
      return _never;
    }
  }
}

export default function SolitaireGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const [deck, setDeck] = useState<SolitaireCard[]>([]);
  const [waste, setWaste] = useState<SolitaireCard[]>([]);
  const [foundations, setFoundations] = useState<SolitaireCard[][]>([
    [],
    [],
    [],
    [],
  ]);
  const [tableau, setTableau] = useState<SolitaireCard[][]>([[], [], [], []]);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [shake, setShake] = useState<ShakeTarget | null>(null);
  const [hintPulse, setHintPulse] = useState(false);
  const lastTap = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  const reset = () => {
    const fresh = dealFresh();
    setDeck(fresh.deck);
    setWaste([]);
    setFoundations([[], [], [], []]);
    setTableau(fresh.tableau);
    setSelected(null);
    setShake(null);
    onScoreChange?.(0);
  };

  useEffect(() => {
    const fresh = dealFresh();
    setDeck(fresh.deck);
    setWaste([]);
    setFoundations([[], [], [], []]);
    setTableau(fresh.tableau);
    setSelected(null);
    setShake(null);
    onScoreChange?.(0);
    // Fresh table whenever Keira / Luke switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const score = useMemo(
    () => foundations.reduce((n, pile) => n + pile.length, 0),
    [foundations],
  );

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const selectedCard = peekSelected(selected, waste, tableau);
  const won = foundations.every((pile) => pile.length === RANKS.length);

  const bumpShake = (target: ShakeTarget) => {
    setShake(target);
    window.setTimeout(() => setShake(null), 380);
  };

  const removeSelected = (sel: Selection) => {
    switch (sel.kind) {
      case "waste":
        setWaste((w) => w.slice(0, -1));
        break;
      case "tableau": {
        const tabs = tableau.map((col) => [...col]);
        tabs[sel.col] = tabs[sel.col].slice(0, -1);
        setTableau(tabs);
        break;
      }
      default: {
        const _never: never = sel;
        return _never;
      }
    }
  };

  const sendHome = (sel: Selection) => {
    const card = peekSelected(sel, waste, tableau);
    if (!card || !canHome(card, foundations)) {
      bumpShake({ kind: "home" });
      return false;
    }
    const next = foundations.map((pile) => [...pile]);
    next[card.suit] = [...next[card.suit], card];
    setFoundations(next);
    removeSelected(sel);
    setSelected(null);
    return true;
  };

  const selectOrToggle = (next: Selection) => {
    if (sameSelection(selected, next)) {
      setSelected(null);
      return;
    }
    setSelected(next);
  };

  const onCardTap = (next: Selection, key: string) => {
    if (paused) return;
    const now = Date.now();
    const isDouble = lastTap.current.key === key && now - lastTap.current.at < 420;
    lastTap.current = { key, at: now };
    if (isDouble) {
      sendHome(next);
      return;
    }
    if (selected && !sameSelection(selected, next) && next.kind === "tableau") {
      playToTableau(next.col);
      return;
    }
    selectOrToggle(next);
  };

  const playToTableau = (col: number) => {
    if (paused || !selected) return;
    if (selected.kind === "tableau" && selected.col === col) {
      setSelected(null);
      return;
    }
    const card = selectedCard;
    if (!card) return;
    const dest = tableau[col];
    const top = dest[dest.length - 1];
    if (!canStackOn(card, top)) {
      bumpShake({ kind: "tableau", col });
      return;
    }
    const tabs = tableau.map((pile) => [...pile]);
    switch (selected.kind) {
      case "waste":
        setWaste((w) => w.slice(0, -1));
        break;
      case "tableau":
        tabs[selected.col] = tabs[selected.col].slice(0, -1);
        break;
      default: {
        const _never: never = selected;
        return _never;
      }
    }
    tabs[col] = [...tabs[col], card];
    setTableau(tabs);
    setSelected(null);
  };

  const draw = () => {
    if (paused) return;
    if (deck.length === 0) {
      setDeck([...waste].reverse());
      setWaste([]);
      setSelected(null);
      return;
    }
    const next = [...deck];
    const card = next.pop()!;
    setDeck(next);
    setWaste((w) => [...w, card]);
    setSelected(null);
  };

  const legalFoundations = new Set<number>();
  const legalTableau = new Set<number>();
  if (selectedCard) {
    if (canHome(selectedCard, foundations)) legalFoundations.add(selectedCard.suit);
    tableau.forEach((col, i) => {
      if (selected?.kind === "tableau" && selected.col === i) return;
      if (canStackOn(selectedCard, col[col.length - 1])) legalTableau.add(i);
    });
  }

  const hint = () => {
    if (paused || won) return;
    const wasteTop = waste[waste.length - 1];
    if (wasteTop && canHome(wasteTop, foundations)) {
      setSelected({ kind: "waste" });
      setHintPulse(true);
      window.setTimeout(() => setHintPulse(false), 900);
      return;
    }
    for (let col = 0; col < 4; col++) {
      const top = tableau[col][tableau[col].length - 1];
      if (top && canHome(top, foundations)) {
        setSelected({ kind: "tableau", col });
        setHintPulse(true);
        window.setTimeout(() => setHintPulse(false), 900);
        return;
      }
    }
    if (wasteTop) {
      for (let col = 0; col < 4; col++) {
        if (canStackOn(wasteTop, tableau[col][tableau[col].length - 1])) {
          setSelected({ kind: "waste" });
          setHintPulse(true);
          window.setTimeout(() => setHintPulse(false), 900);
          return;
        }
      }
    }
    for (let from = 0; from < 4; from++) {
      const top = tableau[from][tableau[from].length - 1];
      if (!top) continue;
      for (let to = 0; to < 4; to++) {
        if (from === to) continue;
        if (canStackOn(top, tableau[to][tableau[to].length - 1])) {
          setSelected({ kind: "tableau", col: from });
          setHintPulse(true);
          window.setTimeout(() => setHintPulse(false), 900);
          return;
        }
      }
    }
    bumpShake({ kind: "home" });
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-md overflow-hidden rounded-[1.75rem] p-3 shadow-lg",
        paused && "pointer-events-none opacity-70",
      )}
    >
      <style>{`
        @keyframes solitaire-shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .solitaire-shake { animation: solitaire-shake 0.35s ease; }
      `}</style>
      <img
        src={feltSrc(profileId)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,10,30,0.18),rgba(20,10,30,0.28))]" />

      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-black text-white drop-shadow">
            {theme.gameNames.solitaire} · {score}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-12 rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-[var(--ink)]"
              onClick={hint}
            >
              Hint
            </button>
            <button
              type="button"
              className="min-h-12 rounded-2xl bg-[var(--accent)] px-3 py-2 text-sm font-black text-[var(--accent-fg)]"
              onClick={() => reset()}
            >
              New deal
            </button>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="button"
            className="min-h-[5.7rem] min-w-[4.05rem] active:scale-95"
            onClick={draw}
            aria-label={deck.length ? "Draw card" : "Flip the pile again"}
          >
            {deck.length ? (
              <CardBack profileId={profileId} count={deck.length} />
            ) : (
              <EmptySlot profileId={profileId} label="Flip again" />
            )}
          </button>
          <button
            type="button"
            className="min-h-[5.7rem] min-w-[4.05rem] active:scale-95"
            onClick={() => {
              if (!waste.length || paused) return;
              onCardTap({ kind: "waste" }, "waste");
            }}
            aria-label={waste.length ? "Waste pile" : "No drawn card yet"}
          >
            {waste.length ? (
              <CardFace
                card={waste[waste.length - 1]}
                profileId={profileId}
                selected={selected?.kind === "waste"}
              />
            ) : (
              <EmptySlot profileId={profileId} label="Draw" />
            )}
          </button>
          <button
            type="button"
            className={cn(
              "min-h-[5.7rem] flex-1 rounded-[1.2rem] bg-emerald-200 px-3 text-base font-black text-emerald-950 shadow-md active:scale-95",
              hintPulse && selectedCard && canHome(selectedCard, foundations) && "ring-4 ring-lime-300",
              shakeMatches(shake, { kind: "home" }) && "solitaire-shake",
            )}
            onClick={() => {
              if (selected) sendHome(selected);
            }}
          >
            Send home
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {foundations.map((pile, suit) => {
            const top = pile[pile.length - 1];
            const glow = legalFoundations.has(suit);
            return (
              <button
                key={suit}
                type="button"
                aria-label={`${suitName(profileId, suit)} home`}
                className={cn(
                  "flex min-h-[5.7rem] items-center justify-center active:scale-95",
                  glow && "rounded-[1.1rem] ring-4 ring-lime-300",
                  shakeMatches(shake, { kind: "foundation", suit }) &&
                    "solitaire-shake",
                )}
                onClick={() => {
                  if (paused) return;
                  if (selected) {
                    const card = selectedCard;
                    if (!card || card.suit !== suit || !canHome(card, foundations)) {
                      bumpShake({ kind: "foundation", suit });
                      return;
                    }
                    sendHome(selected);
                  }
                }}
              >
                {top ? (
                  <CardFace card={top} profileId={profileId} />
                ) : (
                  <EmptySlot
                    profileId={profileId}
                    suit={suit}
                    label={suitName(profileId, suit)}
                    glow={glow}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {tableau.map((col, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Stack ${i + 1}`}
              className={cn(
                "flex min-h-[8.5rem] flex-col items-center rounded-[1.2rem] bg-black/10 p-1 pt-2 active:scale-[0.98]",
                legalTableau.has(i) && "ring-4 ring-lime-300",
                selected?.kind === "tableau" && selected.col === i && "ring-4 ring-amber-300",
                shakeMatches(shake, { kind: "tableau", col: i }) &&
                  "solitaire-shake",
              )}
              onClick={() => {
                if (paused) return;
                if (selected && !(selected.kind === "tableau" && selected.col === i)) {
                  playToTableau(i);
                  return;
                }
                if (col.length) onCardTap({ kind: "tableau", col: i }, `tab-${i}`);
              }}
            >
              {col.length === 0 ? (
                <EmptySlot
                  profileId={profileId}
                  label="Drop"
                  glow={legalTableau.has(i)}
                />
              ) : (
                col.map((card, idx) => (
                  <div
                    key={card.id}
                    className={idx === 0 ? "" : "-mt-8"}
                    style={{ zIndex: idx }}
                  >
                    <CardFace
                      card={card}
                      profileId={profileId}
                      compact={idx < col.length - 1}
                      selected={
                        idx === col.length - 1 &&
                        selected?.kind === "tableau" &&
                        selected.col === i
                      }
                    />
                  </div>
                ))
              )}
            </button>
          ))}
        </div>

        {won ? (
          <div className="overflow-hidden rounded-[1.4rem] border-4 border-white shadow-lg">
            <img
              src={winSrc(profileId)}
              alt=""
              className="h-28 w-full object-cover"
            />
            <p className="bg-emerald-200 px-4 py-3 text-center text-lg font-black text-emerald-950">
              All home — you win!
            </p>
          </div>
        ) : (
          <p className="rounded-2xl bg-black/35 px-3 py-2 text-center text-sm font-semibold text-white">
            {hintCopy(profileId)}
          </p>
        )}
      </div>
    </div>
  );
}
