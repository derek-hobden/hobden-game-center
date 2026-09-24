import type { ProfileId } from "@/lib/profiles";

const KEY = "hobden-game-center-best";

type BestMap = Record<string, number>;

function read(): BestMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as BestMap) : {};
  } catch {
    return {};
  }
}

export function getBest(profileId: ProfileId, gameId: string): number {
  if (typeof window === "undefined") return 0;
  const v = read()[`${profileId}:${gameId}`];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function getAllBest(profileId: ProfileId): Record<string, number> {
  if (typeof window === "undefined") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(read())) {
    const [p, g] = k.split(":");
    if (p === profileId && g && typeof v === "number") out[g] = v;
  }
  return out;
}

/** Stores `score` if it beats the saved best. Returns true when it did. */
export function recordBest(
  profileId: ProfileId,
  gameId: string,
  score: number,
): boolean {
  if (typeof window === "undefined" || !(score > 0)) return false;
  const all = read();
  const k = `${profileId}:${gameId}`;
  if ((all[k] ?? 0) >= score) return false;
  all[k] = score;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked — best just won't persist.
  }
  return true;
}
