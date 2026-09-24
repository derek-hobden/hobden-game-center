/**
 * Standalone tests (no test runner in repo).
 * Run: node --experimental-strip-types --test src/games/solitaire/logic.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMove,
  canAutoFinish,
  canStack,
  dealWinnable,
  drawCard,
  isWon,
  nextAutoHome,
  solve,
} from "./logic.ts";

function play(board, path, mode) {
  let b = board;
  for (const m of path) {
    if (m.kind === "talonHome" || m.kind === "talonTab") {
      // Cycle the stock until the card is on top of the waste.
      let guard = 0;
      while (b.waste[b.waste.length - 1]?.id !== m.cardId) {
        b = drawCard(b);
        assert.ok(b && guard++ < 200, "card not reachable in talon");
      }
      b = applyMove(b, { kind: "waste" }, m.kind === "talonHome" ? { kind: "found" } : { kind: "tab", col: m.to }, mode);
    } else if (m.kind === "tabHome") {
      b = applyMove(b, { kind: "tab", col: m.from, index: b.tableau[m.from].length - 1 }, { kind: "found" }, mode);
    } else {
      b = applyMove(b, { kind: "tab", col: m.from, index: m.index }, { kind: "tab", col: m.to }, mode);
    }
    assert.ok(b, `illegal move ${JSON.stringify(m)}`);
  }
  return b;
}

test("stacking rules", () => {
  const five = { id: 0, rank: 4, suit: 0 };
  assert.ok(canStack({ id: 1, rank: 3, suit: 2 }, five, "easy"));
  assert.ok(!canStack({ id: 1, rank: 3, suit: 2 }, five, "tricky"));
  assert.ok(canStack({ id: 1, rank: 3, suit: 1 }, five, "tricky"));
  assert.ok(!canStack({ id: 1, rank: 2, suit: 1 }, five, "easy"));
  assert.ok(canStack(five, undefined, "tricky"));
});

for (const mode of ["easy", "tricky"]) {
  test(`${mode} deals are winnable and the solver's line really wins`, () => {
    for (let i = 0; i < 80; i++) {
      const board = dealWinnable(mode);
      assert.equal(
        board.stock.length + board.tableau.flat().length,
        28,
      );
      const path = solve(board, mode);
      assert.ok(path, "no solution");
      assert.ok(isWon(play(board, path, mode)));
    }
  });
}

test("auto-finish homes every card once the stock is gone and columns descend", () => {
  const c = (id, rank, suit) => ({ id, rank, suit });
  let b = {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], []],
  };
  let id = 0;
  // Every suit in its own column, 7 down to 1.
  for (let s = 0; s < 4; s++) for (let r = 6; r >= 0; r--) b.tableau[s].push(c(id++, r, s));
  assert.ok(canAutoFinish(b));
  let guard = 0;
  while (!isWon(b) && guard++ < 40) {
    const col = nextAutoHome(b);
    assert.notEqual(col, null);
    b = applyMove(b, { kind: "tab", col, index: b.tableau[col].length - 1 }, { kind: "found" }, "easy");
  }
  assert.ok(isWon(b));
});
