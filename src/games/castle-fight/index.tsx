"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameProps } from "@/lib/game-registry";
import type { ProfileId } from "@/lib/profiles";
import { PROFILES } from "@/lib/profiles";

type Side = "you" | "them";
type Kind = "friend" | "champ" | "foe";

type Unit = {
  id: number;
  x: number;
  side: Side;
  kind: Kind;
  hp: number;
  maxHp: number;
};

type UnitStats = {
  hp: number;
  dmg: number;
  speed: number;
  cost: number;
};

const TICK_MS = 520;
const LANE = 100;
const HOME_GATE = 22;
const FOE_GATE = 78;
const MELEE_RANGE = 8;
const CASTLE_HP = 80;
const CASTLE_HIT = 5;
const START_GOLD = 16;
const GOLD_CAP = 36;
const GOLD_PER_TICK = 2;
const GRACE_TICKS = 7;
const ENEMY_SPAWN_CHANCE = 0.2;
const MAX_ENEMIES = 3;

function unitStats(kind: Kind): UnitStats {
  switch (kind) {
    case "friend":
      return { hp: 22, dmg: 3, speed: 1.7, cost: 8 };
    case "champ":
      return { hp: 40, dmg: 6, speed: 1.25, cost: 16 };
    case "foe":
      return { hp: 18, dmg: 3, speed: 1.35, cost: 0 };
    default: {
      const neverKind: never = kind;
      throw new Error(`Unknown unit ${neverKind}`);
    }
  }
}

function battlefieldSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/castle-fight/battlefield-keira.png";
    case "luke":
      return "/games/castle-fight/battlefield-luke.png";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function homeCastleSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/castle-fight/castle-home-keira.png";
    case "luke":
      return "/games/castle-fight/castle-home-luke.png";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function foeCastleSrc(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "/games/castle-fight/castle-foe-keira.png";
    case "luke":
      return "/games/castle-fight/castle-foe-luke.png";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function unitSrc(profileId: ProfileId, kind: Kind): string {
  switch (profileId) {
    case "keira":
      switch (kind) {
        case "friend":
          return "/games/castle-fight/unit-fairy.png";
        case "champ":
          return "/games/castle-fight/unit-unicorn.png";
        case "foe":
          return "/games/castle-fight/unit-foe-sprite.png";
        default: {
          const neverKind: never = kind;
          throw new Error(`Unknown unit ${neverKind}`);
        }
      }
    case "luke":
      switch (kind) {
        case "friend":
          return "/games/castle-fight/unit-knight.png";
        case "champ":
          return "/games/castle-fight/unit-dino.png";
        case "foe":
          return "/games/castle-fight/unit-foe-robot.png";
        default: {
          const neverKind: never = kind;
          throw new Error(`Unknown unit ${neverKind}`);
        }
      }
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function friendLabel(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Fairy";
    case "luke":
      return "Knight";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function champLabel(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Unicorn";
    case "luke":
      return "Dino";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function startMessage(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Tap a fairy friend to march!";
    case "luke":
      return "Tap a helper to march!";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function winMessage(profileId: ProfileId): string {
  switch (profileId) {
    case "keira":
      return "Yay! The fairy castle is safe!";
    case "luke":
      return "Yay! The rocket castle stands!";
    default: {
      const neverId: never = profileId;
      throw new Error(`Unknown profile ${neverId}`);
    }
  }
}

function HpBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "you" | "them";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/20">
      <div
        className={
          tone === "you"
            ? "h-full rounded-full bg-emerald-400"
            : "h-full rounded-full bg-rose-400"
        }
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function CastleFightGame({
  profileId,
  paused,
  onScoreChange,
}: GameProps) {
  const theme = PROFILES[profileId];
  const [gold, setGold] = useState(START_GOLD);
  const [youHp, setYouHp] = useState(CASTLE_HP);
  const [themHp, setThemHp] = useState(CASTLE_HP);
  const [units, setUnits] = useState<Unit[]>([]);
  const [msg, setMsg] = useState(() => startMessage(profileId));
  const [homeFlash, setHomeFlash] = useState(false);
  const [foeFlash, setFoeFlash] = useState(false);
  const [pop, setPop] = useState<string | null>(null);
  const idRef = useRef(1);
  const sim = useRef({
    gold: START_GOLD,
    youHp: CASTLE_HP,
    themHp: CASTLE_HP,
    units: [] as Unit[],
    tick: 0,
    score: 0,
  });
  const done = youHp <= 0 || themHp <= 0;

  const sync = useCallback(() => {
    setGold(sim.current.gold);
    setYouHp(sim.current.youHp);
    setThemHp(sim.current.themHp);
    setUnits([...sim.current.units]);
    onScoreChange?.(sim.current.score);
  }, [onScoreChange]);

  const reset = useCallback(() => {
    sim.current = {
      gold: START_GOLD,
      youHp: CASTLE_HP,
      themHp: CASTLE_HP,
      units: [],
      tick: 0,
      score: 0,
    };
    idRef.current = 1;
    setMsg(startMessage(profileId));
    setPop(null);
    setHomeFlash(false);
    setFoeFlash(false);
    sync();
  }, [profileId, sync]);

  useEffect(() => {
    reset();
  }, [profileId, reset]);

  const spawn = useCallback((side: Side, kind: Kind) => {
    const stats = unitStats(kind);
    const unit: Unit = {
      id: idRef.current++,
      x: side === "you" ? HOME_GATE + 4 : FOE_GATE - 4,
      side,
      kind,
      hp: stats.hp,
      maxHp: stats.hp,
    };
    sim.current.units.push(unit);
  }, []);

  const train = useCallback(
    (kind: "friend" | "champ") => {
      if (paused || done) return;
      const cost = unitStats(kind).cost;
      if (sim.current.gold < cost) {
        setMsg("Need more coins!");
        return;
      }
      sim.current.gold -= cost;
      spawn("you", kind);
      setMsg(
        kind === "champ"
          ? `${champLabel(profileId)} is on the way!`
          : `${friendLabel(profileId)} friend!`,
      );
      setPop(kind === "champ" ? "Big helper!" : "Go go go!");
      window.setTimeout(() => setPop(null), 700);
      sync();
    },
    [done, paused, profileId, spawn, sync],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused) return;
      const s = sim.current;
      if (s.youHp <= 0 || s.themHp <= 0) return;

      s.tick += 1;
      s.gold = Math.min(GOLD_CAP, s.gold + GOLD_PER_TICK);

      const enemyCount = s.units.filter((u) => u.side === "them").length;
      if (
        s.tick > GRACE_TICKS &&
        enemyCount < MAX_ENEMIES &&
        Math.random() < ENEMY_SPAWN_CHANCE
      ) {
        spawn("them", "foe");
      }

      const engaged = new Set<number>();
      const yours = s.units.filter((u) => u.side === "you");
      const theirs = s.units.filter((u) => u.side === "them");

      for (const you of yours) {
        let best: Unit | null = null;
        let bestDist = MELEE_RANGE;
        for (const foe of theirs) {
          if (engaged.has(foe.id)) continue;
          const dist = Math.abs(foe.x - you.x);
          if (dist < bestDist) {
            best = foe;
            bestDist = dist;
          }
        }
        if (best) {
          engaged.add(you.id);
          engaged.add(best.id);
          you.hp -= unitStats(best.kind).dmg;
          best.hp -= unitStats(you.kind).dmg;
        }
      }

      for (const u of s.units) {
        if (engaged.has(u.id)) continue;
        const stats = unitStats(u.kind);
        if (u.side === "you") {
          if (u.x >= FOE_GATE - 2) {
            s.themHp = Math.max(0, s.themHp - CASTLE_HIT);
            s.score += CASTLE_HIT;
            u.hp = 0;
            setFoeFlash(true);
            window.setTimeout(() => setFoeFlash(false), 280);
          } else {
            u.x = Math.min(FOE_GATE, u.x + stats.speed);
          }
        } else if (u.x <= HOME_GATE + 2) {
          s.youHp = Math.max(0, s.youHp - CASTLE_HIT);
          u.hp = 0;
          setHomeFlash(true);
          window.setTimeout(() => setHomeFlash(false), 280);
        } else {
          u.x = Math.max(HOME_GATE, u.x - stats.speed);
        }
      }

      s.units = s.units.filter((u) => u.hp > 0);

      if (s.themHp <= 0) setMsg(winMessage(profileId));
      if (s.youHp <= 0) setMsg("Oh no — let's try again.");

      sync();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [paused, profileId, spawn, sync]);

  const friendCost = unitStats("friend").cost;
  const champCost = unitStats("champ").cost;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-lg font-black text-[var(--ink)]">
          <img
            src="/games/castle-fight/gold-coin.png"
            alt=""
            className="h-8 w-8 rounded-full object-cover shadow"
          />
          <span>{gold}</span>
        </div>
        {done ? (
          <button
            type="button"
            className="min-h-12 rounded-2xl bg-[var(--accent)] px-4 py-3 font-bold text-[var(--accent-fg)]"
            onClick={reset}
          >
            Rematch
          </button>
        ) : (
          <span className="text-sm font-bold text-[var(--ink)]/70">
            {theme.gameNames["castle-fight"]}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border-4 border-white/80 shadow-lg">
        <div className="relative h-56 sm:h-64">
          <img
            src={battlefieldSrc(profileId)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-8">
            <div className="w-24">
              <p className="mb-1 text-center text-xs font-black text-white drop-shadow">
                You {youHp}
              </p>
              <HpBar value={youHp} max={CASTLE_HP} tone="you" />
            </div>
            <div className="w-24">
              <p className="mb-1 text-center text-xs font-black text-white drop-shadow">
                Them {themHp}
              </p>
              <HpBar value={themHp} max={CASTLE_HP} tone="them" />
            </div>
          </div>

          <img
            src={homeCastleSrc(profileId)}
            alt="Your castle"
            className={`absolute bottom-1 left-0 z-10 h-[4.5rem] w-[4.5rem] rounded-2xl object-cover shadow-md ring-2 ring-white/80 transition ${
              homeFlash ? "brightness-125 scale-105" : ""
            }`}
          />
          <img
            src={foeCastleSrc(profileId)}
            alt="Their castle"
            className={`absolute bottom-1 right-0 z-10 h-[4.5rem] w-[4.5rem] rounded-2xl object-cover shadow-md ring-2 ring-white/80 transition ${
              foeFlash ? "brightness-125 scale-105" : ""
            }`}
          />

          {units.map((u) => (
            <div
              key={u.id}
              className="absolute bottom-4 z-20 transition-all duration-500"
              style={{
                left: `${u.x}%`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="h-1.5 w-12 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-lime-300"
                  style={{ width: `${(u.hp / u.maxHp) * 100}%` }}
                />
              </div>
              <img
                src={unitSrc(profileId, u.kind)}
                alt=""
                className={`mt-0.5 h-14 w-14 rounded-full border-2 border-white object-cover shadow-md ${
                  u.side === "them" ? "scale-x-[-1]" : ""
                }`}
              />
            </div>
          ))}

          {pop ? (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-2xl font-black text-white drop-shadow-lg">
              {pop}
            </p>
          ) : null}
        </div>
        <p className="bg-[var(--surface)] px-3 py-2 text-center text-sm font-semibold text-[var(--ink)]">
          {msg}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={paused || done || gold < friendCost}
          className="flex min-h-20 flex-col items-center justify-center rounded-3xl bg-[var(--accent)] px-2 py-2 text-base font-black text-[var(--accent-fg)] shadow-md disabled:opacity-45 active:scale-95"
          onClick={() => train("friend")}
        >
          <img
            src={unitSrc(profileId, "friend")}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
          Send {friendLabel(profileId)} · {friendCost}
        </button>
        <button
          type="button"
          disabled={paused || done || gold < champCost}
          className="flex min-h-20 flex-col items-center justify-center rounded-3xl bg-[var(--surface)] px-2 py-2 text-base font-black text-[var(--ink)] shadow-md ring-2 ring-white/80 disabled:opacity-45 active:scale-95"
          onClick={() => train("champ")}
        >
          <img
            src={unitSrc(profileId, "champ")}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
          Send {champLabel(profileId)} · {champCost}
        </button>
      </div>
      <p className="text-center text-sm text-[var(--ink)]/70">
        Friends walk by themselves. Watch the castle hearts!
      </p>
    </div>
  );
}
