import type { SfxName } from "@/lib/sfx";
import {
  BRAMBLE_THORN,
  CELL_W,
  CREEPERS,
  DEW_SPLASH,
  HOUSE_LINE,
  LAWN_LEFT,
  LAWN_RIGHT,
  LAWN_TOP,
  CELL_H,
  LEVELS,
  PLANTS,
  PLANT_ORDER,
  ROWS,
  SLOW_FACTOR,
  SLOW_TIME,
  SPAWN_X,
  SUN_HIT,
  SUN_VALUE,
  cellAt,
  colCenter,
  rowFeet,
  type CreeperKind,
  type PlantKind,
} from "./balance";

export type Phase = "ready" | "play" | "cleared" | "won" | "lost";

export type Plant = {
  kind: PlantKind;
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  cd: number;
  sunCd: number;
  age: number;
  hurt: number;
  mouth: number;
};

export type Creeper = {
  kind: CreeperKind;
  row: number;
  x: number;
  hp: number;
  maxHp: number;
  slow: number;
  biteCd: number;
  hurt: number;
  dead: number;
  walk: number;
  eating: boolean;
  leaked: boolean;
};

export type Shot = {
  kind: "pod" | "dew" | "chill";
  row: number;
  x: number;
  y: number;
  vx: number;
  x0: number;
  x1: number;
  yBase: number;
  t: number;
  dur: number;
  dmg: number;
  alive: boolean;
};

export type SunOrb = {
  x: number;
  y: number;
  x0: number;
  y0: number;
  targetY: number;
  landed: boolean;
  collecting: boolean;
  collectT: number;
  age: number;
  ttl: number;
  value: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "dot" | "leaf" | "text" | "ring" | "spark";
  text?: string;
  rot: number;
  vr: number;
  grav: number;
};

export type Match = {
  phase: Phase;
  level: number;
  time: number;
  elapsed: number;
  sun: number;
  hearts: number;
  score: number;
  levelStartScore: number;
  kills: number;
  spawned: number;
  selected: PlantKind | "trowel" | null;
  hoverCol: number;
  hoverRow: number;
  plants: Plant[];
  creepers: Creeper[];
  shots: Shot[];
  suns: SunOrb[];
  parts: Particle[];
  cd: Record<PlantKind, number>;
  banner: string;
  bannerT: number;
  shake: number;
  houseHurt: number;
  skyCd: number;
  zapCd: number;
  hitCd: number;
  seed: number;
  cues: SfxName[];
};

function rand(m: Match) {
  m.seed = (Math.imul(m.seed, 1664525) + 1013904223) >>> 0;
  return m.seed / 4294967296;
}

function emptyCd(): Record<PlantKind, number> {
  return { sunbloom: 0, podsnap: 0, bramble: 0, dewburst: 0, chillvine: 0 };
}

function banner(m: Match, text: string) {
  m.banner = text;
  m.bannerT = 1.35;
}

export function createMatch(level: number, score: number): Match {
  const lv = clampLevel(level);
  const def = LEVELS[lv - 1];
  const m: Match = {
    phase: "ready",
    level: lv,
    time: 0,
    elapsed: 0,
    sun: def.sun,
    hearts: def.hearts,
    score,
    levelStartScore: score,
    kills: 0,
    spawned: 0,
    selected: null,
    hoverCol: -1,
    hoverRow: -1,
    plants: [],
    creepers: [],
    shots: [],
    suns: [],
    parts: [],
    cd: emptyCd(),
    banner: "",
    bannerT: 0,
    shake: 0,
    houseHurt: 0,
    skyCd: 4.5,
    zapCd: 0,
    hitCd: 0,
    seed: 900 + lv * 91,
    cues: [],
  };
  dropSun(m, colCenter(5), rowFeet(1) - 28, true);
  dropSun(m, colCenter(6), rowFeet(3) - 30, true);
  return m;
}

function clampLevel(level: number) {
  return Math.max(1, Math.min(LEVELS.length, level));
}

export function resetMatch(into: Match, level: number, score: number) {
  Object.assign(into, createMatch(level, score));
}

export function begin(m: Match) {
  if (m.phase !== "ready") return;
  m.phase = "play";
  m.banner = LEVELS[m.level - 1].blurb;
  m.bannerT = 4.4;
  m.cues.push("pop");
}

