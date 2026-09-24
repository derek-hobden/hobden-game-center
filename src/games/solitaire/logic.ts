/**
 * Pure rules + solver for the kids' solitaire (28 cards: ranks 1–7 in four
 * suits, four face-up tableau columns, draw-one stock with unlimited passes).
 * No React / path-alias imports so `node --experimental-strip-types` can test it.
 */

export const RANK_COUNT = 7;
export const SUIT_COUNT = 4;
export const COLUMN_COUNT = 4;

export type Card = { id: number; rank: number; suit: number };
export type Mode = "easy" | "tricky";

export type Board = {
  stock: Card[]; // face down, last = top
  waste: Card[]; // face up, last = top
  foundations: Card[][]; // index = suit
  tableau: Card[][];
};

export type SolverMove =
  | { kind: "talonHome"; cardId: number }
  | { kind: "talonTab"; cardId: number; to: number }
  | { kind: "tabHome"; from: number }
  | { kind: "tabTab"; from: number; index: number; to: number };

/** Two "teams" alternate in tricky mode (like red/black). */
export function team(suit: number) {
  return suit % 2;
}

export function canStack(card: Card, top: Card | undefined, mode: Mode) {
  if (!top) return true;
  if (card.rank !== top.rank - 1) return false;
  return mode === "easy" || team(card.suit) !== team(top.suit);
}

export function canHome(card: Card, foundations: Card[][]) {
  return card.rank === foundations[card.suit].length;
}

/** Cards from `index` to the top form a movable run. */
export function isRun(col: Card[], index: number, mode: Mode) {
  if (index < 0 || index >= col.length) return false;
  for (let i = index + 1; i < col.length; i++) {
    if (!canStack(col[i], col[i - 1], mode)) return false;
  }
  return true;
}

export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (let suit = 0; suit < SUIT_COUNT; suit++) {
    for (let rank = 0; rank < RANK_COUNT; rank++) {
      cards.push({ id: id++, rank, suit });
    }
  }
  return cards;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function dealRandom(rand: () => number = Math.random): Board {
  const deck = shuffle(buildDeck(), rand);
  const tableau: Card[][] = [[], [], [], []];
  for (let col = 0; col < COLUMN_COUNT; col++) {
    for (let n = 0; n <= col; n++) tableau[col].push(deck.pop()!);
  }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau };
}

export function isWon(board: Board) {
  return board.foundations.every((pile) => pile.length === RANK_COUNT);
}

export function homeCount(board: Board) {
  return board.foundations.reduce((n, pile) => n + pile.length, 0);
}

/**
 * When the stock is used up and every column only gets smaller toward the
 * top, every card can fly home on its own.
 */
export function canAutoFinish(board: Board) {
  if (board.stock.length || board.waste.length) return false;
  return board.tableau.every((col) =>
    col.every((card, i) => i === 0 || card.rank < col[i - 1].rank),
  );
}

/* ------------------------------ Solver ------------------------------ */

type SState = {
  talon: Card[]; // any card is reachable with draw-1 + unlimited passes
  found: number[];
  tab: Card[][];
};

function keyOf(s: SState) {
  const t = s.talon
    .map((c) => c.id)
    .sort((a, b) => a - b)
    .join(",");
  const cols = s.tab
    .map((col) => col.map((c) => c.id).join("."))
    .sort()
    .join("|");
  return `${t}#${s.found.join("")}#${cols}`;
}

function sCanHome(card: Card, found: number[]) {
  return card.rank === found[card.suit];
}

/**
 * Depth-first search for a winning line. Returns the move list (empty when
 * already won) or null if no win was found within `budget` states.
 */
