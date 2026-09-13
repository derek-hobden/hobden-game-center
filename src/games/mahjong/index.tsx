"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import {
  PAIR_COUNT,
  SLOTS,
  blockedCopy,
  hintCopy,
  kindLabel,
  kindsFor,
  missCopy,
  tableSrc,
  tileSrc,
  winSrc,
  type TileKind,
} from "./art";

type BoardTile = {
  slotId: number;
  kind: TileKind;
  matched: boolean;
};

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function pairKinds(profileId: GameProps["profileId"]): TileKind[] {
  const kinds = kindsFor(profileId);
  const pairs: TileKind[] = [];
  kinds.forEach((kind, index) => {
    const extra = index < 2 ? 2 : 1;
    for (let n = 0; n < extra; n++) pairs.push(kind);
  });
  return shuffle(pairs);
}

function openSlots(filled: Map<number, TileKind>): number[] {
  return SLOTS.filter((slot) => {
    if (filled.has(slot.id)) return false;
    const blocked = SLOTS.some(
      (other) => filled.has(other.id) && other.covers.includes(slot.id),
    );
    return !blocked;
  }).map((slot) => slot.id);
}

function dealBoard(profileId: GameProps["profileId"]): BoardTile[] {
  const pairs = pairKinds(profileId);
  const filled = new Map<number, TileKind>();

  for (const kind of pairs) {
    const open = openSlots(filled);
    if (open.length < 2) break;
    const picks = shuffle(open).slice(0, 2);
    filled.set(picks[0], kind);
    filled.set(picks[1], kind);
  }

  const leftovers = SLOTS.filter((slot) => !filled.has(slot.id));
  leftovers.forEach((slot, i) => {
    filled.set(slot.id, kindsFor(profileId)[i % 8]);
  });

  return SLOTS.map((slot) => ({
    slotId: slot.id,
    kind: filled.get(slot.id)!,
    matched: false,
  }));
}

function isFree(tiles: BoardTile[], slotId: number): boolean {
  const tile = tiles.find((t) => t.slotId === slotId);
  if (!tile || tile.matched) return false;
  return !SLOTS.some((slot) => {
    if (!slot.covers.includes(slotId)) return false;
    const cover = tiles.find((t) => t.slotId === slot.id);
    return Boolean(cover && !cover.matched);
  });
}

function findHint(tiles: BoardTile[]): [number, number] | null {
  const free = tiles.filter((t) => isFree(tiles, t.slotId));
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (free[i].kind === free[j].kind) {
        return [free[i].slotId, free[j].slotId];
      }
    }
  }
  return null;
}

