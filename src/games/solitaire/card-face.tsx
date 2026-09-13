import type { ProfileId } from "@/lib/profiles";
import { cn } from "@/lib/utils";
import { RANKS, backSrc, rankTone, suitName, suitSrc } from "./art";

export type SolitaireCard = {
  id: number;
  rank: number;
  suit: number;
};

export function CardFace({
  card,
  profileId,
  selected,
  compact,
}: {
  card: SolitaireCard;
  profileId: ProfileId;
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[1.05rem] border-[3px] border-white bg-[#fffaf3] shadow-[0_6px_0_rgba(40,20,50,0.18)]",
        compact ? "h-[4.6rem] w-[3.35rem]" : "h-[5.7rem] w-[4.05rem]",
        selected && "ring-4 ring-amber-300 ring-offset-2 ring-offset-transparent",
      )}
    >
      <div className="flex items-start justify-between px-1.5 pt-1">
        <span
          className={cn(
            "font-black leading-none",
            compact ? "text-base" : "text-lg",
            rankTone(profileId, card.suit),
          )}
        >
          {RANKS[card.rank]}
        </span>
        <img
          src={suitSrc(profileId, card.suit)}
          alt=""
          className={cn(
            "rounded-md object-cover",
            compact ? "h-4 w-4" : "h-5 w-5",
          )}
          draggable={false}
        />
      </div>
      <img
        src={suitSrc(profileId, card.suit)}
        alt={suitName(profileId, card.suit)}
        className="mx-auto mt-0.5 w-[72%] flex-1 rounded-lg object-cover"
        draggable={false}
      />
    </div>
  );
}

export function CardBack({
  profileId,
  count,
}: {
  profileId: ProfileId;
  count?: number;
}) {
  return (
    <div className="relative h-[5.7rem] w-[4.05rem] overflow-hidden rounded-[1.05rem] border-[3px] border-white shadow-[0_6px_0_rgba(40,20,50,0.22)]">
      <img
        src={backSrc(profileId)}
        alt="Draw pile"
        className="h-full w-full object-cover"
        draggable={false}
      />
      {typeof count === "number" ? (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 text-[11px] font-black text-white">
          {count}
        </span>
      ) : null}
    </div>
  );
}

export function EmptySlot({
  profileId,
  suit,
  label,
  glow,
}: {
  profileId: ProfileId;
  suit?: number;
  label: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-[5.7rem] w-[4.05rem] flex-col items-center justify-center rounded-[1.05rem] border-[3px] border-dashed border-white/80 bg-white/25",
        glow && "ring-4 ring-lime-300",
      )}
    >
      {typeof suit === "number" ? (
        <img
          src={suitSrc(profileId, suit)}
          alt=""
          className="h-8 w-8 rounded-md object-cover opacity-80"
          draggable={false}
        />
      ) : (
        <span className="px-1 text-center text-[10px] font-bold text-white/90 drop-shadow">
          {label}
        </span>
      )}
    </div>
  );
}
