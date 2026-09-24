/**
 * Pinball table geometry + tiny collision helpers. Units are game pixels on a
 * 360×640 portrait table; the loop integrates at a fixed 1/480 s substep, so a
 * ball at max speed moves ~3px per step and can't tunnel through 3px+ walls.
 */

export const W = 360;
export const H = 640;
export const BALL_R = 10;
export const LANE_X = 332;
export const PLUNGER_Y = 600;

const PF_L = 14; // playfield left wall
const PF_R = 318; // lane divider / playfield right wall
const LANE_R = 346;
export const CENTER = (PF_L + PF_R) / 2;

export type Ball = { x: number; y: number; vx: number; vy: number; spin: number };
export type Seg = { ax: number; ay: number; bx: number; by: number; r: number };
export type Sling = Seg & { cx: number; cy: number; nx: number; ny: number };
export type Circle = { x: number; y: number; r: number };
export type FlipperDef = {
  x: number;
  y: number;
  len: number;
  r0: number;
  r1: number;
  rest: number;
  up: number;
};

export const FLIPPERS: [FlipperDef, FlipperDef] = [
  { x: CENTER - 76, y: 546, len: 64, r0: 10, r1: 6, rest: 0.52, up: -0.5 },
  { x: CENTER + 76, y: 546, len: 64, r0: 10, r1: 6, rest: Math.PI - 0.52, up: Math.PI + 0.5 },
];

export function flipperTip(f: FlipperDef, angle: number) {
  return { x: f.x + Math.cos(angle) * f.len, y: f.y + Math.sin(angle) * f.len };
}

export type Table = ReturnType<typeof buildTable>;

export const ARC = { x: (PF_L + LANE_R) / 2, y: 180, r: (LANE_R - PF_L) / 2 };

export function buildTable() {
  const walls: Seg[] = [];
  const seg = (ax: number, ay: number, bx: number, by: number, r = 3) =>
    walls.push({ ax, ay, bx, by, r });

  // Top arch (approximated by short segments).
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI;
    const a1 = ((i + 1) / N) * Math.PI;
    seg(
      ARC.x + Math.cos(a0) * ARC.r,
      ARC.y - Math.sin(a0) * ARC.r,
      ARC.x + Math.cos(a1) * ARC.r,
      ARC.y - Math.sin(a1) * ARC.r,
    );
  }
  seg(LANE_R, ARC.y, LANE_R, H + 40); // lane outer wall
  seg(PF_R, 204, PF_R, H + 40); // lane divider
  seg(PF_L, ARC.y, PF_L, 452); // left wall
  seg(PF_L, 452, FLIPPERS[0].x - 6, FLIPPERS[0].y - 6, 4); // left inlane guide
  seg(PF_R, 452, FLIPPERS[1].x + 6, FLIPPERS[1].y - 6, 4); // right inlane guide
  seg(PF_R, PLUNGER_Y + BALL_R + 2, LANE_R, PLUNGER_Y + BALL_R + 2, 2); // plunger floor

  // Top rollover lane guides.
  const laneXs = [CENTER - 60, CENTER - 20, CENTER + 20, CENTER + 60];
  for (const x of laneXs) seg(x, 74, x, 100, 3);
  const lanes = [0, 1, 2].map((i) => ({ x: (laneXs[i] + laneXs[i + 1]) / 2, y: 90 }));

  // Slingshots (kicking edge A→B, back corner C). Right side mirrors left.
  const mk = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, left: boolean): Sling => {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy);
    const nx = (left ? dy : -dy) / l;
    const ny = (left ? -dx : dx) / l;
    return { ax, ay, bx, by, cx, cy, r: 5, nx, ny };
  };
  const m = (x: number) => 2 * CENTER - x;
  const slings: Sling[] = [
    mk(44, 398, 88, 490, 58, 452, true),
    mk(m(44), 398, m(88), 490, m(58), 452, false),
  ];
  for (const s of slings) {
    seg(s.ax, s.ay, s.cx, s.cy, 4);
    seg(s.cx, s.cy, s.bx, s.by, 4);
  }

  const bumpers: Circle[] = [
    { x: CENTER - 50, y: 196, r: 23 },
    { x: CENTER + 50, y: 196, r: 23 },
    { x: CENTER, y: 266, r: 23 },
  ];
  const posts: Circle[] = [
    { x: 290, y: 330, r: 8 },
    { x: CENTER, y: 142, r: 6 },
  ];
  const targets: Seg[] = [0, 1, 2].map((i) => ({
    ax: PF_L + 7,
    ay: 272 + i * 32,
    bx: PF_L + 7,
    by: 294 + i * 32,
    r: 4,
  }));

  return {
    walls,
    lanes,
    laneXs,
    slings,
    bumpers,
    posts,
    targets,
    center: CENTER,
    laneLeft: PF_R,
    pfL: PF_L,
    pfR: PF_R,
    laneR: LANE_R,
  };
}

export function closestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const den = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / den));
  return { x: ax + abx * t, y: ay + aby * t, t };
}

/**
 * Push the ball out of a contact point and reflect its velocity relative to a
 * (possibly moving) surface. Returns the impact speed, 0 for a resting touch,
 * or -1 when not touching.
 */
export function resolveContact(
  b: Ball,
  px: number,
  py: number,
  minDist: number,
  restitution: number,
  svx = 0,
  svy = 0,
) {
  const dx = b.x - px;
  const dy = b.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return -1;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 0;
  const ny = d > 1e-6 ? dy / d : -1;
  b.x = px + nx * minDist;
  b.y = py + ny * minDist;
  const rvx = b.vx - svx;
  const rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + restitution) * vn * nx;
  b.vy -= (1 + restitution) * vn * ny;
  // A touch of rolling friction along the surface.
  const tx = -ny;
  const ty = nx;
  const vt = (b.vx - svx) * tx + (b.vy - svy) * ty;
  b.vx -= vt * 0.02 * tx;
  b.vy -= vt * 0.02 * ty;
  return -vn;
}
