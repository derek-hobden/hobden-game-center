"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Pause, Play, Volume2, VolumeX } from "lucide-react";
import type { GameProps } from "@/lib/game-registry";
import { GameOverlay } from "@/components/game-kit";
import { haptic, isMuted, onMutedChange, setMuted, sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { H, LEVELS, PLANTS, PLANT_ORDER, W, type PlantKind } from "./balance";
import { drawFrame, drawTrayIcon } from "./draw";
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
  icons: Map<string, HTMLCanvasElement>,
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
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#143524";
  ctx.fillRect(0, 0, bw, bh);
  drawFrame(ctx, m, font, { ox: 0, oy: hudH, sw: bw, sh: lawnH });
  for (const [kind, icon] of icons) {
    const ictx = icon.getContext("2d");
    if (!ictx) continue;
    drawTrayIcon(ictx, kind as PlantKind | "trowel", m.time);
  }
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
  const iconMap = useRef(new Map<string, HTMLCanvasElement>());
  const [ui, setUi] = useState<Ui>(() => snapshot(createMatch(1, 0)));
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
      paintBoard(
        canvasRef.current,
        stageRef.current,
        hudRef.current,
        trayRef.current,
        iconMap.current,
        m,
        fontRef.current,
      );
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

  const iconBinders = useRef(new Map<string, (node: HTMLCanvasElement | null) => void>());
  const bindIcon = (kind: string) => {
    let fn = iconBinders.current.get(kind);
    if (!fn) {
      fn = (node: HTMLCanvasElement | null) => {
        if (node) iconMap.current.set(kind, node);
        else iconMap.current.delete(kind);
      };
      iconBinders.current.set(kind, fn);
    }
    return fn;
  };

  return (
    <div ref={stageRef} className="fixed inset-0 z-50 overflow-hidden bg-[#143524]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Meadow lawn"
        onPointerDown={onLawnPointer}
        onPointerMove={onLawnPointer}
        onPointerLeave={onLawnPointer}
      />
      <div ref={hudRef} className="mg-hud">
        <Link href="/" aria-label="Back to menu" className="mg-icon-btn" onClick={() => sfx("tap")}>
          <ArrowLeft className="size-5" strokeWidth={3} />
        </Link>
        <span className="mg-sun" aria-label={`${ui?.sun ?? 0} sun`}>
          <SunMark />
          {ui?.sun ?? 0}
        </span>
        <span className="mg-hearts" aria-label={`${hearts} cottage hearts`}>
          {Array.from({ length: def.hearts }, (_, i) => (
            <Heart key={i} on={i < hearts} />
          ))}
        </span>
        <span className="mg-level">
          <span className="mg-level-name">{def.name}</span>
          <span className="mg-level-count">
            {ui?.kills ?? 0}/{ui?.total ?? def.spawns.length}
          </span>
        </span>
        <button
          type="button"
          aria-label={muted ? "Sound on" : "Sound off"}
          className="mg-icon-btn"
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
          className="mg-icon-btn"
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

      <div ref={trayRef} className="mg-tray">
        <div className="mg-seed-grid">
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
                className={cn("mg-seed", selected && "is-selected", locked && "is-locked", !afford && !locked && "is-poor")}
              >
                <span className="mg-seed-stripe" style={{ background: STRIPE[kind] }} />
                <canvas ref={bindIcon(kind)} width={160} height={160} className="mg-seed-icon" />
                <span className="mg-seed-name">{stats.name}</span>
                <span className={cn("mg-seed-cost", !afford && !locked && "is-short")}>
                  {locked ? `Meadow ${stats.unlock}` : stats.cost}
                </span>
                {cd > 0 && !locked ? <span className="mg-seed-cd">{Math.ceil(cd)}</span> : null}
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
            className={cn("mg-seed", ui?.selected === "trowel" && "is-selected")}
          >
            <span className="mg-seed-stripe" style={{ background: STRIPE.trowel }} />
            <canvas ref={bindIcon("trowel")} width={160} height={160} className="mg-seed-icon" />
            <span className="mg-seed-name">Trowel</span>
            <span className="mg-seed-cost">Dig</span>
          </button>
        </div>
      </div>
      <style>{MEADOW_CSS}</style>
    </div>
  );
}

const STRIPE: Record<PlantKind | "trowel", string> = {
  sunbloom: "#f0a202",
  podsnap: "#3aaa40",
  bramble: "#24662c",
  dewburst: "#3aa8c4",
  chillvine: "#7ec8e4",
  trowel: "#8a6a4a",
};

