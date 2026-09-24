"use client";

/* eslint-disable @next/next/no-img-element -- small static art */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Lightbulb, RefreshCw, Undo2 } from "lucide-react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";
import { GameOverlay } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import {
  RANKS,
  feltSrc,
  homeWord,
  rankColor,
  suitName,
  suitSrc,
  teamNames,
  winSrc,
} from "./art";
import { CardBack, CardFace } from "./card-face";
import {
  applyMove,
  canAutoFinish,
  canMove,
  cardsAt,
  dealWinnable,
  drawCard,
  homeCount,
  isWon,
  nextAutoHome,
  solve,
  sourceMovable,
  type Board,
  type Card,
  type Dest,
  type Mode,
  type Source,
} from "./logic";

/* ------------------------------ Layout ------------------------------ */

type Rect = { x: number; y: number; w: number; h: number };

type Layout = {
  W: number;
  H: number;
  cw: number;
  ch: number;
  g: number;
  landscape: boolean;
  stock: Rect;
  waste: Rect;
  found: Rect[];
  /** Column origin; `h` is the full height available to the fan. */
  tab: Rect[];
  buttons: Rect;
};

const RATIO = 1.4;

function computeLayout(W: number, H: number): Layout {
  const landscape = W / H > 1.05;
  if (!landscape) {
    const g = Math.max(6, Math.min(14, W * 0.022));
    const ch = Math.min(((W - 5 * g) / 4) * RATIO, (H - 4 * g) / 4.15);
    const cw = ch / RATIO;
    const x0 = (W - (4 * cw + 3 * g)) / 2;
    const colX = (i: number) => x0 + i * (cw + g);
    const fy = g * 0.6;
    const ty = fy + ch + g * 1.2;
    const by = H - ch - g * 0.6;
    return {
      W,
      H,
      cw,
      ch,
      g,
      landscape,
      found: [0, 1, 2, 3].map((i) => ({ x: colX(i), y: fy, w: cw, h: ch })),
      tab: [0, 1, 2, 3].map((i) => ({
        x: colX(i),
        y: ty,
        w: cw,
        h: by - g * 1.2 - ty,
      })),
      stock: { x: colX(0), y: by, w: cw, h: ch },
      waste: { x: colX(1), y: by, w: cw, h: ch },
      buttons: { x: colX(2), y: by, w: 2 * cw + g, h: ch },
    };
  }
  const g = Math.max(6, Math.min(14, H * 0.02));
  const cw = Math.min((W - 10 * g) / 7, (H - 3 * g - 64) / 2 / RATIO);
  const ch = cw * RATIO;
  const totalW = 7 * cw + 8 * g;
  const x0 = (W - totalW) / 2;
  const tx = x0 + cw + 2 * g;
  const rx = tx + 4 * (cw + g) + g;
  const buttonsY = g + 2 * (ch + g);
  return {
    W,
    H,
    cw,
    ch,
    g,
    landscape,
    stock: { x: x0, y: g, w: cw, h: ch },
    waste: { x: x0, y: g * 2 + ch, w: cw, h: ch },
    tab: [0, 1, 2, 3].map((i) => ({
      x: tx + i * (cw + g),
      y: g,
      w: cw,
      h: H - 2 * g,
    })),
    found: [0, 1, 2, 3].map((i) => ({
      x: rx + (i % 2) * (cw + g),
      y: g + Math.floor(i / 2) * (ch + g),
      w: cw,
      h: ch,
    })),
    buttons: {
      x: rx,
      y: buttonsY,
      w: 2 * cw + g,
      h: Math.max(56, Math.min(ch * 0.85, H - buttonsY - g)),
    },
  };
}

function longestCol(board: Board) {
  return Math.max(...board.tableau.map((c) => c.length));
}

/**
 * Column fan spacing. When every column fits with whole cards showing, spread
 * them out fully (big pips to count); otherwise show just the number strip.
 * One spacing for all columns keeps the table tidy.
 */
function fanOffset(L: Layout, longest: number) {
  if (longest <= 1) return 0;
  const avail = L.tab[0].h - L.ch;
  const full = L.ch + L.g * 0.4;
  if (avail / (longest - 1) >= full) return full;
  const strip = L.ch * 0.35;
  return Math.max(L.ch * 0.19, Math.min(strip, avail / (longest - 1)));
}

type Pos = { x: number; y: number; z: number; faceUp: boolean };

