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

const ROWS = 6;
const COLS = 6;
const MINES = 5;

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
    if (safeR != null && safeC != null && r === safeR && c === safeC) continue;
    // keep first-click neighborhood safer
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

export default function MinesweeperGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const [board, setBoard] = useState<Cell[][]>(() => buildBoard());
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [flagMode, setFlagMode] = useState(false);
  const [started, setStarted] = useState(false);
  const theme = PROFILES[profileId];
  const isKeira = profileId === "keira";
  const hazard = isKeira ? "🌵" : "💣";
  const flag = isKeira ? "🌸" : "🚩";

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

  const onCellPress = (r: number, c: number) => {
    if (flagMode) toggleFlag(r, c);
    else openCell(r, c);
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-2 text-lg font-black text-[var(--ink)]">
        <span>
          {theme.gameNames.minesweeper} · {flag} {flags}/{MINES}
        </span>
        <button
          type="button"
          className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 text-base font-bold text-[var(--accent-fg)] shadow-md active:scale-95"
          onClick={reset}
        >
          New map
        </button>
      </div>

      <button
        type="button"
        aria-pressed={flagMode}
        className={cn(
          "min-h-14 w-full max-w-md rounded-2xl border-4 px-4 py-3 text-base font-bold shadow-sm active:scale-[0.99]",
          flagMode
            ? "border-amber-300 bg-amber-200 text-amber-950"
            : "border-white/70 bg-white/70 text-[var(--ink)]",
        )}
        onClick={() => setFlagMode((v) => !v)}
      >
        {flagMode
          ? `${flag} Flag mode ON — tap tiles to mark`
          : "Open mode — tap Flag mode to mark danger"}
      </button>

      <div
        className="grid gap-2 rounded-3xl border-4 border-white/70 bg-[var(--surface)] p-3 shadow-lg"
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
                    ? "Hazard"
                    : `Open ${cell.adj}`
                  : cell.flagged
                    ? "Flagged"
                    : "Hidden"
              }
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-black transition active:scale-95 touch-manipulation sm:h-16 sm:w-16 sm:text-xl",
                cell.open
                  ? cell.mine
                    ? "bg-rose-400 text-white"
                    : "bg-[var(--surface-2)] text-[var(--ink)]"
                  : "bg-[var(--accent)]/85 text-[var(--accent-fg)] shadow-md",
              )}
              onClick={() => onCellPress(r, c)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(r, c);
              }}
            >
              {cell.open
                ? cell.mine
                  ? hazard
                  : cell.adj || ""
                : cell.flagged
                  ? flag
                  : ""}
            </button>
          )),
        )}
      </div>

      <p className="text-center text-sm font-medium text-[var(--ink)]/70">
        First tap is always safe. Big tiles, only {MINES} surprises.
      </p>
      {status === "won" ? (
        <p className="rounded-2xl bg-emerald-200 px-4 py-3 text-lg font-black text-emerald-900">
          You found all the safe spots! 🎉
        </p>
      ) : null}
      {status === "lost" ? (
        <p className="rounded-2xl bg-rose-200 px-4 py-3 text-lg font-black text-rose-900">
          Oops — try a new map.
        </p>
      ) : null}
    </div>
  );
}
