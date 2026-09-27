"use client";

import { useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { CanvasStage, GameOverlay, canvasPoint, prepareCanvas } from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
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
  selected: TrayChoice | null;
  cd: Record<PlantKind, number>;
  kills: number;
  total: number;
};

function snapshot(m: Match): Ui {
  return {
    phase: m.phase,
    level: m.level,
    sun: m.sun,
    selected: m.selected,
    cd: { ...m.cd },
    kills: m.kills,
    total: levelDef(m.level).spawns.length,
  };
}

function sig(ui: Ui) {
  const cds = PLANT_ORDER.map((k) => Math.ceil(ui.cd[k] * 4)).join(",");
  return `${ui.phase}|${ui.level}|${ui.sun}|${ui.selected}|${ui.kills}|${cds}`;
}

export default function MeadowGuard({ paused, onScoreChange }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Match | null>(null);
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const fontRef = useRef("Fredoka, Trebuchet MS, sans-serif");
  const [ui, setUi] = useState<Ui>(() => snapshot(createMatch(1, 0)));
  const [portrait, setPortrait] = useState(false);
  const [dismissRotate, setDismissRotate] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
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
      if (!pausedRef.current) step(m, dt);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        prepareCanvas(ctx, W);
        drawFrame(ctx, m, fontRef.current);
      }
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
    if (!m || paused) return;
    choose(m, kind);
    sync();
  };

  const def = levelDef(ui?.level ?? 1);
  const phase = ui?.phase ?? "ready";

  return (
    <div className="game-root relative">
      <CanvasStage
        width={W}
        height={H}
        canvasRef={canvasRef}
        onPointerDown={(e) => {
          const m = simRef.current;
          const canvas = canvasRef.current;
          if (!m || !canvas || paused) return;
          e.preventDefault();
          const p = canvasPoint(e, canvas, W, H);
          tapLawn(m, p.x, p.y);
          sync();
        }}
        onPointerMove={(e) => {
          const m = simRef.current;
          const canvas = canvasRef.current;
          if (!m || !canvas) return;
          const p = canvasPoint(e, canvas, W, H);
          setHover(m, p.x, p.y);
        }}
        onPointerLeave={() => {
          const m = simRef.current;
          if (!m) return;
          m.hoverCol = -1;
          m.hoverRow = -1;
        }}
      >
        <GameOverlay
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
      </CanvasStage>

      <div className="grid w-full shrink-0 grid-cols-6 gap-1 px-1 pb-0.5">
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
                "kid-btn relative h-[3.35rem] flex-col gap-0 rounded-2xl px-0.5 py-1 text-[10px] leading-none sm:h-16 sm:text-xs",
                selected ? "kid-btn-primary" : "kid-btn-secondary",
                !selected && !afford && !locked && "opacity-80",
              )}
            >
              <PlantGlyph kind={kind} />
              <span className="mt-0.5 max-w-full truncate font-black">{stats.name}</span>
              <span className={cn("font-black", afford ? "text-amber-700" : "text-rose-600")}>
                {stats.cost}
              </span>
              {locked ? (
                <span className="absolute inset-0 grid place-items-center rounded-2xl bg-white/80 text-[10px] font-black text-[var(--ink)]">
                  Meadow {stats.unlock}
                </span>
              ) : null}
              {cd > 0 && !locked ? (
                <span className="absolute inset-0 grid place-items-center rounded-2xl bg-[var(--ink)]/55 text-sm font-black text-white">
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
            "kid-btn relative h-[3.35rem] flex-col gap-0 rounded-2xl px-0.5 py-1 text-[10px] leading-none sm:h-16 sm:text-xs",
            ui?.selected === "trowel" ? "kid-btn-primary" : "kid-btn-secondary",
          )}
        >
          <TrowelGlyph />
          <span className="mt-0.5 font-black">Trowel</span>
          <span className="font-black text-[var(--ink)]/50">dig</span>
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
  const common = "h-6 w-6 sm:h-7 sm:w-7";
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
    <svg viewBox="0 0 32 32" className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden>
      <path d="M8 8 h10 l6 6 l-8 8 l-6-6 z" fill="#d7d2cb" stroke="#6b645c" />
      <path d="M14 20 l8 8" stroke="#8a5a3c" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
