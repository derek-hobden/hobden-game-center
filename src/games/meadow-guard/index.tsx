"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { GameProps } from "@/lib/game-registry";
import { GameOverlay } from "@/components/game-kit";
import { haptic, isMuted, onMutedChange, setMuted, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { H, LEVELS, PLANTS, PLANT_ORDER, W, type PlantKind } from "./balance";
import { drawFrame } from "./draw";
import {
  begin,
  choose,
  createMatch,
  levelDef,
  resetMatch,
  setHover,
  step,
  tapLawn,
  type Match,
  type Phase,
} from "./logic";

type TrayChoice = PlantKind | "trowel";

type Ui = {
  phase: Phase;
  level: number;
  sun: number;
  hearts: number;
  selected: TrayChoice | null;
  cd: Record<PlantKind, number>;
  kills: number;
  total: number;
};

function useMuted() {
  return useSyncExternalStore(onMutedChange, isMuted, () => false);
}

function snapshot(m: Match): Ui {
  return {
    phase: m.phase,
    level: m.level,
    sun: m.sun,
    hearts: m.hearts,
    selected: m.selected,
    cd: { ...m.cd },
    kills: m.kills,
    total: levelDef(m.level).spawns.length,
  };
}

function sig(ui: Ui) {
  const cds = PLANT_ORDER.map((k) => Math.ceil(ui.cd[k] * 4)).join(",");
  return `${ui.phase}|${ui.level}|${ui.sun}|${ui.hearts}|${ui.selected}|${ui.kills}|${cds}`;
}

function paintBoard(
  canvas: HTMLCanvasElement | null,
  stage: HTMLDivElement | null,
  hud: HTMLDivElement | null,
  tray: HTMLDivElement | null,
  m: Match,
  font: string,
) {
  if (!canvas || !stage) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = stage.clientWidth;
  const cssH = stage.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const bw = Math.max(1, Math.round(cssW * dpr));
  const bh = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const hudH = (hud?.offsetHeight ?? 0) * dpr;
  const trayH = (tray?.offsetHeight ?? 0) * dpr;
  const lawnH = Math.max(1, bh - hudH - trayH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#166534";
  ctx.fillRect(0, 0, bw, bh);
  ctx.setTransform(bw / W, 0, 0, lawnH / H, 0, hudH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawFrame(ctx, m, font);
}

function gamePoint(
  e: { clientX: number; clientY: number },
  stage: HTMLDivElement,
  hud: HTMLDivElement | null,
  tray: HTMLDivElement | null,
) {
  const r = stage.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const hudH = hud?.offsetHeight ?? 0;
  const trayH = tray?.offsetHeight ?? 0;
  const lawnH = Math.max(1, r.height - hudH - trayH);
  return {
    x: ((e.clientX - r.left) / r.width) * W,
    y: ((e.clientY - r.top - hudH) / lawnH) * H,
  };
}

export default function MeadowGuard({ paused, onScoreChange }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<Match | null>(null);
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const fontRef = useRef("Fredoka, Trebuchet MS, sans-serif");
  const [ui, setUi] = useState<Ui>(() => snapshot(createMatch(1, 0)));
  const [portrait, setPortrait] = useState(false);
  const [dismissRotate, setDismissRotate] = useState(false);
  const [localPause, setLocalPause] = useState(false);
  const localPauseRef = useRef(false);
  const muted = useMuted();

  useEffect(() => {
    pausedRef.current = paused;
    localPauseRef.current = localPause;
  }, [paused, localPause]);
  useEffect(() => {
    scoreCb.current = onScoreChange;
  }, [onScoreChange]);

  useEffect(() => {
    const apply = () => {
      const shortSide = Math.min(window.innerWidth, window.innerHeight);
      const portraitNow = window.innerHeight > window.innerWidth && shortSide < 900;
      setPortrait(portraitNow);
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  useEffect(() => {
    fontRef.current = getComputedStyle(document.body).fontFamily || fontRef.current;
    const m = createMatch(1, 0);
    simRef.current = m;
    onScoreChange?.(0);
    let raf = 0;
    let last = performance.now();
    let seen = sig(snapshot(m));
    let reported = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !localPauseRef.current) step(m, dt);
      paintBoard(canvasRef.current, stageRef.current, hudRef.current, trayRef.current, m, fontRef.current);
      if (m.cues.length) {
        for (const cue of m.cues) sfx(cue);
        if (m.cues.includes("pop")) haptic(12);
        if (m.cues.includes("hit") && m.houseHurt > 0.3) haptic(20);
        m.cues.length = 0;
      }
      if (m.score !== reported) {
        reported = m.score;
        scoreCb.current?.(m.score);
      }
      const next = snapshot(m);
      const mark = sig(next);
      if (mark !== seen) {
        seen = mark;
        setUi(next);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onScoreChange]);

  const sync = () => {
    const m = simRef.current;
    if (!m) return;
    setUi(snapshot(m));
  };

  const onPick = (kind: TrayChoice) => {
    const m = simRef.current;
    if (!m || paused || localPause) return;
    choose(m, kind);
    sync();
  };

  const hold = paused || localPause;

  const onLawnPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const m = simRef.current;
    const stage = stageRef.current;
    if (!m || !stage) return;
    if (e.type === "pointerleave") {
      m.hoverCol = -1;
      m.hoverRow = -1;
      return;
    }
    const point = gamePoint(e, stage, hudRef.current, trayRef.current);
    if (!point) return;
    if (e.type === "pointermove") {
      setHover(m, point.x, point.y);
      return;
    }
    if (hold) return;
    e.preventDefault();
    tapLawn(m, point.x, point.y);
    sync();
  };

  const def = levelDef(ui?.level ?? 1);
  const phase = ui?.phase ?? "ready";

  const hearts = ui?.hearts ?? def.hearts;

  return (
    <div ref={stageRef} className="fixed inset-0 z-50 overflow-hidden bg-[#14532d]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onLawnPointer}
        onPointerMove={onLawnPointer}
        onPointerLeave={onLawnPointer}
      />
      <div
        ref={hudRef}
        className="absolute inset-x-0 top-0 z-20 flex items-center gap-1.5 bg-gradient-to-b from-emerald-950/80 to-emerald-950/0 px-1.5 pb-1"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 4px)",
          paddingLeft: "max(env(safe-area-inset-left), 6px)",
          paddingRight: "max(env(safe-area-inset-right), 6px)",
        }}
      >
        <Link
          href="/"
          aria-label="Back to menu"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/90 text-[var(--ink)] shadow"
          onClick={() => sfx("tap")}
        >
          <ArrowLeft className="size-5" strokeWidth={3} />
        </Link>
        <span className="inline-flex h-9 items-center gap-1 rounded-xl bg-amber-300 px-2 text-sm font-black text-amber-950 shadow">
          <span aria-hidden className="text-base leading-none">☀</span>
          {ui?.sun ?? 0}
        </span>
        <span className="inline-flex h-9 items-center gap-0.5 rounded-xl bg-white/90 px-2 text-sm shadow" aria-label={`${hearts} cottage hearts`}>
          {Array.from({ length: def.hearts }, (_, i) => (
            <span key={i} className={i < hearts ? "text-rose-500" : "text-white/70"}>
              ♥
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-black text-white drop-shadow">
          {def.name}
          <span className="ml-1 tabular-nums text-white/80">{ui?.kills ?? 0}/{ui?.total ?? def.spawns.length}</span>
        </span>
        <button
          type="button"
          aria-label={muted ? "Sound on" : "Sound off"}
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/90 text-[var(--ink)] shadow"
          onClick={() => {
            setMuted(!muted);
            if (muted) sfx("pop");
          }}
        >
          {muted ? <VolumeX className="size-5" strokeWidth={2.75} /> : <Volume2 className="size-5" strokeWidth={2.75} />}
        </button>
        <button
          type="button"
          aria-label={hold ? "Resume" : "Pause"}
          aria-pressed={hold}
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/90 text-[var(--ink)] shadow"
          onClick={() => {
            sfx("tap");
            setLocalPause((p) => !p);
          }}
        >
          {hold ? <Play className="size-5" strokeWidth={3} /> : <Pause className="size-5" strokeWidth={3} />}
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30">
        <GameOverlay
          className="pointer-events-auto"
          show={phase === "ready"}
          emoji="🌻"
          title={ui && ui.level > 1 ? def.name : "Meadow Guard"}
          subtitle={def.blurb}
          actionLabel={ui && ui.level > 1 ? "Start meadow" : "Guard the cottage"}
          onAction={() => {
            const m = simRef.current;
            if (!m) return;
            begin(m);
            sync();
          }}
        />
        <GameOverlay
          className="pointer-events-auto"
          show={phase === "cleared"}
          tone="win"
          emoji="🌿"
          title={`${def.name} is safe`}
          subtitle={`Creepers stopped. Meadow ${Math.min(LEVELS.length, (ui?.level ?? 1) + 1)} is next.`}
          actionLabel="Next meadow"
          onAction={() => {
            const m = simRef.current;
            if (!m) return;
            resetMatch(m, m.level + 1, m.score);
            sync();
          }}
        />
        <GameOverlay
          className="pointer-events-auto"
          show={phase === "won"}
          tone="win"
          emoji="🏡"
          title="The meadow is quiet"
          subtitle="All four meadows are safe. The cottage thanks you."
          actionLabel="Play again"
          onAction={() => {
            const m = simRef.current;
            if (!m) return;
            resetMatch(m, 1, 0);
            scoreCb.current?.(0);
            sync();
          }}
        />
        <GameOverlay
          className="pointer-events-auto"
          show={phase === "lost"}
          tone="lose"
          emoji="💨"
          title="They reached the cottage"
          subtitle="Plant a thicker line and try this meadow again."
          actionLabel="Try again"
          onAction={() => {
            const m = simRef.current;
            if (!m) return;
            const back = m.levelStartScore;
            resetMatch(m, m.level, back);
            scoreCb.current?.(back);
            sync();
          }}
        />
      </div>

      {hold && phase === "play" ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-emerald-950/45 p-4">
          <button
            type="button"
            className="kid-btn kid-btn-primary min-h-14 px-8 text-xl"
            onClick={() => setLocalPause(false)}
          >
            <Play className="size-6" fill="currentColor" /> Keep playing
          </button>
        </div>
      ) : null}

      <div
        ref={trayRef}
        className="absolute inset-x-0 bottom-0 z-20 grid grid-cols-6 gap-1 bg-emerald-950/90 px-1 pt-1"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 4px)",
          paddingLeft: "max(env(safe-area-inset-left), 4px)",
          paddingRight: "max(env(safe-area-inset-right), 4px)",
        }}
      >
        {PLANT_ORDER.map((kind) => {
          const stats = PLANTS[kind];
          const locked = (ui?.level ?? 1) < stats.unlock;
          const cd = ui?.cd[kind] ?? 0;
          const selected = ui?.selected === kind;
          const afford = (ui?.sun ?? 0) >= stats.cost;
          return (
            <button
              key={kind}
              type="button"
              aria-label={
                locked
                  ? `${stats.name} opens on meadow ${stats.unlock}`
                  : `${stats.name}, ${stats.cost} sun, ${stats.blurb}`
              }
              aria-pressed={selected}
              onPointerDown={(e) => {
                e.preventDefault();
                onPick(kind);
              }}
              className={cn(
                "relative flex h-12 min-w-0 items-center gap-1 rounded-xl bg-white px-1 text-left shadow-[0_3px_0_rgba(0,0,0,0.25)]",
                selected && "outline outline-[3px] outline-amber-300",
                locked && "opacity-80",
                !afford && !locked && "opacity-90",
              )}
            >
              <PlantGlyph kind={kind} />
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[12px] font-black leading-none text-emerald-950">
                  {stats.name}
                </span>
                <span className={cn("mt-0.5 block text-[11px] font-black leading-none", afford || locked ? "text-amber-700" : "text-rose-600")}>
                  {locked ? "Locked" : stats.cost}
                </span>
              </span>
              {cd > 0 && !locked ? (
                <span className="absolute right-0.5 top-0.5 rounded-md bg-emerald-950/80 px-1 text-[10px] font-black leading-tight text-white">
                  {Math.ceil(cd)}
                </span>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="Trowel, dig up a plant"
          aria-pressed={ui?.selected === "trowel"}
          onPointerDown={(e) => {
            e.preventDefault();
            onPick("trowel");
          }}
          className={cn(
            "relative flex h-12 min-w-0 items-center gap-1 rounded-xl bg-white px-1 text-left text-emerald-950 shadow-[0_3px_0_rgba(0,0,0,0.25)]",
            ui?.selected === "trowel" && "outline outline-[3px] outline-amber-300",
          )}
        >
          <TrowelGlyph />
          <span className="min-w-0">
            <span className="block whitespace-nowrap text-[12px] font-black leading-none">Trowel</span>
            <span className="mt-0.5 block text-[11px] font-black leading-none text-emerald-800/70">Dig</span>
          </span>
        </button>
      </div>

      {portrait && !dismissRotate ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-emerald-950/80 p-5 backdrop-blur-sm">
          <div className="card-pop flex w-full max-w-sm flex-col items-center gap-3 rounded-[1.8rem] border-4 border-white bg-[var(--surface)] px-5 py-6 text-center shadow-2xl">
            <div className="rotate-phone text-5xl" aria-hidden>
              📱
            </div>
            <p className="text-2xl font-black leading-tight text-[var(--ink)]">
              Turn your phone sideways
            </p>
            <p className="text-base font-semibold text-[var(--ink)]/70">
              Meadow Guard is built for landscape so the lawn and plant buttons stay easy to tap.
            </p>
            <button
              type="button"
              className="kid-btn kid-btn-primary min-h-14 w-full text-lg"
              onClick={() => setDismissRotate(true)}
            >
              Play tall anyway
            </button>
          </div>
        </div>
      ) : null}
      <style>{`
        @keyframes meadow-tilt {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(78deg); }
        }
        .rotate-phone { animation: meadow-tilt 2.4s ease-in-out infinite; display: inline-block; }
      `}</style>
    </div>
  );
}

function PlantGlyph({ kind }: { kind: PlantKind }) {
  const common = "h-7 w-7 shrink-0";
  if (kind === "sunbloom") {
    return (
      <svg viewBox="0 0 32 32" className={common} aria-hidden>
        <circle cx="16" cy="16" r="5" fill="#ff9f1c" />
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse
            key={i}
            cx="16"
            cy="7"
            rx="2.2"
            ry="4"
            fill={i % 2 ? "#ffd15c" : "#ffb703"}
            transform={`rotate(${i * 45} 16 16)`}
          />
        ))}
        <circle cx="16" cy="16" r="3.2" fill="#ffe08a" />
      </svg>
    );
  }
  if (kind === "podsnap") {
    return (
      <svg viewBox="0 0 32 32" className={common} aria-hidden>
        <rect x="14" y="18" width="4" height="10" rx="2" fill="#2f8a3a" />
        <ellipse cx="16" cy="14" rx="8" ry="9" fill="#3aaa4a" />
        <ellipse cx="16" cy="15" rx="5" ry="5" fill="#d7f5a8" />
        <ellipse cx="22" cy="14" rx="3" ry="2.4" fill="#214c28" />
      </svg>
    );
  }
  if (kind === "bramble") {
    return (
      <svg viewBox="0 0 32 32" className={common} aria-hidden>
        <circle cx="12" cy="18" r="6" fill="#2f6a32" />
        <circle cx="20" cy="16" r="7" fill="#3f8a40" />
        <circle cx="16" cy="22" r="5" fill="#2f6a32" />
        <circle cx="13" cy="16" r="2" fill="#d4527a" />
        <circle cx="19" cy="18" r="1.7" fill="#d4527a" />
      </svg>
    );
  }
  if (kind === "dewburst") {
    return (
      <svg viewBox="0 0 32 32" className={common} aria-hidden>
        <ellipse cx="16" cy="10" rx="3" ry="4" fill="#e7f8ff" />
        <ellipse cx="16" cy="18" rx="5" ry="6" fill="#49c2d8" transform="rotate(0 16 18)" />
        <ellipse cx="10" cy="20" rx="4" ry="5" fill="#7ad7ea" />
        <ellipse cx="22" cy="20" rx="4" ry="5" fill="#7ad7ea" />
        <circle cx="16" cy="20" r="3" fill="#1b6f86" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={common} aria-hidden>
      <path d="M16 26 C12 18 14 12 16 6" stroke="#7ec8b0" strokeWidth="2.4" fill="none" />
      <ellipse cx="11" cy="16" rx="5" ry="3" fill="#c8f3ea" transform="rotate(-30 11 16)" />
      <path d="M16 8 l3 5 l-3 2 l-3-2 z" fill="#e8fbff" stroke="#6fb9d4" />
    </svg>
  );
}

function TrowelGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
      <path d="M8 8 h10 l6 6 l-8 8 l-6-6 z" fill="#d7d2cb" stroke="#6b645c" />
      <path d="M14 20 l8 8" stroke="#8a5a3c" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
