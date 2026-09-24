"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import { PROFILES, type ProfileId } from "@/lib/profiles";
import {
  CanvasStage,
  GameOverlay,
  StatPill,
  canvasPoint,
  prepareCanvas,
} from "@/components/game-kit";
import { haptic, sfx } from "@/lib/sfx";
import {
  artFor,
  hash01,
  loadRouteSprites,
  type RouteArt,
  type RouteSprites,
  type StreetPalette,
} from "@/games/paperboy/art";

/* ------------------------------------------------------------------ */
/* Layout (game units). The street scrolls down; the rider rides "up". */
/* ------------------------------------------------------------------ */

const W = 360;
const H = 640;
const VERGE_R = 30;
const ROAD_L = 30;
const ROAD_R = 178;
const CURB_R = 186;
const WALK_R = 212;
const HOUSE_X = 206;
const HOUSE_W = 152;
const RIDER_MIN_X = 54;
const RIDER_MAX_X = 196;
const RIDER_MIN_Y = 290;
const RIDER_MAX_Y = 600;
const RIDER_H = 72;
const HOUSES_PER_ROUTE = 10;
const HOUSE_GAP = 188;
const FIRST_HOUSE_D = 720;
const BAG_START = 12;
const BAG_MAX = 16;
const BUNDLE_SIZE = 4;
const LIVES = 3;

type Phase = "ready" | "playing" | "routeDone" | "over";

type House = {
  d: number;
  /** 0 = waiting, 1 = delivered, 2 = bullseye */
  got: 0 | 1 | 2;
  passed: boolean;
  pop: number;
};

type ObstacleKind = "puddle" | "walker" | "bundle" | "star";
type Obstacle = {
  kind: ObstacleKind;
  x: number;
  d: number;
  vx: number;
  hit: boolean;
  t: number;
};

type Paper = {
  sx: number;
  sd: number;
  ex: number;
  ed: number;
  u: number;
  dur: number;
  arc: number;
  aimed: House | null;
};

type Landed = { x: number; d: number; life: number; rot: number };
type Particle = {
  x: number;
  d: number;
  vx: number;
  vd: number;
  life: number;
  max: number;
  color: string;
  size: number;
  star: boolean;
  rot: number;
};
type FloatText = {
  x: number;
  d: number;
  text: string;
  color: string;
  life: number;
  big: boolean;
};

type Rider = {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  invuln: number;
  wobble: number;
};

type World = {
  phase: Phase;
  route: number;
  s: number;
  t: number;
  runT: number;
  rider: Rider;
  houses: House[];
  obs: Obstacle[];
  papers: Paper[];
  landed: Landed[];
  parts: Particle[];
  texts: FloatText[];
  lives: number;
  bag: number;
  score: number;
  delivered: number;
  bulls: number;
  totalDelivered: number;
  shake: number;
  finishD: number;
  tossCool: number;
  dustT: number;
};

type Hud = { lives: number; bag: number; delivered: number; route: number };
type Summary = {
  route: number;
  delivered: number;
  bulls: number;
  stars: number;
  total: number;
};

function copyFor(profileId: ProfileId) {
  switch (profileId) {
    case "keira":
      return {
        emoji: "💌",
        item: "letter",
        items: "letters",
        bagIcon: "💌",
        start: "Drag to ride your bike. Tap to toss letters into the mailboxes!",
        go: "Let's ride!",
        ouch: "Oops!",
        bull: "Bullseye!",
        hit: "Delivered!",
        overTitle: "Out of hearts!",
      };
    case "luke":
      return {
        emoji: "📰",
        item: "paper",
        items: "papers",
        bagIcon: "📰",
        start: "Drag to ride your bike. Tap to toss papers into the mailboxes!",
        go: "Let's ride!",
        ouch: "Bonk!",
        bull: "Bullseye!",
        hit: "Delivered!",
        overTitle: "Out of hearts!",
      };
    default: {
      const _never: never = profileId;
      return _never;
    }
  }
}

/* ------------------------------------------------------------------ */
/* World building                                                      */
/* ------------------------------------------------------------------ */

const screenY = (w: World, d: number) => H - (d - w.s);
const worldD = (w: World, y: number) => w.s + H - y;
const houseH = (sp: RouteSprites | null) =>
  sp ? (HOUSE_W * sp.house.naturalHeight) / sp.house.naturalWidth : 118;

function speedFor(route: number) {
  return Math.min(165, 86 + (route - 1) * 13);
}

function buildRoute(route: number): Pick<World, "houses" | "obs" | "finishD"> {
  const houses: House[] = Array.from({ length: HOUSES_PER_ROUTE }, (_, i) => ({
    d: FIRST_HOUSE_D + i * HOUSE_GAP,
    got: 0,
    passed: false,
    pop: 0,
  }));
  const finishD = houses[houses.length - 1].d + 300;

  // Slots along the road, shuffled, so nothing overlaps.
  const slots: number[] = [];
  for (let d = 860; d < finishD - 120; d += 96) slots.push(d);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const obs: Obstacle[] = [];
  const rx = () => ROAD_L + 26 + Math.random() * (ROAD_R - ROAD_L - 52);
  const hazards = Math.min(12, 4 + (route - 1) * 2);
  const walkers = Math.min(4, route);
  let k = 0;
  for (let i = 0; i < hazards && k < slots.length; i++, k++) {
    const walker = i < walkers;
    obs.push({
      kind: walker ? "walker" : "puddle",
      x: walker ? (Math.random() < 0.5 ? ROAD_L + 14 : ROAD_R - 14) : rx(),
      d: slots[k],
      vx: 0,
      hit: false,
      t: Math.random() * 10,
    });
  }
  for (let i = 0; i < 2 && k < slots.length; i++, k++) {
    obs.push({ kind: "bundle", x: rx(), d: slots[k], vx: 0, hit: false, t: 0 });
  }
  const starRows = Math.min(slots.length, k + 3 + route);
  for (; k < starRows; k++) {
    // Little rows of stars to collect.
    const x0 = ROAD_L + 34 + Math.random() * (ROAD_R - ROAD_L - 68);
    for (let j = 0; j < 3; j++) {
      obs.push({
        kind: "star",
        x: x0,
        d: slots[k] - 30 + j * 30,
        vx: 0,
        hit: false,
        t: j * 0.4,
      });
    }
  }
  return { houses, obs, finishD };
}

