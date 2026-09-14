import type { ProfileId } from "@/lib/profiles";
import { PAIR_COUNT, SLOTS, kindsFor, type TileKind } from "./art";

export type BoardTile = {
  slotId: number;
  kind: TileKind;
  matched: boolean;
};

/** Coverer slot id paired with the layer-0 slot it sits on. */
const COVER_SLOT_PAIRS: ReadonlyArray<readonly [number, number]> = SLOTS.flatMap(
  (slot) => slot.covers.map((coveredId) => [slot.id, coveredId] as const),
);

const MAX_DEAL_ATTEMPTS = 250;

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

/** True when a coverer and the slot it covers would both hold `kind`. */
export function boardHasCoverKindCollision(
  filled: Map<number, TileKind>,
): boolean {
  for (const [covererId, coveredId] of COVER_SLOT_PAIRS) {
    const covererKind = filled.get(covererId);
    const coveredKind = filled.get(coveredId);
    if (
      covererKind !== undefined &&
      coveredKind !== undefined &&
      covererKind === coveredKind
    ) {
      return true;
    }
  }
  return false;
}

function slotsShareCoverRelationship(a: number, b: number): boolean {
  return COVER_SLOT_PAIRS.some(
    ([covererId, coveredId]) =>
      (a === covererId && b === coveredId) ||
      (a === coveredId && b === covererId),
  );
}

function canAssignKindToSlots(
  filled: Map<number, TileKind>,
  kind: TileKind,
  a: number,
  b: number,
): boolean {
  if (slotsShareCoverRelationship(a, b)) return false;
  const trial = new Map(filled);
  trial.set(a, kind);
  trial.set(b, kind);
  return !boardHasCoverKindCollision(trial);
}

function pickSlotPairForKind(
  open: number[],
  filled: Map<number, TileKind>,
  kind: TileKind,
): [number, number] | null {
  const candidates = shuffle(open);
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (canAssignKindToSlots(filled, kind, candidates[i], candidates[j])) {
        return [candidates[i], candidates[j]];
      }
    }
  }
  return null;
}

function placeRemainingPairs(
  filled: Map<number, TileKind>,
  remainingKinds: TileKind[],
): boolean {
  const emptySlotIds = SLOTS.filter((slot) => !filled.has(slot.id)).map(
    (slot) => slot.id,
  );
  if (remainingKinds.length * 2 !== emptySlotIds.length) {
    return false;
  }
  return assignRemainingKinds(emptySlotIds, remainingKinds, filled);
}

function assignRemainingKinds(
  emptySlotIds: number[],
  kinds: TileKind[],
  filled: Map<number, TileKind>,
): boolean {
  if (kinds.length === 0) {
    return !boardHasCoverKindCollision(filled);
  }

  const kind = kinds[0];
  const rest = kinds.slice(1);
  const slots = shuffle(emptySlotIds);

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (!canAssignKindToSlots(filled, kind, a, b)) continue;

      filled.set(a, kind);
      filled.set(b, kind);
      const nextEmpty = emptySlotIds.filter((id) => id !== a && id !== b);
      if (assignRemainingKinds(nextEmpty, rest, filled)) {
        return true;
      }
      filled.delete(a);
      filled.delete(b);
    }
  }
  return false;
}

function tryDealBoard(profileId: ProfileId): BoardTile[] | null {
  const pairs = buildShuffledPairKinds(profileId);
  const filled = new Map<number, TileKind>();

  let pairIndex = 0;
  for (; pairIndex < pairs.length; pairIndex++) {
    const kind = pairs[pairIndex];
    const open = openSlots(filled);
    if (open.length < 2) break;
    const picks = pickSlotPairForKind(open, filled, kind);
    if (!picks) break;
    filled.set(picks[0], kind);
    filled.set(picks[1], kind);
  }

  const remainingKinds = pairs.slice(pairIndex);
  if (remainingKinds.length > 0) {
    if (!placeRemainingPairs(filled, remainingKinds)) {
      return null;
    }
  }

  if (filled.size !== SLOTS.length || boardHasCoverKindCollision(filled)) {
    return null;
  }

  return SLOTS.map((slot) => ({
    slotId: slot.id,
    kind: filled.get(slot.id)!,
    matched: false,
  }));
}

export function dealBoard(profileId: ProfileId): BoardTile[] {
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const board = tryDealBoard(profileId);
    if (board) return board;
  }
  throw new Error("Failed to deal a valid Mahjong board");
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

/** Exported for deal validation scripts (not used in the React UI). */
export function boardTilesHaveCoverKindCollision(tiles: BoardTile[]): boolean {
  const filled = new Map(tiles.map((t) => [t.slotId, t.kind]));
  return boardHasCoverKindCollision(filled);
}
