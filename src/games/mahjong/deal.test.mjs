/**
 * Standalone tests (no test runner in repo).
 * Run: node --experimental-strip-types --test src/games/mahjong/deal.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  LEVELS,
  coverLists,
  dealSolvable,
  dealWithPlan,
  freePairs,
  pairKinds,
  solveBoard,
} from "./deal.ts";

const KINDS = ["a", "b", "c", "d", "e", "f", "g", "h"];

test("every level has an even number of slots and no duplicate positions", () => {
  for (const lvl of LEVELS) {
    assert.equal(lvl.slots.length % 2, 0, lvl.name);
    const keys = new Set(lvl.slots.map((s) => `${s.x},${s.y},${s.z}`));
    assert.equal(keys.size, lvl.slots.length, lvl.name);
    // Every upper tile rests on something.
    const { below } = coverLists(lvl.slots);
    for (const s of lvl.slots) if (s.z > 0) assert.ok(below[s.id].length > 0);
  }
});

function playPlan(slots, tiles, plan) {
  const cur = new Map(tiles);
  for (const [a, b] of plan) {
    const legal = freePairs(slots, cur).some(
      ([x, y]) => (x === a && y === b) || (x === b && y === a),
    );
    if (!legal) return false;
    cur.delete(a);
    cur.delete(b);
  }
  return cur.size === 0;
}

test("fresh deals are always solvable (the built-in plan clears the board)", () => {
  for (const lvl of LEVELS) {
    for (let i = 0; i < 400; i++) {
      const kinds = pairKinds(KINDS, lvl.slots.length / 2, Math.random);
      const { tiles, plan } = dealWithPlan(lvl.slots, kinds);
      assert.equal(tiles.size, lvl.slots.length);
      assert.ok(playPlan(lvl.slots, tiles, plan), `${lvl.name} deal ${i} unsolvable`);
    }
  }
});

test("solver finds a clear for small boards", () => {
  for (let i = 0; i < 50; i++) {
    const lvl = LEVELS[i % 2];
    const board = dealSolvable(lvl.slots, pairKinds(KINDS, lvl.slots.length / 2, Math.random));
    const path = solveBoard(lvl.slots, board, 200000);
    assert.ok(path);
    assert.ok(playPlan(lvl.slots, board, path));
  }
});

test("shuffle of a partial board is solvable and keeps cleared slots empty", () => {
  for (const lvl of LEVELS) {
    for (let i = 0; i < 60; i++) {
      const board = dealSolvable(lvl.slots, pairKinds(KINDS, lvl.slots.length / 2, Math.random));
      // Clear a few legal pairs.
      for (let k = 0; k < 4; k++) {
        const pairs = freePairs(lvl.slots, board);
        if (!pairs.length) break;
        const [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
        board.delete(a);
        board.delete(b);
      }
      const ids = [...board.keys()];
      const counts = new Map();
      for (const id of ids) counts.set(board.get(id), (counts.get(board.get(id)) ?? 0) + 1);
      const kinds = [];
      for (const [k, n] of counts) {
        assert.equal(n % 2, 0);
        for (let j = 0; j < n / 2; j++) kinds.push(k);
      }
      const { tiles: again, plan } = dealWithPlan(lvl.slots, kinds, ids);
      assert.deepEqual([...again.keys()].sort((x, y) => x - y), ids.sort((x, y) => x - y));
      assert.ok(playPlan(lvl.slots, again, plan));
    }
  }
});
