/** Small canvas drawing helpers shared by the Space Invaders renderer. */

export function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}

export function ready(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

/** A white silhouette of a sprite, used for the "just got hit" flash. */
export function whiteSilhouette(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d");
  if (x) {
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
  sx = 1,
  sy = 1,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.1, y + s * 0.2, x - s * 0.55, y + s * 0.05, x - s * 0.5, y - s * 0.2);
  ctx.bezierCurveTo(x - s * 0.45, y - s * 0.5, x - s * 0.05, y - s * 0.5, x, y - s * 0.22);
  ctx.bezierCurveTo(x + s * 0.05, y - s * 0.5, x + s * 0.45, y - s * 0.5, x + s * 0.5, y - s * 0.2);
  ctx.bezierCurveTo(x + s * 0.55, y + s * 0.05, x + s * 0.1, y + s * 0.2, x, y + s * 0.35);
  ctx.closePath();
}

export function drawHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  full: boolean,
) {
  heartPath(ctx, x, y, s);
  if (full) {
    const g = ctx.createLinearGradient(x, y - s / 2, x, y + s / 2);
    g.addColorStop(0, "#ff8fb1");
    g.addColorStop(1, "#e11d48");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.22)";
  }
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = full ? "#fff" : "rgba(255,255,255,0.5)";
  ctx.stroke();
  if (full) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(x - s * 0.22, y - s * 0.18, s * 0.1, s * 0.06, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function starPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot = 0,
  points = 5,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function boltPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y - s * 0.5);
  ctx.lineTo(x - s * 0.3, y + s * 0.08);
  ctx.lineTo(x - s * 0.02, y + s * 0.08);
  ctx.lineTo(x - s * 0.14, y + s * 0.5);
  ctx.lineTo(x + s * 0.3, y - s * 0.1);
  ctx.lineTo(x + s * 0.02, y - s * 0.1);
  ctx.closePath();
}

export function shieldPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.5);
  ctx.quadraticCurveTo(x + s * 0.25, y - s * 0.38, x + s * 0.42, y - s * 0.38);
  ctx.quadraticCurveTo(x + s * 0.44, y + s * 0.2, x, y + s * 0.5);
  ctx.quadraticCurveTo(x - s * 0.44, y + s * 0.2, x - s * 0.42, y - s * 0.38);
  ctx.quadraticCurveTo(x - s * 0.25, y - s * 0.38, x, y - s * 0.5);
  ctx.closePath();
}

/** Big outlined kid-style text (white fill, dark stroke). */
export function bigText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill = "#fff",
  stroke = "rgba(40,10,60,0.85)",
  maxWidth?: number,
) {
  const font = (px: number) => `900 ${px}px ui-rounded, "Nunito", system-ui, sans-serif`;
  ctx.font = font(size);
  if (maxWidth) {
    const w = ctx.measureText(text).width;
    if (w > maxWidth) {
      size = (size * maxWidth) / w;
      ctx.font = font(size);
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.18);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
