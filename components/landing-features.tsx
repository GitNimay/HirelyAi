"use client";

import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, icons } from "./ui";

/* Looping mini versions of the real screens (Live interview, McqTest, the AI evaluation), for the landing features.
   Each loops only while on screen; with reduced motion it holds its finished state. */

const ease = [0.23, 1, 0.32, 1] as const;

function useStep(count: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView || reduce) return;
    // Hidden tabs pause animation frames but not timers; skip ticks there so exits can't pile up
    const t = setInterval(() => !document.hidden && setStep((s) => (s + 1) % count), ms);
    return () => clearInterval(t);
  }, [inView, reduce, count, ms]);
  return [ref, reduce ? count - 1 : step] as const;
}

// One pastel per tile. Light mode paints it flat. Dark mode sits on the neutral surface and keeps the hue only as
// a soft glow behind the mini screen, since a full-strength or a darkened pastel both look muddy on dark.
const TONES = {
  lime: "#eef5a3",
  lavender: "#d6c9f8",
  pink: "#f7c3da",
  mint: "#c2edd3",
  peach: "#fdd5b5",
  sky: "#c4def8",
};

/** The tile: square pastel frame, a mono label, the mini screen centred. */
function Frame({ label, tone, frameRef, children }: { label: string; tone: keyof typeof TONES; frameRef: React.Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div
      ref={frameRef}
      aria-hidden
      className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border"
      style={{
        "--tone": TONES[tone],
        backgroundColor: "light-dark(var(--tone), var(--surface))",
        backgroundImage: "radial-gradient(ellipse 70% 60% at 50% 55%, light-dark(transparent, color-mix(in oklab, var(--tone) 12%, transparent)), transparent)",
        borderColor: "var(--border)",
      } as React.CSSProperties}
    >
      <span className="absolute left-4 top-3 font-mono text-xs uppercase tracking-wider text-foreground/60">{label}</span>
      <div className="mt-6 w-[80%] border border-border bg-surface p-4 shadow-pop">{children}</div>
    </div>
  );
}

const VOICE = [
  { orb: "listening", label: "Listening", you: "I led the rewrite of our payments flow…" },
  { orb: "solving", label: "Thinking…", you: "" },
  { orb: "composing", label: "Speaking", agent: "What was the hardest trade-off?" },
] as const;

export function VoiceVisual() {
  const [ref, step] = useStep(VOICE.length, 2600);
  const s = VOICE[step];
  const secs = 268 - step * 3;
  return (
    <Frame label="Voice" tone="lime" frameRef={ref}>
      <div className="flex items-center justify-between border-b border-border pb-2.5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-danger" />Live</span>
        <span className="tabular-nums">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} left</span>
      </div>
      <div className="flex justify-center py-3">
        <ThinkingOrb state={s.orb} size={64} />
      </div>
      <div className="h-11 text-center">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease }}>
            <p className="text-xs font-medium">{s.label}</p>
            {"agent" in s ? (
              <p className="mt-1 text-xs">
                {s.agent.split(" ").map((w, i) => (
                  <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + i * 0.08 }}>{w} </motion.span>
                ))}
              </p>
            ) : s.you ? (
              <p className="mt-1 truncate text-xs text-muted">You: {s.you}</p>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </Frame>
  );
}

const QUIZ = [
  { q: "Which hook runs after render?", options: ["useMemo", "useEffect", "useRef"], pick: 1 },
  { q: "Binary search runs in…", options: ["O(log n)", "O(n)", "O(n²)"], pick: 0 },
  { q: "Which status means Not Found?", options: ["401", "403", "404"], pick: 2 },
];

