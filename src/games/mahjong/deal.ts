/**
 * Board layouts, solvable deals, and a small solver for the kids' tile-match
 * game. Pure TypeScript with no path-alias imports so it can be tested with
 * `node --experimental-strip-types src/games/mahjong/deal.test.mjs`.
 *
 * Coordinates are in half-tile units: a tile covers a 2×2 footprint, so a
 * tile at x=1 sits half over the tiles at x=0 and x=2 below it.
 * A tile is FREE when no remaining tile on a higher layer overlaps it
 * (no side-blocking rule — kid friendly).
 */

export type Slot = { id: number; x: number; y: number; z: number };

export type Level = {
  name: string;
  slots: Slot[];
  /** Footprint size in tiles (for fitting the board). */
  cols: number;
  rows: number;
};

function grid(
  xs: number[],
  ys: number[],
  z: number,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const y of ys) for (const x of xs) out.push({ x, y, z });
  return out;
}

function level(name: string, parts: { x: number; y: number; z: number }[][]): Level {
  const flat = parts.flat();
  const slots = flat.map((s, id) => ({ id, ...s }));
  const maxX = Math.max(...slots.map((s) => s.x));
  const maxY = Math.max(...slots.map((s) => s.y));
  return { name, slots, cols: maxX / 2 + 1, rows: maxY / 2 + 1 };
}

export const LEVELS: Level[] = [
  // 3×5 base with one tile on top: 16 tiles, big and friendly.
  level("Little tower", [
    grid([0, 2, 4], [0, 2, 4, 6, 8], 0),
    grid([2], [4], 1),
  ]),
  // 4×6 base with a 2×2 roof: 28 tiles.
  level("Big tower", [
    grid([0, 2, 4, 6], [0, 2, 4, 6, 8, 10], 0),
    grid([2, 4], [4, 6], 1),
  ]),
  // 4×6 base, 2×4 middle, 2 half-offset on top: 34 tiles.
  level("Castle", [
    grid([0, 2, 4, 6], [0, 2, 4, 6, 8, 10], 0),
    grid([2, 4], [2, 4, 6, 8], 1),
    grid([3], [4, 6], 2),
  ]),
];

