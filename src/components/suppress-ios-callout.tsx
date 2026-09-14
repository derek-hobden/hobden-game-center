"use client";

import { useEffect } from "react";

function block(event: Event) {
  event.preventDefault();
}

export function SuppressIosCallout() {
  useEffect(() => {
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", block);
    document.addEventListener("gesturestart", block);

    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", block);
      document.removeEventListener("gesturestart", block);
    };
  }, []);

  return null;
}