export function solve(
  board: Board,
  mode: Mode,
  budget = 40000,
): SolverMove[] | null {
  const start: SState = {
    // Order by how soon each card can be reached: waste top, then the stock
    // from the top down, then the rest of the waste (after a flip-over).
    // Keeps hints stable while the player draws toward the card.
    talon: [
      ...board.waste.slice(-1),
      ...[...board.stock].reverse(),
      ...board.waste.slice(0, -1),
    ],
    found: board.foundations.map((p) => p.length),
    tab: board.tableau.map((c) => [...c]),
  };
  const seen = new Set<string>();
  const path: SolverMove[] = [];
  let nodes = 0;

  const dfs = (s: SState): boolean => {
    if (s.found.every((n) => n === RANK_COUNT)) return true;
    if (++nodes > budget || path.length > 140) return false;
    const key = keyOf(s);
    if (seen.has(key)) return false;
    seen.add(key);

    const tryMove = (move: SolverMove, next: SState) => {
      path.push(move);
      if (dfs(next)) return true;
      path.pop();
      return false;
    };

    // 1) Anything that can go home.
    for (let c = 0; c < s.tab.length; c++) {
      const col = s.tab[c];
      const top = col[col.length - 1];
      if (top && sCanHome(top, s.found)) {
        const found = [...s.found];
        found[top.suit]++;
        const tab = s.tab.map((x, i) => (i === c ? x.slice(0, -1) : x));
        if (tryMove({ kind: "tabHome", from: c }, { talon: s.talon, found, tab }))
          return true;
      }
    }
    for (const card of s.talon) {
      if (sCanHome(card, s.found)) {
        const found = [...s.found];
        found[card.suit]++;
        const talon = s.talon.filter((x) => x.id !== card.id);
        if (
          tryMove({ kind: "talonHome", cardId: card.id }, { talon, found, tab: s.tab })
        )
          return true;
      }
    }
    // 2) Tableau runs onto other columns.
    for (let from = 0; from < s.tab.length; from++) {
      const col = s.tab[from];
      for (let index = 0; index < col.length; index++) {
        if (!isRun(col, index, mode)) continue;
        const card = col[index];
        // Moving a run off a card it already legally sits on only helps when
        // that card can then go home (prevents back-and-forth shuffling).
        if (
          index > 0 &&
          canStack(card, col[index - 1], mode) &&
          !sCanHome(col[index - 1], s.found)
        )
          continue;
        let triedEmpty = false;
        for (let to = 0; to < s.tab.length; to++) {
          if (to === from) continue;
          const dest = s.tab[to];
          if (dest.length === 0) {
            // Moving a whole column to an empty one is pointless; only try one empty.
            if (index === 0 || triedEmpty) continue;
            triedEmpty = true;
          }
          if (!canStack(card, dest[dest.length - 1], mode)) continue;
          const moving = col.slice(index);
          const tab = s.tab.map((x, i) =>
            i === from ? x.slice(0, index) : i === to ? [...x, ...moving] : x,
          );
          if (
            tryMove(
              { kind: "tabTab", from, index, to },
              { talon: s.talon, found: s.found, tab },
            )
          )
            return true;
        }
      }
    }
    // 3) Talon cards onto the tableau.
    for (const card of s.talon) {
      let triedEmpty = false;
      for (let to = 0; to < s.tab.length; to++) {
        const dest = s.tab[to];
        if (dest.length === 0) {
          if (triedEmpty) continue;
          triedEmpty = true;
        }
        if (!canStack(card, dest[dest.length - 1], mode)) continue;
        const talon = s.talon.filter((x) => x.id !== card.id);
        const tab = s.tab.map((x, i) => (i === to ? [...x, card] : x));
        if (
          tryMove(
            { kind: "talonTab", cardId: card.id, to },
            { talon, found: s.found, tab },
          )
        )
          return true;
      }
    }
    return false;
  };

  return dfs(start) ? path : null;
}

/** Deal until the solver proves the game can be won. */
export function dealWinnable(
  mode: Mode,
  rand: () => number = Math.random,
): Board {
  let last = dealRandom(rand);
  for (let attempt = 0; attempt < 60; attempt++) {
    const board = attempt === 0 ? last : dealRandom(rand);
    last = board;
    if (solve(board, mode, 30000)) return board;
  }
  return last;
}