export function choose(m: Match, kind: PlantKind | "trowel") {
  if (m.phase !== "play") return;
  if (kind !== "trowel") {
    const stats = PLANTS[kind];
    if (m.level < stats.unlock) {
      banner(m, `Opens on meadow ${stats.unlock}`);
      m.cues.push("miss");
      return;
    }
    if (m.cd[kind] > 0) {
      banner(m, "Still growing");
      m.cues.push("miss");
      return;
    }
    if (m.sun < stats.cost) {
      banner(m, "Need more sun");
      m.cues.push("miss");
      return;
    }
  }
  m.selected = m.selected === kind ? null : kind;
  m.cues.push("tap");
}

export function setHover(m: Match, x: number, y: number) {
  const cell = cellAt(x, y);
  m.hoverCol = cell?.col ?? -1;
  m.hoverRow = cell?.row ?? -1;
}

export function tapLawn(m: Match, x: number, y: number) {
  if (m.phase !== "play") return;
  const sun = [...m.suns].reverse().find((s) => !s.collecting && nearSun(s, x, y));
  if (sun) {
    collect(m, sun);
    return;
  }
  const cell = cellAt(x, y);
  if (!cell) return;
  if (!m.selected) {
    banner(m, "Pick a plant first");
    return;
  }
  if (m.selected === "trowel") {
    dig(m, cell.col, cell.row);
    return;
  }
  place(m, m.selected, cell.col, cell.row);
}

function nearSun(s: SunOrb, x: number, y: number) {
  const dx = s.x - x;
  const dy = s.y - y;
  return dx * dx + dy * dy <= SUN_HIT * SUN_HIT;
}

function collect(m: Match, s: SunOrb) {
  if (s.collecting) return;
  s.collecting = true;
  s.collectT = 0;
  s.x0 = s.x;
  s.y0 = s.y;
  m.cues.push("coin");
  puff(m, s.x, s.y, "#ffe08a", 8);
  textPop(m, s.x, s.y - 10, `+${s.value}`);
}

function dropSun(m: Match, x: number, y: number, landed: boolean) {
  m.suns.push({
    x,
    y: landed ? y : -16,
    x0: x,
    y0: y,
    targetY: y,
    landed,
    collecting: false,
    collectT: 0,
    age: rand(m) * 4,
    ttl: 16,
    value: SUN_VALUE,
  });
}

function place(m: Match, kind: PlantKind, col: number, row: number) {
  const stats = PLANTS[kind];
  if (m.level < stats.unlock) return;
  if (m.cd[kind] > 0) {
    banner(m, "Still growing");
    return;
  }
  if (m.sun < stats.cost) {
    banner(m, "Need more sun");
    m.cues.push("miss");
    return;
  }
  if (m.plants.some((p) => p.col === col && p.row === row && p.hp > 0)) {
    banner(m, "Square is full");
    m.cues.push("miss");
    return;
  }
  m.sun -= stats.cost;
  m.cd[kind] = stats.recharge;
  m.selected = null;
  m.plants.push({
    kind,
    col,
    row,
    hp: stats.hp,
    maxHp: stats.hp,
    cd: Math.min(0.4, stats.fire * 0.35),
    sunCd: 2.8,
    age: 0,
    hurt: 0,
    mouth: 0,
  });
  m.cues.push("pop");
  const x = colCenter(col);
  const y = rowFeet(row) - 20;
  puff(m, x, y, "#b6f5a0", 10);
}

function dig(m: Match, col: number, row: number) {
  const i = m.plants.findIndex((p) => p.col === col && p.row === row && p.hp > 0);
  if (i < 0) {
    banner(m, "Nothing planted there");
    m.cues.push("miss");
    return;
  }
  const p = m.plants[i];
  m.plants.splice(i, 1);
  m.selected = null;
  m.cues.push("tap");
  puff(m, colCenter(p.col), rowFeet(p.row) - 16, "#d7f5a8", 8);
  banner(m, "Dug up");
}

function spawnCreeper(m: Match, kind: CreeperKind, row: number) {
  const stats = CREEPERS[kind];
  const safeRow = Math.max(0, Math.min(ROWS - 1, row));
  m.creepers.push({
    kind,
    row: safeRow,
    x: SPAWN_X,
    hp: stats.hp,
    maxHp: stats.hp,
    slow: 0,
    biteCd: 0.35,
    hurt: 0,
    dead: 0,
    walk: rand(m) * 6,
    eating: false,
    leaked: false,
  });
}