function newWorld(): World {
  return {
    phase: "ready",
    route: 1,
    s: 0,
    t: 0,
    runT: 0,
    rider: { x: 110, y: 540, tx: 110, ty: 540, vx: 0, invuln: 0, wobble: 0 },
    ...buildRoute(1),
    papers: [],
    landed: [],
    parts: [],
    texts: [],
    lives: LIVES,
    bag: BAG_START,
    score: 0,
    delivered: 0,
    bulls: 0,
    totalDelivered: 0,
    shake: 0,
    tossCool: 0,
    dustT: 0,
  };
}

function mailboxOf(
  h: House,
  art: RouteArt,
  sp: RouteSprites | null,
): { x: number; d: number } {
  const hh = houseH(sp);
  return { x: HOUSE_X + art.mailbox.x * HOUSE_W, d: h.d + (1 - art.mailbox.y) * hh };
}

function burst(
  w: World,
  x: number,
  d: number,
  colors: string[],
  n: number,
  speed = 150,
  star = false,
) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.8);
    const life = 0.5 + Math.random() * 0.5;
    w.parts.push({
      x,
      d,
      vx: Math.cos(a) * v,
      vd: Math.sin(a) * v,
      life,
      max: life,
      color: colors[i % colors.length],
      size: star ? 10 + Math.random() * 8 : 3 + Math.random() * 3,
      star,
      rot: Math.random() * 6,
    });
  }
}

function say(w: World, x: number, d: number, text: string, color: string, big = false) {
  // Don't stack the same message on top of itself.
  if (w.texts.some((t) => t.text === text)) return;
  w.texts.push({ x, d, text, color, life: 1.1, big });
}

/* ------------------------------------------------------------------ */
/* Drawing                                                             */
/* ------------------------------------------------------------------ */

/** Iterate rows of a world-anchored pattern with spacing `step`. */
function rows(w: World, step: number, fn: (k: number, y: number) => void) {
  const k0 = Math.floor(w.s / step) - 1;
  const k1 = Math.ceil((w.s + H) / step) + 1;
  for (let k = k0; k <= k1; k++) fn(k, screenY(w, k * step));
}

