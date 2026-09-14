"use client";

import { useEffect, useRef, type ReactNode } from "react";

function block(event: Event) {
  event.preventDefault();
}

/**
 * Suppress iOS long-press callout / text selection / drag, and pinch-zoom,
 * on a game-controls subtree. Do not mount this on menu/picker screens.
 */
export function SuppressIosCallout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    root.addEventListener("contextmenu", block);
    root.addEventListener("selectstart", block);
    root.addEventListener("dragstart", block);
    // Capture so two-finger pinches on the canvas never zoom the page.
    root.addEventListener("gesturestart", block, true);

    return () => {
      root.removeEventListener("contextmenu", block);
      root.removeEventListener("selectstart", block);
      root.removeEventListener("dragstart", block);
      root.removeEventListener("gesturestart", block, true);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
