"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { finishTour } from "@/app/dashboard/actions";

/** `target` matches a `data-tour` attribute. Steps whose target isn't on screen (phone layouts) are left out. */
const STEPS = [
  { target: "composer", title: "Share what you're up to", body: "Post updates, wins or openings. People who follow you see them in their feed." },
  { target: "network", title: "Grow your network", body: "Find people you know, follow them and connect." },
  { target: "jobs", title: "Find your next role", body: "Search jobs and apply with your resume. Hiring? Post a job from here too." },
  { target: "companies", title: "Company pages", body: "Follow companies you like, or create a page for yours." },
  { target: "me", title: "This is you", body: "Your profile and resume. Edit them any time." },
];
const TOUR = "welcome";

type Box = { x: number; y: number; w: number; h: number };
const PAD = 6; // spotlight padding around the target
const GAP = 16; // viewport margin
const box = (r: DOMRect, p = 0): Box => ({ x: r.left - p, y: r.top - p, w: r.width + 2 * p, h: r.height + 2 * p });
const same = (a: Box | null, b: Box) => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The visible element for a step: Nav renders twice (rail and phone tab bar) and CSS hides one. */
const find = (id: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)].find((el) => el.getBoundingClientRect().width > 0);

/** Where the note sits: on the side of the target with the most room, like a hand-written annotation beside it. */
function place(t: Box, note: { w: number; h: number }) {
  const W = innerWidth, H = innerHeight;
  const room = { right: W - t.x - t.w, below: H - t.y - t.h, above: t.y };
  let x: number, y: number;
  if (room.right > note.w + 120) [x, y] = [t.x + t.w + 90, t.y - note.h / 2 - 30];
  else if (room.below >= room.above) [x, y] = [t.x + 24, t.y + t.h + 80];
  else [x, y] = [t.x + t.w / 2 - note.w / 2, t.y - note.h - 80];
  return { x: Math.min(Math.max(x, GAP), W - note.w - GAP), y: Math.min(Math.max(y, GAP), H - note.h - GAP) };
}

/** Midpoint of the edge of `r` that faces point `p`. */
function edge(r: Box, p: { x: number; y: number }) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = p.x - cx, dy = p.y - cy;
  if (Math.abs(dx) / r.w > Math.abs(dy) / r.h) return { x: dx > 0 ? r.x + r.w : r.x, y: cy };
  return { x: cx, y: dy > 0 ? r.y + r.h : r.y };
}

/** A single-bend arc from the note to the target (bulging upward, like the sketch), plus a two-stroke arrowhead. */
function arrow(note: Box, target: Box) {
  const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const a = edge(note, tc);
  const b0 = edge(target, a);
  // stop just short of the spotlight so the head doesn't touch it
  const len = Math.hypot(b0.x - a.x, b0.y - a.y) || 1;
  const b = { x: b0.x - ((b0.x - a.x) / len) * 8, y: b0.y - ((b0.y - a.y) / len) * 8 };
  const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
  let nx = -dy / dist, ny = dx / dist;
  if (ny > 0) [nx, ny] = [-nx, -ny]; // bulge upward
  const bend = Math.min(90, dist * 0.3);
  const c1 = { x: a.x + dx * 0.3 + nx * bend, y: a.y + dy * 0.3 + ny * bend };
  const c2 = { x: a.x + dx * 0.75 + nx * bend * 0.55, y: a.y + dy * 0.75 + ny * bend * 0.55 };
  const curve = (j: number) => `M${a.x} ${a.y}C${c1.x + j} ${c1.y - j} ${c2.x - j} ${c2.y + j} ${b.x} ${b.y}`;
  const ang = Math.atan2(b.y - c2.y, b.x - c2.x);
  const wing = (s: number) => `${b.x - 15 * Math.cos(ang + s * 0.5)} ${b.y - 15 * Math.sin(ang + s * 0.5)}`;
  // the faint second stroke, offset a little, is what makes it read as drawn by hand
  return { main: curve(0), echo: curve(2.5), head: `M${wing(1)}L${b.x} ${b.y}L${wing(-1)}` };
}

/**
 * First-run product tour: dims the dashboard, spotlights one control at a time and points at it with a
 * hand-drawn arrow and a handwritten note. Shows once: `auto` = this member hasn't finished or skipped it yet.
 */
