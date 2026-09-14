"use client";

import { useEffect, useRef, type ReactNode } from "react";

function block(event: Event) {
  event.preventDefault();
}

/**
 * Suppress iOS long-press callout / text selection / drag on a game-controls
 * subtree. Does not listen for gesturestart, so pinch-zoom stays available.
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

    return () => {
      root.removeEventListener("contextmenu", block);
      root.removeEventListener("selectstart", block);
      root.removeEventListener("dragstart", block);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
