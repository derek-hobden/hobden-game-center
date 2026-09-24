/* eslint-disable @next/next/no-img-element -- tiny static card art, no LCP concern */
import type { CSSProperties } from "react";
import type { ProfileId } from "@/lib/profiles";
import { RANKS, backSrc, rankColor, suitName, suitSrc } from "./art";
import type { Card } from "./logic";

/**
 * Card art is sized in `em`: the parent sets `font-size` to the card width in
 * px, so every card scales with the board.
 */

/** Pip positions (percent of the pip area) for ranks 1–7. */
const PIPS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[50, 50]],
  [
    [50, 24],
    [50, 76],
  ],
  [
    [50, 17],
    [50, 50],
    [50, 83],
  ],
  [
    [28, 26],
    [72, 26],
    [28, 74],
    [72, 74],
  ],
  [
    [28, 20],
    [72, 20],
    [50, 50],
    [28, 80],
    [72, 80],
  ],
  [
    [28, 17],
    [72, 17],
    [28, 50],
    [72, 50],
    [28, 83],
    [72, 83],
  ],
  [
    [28, 19],
    [72, 19],
    [50, 36],
    [28, 53],
    [72, 53],
    [28, 83],
    [72, 83],
  ],
];

function pipSize(rank: number) {
  if (rank === 0) return 0.72;
  if (rank === 1) return 0.38;
  if (rank === 2) return 0.28;
  return 0.31;
}

const artStyle: CSSProperties = {
  filter: "drop-shadow(0 0.012em 0.01em rgba(60,30,20,0.35))",
};

export function CardFace({
  card,
  profileId,
}: {
  card: Card;
  profileId: ProfileId;
}) {
  const color = rankColor(profileId, card.suit);
  const src = suitSrc(profileId, card.suit);
  const size = pipSize(card.rank);
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-[0.12em] bg-[linear-gradient(160deg,#ffffff_0%,#fffaf2_55%,#fbefdf_100%)]"
      style={{
        boxShadow: `inset 0 0 0 0.025em ${color}33, inset 0 -0.03em 0 rgba(0,0,0,0.06)`,
      }}
    >
      {/* Corner: big number + small suit, visible even when fanned. */}
      <span
        className="absolute left-[0.07em] top-[0.02em] font-black leading-none tracking-tight"
        style={{
          color,
          fontSize: "0.4em",
          textShadow: "0 0.03em 0 rgba(255,255,255,0.9)",
        }}
      >
        {RANKS[card.rank]}
      </span>
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute right-[0.05em] top-[0.05em] h-[0.32em] w-[0.32em] object-contain"
        style={artStyle}
      />
      {/* Colour band under the corner so teams read at a glance. */}
      <span
        className="absolute left-[0.08em] right-[0.08em] top-[0.43em] h-[0.02em] rounded-full opacity-40"
        style={{ background: color }}
      />
      <div className="absolute bottom-[0.06em] left-[0.06em] right-[0.06em] top-[0.53em]">
        {PIPS[card.rank].map(([x, y], i) => (
          <img
            key={i}
            src={src}
            alt={i === 0 ? `${RANKS[card.rank]} ${suitName(profileId, card.suit)}` : ""}
            draggable={false}
            className="absolute object-contain"
            style={{
              ...artStyle,
              width: `${size}em`,
              height: `${size}em`,
              left: `calc(${x}% - ${size / 2}em)`,
              top: `calc(${y}% - ${size / 2}em)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function CardBack({ profileId }: { profileId: ProfileId }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[0.12em] border-[0.04em] border-white bg-white">
      <img
        src={backSrc(profileId)}
        alt=""
        draggable={false}
        className="h-full w-full rounded-[0.08em] object-cover"
      />
      <div className="absolute inset-0 rounded-[0.08em] bg-[linear-gradient(135deg,rgba(255,255,255,0.35)_0%,transparent_40%,transparent_70%,rgba(0,0,0,0.12)_100%)]" />
    </div>
  );
}
