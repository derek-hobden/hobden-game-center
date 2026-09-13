"use client";

import { useMemo, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Card = { id: number; rank: number; suit: number; face: string };

const KEIRA_SUITS = ["🌸", "💎", "🌙", "⭐"];
const LUKE_SUITS = ["♠️", "♥️", "♦️", "♣️"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7"];

function buildDeck(isKeira: boolean): Card[] {
  const suits = isKeira ? KEIRA_SUITS : LUKE_SUITS;
  const cards: Card[] = [];
  let id = 0;
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      cards.push({
        id: id++,
        rank: r,
        suit: s,
        face: `${RANKS[r]}${suits[s]}`,
      });
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export default function SolitaireGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const [deck, setDeck] = useState(() => buildDeck(isKeira));
  const [waste, setWaste] = useState<Card[]>([]);
  const [foundations, setFoundations] = useState<Card[][]>([[], [], [], []]);
  const [tableau, setTableau] = useState<Card[][]>(() => {
    const d = buildDeck(isKeira);
    const tabs: Card[][] = [[], [], [], []];
    for (let i = 0; i < 4; i++) tabs[i].push(d.pop()!);
    setDeck(d);
    return tabs;
  });
  const [selected, setSelected] = useState<{
    from: "waste" | number;
  } | null>(null);

  const score = useMemo(
    () => foundations.reduce((n, f) => n + f.length, 0),
    [foundations],
  );

  const reset = () => {
    const d = buildDeck(isKeira);
    const tabs: Card[][] = [[], [], [], []];
    for (let i = 0; i < 4; i++) tabs[i].push(d.pop()!);
    setDeck(d);
    setWaste([]);
    setFoundations([[], [], [], []]);
    setTableau(tabs);
    setSelected(null);
    onScoreChange?.(0);
  };

  const draw = () => {
    if (paused) return;
    if (deck.length === 0) {
      setDeck([...waste].reverse());
      setWaste([]);
      return;
    }
    const next = [...deck];
    const card = next.pop()!;
    setDeck(next);
    setWaste((w) => [...w, card]);
    setSelected(null);
  };

  const tryFoundation = (card: Card, foundationsIn: Card[][]) => {
    const pile = foundationsIn[card.suit];
    const need = pile.length;
    if (card.rank === need) {
      const copy = foundationsIn.map((p) => [...p]);
      copy[card.suit] = [...copy[card.suit], card];
      return copy;
    }
    return null;
  };

  const playSelectedToFoundation = () => {
    if (paused || !selected) return;
    let card: Card | undefined;
    if (selected.from === "waste") card = waste[waste.length - 1];
    else card = tableau[selected.from][tableau[selected.from].length - 1];
    if (!card) return;
    const nextFound = tryFoundation(card, foundations);
    if (!nextFound) return;
    if (selected.from === "waste") setWaste((w) => w.slice(0, -1));
    else {
      const tabs = tableau.map((t) => [...t]);
      tabs[selected.from as number] = tabs[selected.from as number].slice(0, -1);
      setTableau(tabs);
    }
    setFoundations(nextFound);
    const n = nextFound.reduce((a, f) => a + f.length, 0);
    onScoreChange?.(n);
    setSelected(null);
  };

  const playToTableau = (col: number) => {
    if (paused || !selected) return;
    let card: Card | undefined;
    if (selected.from === "waste") card = waste[waste.length - 1];
    else {
      if (selected.from === col) {
        setSelected(null);
        return;
      }
      card = tableau[selected.from][tableau[selected.from].length - 1];
    }
    if (!card) return;
    const dest = tableau[col];
    const top = dest[dest.length - 1];
    const ok =
      !top ||
      (card.rank === top.rank - 1 && card.suit % 2 !== top.suit % 2);
    if (!ok) return;
    const tabs = tableau.map((t) => [...t]);
    if (selected.from === "waste") setWaste((w) => w.slice(0, -1));
    else tabs[selected.from as number] = tabs[selected.from as number].slice(0, -1);
    tabs[col] = [...tabs[col], card];
    setTableau(tabs);
    setSelected(null);
  };

  const won = foundations.every((f) => f.length === RANKS.length);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.solitaire} · {score}
        </span>
        <button
          type="button"
          className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
          onClick={reset}
        >
          New deal
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="flex h-20 w-16 items-center justify-center rounded-2xl border-4 border-white bg-[var(--accent)] text-2xl shadow-md active:scale-95"
          onClick={draw}
          aria-label="Draw card"
        >
          {deck.length ? "🂠" : "↺"}
        </button>
        <button
          type="button"
          className={cn(
            "flex h-20 min-w-16 flex-1 items-center justify-center rounded-2xl border-4 bg-white text-xl font-bold shadow-md",
            selected?.from === "waste" && "ring-4 ring-amber-300",
          )}
          onClick={() => {
            if (!waste.length || paused) return;
            setSelected({ from: "waste" });
          }}
        >
          {waste.length ? waste[waste.length - 1].face : "—"}
        </button>
        <button
          type="button"
          className="min-h-20 rounded-2xl bg-emerald-200 px-3 text-sm font-bold text-emerald-900 active:scale-95"
          onClick={playSelectedToFoundation}
        >
          To home ↑
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {foundations.map((f, i) => (
          <div
            key={i}
            className="flex h-16 items-center justify-center rounded-2xl border-4 border-dashed border-white/80 bg-white/40 text-lg font-bold"
          >
            {f.length ? f[f.length - 1].face : isKeira ? KEIRA_SUITS[i] : LUKE_SUITS[i]}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {tableau.map((col, i) => (
          <button
            key={i}
            type="button"
            className={cn(
              "flex min-h-24 flex-col items-center justify-end gap-1 rounded-2xl border-4 border-white/70 bg-[var(--surface)] p-2 shadow-md active:scale-95",
              selected?.from === i && "ring-4 ring-amber-300",
            )}
            onClick={() => {
              if (paused) return;
              if (selected) playToTableau(i);
              else if (col.length) setSelected({ from: i });
            }}
          >
            <span className="text-lg font-bold">
              {col.length ? col[col.length - 1].face : "·"}
            </span>
            <span className="text-[10px] font-semibold opacity-60">{col.length}</span>
          </button>
        ))}
      </div>

      {won ? (
        <p className="rounded-2xl bg-emerald-200 px-4 py-3 text-center text-lg font-black text-emerald-900">
          All home — you win! 🎉
        </p>
      ) : (
        <p className="text-center text-sm text-[var(--ink)]/70">
          Draw, tap a card, then Home or a column (down by 1, other color).
        </p>
      )}
    </div>
  );
}
