"use client";

// Fluid hover: one highlight that springs to the item nearest the cursor, so it never blinks between rows.
// Trimmed port of https://www.fluidfunctionalism.com/r/use-fluid-hover.json (and /r/springs.json), on `motion` instead of framer-motion.
// Items are found by selector and measured on each (rAF-coalesced) move, so callers register nothing and rects are never stale.

import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "./utils";

/** Motion tiers: enter is a critically damped spring, exit one tier quicker. Never hand-write a duration. */
export const spring = {
  fast: { type: "spring" as const, duration: 0.08, bounce: 0, exit: { duration: 0.06 } },
  moderate: { type: "spring" as const, duration: 0.16, bounce: 0, exit: { duration: 0.12 } },
  slow: { type: "spring" as const, duration: 0.24, bounce: 0.12, exit: { duration: 0.16 } },
};

export type Rect = { top: number; left: number; width: number; height: number };

/** The item the pointer is inside wins; otherwise the one whose center is nearest along the axis. */
export function pickNearest(point: number, spans: readonly { start: number; size: number }[]) {
  let nearest: number | null = null;
  let best = Infinity;
  for (let i = 0; i < spans.length; i++) {
    const { start, size } = spans[i];
    if (point >= start && point <= start + size) return i;
    const d = Math.abs(point - (start + size / 2));
    if (d < best) [best, nearest] = [d, i];
  }
  return nearest;
}

/**
 * Spread `handlers` on a `relative` container whose items match `selector`, and render <FluidHoverHighlight hover={…} /> inside it
 * before the items (give items `relative` so they paint above). `gapClick` routes a click between rows to the lit one.
 */
export function useFluidHover<T extends HTMLElement>(
  container: RefObject<T | null>,
  { selector, axis = "y", gapClick = true }: { selector: string; axis?: "x" | "y"; gapClick?: boolean },
) {
  const [active, setActive] = useState<{ el: HTMLElement; rect: Rect } | null>(null);
  const [session, setSession] = useState(0); // bumps per pointer entry so the highlight fades in fresh instead of sliding from the last spot
  const frame = useRef<number | null>(null);
  useEffect(() => () => void (frame.current !== null && cancelAnimationFrame(frame.current)), []);

  // offset* (layout space, relative to the container) so a scale-in on the panel doesn't skew the highlight
  const show = useCallback((el: HTMLElement | null | undefined) => {
    const box = container.current;
    if (!el || !box) return setActive(null);
    let top = el.offsetTop;
    let left = el.offsetLeft;
    for (let p = el.offsetParent as HTMLElement | null; p && p !== box && box.contains(p); p = p.offsetParent as HTMLElement | null) {
      top += p.offsetTop;
      left += p.offsetLeft;
    }
    const rect = { top, left, width: el.offsetWidth, height: el.offsetHeight };
    setActive((a) => (a?.el === el && a.rect.top === top && a.rect.left === left && a.rect.width === rect.width && a.rect.height === rect.height ? a : { el, rect }));
  }, [container]);

  const clear = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setActive(null);
  }, []);

  const handlers = {
    onMouseEnter: () => setSession((n) => n + 1),
    onMouseLeave: clear,
    onMouseMove: (e: React.MouseEvent) => {
      const point = axis === "x" ? e.clientX : e.clientY;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const items = Array.from(container.current?.querySelectorAll<HTMLElement>(selector) ?? []);
        const spans = items.map((el) => {
          const r = el.getBoundingClientRect();
          return axis === "x" ? { start: r.left, size: r.width } : { start: r.top, size: r.height };
        });
        const i = pickNearest(point, spans);
        show(i === null ? null : items[i]);
      });
    },
    onClick: (e: React.MouseEvent) => {
      const t = e.target as Element;
      if (!gapClick || !active || !t.isConnected || t.closest(`${selector}, input, textarea, select, button, a, [role='button']`)) return;
      active.el.click();
    },
  };

  return { rect: active?.rect ?? null, session, handlers, show, clear };
}

/** The springed fill. Reduced motion keeps the fade and drops the travel. */
export function FluidHoverHighlight({ hover, className }: { hover: ReturnType<typeof useFluidHover>; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const r = hover.rect;
  const target = r && { x: r.left, y: r.top, width: r.width, height: r.height };
  const transition: Transition = { ...(reduce ? { duration: 0 } : spring.fast), opacity: { duration: 0.08 } };
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          key={hover.session}
          aria-hidden
          className={cn("pointer-events-none absolute left-0 top-0 bg-surface-hover", className)}
          initial={{ opacity: 0, ...target }}
          animate={{ opacity: 1, ...target }}
          exit={{ opacity: 0, transition: spring.fast.exit }}
          transition={transition}
        />
      )}
    </AnimatePresence>
  );
}