function hurtCreeper(m: Match, z: Creeper, dmg: number, slow: number) {
  if (z.hp <= 0 || z.dead > 0 || z.leaked) return;
  z.hp -= dmg;
  if (dmg >= 1) z.hurt = 0.12;
  if (slow > 0) z.slow = Math.max(z.slow, slow);
  if (z.hp <= 0) {
    z.hp = 0;
    z.dead = 0.5;
    z.eating = false;
    m.kills += 1;
    m.score += 100;
    m.cues.push("boom");
    const y = rowFeet(z.row) - 28;
    puff(m, z.x, y, creeperColor(z.kind), 12);
    textPop(m, z.x, y - 8, "+100");
  }
}

function leak(m: Match, z: Creeper) {
  if (z.leaked || z.hp <= 0) return;
  z.leaked = true;
  z.hp = 0;
  z.dead = 0.35;
  z.eating = false;
  m.hearts -= 1;
  m.shake = 0.45;
  m.houseHurt = 0.45;
  m.cues.push("hit");
  puff(m, HOUSE_LINE + 10, rowFeet(z.row) - 20, "#ffb4a2", 8);
}

function creeperColor(kind: CreeperKind) {
  if (kind === "dashling") return "#f0a15a";
  if (kind === "barkhelm") return "#8a6244";
  if (kind === "gnasher") return "#c46b84";
  return "#8fbf55";
}

function plantAt(m: Match, z: Creeper) {
  let best: Plant | null = null;
  for (const p of m.plants) {
    if (p.row !== z.row || p.hp <= 0) continue;
    const left = LAWN_LEFT + p.col * CELL_W + 8;
    const right = LAWN_LEFT + (p.col + 1) * CELL_W - 2;
    if (z.x < left || z.x > right) continue;
    if (!best || p.col > best.col) best = p;
  }
  return best;
}

function crowded(m: Match, z: Creeper) {
  for (const o of m.creepers) {
    if (o === z || o.row !== z.row || o.hp <= 0 || o.dead > 0) continue;
    if (o.x < z.x && z.x - o.x < 36) return true;
  }
  return false;
}

function shoot(m: Match, p: Plant) {
  const stats = PLANTS[p.kind];
  const px = colCenter(p.col);
  const py = rowFeet(p.row) - 28;
  const ahead = m.creepers.filter(
    (z) => z.row === p.row && z.hp > 0 && z.dead <= 0 && !z.leaked && z.x > px + 24,
  );
  if (ahead.length === 0) {
    p.cd = 0.22;
    return;
  }
  ahead.sort((a, b) => a.x - b.x);
  const target = ahead[0];
  p.mouth = 0.18;
  if (m.zapCd <= 0) {
    m.cues.push("zap");
    m.zapCd = 0.16;
  }
  if (stats.shot === "dew") {
    const x1 = Math.max(px + 90, Math.min(LAWN_RIGHT - 16, target.x - 8));
    m.shots.push({
      kind: "dew",
      row: p.row,
      x: px + 8,
      y: py,
      vx: 0,
      x0: px + 8,
      x1,
      yBase: py,
      t: 0,
      dur: 0.62,
      dmg: stats.dmg,
      alive: true,
    });
    return;
  }
  m.shots.push({
    kind: stats.shot === "chill" ? "chill" : "pod",
    row: p.row,
    x: px + 18,
    y: py,
    vx: stats.shot === "chill" ? 300 : 360,
    x0: px,
    x1: px,
    yBase: py,
    t: 0,
    dur: 0,
    dmg: stats.dmg,
    alive: true,
  });
}

function splash(m: Match, x: number, row: number, dmg: number) {
  puff(m, x, rowFeet(row) - 20, "#b9ecff", 14);
  m.parts.push({
    x,
    y: rowFeet(row) - 16,
    vx: 0,
    vy: 0,
    life: 0.35,
    max: 0.35,
    size: DEW_SPLASH,
    color: "#7fd4ef",
    kind: "ring",
    rot: 0,
    vr: 0,
    grav: 0,
  });
  for (const z of m.creepers) {
    if (z.hp <= 0 || z.dead > 0) continue;
    const rowD = Math.abs(z.row - row);
    if (rowD > 1) continue;
    if (Math.abs(z.x - x) > DEW_SPLASH) continue;
    hurtCreeper(m, z, dmg * (rowD === 0 ? 1 : 0.55), 0);
  }
}

