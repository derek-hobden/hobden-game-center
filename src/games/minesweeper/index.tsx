"use client";

/* eslint-disable @next/next/no-img-element -- tiny static sprites, no optimisation needed */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GameProps } from "@/lib/game-registry";
import { FitBox, GameOverlay, StatPill } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { minesweeperArt, NUMBER_COLORS, type MinesweeperArt } from "./art";
import {
  cloneBoard,
  configFor,
  countFlags,
  countOpenSafe,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  dims,
  emptyBoard,
  floodOpen,
  prepareOpen,
  safeLeft,
  type BoardConfig,
  type Cell,
  type Difficulty,
} from "./board";
import styles from "./minesweeper.module.css";

type Status = "ready" | "playing" | "won" | "lost";
type Mode = "dig" | "flag";

type Game = {
  board: Cell[][];
  config: BoardConfig;
  status: Status;
  /** "r-c" → delay (ms) for the squares opened by the latest move. */
  reveal: Record<string, number>;
  /** "r-c" → delay (ms) for flags that should play their planting animation. */
  planted: Record<string, number>;
  /** Bumped on every move so animations restart. */
  moveId: number;
  hit: string | null;
  /** Board just before the losing tap (mines already placed) for "take it back". */
  undo: Cell[][] | null;
  undosLeft: number;
};

type Confetti = {
  id: number;
  pieces: { dx: number; dy: number; rot: number; color: string; delay: number; round: boolean }[];
};

const LONG_PRESS_MS = 360;
const MOVE_CANCEL_PX = 14;
const UNDOS_PER_GAME = 1;
const CONFETTI_COLORS = ["#f472b6", "#facc15", "#34d399", "#60a5fa", "#a78bfa", "#fb923c"];

function newGame(config: BoardConfig): Game {
  return {
    board: emptyBoard(config.rows, config.cols),
    config,
    status: "ready",
    reveal: {},
    planted: {},
    moveId: 0,
    hit: null,
    undo: null,
    undosLeft: UNDOS_PER_GAME,
  };
}

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
}
const isLandscape = () => window.innerWidth > window.innerHeight * 1.1;

/** Pseudo-random but stable texture offset so no two squares look the same. */
function coverStyle(art: MinesweeperArt, r: number, c: number): CSSProperties {
  const h = (r * 7919 + c * 104729 + r * c * 31) % 9973;
  const x = h % 100;
  const y = Math.floor(h / 100) % 100;
  const light = (r + c) % 2 === 0;
  return {
    backgroundColor: art.coverTint[light ? 0 : 1],
    backgroundImage: `linear-gradient(${light ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)"}, ${light ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.07)"}), url(${art.cover})`,
    backgroundSize: "100% 100%, 300% 300%",
    backgroundPosition: `0 0, ${x}% ${y}%`,
  };
}

