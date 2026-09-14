import type { ProfileId } from "@/lib/profiles";
import { PAIR_COUNT, SLOTS, kindsFor, type TileKind } from "./art";

export type BoardTile = {
  slotId: number;
  kind: TileKind;
  matched: boolean;
};

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** One entry per pair to place (two tiles of the same kind each). */
export function buildShuffledPairKinds(profileId: ProfileId): TileKind[] {
  const kinds = kindsFor(profileId);
  const pairs: TileKind[] = [];
  kinds.forEach((kind, index) => {
    const extra = index < 2 ? 2 : 1;
    for (let n = 0; n < extra; n++) pairs.push(kind);
  });
  if (pairs.length !== PAIR_COUNT) {
    throw new Error(`Expected ${PAIR_COUNT} pair-kinds, got ${pairs.length}`);
  }
  return shuffle(pairs);
}

function openSlots(filled: Map<number, TileKind>): number[] {
  return SLOTS.filter((slot) => {
    if (filled.has(slot.id)) return false;
    const blocked = SLOTS.some(
      (other) => filled.has(other.id) && other.covers.includes(slot.id),
    );
    return !blocked;
  }).map((slot) => slot.id);
}

function placeRemainingPairs(
  filled: Map<number, TileKind>,
  remainingKinds: TileKind[],
): void {
  const emptySlots = shuffle(SLOTS.filter((slot) => !filled.has(slot.id)));
  if (remainingKinds.length * 2 !== emptySlots.length) {
    throw new Error(
      `Deal invariant: ${remainingKinds.length} remaining kinds need ${remainingKinds.length * 2} slots, have ${emptySlots.length}`,
    );
  }
  for (let i = 0; i < remainingKinds.length; i++) {
    const kind = remainingKinds[i];
    filled.set(emptySlots[i * 2].id, kind);
    filled.set(emptySlots[i * 2 + 1].id, kind);
  }
}

export function dealBoard(profileId: ProfileId): BoardTile[] {
  const pairs = buildShuffledPairKinds(profileId);
  const filled = new Map<number, TileKind>();

  let pairIndex = 0;
  for (; pairIndex < pairs.length; pairIndex++) {
    const kind = pairs[pairIndex];
    const open = openSlots(filled);
    if (open.length < 2) break;
    const picks = shuffle(open).slice(0, 2);
    filled.set(picks[0], kind);
    filled.set(picks[1], kind);
  }

  const remainingKinds = pairs.slice(pairIndex);
  if (remainingKinds.length > 0) {
    placeRemainingPairs(filled, remainingKinds);
  }

  if (filled.size !== SLOTS.length) {
    throw new Error(`Deal incomplete: filled ${filled.size}/${SLOTS.length} slots`);
  }

  return SLOTS.map((slot) => ({
    slotId: slot.id,
    kind: filled.get(slot.id)!,
    matched: false,
  }));
}

/** Every kind appears an even number of times (necessary for a pair-matching win). */
export function boardKindsArePairable(tiles: BoardTile[]): boolean {
  const counts = new Map<TileKind, number>();
  for (const tile of tiles) {
    counts.set(tile.kind, (counts.get(tile.kind) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count % 2 !== 0) return false;
  }
  return true;
}