function puff(m: Match, x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + rand(m);
    const sp = 30 + rand(m) * 70;
    m.parts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 20,
      life: 0.45 + rand(m) * 0.25,
      max: 0.7,
      size: 3 + rand(m) * 4,
      color,
      kind: i % 3 === 0 ? "leaf" : "dot",
      rot: rand(m) * 6,
      vr: rand(m) * 6 - 3,
      grav: 180,
    });
  }
  if (m.parts.length > 140) m.parts.splice(0, m.parts.length - 140);
}

function textPop(m: Match, x: number, y: number, text: string) {
  m.parts.push({
    x,
    y,
    vx: 0,
    vy: -28,
    life: 0.7,
    max: 0.7,
    size: 16,
    color: "#fff7d6",
    kind: "text",
    text,
    rot: 0,
    vr: 0,
    grav: 0,
  });
}

function confetti(m: Match) {
  const colors = ["#ffe08a", "#ff8fab", "#9be7ff", "#b6f5a0", "#fff"];
  for (let i = 0; i < 36; i++) {
    m.parts.push({
      x: LAWN_LEFT + rand(m) * (LAWN_RIGHT - LAWN_LEFT),
      y: LAWN_TOP + rand(m) * 40,
      vx: rand(m) * 80 - 40,
      vy: 40 + rand(m) * 80,
      life: 1.1,
      max: 1.1,
      size: 4 + rand(m) * 4,
      color: colors[i % colors.length],
      kind: "spark",
      rot: rand(m),
      vr: rand(m) * 4,
      grav: 80,
    });
  }
}

function updateSuns(m: Match, dt: number) {
  const expire = m.phase === "play" ? dt : 0;
  for (const s of m.suns) {
    s.age += dt;
    if (s.collecting) {
      s.collectT += dt;
      const t = Math.min(1, s.collectT / 0.32);
      const e = 1 - (1 - t) * (1 - t);
      s.x = s.x0 + (54 - s.x0) * e;
      s.y = s.y0 + (24 - s.y0) * e;
      continue;
    }
    if (!s.landed) {
      s.y = Math.min(s.targetY, s.y + 140 * dt);
      if (s.y >= s.targetY) s.landed = true;
    } else {
      s.ttl -= expire;
    }
  }
  for (const s of m.suns) {
    if (s.collecting && s.collectT >= 0.32) {
      m.sun += s.value;
    }
  }
  m.suns = m.suns.filter((s) => {
    if (s.collecting) return s.collectT < 0.32;
    return s.ttl > 0;
  });
}

function updateParts(m: Match, dt: number) {
  for (const p of m.parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.rot += p.vr * dt;
  }
  m.parts = m.parts.filter((p) => p.life > 0);
}

function checkEnd(m: Match) {
  if (m.hearts <= 0) {
    m.phase = "lost";
    m.selected = null;
    m.shake = 0.55;
    m.cues.push("lose");
    return;
  }
  const def = LEVELS[m.level - 1];
  const pending = m.spawned < def.spawns.length;
  const alive = m.creepers.some((z) => z.hp > 0 && z.dead <= 0);
  if (!pending && !alive) {
    m.score += m.level >= LEVELS.length ? 1000 : 500;
    m.phase = m.level >= LEVELS.length ? "won" : "cleared";
    m.selected = null;
    m.cues.push("win");
    confetti(m);
  }
}