export default function MahjongGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const [tiles, setTiles] = useState<BoardTile[]>(() => dealBoard(profileId));
  const [picked, setPicked] = useState<number[]>([]);
  const [lock, setLock] = useState(false);
  const [hint, setHint] = useState<number[] | null>(null);
  const [message, setMessage] = useState(hintCopy(profileId));
  const [shakeId, setShakeId] = useState<number | null>(null);
  const [matchKind, setMatchKind] = useState<TileKind | null>(null);

  const matchedPairs = useMemo(
    () => tiles.filter((t) => t.matched).length / 2,
    [tiles],
  );
  const won = tiles.length > 0 && tiles.every((t) => t.matched);

  useEffect(() => {
    onScoreChange?.(matchedPairs);
  }, [matchedPairs, onScoreChange]);

  useEffect(() => {
    setTiles(dealBoard(profileId));
    setPicked([]);
    setLock(false);
    setHint(null);
    setMatchKind(null);
    setMessage(hintCopy(profileId));
    onScoreChange?.(0);
  }, [profileId, onScoreChange]);

  const reset = () => {
    setTiles(dealBoard(profileId));
    setPicked([]);
    setLock(false);
    setHint(null);
    setMatchKind(null);
    setMessage(hintCopy(profileId));
    onScoreChange?.(0);
  };

  const showHint = () => {
    if (paused || won) return;
    const pair = findHint(tiles);
    if (!pair) {
      setMessage("No free pair — tap New board.");
      return;
    }
    setHint(pair);
    setMessage("These two match! Tap them.");
  };

  const onTap = (slotId: number) => {
    if (paused || lock || won) return;
    const tile = tiles.find((t) => t.slotId === slotId);
    if (!tile || tile.matched) return;

    if (!isFree(tiles, slotId)) {
      setShakeId(slotId);
      setMessage(blockedCopy(profileId));
      window.setTimeout(() => setShakeId(null), 420);
      return;
    }

    if (picked.includes(slotId)) {
      setPicked(picked.filter((id) => id !== slotId));
      return;
    }

    const next = [...picked, slotId];
    setPicked(next);
    setHint(null);
    if (next.length < 2) {
      setMessage("Nice — now find its twin.");
      return;
    }

    setLock(true);
    const a = tiles.find((t) => t.slotId === next[0])!;
    const b = tiles.find((t) => t.slotId === next[1])!;
    const ok = a.kind === b.kind;

    window.setTimeout(() => {
      if (ok) {
        setTiles((prev) =>
          prev.map((t) =>
            t.slotId === a.slotId || t.slotId === b.slotId
              ? { ...t, matched: true }
              : t,
          ),
        );
        setMatchKind(a.kind);
        setMessage(`Match! ${kindLabel(a.kind)}`);
        window.setTimeout(() => setMatchKind(null), 900);
      } else {
        setMessage(missCopy(profileId));
      }
      setPicked([]);
      setLock(false);
    }, ok ? 260 : 620);
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex w-full flex-wrap items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.mahjong} · {matchedPairs}/{PAIR_COUNT}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-white/80 px-4 py-3 text-base font-bold shadow-md active:scale-95"
            onClick={showHint}
          >
            Hint
          </button>
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 text-base font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
            onClick={reset}
          >
            New board
          </button>
        </div>
      </div>

      {matchKind ? (
        <p className="flex items-center gap-2 animate-bounce text-xl font-black text-[var(--ink)]">
          <img
            src={tileSrc(matchKind)}
            alt=""
            className="h-8 w-8 rounded-md object-cover"
            draggable={false}
          />
          Match! {kindLabel(matchKind)}
        </p>
      ) : (
        <p className="min-h-6 px-1 text-center text-sm font-medium text-[var(--ink)]/80">
          {won ? "You cleared the table!" : message}
        </p>
      )}

      <div
        className="relative w-full overflow-visible rounded-[1.6rem] border-4 border-white/70 shadow-lg"
        style={{ aspectRatio: "1 / 1.05" }}
      >
        <img
          src={tableSrc(profileId)}
          alt=""
          className="absolute inset-0 h-full w-full rounded-[1.35rem] object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-[0.45rem] p-3 sm:p-4">
          {SLOTS.filter((slot) => slot.layer === 0).map((slot) => {
            const tile = tiles.find((t) => t.slotId === slot.id);
            if (!tile) return null;
            return (
              <TileButton
                key={slot.id}
                tile={tile}
                free={isFree(tiles, slot.id)}
                selected={picked.includes(slot.id)}
                hinted={Boolean(hint?.includes(slot.id))}
                shaking={shakeId === slot.id}
                paused={paused}
                onTap={() => onTap(slot.id)}
              />
            );
          })}
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-4 grid-rows-4 gap-[0.45rem] p-3 sm:p-4">
          {SLOTS.filter((slot) => slot.layer === 1).map((slot) => {
            const tile = tiles.find((t) => t.slotId === slot.id);
            if (!tile || tile.matched) return null;
            return (
              <div
                key={slot.id}
                className="pointer-events-auto z-20"
                style={{
                  gridColumn: slot.col + 1,
                  gridRow: slot.row + 1,
                  transform: "translate(12px, -16px)",
                }}
              >
                <TileButton
                  tile={tile}
                  free={isFree(tiles, slot.id)}
                  selected={picked.includes(slot.id)}
                  hinted={Boolean(hint?.includes(slot.id))}
                  shaking={shakeId === slot.id}
                  paused={paused}
                  stacked
                  onTap={() => onTap(slot.id)}
                />
              </div>
            );
          })}
        </div>
        {won ? (
          <div className="absolute inset-0 flex flex-col items-center justify-end bg-black/25 p-4">
            <img
              src={winSrc(profileId)}
              alt=""
              className="mb-3 w-full max-h-36 rounded-2xl object-cover shadow-lg"
              draggable={false}
            />
            <p className="rounded-2xl bg-emerald-200 px-4 py-3 text-center text-lg font-black text-emerald-900">
              All pairs matched!
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TileButton({
  tile,
  free,
  selected,
  hinted,
  shaking,
  paused,
  stacked,
  onTap,
}: {
  tile: BoardTile;
  free: boolean;
  selected: boolean;
  hinted: boolean;
  shaking: boolean;
  paused: boolean;
  stacked?: boolean;
  onTap: () => void;
}) {
  if (tile.matched && !stacked) {
    return <div aria-hidden className="h-full w-full" />;
  }

  return (
    <button
      type="button"
      disabled={tile.matched || paused}
      aria-label={`${kindLabel(tile.kind)} tile${free ? "" : ", buried"}`}
      className={cn(
        "relative h-full min-h-[64px] w-full overflow-hidden rounded-2xl border-[3px] shadow-[4px_6px_0_rgba(40,20,50,0.22)] transition active:scale-95",
        selected
          ? "border-amber-300 ring-4 ring-amber-200"
          : hinted
            ? "border-lime-300 ring-4 ring-lime-200"
            : stacked
              ? "border-amber-100"
              : "border-white",
        !free && "brightness-90",
        shaking && "animate-pulse",
        stacked &&
          "shadow-[8px_12px_0_rgba(40,20,50,0.32)] ring-2 ring-white/80",
      )}
      onClick={onTap}
    >
      <img
        src={tileSrc(tile.kind)}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    </button>
  );
}