export default function MinesweeperGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const art = minesweeperArt(profileId);
  const landscape = useSyncExternalStore(subscribeResize, isLandscape, () => false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [mode, setMode] = useState<Mode>("dig");
  const [game, setGame] = useState<Game>(() => newGame(configFor("easy")));
  const [showOverlay, setShowOverlay] = useState(false);
  const [confetti, setConfetti] = useState<Confetti | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ r: number; c: number } | null>(null);

  const wantConfig = useMemo(
    () => configFor(difficulty, landscape),
    [difficulty, landscape],
  );

  // Before the first dig the board follows the screen orientation / difficulty.
  const view: Game = useMemo(() => {
    if (game.status !== "ready") return game;
    const { rows, cols } = dims(game.board);
    if (rows === wantConfig.rows && cols === wantConfig.cols) return game;
    return newGame(wantConfig);
  }, [game, wantConfig]);

  const viewRef = useRef(view);
  const pausedRef = useRef(paused);
  const timers = useRef<number[]>([]);
  const press = useRef<{
    key: string;
    timer: number;
    fired: boolean;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    viewRef.current = view;
    pausedRef.current = paused;
  });

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(
    () => () => {
      clearTimers();
      if (press.current) window.clearTimeout(press.current.timer);
    },
    [clearTimers],
  );

  const commit = useCallback((next: Game) => {
    viewRef.current = next;
    setGame(next);
  }, []);

  const { rows, cols } = dims(view.board);
  const mines = view.config.mines;
  const flags = countFlags(view.board);
  const opened = countOpenSafe(view.board);
  const score = opened + (view.status === "won" ? mines * 5 : 0);

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const restart = useCallback(
    (d: Difficulty = difficulty) => {
      clearTimers();
      setShowOverlay(false);
      setConfetti(null);
      setCursor(null);
      setMode("dig");
      setDifficulty(d);
      commit(newGame(configFor(d, isLandscape())));
      onScoreChange?.(0);
      sfx("tap");
    },
    [clearTimers, commit, difficulty, onScoreChange],
  );

  const toggleFlag = useCallback(
    (r: number, c: number) => {
      const g = viewRef.current;
      if (pausedRef.current) return;
      if (g.status === "won" || g.status === "lost") return;
      const cell = g.board[r][c];
      if (cell.open) return;
      const board = cloneBoard(g.board);
      board[r][c].flagged = !cell.flagged;
      const key = `${r}-${c}`;
      commit({
        ...g,
        board,
        reveal: {},
        planted: board[r][c].flagged ? { [key]: 0 } : {},
        moveId: g.moveId + 1,
      });
      if (board[r][c].flagged) {
        sfx("drop", { pitch: 1.2 });
        haptic(20);
      } else {
        sfx("tap", { pitch: 0.8 });
      }
    },
    [commit],
  );

  const dig = useCallback(
    (r: number, c: number) => {
      const g = viewRef.current;
      if (pausedRef.current) return;
      if (g.status === "won" || g.status === "lost") return;
      const cell = g.board[r][c];
      if (cell.open) return;
      if (cell.flagged) {
        // Flags protect a square: a gentle "nope" instead of opening it.
        sfx("tap", { pitch: 0.6 });
        haptic(10);
        return;
      }
      const prep = prepareOpen(g.board, r, c, g.status !== "ready", g.config.mines);
      if (!prep) return;
      const { working } = prep;
      const key = `${r}-${c}`;

      if (working[r][c].mine) {
        const board = cloneBoard(working);
        const reveal: Record<string, number> = {};
        for (let rr = 0; rr < board.length; rr++) {
          for (let cc = 0; cc < board[rr].length; cc++) {
            const x = board[rr][cc];
            if (!x.mine || x.flagged) continue;
            x.open = true;
            const d = Math.max(Math.abs(rr - r), Math.abs(cc - c));
            reveal[`${rr}-${cc}`] = d === 0 ? 0 : 250 + d * 110;
          }
        }
        commit({
          ...g,
          board,
          status: "lost",
          reveal,
          planted: {},
          moveId: g.moveId + 1,
          hit: key,
          undo: g.undosLeft > 0 ? working : null,
        });
        sfx("hit");
        haptic(160);
        later(() => sfx("lose"), 450);
        later(() => setShowOverlay(true), 1300);
        return;
      }

      const { board, order } = floodOpen(working, r, c);
      const maxD = Math.max(0, ...Object.values(order));
      const step = maxD > 0 ? Math.min(55, 650 / maxD) : 0;
      const reveal: Record<string, number> = {};
      for (const [k, d] of Object.entries(order)) reveal[k] = Math.round(d * step);

      // Cascade sound: a rising run of pops, one per ring (capped).
      const rings = Math.min(maxD, 12);
      for (let d = 0; d <= rings; d++) {
        const at = Math.round((d * maxD * step) / Math.max(1, rings));
        const pitch = 0.9 + d * 0.08;
        if (at === 0) sfx("pop", { pitch });
        else later(() => sfx("pop", { pitch }), at);
      }
      const cascadeMs = Math.round(maxD * step) + 300;

      if (safeLeft(board) === 0) {
        const planted: Record<string, number> = {};
        let i = 0;
        for (let rr = 0; rr < board.length; rr++) {
          for (let cc = 0; cc < board[rr].length; cc++) {
            const x = board[rr][cc];
            if (x.mine && !x.flagged) {
              x.flagged = true;
              planted[`${rr}-${cc}`] = cascadeMs + i * 120;
              i += 1;
            }
          }
        }
        commit({
          ...g,
          board,
          status: "won",
          reveal,
          planted,
          moveId: g.moveId + 1,
          hit: null,
          undo: null,
        });
        const winAt = cascadeMs + i * 120 + 100;
        later(() => {
          sfx("win");
          haptic(60);
          setConfetti({
            id: Date.now(),
            pieces: Array.from({ length: 44 }, (_, n) => {
              const a = Math.random() * Math.PI * 2;
              const dist = 120 + Math.random() * 220;
              return {
                dx: Math.cos(a) * dist,
                dy: Math.sin(a) * dist + 140,
                rot: (Math.random() - 0.5) * 900,
                color: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
                delay: Math.random() * 180,
                round: n % 3 === 0,
              };
            }),
          });
        }, winAt);
        later(() => setShowOverlay(true), winAt + 1100);
        return;
      }

      commit({
        ...g,
        board,
        status: "playing",
        reveal,
        planted: {},
        moveId: g.moveId + 1,
        hit: null,
      });
      if (Object.keys(order).length >= 10) later(() => sfx("coin"), cascadeMs - 150);
    },
    [commit, later],
  );

  const takeBack = () => {
    const g = viewRef.current;
    if (!g.undo || g.undosLeft <= 0) return;
    clearTimers();
    setShowOverlay(false);
    commit({
      ...g,
      board: g.undo,
      status: "playing",
      reveal: {},
      planted: {},
      moveId: g.moveId + 1,
      hit: null,
      undo: null,
      undosLeft: g.undosLeft - 1,
    });
    sfx("levelUp");
  };

  const act = useCallback(
    (r: number, c: number) => {
      if (mode === "flag") toggleFlag(r, c);
      else dig(r, c);
    },
    [mode, toggleFlag, dig],
  );

  // ---- Touch: tap = current mode, long-press = flag ----
  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    setPressing(null);
  };

  const onPointerDown = (e: ReactPointerEvent, r: number, c: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (press.current) window.clearTimeout(press.current.timer);
    const key = `${r}-${c}`;
    const cell = viewRef.current.board[r][c];
    const canHold = !cell.open && (viewRef.current.status === "ready" || viewRef.current.status === "playing");
    press.current = {
      key,
      fired: false,
      x: e.clientX,
      y: e.clientY,
      timer: canHold
        ? window.setTimeout(() => {
            if (!press.current || press.current.key !== key) return;
            press.current.fired = true;
            setPressing(null);
            haptic(35);
            if (mode === "flag") dig(r, c);
            else toggleFlag(r, c);
          }, LONG_PRESS_MS)
        : 0,
    };
    if (canHold) setPressing(key);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || p.fired) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_CANCEL_PX) {
      window.clearTimeout(p.timer);
      press.current = null;
      setPressing(null);
    }
  };

  const onTileClick = (r: number, c: number) => {
    const p = press.current;
    press.current = null;
    setPressing(null);
    if (p && p.key === `${r}-${c}` && p.fired) return;
    if (p) window.clearTimeout(p.timer);
    act(r, c);
  };

  // ---- Keyboard: arrows move, Space/Enter act, F flags ----
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (pausedRef.current) return;
      const g = viewRef.current;
      const { rows: R, cols: C } = dims(g.board);
      const cur = cursor ?? { r: Math.floor(R / 2), c: Math.floor(C / 2) };
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setCursor({
          r: Math.min(R - 1, Math.max(0, cur.r + dr)),
          c: Math.min(C - 1, Math.max(0, cur.c + dc)),
        });
      };
      switch (e.key) {
        case "ArrowUp":
          return move(-1, 0);
        case "ArrowDown":
          return move(1, 0);
        case "ArrowLeft":
          return move(0, -1);
        case "ArrowRight":
          return move(0, 1);
        case " ":
        case "Enter":
          if (!cursor) return;
          e.preventDefault();
          act(cursor.r, cursor.c);
          return;
        case "f":
        case "F":
          if (!cursor) return;
          e.preventDefault();
          toggleFlag(cursor.r, cursor.c);
          return;
        default:
          return;
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const status = view.status;
  const over = status === "won" || status === "lost";
  const hazardsLeft = Math.max(0, mines - flags);
  const nextDifficulty =
    DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(difficulty) + 1, DIFFICULTIES.length - 1)];

  return (
    <div className="game-root relative">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[1.75rem]"
        aria-hidden
      >
        <img src={art.bg} alt="" className="h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-white/40" />
      </div>

      {/* HUD: difficulty + hazards left */}
      <div className="flex w-full max-w-xl shrink-0 items-center justify-between gap-2 px-1 pt-1">
        <div
          role="group"
          aria-label="Difficulty"
          className="flex rounded-full bg-white/75 p-1 shadow-sm ring-1 ring-[var(--ink)]/10 backdrop-blur-sm"
        >
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={difficulty === d}
              disabled={paused}
              onClick={() => {
                if (d === difficulty && status === "ready") return;
                restart(d);
              }}
              className={cn(
                "min-h-9 rounded-full px-3 text-sm font-black transition-colors",
                difficulty === d
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm"
                  : "text-[var(--ink)]/70 active:bg-black/5",
              )}
            >
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </div>
        <StatPill className="min-h-11 pl-1.5 pr-3.5 text-lg">
          <img src={art.hazard} alt="" className="size-8 object-contain" />
          <span aria-label={`${hazardsLeft} ${art.hazardWord} left`}>×{hazardsLeft}</span>
        </StatPill>
      </div>

      <FitBox aspect={cols / rows} className="px-1">
        {(size) => {
          const tile = size.width / cols;
          const radius = Math.max(5, Math.round(tile * 0.2));
          const gap = tile > 44 ? 4 : 3;
          return (
            <>
              <div
                key={status === "lost" ? `shake-${view.moveId}` : "board"}
                className={cn(
                  styles.board,
                  "grid h-full w-full rounded-[1.4rem] border-4 border-white/90 shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition-shadow",
                  status === "lost" && styles.shake,
                  status === "won" && styles.celebrate,
                  mode === "flag" && !over && "ring-4 ring-amber-300 ring-offset-2 ring-offset-transparent",
                )}
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  gap,
                  padding: gap + 2,
                  background: art.frame,
                }}
                onPointerMove={onPointerMove}
                onPointerUp={() => {
                  if (press.current && !press.current.fired) window.clearTimeout(press.current.timer);
                  setPressing(null);
                }}
                onPointerCancel={cancelPress}
                onPointerLeave={cancelPress}
              >
                {view.board.map((row, r) =>
                  row.map((cell, c) => {
                    const key = `${r}-${c}`;
                    const revealDelay = view.reveal[key];
                    const animating = cell.open && revealDelay !== undefined;
                    const plantDelay = view.planted[key];
                    const isHit = view.hit === key;
                    const wrongFlag = status === "lost" && cell.flagged && !cell.mine;
                    const isCursor = cursor?.r === r && cursor?.c === c;
                    const label = cell.open
                      ? cell.mine
                        ? art.hazardWordOne
                        : cell.adj > 0
                          ? `${cell.adj}`
                          : "empty"
                      : cell.flagged
                        ? `${art.markLabel} marked`
                        : "hidden square";
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={`Row ${r + 1}, column ${c + 1}: ${label}`}
                        tabIndex={-1}
                        className={cn(
                          styles.tile,
                          "relative block h-full w-full touch-manipulation outline-none",
                          isCursor && "z-10 ring-4 ring-sky-400",
                        )}
                        style={{ borderRadius: radius }}
                        onPointerDown={(e) => onPointerDown(e, r, c)}
                        onClick={() => onTileClick(r, c)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          // Mouse right-click flags; a touch long-press already did.
                          if (press.current?.fired) return;
                          toggleFlag(r, c);
                        }}
                      >
                        {cell.open ? (
                          <span
                            className={cn("absolute inset-0", isHit && styles.hitBurst)}
                            style={{
                              borderRadius: radius,
                              background: isHit
                                ? "radial-gradient(circle, #fecdd3 0%, #fb7185 100%)"
                                : cell.mine
                                  ? "radial-gradient(circle, #fff1f2 0%, #fecdd3 100%)"
                                  : art.openTint[(r + c) % 2],
                              boxShadow: "inset 0 2px 4px rgba(0,0,0,0.14)",
                            }}
                          />
                        ) : null}

                        {cell.open && cell.mine ? (
                          <img
                            src={art.hazard}
                            alt=""
                            draggable={false}
                            className={cn(
                              "absolute inset-[6%] h-[88%] w-[88%] object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.3)]",
                              animating && styles.hazardIn,
                            )}
                            style={animating ? { animationDelay: `${revealDelay}ms` } : undefined}
                          />
                        ) : null}

                        {cell.open && !cell.mine && cell.adj > 0 ? (
                          <span
                            className={cn(
                              "absolute inset-0 flex items-center justify-center font-black leading-none",
                              animating && styles.popIn,
                            )}
                            style={{
                              color: NUMBER_COLORS[cell.adj],
                              fontSize: Math.round(tile * 0.62),
                              textShadow: "0 2px 0 rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.8)",
                              animationDelay: animating ? `${revealDelay + 60}ms` : undefined,
                            }}
                          >
                            {cell.adj}
                          </span>
                        ) : null}

                        {!cell.open || animating ? (
                          <span
                            className={cn(
                              "absolute inset-0",
                              styles.cover,
                              animating && styles.coverOff,
                              pressing === key && styles.pressing,
                            )}
                            style={{
                              ...coverStyle(art, r, c),
                              borderRadius: radius,
                              animationDelay: animating ? `${revealDelay}ms` : undefined,
                            }}
                          />
                        ) : null}

                        {cell.flagged && !cell.open ? (
                          <img
                            src={art.flag}
                            alt=""
                            draggable={false}
                            className={cn(
                              "absolute inset-[8%] h-[84%] w-[84%] object-contain drop-shadow-[0_3px_2px_rgba(0,0,0,0.35)]",
                              plantDelay !== undefined && styles.plant,
                              wrongFlag && "opacity-60 grayscale",
                            )}
                            style={
                              plantDelay !== undefined
                                ? { animationDelay: `${plantDelay}ms` }
                                : undefined
                            }
                          />
                        ) : null}

                        {wrongFlag ? (
                          <span
                            className="absolute inset-0 flex items-center justify-center font-black text-rose-600"
                            style={{ fontSize: Math.round(tile * 0.7), textShadow: "0 2px 0 white" }}
                          >
                            ✕
                          </span>
                        ) : null}

                        {pressing === key ? (
                          <span
                            className={cn(
                              "pointer-events-none absolute inset-0 border-4 border-white",
                              styles.holdRing,
                            )}
                            style={{ borderRadius: radius }}
                          />
                        ) : null}
                      </button>
                    );
                  }),
                )}
              </div>

              {status === "ready" && !paused ? (
                <div className="pointer-events-none absolute inset-x-0 top-[38%] z-10 flex justify-center px-6">
                  <div
                    className={cn(
                      styles.hintBubble,
                      "max-w-[17rem] rounded-3xl border-4 border-white bg-[var(--surface)]/95 px-4 py-3 text-center shadow-xl",
                    )}
                  >
                    <p className="text-xl font-black text-[var(--ink)]">
                      {art.digIcon} {art.startTitle}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-snug text-[var(--ink)]/70">
                      {art.startHint}
                    </p>
                  </div>
                </div>
              ) : null}

              {confetti ? (
                <div
                  key={confetti.id}
                  className="pointer-events-none absolute inset-0 z-10 overflow-visible"
                  aria-hidden
                >
                  {confetti.pieces.map((p, i) => (
                    <span
                      key={i}
                      className={styles.confetti}
                      style={
                        {
                          background: p.color,
                          borderRadius: p.round ? "50%" : 3,
                          animationDelay: `${p.delay}ms`,
                          "--dx": `${p.dx}px`,
                          "--dy": `${p.dy}px`,
                          "--rot": `${p.rot}deg`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              ) : null}

              <GameOverlay
                show={showOverlay && status === "won"}
                tone="win"
                emoji={<img src={art.flag} alt="" className="mx-auto size-20 object-contain" />}
                title={art.winTitle}
                subtitle={
                  <>
                    {art.win}
                    <br />
                    <span className="font-black text-[var(--ink)]">+{score} points</span>
                  </>
                }
                actionLabel="Play again"
                onAction={() => restart()}
                secondary={
                  difficulty !== "hard" ? (
                    <button
                      type="button"
                      className="kid-btn kid-btn-secondary mt-1 min-h-12 w-full text-base"
                      onClick={() => restart(nextDifficulty)}
                    >
                      Try {DIFFICULTY_LABELS[nextDifficulty]} →
                    </button>
                  ) : null
                }
              />
              <GameOverlay
                show={showOverlay && status === "lost"}
                tone="lose"
                emoji={<img src={art.hazard} alt="" className="mx-auto size-24 object-contain" />}
                title={art.loseTitle}
                subtitle={art.lose}
                actionLabel="Play again"
                onAction={() => restart()}
                secondary={
                  view.undo && view.undosLeft > 0 ? (
                    <button
                      type="button"
                      className="kid-btn kid-btn-secondary mt-1 min-h-12 w-full text-base"
                      onClick={takeBack}
                    >
                      ↩️ Take it back
                    </button>
                  ) : null
                }
              />
            </>
          );
        }}
      </FitBox>

      {/* Tool toggle: big, thumb-reachable */}
      <div
        role="group"
        aria-label="Tool"
        className="grid w-full max-w-md shrink-0 grid-cols-2 gap-3 px-1 pb-1"
      >
        <button
          type="button"
          aria-pressed={mode === "dig"}
          disabled={paused}
          onClick={() => {
            setMode("dig");
            sfx("tap");
          }}
          className={cn(
            "kid-btn min-h-16 text-xl",
            mode === "dig" ? "kid-btn-primary" : "kid-btn-secondary opacity-75",
          )}
        >
          <span className="text-2xl leading-none" aria-hidden>
            {art.digIcon}
          </span>
          {art.digLabel}
        </button>
        <button
          type="button"
          aria-pressed={mode === "flag"}
          disabled={paused}
          onClick={() => {
            setMode("flag");
            sfx("tap", { pitch: 1.2 });
          }}
          className={cn(
            "kid-btn min-h-16 text-xl",
            mode === "flag"
              ? "bg-gradient-to-b from-amber-200 to-amber-400 text-amber-950 shadow-[0_5px_0_#b45309] ring-4 ring-amber-200"
              : "kid-btn-secondary opacity-75",
          )}
        >
          <img src={art.flag} alt="" className="size-9 object-contain" />
          {art.markLabel}
        </button>
      </div>
    </div>
  );
}