export function step(m: Match, dt: number) {
  const stepDt = Math.max(0, Math.min(0.05, dt));
  m.time += stepDt;
  m.shake = Math.max(0, m.shake - stepDt);
  m.bannerT = Math.max(0, m.bannerT - stepDt);
  m.houseHurt = Math.max(0, m.houseHurt - stepDt);
  m.zapCd = Math.max(0, m.zapCd - stepDt);
  m.hitCd = Math.max(0, m.hitCd - stepDt);
  updateParts(m, stepDt);
  updateSuns(m, stepDt);
  if (m.phase !== "play") return;

  m.elapsed += stepDt;
  const def = LEVELS[m.level - 1];

  while (m.spawned < def.spawns.length && m.elapsed >= def.spawns[m.spawned].at) {
    const sp = def.spawns[m.spawned];
    m.spawned += 1;
    spawnCreeper(m, sp.kind, sp.row);
  }

  m.skyCd -= stepDt;
  if (m.skyCd <= 0) {
    m.skyCd = def.sunEvery;
    const x = LAWN_LEFT + 36 + rand(m) * (LAWN_RIGHT - LAWN_LEFT - 72);
    const row = Math.floor(rand(m) * ROWS);
    dropSun(m, x, LAWN_TOP + (row + 0.45) * CELL_H, false);
  }

  for (const kind of PLANT_ORDER) m.cd[kind] = Math.max(0, m.cd[kind] - stepDt);

  for (const p of m.plants) {
    p.age += stepDt;
    p.hurt = Math.max(0, p.hurt - stepDt);
    p.mouth = Math.max(0, p.mouth - stepDt);
    const stats = PLANTS[p.kind];
    if (stats.sunEvery > 0) {
      p.sunCd -= stepDt;
      if (p.sunCd <= 0) {
        p.sunCd = stats.sunEvery;
        dropSun(m, colCenter(p.col) + 18, rowFeet(p.row) - 46, true);
      }
    }
    if (stats.fire > 0) {
      p.cd -= stepDt;
      if (p.cd <= 0) {
        p.cd = stats.fire;
        shoot(m, p);
      }
    }
  }

  for (const s of m.shots) {
    if (!s.alive) continue;
    if (s.kind === "dew") {
      s.t += stepDt / s.dur;
      const u = Math.min(1, s.t);
      s.x = s.x0 + (s.x1 - s.x0) * u;
      s.y = s.yBase - Math.sin(Math.PI * u) * 68;
      if (s.t >= 1) {
        s.alive = false;
        splash(m, s.x1, s.row, s.dmg);
      }
      continue;
    }
    const from = s.x;
    s.x += s.vx * stepDt;
    if (s.x > W_EDGE) {
      s.alive = false;
      continue;
    }
    let best: Creeper | null = null;
    for (const z of m.creepers) {
      if (z.row !== s.row || z.hp <= 0 || z.dead > 0 || z.leaked) continue;
      if (z.x < from - 12 || z.x > s.x + 16) continue;
      if (!best || z.x < best.x) best = z;
    }
    if (best) {
      hurtCreeper(m, best, s.dmg, s.kind === "chill" ? SLOW_TIME : 0);
      s.alive = false;
      puff(m, best.x, s.y, s.kind === "chill" ? "#dff6ff" : "#c6f59b", 5);
    }
  }
  m.shots = m.shots.filter((s) => s.alive);

  for (const z of m.creepers) {
    if (z.dead > 0) {
      z.dead -= stepDt;
      z.eating = false;
      continue;
    }
    if (z.hp <= 0) continue;
    z.hurt = Math.max(0, z.hurt - stepDt);
    if (z.slow > 0) z.slow = Math.max(0, z.slow - stepDt);
    const stats = CREEPERS[z.kind];
    const plant = plantAt(m, z);
    if (plant) {
      z.eating = true;
      z.walk += stepDt * 6;
      z.biteCd -= stepDt;
      if (z.biteCd <= 0) {
        z.biteCd = stats.biteEvery;
        plant.hp -= stats.bite;
        plant.hurt = 0.16;
        if (m.hitCd <= 0) {
          m.cues.push("hit");
          m.hitCd = 0.28;
        }
      }
      if (plant.kind === "bramble" && plant.hp > 0) {
        hurtCreeper(m, z, BRAMBLE_THORN * stepDt, 0);
      }
    } else if (!crowded(m, z)) {
      z.eating = false;
      const speed = stats.speed * (z.slow > 0 ? SLOW_FACTOR : 1);
      z.x -= speed * stepDt;
      z.walk += stepDt * speed * 0.18;
      if (z.x <= HOUSE_LINE) leak(m, z);
    } else {
      z.eating = false;
      z.walk += stepDt * 2;
    }
  }

  m.plants = m.plants.filter((p) => p.hp > 0);
  m.creepers = m.creepers.filter((z) => z.hp > 0 || z.dead > 0);
  checkEnd(m);
}

const W_EDGE = 830;

export function levelDef(level: number) {
  return LEVELS[clampLevel(level) - 1];
}