function SunMark() {
  return (
    <svg viewBox="0 0 24 24" className="mg-sun-mark" aria-hidden>
      <circle cx="12" cy="12" r="5.2" fill="#fff3c4" stroke="#c47d08" strokeWidth="1.2" />
      {Array.from({ length: 8 }, (_, i) => (
        <line
          key={i}
          x1="12"
          y1="3.2"
          x2="12"
          y2="1.2"
          stroke="#f0a202"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}

function Heart({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 18" className="mg-heart" aria-hidden>
      <path
        d="M10 16.2 2.4 8.8C.5 6.9.6 3.8 2.9 2.2 4.6 1 6.9 1.3 8.3 2.8L10 4.6l1.7-1.8c1.4-1.5 3.7-1.8 5.4-.6 2.3 1.6 2.4 4.7.5 6.6Z"
        fill={on ? "#e11d48" : "rgba(255,255,255,0.22)"}
        stroke={on ? "#9f1239" : "rgba(255,255,255,0.35)"}
        strokeWidth="1"
      />
    </svg>
  );
}

const MEADOW_CSS = `
.mg-hud {
  position: absolute;
  inset: 0 0 auto 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: max(env(safe-area-inset-top), 6px) max(env(safe-area-inset-right), 8px) 8px max(env(safe-area-inset-left), 8px);
  background: linear-gradient(180deg, #10281c 0%, #1b4630 72%, #1f5136 100%);
  box-shadow: 0 3px 0 #0c2418, 0 10px 18px rgba(0,0,0,0.18);
}
.mg-icon-btn {
  display: grid;
  width: 36px;
  height: 36px;
  flex: none;
  place-items: center;
  border-radius: 12px;
  background: linear-gradient(180deg, #fffef8, #f3e6cf);
  color: #1c3a18;
  box-shadow: 0 2px 0 #8a6a3a;
}
.mg-sun {
  display: inline-flex;
  height: 36px;
  flex: none;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 0 10px 0 6px;
  background: linear-gradient(180deg, #ffe08a, #f0a202);
  color: #6a3d08;
  font-size: 15px;
  font-weight: 700;
  box-shadow: inset 0 -2px 0 rgba(146, 64, 14, 0.35), 0 2px 0 #8a5a10;
}
.mg-sun-mark { width: 22px; height: 22px; }
.mg-hearts {
  display: inline-flex;
  height: 36px;
  flex: none;
  align-items: center;
  gap: 1px;
  border-radius: 999px;
  padding: 0 6px;
  background: rgba(0,0,0,0.22);
}
.mg-heart { width: 16px; height: 14px; }
.mg-level {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  line-height: 1.05;
  color: white;
  text-shadow: 0 1px 0 rgba(0,0,0,0.35);
}
.mg-level-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
}
.mg-level-count {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,0.78);
}
.mg-tray {
  position: absolute;
  inset: auto 0 0 0;
  z-index: 20;
  padding: 8px max(env(safe-area-inset-right), 8px) max(env(safe-area-inset-bottom), 8px) max(env(safe-area-inset-left), 8px);
  background:
    linear-gradient(180deg, rgba(255,220,170,0.28), transparent 8px),
    linear-gradient(180deg, #6b4226 0%, #4a2c18 42%, #3a2214 100%);
  box-shadow: inset 0 2px 0 rgba(255, 214, 160, 0.28);
}
.mg-seed-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.mg-seed {
  position: relative;
  display: flex;
  min-width: 0;
  height: 4.55rem;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 1px;
  overflow: hidden;
  border-radius: 16px;
  border: 2px solid #f6e7cf;
  background: linear-gradient(180deg, #fffdf8 0%, #fff3dd 100%);
  padding: 8px 2px 5px;
  color: #173214;
  box-shadow: 0 3px 0 #2a1a10;
  container-type: inline-size;
}
.mg-seed.is-selected {
  border-color: #f5c542;
  transform: translateY(-2px);
  box-shadow: 0 0 0 3px #f5c542, 0 3px 0 #2a1a10;
}
.mg-seed.is-locked { filter: saturate(0.55); }
.mg-seed.is-poor { opacity: 0.78; }
.mg-seed-stripe {
  position: absolute;
  inset: 0 0 auto 0;
  height: 5px;
}
.mg-seed-icon {
  width: 34px;
  height: 34px;
  pointer-events: none;
}
.mg-seed-name {
  display: block;
  max-width: 100%;
  font-size: clamp(12px, 13.5cqw, 15px);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
  white-space: nowrap;
}
.mg-seed-cost {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #a16207;
}
.mg-seed-cost.is-short { color: #be123c; }
.mg-seed-cd {
  position: absolute;
  top: 8px;
  right: 4px;
  min-width: 16px;
  border-radius: 999px;
  background: #1c3a24;
  padding: 1px 4px;
  color: white;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
}
@media (min-width: 700px) {
  .mg-seed-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .mg-seed { height: 4.35rem; }
  .mg-level-name { font-size: 15px; }
  .mg-icon-btn, .mg-sun, .mg-hearts { height: 40px; }
  .mg-icon-btn { width: 40px; }
}
`;