export function McqVisual() {
  // Two beats per question: shown, then answered
  const [ref, step] = useStep(QUIZ.length * 2, 1500);
  const at = Math.floor(step / 2);
  const picked = step % 2 === 1;
  const q = QUIZ[at];
  const answered = at + (picked ? 1 : 0);
  return (
    <Frame label="Screening" tone="lavender" frameRef={ref}>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Question <span className="font-medium text-foreground tabular-nums">{at + 1}</span> of 10</span>
        <span className="flex items-center gap-1 tabular-nums"><Icon d={icons.clock} size={12} />8:{String(42 - step * 2).padStart(2, "0")}</span>
      </div>
      <div className="mt-2.5 h-0.5 bg-border">
        <motion.div className="h-full bg-foreground" animate={{ width: `${answered * 10}%` }} transition={{ duration: 0.5, ease }} />
      </div>
      <div className="relative mt-3.5 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={at} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.35, ease }}>
            <p className="text-xs font-medium">{q.q}</p>
            <div className="mt-2.5 space-y-1.5">
              {q.options.map((o, i) => {
                const on = picked && i === q.pick;
                return (
                  <div key={o} className={`flex items-center gap-2 border px-2 py-1.5 text-xs transition-colors duration-300 ${on ? "border-foreground bg-background" : "border-border"}`}>
                    <span className={`flex size-4 items-center justify-center border text-[10px] transition-colors duration-300 ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted"}`}>
                      {"ABC"[i]}
                    </span>
                    {o}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Frame>
  );
}

function CountUp({ to }: { to: number }) {
  const v = useSpring(0, { stiffness: 60, damping: 18 });
  const n = useTransform(v, (x) => Math.round(x));
  // Up springs; the loop reset snaps back to 0
  useEffect(() => (to ? v.set(to) : v.jump(0)), [v, to]);
  return <motion.span>{n}</motion.span>;
}

const NOTES = [
  { tone: "bg-success", text: "Clear system design" },
  { tone: "bg-success", text: "Strong communication" },
  { tone: "bg-danger", text: "Light on testing" },
];

export function ScoreVisual() {
  // 0 blank, 1 score + verdict, 2-4 one note each, 5 hold
  const [ref, step] = useStep(6, 1100);
  return (
    <Frame label="Grading" tone="pink" frameRef={ref}>
      <div className="flex items-center gap-2.5 border-b border-border pb-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-surface-hover text-[10px] font-medium text-muted">PS</span>
        <span className="text-xs font-medium">Priya S.</span>
        <span className="ml-auto text-xs text-muted">Frontend Engineer</span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="text-3xl font-medium tabular-nums">
          <CountUp to={step >= 1 ? 86 : 0} />
          <span className="text-xs font-normal text-muted">/100</span>
        </p>
        <AnimatePresence>
          {step >= 1 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.3, ease, delay: 0.5 }}
              className="mb-1 border border-border px-2 py-0.5 text-xs font-medium text-success"
            >
              Strong fit
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <ul className="mt-3 h-[66px] space-y-1.5">
        <AnimatePresence>
          {NOTES.slice(0, Math.max(0, step - 1)).map((n) => (
            <motion.li
              key={n.text}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.35, ease }}
              className="flex items-center gap-2 text-xs text-muted"
            >
              <span className={`size-1.5 rounded-full ${n.tone}`} />
              {n.text}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Frame>
  );
}

/** Grey bar until `on`, then the text fades in over it. */
function Fill({ on, w, children, className = "" }: { on: boolean; w: string; children: ReactNode; className?: string }) {
  return (
    <span className={`relative block h-4 ${className}`}>
      <motion.span className="absolute left-0 top-1 h-2 rounded-sm bg-surface-hover" style={{ width: w }} animate={{ opacity: on ? 0 : 1 }} transition={{ duration: 0.25, delay: on ? 0 : 0.1 }} />
      <motion.span className="absolute inset-0 truncate" animate={{ opacity: on ? 1 : 0, y: on ? 0 : 3 }} transition={{ duration: on ? 0.35 : 0.1, ease }}>{children}</motion.span>
    </span>
  );
}

const JOBS = [
  { co: "Stripe", role: "Senior Frontend Engineer" },
  { co: "Notion", role: "Frontend Engineer" },
];

export function ResumeVisual() {
  // 0 uploading, 1 parsed, 2 name, 3-4 one job each, 5 hold
  const [ref, step] = useStep(6, 1000);
  return (
    <Frame label="Profile" tone="mint" frameRef={ref}>
      <div className="flex items-center gap-2 border-b border-border pb-2.5 text-xs">
        <Icon d={icons.file} size={14} className="text-muted" />
        <span className="font-medium">priya-resume.pdf</span>
        <span className="ml-auto flex w-14 justify-end">
          {step === 0 ? (
            <span className="h-0.5 w-full bg-border">
              <motion.span className="block h-full bg-foreground" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 0.9, ease: "linear" }} />
            </span>
          ) : (
            <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-success">
              <Icon d={icons.check} size={14} />
            </motion.span>
          )}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[10px] font-medium text-muted">PS</span>
        <span className="min-w-0 flex-1 text-xs">
          <Fill on={step >= 2} w="45%" className="font-medium">Priya Sharma</Fill>
          <Fill on={step >= 2} w="70%" className="text-muted">Frontend Engineer · Pune</Fill>
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">Experience</p>
      <div className="mt-1.5 space-y-2">
        {JOBS.map((j, i) => (
          <div key={j.co} className="flex items-center gap-2.5 text-xs">
            <span className="flex size-6 shrink-0 items-center justify-center border border-border text-[10px] font-medium text-muted">{j.co[0]}</span>
            <span className="min-w-0 flex-1">
              <Fill on={step >= 3 + i} w="60%">{j.role} · {j.co}</Fill>
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

const COLS = ["Submitted", "Viewed", "Shortlisted"];
// Column per step for each candidate
const PEOPLE = [
  { id: "PS", name: "Priya", score: 86, at: [0, 1, 2, 2] },
  { id: "AK", name: "Arjun", score: 72, at: [0, 0, 1, 1] },
  { id: "MR", name: "Meera", score: 64, at: [0, 0, 0, 0] },
];

export function PipelineVisual() {
  const [ref, step] = useStep(4, 1400);
  return (
    <Frame label="Pipeline" tone="peach" frameRef={ref}>
      <LayoutGroup>
        <div className="grid grid-cols-3 gap-2">
          {COLS.map((c, ci) => {
            const here = PEOPLE.filter((p) => p.at[step] === ci);
            return (
              <div key={c} className="min-w-0">
                <p className="flex justify-between text-[10px] text-muted">
                  <span className="truncate">{c}</span>
                  <span className="tabular-nums">{here.length}</span>
                </p>
                <div className="mt-1.5 min-h-[104px] space-y-1.5 bg-background p-1">
                  {here.map((p) => (
                    <motion.div key={p.id} layoutId={p.id} transition={{ duration: 0.5, ease }} className="flex items-center gap-1.5 border border-border bg-surface px-1.5 py-1.5">
                      <span className="min-w-0 truncate text-[10px] font-medium">{p.name}</span>
                      <span className="ml-auto text-[10px] text-muted tabular-nums">{p.score}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </LayoutGroup>
    </Frame>
  );
}

const CODE = "482913";

export function CompanyVisual() {
  // 0 blank, 1 email, 2 code, 3 verified, 4 hold
  const [ref, step] = useStep(5, 1200);
  return (
    <Frame label="Trust" tone="sky" frameRef={ref}>
      <div className="flex items-center gap-2.5 border-b border-border pb-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center border border-border bg-background text-xs font-medium">A</span>
        <span className="min-w-0 text-xs">
          <span className="flex items-center gap-1 font-medium">
            Acme Inc
            <AnimatePresence>
              {step >= 3 && (
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="text-link"
                >
                  <Icon d={icons.verified} size={14} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="block text-muted">acme.com</span>
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">Work email</p>
      <div className="mt-1.5 flex h-7 items-center border border-border px-2 text-xs">
        {step >= 1 ? <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>priya@acme.com</motion.span> : <span className="h-3.5 w-px animate-pulse bg-foreground" />}
      </div>
      <div className="mt-2 grid grid-cols-6 gap-1">
        {[...CODE].map((d, i) => (
          <span key={i} className={`flex h-7 items-center justify-center border text-xs tabular-nums transition-colors duration-300 ${step >= 3 ? "border-success" : "border-border"}`}>
            {step >= 2 && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>{d}</motion.span>}
          </span>
        ))}
      </div>
    </Frame>
  );
}
