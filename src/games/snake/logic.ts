/** Pure snake rules + geometry (no React, no canvas) so they're easy to test. */

export type Point = { x: number; y: number };
export type Dir = "up" | "down" | "left" | "right";

export const FOODS_PER_LEVEL = 5;
const STEP_START_MS = 330;
const STEP_MIN_MS = 165;
const STEP_DROP_MS = 7;

export const DIR_VEC: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function opposite(a: Dir, b: Dir) {
  const va = DIR_VEC[a];
  const vb = DIR_VEC[b];
  return va.x === -vb.x && va.y === -vb.y;
}

/** Gentle speed ramp: a little quicker with every treat, capped. */
export function stepMs(eaten: number) {
  return Math.max(STEP_MIN_MS, STEP_START_MS - eaten * STEP_DROP_MS);
}

export function levelFor(eaten: number) {
  return 1 + Math.floor(eaten / FOODS_PER_LEVEL);
}

/** Board shape that fills a w×h stage with chunky, kid-sized cells. */
export function chooseGrid(w: number, h: number) {
  const short = Math.min(w, h);
  const cell = Math.max(30, Math.min(64, short / 10));
  const clamp = (v: number) => Math.max(8, Math.min(22, v));
  return {
    cols: clamp(Math.floor(w / cell)),
    rows: clamp(Math.floor(h / cell)),
  };
}

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function wrapPoint(p: Point, cols: number, rows: number): Point {
  return { x: (p.x + cols) % cols, y: (p.y + rows) % rows };
}

export type MoveInput = {
  cells: Point[];
  dir: Dir;
  queue: Dir[];
  food: Point;
  cols: number;
  rows: number;
};

export type MoveResult =
  | { kind: "blocked" }
  | {
      kind: "ok";
      dir: Dir;
      queue: Dir[];
      cells: Point[];
      prevTail: Point;
      ate: boolean;
    };

/** One grid step. Edges wrap. Moving into the cell the tail is leaving is fine. */
export function tryMove(g: MoveInput): MoveResult {
  const queue = [...g.queue];
  let dir = g.dir;
  while (queue.length) {
    const q = queue.shift()!;
    if (q !== dir && !opposite(q, dir)) {
      dir = q;
      break;
    }
  }
  const v = DIR_VEC[dir];
  const head = g.cells[0];
  const next = wrapPoint({ x: head.x + v.x, y: head.y + v.y }, g.cols, g.rows);
  const ate = same(next, g.food);
  const body = ate ? g.cells : g.cells.slice(0, -1);
  if (body.some((c) => same(c, next))) return { kind: "blocked" };
  const cells = [next, ...g.cells];
  const prevTail = ate ? { ...g.cells[g.cells.length - 1] } : cells.pop()!;
  return { kind: "ok", dir, queue, cells, prevTail, ate };
}

/** Random free cell, preferring ones not right under the snake's nose. */
export function pickFood(
  cells: Point[],
  cols: number,
  rows: number,
  rand = Math.random,
): Point | null {
  const taken = new Set(cells.map((c) => c.y * cols + c.x));
  const head = cells[0];
  const free: Point[] = [];
  const nice: Point[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (taken.has(y * cols + x)) continue;
      free.push({ x, y });
      const dx = Math.min(Math.abs(x - head.x), cols - Math.abs(x - head.x));
      const dy = Math.min(Math.abs(y - head.y), rows - Math.abs(y - head.y));
      const edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
      if (dx + dy >= 3 && !edge) nice.push({ x, y });
    }
  }
  const pool = nice.length ? nice : free;
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length)];
}

/**
 * Cells (+ the cell the tail just left) laid out so each point is adjacent to
 * the previous one — i.e. undoing edge wrap, so the body is one continuous line.
 */
export function unwrapChain(
  cells: Point[],
  prevTail: Point,
  cols: number,
  rows: number,
): Point[] {
  const src = [...cells, prevTail];
  const out: Point[] = [{ ...src[0] }];
  for (let i = 1; i < src.length; i++) {
    const prev = out[i - 1];
    let x = src[i].x;
    let y = src[i].y;
    while (x - prev.x > 1) x -= cols;
    while (prev.x - x > 1) x += cols;
    while (y - prev.y > 1) y -= rows;
    while (prev.y - y > 1) y += rows;
    out.push({ x, y });
  }
  return out;
}

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Densely sampled, corner-rounded centre line of the snake at progress `t`
 * (0 = previous step, 1 = current step), head first. Units are cells.
 */
export function smoothPath(U: Point[], t: number): Point[] {
  const n = U.length - 1;
  const raw: Point[] = [lerp(U[1], U[0], t)];
  for (let i = 1; i < n; i++) raw.push(U[i]);
  raw.push(lerp(U[n], U[n - 1], t));
  const pts = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 1e-4);
  if (pts.length < 2) return pts;

  const out: Point[] = [pts[0]];
  const line = (a: Point, b: Point) => {
    const k = Math.max(1, Math.ceil(dist(a, b) / 0.25));
    for (let j = 1; j <= k; j++) out.push(lerp(a, b, j / k));
  };
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const ab = dist(a, b);
    const bc = dist(b, c);
    const entry = lerp(b, a, Math.min(0.5, ab / 2) / ab);
    const exit = lerp(b, c, Math.min(0.5, bc / 2) / bc);
    line(cur, entry);
    for (let j = 1; j <= 6; j++) {
      const s = j / 6;
      const p = lerp(lerp(entry, b, s), lerp(b, exit, s), s);
      out.push(p);
    }
    cur = exit;
  }
  line(cur, pts[pts.length - 1]);
  return out;
}
