/** Pure block-stacking rules (no React / canvas). */
import {
  PIECE_KINDS,
  SHAPES,
  TETRIS_COLS as COLS,
  TETRIS_ROWS as ROWS,
  type PieceKind,
} from "./theme";

export type Cell = PieceKind | 0;
export type Board = Cell[][];
export type Piece = {
  kind: PieceKind;
  shape: number[][];
  x: number;
  y: number;
};

export const LINES_PER_LEVEL = 5;
export const LINE_POINTS = [0, 10, 30, 60, 100];

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

export function rotateCW(shape: number[][]) {
  const n = shape.length;
  return shape.map((row, r) => row.map((_, c) => shape[n - 1 - c][r]));
}

export function spawnPiece(kind: PieceKind): Piece {
  const shape = SHAPES[kind].map((r) => [...r]);
  const topEmpty = shape.findIndex((row) => row.some(Boolean));
  return {
    kind,
    shape,
    x: Math.floor((COLS - shape.length) / 2),
    y: -topEmpty,
  };
}

export function collides(
  board: Board,
  p: Piece,
  ox = 0,
  oy = 0,
  shape = p.shape,
) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const x = p.x + c + ox;
      const y = p.y + r + oy;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

/** Rotate with generous wall/floor kicks (kid-friendly). Returns success. */
export function tryRotate(board: Board, p: Piece): boolean {
  if (p.kind === "o") return true;
  const next = rotateCW(p.shape);
  const kicks: [number, number][] = [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [-2, 0],
    [2, 0],
    [-1, -1],
    [1, -1],
  ];
  for (const [kx, ky] of kicks) {
    if (!collides(board, p, kx, ky, next)) {
      p.shape = next;
      p.x += kx;
      p.y += ky;
      return true;
    }
  }
  return false;
}

export function dropDistance(board: Board, p: Piece) {
  let d = 0;
  while (!collides(board, p, 0, d + 1)) d += 1;
  return d;
}

/** Writes the piece into the board. Returns false if any block is above the top. */
export function lockPiece(board: Board, p: Piece): boolean {
  let ok = true;
  p.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (!v) return;
      const y = p.y + r;
      if (y < 0) {
        ok = false;
        return;
      }
      board[y][p.x + c] = p.kind;
    }),
  );
  return ok;
}

export function fullRows(board: Board) {
  const rows: number[] = [];
  board.forEach((row, i) => {
    if (row.every((v) => v !== 0)) rows.push(i);
  });
  return rows;
}

/**
 * Removes `rows` and returns the new board plus, for each new row index, how
 * many cells it fell (for the settle animation).
 */
export function removeRows(board: Board, rows: number[]) {
  const kept: { row: Cell[]; from: number }[] = [];
  board.forEach((row, i) => {
    if (!rows.includes(i)) kept.push({ row, from: i });
  });
  const pad = ROWS - kept.length;
  const next: Board = [];
  const fell: number[] = [];
  for (let i = 0; i < pad; i++) {
    next.push(Array<Cell>(COLS).fill(0));
    fell.push(0);
  }
  kept.forEach((k, i) => {
    next.push(k.row);
    fell.push(pad + i - k.from);
  });
  return { board: next, fell };
}

export function levelFor(lines: number) {
  return 1 + Math.floor(lines / LINES_PER_LEVEL);
}

/** Gentle ramp: 1s per row at level 1, a bit quicker each level. */
export function gravityMs(level: number) {
  return Math.max(140, Math.round(1000 * Math.pow(0.84, level - 1)));
}

export function newBag(rand = Math.random): PieceKind[] {
  const bag = [...PIECE_KINDS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
