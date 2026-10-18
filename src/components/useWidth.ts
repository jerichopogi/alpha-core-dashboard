"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Width of an element in CSS pixels, kept current as it resizes, so SVG text stays its real size. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  // Layout effect: measure before the first paint, so phones never flash the wide fallback.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(Math.max(240, Math.round(element.getBoundingClientRect().width)));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
