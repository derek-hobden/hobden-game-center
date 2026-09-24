export type Cell = {
  mine: boolean;
  open: boolean;
  flagged: boolean;
  adj: number;
};

export type Difficulty = "easy" | "medium" | "hard";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export type BoardConfig = {
  rows: number;
  cols: number;
  mines: number;
};

/** Portrait layouts (rows ≥ cols). Landscape screens swap rows and cols. */
export const CONFIGS: Record<Difficulty, BoardConfig> = {
  easy: { rows: 8, cols: 6, mines: 6 },
  medium: { rows: 10, cols: 8, mines: 12 },
  hard: { rows: 12, cols: 9, mines: 18 },
};

/** Default (Easy) dimensions, kept for callers/tests that use the plain API. */
export const ROWS = CONFIGS.easy.rows;
export const COLS = CONFIGS.easy.cols;
export const MINES = CONFIGS.easy.mines;

const DEFAULT_CONFIG: BoardConfig = CONFIGS.easy;

export function configFor(
  difficulty: Difficulty,
  landscape = false,
): BoardConfig {
  const base = CONFIGS[difficulty];
  return landscape
    ? { rows: base.cols, cols: base.rows, mines: base.mines }
    : { ...base };
}

export function dims(board: Cell[][]) {
  return { rows: board.length, cols: board[0]?.length ?? 0 };
}

export function neighbors(
  r: number,
  c: number,
  rows: number,
  cols: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      out.push([rr, cc]);
    }
  }
  return out;
}

export function emptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      open: false,
      flagged: false,
      adj: 0,
    })),
  );
}

export function buildBoard(
  safeR?: number,
  safeC?: number,
  config: BoardConfig = DEFAULT_CONFIG,
  random: () => number = Math.random,
): Cell[][] {
  const { rows, cols } = config;
  const board = emptyBoard(rows, cols);

  const hasSafe = safeR != null && safeC != null;
  const inSafeZone = (r: number, c: number) =>
    hasSafe && Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1;

  // Never ask for more mines than there are free squares.
  let free = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (!inSafeZone(r, c)) free += 1;
  }
  const mines = Math.min(config.mines, free);

  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(random() * rows);
    const c = Math.floor(random() * cols);
    if (board[r][c].mine || inSafeZone(r, c)) continue;
    board[r][c].mine = true;
    placed += 1;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      board[r][c].adj = neighbors(r, c, rows, cols).filter(
        ([rr, cc]) => board[rr][cc].mine,
      ).length;
    }
  }
  return board;
}

/** Copy user flags from a pre-start board onto a freshly generated board. */
export function preserveFlags(from: Cell[][], to: Cell[][]): Cell[][] {
  const rows = Math.min(from.length, to.length);
  for (let r = 0; r < rows; r++) {
    const cols = Math.min(from[r].length, to[r].length);
    for (let c = 0; c < cols; c++) {
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
  mines: number = MINES,
): OpenPrep | null {
  if (prev[r][c].open || prev[r][c].flagged) return null;

  let working = prev;
  let markStarted = false;
  if (!gameStarted) {
    const { rows, cols } = dims(prev);
    working = preserveFlags(prev, buildBoard(r, c, { rows, cols, mines }));
    markStarted = true;
  }

  const cell = working[r][c];
  if (cell.open || cell.flagged) return null;

  return { working, markStarted };
}

export function isSafeFirstClick(board: Cell[][], r: number, c: number): boolean {
  if (board[r][c].mine) return false;
  const { rows, cols } = dims(board);
  return neighbors(r, c, rows, cols).every(([rr, cc]) => !board[rr][cc].mine);
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

export type FloodResult = {
  board: Cell[][];
  /** "r-c" → ring distance from the tapped square (for cascade animation). */
  order: Record<string, number>;
  opened: number;
};

/** Open (r, c) and flood-fill through empty squares (breadth first). */
export function floodOpen(src: Cell[][], r0: number, c0: number): FloodResult {
  const board = cloneBoard(src);
  const { rows, cols } = dims(board);
  const order: Record<string, number> = {};
  const queue: [number, number, number][] = [[r0, c0, 0]];
  let opened = 0;
  while (queue.length) {
    const [r, c, d] = queue.shift()!;
    const cell = board[r][c];
    if (cell.open || cell.flagged) continue;
    cell.open = true;
    order[`${r}-${c}`] = d;
    if (!cell.mine) opened += 1;
    if (cell.adj !== 0 || cell.mine) continue;
    for (const [rr, cc] of neighbors(r, c, rows, cols)) {
      const n = board[rr][cc];
      if (!n.open && !n.mine && !n.flagged) queue.push([rr, cc, d + 1]);
    }
  }
  return { board, order, opened };
}

export function safeLeft(board: Cell[][]): number {
  let n = 0;
  for (const row of board) for (const c of row) if (!c.mine && !c.open) n += 1;
  return n;
}

export function countFlags(board: Cell[][]): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c.flagged) n += 1;
  return n;
}

export function countOpenSafe(board: Cell[][]): number {
  let n = 0;
  for (const row of board) for (const c of row) if (c.open && !c.mine) n += 1;
  return n;
}
