"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { adjTone, minesweeperArt } from "./art";

type Cell = {
  mine: boolean;
  open: boolean;
  flagged: boolean;
  adj: number;
};

type Status = "playing" | "won" | "lost";

const ROWS = 6;
const COLS = 6;
const MINES = 4;

function buildBoard(safeR?: number, safeC?: number): Cell[][] {
  const board: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({
      mine: false,
      open: false,
      flagged: false,
      adj: 0,
    })),
  );

  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random() * ROWS);
    const c = Math.floor(Math.random() * COLS);
    if (board[r][c].mine) continue;
    if (
      safeR != null &&
      safeC != null &&
      Math.abs(r - safeR) <= 1 &&
      Math.abs(c - safeC) <= 1
    ) {
      continue;
    }
    board[r][c].mine = true;
    placed += 1;
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c].mine) continue;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
          if (board[rr][cc].mine) n += 1;
        }
      }
      board[r][c].adj = n;
    }
  }
  return board;
}

function clone(board: Cell[][]) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function statusCopy(status: Status, win: string, lose: string) {
  switch (status) {
    case "playing":
      return null;
    case "won":
      return win;
    case "lost":
      return lose;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default function MinesweeperGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const [board, setBoard] = useState<Cell[][]>(() => buildBoard());
  const [status, setStatus] = useState<Status>("playing");
  const [flagMode, setFlagMode] = useState(false);
  const [started, setStarted] = useState(false);
  const [pop, setPop] = useState<string | null>(null);
  const theme = PROFILES[profileId];
  const art = minesweeperArt(profileId);

  const flags = useMemo(
    () => board.flat().filter((c) => c.flagged).length,
    [board],
  );
  const opened = useMemo(
    () => board.flat().filter((c) => c.open && !c.mine).length,
    [board],
  );

  useEffect(() => {
    onScoreChange?.(opened);
  }, [opened, onScoreChange]);

  const reset = () => {
    setBoard(buildBoard());
    setStatus("playing");
    setStarted(false);
    setFlagMode(false);
    setPop(null);
    onScoreChange?.(0);
  };

  const flood = useCallback((startR: number, startC: number, src: Cell[][]) => {
    const next = clone(src);
    const stack: [number, number][] = [[startR, startC]];
    while (stack.length) {
      const [r, c] = stack.pop()!;
      const cell = next[r][c];
      if (cell.open || cell.flagged) continue;
      cell.open = true;
      if (cell.adj !== 0 || cell.mine) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
          if (!next[rr][cc].open && !next[rr][cc].mine) stack.push([rr, cc]);
        }
      }
    }
    return next;
  }, []);

  const openCell = (r: number, c: number) => {
    if (paused || status !== "playing") return;
    setBoard((prev) => {
      let working = prev;
      if (!started) {
        working = buildBoard(r, c);
        setStarted(true);
      }
      const cell = working[r][c];
      if (cell.open || cell.flagged) return working === prev ? prev : working;
      if (cell.mine) {
        const lost = clone(working);
        lost.forEach((row) =>
          row.forEach((x) => {
            if (x.mine) x.open = true;
          }),
        );
        setStatus("lost");
        return lost;
      }
      const next = flood(r, c, working);
      const safeLeft = next.flat().filter((x) => !x.mine && !x.open).length;
      if (safeLeft === 0) setStatus("won");
      return next;
    });
    setPop(`${r}-${c}`);
  };

  const toggleFlag = (r: number, c: number) => {
    if (paused || status !== "playing") return;
    setBoard((prev) => {
      const next = clone(prev);
      const cell = next[r][c];
      if (cell.open) return prev;
      cell.flagged = !cell.flagged;
      return next;
    });
    setPop(`${r}-${c}`);
  };

  const onCellPress = (r: number, c: number) => {
    if (flagMode) toggleFlag(r, c);
    else openCell(r, c);
  };

  const banner = statusCopy(status, art.win, art.lose);

  return (
    <div className="relative flex w-full flex-col items-center gap-3">
      <div
        className="absolute inset-0 -z-10 overflow-hidden rounded-[1.75rem] opacity-70"
        aria-hidden
      >
        <img
          src={art.bg}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex w-full max-w-md items-center gap-3 rounded-3xl bg-white/80 px-3 py-2 shadow-sm backdrop-blur-sm">
        <img
          src={art.card}
          alt=""
          className="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black text-[var(--ink)]">
            {theme.gameNames.minesweeper}
          </p>
          <p className="flex items-center gap-1 text-sm font-bold text-[var(--ink)]/75">
            <img src={art.flag} alt="" className="h-6 w-6 object-contain" />
            {flags}/{MINES} {art.counterWord}
          </p>
        </div>
        <button
          type="button"
          className="min-h-12 shrink-0 rounded-2xl bg-[var(--accent)] px-3 py-3 text-sm font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={reset}
        >
          New map
        </button>
      </div>

      <div className="grid w-full max-w-md grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={!flagMode}
          className={cn(
            "flex min-h-14 items-center justify-center gap-2 rounded-2xl border-4 px-3 py-2 text-base font-black shadow-sm active:scale-[0.99]",
            !flagMode
              ? "border-emerald-300 bg-emerald-100 text-emerald-950"
              : "border-white/70 bg-white/80 text-[var(--ink)]",
          )}
          onClick={() => setFlagMode(false)}
        >
          <img src={art.open} alt="" className="h-8 w-8 rounded-md object-cover" />
          {art.peekLabel}
        </button>
        <button
          type="button"
          aria-pressed={flagMode}
          className={cn(
            "flex min-h-14 items-center justify-center gap-2 rounded-2xl border-4 px-3 py-2 text-base font-black shadow-sm active:scale-[0.99]",
            flagMode
              ? "border-amber-300 bg-amber-200 text-amber-950"
              : "border-white/70 bg-white/80 text-[var(--ink)]",
          )}
          onClick={() => setFlagMode(true)}
        >
          <img src={art.flag} alt="" className="h-8 w-8 object-contain" />
          {art.markLabel}
        </button>
      </div>
      <p className="text-center text-sm font-semibold text-[var(--ink)]/80">
        {flagMode ? art.markHint : art.peekHint}
      </p>

      <div
        className="grid w-full max-w-md gap-1.5 rounded-3xl border-4 border-white/70 bg-white/50 p-2 shadow-lg backdrop-blur-[2px] sm:gap-2 sm:p-3"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r}-${c}`;
            const label = cell.open
              ? cell.mine
                ? "Hazard"
                : `Open ${cell.adj}`
              : cell.flagged
                ? "Flagged"
                : "Hidden";
            return (
              <button
                key={key}
                type="button"
                disabled={paused}
                aria-label={label}
                className={cn(
                  "relative aspect-square min-h-12 overflow-hidden rounded-xl shadow-md transition touch-manipulation active:scale-95 sm:rounded-2xl",
                  pop === key ? "scale-105" : "",
                  cell.open && cell.mine ? "ring-4 ring-rose-300" : "",
                  !cell.open && !cell.flagged ? "ring-2 ring-white/70" : "",
                )}
                onClick={() => onCellPress(r, c)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleFlag(r, c);
                }}
              >
                <img
                  src={
                    cell.open
                      ? cell.mine
                        ? art.hazard
                        : art.open
                      : art.hidden
                  }
                  alt=""
                  className={cn(
                    "h-full w-full object-cover",
                    cell.open && !cell.mine ? "opacity-90" : "",
                  )}
                />
                {cell.flagged && !cell.open ? (
                  <img
                    src={art.flag}
                    alt=""
                    className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain drop-shadow-md"
                  />
                ) : null}
                {cell.open && !cell.mine && cell.adj > 0 ? (
                  <span
                    className={cn(
                      "absolute inset-0 flex items-center justify-center text-2xl font-black drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] sm:text-3xl",
                      adjTone(cell.adj),
                    )}
                  >
                    {cell.adj}
                  </span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>

      <p className="text-center text-sm font-medium text-[var(--ink)]/70">
        First tap is always safe. Only {MINES} surprises.
      </p>

      {banner ? (
        <div
          className={cn(
            "flex w-full max-w-md flex-col items-center gap-3 rounded-3xl px-4 py-4 text-center shadow-lg",
            status === "won"
              ? "bg-emerald-100 text-emerald-950"
              : "bg-rose-100 text-rose-950",
          )}
        >
          <img
            src={status === "won" ? art.card : art.hazard}
            alt=""
            className="h-20 w-20 rounded-2xl object-cover"
          />
          <p className="text-lg font-black">{banner}</p>
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-5 py-3 text-base font-black text-[var(--accent-fg)] shadow-md active:scale-95"
            onClick={reset}
          >
            Play again
          </button>
        </div>
      ) : null}
    </div>
  );
}