function drawStreet(ctx: CanvasRenderingContext2D, w: World, pal: StreetPalette, keira: boolean) {
  // Base strips
  ctx.fillStyle = pal.verge;
  ctx.fillRect(0, 0, VERGE_R, H);
  ctx.fillStyle = pal.road;
  ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
  ctx.fillStyle = pal.curb;
  ctx.fillRect(ROAD_R, 0, CURB_R - ROAD_R, H);
  ctx.fillStyle = pal.sidewalk;
  ctx.fillRect(CURB_R, 0, WALK_R - CURB_R, H);
  ctx.fillStyle = pal.lawn;
  ctx.fillRect(WALK_R, 0, W - WALK_R, H);

  // Road texture
  if (keira) {
    rows(w, 22, (k, y) => {
      const off = k % 2 ? 0 : 13;
      for (let x = ROAD_L + 4 - off; x < ROAD_R; x += 26) {
        const wob = hash01(k * 31 + x) * 4;
        ctx.fillStyle = pal.roadSpeck;
        ctx.beginPath();
        ctx.roundRect(Math.max(ROAD_L + 2, x + 2), y - 19 + wob * 0.3, 21 - wob, 17, 7);
        ctx.fill();
      }
    });
  } else {
    ctx.fillStyle = pal.roadSpeck;
    rows(w, 18, (k, y) => {
      for (let i = 0; i < 4; i++) {
        const x = ROAD_L + hash01(k * 7 + i) * (ROAD_R - ROAD_L);
        ctx.fillRect(x, y - hash01(k * 3 + i) * 18, 2, 2);
      }
    });
  }
  // Road edge lines
  ctx.fillStyle = pal.roadEdge;
  if (keira) {
    rows(w, 16, (_k, y) => {
      ctx.beginPath();
      ctx.arc(ROAD_L + 6, y, 2.2, 0, Math.PI * 2);
      ctx.arc(ROAD_R - 6, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    ctx.fillRect(ROAD_L + 5, 0, 3, H);
    ctx.fillRect(ROAD_R - 8, 0, 3, H);
  }
  // Centre dashes
  const cx = (ROAD_L + ROAD_R) / 2;
  rows(w, 50, (k, y) => {
    ctx.fillStyle = pal.centerLine[((k % pal.centerLine.length) + pal.centerLine.length) % pal.centerLine.length];
    ctx.beginPath();
    ctx.roundRect(cx - 3, y - 28, 6, 26, 3);
    ctx.fill();
  });
  // Curb stripes + sidewalk tiles
  rows(w, 26, (k, y) => {
    if (keira && k % 2 === 0) {
      ctx.fillStyle = "#fbcfe8";
      ctx.fillRect(ROAD_R, y - 26, CURB_R - ROAD_R, 13);
    }
    ctx.fillStyle = pal.sidewalkLine;
    ctx.fillRect(CURB_R, y, WALK_R - CURB_R, 1.5);
  });
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(ROAD_R - 2, 0, 2, H);
  ctx.fillRect(WALK_R, 0, 3, H);

  // Mowed lawn stripes
  ctx.fillStyle = pal.lawnDark;
  rows(w, 80, (_k, y) => ctx.fillRect(WALK_R + 3, y - 40, W - WALK_R, 40));
  // Flowers on the lawn
  rows(w, 30, (k, y) => {
    const r = hash01(k);
    if (r > 0.55) return;
    const x = WALK_R + 14 + hash01(k + 91) * (W - WALK_R - 24);
    ctx.fillStyle = pal.flowers[k % pal.flowers.length];
    for (let p = 0; p < 4; p++) {
      const a = (p / 4) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 2.6, y - 10 + Math.sin(a) * 2.6, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    ctx.arc(x, y - 10, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Verge tufts
  ctx.fillStyle = pal.vergeDark;
  rows(w, 24, (k, y) => {
    const x = 4 + hash01(k * 5) * 18;
    ctx.beginPath();
    ctx.ellipse(x, y, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTrees(ctx: CanvasRenderingContext2D, w: World, pal: StreetPalette) {
  rows(w, 150, (k, y) => {
    const x = 10 + hash01(k * 13) * 10;
    const c = pal.tree[((k % pal.tree.length) + pal.tree.length) % pal.tree.length];
    ctx.fillStyle = "rgba(0,0,0,0.13)";
    ctx.beginPath();
    ctx.ellipse(x + 8, y + 4, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    for (const [ox, oy, r] of [
      [-8, -6, 15],
      [8, -8, 16],
      [0, -20, 17],
      [2, 2, 13],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy - 10, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x - 4, y - 36, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHedge(ctx: CanvasRenderingContext2D, y: number, pal: StreetPalette) {
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(WALK_R + 4, y + 2, W - WALK_R, 8);
  ctx.fillStyle = pal.hedge;
  ctx.beginPath();
  ctx.roundRect(WALK_R + 4, y - 12, W - WALK_R, 16, 8);
  ctx.fill();
  ctx.fillStyle = pal.hedgeLight;
  for (let x = WALK_R + 12; x < W; x += 14) {
    ctx.beginPath();
    ctx.arc(x, y - 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bull: boolean,
  pop: number,
) {
  const s = 1 + pop * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = bull ? "#facc15" : "#22c55e";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "900 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(bull ? "★" : "✓", 0, 1);
  ctx.restore();
}

function drawFinish(ctx: CanvasRenderingContext2D, y: number) {
  if (y < -30 || y > H + 30) return;
  const sq = 10;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i * sq < WALK_R - ROAD_L; i++) {
      ctx.fillStyle = (i + row) % 2 ? "#1f2937" : "#ffffff";
      ctx.fillRect(ROAD_L + i * sq, y - row * sq, sq, sq);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function PaperboyGame({ profileId, paused, onScoreChange }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = PROFILES[profileId];
  const copy = useMemo(() => copyFor(profileId), [profileId]);
  const art = artFor(profileId);
  const world = useRef<World>(newWorld());
  const sprites = useRef<RouteSprites | null>(null);
  const keys = useRef({ l: false, r: false, u: false, d: false });
  const drag = useRef<{ id: number; px: number; py: number; rx: number; ry: number; t: number; moved: number } | null>(null);
  const pausedRef = useRef(paused);
  const scoreCb = useRef(onScoreChange);
  const lastScore = useRef(-1);

  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<Hud>({ lives: LIVES, bag: BAG_START, delivered: 0, route: 1 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hudBump, setHudBump] = useState(0);

  useEffect(() => {
    pausedRef.current = paused;
    scoreCb.current = onScoreChange;
  }, [paused, onScoreChange]);

  // Sprites (per profile).
  useEffect(() => {
    let cancelled = false;
    sprites.current = null;
    loadRouteSprites(art)
      .then((sp) => {
        if (!cancelled) sprites.current = sp;
      })
      .catch(() => {
        /* colour fallbacks are drawn */
      });
    return () => {
      cancelled = true;
    };
  }, [art]);

  const syncHud = useCallback(() => {
    const w = world.current;
    setHud((prev) =>
      prev.lives === w.lives &&
      prev.bag === w.bag &&
      prev.delivered === w.delivered &&
      prev.route === w.route
        ? prev
        : { lives: w.lives, bag: w.bag, delivered: w.delivered, route: w.route },
    );
    if (w.score !== lastScore.current) {
      lastScore.current = w.score;
      scoreCb.current?.(w.score);
    }
  }, []);

  const startRun = useCallback(() => {
    const w = world.current;
    if (w.phase === "over") {
      world.current = newWorld();
    }
    world.current.phase = "playing";
    setPhase("playing");
    setSummary(null);
    sfx("levelUp");
    syncHud();
  }, [syncHud]);

  const nextRoute = useCallback(() => {
    const w = world.current;
    const route = w.route + 1;
    Object.assign(w, buildRoute(route), {
      route,
      s: 0,
      runT: 0,
      phase: "playing" as Phase,
      papers: [],
      landed: [],
      parts: [],
      texts: [],
      bag: BAG_START,
      delivered: 0,
      bulls: 0,
      lives: Math.min(LIVES, w.lives + 1),
    });
    w.rider.tx = w.rider.x = 110;
    w.rider.ty = w.rider.y = 540;
    setPhase("playing");
    setSummary(null);
    sfx("levelUp");
    syncHud();
  }, [syncHud]);

  useEffect(() => {
    scoreCb.current?.(0);
    lastScore.current = 0;
  }, []);

  /* ---------------- tossing ---------------- */

  const toss = useCallback(
    (tap: { x: number; y: number } | null) => {
      const w = world.current;
      if (w.phase !== "playing" || pausedRef.current) return;
      if (w.tossCool > 0) return;
      const r = w.rider;
      if (w.bag <= 0) {
        say(w, r.x, worldD(w, r.y - RIDER_H - 8), `No ${copy.items}!`, "#64748b");
        sfx("miss");
        return;
      }
      const sp = sprites.current;
      const sx = r.x + 12;
      const sy = r.y - 44;
      // Pick a house: tapped one (if the tap was near a mailbox) else the best one ahead.
      let aimed: House | null = null;
      let scatter = 24;
      const open = w.houses.filter((h) => {
        if (h.got || h.passed || w.papers.some((p) => p.aimed === h)) return false;
        const my = screenY(w, mailboxOf(h, art, sp).d);
        return my > r.y - 420 && my < r.y + 50;
      });
      if (tap && tap.x > CURB_R - 10) {
        // Tapped a house (or near its mailbox)? Aim there, a bit more accurately.
        const hh = houseH(sp);
        let best = 110;
        for (const h of open) {
          const m = mailboxOf(h, art, sp);
          const top = screenY(w, h.d) - hh;
          const inside = tap.y > top && tap.y < top + hh + 16;
          const dist = inside ? 0 : Math.hypot(m.x - tap.x, screenY(w, m.d) - tap.y);
          if (dist < best) {
            best = dist;
            aimed = h;
          }
        }
        if (aimed) scatter = 14;
      }
      if (!aimed) {
        let best = Infinity;
        for (const h of open) {
          const my = screenY(w, mailboxOf(h, art, sp).d);
          const score = Math.abs(my - (r.y - 130));
          if (score < best) {
            best = score;
            aimed = h;
          }
        }
      }
      if (!aimed) {
        if (w.papers.length) return;
        say(w, r.x + 30, worldD(w, r.y - RIDER_H - 8), "Wait for a house!", "#64748b");
        return;
      }
      const m = mailboxOf(aimed, art, sp);
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * scatter;
      const ex = m.x + Math.cos(a) * rr;
      const ed = m.d + Math.sin(a) * rr * 0.8;
      const sd = worldD(w, sy);
      const dist = Math.hypot(ex - sx, ed - sd);
      w.papers.push({
        sx,
        sd,
        ex,
        ed,
        u: 0,
        dur: Math.min(0.72, Math.max(0.38, dist / 430)),
        arc: 46 + dist * 0.16,
        aimed,
      });
      w.bag -= 1;
      w.tossCool = 0.22;
      sfx("flap", { pitch: 0.9 + Math.random() * 0.2 });
      haptic(8);
      syncHud();
    },
    [art, copy.items, syncHud],
  );

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const set = (e: KeyboardEvent, on: boolean) => {
      const k = keys.current;
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          k.l = on;
          break;
        case "ArrowRight":
        case "KeyD":
          k.r = on;
          break;
        case "ArrowUp":
        case "KeyW":
          k.u = on;
          break;
        case "ArrowDown":
        case "KeyS":
          k.d = on;
          break;
        case "Space":
        case "Enter":
          if (on && !e.repeat) {
            if (world.current.phase === "playing") toss(null);
          }
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [toss]);

  /* ---------------- main loop ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pal = art.palette;
    const keira = profileId === "keira";
    let raf = 0;
    let last = performance.now();

    const finishRoute = (w: World) => {
      w.phase = "routeDone";
      const stars = w.delivered >= 9 ? 3 : w.delivered >= 6 ? 2 : w.delivered >= 3 ? 1 : 0;
      w.score += stars * 25;
      w.totalDelivered += w.delivered;
      setSummary({ route: w.route, delivered: w.delivered, bulls: w.bulls, stars, total: w.totalDelivered });
      setPhase("routeDone");
      sfx("win");
      syncHud();
    };

    const land = (w: World, p: Paper) => {
      const sp = sprites.current;
      const hh = houseH(sp);
      let got: House | null = null;
      let bull = false;
      for (const h of w.houses) {
        if (h.got) continue;
        const m = mailboxOf(h, art, sp);
        const dm = Math.hypot(p.ex - m.x, (p.ed - m.d) * 1.1);
        const onLot = p.ex > HOUSE_X + 8 && p.ed > h.d - 6 && p.ed < h.d + hh * 0.62;
        if (dm < 17) {
          got = h;
          bull = true;
          break;
        }
        if (dm < 46 || onLot) got = h;
      }
      if (got) {
        got.got = bull ? 2 : 1;
        got.pop = 1;
        w.delivered += 1;
        const pts = bull ? 25 : 10;
        w.score += pts;
        const m = mailboxOf(got, art, sp);
        burst(w, m.x, m.d + 10, pal.confetti, bull ? 26 : 16, bull ? 190 : 140);
        if (bull) {
          w.bulls += 1;
          burst(w, m.x, m.d + 14, ["#facc15"], 5, 110, true);
          say(w, m.x + 44, m.d + 30, `${copy.bull} +${pts}`, "#f59e0b", true);
          sfx("star");
          haptic(20);
        } else {
          say(w, m.x + 44, m.d + 30, `${copy.hit} +${pts}`, "#16a34a");
          sfx("coin");
          haptic(12);
        }
        syncHud();
      } else {
        w.landed.push({ x: p.ex, d: p.ed, life: 1.4, rot: Math.random() * 6 });
        burst(w, p.ex, p.ed, ["#ffffff", pal.lawnDark], 6, 60);
        say(w, p.ex, p.ed + 18, "Missed!", "#64748b");
        sfx("miss");
      }
    };

    const hurt = (w: World, o: Obstacle) => {
      const r = w.rider;
      if (r.invuln > 0) return;
      o.hit = true;
      w.lives -= 1;
      r.invuln = 1.8;
      r.wobble = 1;
      w.shake = 0.35;
      burst(w, r.x, worldD(w, r.y - 18), ["#ffffff", "#fda4af", "#fde68a"], 14, 130);
      say(w, r.x, worldD(w, r.y - RIDER_H - 6), copy.ouch, "#e11d48", true);
      sfx("hit");
      haptic(45);
      if (w.lives <= 0) {
        w.phase = "over";
        w.totalDelivered += w.delivered;
        setSummary({ route: w.route, delivered: w.delivered, bulls: w.bulls, stars: 0, total: w.totalDelivered });
        setPhase("over");
        sfx("lose");
      }
      syncHud();
    };

    const update = (w: World, dt: number) => {
      w.runT += dt;
      const r = w.rider;
      const speed = speedFor(w.route) * Math.min(1, 0.25 + w.runT / 1.4);
      w.s += speed * dt;

      // Steering: drag sets target; keys nudge it.
      const k = keys.current;
      const kx = (k.r ? 1 : 0) - (k.l ? 1 : 0);
      const ky = (k.d ? 1 : 0) - (k.u ? 1 : 0);
      if (kx || ky) {
        r.tx += kx * 210 * dt;
        r.ty += ky * 190 * dt;
      }
      r.tx = Math.max(RIDER_MIN_X, Math.min(RIDER_MAX_X, r.tx));
      r.ty = Math.max(RIDER_MIN_Y, Math.min(RIDER_MAX_Y, r.ty));
      const nx = r.x + (r.tx - r.x) * Math.min(1, dt * 11);
      r.vx = (nx - r.x) / Math.max(dt, 1e-3);
      r.x = nx;
      r.y += (r.ty - r.y) * Math.min(1, dt * 9);
      r.invuln = Math.max(0, r.invuln - dt);
      r.wobble = Math.max(0, r.wobble - dt * 1.4);
      w.tossCool = Math.max(0, w.tossCool - dt);
      w.shake = Math.max(0, w.shake - dt);

      // Dust behind the back wheel.
      w.dustT -= dt;
      if (w.dustT <= 0) {
        w.dustT = 0.09;
        w.parts.push({
          x: r.x - 16 + Math.random() * 6,
          d: worldD(w, r.y - 2),
          vx: -10 - Math.random() * 20,
          vd: -20,
          life: 0.45,
          max: 0.45,
          color: keira ? "rgba(255,255,255,0.8)" : "rgba(226,232,240,0.7)",
          size: 3 + Math.random() * 3,
          star: false,
          rot: 0,
        });
      }

      // Papers in the air.
      for (const p of w.papers) {
        p.u += dt / p.dur;
        if (p.u >= 1) land(w, p);
      }
      w.papers = w.papers.filter((p) => p.u < 1);
      if (w.phase !== "playing") return;

      // Obstacles & pickups.
      const hx = r.x;
      const hy = r.y - 18;
      for (const o of w.obs) {
        const y = screenY(w, o.d);
        if (y < -80 || y > H + 80) continue;
        o.t += dt;
        if (o.kind === "walker") {
          if (o.vx === 0) o.vx = (o.x < 100 ? 1 : -1) * (32 + w.route * 6);
          o.x += o.vx * dt;
          if (o.x < ROAD_L + 14) o.vx = Math.abs(o.vx);
          if (o.x > ROAD_R - 14) o.vx = -Math.abs(o.vx);
        }
        if (o.hit) continue;
        const dx = o.x - hx;
        const dy = y - 8 - hy;
        switch (o.kind) {
          case "puddle":
            if ((dx * dx) / (26 * 26) + (dy * dy) / (18 * 18) < 1) hurt(w, o);
            break;
          case "walker":
            if (dx * dx + dy * dy < 24 * 24) hurt(w, o);
            break;
          case "bundle":
            if (dx * dx + dy * dy < 30 * 30) {
              o.hit = true;
              w.bag = Math.min(BAG_MAX, w.bag + BUNDLE_SIZE);
              burst(w, o.x, o.d, pal.confetti, 12, 120);
              say(w, o.x, o.d + 26, `+${BUNDLE_SIZE} ${copy.items}`, "#0f766e", true);
              sfx("pop");
              haptic(10);
              syncHud();
              setHudBump((n) => n + 1);
            }
            break;
          case "star":
            if (dx * dx + (dy + 6) * (dy + 6) < 26 * 26) {
              o.hit = true;
              w.score += 5;
              burst(w, o.x, o.d + 10, ["#facc15", "#ffffff"], 8, 100);
              say(w, o.x, o.d + 24, "+5", "#f59e0b");
              sfx("coin", { pitch: 1 + Math.random() * 0.2 });
              syncHud();
            }
            break;
        }
        if (w.phase !== "playing") return;
      }

      // Out of mail with houses still to go? Drop a fresh bundle ahead.
      if (w.bag === 0 && w.houses.some((h) => !h.got && !h.passed)) {
        const waiting = w.obs.some(
          (o) => o.kind === "bundle" && !o.hit && screenY(w, o.d) < r.y - 40 && screenY(w, o.d) > -300,
        );
        if (!waiting) {
          w.obs.push({
            kind: "bundle",
            x: Math.max(RIDER_MIN_X + 10, Math.min(ROAD_R - 30, r.x + (Math.random() - 0.5) * 60)),
            d: w.s + H + 40,
            vx: 0,
            hit: false,
            t: 0,
          });
        }
      }

      // Houses scroll past.
      for (const h of w.houses) {
        h.pop = Math.max(0, h.pop - dt * 2.2);
        if (!h.got && !h.passed && screenY(w, h.d) > H + 10) h.passed = true;
      }

      if (screenY(w, w.finishD) > r.y - 20) finishRoute(w);
    };

    const updateFx = (w: World, dt: number) => {
      for (const p of w.parts) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.d += p.vd * dt;
        p.vx *= 1 - dt * 2.2;
        p.vd *= 1 - dt * 2.2;
        p.rot += dt * 6;
      }
      w.parts = w.parts.filter((p) => p.life > 0);
      for (const t of w.texts) {
        t.life -= dt;
        t.d += 34 * dt;
      }
      w.texts = w.texts.filter((t) => t.life > 0);
      for (const l of w.landed) l.life -= dt;
      w.landed = w.landed.filter((l) => l.life > 0);
    };

    const aimTarget = (w: World): House | null => {
      const sp = sprites.current;
      const r = w.rider;
      let best: House | null = null;
      let bestScore = Infinity;
      for (const h of w.houses) {
        if (h.got || h.passed || w.papers.some((p) => p.aimed === h)) continue;
        const my = screenY(w, mailboxOf(h, art, sp).d);
        if (my < r.y - 420 || my > r.y + 50) continue;
        const sc = Math.abs(my - (r.y - 130));
        if (sc < bestScore) {
          bestScore = sc;
          best = h;
        }
      }
      return best;
    };

    const draw = (w: World) => {
      const sp = sprites.current;
      prepareCanvas(ctx, W);
      ctx.save();
      if (w.shake > 0) {
        const m = w.shake * 16;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      drawStreet(ctx, w, pal, keira);

      // Hedges between lots, then houses.
      const hh = houseH(sp);
      for (const h of w.houses) {
        const y = screenY(w, h.d);
        if (y < -hh - 40 || y > H + 80) continue;
        drawHedge(ctx, y + (HOUSE_GAP - hh) / 2 + 6, pal);
      }
      const target = w.phase === "playing" && w.bag > 0 ? aimTarget(w) : null;
      for (const h of w.houses) {
        const y = screenY(w, h.d);
        if (y < -10 || y - hh > H + 10) continue;
        const sq = h.pop > 0 ? Math.sin(h.pop * Math.PI) * 0.05 : 0;
        const dw = HOUSE_W * (1 + sq);
        const dh = hh * (1 - sq);
        if (sp) ctx.drawImage(sp.house, HOUSE_X - (dw - HOUSE_W) / 2, y - dh, dw, dh);
        else {
          ctx.fillStyle = theme.surface2;
          ctx.fillRect(HOUSE_X + 30, y - hh + 20, HOUSE_W - 40, hh - 30);
        }
        const m = mailboxOf(h, art, sp);
        const my = screenY(w, m.d);
        if (h.got) {
          drawBadge(ctx, m.x, my - 26, h.got === 2, h.pop);
        } else if (h === target) {
          const pulse = (Math.sin(w.t * 7) + 1) / 2;
          ctx.strokeStyle = pal.ring;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 5]);
          ctx.lineDashOffset = -w.t * 20;
          ctx.beginPath();
          ctx.ellipse(m.x, my + 4, 20 + pulse * 4, 15 + pulse * 3, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Bouncing arrow
          const ay = my - 34 - pulse * 6;
          ctx.fillStyle = pal.ring;
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(m.x - 8, ay - 8);
          ctx.lineTo(m.x + 8, ay - 8);
          ctx.lineTo(m.x, ay + 2);
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
        }
      }

      drawFinish(ctx, screenY(w, w.finishD));

      // Missed papers lying on the ground.
      for (const l of w.landed) {
        const y = screenY(w, l.d);
        ctx.globalAlpha = Math.min(1, l.life * 2);
        ctx.save();
        ctx.translate(l.x, y);
        ctx.rotate(l.rot);
        if (sp) ctx.drawImage(sp.paper, -11, -10, 22, 20);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Road things + rider sorted by ground line.
      type Drawable = { y: number; fn: () => void };
      const list: Drawable[] = [];
      for (const o of w.obs) {
        const y = screenY(w, o.d);
        if (y < -70 || y > H + 70) continue;
        if (o.hit && (o.kind === "bundle" || o.kind === "star")) continue;
        list.push({
          y,
          fn: () => {
            ctx.fillStyle = "rgba(0,0,0,0.14)";
            switch (o.kind) {
              case "puddle": {
                ctx.globalAlpha = o.hit ? 0.55 : 1;
                if (sp) {
                  const ww = keira ? 58 : 30;
                  const img = sp.hazard;
                  const hh2 = (ww * img.naturalHeight) / img.naturalWidth;
                  if (!keira) {
                    ctx.beginPath();
                    ctx.ellipse(o.x + 3, y - 2, 15, 6, 0, 0, Math.PI * 2);
                    ctx.fill();
                  }
                  ctx.save();
                  ctx.translate(o.x, keira ? y - 8 : y);
                  if (o.hit && !keira) ctx.rotate(1.1);
                  ctx.drawImage(img, -ww / 2, keira ? -hh2 / 2 : -hh2, ww, hh2);
                  ctx.restore();
                } else {
                  ctx.fillStyle = "#f472b6";
                  ctx.beginPath();
                  ctx.ellipse(o.x, y - 8, 24, 16, 0, 0, Math.PI * 2);
                  ctx.fill();
                }
                ctx.globalAlpha = 1;
                break;
              }
              case "walker": {
                ctx.beginPath();
                ctx.ellipse(o.x, y - 1, 18, 6, 0, 0, Math.PI * 2);
                ctx.fill();
                if (sp?.walker) {
                  const img = sp.walker;
                  const ww = 50;
                  const hh2 = (ww * img.naturalHeight) / img.naturalWidth;
                  const hop = Math.abs(Math.sin(o.t * 8)) * 3;
                  ctx.save();
                  ctx.translate(o.x, y - hop);
                  if (o.vx < 0) ctx.scale(-1, 1);
                  ctx.drawImage(img, -ww / 2, -hh2, ww, hh2);
                  ctx.restore();
                } else {
                  // Rolling beach ball.
                  const rad = 14;
                  ctx.save();
                  ctx.translate(o.x, y - rad);
                  ctx.rotate(o.x / rad);
                  const cols = ["#f472b6", "#fde68a", "#93c5fd", "#ffffff", "#c4b5fd", "#a7f3d0"];
                  for (let i = 0; i < 6; i++) {
                    ctx.fillStyle = cols[i];
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.arc(0, 0, rad, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
                    ctx.fill();
                  }
                  ctx.restore();
                  ctx.strokeStyle = "rgba(0,0,0,0.12)";
                  ctx.lineWidth = 1.5;
                  ctx.beginPath();
                  ctx.arc(o.x, y - rad, rad, 0, Math.PI * 2);
                  ctx.stroke();
                  ctx.fillStyle = "rgba(255,255,255,0.7)";
                  ctx.beginPath();
                  ctx.arc(o.x - 5, y - rad - 5, 3.5, 0, Math.PI * 2);
                  ctx.fill();
                }
                break;
              }
              case "bundle": {
                const bob = Math.sin(w.t * 4 + o.d) * 3;
                ctx.beginPath();
                ctx.ellipse(o.x, y, 18, 6, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "rgba(255,255,255,0.75)";
                ctx.beginPath();
                ctx.arc(o.x, y - 18 + bob, 21, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = pal.ring;
                ctx.lineWidth = 2.5;
                ctx.stroke();
                if (sp) {
                  for (let i = 0; i < 3; i++) {
                    ctx.drawImage(sp.paper, o.x - 14 + (i - 1) * 4, y - 30 + bob + i * 5, 28, 24);
                  }
                }
                ctx.fillStyle = "#0f766e";
                ctx.font = "900 11px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(`+${BUNDLE_SIZE}`, o.x + 18, y - 34 + bob);
                break;
              }
              case "star": {
                const bob = Math.sin(w.t * 5 + o.t) * 2.5;
                const s = 24 + Math.sin(w.t * 6 + o.t) * 2;
                ctx.beginPath();
                ctx.ellipse(o.x, y, 8, 3, 0, 0, Math.PI * 2);
                ctx.fill();
                if (sp) ctx.drawImage(sp.sparkle, o.x - s / 2, y - 16 - s / 2 + bob, s, s);
                else {
                  ctx.fillStyle = "#facc15";
                  ctx.beginPath();
                  ctx.arc(o.x, y - 16, 9, 0, Math.PI * 2);
                  ctx.fill();
                }
                break;
              }
            }
          },
        });
      }
      const r = w.rider;
      list.push({
        y: r.y,
        fn: () => {
          const blink = r.invuln > 0 && Math.floor(r.invuln * 10) % 2 === 0;
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.beginPath();
          ctx.ellipse(r.x, r.y - 1, 28, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.globalAlpha = blink ? 0.35 : 1;
          const moving = w.phase === "playing";
          const bob = moving ? Math.sin(w.t * 14) * 1.2 : 0;
          const lean =
            Math.max(-0.22, Math.min(0.22, r.vx * 0.0022)) +
            (r.wobble > 0 ? Math.sin(w.t * 34) * 0.22 * r.wobble : 0);
          ctx.translate(r.x, r.y + bob);
          ctx.rotate(lean);
          if (sp) {
            const img = sp.rider;
            const ww = (RIDER_H * img.naturalWidth) / img.naturalHeight;
            ctx.drawImage(img, -ww / 2, -RIDER_H, ww, RIDER_H);
          } else {
            ctx.fillStyle = theme.accent;
            ctx.beginPath();
            ctx.arc(0, -30, 20, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        },
      });
      list.sort((a, b) => a.y - b.y);
      for (const item of list) item.fn();

      // Papers flying (above everything on the ground).
      for (const p of w.papers) {
        const u = Math.min(1, p.u);
        const gx = p.sx + (p.ex - p.sx) * u;
        const gy = screenY(w, p.sd + (p.ed - p.sd) * u);
        const z = 4 * p.arc * u * (1 - u);
        const sc = 1 + z / 220;
        ctx.fillStyle = "rgba(0,0,0,0.16)";
        ctx.beginPath();
        ctx.ellipse(gx, gy, 10 * (1 - z / 300), 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(gx, gy - z);
        ctx.rotate(u * Math.PI * 3);
        ctx.scale(sc, sc);
        if (sp) ctx.drawImage(sp.paper, -13, -12, 26, 23);
        else {
          ctx.fillStyle = "#fff";
          ctx.fillRect(-10, -7, 20, 14);
        }
        ctx.restore();
      }

      drawTrees(ctx, w, pal);

      // Particles
      for (const p of w.parts) {
        const a = Math.max(0, p.life / p.max);
        const y = screenY(w, p.d);
        ctx.globalAlpha = a;
        if (p.star && sp) {
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rot);
          ctx.drawImage(sp.sparkle, -p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Floating texts
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const t of w.texts) {
        const y = screenY(w, t.d);
        const age = 1.1 - t.life;
        const s = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : 1.1 - Math.min(0.1, (age - 0.15) * 0.3);
        ctx.globalAlpha = Math.min(1, t.life * 2.2);
        ctx.save();
        ctx.translate(Math.min(W - 60, Math.max(60, t.x)), y);
        ctx.scale(s, s);
        ctx.font = `900 ${t.big ? 19 : 15}px system-ui, sans-serif`;
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#fff";
        ctx.lineJoin = "round";
        ctx.strokeText(t.text, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // Route progress bar along the top.
      const first = w.houses[0].d - 200;
      const prog = Math.max(0, Math.min(1, (w.s + (H - w.rider.y) - first) / (w.finishD - first)));
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.roundRect(12, 10, W - 24, 10, 5);
      ctx.fill();
      ctx.fillStyle = pal.ring;
      ctx.beginPath();
      ctx.roundRect(12, 10, Math.max(10, (W - 24) * prog), 10, 5);
      ctx.fill();
      ctx.font = "900 14px system-ui, sans-serif";
      ctx.fillText("🏁", W - 16, 15);

      // Hint
      if (w.phase === "playing" && w.runT < 5 && w.route === 1) {
        ctx.globalAlpha = Math.min(1, (5 - w.runT) / 0.8);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 128, 34, 256, 34, 17);
        ctx.fill();
        ctx.fillStyle = theme.ink;
        ctx.font = "900 15px system-ui, sans-serif";
        ctx.fillText(`👆 Drag to steer · Tap to toss!`, W / 2, 52);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const w = world.current;
      if (!pausedRef.current) {
        w.t += dt;
        if (w.phase === "playing") update(w, dt);
        updateFx(w, dt);
      }
      draw(w);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [art, profileId, theme, copy, syncHud]);

  /* ---------------- pointer ---------------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = world.current;
    if (w.phase !== "playing" || paused) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no capture target */
    }
    const p = canvasPoint(e, e.currentTarget, W, H);
    drag.current = {
      id: e.pointerId,
      px: p.x,
      py: p.y,
      rx: w.rider.tx,
      ry: w.rider.ty,
      t: performance.now(),
      moved: 0,
    };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const dr = drag.current;
    if (!dr || dr.id !== e.pointerId) return;
    const p = canvasPoint(e, e.currentTarget, W, H);
    const dx = p.x - dr.px;
    const dy = p.y - dr.py;
    dr.moved = Math.max(dr.moved, Math.hypot(dx, dy));
    if (dr.moved > 8) {
      const r = world.current.rider;
      r.tx = dr.rx + dx * 1.15;
      r.ty = dr.ry + dy * 1.15;
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const dr = drag.current;
    if (!dr || dr.id !== e.pointerId) return;
    drag.current = null;
    if (dr.moved <= 12 && performance.now() - dr.t < 450) {
      toss(canvasPoint(e, e.currentTarget, W, H));
    }
  };
  const onPointerCancel = () => {
    drag.current = null;
  };

  const stars = summary?.stars ?? 0;

  return (
    <div className="game-root">
      <div className="flex w-full max-w-[420px] flex-wrap items-center justify-center gap-1.5 px-2">
        <StatPill>
          {Array.from({ length: LIVES }, (_, i) => (i < hud.lives ? "❤️" : "🤍")).join("")}
        </StatPill>
        <StatPill className={hud.bag <= 2 ? "animate-pulse" : undefined}>
          <span key={hudBump} className="score-bump inline-block">
            {copy.bagIcon} {hud.bag}
          </span>
        </StatPill>
        <StatPill>
          🏠 {hud.delivered}/{HOUSES_PER_ROUTE}
        </StatPill>
        <StatPill accent>Route {hud.route}</StatPill>
      </div>
      <CanvasStage
        width={W}
        height={H}
        canvasRef={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <GameOverlay
          show={phase === "ready"}
          emoji={copy.emoji}
          title={theme.gameNames.paperboy}
          subtitle={copy.start}
          actionLabel={copy.go}
          onAction={startRun}
        />
        <GameOverlay
          show={phase === "routeDone"}
          tone="win"
          emoji={"⭐".repeat(stars) + "☆".repeat(3 - stars)}
          title={`Route ${summary?.route ?? 1} done!`}
          subtitle={`${summary?.delivered ?? 0} of ${HOUSES_PER_ROUTE} ${copy.items} delivered${
            summary?.bulls ? ` · ${summary.bulls} bullseye${summary.bulls > 1 ? "s" : ""}` : ""
          }${stars ? ` · +${stars * 25} bonus` : ""}`}
          actionLabel="Next route →"
          onAction={nextRoute}
        />
        <GameOverlay
          show={phase === "over"}
          tone="lose"
          emoji="💫"
          title={copy.overTitle}
          subtitle={`You delivered ${summary?.total ?? 0} ${copy.items} and reached route ${
            summary?.route ?? 1
          }.`}
          actionLabel="Ride again"
          onAction={startRun}
        />
      </CanvasStage>
    </div>
  );
}
