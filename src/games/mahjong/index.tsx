"use client";

/* eslint-disable @next/next/no-img-element -- small static tile art */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Lightbulb, Shuffle } from "lucide-react";
import type { GameProps } from "@/lib/game-registry";
import { GameOverlay, StatPill } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import {
  blockedCopy,
  introCopy,
  kindLabel,
  kindsFor,
  layerColors,
  tableSrc,
  tileSrc,
  winSrc,
} from "./art";
import {
  LEVELS,
  coverLists,
  dealWithPlan,
  freeIds,
  freePairs,
  pairKinds,
  solveBoard,
  type Slot,
} from "./deal";

/** Tiles hold a kind index (0–7) so a profile switch just swaps the art. */
type Tiles = Map<number, number>;

type Anim = { a: number; b: number; mx: number; my: number; phase: "meet" | "pop" };
type Burst = { id: number; x: number; y: number };
type Phase = "play" | "cleared";

const SCORE_PER_PAIR = 10;
const LEVEL_BONUS = 50;
const KIND_IDS = [0, 1, 2, 3, 4, 5, 6, 7];

function newDeal(levelIndex: number) {
  const lvl = LEVELS[levelIndex];
  const kinds = pairKinds(KIND_IDS, lvl.slots.length / 2, Math.random);
  return dealWithPlan(lvl.slots, kinds);
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

const TILE_RATIO = 1.2;
const DEPTH = 0.09;

type Geo = {
  tw: number;
  th: number;
  d: number;
  pos: (s: Slot) => { x: number; y: number };
};

function geometry(W: number, H: number, slots: Slot[]): Geo | null {
  if (W <= 0 || H <= 0) return null;
  const landscape = W / H > 1.15;
  const X = (s: Slot) => (landscape ? s.y : s.x);
  const Y = (s: Slot) => (landscape ? s.x : s.y);
  const maxX = Math.max(...slots.map(X));
  const maxY = Math.max(...slots.map(Y));
  const maxZ = Math.max(...slots.map((s) => s.z));
  const cols = maxX / 2 + 1;
  const rows = maxY / 2 + 1;
  const pad = Math.min(W, H) * 0.035;
  const byW = (W - pad * 2) / (cols + DEPTH * (maxZ + 1));
  const byH = (H - pad * 2) / (rows * TILE_RATIO + DEPTH * (maxZ + 1));
  const tw = Math.min(byW, byH, 170);
  const th = tw * TILE_RATIO;
  const d = tw * DEPTH;
  const boardW = cols * tw + d * (maxZ + 1);
  const boardH = rows * th + d * (maxZ + 1);
  const ox = (W - boardW) / 2 + maxZ * d;
  const oy = (H - boardH) / 2 + maxZ * d;
  return {
    tw,
    th,
    d,
    pos: (s) => ({ x: ox + (X(s) / 2) * tw - s.z * d, y: oy + (Y(s) / 2) * th - s.z * d }),
  };
}

function extrude(d: number, color: string, z: number) {
  const steps = Math.max(2, Math.min(9, Math.round(d)));
  const parts: string[] = [];
  for (let i = 1; i <= steps; i++) {
    const o = (d * i) / steps;
    parts.push(`${o.toFixed(1)}px ${o.toFixed(1)}px 0 ${i === steps ? `color-mix(in srgb, ${color} 70%, black)` : color}`);
  }
  const blur = d * (2.2 + z * 1.2);
  parts.push(`${(d + blur * 0.4).toFixed(1)}px ${(d + blur * 0.6).toFixed(1)}px ${blur.toFixed(1)}px rgba(30,15,40,${0.28 + z * 0.06})`);
  return parts.join(", ");
}

export default function MahjongGame({ profileId, paused, onScoreChange }: GameProps) {
  const [boxRef, box] = useBoxSize();
  const [levelIndex, setLevelIndex] = useState(0);
  const [firstDeal] = useState(() => newDeal(0));
  const [tiles, setTiles] = useState<Tiles>(firstDeal.tiles);
  const [plan, setPlan] = useState(firstDeal.plan);
  const [selected, setSelected] = useState<number | null>(null);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [shakeIds, setShakeIds] = useState<number[]>([]);
  const [flashIds, setFlashIds] = useState<number[]>([]);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Phase>("play");
  const [shuffleNudge, setShuffleNudge] = useState(false);

  const timers = useRef(new Set<number>());
  const burstId = useRef(0);

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

  useEffect(() => {
    onScoreChange?.(score);
  }, [score, onScoreChange]);

  const level = LEVELS[levelIndex];
  const slots = level.slots;
  const { coveredBy } = useMemo(() => coverLists(slots), [slots]);
  const free = useMemo(() => new Set(freeIds(slots, tiles, coveredBy)), [slots, tiles, coveredBy]);
  const geo = geometry(box.width, box.height, slots);
  const kinds = kindsFor(profileId);
  const colors = layerColors(profileId);
  const totalPairs = slots.length / 2;
  const pairsDone = totalPairs - tiles.size / 2;

  const say = useCallback(
    (text: string, ms = 1800) => {
      const key = Date.now() + Math.random();
      setToast({ text, key });
      later(() => setToast((t) => (t?.key === key ? null : t)), ms);
    },
    [later],
  );

  // Friendly intro whenever a level starts.
  const introShown = useRef(-1);
  useEffect(() => {
    if (introShown.current === levelIndex) return;
    const t = window.setTimeout(() => {
      introShown.current = levelIndex;
      say(introCopy(levelIndex), 2400);
    }, 350);
    return () => window.clearTimeout(t);
  }, [levelIndex, say]);

  const doShuffle = useCallback(
    (current: Tiles) => {
      if (current.size < 2) return;
      const ids = [...current.keys()];
      const counts = new Map<number, number>();
      for (const k of current.values()) counts.set(k, (counts.get(k) ?? 0) + 1);
      const pairList: number[] = [];
      counts.forEach((n, k) => {
        for (let i = 0; i < n / 2; i++) pairList.push(k);
      });
      const next = dealWithPlan(slots, pairList, ids);
      setSpinning(true);
      setSelected(null);
      setHint(null);
      setShuffleNudge(false);
      sfx("flip");
      later(() => {
        setTiles(next.tiles);
        setPlan(next.plan);
        sfx("flip", { pitch: 1.3 });
      }, 260);
      later(() => setSpinning(false), 560);
    },
    [slots, later],
  );

  const afterRemoval = useCallback(
    (next: Tiles) => {
      if (next.size === 0) {
        later(() => {
          sfx("win");
          haptic(40);
          setScore((s) => s + LEVEL_BONUS);
          setPhase("cleared");
        }, 250);
        return;
      }
      if (freePairs(slots, next, coveredBy).length === 0) {
        setShuffleNudge(true);
        say("No pairs left — shuffling!");
        later(() => doShuffle(next), 1100);
      }
    },
    [slots, coveredBy, later, say, doShuffle],
  );

  const onTap = (id: number) => {
    if (paused || anim || spinning || phase !== "play" || !geo) return;
    if (!tiles.has(id)) return;
    if (!free.has(id)) {
      setShakeIds([id]);
      const above = coveredBy[id].filter((c) => tiles.has(c));
      setFlashIds(above);
      sfx("miss", { pitch: 0.8 });
      haptic(15);
      say(blockedCopy(profileId));
      later(() => setShakeIds([]), 400);
      later(() => setFlashIds([]), 900);
      return;
    }
    if (selected === id) {
      setSelected(null);
      sfx("tap", { pitch: 0.8 });
      return;
    }
    if (selected === null) {
      setSelected(id);
      sfx("pop", { pitch: 1.1 });
      haptic(6);
      return;
    }
    const a = selected;
    const b = id;
    if (tiles.get(a) !== tiles.get(b)) {
      setShakeIds([a, b]);
      setSelected(null);
      sfx("miss");
      haptic(20);
      later(() => setShakeIds([]), 400);
      return;
    }
    // Match! Fly together, then pop with sparkles.
    const pa = geo.pos(slots[a]);
    const pb = geo.pos(slots[b]);
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2 - geo.th * 0.15;
    setSelected(null);
    setHint(null);
    setAnim({ a, b, mx, my, phase: "meet" });
    sfx("pop", { pitch: 1.4 });
    later(() => {
      setAnim((cur) => (cur ? { ...cur, phase: "pop" } : cur));
      sfx("match");
      haptic(12);
      const bid = ++burstId.current;
      setBursts((list) => [
        ...list,
        { id: bid, x: mx + geo.tw / 2, y: my + geo.th / 2 },
      ]);
      later(() => setBursts((list) => list.filter((x) => x.id !== bid)), 900);
    }, 280);
    later(() => {
      const next = new Map(tiles);
      next.delete(a);
      next.delete(b);
      setTiles(next);
      setAnim(null);
      setScore((s) => s + SCORE_PER_PAIR);
      afterRemoval(next);
    }, 520);
  };

  const showHint = () => {
    if (paused || anim || spinning || phase !== "play") return;
    const pairs = freePairs(slots, tiles, coveredBy);
    if (!pairs.length) {
      doShuffle(tiles);
      return;
    }
    const same = (p: [number, number], q: [number, number]) =>
      (p[0] === q[0] && p[1] === q[1]) || (p[0] === q[1] && p[1] === q[0]);
    let pick: [number, number] | undefined = plan.find(
      (p) => tiles.has(p[0]) && tiles.has(p[1]) && pairs.some((q) => same(p, q)),
    );
    if (!pick) pick = solveBoard(slots, tiles, 3000)?.[0];
    if (!pick) pick = pairs[0];
    setSelected(null);
    setHint(pick);
    sfx("star", { pitch: 1.2 });
    later(() => setHint((h) => (h === pick ? null : h)), 2600);
  };

  const onShuffleClick = () => {
    if (paused || anim || spinning || phase !== "play") return;
    doShuffle(tiles);
  };

  const nextLevel = () => {
    const nextIndex = levelIndex + 1 < LEVELS.length ? levelIndex + 1 : 0;
    if (nextIndex === 0) {
      setScore(0);
      onScoreChange?.(0);
    }
    const d = newDeal(nextIndex);
    setLevelIndex(nextIndex);
    setTiles(d.tiles);
    setPlan(d.plan);
    setSelected(null);
    setHint(null);
    setPhase("play");
    setShuffleNudge(false);
    sfx("levelUp");
  };

  // Keyboard: H = hint, S = shuffle, Esc = deselect.
  const keysRef = useRef({ showHint, onShuffleClick });
  useEffect(() => {
    keysRef.current = { showHint, onShuffleClick };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h") keysRef.current.showHint();
      else if (e.key === "s") keysRef.current.onShuffleClick();
      else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lastLevel = levelIndex === LEVELS.length - 1;

  return (
    <div className="game-root">
      <style>{CSS}</style>
      <div
        className={cn(
          "relative min-h-0 w-full flex-1 overflow-hidden rounded-[1.4rem] shadow-[0_10px_30px_rgba(0,0,0,0.18)] ring-4 ring-white/70",
          paused && "pointer-events-none",
        )}
      >
        <img
          src={tableSrc(profileId)}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-[3px]"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              profileId === "keira"
                ? "radial-gradient(90% 70% at 50% 45%, rgba(255,247,251,0.72), rgba(255,228,241,0.55) 60%, rgba(120,40,100,0.35))"
                : "radial-gradient(90% 70% at 50% 45%, rgba(240,249,255,0.6), rgba(186,230,253,0.4) 60%, rgba(0,30,50,0.5))",
          }}
        />
        <div ref={boxRef} className="absolute inset-0" onClick={() => setSelected(null)}>
          {geo
            ? slots.map((s) => {
                const kind = tiles.get(s.id);
                if (kind === undefined) return null;
                const p = geo.pos(s);
                const isFree = free.has(s.id);
                const isSel = selected === s.id;
                const isHint = hint?.includes(s.id) ?? false;
                const inAnim = anim && (anim.a === s.id || anim.b === s.id);
                const fw = geo.tw - geo.d;
                const fh = geo.th - geo.d;
                let transform = isSel ? `translate(${-geo.d * 0.4}px, ${-geo.d * 1.2}px) scale(1.06)` : "";
                if (inAnim && anim) {
                  const dx = anim.mx - p.x;
                  const dy = anim.my - p.y;
                  const side = anim.a === s.id ? -1 : 1;
                  transform =
                    anim.phase === "meet"
                      ? `translate(${dx + side * fw * 0.28}px, ${dy}px) scale(1.12) rotate(${side * 6}deg)`
                      : `translate(${dx}px, ${dy - geo.th * 0.4}px) scale(0.2) rotate(${side * 40}deg)`;
                }
                const tileKind = kinds[kind];
                const color = colors[Math.min(s.z, colors.length - 1)];
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`${kindLabel(tileKind)} tile${isFree ? "" : ", covered"}`}
                    className={cn(
                      "mj-tile absolute left-0 top-0 p-0",
                      shakeIds.includes(s.id) && "mj-shake",
                      spinning && "mj-spin",
                    )}
                    style={{
                      width: geo.tw,
                      height: geo.th,
                      transform: `translate(${p.x}px, ${p.y}px)`,
                      zIndex: inAnim ? 5000 : s.z * 1000 + (isSel ? 900 : 0) + s.y * 10 + s.x,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTap(s.id);
                    }}
                  >
                    <div
                      className={cn(
                        "mj-face absolute left-0 top-0 overflow-hidden",
                        !isFree && "mj-blocked",
                        isSel && "mj-selected",
                        isHint && "mj-hint",
                        flashIds.includes(s.id) && "mj-flash",
                        inAnim && "mj-flying",
                        inAnim && anim?.phase === "pop" && "mj-pop",
                      )}
                      style={
                        {
                          width: fw,
                          height: fh,
                          borderRadius: fw * 0.14,
                          transform,
                          "--edge": color,
                          boxShadow: extrude(geo.d, color, s.z),
                        } as CSSProperties
                      }
                    >
                      <div
                        className="absolute inset-x-0 top-0"
                        style={{ height: fh * 0.07, background: color, opacity: s.z ? 0.8 : 0.35 }}
                      />
                      <img
                        src={tileSrc(tileKind)}
                        alt=""
                        draggable={false}
                        className="absolute object-cover mix-blend-multiply"
                        style={{
                          left: fw * 0.06,
                          top: fh * 0.1,
                          width: fw * 0.88,
                          height: fh * 0.84,
                          borderRadius: fw * 0.1,
                        }}
                      />
                      <div className="mj-gloss pointer-events-none absolute inset-0" />
                    </div>
                  </button>
                );
              })
            : null}

          {geo
            ? bursts.map((b) => (
                <div
                  key={b.id}
                  className="pointer-events-none absolute"
                  style={{ left: b.x, top: b.y, zIndex: 6000 }}
                >
                  {Array.from({ length: 14 }, (_, i) => {
                    const a = (i / 14) * Math.PI * 2;
                    const dist = geo.tw * (0.8 + (i % 3) * 0.3);
                    return (
                      <span
                        key={i}
                        className="mj-spark"
                        style={
                          {
                            "--tx": `${Math.cos(a) * dist}px`,
                            "--ty": `${Math.sin(a) * dist}px`,
                            fontSize: geo.tw * (i % 2 ? 0.22 : 0.32),
                          } as CSSProperties
                        }
                      >
                        {i % 3 === 0 ? "✨" : i % 3 === 1 ? "⭐" : "💫"}
                      </span>
                    );
                  })}
                  <span className="mj-plus" style={{ fontSize: geo.tw * 0.36 }}>
                    +{SCORE_PER_PAIR}
                  </span>
                </div>
              ))
            : null}
        </div>

        {toast ? (
          <div
            key={toast.key}
            className="mj-toast pointer-events-none absolute left-1/2 top-3 z-[7000] max-w-[92%] rounded-full bg-white/95 px-4 py-2 text-center text-base font-black text-[var(--ink)] shadow-lg ring-2 ring-[var(--accent)]"
          >
            {toast.text}
          </div>
        ) : null}

        {phase === "cleared" ? <Confetti /> : null}
        <GameOverlay
          show={phase === "cleared"}
          tone="win"
          className="z-[8000]"
          emoji={
            <img
              src={winSrc(profileId)}
              alt=""
              draggable={false}
              className="float-slow mx-auto aspect-video w-60 max-w-full rounded-2xl border-4 border-white object-cover shadow-lg"
            />
          }
          title={lastLevel ? "You matched them all!" : `Level ${levelIndex + 1} cleared!`}
          subtitle={
            lastLevel
              ? `Every level done — ${score} points!`
              : `${totalPairs} pairs matched. Ready for a taller tower?`
          }
          actionLabel={lastLevel ? "Play again" : "Next level"}
          onAction={nextLevel}
        />
      </div>

      <div className="flex w-full shrink-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <StatPill className="self-start">
            Level {levelIndex + 1}/{LEVELS.length}
          </StatPill>
          <div
            className="h-3 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-[var(--ink)]/10"
            aria-label={`${pairsDone} of ${totalPairs} pairs`}
          >
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${(pairsDone / totalPairs) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          className="kid-btn kid-btn-secondary min-h-14 px-4 text-lg"
          onClick={showHint}
          aria-label="Hint"
        >
          <Lightbulb className="size-6" strokeWidth={3} />
          Hint
        </button>
        <button
          type="button"
          className={cn(
            "kid-btn kid-btn-primary min-h-14 px-4 text-lg",
            shuffleNudge && "mj-nudge",
          )}
          onClick={onShuffleClick}
          aria-label="Shuffle"
        >
          <Shuffle className="size-6" strokeWidth={3} />
          Mix
        </button>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 12) * 0.12,
        dur: 1.8 + ((i * 7) % 10) / 10,
        color: ["#f472b6", "#fde047", "#34d399", "#60a5fa", "#a78bfa", "#fb923c"][i % 6],
        rot: (i * 53) % 360,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[7500] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="mj-confetti"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

const CSS = `
.mj-tile { background: none; border: 0; transition: transform 200ms ease; -webkit-tap-highlight-color: transparent; }
.mj-face {
  background: linear-gradient(160deg, #fffefa 0%, #fff8ea 55%, #f1e3c9 100%);
  outline: 2px solid color-mix(in srgb, var(--edge) 55%, white);
  outline-offset: -2px;
  transition: transform 260ms cubic-bezier(.3,1.4,.5,1), filter 250ms ease, opacity 220ms ease;
}
.mj-gloss { border-radius: inherit; background: linear-gradient(150deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 75%, rgba(120,80,40,0.10) 100%); }
.mj-blocked { filter: brightness(0.62) saturate(0.5) contrast(0.9); }
.mj-selected { outline: 4px solid #fbbf24; outline-offset: 0; filter: drop-shadow(0 0 10px rgba(251,191,36,0.95)); }
.mj-hint { animation: mj-hint 0.8s ease-in-out infinite; }
@keyframes mj-hint {
  0%,100% { outline: 4px solid #a3e635; outline-offset: 0; filter: drop-shadow(0 0 6px rgba(163,230,53,0.9)); }
  50% { outline: 5px solid #d9f99d; outline-offset: 1px; filter: drop-shadow(0 0 14px rgba(190,242,100,1)); }
}
.mj-flash { animation: mj-flash 0.45s ease-in-out 2; }
@keyframes mj-flash { 50% { outline: 4px solid #fb923c; outline-offset: 0; filter: drop-shadow(0 0 12px rgba(251,146,60,1)); } }
.mj-flying { transition: transform 280ms cubic-bezier(.3,.9,.4,1.1), opacity 240ms ease; }
.mj-pop { opacity: 0; transition: transform 240ms ease-in, opacity 240ms ease-in; }
.mj-shake { animation: mj-shake 0.38s ease; }
@keyframes mj-shake {
  0%,100% { margin-left: 0; } 20% { margin-left: -7px; } 40% { margin-left: 7px; } 60% { margin-left: -5px; } 80% { margin-left: 4px; }
}
.mj-spin .mj-face { animation: mj-spin 0.52s ease-in-out; }
@keyframes mj-spin { 0% { transform: rotateY(0) } 50% { transform: rotateY(90deg) scale(0.9) } 100% { transform: rotateY(0) } }
.mj-spark {
  position: absolute; left: 0; top: 0; line-height: 1;
  transform: translate(-50%, -50%);
  animation: mj-spark 800ms cubic-bezier(.1,.7,.3,1) forwards;
}
@keyframes mj-spark {
  0% { transform: translate(-50%,-50%) scale(0.3); opacity: 1; }
  100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1.1) rotate(90deg); opacity: 0; }
}
.mj-plus {
  position: absolute; left: 0; top: 0; font-weight: 900; color: #fde047;
  -webkit-text-stroke: 5px #7c2d12; paint-order: stroke fill; white-space: nowrap;
  transform: translate(-50%, -50%);
  animation: mj-plus 900ms ease-out forwards;
}
@keyframes mj-plus { 0% { transform: translate(-50%,-30%) scale(0.6); opacity: 0; } 20% { opacity: 1; transform: translate(-50%,-60%) scale(1.1); } 100% { transform: translate(-50%,-160%) scale(1); opacity: 0; } }
.mj-toast { transform: translateX(-50%); animation: mj-toast 1.8s ease forwards; }
@keyframes mj-toast {
  0% { opacity: 0; transform: translate(-50%, -8px) scale(0.85); }
  10% { opacity: 1; transform: translate(-50%, 0) scale(1); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -6px); }
}
.mj-nudge { animation: mj-nudge 0.7s ease-in-out infinite; }
@keyframes mj-nudge { 50% { transform: scale(1.08); } }
.mj-confetti {
  position: absolute; top: -20px; width: 10px; height: 16px; border-radius: 3px;
  animation-name: mj-fall; animation-timing-function: linear; animation-iteration-count: infinite;
}
@keyframes mj-fall { to { top: 105%; transform: rotate(540deg) translateX(30px); } }
@media (prefers-reduced-motion: reduce) {
  .mj-hint, .mj-spark, .mj-plus, .mj-confetti, .mj-nudge { animation-duration: 1ms; }
}
`;