/* --------------------------- Board updates --------------------------- */

export type Source =
  | { kind: "waste" }
  | { kind: "tab"; col: number; index: number };

export type Dest = { kind: "found" } | { kind: "tab"; col: number };

export function cardsAt(board: Board, src: Source): Card[] {
  switch (src.kind) {
    case "waste": {
      const top = board.waste[board.waste.length - 1];
      return top ? [top] : [];
    }
    case "tab":
      return board.tableau[src.col]?.slice(src.index) ?? [];
    default: {
      const never: never = src;
      return never;
    }
  }
}

export function sourceMovable(board: Board, src: Source, mode: Mode) {
  if (src.kind === "waste") return board.waste.length > 0;
  return isRun(board.tableau[src.col] ?? [], src.index, mode);
}

function removeSource(board: Board, src: Source): Board {
  if (src.kind === "waste") {
    return { ...board, waste: board.waste.slice(0, -1) };
  }
  return {
    ...board,
    tableau: board.tableau.map((col, i) =>
      i === src.col ? col.slice(0, src.index) : col,
    ),
  };
}

export function canMove(board: Board, src: Source, dest: Dest, mode: Mode) {
  if (!sourceMovable(board, src, mode)) return false;
  const cards = cardsAt(board, src);
  if (!cards.length) return false;
  if (dest.kind === "found") {
    return cards.length === 1 && canHome(cards[0], board.foundations);
  }
  if (src.kind === "tab" && src.col === dest.col) return false;
  const col = board.tableau[dest.col];
  return canStack(cards[0], col[col.length - 1], mode);
}

/** Returns the new board, or null when the move is not allowed. */
export function applyMove(
  board: Board,
  src: Source,
  dest: Dest,
  mode: Mode,
): Board | null {
  if (!canMove(board, src, dest, mode)) return null;
  const cards = cardsAt(board, src);
  const next = removeSource(board, src);
  if (dest.kind === "found") {
    const card = cards[0];
    return {
      ...next,
      foundations: next.foundations.map((pile, suit) =>
        suit === card.suit ? [...pile, card] : pile,
      ),
    };
  }
  return {
    ...next,
    tableau: next.tableau.map((col, i) =>
      i === dest.col ? [...col, ...cards] : col,
    ),
  };
}

/** Draw one card, or flip the waste back over when the stock is empty. */
export function drawCard(board: Board): Board | null {
  if (board.stock.length) {
    const card = board.stock[board.stock.length - 1];
    return {
      ...board,
      stock: board.stock.slice(0, -1),
      waste: [...board.waste, card],
    };
  }
  if (!board.waste.length) return null;
  return { ...board, stock: [...board.waste].reverse(), waste: [] };
}

/** Best one-tap destination for a card: home first, then a helpful column. */
export function smartDest(board: Board, src: Source, mode: Mode): Dest | null {
  if (!sourceMovable(board, src, mode)) return null;
  if (canMove(board, src, { kind: "found" }, mode)) return { kind: "found" };
  let empty: Dest | null = null;
  for (let col = 0; col < board.tableau.length; col++) {
    const dest: Dest = { kind: "tab", col };
    if (!canMove(board, src, dest, mode)) continue;
    if (board.tableau[col].length) return dest;
    // An empty column only helps if the run isn't already at the bottom.
    if (!empty && !(src.kind === "tab" && src.index === 0)) empty = dest;
  }
  return empty;
}

/** Next card to auto-send home (used by the auto-finish). */
export function nextAutoHome(board: Board): number | null {
  let best: { col: number; rank: number } | null = null;
  board.tableau.forEach((col, i) => {
    const top = col[col.length - 1];
    if (top && canHome(top, board.foundations) && (!best || top.rank < best.rank)) {
      best = { col: i, rank: top.rank };
    }
  });
  return best ? (best as { col: number }).col : null;
}
