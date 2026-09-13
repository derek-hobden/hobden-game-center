"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Tile = { id: number; glyph: string; matched: boolean };

const KEIRA = ["🌸", "🐚", "🦋", "🎀", "🧁", "🎈", "💗", "🌟"];
const LUKE = ["🚗", "🐶", "🏀", "🛸", "🍕", "⚡", "🧊", "🎯"];

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function build(isKeira: boolean): Tile[] {
  const pool = (isKeira ? KEIRA : LUKE).slice(0, 8);
  return shuffle(
    pool.flatMap((glyph, i) => [
      { id: i * 2, glyph, matched: false },
      { id: i * 2 + 1, glyph, matched: false },
    ]),
  );
}

export default function MahjongGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const [tiles, setTiles] = useState(() => build(isKeira));
  const [picked, setPicked] = useState<number[]>([]);
  const [lock, setLock] = useState(false);

  const matched = useMemo(
    () => tiles.filter((t) => t.matched).length / 2,
    [tiles],
  );

  useEffect(() => {
    onScoreChange?.(matched);
  }, [matched, onScoreChange]);

  useEffect(() => {
    setTiles(build(isKeira));
    setPicked([]);
    setLock(false);
    onScoreChange?.(0);
  }, [isKeira, onScoreChange]);

  const reset = () => {
    setTiles(build(isKeira));
    setPicked([]);
    setLock(false);
    onScoreChange?.(0);
  };

  const onTap = (index: number) => {
    if (paused || lock) return;
    const tile = tiles[index];
    if (tile.matched || picked.includes(index)) return;
    const next = [...picked, index];
    setPicked(next);
    if (next.length < 2) return;
    setLock(true);
    const [a, b] = next;
    const ok = tiles[a].glyph === tiles[b].glyph;
    window.setTimeout(() => {
      if (ok) {
        setTiles((prev) =>
          prev.map((t, i) =>
            i === a || i === b ? { ...t, matched: true } : t,
          ),
        );
      }
      setPicked([]);
      setLock(false);
    }, ok ? 280 : 550);
  };

  const won = tiles.every((t) => t.matched);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex w-full items-center justify-between text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.mahjong} · {matched}/8
        </span>
        <button
          type="button"
          className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
          onClick={reset}
        >
          New board
        </button>
      </div>
      <div className="grid w-full grid-cols-4 gap-2">
        {tiles.map((tile, i) => (
          <button
            key={tile.id}
            type="button"
            disabled={tile.matched}
            className={cn(
              "flex aspect-square min-h-[72px] items-center justify-center rounded-2xl border-4 text-3xl shadow-md transition active:scale-95",
              tile.matched
                ? "border-transparent bg-transparent opacity-30"
                : picked.includes(i)
                  ? "border-amber-300 bg-white"
                  : isKeira
                    ? "border-pink-200 bg-pink-50"
                    : "border-sky-200 bg-sky-50",
            )}
            onClick={() => onTap(i)}
          >
            {tile.matched ? "" : tile.glyph}
          </button>
        ))}
      </div>
      {won ? (
        <p className="rounded-2xl bg-emerald-200 px-4 py-3 text-lg font-black text-emerald-900">
          All pairs matched! 🎉
        </p>
      ) : (
        <p className="text-sm text-[var(--ink)]/70">
          Tap two matching tiles — open board, super simple.
        </p>
      )}
    </div>
  );
}
