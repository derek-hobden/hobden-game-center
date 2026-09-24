"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Shared building blocks for games. The shell gives every game a stage that
 * fills the screen below the top bar (a flex column with a definite height).
 * Games should:
 *   - render a root `<div className="game-root">` (fills the stage),
 *   - put their board/canvas inside `<FitBox>` / `useFitCanvas`, which scales it
 *     to the largest size that fits while keeping aspect ratio,
 *   - keep controls in a compact row below (or overlaid on) the board.
 */

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

type Size = { width: number; height: number };

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) =>
        Math.abs(prev.width - r.width) < 0.5 &&
        Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { width: r.width, height: r.height },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}

function fit(box: Size, aspect: number, maxW?: number) {
  if (box.width <= 0 || box.height <= 0) return { width: 0, height: 0 };
  let w = Math.min(box.width, maxW ?? Infinity);
  let h = w / aspect;
  if (h > box.height) {
    h = box.height;
    w = h * aspect;
  }
  return { width: Math.floor(w), height: Math.floor(h) };
}

/**
 * Scale a fixed-logical-size canvas (W×H game units) to fill the available
 * space, rendered at device pixel ratio so art stays sharp.
 *
 * In your draw loop call `const k = canvas.width / W; ctx.setTransform(k,0,0,k,0,0)`
 * (or `prepareCanvas(ctx, W)`) before drawing, then keep drawing in game units.
 * Map pointer events with `canvasPoint(e, canvas, W, H)`.
 */
export function useFitCanvas(
  W: number,
  H: number,
  opts?: {
    maxWidth?: number;
    canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  },
) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const ownCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = opts?.canvasRef ?? ownCanvasRef;
  const css = fit(box, W / H, opts?.maxWidth);

  useIsoLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c || css.width === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round(css.width * dpr);
    const bh = Math.round(css.height * dpr);
    if (c.width !== bw || c.height !== bh) {
      c.width = bw;
      c.height = bh;
    }
  }, [css.width, css.height, canvasRef]);

  const style: CSSProperties = {
    width: css.width || undefined,
    height: css.height || undefined,
    visibility: css.width ? "visible" : "hidden",
  };

  return { boxRef, canvasRef, style, cssWidth: css.width, cssHeight: css.height };
}

/** Apply the logical→backing-store transform for a W-unit-wide canvas. */
export function prepareCanvas(ctx: CanvasRenderingContext2D, W: number) {
  const k = ctx.canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return k;
}

/** Pointer position in game units. */
export function canvasPoint(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
  W: number,
  H: number,
) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * W,
    y: ((e.clientY - r.top) / r.height) * H,
  };
}

/**
 * Flex child that takes all leftover height and centers a child scaled to fit
 * a given aspect ratio. For DOM boards (grids of tiles/cards).
 */
export function FitBox({
  aspect,
  maxWidth,
  className,
  innerClassName,
  children,
}: {
  aspect: number;
  maxWidth?: number;
  className?: string;
  innerClassName?: string;
  children: ReactNode | ((size: Size) => ReactNode);
}) {
  const [ref, box] = useBoxSize<HTMLDivElement>();
  const size = fit(box, aspect, maxWidth);
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex min-h-0 w-full flex-1 items-center justify-center",
        className,
      )}
    >
      {size.width > 0 ? (
        <div
          className={cn("relative", innerClassName)}
          style={{ width: size.width, height: size.height }}
        >
          {typeof children === "function" ? children(size) : children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Canvas stage: takes the leftover height, fits a W×H (game units) canvas in
 * it at device pixel ratio. Pass your own `canvasRef`; draw with
 * `prepareCanvas(ctx, W)` at the start of every frame. `children` render on
 * top of the canvas (overlays, floating HUD) inside a box the canvas's size.
 */
export function CanvasStage({
  width: W,
  height: H,
  canvasRef,
  maxWidth,
  className,
  canvasClassName,
  children,
  ...handlers
}: {
  width: number;
  height: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  maxWidth?: number;
  className?: string;
  canvasClassName?: string;
  children?: ReactNode;
} & Pick<
  React.CanvasHTMLAttributes<HTMLCanvasElement>,
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onPointerLeave"
>) {
  const { boxRef, style } = useFitCanvas(W, H, { maxWidth, canvasRef });
  return (
    <div
      ref={boxRef}
      className={cn(
        "relative flex min-h-0 w-full flex-1 items-center justify-center",
        className,
      )}
    >
      <div className="relative" style={style}>
        <canvas
          ref={canvasRef}
          className={cn(
            "block h-full w-full touch-none rounded-[1.4rem] shadow-[0_10px_30px_rgba(0,0,0,0.18)] ring-4 ring-white/70",
            canvasClassName,
          )}
          {...handlers}
        />
        {children}
      </div>
    </div>
  );
}

/**
 * Centered card over the board for "Tap to start", "Game over", "You win!".
 * Place inside a `relative` parent the size of the board.
 */
export function GameOverlay({
  show,
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
  secondary,
  tone = "neutral",
  className,
}: {
  show: boolean;
  emoji?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondary?: ReactNode;
  tone?: "neutral" | "win" | "lose";
  className?: string;
}) {
  if (!show) return null;
  return (
    <div
      className={cn(
        "overlay-in absolute inset-0 z-20 flex items-center justify-center rounded-[1.4rem] p-4",
        tone === "win"
          ? "bg-gradient-to-b from-amber-200/40 to-[var(--ink)]/40"
          : "bg-[var(--ink)]/35",
        "backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="card-pop flex w-full max-w-[18rem] flex-col items-center gap-2 rounded-[1.75rem] border-4 border-white bg-[var(--surface)] px-5 py-5 text-center shadow-2xl">
        {emoji ? (
          <div className="text-5xl leading-none drop-shadow-sm">{emoji}</div>
        ) : null}
        <p className="text-2xl font-black leading-tight text-[var(--ink)]">
          {title}
        </p>
        {subtitle ? (
          <p className="text-base font-semibold leading-snug text-[var(--ink)]/70">
            {subtitle}
          </p>
        ) : null}
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="kid-btn kid-btn-primary mt-2 min-h-14 w-full text-xl"
          >
            {actionLabel}
          </button>
        ) : null}
        {secondary}
      </div>
    </div>
  );
}

/** Small rounded stat chip for game HUD rows ("❤️ 3", "Level 2"). */
export function StatPill({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-black tabular-nums",
        accent
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "bg-white/80 text-[var(--ink)] shadow-sm ring-1 ring-[var(--ink)]/10",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A big, chunky, game-controller style button. `hold` fires onPress on
 * pointer-down and onRelease on up/cancel/leave — use it for movement pads.
 */
export function PadButton({
  children,
  onPress,
  onRelease,
  primary,
  className,
  label,
  disabled,
}: {
  children: ReactNode;
  onPress: () => void;
  onRelease?: () => void;
  primary?: boolean;
  className?: string;
  label?: string;
  disabled?: boolean;
}) {
  const down = useRef(false);
  const release = useCallback(() => {
    if (!down.current) return;
    down.current = false;
    onRelease?.();
  }, [onRelease]);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        "kid-btn min-h-14 flex-1 text-lg",
        primary ? "kid-btn-primary" : "kid-btn-secondary",
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        down.current = true;
        onPress();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
