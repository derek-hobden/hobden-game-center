export type Cell = {
  mine: boolean;
  open: boolean;
  flagged: boolean;
  adj: number;
};

export const ROWS = 6;
export const COLS = 6;
export const MINES = 4;

export function buildBoard(safeR?: number, safeC?: number): Cell[][] {
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

/** Copy user flags from a pre-start board onto a freshly generated board. */
export function preserveFlags(from: Cell[][], to: Cell[][]): Cell[][] {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (from[r][c].flagged) {
        to[r][c].flagged = true;
      }
    }
  }
  return to;
}

export type OpenPrep = {
  working: Cell[][];
  markStarted: boolean;
};

/**
 * Prepare board state for opening (r, c). Returns null when the click cannot
 * reveal (already open or flagged on the current board). Regenerates mines only
 * when the game has not started and the target cell is openable.
 */
export function prepareOpen(
  prev: Cell[][],
  r: number,
  c: number,
  gameStarted: boolean,
): OpenPrep | null {
  if (prev[r][c].open || prev[r][c].flagged) return null;

  let working = prev;
  let markStarted = false;
  if (!gameStarted) {
    working = preserveFlags(prev, buildBoard(r, c));
    markStarted = true;
  }

  const cell = working[r][c];
  if (cell.open || cell.flagged) return null;

  return { working, markStarted };
}

export function isSafeFirstClick(board: Cell[][], r: number, c: number): boolean {
  if (board[r][c].mine) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
      if (board[rr][cc].mine) return false;
    }
  }
  return true;
}
