/**
 * Wave formations. Each row is a string: "0"/"1"/"2" = invader kind, "." = gap.
 * Columns are centred, so rows may differ in length only if padded with ".".
 */
export type Formation = { name: string; rows: string[]; boss?: boolean };

export const FORMATIONS: Formation[] = [
  { name: "Here they come!", rows: ["00000", "11111"] },
  { name: "Three rows!", rows: ["22222", "11111", "00000"] },
  { name: "Heart shape!", rows: [".1.1.", "11111", "02220", ".000.", "..0.."] },
  { name: "Diamond!", rows: ["..2..", ".212.", "21012", ".212.", "..2.."] },
  { name: "Checkers!", rows: ["22222", "1.1.1", "00000", ".1.1."] },
  { name: "Boss time!", rows: [".....", ".....", "1.2.1"], boss: true },
];

export const TOTAL_WAVES = FORMATIONS.length;