export function overlaps(a: Slot, b: Slot) {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

/** coveredBy[i] = ids of slots directly/indirectly above slot i that overlap it. */
export function coverLists(slots: Slot[]) {
  const coveredBy: number[][] = slots.map(() => []);
  const below: number[][] = slots.map(() => []);
  for (const a of slots) {
    for (const b of slots) {
      if (a.z > b.z && overlaps(a, b)) {
        coveredBy[b.id].push(a.id);
        below[a.id].push(b.id);
      }
    }
  }
  return { coveredBy, below };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Kinds for `pairs` pairs, spreading evenly over the available kinds. */
export function pairKinds<K>(kinds: readonly K[], pairs: number, rand: () => number): K[] {
  const order = shuffle([...kinds], rand);
  const out: K[] = [];
  for (let i = 0; i < pairs; i++) out.push(order[i % order.length]);
  return shuffle(out, rand);
}

/**
 * Solvable deal by reverse construction: pairs are placed bottom-up into
 * slots whose supports are already filled, so removing pairs in the reverse
 * order is always legal. `ids` restricts the deal to a subset of slots (used
 * for the shuffle, which keeps already-cleared slots empty).
 */
export function dealSolvable<K>(
  slots: Slot[],
  kinds: K[],
  ids: number[] = slots.map((s) => s.id),
  rand: () => number = Math.random,
): Map<number, K> {
  return dealWithPlan(slots, kinds, ids, rand).tiles;
}

/** Like `dealSolvable`, plus a known winning removal order (`plan`). */
export function dealWithPlan<K>(
  slots: Slot[],
  kinds: K[],
  ids: number[] = slots.map((s) => s.id),
  rand: () => number = Math.random,
): { tiles: Map<number, K>; plan: [number, number][] } {
  if (kinds.length * 2 !== ids.length) {
    throw new Error(`Need ${ids.length / 2} pairs, got ${kinds.length}`);
  }
  const { below } = coverLists(slots);
  const inPlay = new Set(ids);
  for (let attempt = 0; attempt < 400; attempt++) {
    const placed = new Set<number>();
    const out = new Map<number, K>();
    const plan: [number, number][] = [];
    const order = shuffle(kinds, rand);
    let ok = true;
    for (const kind of order) {
      const avail = ids.filter(
        (id) =>
          !placed.has(id) && below[id].every((b) => !inPlay.has(b) || placed.has(b)),
      );
      if (avail.length < 2) {
        ok = false;
        break;
      }
      // Favour low layers so tall stacks don't strand a lone slot.
      const minZ = Math.min(...avail.map((id) => slots[id].z));
      const low = avail.filter((id) => slots[id].z === minZ);
      const pool = low.length >= 2 && rand() < 0.55 ? low : avail;
      const [a, b] = shuffle(pool, rand);
      placed.add(a);
      placed.add(b);
      out.set(a, kind);
      out.set(b, kind);
      plan.unshift([a, b]);
    }
    if (ok) return { tiles: out, plan };
  }
  throw new Error("Could not build a solvable deal");
}

export type Tile<K> = { slotId: number; kind: K };

/** Free = present and no remaining tile above overlaps it. */
export function freeIds<K>(
  slots: Slot[],
  tiles: Map<number, K>,
  coveredBy = coverLists(slots).coveredBy,
): number[] {
  const out: number[] = [];
  for (const id of tiles.keys()) {
    if (!coveredBy[id].some((c) => tiles.has(c))) out.push(id);
  }
  return out;
}

export function freePairs<K>(
  slots: Slot[],
  tiles: Map<number, K>,
  coveredBy = coverLists(slots).coveredBy,
): [number, number][] {
  const free = freeIds(slots, tiles, coveredBy);
  const pairs: [number, number][] = [];
  for (let i = 0; i < free.length; i++)
    for (let j = i + 1; j < free.length; j++)
      if (tiles.get(free[i]) === tiles.get(free[j])) pairs.push([free[i], free[j]]);
  return pairs;
}

/**
 * Depth-first search for a full clear. Returns the list of pairs to remove,
 * or null if none was found within `budget` states.
 */
export function solveBoard<K>(
  slots: Slot[],
  tiles: Map<number, K>,
  budget = 20000,
): [number, number][] | null {
  const { coveredBy, below } = coverLists(slots);
  // Try pairs that uncover the most first (high, wide tiles).
  const weight = (id: number) => slots[id].z * 10 + below[id].length;
  const seen = new Set<string>();
  const path: [number, number][] = [];
  let nodes = 0;
  const rec = (cur: Map<number, K>): boolean => {
    if (cur.size === 0) return true;
    if (++nodes > budget) return false;
    const key = [...cur.keys()].sort((a, b) => a - b).join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    const pairs = freePairs(slots, cur, coveredBy).sort(
      (p, q) => weight(q[0]) + weight(q[1]) - weight(p[0]) - weight(p[1]),
    );
    // A pair is "safe" when every remaining tile of that kind is free: which
    // twins get paired can't matter, so there is no need to branch.
    const free = new Set(freeIds(slots, cur, coveredBy));
    const safe = pairs.find(([a]) => {
      const kind = cur.get(a);
      for (const [id, k] of cur) if (k === kind && !free.has(id)) return false;
      return true;
    });
    for (const [a, b] of safe ? [safe] : pairs) {
      const next = new Map(cur);
      next.delete(a);
      next.delete(b);
      path.push([a, b]);
      if (rec(next)) return true;
      path.pop();
    }
    return false;
  };
  return rec(new Map(tiles)) ? path : null;
}
