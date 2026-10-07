"use client";
/* eslint-disable @next/next/no-img-element -- 3 KB static webp at a fixed size; next/image adds nothing here */

// Adapted from rare-ui "Emoji Reaction" (swamimalode07/rare-ui): the spring-in pill, edge-aware placement,
// keyboard menu and floating-emoji burst. Changed for post reactions: the trigger is the Like button
// (click = like / remove, hover or long-press = pick one), one burst per pick instead of hold-to-repeat, and
// self-hosted Fluent emoji instead of hotlinked Apple ones (Apple's are licensed, and CSP allows only 'self').
import { ThumbsUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { REACTIONS, reactionOf, reactionSrc, topReactions, type Reaction, type ReactionCounts } from "@/lib/reactions";
import { cn } from "@/lib/utils";

const HOVER_OPEN = 450; // ms resting on Like before the picker opens (LinkedIn ~500)
const HOVER_CLOSE = 250;
const LONG_PRESS = 400;
const GAP = 12;
const EDGE = 8;
const EMOJI = 36;
const BURST = 4;
const EASE = [0.4, 0.3, 0.5, 1] as const;

type Placement = { side: "top" | "bottom"; shift: number };
type Particle = { id: number; kind: Reaction; x: number; y: number; drift: number; tilt: number; travel: number; scale: number; delay: number; duration: number };

/** The picker opens on your current reaction (roving focus starts there). */
const startIndex = (k: Reaction | null) => Math.max(0, REACTIONS.findIndex((r) => r.kind === k));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Left-anchored on the trigger, shifted to stay on screen; flips below when there's no room above. */
function placement(trigger: DOMRect, width: number, height: number): Placement {
  const over = trigger.left + width - (window.innerWidth - EDGE);
  return {
    side: trigger.top - height - GAP < EDGE ? "bottom" : "top",
    shift: over > 0 ? -Math.min(over, trigger.left - EDGE) : 0,
  };
}

// memo: a parent render would otherwise restart the flight
const BurstEmoji = memo(function BurstEmoji({ p, onDone }: { p: Particle; onDone: (id: number) => void }) {
  return (
    <motion.img
      src={reactionSrc(p.kind)}
      alt=""
      width={22}
      height={22}
      draggable={false}
      className="pointer-events-none absolute z-40 max-w-none will-change-transform"
      style={{ left: p.x - 11, top: p.y - 11 }}
      initial={{ x: 0, y: 0, scale: 0.6, opacity: 0, rotate: 0, filter: "blur(0px)" }}
      animate={{
        x: p.drift,
        y: -p.travel,
        scale: [0.6, p.scale * 1.15, p.scale, p.scale * 0.75],
        rotate: [0, p.tilt, -p.tilt * 0.65, p.tilt * 0.35],
        opacity: [0, 1, 1, 0],
        filter: ["blur(0px)", "blur(0px)", "blur(4px)"],
      }}
      transition={{
        duration: p.duration,
        delay: p.delay,
        ease: EASE,
        rotate: { inherit: true, times: [0, 0.3, 0.65, 1], ease: "easeInOut" },
        scale: { inherit: true, times: [0, 0.1, 0.22, 1], ease: "easeOut" },
        opacity: { inherit: true, times: [0, 0.05, 0.7, 1], ease: "linear" },
        filter: { inherit: true, times: [0, 0.4, 1] },
      }}
      onAnimationComplete={() => onDone(p.id)}
    />
  );
});

type Props = {
  reaction: Reaction | null;
  /** `null` removes the viewer's reaction. */
  onReact: (kind: Reaction | null) => void;
  className?: string;
};

/** The post's Like button. Click likes (or removes your reaction); hover, long-press or ↑ opens the six reactions. */
export function ReactionButton({ reaction, onReact, className }: Props) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Placement>({ side: "top", shift: 0 });
  const [active, setActive] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const viaKeyboard = useRef(false);
  const seed = useRef(0);

  const clearTimer = () => window.clearTimeout(timer.current);
  const later = (ms: number, fn: () => void) => {
    clearTimer();
    timer.current = window.setTimeout(fn, ms);
  };
  useEffect(() => clearTimer, []);

  const openPicker = (keyboard: boolean) => {
    viaKeyboard.current = keyboard;
    setActive(startIndex(reaction));
    setOpen(true);
  };

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  // Measure in a ref callback, not an effect, so placing the pill can't cascade an extra render
  const placeBar = useCallback((node: HTMLDivElement | null) => {
    const t = triggerRef.current;
    if (node && t) setPlace(placement(t.getBoundingClientRect(), node.offsetWidth, node.offsetHeight));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (viaKeyboard.current) items.current[startIndex(reaction)]?.focus();
    const outside = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && close();
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open, close]); // eslint-disable-line react-hooks/exhaustive-deps -- `reaction` only seeds focus on open

  /** Emoji float up out of `from` (a rect in the viewport). */
  function burst(kind: Reaction, from: DOMRect) {
    const root = rootRef.current?.getBoundingClientRect();
    if (reduced || !root) return;
    const x = from.left + from.width / 2 - root.left;
    const y = from.top + from.height / 2 - root.top;
    seed.current += BURST;
    const fresh = Array.from({ length: BURST }, (_, i): Particle => {
      const lane = rand(-1, 1);
      return {
        id: seed.current + i, kind, x, y,
        drift: lane * 28, tilt: rand(2, 6) * Math.sign(lane || 1), travel: rand(70, 100),
        scale: rand(0.8, 1.05), delay: i * 0.09, duration: rand(0.9, 1.15),
      };
    });
    setParticles((prev) => [...prev, ...fresh].slice(-16));
  }
  const settle = useCallback((id: number) => setParticles((prev) => prev.filter((p) => p.id !== id)), []);

  function pick(kind: Reaction, from: DOMRect) {
    close();
    if (kind !== reaction) burst(kind, from);
    onReact(kind);
  }

  // Touch: hold to open, then lift over an emoji (or tap one) to pick
  function onPointerDown(e: React.PointerEvent) {
    longPressed.current = false;
    if (e.pointerType !== "touch" || open) return;
    later(LONG_PRESS, () => {
      longPressed.current = true;
      openPicker(false);
      navigator.vibrate?.(8);
      const up = (ev: PointerEvent) => {
        document.removeEventListener("pointerup", up);
        const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-reaction]");
        if (hit) pick(hit.dataset.reaction as Reaction, hit.getBoundingClientRect());
      };
      document.addEventListener("pointerup", up);
    });
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const n = REACTIONS.length;
    const next =
      e.key === "ArrowRight" ? (active + 1) % n
      : e.key === "ArrowLeft" ? (active - 1 + n) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : e.key === "Tab" ? -1
      : null;
    if (next === null) return;
    if (next === -1) return close(); // Tab moves on; the picker shouldn't linger behind focus
    e.preventDefault();
    setActive(next);
    items.current[next]?.focus();
  }

  const current = reaction ? reactionOf(reaction) : null;
  const top = place.side === "top";

  return (
    <div
      ref={rootRef}
      className="relative flex"
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        if (open) clearTimer();
        else later(HOVER_OPEN, () => openPicker(false));
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "touch") return;
        if (open) later(HOVER_CLOSE, close);
        else clearTimer();
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            className={cn("absolute left-0 z-30", top ? "bottom-full mb-3" : "top-full mt-3")}
            style={{ marginLeft: place.shift, originX: 0, originY: top ? 1 : 0 }}
            initial={{ opacity: 0, y: top ? 8 : -8, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: top ? 4 : -4, scale: 0.92, transition: { duration: 0.12 } }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 30 }}
          >
            <div
              ref={placeBar}
              role="menu"
              aria-label="Reactions"
              aria-orientation="horizontal"
              onKeyDown={onMenuKeyDown}
              className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-[var(--shadow-pop)]"
            >
              {REACTIONS.map((r, i) => (
                <motion.button
                  key={r.kind}
                  ref={(node) => {
                    items.current[i] = node;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={r.kind === reaction}
                  aria-label={r.label}
                  tabIndex={i === active ? 0 : -1}
                  data-reaction={r.kind}
                  onFocus={() => setActive(i)}
                  onClick={(e) => pick(r.kind, e.currentTarget.getBoundingClientRect())}
                  className="group relative rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  initial={reduced ? false : { scale: 0.4, opacity: 0, y: 6 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 800, damping: 25, delay: reduced ? 0 : 0.03 + i * 0.03 }}
                  whileHover={reduced ? undefined : { scale: 1.3, y: -6 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <img src={reactionSrc(r.kind)} alt="" width={EMOJI} height={EMOJI} draggable={false} className="max-w-none select-none" />
                  <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    {r.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {particles.map((p) => <BurstEmoji key={p.id} p={p} onDone={settle} />)}

      <button
        ref={triggerRef}
        type="button"
        aria-pressed={!!reaction}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={current ? `${current.label}, remove reaction` : "Like"}
        aria-keyshortcuts="ArrowUp"
        onPointerDown={onPointerDown}
        onPointerUp={() => !longPressed.current && clearTimer()}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => longPressed.current && e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" || open) return;
          e.preventDefault();
          openPicker(true);
        }}
        onClick={(e) => {
          if (longPressed.current) return void (longPressed.current = false);
          close();
          const next = reaction ? null : "like";
          if (next) burst(next, e.currentTarget.querySelector("[data-icon]")!.getBoundingClientRect());
          onReact(next);
        }}
        className={cn(className, "w-full select-none [-webkit-touch-callout:none]", current?.color)}
      >
        <span data-icon className="relative flex size-5 items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {current ? (
              <motion.img
                key={current.kind}
                src={reactionSrc(current.kind)}
                alt=""
                width={18}
                height={18}
                draggable={false}
                initial={reduced ? false : { scale: 0.3, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: "spring", stiffness: 600, damping: 18 }}
              />
            ) : (
              <motion.span key="none" initial={reduced ? false : { scale: 0.6 }} animate={{ scale: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                <ThumbsUp size={16} strokeWidth={2} aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className="hidden font-medium sm:inline">{current?.label ?? "Like"}</span>
      </button>
    </div>
  );
}

/** "👍❤️👏 12" above the action bar: the top three kinds and the total. */
export function ReactionSummary({ counts, total }: { counts: ReactionCounts; total: number }) {
  if (total <= 0) return null;
  const kinds = topReactions(counts);
  const breakdown = REACTIONS.filter((r) => counts[r.kind]).map((r) => `${counts[r.kind]} ${r.label}`).join(", ");
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted" title={breakdown}>
      <span className="flex" aria-hidden>
        {kinds.map((k, i) => (
          <img key={k} src={reactionSrc(k)} alt="" width={18} height={18} className={cn("rounded-full bg-background ring-2 ring-background", i > 0 && "-ml-1.5")} style={{ zIndex: 3 - i }} />
        ))}
      </span>
      <span className="tabular-nums">
        <span className="sr-only">{total === 1 ? "1 reaction" : `${total} reactions`}: {breakdown}</span>
        <span aria-hidden>{total}</span>
      </span>
    </p>
  );
}
