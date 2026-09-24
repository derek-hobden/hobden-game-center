// Run: node --experimental-strip-types --test src/games/excitebike/track.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrack, groundAt } from "./track.ts";

test("every level has ramps, blocks, gems and a finish past the last feature", () => {
  for (let l = 1; l <= 10; l++) {
    const t = buildTrack(l);
    assert.ok(t.terrain.some((f) => f.kind === "ramp"), `level ${l} ramp`);
    assert.ok(t.blocks.length >= 1, `level ${l} block`);
    assert.ok(t.gems.length >= 8, `level ${l} gems`);
    const lastX = Math.max(...t.terrain.map((f) => f.x1), ...t.blocks.map((b) => b.x));
    assert.ok(t.length > lastX + 150, `level ${l} finish after features`);
  }
});

test("blocks sit on flat ground and never touch each other", () => {
  for (let l = 1; l <= 10; l++) {
    const t = buildTrack(l);
    for (const b of t.blocks) assert.equal(groundAt(t, b.x), 0);
    const xs = t.blocks.map((b) => b.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] > 150);
  }
});

test("tracks are deterministic per level", () => {
  assert.deepEqual(buildTrack(3), buildTrack(3));
});