export function Tour({ auto }: { auto: boolean }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  // -1 closed, 0 the welcome card, 1..n the steps
  const [step, setStep] = useState(-1);
  const [steps, setSteps] = useState(STEPS);
  const [target, setTarget] = useState<Box | null>(null);
  const [note, setNote] = useState<Box | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const shown = useRef(false); // once per page life, even before the server knows it's done
  const back = useRef<Element | null>(null);

  function open(at: number) {
    shown.current = true;
    back.current = document.activeElement;
    setSteps(STEPS.filter((s) => find(s.target)));
    setStep(at);
  }

  useEffect(() => {
    if (pathname !== "/dashboard" || shown.current || !auto) return;
    // let the feed paint first, so the tour doesn't land on a half-rendered page
    const t = setTimeout(() => open(0), 900);
    return () => clearTimeout(t);
  }, [pathname, auto]);

  function close(skipped: boolean) {
    setStep(-1);
    setTarget(null);
    finishTour(TOUR, skipped, step).catch(() => {});
    (back.current as HTMLElement | null)?.focus?.();
  }

  const current = step > 0 ? steps[step - 1] : null;
  const last = step === steps.length;
  const go = (d: number) => (step + d > steps.length ? close(false) : setStep(Math.max(1, step + d)));

  // Follow the target (and the note's real size) every frame: scrolling, resizing and late layout all just work.
  // ponytail: a rAF poll while the tour is open (seconds), not observers per element
  useEffect(() => {
    if (step < 0) return;
    const el = current && find(current.target);
    el?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    let raf = 0;
    const tick = () => {
      const t = el ? box(el.getBoundingClientRect(), PAD) : null;
      setTarget((p) => (t && same(p, t) ? p : t));
      const n = noteRef.current && box(noteRef.current.getBoundingClientRect());
      if (n) setNote((p) => (same(p, n) ? p : n));
      raf = requestAnimationFrame(tick);
    };
    tick();
    nextRef.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per step only
  }, [step, current]);

  // Modal: keyboard, and the page behind is inert so Tab stays in the tour
  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
      else if (e.key === "ArrowRight" && step > 0) go(1);
      else if (e.key === "ArrowLeft" && step > 1) go(-1);
    };
    addEventListener("keydown", onKey);
    const others = [...document.body.children].filter((el) => el !== root.current && !(el as HTMLElement).inert) as HTMLElement[];
    others.forEach((el) => (el.inert = true));
    return () => {
      removeEventListener("keydown", onKey);
      others.forEach((el) => (el.inert = false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only read step
  }, [step]);

  if (step < 0 || typeof document === "undefined") return null;

  const pos = current && target && note ? place(target, note) : null;
  const path = pos && target && note ? arrow({ x: pos.x, y: pos.y, w: note.w, h: note.h }, target) : null;
  const hole = target ?? { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };

  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" className="fixed inset-0 z-[60] select-none">
      <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3 }} className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id="tour-hole">
            <rect width="100%" height="100%" fill="white" />
            <motion.rect initial={false} animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }} transition={spring} rx={12} fill="black" />
          </mask>
        </defs>
        {/* clicks anywhere are swallowed: the tour shows things, it doesn't navigate */}
        <rect width="100%" height="100%" fill="rgb(0 0 0 / 0.72)" mask="url(#tour-hole)" />
        <motion.rect initial={false} animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h, opacity: target ? 1 : 0 }} transition={spring} rx={12} fill="none" stroke="white" strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="6 5" />
        {path && (
          <g key={step} fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
            <motion.path d={path.main} strokeWidth={2.4} initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: "easeInOut", delay: 0.15 }} />
            <motion.path d={path.echo} strokeWidth={1} strokeOpacity={0.55} initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: "easeInOut", delay: 0.2 }} />
            <motion.path d={path.head} strokeWidth={2.4} initial={reduce ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.2, delay: 0.72 }} />
          </g>
        )}
      </motion.svg>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          ref={noteRef}
          initial={reduce ? false : { opacity: 0, y: 6, rotate: -1.5 }}
          animate={{ opacity: pos || !target ? 1 : 0, y: 0, rotate: 0 }}
          exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.3 }}
          // no target (it unmounted since the tour opened): the note just sits centered, without an arrow
          style={current && target ? { left: pos?.x ?? -9999, top: pos?.y ?? 0 } : undefined}
          className={current && target ? "absolute w-[min(300px,calc(100vw-32px))] text-white" : "absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 text-center text-white"}
        >
          {current ? (
            <>
              <h2 id="tour-title" className="font-hand text-[28px] leading-tight">{current.title}</h2>
              <p id="tour-body" className="mt-1 text-sm leading-relaxed text-white/80">{current.body}</p>
              <div className="mt-4 flex items-center gap-2 text-sm">
                <span className="mr-auto tabular-nums text-white/60" aria-label={`Step ${step} of ${steps.length}`}>{step} / {steps.length}</span>
                {!last && <button type="button" onClick={() => close(true)} className="h-8 rounded-full px-3 text-white/70 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 outline-none">Skip</button>}
                {step > 1 && <button type="button" onClick={() => go(-1)} className="h-8 rounded-full border border-white/30 px-3 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 outline-none">Back</button>}
                <button ref={nextRef} type="button" onClick={() => go(1)} className="h-8 rounded-full bg-white px-4 font-medium text-black transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black outline-none">
                  {last ? "Got it" : "Next"}
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="tour-title" className="font-hand text-[40px] leading-tight">Welcome aboard!</h2>
              <p id="tour-body" className="mt-2 text-sm leading-relaxed text-white/80">Want a quick look around? It takes about 30 seconds.</p>
              <div className="mt-6 flex justify-center gap-2 text-sm">
                <button type="button" onClick={() => close(true)} className="h-10 rounded-full border border-white/30 px-5 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 outline-none">Maybe later</button>
                <button ref={nextRef} type="button" onClick={() => setStep(1)} className="h-10 rounded-full bg-white px-5 font-medium text-black transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black outline-none">Show me around</button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
}
