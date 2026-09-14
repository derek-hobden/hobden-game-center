/**
 * Standalone regression test (no test runner in repo).
 * Run: node --experimental-strip-types src/games/minesweeper/preserve-flags.test.mjs
 */
import assert from "node:assert/strict";
import { buildBoard, COLS, preserveFlags, ROWS } from "./board.ts";

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

console.log("preserve-flags.test.mjs: ok");
