"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES } from "@/lib/profiles";
import { cn } from "@/lib/utils";

type Cell = {
  mine: boolean;
  open: boolean;
  flagged: boolean;
  adj: number;
};

const ROWS = 8;
const COLS = 8;
const MINES = 10;

function buildBoard(): Cell[][] {
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

export default function MinesweeperGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const [board, setBoard] = useState<Cell[][]>(() => buildBoard());
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const theme = PROFILES[profileId];

  const flags = useMemo(
    () => board.flat().filter((c) => c.flagged).length,
    [board],
  );
  const opened = useMemo(
    () => board.flat().filter((c) => c.open).length,
    [board],
  );

  useEffect(() => {
    onScoreChange?.(opened);
  }, [opened, onScoreChange]);

  const reset = () => {
    setBoard(buildBoard());
    setStatus("playing");
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
      const cell = prev[r][c];
      if (cell.open || cell.flagged) return prev;
      if (cell.mine) {
        const lost = clone(prev);
        lost.forEach((row) =>
          row.forEach((x) => {
            if (x.mine) x.open = true;
          }),
        );
        setStatus("lost");
        return lost;
      }
      const next = flood(r, c, prev);
      const safeLeft = next.flat().filter((x) => !x.mine && !x.open).length;
      if (safeLeft === 0) setStatus("won");
      return next;
    });
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
  };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full max-w-md items-center justify-between text-lg font-bold text-[var(--ink)]">
        <span>
          {theme.gameNames.minesweeper} · 🚩 {flags}/{MINES}
        </span>
        <button
          type="button"
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-[var(--accent-fg)]"
          onClick={reset}
        >
          New map
        </button>
      </div>

      <div
        className="grid gap-1 rounded-3xl border-4 border-white/70 bg-[var(--surface)] p-2 shadow-lg"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {board.map((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              disabled={paused}
              aria-label={
                cell.open
                  ? cell.mine
                    ? "Mine"
                    : `Open ${cell.adj}`
                  : cell.flagged
                    ? "Flagged"
                    : "Hidden"
              }
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition active:scale-95 sm:h-11 sm:w-11",
                cell.open
                  ? cell.mine
                    ? "bg-rose-400 text-white"
                    : "bg-[var(--surface-2)] text-[var(--ink)]"
                  : "bg-[var(--accent)]/80 text-[var(--accent-fg)] shadow-sm",
              )}
              onClick={() => openCell(r, c)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(r, c);
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "touch") {
                  const timer = window.setTimeout(() => toggleFlag(r, c), 420);
                  const clear = () => window.clearTimeout(timer);
                  e.currentTarget.addEventListener("pointerup", clear, {
                    once: true,
                  });
                  e.currentTarget.addEventListener("pointerleave", clear, {
                    once: true,
                  });
                }
              }}
            >
              {cell.open
                ? cell.mine
                  ? "💥"
                  : cell.adj || ""
                : cell.flagged
                  ? "🚩"
                  : ""}
            </button>
          )),
        )}
      </div>

      <p className="text-center text-sm text-[var(--ink)]/70">
        Tap to open · long-press (or right-click) to flag
      </p>
      {status === "won" ? (
        <p className="text-lg font-bold text-emerald-700">You cleared the map!</p>
      ) : null}
      {status === "lost" ? (
        <p className="text-lg font-bold text-rose-700">Boom — try a new map.</p>
      ) : null}
    </div>
  );
}