function cardPositions(board: Board, L: Layout): Map<number, Pos> {
  const map = new Map<number, Pos>();
  board.stock.forEach((c, i) => {
    const d = Math.min(i, 8) * 0.6;
    map.set(c.id, { x: L.stock.x - d * 0.3, y: L.stock.y - d, z: i, faceUp: false });
  });
  const wn = board.waste.length;
  board.waste.forEach((c, i) => {
    const fromTop = wn - 1 - i;
    const d = Math.min(fromTop, 2) * L.cw * 0.07;
    map.set(c.id, {
      x: L.waste.x - (L.landscape ? 0 : d),
      y: L.waste.y - (L.landscape ? d : 0),
      z: 40 + i,
      faceUp: true,
    });
  });
  board.foundations.forEach((pile, s) =>
    pile.forEach((c, i) =>
      map.set(c.id, { x: L.found[s].x, y: L.found[s].y, z: 80 + i, faceUp: true }),
    ),
  );
  const longest = longestCol(board);
  board.tableau.forEach((col, ci) => {
    const off = fanOffset(L, longest);
    col.forEach((c, i) =>
      map.set(c.id, {
        x: L.tab[ci].x,
        y: L.tab[ci].y + i * off,
        z: 120 + i,
        faceUp: true,
      }),
    );
  });
  return map;
}

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/* ------------------------------ Helpers ----------------------------- */

type Hit =
  | { kind: "stock" }
  | { kind: "waste" }
  | { kind: "found"; suit: number }
  | { kind: "tab"; col: number; index: number } // index -1 = empty column
  | { kind: "none" };

function locate(board: Board, id: number): Hit {
  if (board.stock.some((c) => c.id === id)) return { kind: "stock" };
  if (board.waste.some((c) => c.id === id)) return { kind: "waste" };
  for (let s = 0; s < 4; s++)
    if (board.foundations[s].some((c) => c.id === id)) return { kind: "found", suit: s };
  for (let col = 0; col < 4; col++) {
    const index = board.tableau[col].findIndex((c) => c.id === id);
    if (index >= 0) return { kind: "tab", col, index };
  }
  return { kind: "none" };
}

function sameSource(a: Source | null, b: Source) {
  if (!a) return false;
  if (a.kind === "waste" || b.kind === "waste") return a.kind === b.kind;
  return a.col === b.col && a.index === b.index;
}

function destKey(d: Dest, card?: Card) {
  return d.kind === "found" ? `found-${card?.suit ?? 0}` : `tab-${d.col}`;
}

function legalDests(board: Board, src: Source, mode: Mode): Dest[] {
  const out: Dest[] = [];
  if (canMove(board, src, { kind: "found" }, mode)) out.push({ kind: "found" });
  for (let col = 0; col < 4; col++) {
    const d: Dest = { kind: "tab", col };
    if (!canMove(board, src, d, mode)) continue;
    // Moving a whole column into an empty one changes nothing.
    if (!board.tableau[col].length && src.kind === "tab" && src.index === 0) continue;
    out.push(d);
  }
  return out;
}

function readMode(): Mode {
  try {
    return window.localStorage.getItem("hgc-solitaire-mode") === "tricky"
      ? "tricky"
      : "easy";
  } catch {
    return "easy";
  }
}

function saveMode(mode: Mode) {
  try {
    window.localStorage.setItem("hgc-solitaire-mode", mode);
  } catch {
    // ignore blocked storage
  }
}

function useBoxSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((p) =>
        Math.abs(p.width - r.width) < 0.5 && Math.abs(p.height - r.height) < 0.5
          ? p
          : { width: r.width, height: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

type Burst = { id: number; x: number; y: number; color: string };
type Drag = { src: Source; ids: number[]; dx: number; dy: number };
type Press = {
  pointerId: number;
  x: number;
  y: number;
  hit: Hit;
  src: Source | null;
  dragging: boolean;
};
type Celebrate = "none" | "cascade" | "done";

const SCORE_PER_CARD = 10;

/* ------------------------------- Game ------------------------------- */

export default function SolitaireGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const [boxRef, box] = useBoxSize();
  const [mode, setMode] = useState<Mode>(() => readMode());
  const [started, setStarted] = useState(false);
  const [board, setBoard] = useState<Board>(() => dealWinnable(mode));
  const [history, setHistory] = useState<Board[]>([]);
  const [moves, setMoves] = useState(0);
  const [selected, setSelected] = useState<Source | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [flying, setFlying] = useState<number[]>([]);
  const [shakeId, setShakeId] = useState<number | null>(null);
  const [hint, setHint] = useState<{ cards: number[]; piles: string[] } | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [celebrate, setCelebrate] = useState<Celebrate>("none");

  const pressRef = useRef<Press | null>(null);
  const timers = useRef(new Set<number>());
  const burstId = useRef(0);
  const pausedRef = useRef(paused);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach((t) => window.clearTimeout(t));
      set.clear();
    };
  }, []);

  const L = box.width > 0 && box.height > 0 ? computeLayout(box.width, box.height) : null;
  const won = isWon(board);
  const home = homeCount(board);
  const score = home * SCORE_PER_CARD + (won ? Math.max(50, 300 - moves * 3) : 0);

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const say = useCallback(
    (text: string) => {
      const key = Date.now();
      setToast({ text, key });
      later(() => setToast((t) => (t?.key === key ? null : t)), 1900);
    },
    [later],
  );

  const shake = useCallback(
    (id: number | null) => {
      setShakeId(id);
      sfx("miss");
      haptic(20);
      later(() => setShakeId(null), 380);
    },
    [later],
  );

  const addBurst = useCallback(
    (r: Rect, color: string) => {
      const id = ++burstId.current;
      setBursts((b) => [...b, { id, x: r.x + r.w / 2, y: r.y + r.h / 2, color }]);
      later(() => setBursts((b) => b.filter((x) => x.id !== id)), 800);
    },
    [later],
  );

  /** Commit a new board (shared by taps, drags and the auto-finish). */
  const commit = useCallback(
    (prev: Board, next: Board, movedIds: number[]) => {
      setHistory((h) => [...h.slice(-199), prev]);
      setBoard(next);
      setMoves((m) => m + 1);
      setSelected(null);
      setHint(null);
      setFlying(movedIds);
      later(() => setFlying((f) => (f === movedIds ? [] : f)), 340);
      if (isWon(next)) {
        later(() => {
          sfx("win");
          setCelebrate("cascade");
        }, 420);
      }
    },
    [later],
  );

  const doMove = useCallback(
    (src: Source, dest: Dest) => {
      if (!L) return false;
      const moving = cardsAt(board, src);
      const next = applyMove(board, src, dest, mode);
      if (!next) return false;
      commit(board, next, moving.map((c) => c.id));
      if (dest.kind === "found") {
        const card = moving[0];
        sfx(card.rank === 6 ? "star" : "coin", { pitch: 1 + card.rank * 0.09 });
        haptic(10);
        later(() => addBurst(L.found[card.suit], rankColor(profileId, card.suit)), 230);
        if (card.rank === 6) later(() => say(`${suitName(profileId, card.suit)}s all home!`), 250);
      } else {
        sfx("drop");
        haptic(6);
      }
      return true;
    },
    [L, board, mode, commit, later, addBurst, profileId, say],
  );

  const draw = useCallback(() => {
    const next = drawCard(board);
    if (!next) {
      sfx("miss");
      return;
    }
    const recycled = !board.stock.length;
    commit(
      board,
      next,
      recycled ? [] : [board.stock[board.stock.length - 1].id],
    );
    sfx(recycled ? "bounce" : "flip");
  }, [board, commit]);

  const undo = useCallback(() => {
    if (!history.length || celebrate !== "none") return;
    setBoard(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setMoves((m) => m + 1);
    setSelected(null);
    setHint(null);
    sfx("pop", { pitch: 0.8 });
  }, [history, celebrate]);

  const showHint = useCallback(() => {
    if (celebrate !== "none") return;
    sfx("tap");
    const path = solve(board, mode, 25000);
    const first = path?.[0];
    if (!first) {
      setHint({ cards: [], piles: ["undo"] });
      say("Stuck! Tap Undo to go back.");
      later(() => setHint(null), 2200);
      return;
    }
    let cards: number[] = [];
    let piles: string[] = [];
    switch (first.kind) {
      case "talonHome":
      case "talonTab": {
        const top = board.waste[board.waste.length - 1];
        if (top?.id === first.cardId) {
          cards = [top.id];
          piles = [
            first.kind === "talonHome" ? `found-${top.suit}` : `tab-${first.to}`,
          ];
        } else {
          piles = ["stock"];
          say(board.stock.length ? "Tap the deck for a new card!" : "Tap to flip the deck over!");
        }
        break;
      }
      case "tabHome": {
        const col = board.tableau[first.from];
        const top = col[col.length - 1];
        cards = [top.id];
        piles = [`found-${top.suit}`];
        break;
      }
      case "tabTab":
        cards = board.tableau[first.from].slice(first.index).map((c) => c.id);
        piles = [`tab-${first.to}`];
        break;
      default: {
        const never: never = first;
        return never;
      }
    }
    setSelected(null);
    setHint({ cards, piles });
    later(() => setHint(null), 2400);
  }, [board, mode, celebrate, later, say]);

  const newDeal = useCallback(
    (nextMode: Mode) => {
      setMode(nextMode);
      saveMode(nextMode);
      setBoard(dealWinnable(nextMode));
      setHistory([]);
      setMoves(0);
      setSelected(null);
      setHint(null);
      setDrag(null);
      setCelebrate("none");
      setStarted(true);
      onScoreChange?.(0);
      sfx("flip");
    },
    [onScoreChange],
  );

  /* ---------------------------- Auto-finish ---------------------------- */

  const autoFinishing = started && !won && canAutoFinish(board);

  useEffect(() => {
    if (!autoFinishing || paused || drag) return;
    const col = nextAutoHome(board);
    if (col === null) return;
    const t = window.setTimeout(() => {
      doMove({ kind: "tab", col, index: board.tableau[col].length - 1 }, { kind: "found" });
    }, 190);
    return () => window.clearTimeout(t);
  }, [autoFinishing, paused, drag, board, doMove]);

  /* ------------------------------- Input ------------------------------ */

  const activate = useCallback(
    (src: Source, card: Card | undefined) => {
      if (!sourceMovable(board, src, mode)) {
        shake(card?.id ?? null);
        return;
      }
      if (sameSource(selected, src)) {
        setSelected(null);
        sfx("tap", { pitch: 0.8 });
        return;
      }
      const dests = legalDests(board, src, mode);
      const home = dests.find((d) => d.kind === "found");
      if (home) {
        doMove(src, home);
      } else if (dests.length === 1) {
        doMove(src, dests[0]);
      } else if (dests.length > 1) {
        setSelected(src);
        sfx("pop");
        say("Where should it go?");
      } else {
        shake(card?.id ?? null);
      }
    },
    [board, mode, selected, doMove, shake, say],
  );

  const tryDest = useCallback(
    (dest: Dest) => {
      if (!selected) return;
      if (!doMove(selected, dest)) {
        const first = cardsAt(board, selected)[0];
        shake(first?.id ?? null);
        setSelected(null);
      }
    },
    [selected, doMove, board, shake],
  );

  const onTap = useCallback(
    (hit: Hit) => {
      switch (hit.kind) {
        case "stock":
          setSelected(null);
          draw();
          return;
        case "waste": {
          const top = board.waste[board.waste.length - 1];
          if (selected && selected.kind !== "waste") {
            setSelected(null);
            return;
          }
          if (top) activate({ kind: "waste" }, top);
          return;
        }
        case "found":
          if (selected) tryDest({ kind: "found" });
          return;
        case "tab": {
          const col = board.tableau[hit.col];
          if (selected && !(selected.kind === "tab" && selected.col === hit.col)) {
            tryDest({ kind: "tab", col: hit.col });
            return;
          }
          if (hit.index < 0) {
            setSelected(null);
            return;
          }
          activate({ kind: "tab", col: hit.col, index: hit.index }, col[hit.index]);
          return;
        }
        case "none":
          setSelected(null);
          return;
        default: {
          const never: never = hit;
          return never;
        }
      }
    },
    [board, selected, draw, activate, tryDest],
  );

  const inputBlocked = paused || !started || celebrate !== "none" || autoFinishing;

  const hitFromEvent = (target: EventTarget | null): Hit => {
    const el = target instanceof Element ? target : null;
    const cardEl = el?.closest<HTMLElement>("[data-card]");
    if (cardEl) return locate(board, Number(cardEl.dataset.card));
    const pileEl = el?.closest<HTMLElement>("[data-pile]");
    const pile = pileEl?.dataset.pile ?? "";
    if (pile === "stock") return { kind: "stock" };
    if (pile === "waste") return { kind: "waste" };
    if (pile.startsWith("found-")) return { kind: "found", suit: Number(pile.slice(6)) };
    if (pile.startsWith("tab-")) {
      const col = Number(pile.slice(4));
      const n = board.tableau[col].length;
      return { kind: "tab", col, index: n ? n - 1 : -1 };
    }
    return { kind: "none" };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (inputBlocked || pressRef.current) return;
    const hit = hitFromEvent(e.target);
    let src: Source | null = null;
    if (hit.kind === "waste" && board.waste.length) src = { kind: "waste" };
    if (hit.kind === "tab" && hit.index >= 0) {
      const s: Source = { kind: "tab", col: hit.col, index: hit.index };
      if (sourceMovable(board, s, mode)) src = s;
    }
    pressRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      hit,
      src,
      dragging: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pressRef.current;
    if (!p || p.pointerId !== e.pointerId || !p.src) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < 8) return;
      p.dragging = true;
      setSelected(null);
      setHint(null);
      sfx("tap", { pitch: 1.2 });
      setDrag({ src: p.src, ids: cardsAt(board, p.src).map((c) => c.id), dx, dy });
      return;
    }
    setDrag((d) => (d ? { ...d, dx, dy } : d));
  };

  const finishDrag = (d: Drag) => {
    if (!L) return;
    const pos = cardPositions(board, L);
    const first = pos.get(d.ids[0]);
    setDrag(null);
    if (!first) return;
    const r: Rect = { x: first.x + d.dx, y: first.y + d.dy, w: L.cw, h: L.ch };
    const card = cardsAt(board, d.src)[0];
    let best: { dest: Dest; area: number } | null = null;
    const consider = (dest: Dest, rect: Rect) => {
      if (!canMove(board, d.src, dest, mode)) return;
      const area = overlap(r, rect);
      if (area > 0 && (!best || area > best.area)) best = { dest, area };
    };
    L.found.forEach((rect) => consider({ kind: "found" }, rect));
    board.tableau.forEach((col, ci) => {
      const n = col.length;
      const bottom = L.tab[ci].y + Math.max(0, n - 1) * fanOffset(L, longestCol(board)) + L.ch;
      consider(
        { kind: "tab", col: ci },
        { x: L.tab[ci].x, y: L.tab[ci].y - L.g, w: L.cw, h: bottom - L.tab[ci].y + L.g * 2 },
      );
    });
    const chosen = best as { dest: Dest; area: number } | null;
    if (chosen) {
      doMove(d.src, chosen.dest);
    } else if (Math.hypot(d.dx, d.dy) > L.cw * 0.5) {
      shake(card?.id ?? null);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pressRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    pressRef.current = null;
    if (p.dragging) {
      if (drag) finishDrag(drag);
      else setDrag(null);
      return;
    }
    if (inputBlocked) return;
    onTap(p.hit);
  };

  const onPointerCancel = () => {
    pressRef.current = null;
    setDrag(null);
  };

  // Desktop keys: space draws, U/Z/Backspace undoes, H hints.
  const keysRef = useRef({ draw, undo, showHint, blocked: inputBlocked });
  useEffect(() => {
    keysRef.current = { draw, undo, showHint, blocked: inputBlocked };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (k.blocked) return;
      if (e.key === " " || e.key === "d") {
        e.preventDefault();
        k.draw();
      } else if (e.key === "u" || e.key === "z" || e.key === "Backspace") {
        e.preventDefault();
        k.undo();
      } else if (e.key === "h") {
        k.showHint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ----------------------------- Cascade ------------------------------ */

  useEffect(() => {
    if (celebrate !== "cascade" || !L) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(L.W * dpr);
    canvas.height = Math.round(L.H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const imgs = [0, 1, 2, 3].map((s) => {
      const im = new Image();
      im.src = suitSrc(profileId, s);
      return im;
    });
    const sprite = (rank: number, suit: number) => {
      const c = document.createElement("canvas");
      c.width = Math.round(L.cw * dpr);
      c.height = Math.round(L.ch * dpr);
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr);
      const r = L.cw * 0.12;
      g.beginPath();
      g.roundRect(0.5, 0.5, L.cw - 1, L.ch - 1, r);
      const grad = g.createLinearGradient(0, 0, L.cw, L.ch);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#fbefdf");
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.18)";
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = rankColor(profileId, suit);
      g.font = `900 ${L.cw * 0.4}px system-ui, sans-serif`;
      g.textBaseline = "top";
      g.fillText(RANKS[rank], L.cw * 0.08, L.cw * 0.06);
      const im = imgs[suit];
      if (im.complete && im.naturalWidth) {
        g.globalCompositeOperation = "multiply";
        const s = L.cw * 0.7;
        g.drawImage(im, (L.cw - s) / 2, L.ch - s - L.cw * 0.1, s, s);
      }
      return c;
    };

    type Flyer = { spr: HTMLCanvasElement; x: number; y: number; vx: number; vy: number };
    const queue: { rank: number; suit: number }[] = [];
    for (let rank = 6; rank >= 0; rank--) for (let s = 0; s < 4; s++) queue.push({ rank, suit: s });
    const flyers: Flyer[] = [];
    const k = L.cw / 80;
    let last = performance.now();
    let acc = 0;
    let launchT = 0;
    let elapsed = 0;
    let raf = 0;
    let ended = false;

    const end = () => {
      if (ended) return;
      ended = true;
      setCelebrate("done");
    };

    const step = () => {
      launchT += 16.7;
      elapsed += 16.7;
      if (queue.length && launchT > 125) {
        launchT = 0;
        const q = queue.shift()!;
        const f = L.found[q.suit];
        const dir = f.x + L.cw / 2 < L.W / 2 ? 1 : -1;
        flyers.push({
          spr: sprite(q.rank, q.suit),
          x: f.x,
          y: f.y,
          vx: dir * (2 + Math.random() * 4) * k * (Math.random() < 0.25 ? -1 : 1),
          vy: (-2 - Math.random() * 7) * k,
        });
        if (queue.length % 4 === 0) sfx("bounce", { pitch: 0.8 + Math.random() * 0.6 });
      }
      for (const f of flyers) {
        f.vy += 0.55 * k;
        f.x += f.vx;
        f.y += f.vy;
        if (f.y + L.ch > L.H) {
          f.y = L.H - L.ch;
          f.vy = -f.vy * 0.74;
        }
        ctx.drawImage(f.spr, f.x, f.y, L.cw, L.ch);
      }
      for (let i = flyers.length - 1; i >= 0; i--) {
        const f = flyers[i];
        if (f.x < -L.cw * 1.2 || f.x > L.W + L.cw * 0.2) flyers.splice(i, 1);
      }
      if ((!queue.length && !flyers.length) || elapsed > 9000) end();
    };

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!pausedRef.current) {
        acc += dt;
        while (acc >= 16.7 && !ended) {
          acc -= 16.7;
          step();
        }
      }
      if (!ended) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // Layout is read once per cascade on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate, profileId]);

  /* ------------------------------ Render ------------------------------ */

  const positions = L ? cardPositions(board, L) : null;
  const allCards: Card[] = [
    ...board.stock,
    ...board.waste,
    ...board.foundations.flat(),
    ...board.tableau.flat(),
  ].sort((a, b) => a.id - b.id);

  const selectedIds = new Set(selected ? cardsAt(board, selected).map((c) => c.id) : []);
  const dragIds = new Set(drag?.ids ?? []);
  const flyingIds = new Set(flying);
  const hintIds = new Set(hint?.cards ?? []);

  const glowPiles = new Set<string>(hint?.piles ?? []);
  const activeSrc = drag?.src ?? selected;
  if (activeSrc) {
    const first = cardsAt(board, activeSrc)[0];
    legalDests(board, activeSrc, mode).forEach((d) => glowPiles.add(destKey(d, first)));
  }

  const [teamA, teamB] = teamNames(profileId);

  return (
    <div className="game-root">
      <style>{CSS}</style>
      <div
        ref={boxRef}
        className={cn(
          "relative min-h-0 w-full flex-1 touch-none select-none overflow-hidden rounded-[1.4rem] shadow-[0_10px_30px_rgba(0,0,0,0.18)] ring-4 ring-white/70",
          paused && "pointer-events-none",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src={feltSrc(profileId)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              profileId === "keira"
                ? "radial-gradient(120% 80% at 50% 40%, rgba(255,255,255,0.05), rgba(90,30,80,0.32))"
                : "radial-gradient(120% 80% at 50% 40%, rgba(255,255,255,0.04), rgba(0,20,30,0.45))",
          }}
        />

        {L && positions ? (
          <>
            {/* Slots */}
            <Slot
              rect={L.stock}
              pile="stock"
              L={L}
            >
              {board.waste.length ? (
                <RefreshCw
                  className="text-white/90 drop-shadow"
                  style={{ width: L.cw * 0.45, height: L.cw * 0.45 }}
                  strokeWidth={3}
                />
              ) : null}
            </Slot>
            <Slot rect={L.waste} pile="waste" L={L} />
            {L.found.map((r, s) => (
              <Slot key={`f${s}`} rect={r} pile={`found-${s}`} L={L} nest>
                <img
                  src={suitSrc(profileId, s)}
                  alt=""
                  draggable={false}
                  className="object-contain opacity-50 grayscale-[35%]"
                  style={{ width: L.cw * 0.62, height: L.cw * 0.62 }}
                />
                <span
                  className="absolute left-[8%] top-[3%] font-black text-white/85 drop-shadow"
                  style={{ fontSize: L.cw * 0.3 }}
                >
                  1
                </span>
              </Slot>
            ))}
            {L.tab.map((r, c) => (
              <Slot
                key={`t${c}`}
                rect={{ x: r.x, y: r.y, w: L.cw, h: L.ch }}
                pile={`tab-${c}`}
                L={L}
                faint
              />
            ))}
            {/* Tall invisible drop/tap zones under each column */}
            {L.tab.map((r, c) => (
              <div
                key={`z${c}`}
                data-pile={`tab-${c}`}
                className="absolute"
                style={{ left: r.x, top: r.y, width: L.cw, height: r.h, zIndex: 1 }}
              />
            ))}

            {/* Cards */}
            {allCards.map((card) => {
              const p = positions.get(card.id);
              if (!p) return null;
              const dragging = dragIds.has(card.id);
              const lifted = selectedIds.has(card.id);
              const x = p.x + (dragging && drag ? drag.dx : 0);
              const y = p.y + (dragging && drag ? drag.dy : 0) - (lifted ? L.ch * 0.06 : 0);
              const z = p.z + (dragging ? 3000 : flyingIds.has(card.id) ? 1000 : 0);
              const hidden = celebrate !== "none" && p.z >= 80 && p.z < 120;
              return (
                <div
                  key={card.id}
                  data-card={card.id}
                  className={cn("sol-card absolute left-0 top-0", shakeId === card.id && "sol-shake")}
                  style={
                    {
                      width: L.cw,
                      height: L.ch,
                      fontSize: L.cw,
                      transform: `translate3d(${x}px, ${y}px, 0)`,
                      zIndex: z,
                      transition: dragging
                        ? "none"
                        : "transform 300ms cubic-bezier(.2,.85,.25,1.05)",
                      visibility: hidden ? "hidden" : undefined,
                    } as CSSProperties
                  }
                >
                  <div
                    className={cn(
                      "sol-flip absolute inset-0",
                      !p.faceUp && "sol-down",
                      dragging && "sol-drag",
                      lifted && "sol-lift",
                      hintIds.has(card.id) && "sol-hint",
                    )}
                  >
                    <div className="sol-side">
                      <CardFace card={card} profileId={profileId} />
                    </div>
                    <div className="sol-side sol-back">
                      <CardBack profileId={profileId} />
                    </div>
                  </div>
                </div>
              );
            })}

            {board.stock.length ? (
              <span
                className="pointer-events-none absolute rounded-full bg-black/60 px-2 font-black text-white shadow"
                style={{
                  left: L.stock.x + L.cw - L.cw * 0.12,
                  top: L.stock.y + L.ch - L.cw * 0.3,
                  fontSize: Math.max(12, L.cw * 0.18),
                  zIndex: 60,
                  transform: "translate(-100%, 0)",
                }}
              >
                {board.stock.length}
              </span>
            ) : null}

            {/* Glowing rings on legal / hinted targets */}
            {[...glowPiles].map((key) => {
              let r: Rect | null = null;
              if (key === "stock") r = L.stock;
              else if (key === "waste") r = L.waste;
              else if (key.startsWith("found-")) r = L.found[Number(key.slice(6))];
              else if (key.startsWith("tab-")) {
                const c = Number(key.slice(4));
                const n = board.tableau[c].length;
                r = {
                  x: L.tab[c].x,
                  y: L.tab[c].y + Math.max(0, n - 1) * fanOffset(L, longestCol(board)),
                  w: L.cw,
                  h: L.ch,
                };
              }
              if (!r) return null;
              return (
                <div
                  key={`g-${key}`}
                  className="sol-ring-glow pointer-events-none absolute"
                  style={{
                    left: r.x - 4,
                    top: r.y - 4,
                    width: r.w + 8,
                    height: r.h + 8,
                    borderRadius: L.cw * 0.14,
                    zIndex: 2400,
                  }}
                />
              );
            })}

            {/* Sparkle bursts */}
            {bursts.map((b) => (
              <div
                key={b.id}
                className="pointer-events-none absolute"
                style={{ left: b.x, top: b.y, zIndex: 2500 }}
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const a = (i / 12) * Math.PI * 2;
                  const d = L.cw * (0.7 + (i % 3) * 0.2);
                  return (
                    <span
                      key={i}
                      className="sol-spark"
                      style={
                        {
                          "--tx": `${Math.cos(a) * d}px`,
                          "--ty": `${Math.sin(a) * d}px`,
                          background: i % 2 ? b.color : "#fde047",
                          width: L.cw * (i % 3 === 0 ? 0.14 : 0.09),
                          height: L.cw * (i % 3 === 0 ? 0.14 : 0.09),
                        } as CSSProperties
                      }
                    />
                  );
                })}
                <span className="sol-ring" style={{ width: L.cw, height: L.cw, borderColor: b.color }} />
              </div>
            ))}

            {/* Buttons */}
            <div
              className={cn("absolute flex gap-2", L.landscape ? "flex-row" : "flex-row")}
              style={{
                left: L.buttons.x,
                top: L.buttons.y,
                width: L.buttons.w,
                height: L.buttons.h,
                zIndex: 50,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={cn(
                  "kid-btn kid-btn-secondary h-full min-h-14 flex-1 flex-col gap-0.5 text-base",
                  hint?.piles.includes("undo") && "sol-hint",
                )}
                onClick={undo}
                disabled={!history.length || inputBlocked}
                aria-label="Undo"
              >
                <Undo2 className="size-7" strokeWidth={3} />
                <span className="font-black">Undo</span>
              </button>
              <button
                type="button"
                className="kid-btn kid-btn-primary h-full min-h-14 flex-1 flex-col gap-0.5 text-base"
                onClick={showHint}
                disabled={inputBlocked}
                aria-label="Hint"
              >
                <Lightbulb className="size-7" strokeWidth={3} />
                <span className="font-black">Hint</span>
              </button>
            </div>

            {toast ? (
              <div
                key={toast.key}
                className="sol-toast pointer-events-none absolute left-1/2 rounded-full bg-white/95 px-4 py-2 text-center text-base font-black text-[var(--ink)] shadow-lg ring-2 ring-[var(--accent)]"
                style={{
                  top: L.landscape ? L.g : L.tab[0].y - L.g * 0.2 - 4,
                  zIndex: 2600,
                  maxWidth: "90%",
                }}
              >
                {toast.text}
              </div>
            ) : null}
          </>
        ) : null}

        <canvas
          ref={canvasRef}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            celebrate === "none" && "hidden",
          )}
          style={{ zIndex: 2700 }}
        />
        {celebrate === "cascade" ? (
          <button
            type="button"
            aria-label="Skip celebration"
            className="absolute inset-0"
            style={{ zIndex: 2800 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCelebrate("done")}
          />
        ) : null}

        <div className="contents" onPointerDown={(e) => e.stopPropagation()}>
          <GameOverlay
            show={!started}
            className="z-[3000]"
            emoji={<StartArt profileId={profileId} />}
            title={theme.gameNames.solitaire}
            subtitle={`Put the cards on the ${homeWord(profileId)} from 1 to 7. Stack a card on one that is 1 bigger.`}
            actionLabel="Easy"
            onAction={() => newDeal("easy")}
            secondary={
              <button
                type="button"
                className="kid-btn kid-btn-secondary min-h-14 w-full flex-col gap-0 text-lg leading-tight"
                onClick={() => newDeal("tricky")}
              >
                Tricky
                <span className="text-xs font-bold opacity-70">
                  {teamA} and {teamB} take turns
                </span>
              </button>
            }
          />
          <GameOverlay
            show={celebrate === "done"}
            tone="win"
            className="z-[3000]"
            emoji={
              <img
                src={winSrc(profileId)}
                alt=""
                draggable={false}
                className="float-slow mx-auto aspect-video w-60 max-w-full rounded-2xl border-4 border-white object-cover shadow-lg"
              />
            }
            title="All home — you win!"
            subtitle={`${moves} moves${mode === "tricky" ? " on Tricky!" : ""}`}
            actionLabel="Play again"
            onAction={() => newDeal(mode)}
            secondary={
              <button
                type="button"
                className="kid-btn kid-btn-secondary min-h-12 w-full text-base"
                onClick={() => newDeal(mode === "easy" ? "tricky" : "easy")}
              >
                Try {mode === "easy" ? "Tricky" : "Easy"}
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}

function StartArt({ profileId }: { profileId: ProfileId }) {
  return (
    <div className="flex justify-center gap-1">
      {[0, 1, 2, 3].map((s) => (
        <img
          key={s}
          src={suitSrc(profileId, s)}
          alt=""
          draggable={false}
          className="size-12 rounded-xl border-2 border-white object-cover shadow"
          style={{ transform: `rotate(${(s - 1.5) * 8}deg) translateY(${Math.abs(s - 1.5) * 4}px)` }}
        />
      ))}
    </div>
  );
}

function Slot({
  rect,
  pile,
  L,
  nest,
  faint,
  children,
}: {
  rect: Rect;
  pile: string;
  L: Layout;
  nest?: boolean;
  faint?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-pile={pile}
      className={cn(
        "absolute flex items-center justify-center",
      )}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        borderRadius: L.cw * 0.12,
        zIndex: 2,
        background: nest
          ? "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.42), rgba(255,255,255,0.14) 70%)"
          : faint
            ? "rgba(255,255,255,0.1)"
            : "rgba(255,255,255,0.16)",
        boxShadow: nest
          ? "inset 0 3px 10px rgba(0,0,0,0.25), 0 0 0 2px rgba(255,255,255,0.55)"
          : "inset 0 2px 8px rgba(0,0,0,0.18), 0 0 0 2px rgba(255,255,255,0.28)",
      }}
    >
      {children}
    </div>
  );
}

const CSS = `
.sol-card { will-change: transform; perspective: 5em; }
.sol-flip {
  transform-style: preserve-3d;
  transition: transform 320ms cubic-bezier(.3,.7,.3,1), filter 200ms;
  border-radius: 0.12em;
  box-shadow: 0 0.03em 0 rgba(40,20,50,0.22), 0 0.06em 0.12em rgba(20,10,30,0.28);
}
.sol-down { transform: rotateY(180deg); }
.sol-side { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 0.12em; }
.sol-back { transform: rotateY(180deg); }
.sol-drag { transform: scale(1.07) rotate(-2deg); box-shadow: 0 0.2em 0.3em rgba(20,10,30,0.35); }
.sol-lift { box-shadow: 0 0 0 0.045em #fcd34d, 0 0 0.2em 0.04em rgba(252,211,77,0.9), 0 0.12em 0.2em rgba(20,10,30,0.3); }
.sol-hint { animation: sol-hint 0.8s ease-in-out infinite; }
@keyframes sol-hint {
  0%,100% { box-shadow: 0 0 0 3px #a3e635, 0 0 12px 4px rgba(163,230,53,0.7); }
  50% { box-shadow: 0 0 0 5px #bef264, 0 0 22px 8px rgba(190,242,100,0.9); }
}
.sol-ring-glow { border: 4px solid #bef264; animation: sol-glow 0.9s ease-in-out infinite; }
@keyframes sol-glow {
  0%,100% { box-shadow: 0 0 14px 3px rgba(190,242,100,0.8), inset 0 0 10px rgba(190,242,100,0.6); opacity: 0.85; }
  50% { box-shadow: 0 0 26px 8px rgba(217,249,157,0.95), inset 0 0 16px rgba(217,249,157,0.8); opacity: 1; }
}
.sol-shake { animation: sol-shake 0.36s ease; }
@keyframes sol-shake {
  0%,100% { margin-left: 0; }
  20% { margin-left: -7px; } 40% { margin-left: 7px; } 60% { margin-left: -5px; } 80% { margin-left: 4px; }
}
.sol-spark {
  position: absolute; left: 0; top: 0; border-radius: 9999px;
  transform: translate(-50%, -50%);
  animation: sol-spark 700ms cubic-bezier(.1,.7,.3,1) forwards;
  box-shadow: 0 0 6px rgba(255,255,255,0.9);
}
@keyframes sol-spark {
  0% { transform: translate(-50%,-50%) scale(0.4); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.1); opacity: 0; }
}
.sol-ring {
  position: absolute; left: 0; top: 0; border-radius: 9999px; border: 4px solid;
  transform: translate(-50%,-50%) scale(0.3);
  animation: sol-ring 600ms ease-out forwards;
}
@keyframes sol-ring { to { transform: translate(-50%,-50%) scale(1.5); opacity: 0; } }
.sol-toast { transform: translate(-50%, -100%); animation: sol-toast 1.9s ease forwards; white-space: nowrap; }
@keyframes sol-toast {
  0% { opacity: 0; transform: translate(-50%, -60%) scale(0.8); }
  10% { opacity: 1; transform: translate(-50%, -100%) scale(1); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -120%); }
}
@media (prefers-reduced-motion: reduce) {
  .sol-hint, .sol-ring-glow, .sol-spark, .sol-ring { animation-duration: 1ms; }
}
`;
