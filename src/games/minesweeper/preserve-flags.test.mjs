/**
 * Standalone regression tests (no test runner in repo).
 * Run: node --experimental-strip-types src/games/minesweeper/preserve-flags.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildBoard,
  COLS,
  isSafeFirstClick,
  preserveFlags,
  prepareOpen,
  ROWS,
} from "./board.ts";

const prev = buildBoard();
prev[0][0].flagged = true;
prev[2][4].flagged = true;

const next = buildBoard(3, 3);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    assert.equal(next[r][c].flagged, false);
  }
}

preserveFlags(prev, next);

assert.equal(next[0][0].flagged, true);
assert.equal(next[2][4].flagged, true);

let otherFlagged = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if ((r !== 0 || c !== 0) && (r !== 2 || c !== 4) && next[r][c].flagged) {
      otherFlagged += 1;
    }
  }
}
assert.equal(otherFlagged, 0);

// Pre-flag then open same cell: must not start game or swap board.
const placeholder = buildBoard();
placeholder[1][1].flagged = true;
const blocked = prepareOpen(placeholder, 1, 1, false);
assert.equal(blocked, null);

// Pre-flag A, open B: flags preserved and game marks started.
const withFlag = buildBoard();
withFlag[0][0].flagged = true;
const prep = prepareOpen(withFlag, 3, 3, false);
assert.ok(prep);
assert.equal(prep.markStarted, true);
assert.equal(prep.working[0][0].flagged, true);
assert.equal(prep.working[3][3].flagged, false);
assert.equal(prep.working[3][3].mine, false);
assert.ok(isSafeFirstClick(prep.working, 3, 3));

for (let trial = 0; trial < 200; trial++) {
  const board = buildBoard();
  const openR = 2;
  const openC = 4;
  const attempt = prepareOpen(board, openR, openC, false);
  assert.ok(attempt);
  assert.ok(isSafeFirstClick(attempt.working, openR, openC));
}

console.log("preserve-flags.test.mjs: ok");
