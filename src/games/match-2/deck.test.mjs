/**
 * Standalone tests (no test runner in repo).
 * Run: node --experimental-strip-types src/games/match-2/deck.test.mjs
 */
import assert from "node:assert/strict";
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  buildDeck,
  difficultyConfig,
  resolveDifficulty,
  visibleDifficulties,
} from "./deck.ts";
import { match2Art } from "./art.ts";

assert.equal(DEFAULT_DIFFICULTY, "easy");

const easy = difficultyConfig("easy");
const medium = difficultyConfig("medium");
const hard = difficultyConfig("hard");

assert.equal(easy.pairCount, 6);
assert.equal(easy.columns, 3);
assert.equal(medium.pairCount, 8);
assert.equal(medium.columns, 4);
assert.equal(hard.pairCount, 10);
assert.equal(hard.columns, 4);
assert.ok(medium.pairCount > easy.pairCount);
assert.ok(hard.pairCount > medium.pairCount);

const fakePairs = Array.from({ length: 10 }, (_, i) => ({
  id: `kind-${i}`,
  src: `/pair-${i}.png`,
  label: `Kind ${i}`,
}));

function countByPair(cards) {
  const counts = new Map();
  for (const card of cards) {
    counts.set(card.pairId, (counts.get(card.pairId) ?? 0) + 1);
  }
  return counts;
}

for (const difficulty of DIFFICULTIES) {
  const { pairCount } = difficultyConfig(difficulty);
  const cards = buildDeck(fakePairs, difficulty, () => 0);
  assert.equal(cards.length, pairCount * 2);
  const counts = countByPair(cards);
  assert.equal(counts.size, pairCount);
  for (const count of counts.values()) {
    assert.equal(count, 2);
  }
  const expectedIds = fakePairs.slice(0, pairCount).map((pair) => pair.id);
  assert.deepEqual([...counts.keys()].sort(), [...expectedIds].sort());
}

const easyCards = buildDeck(fakePairs, "easy", () => 0);
assert.deepEqual(
  [...new Set(easyCards.map((card) => card.pairId))].sort(),
  fakePairs.slice(0, 6).map((pair) => pair.id).sort(),
);

for (const profileId of ["keira", "luke"]) {
  const art = match2Art(profileId);
  assert.ok(
    art.pairs.length >= hard.pairCount,
    `${profileId} needs ${hard.pairCount} pair kinds`,
  );
  const currentEasyIds = art.pairs.slice(0, 6).map((pair) => pair.id);
  const deckIds = [
    ...new Set(buildDeck(art.pairs, "easy", () => 0).map((card) => card.pairId)),
  ];
  assert.deepEqual(deckIds.sort(), [...currentEasyIds].sort());
}

assert.deepEqual(visibleDifficulties(10), ["easy", "medium", "hard"]);
assert.deepEqual(visibleDifficulties(8), ["easy", "medium"]);
assert.deepEqual(visibleDifficulties(6), ["easy"]);
assert.deepEqual(visibleDifficulties(5), ["easy"]);
assert.deepEqual(visibleDifficulties(0), ["easy"]);

assert.equal(resolveDifficulty("hard", 10), "hard");
assert.equal(resolveDifficulty("hard", 8), "medium");
assert.equal(resolveDifficulty("hard", 6), "easy");
assert.equal(resolveDifficulty("medium", 6), "easy");
assert.equal(resolveDifficulty("easy", 5), "easy");

const shortHard = buildDeck(fakePairs.slice(0, 8), "hard", () => 0);
assert.equal(shortHard.length, 16);
assert.equal(countByPair(shortHard).size, 8);

const tooFewForEasy = buildDeck(fakePairs.slice(0, 5), "hard", () => 0);
assert.equal(tooFewForEasy.length, 10);
assert.equal(countByPair(tooFewForEasy).size, 5);

const empty = buildDeck([], "hard", () => 0);
assert.equal(empty.length, 0);

console.log("deck.test.mjs: ok");
