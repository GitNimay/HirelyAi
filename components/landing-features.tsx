"use client";

import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, icons } from "./ui";

/* Looping mini versions of the real screens (Live interview, McqTest, the AI evaluation), for the landing features.
   Each tile is a painted backdrop with one composition of frosted, grainy glass panels centred on it (.glass in
   globals.css). Panels rise in when the tile mounts and the content loops only while on screen; with reduced motion
   everything holds its finished state. */

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

// One painted backdrop per tile, the same in both themes (the images carry their own colour).
const TONES = {
  lime: "/landing/tile-voice.webp",
  lavender: "/landing/tile-screening.webp",
  pink: "/landing/tile-grading.webp",
  mint: "/landing/tile-profile.webp",
  peach: "/landing/tile-pipeline.webp",
  sky: "/landing/tile-trust.webp",
};

/** The tile: a slowly drifting painted backdrop with the composition centred on it. */
function Frame({ tone, frameRef, children }: { tone: keyof typeof TONES; frameRef: React.Ref<HTMLDivElement>; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div ref={frameRef} aria-hidden className="relative flex aspect-square items-center justify-center overflow-hidden border border-border bg-surface p-[6%] sm:aspect-[4/3]">
      <motion.div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${TONES[tone]})` }}
        animate={reduce ? undefined : { scale: [1, 1.08] }}
        transition={{ duration: 16, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      {children}
    </div>
  );
}

/** A frosted glass panel that rises in when its tile mounts. */
function Glass({ className = "", delay = 0, children }: { className?: string; delay?: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`glass rounded-2xl ${className}`}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

// Inline tag, the blue token look from issue trackers
const tag = "inline-flex items-center gap-1 rounded-md bg-link/10 px-1.5 py-0.5 text-[0.6875rem] text-link";
const label = "flex items-center gap-1.5 text-[0.6875rem] text-muted";
const bar = "h-1 overflow-hidden rounded-full bg-foreground/10";

function Avatar({ id, className = "size-6" }: { id: string; className?: string }) {
  return <span className={`well flex shrink-0 items-center justify-center rounded-full text-[0.625rem] font-medium text-muted ${className}`}>{id}</span>;
}

/** Grey bar until `on`, then the text fades in over it. */
function Fill({ on, w, children, className = "" }: { on: boolean; w: string; children: ReactNode; className?: string }) {
  return (
    <span className={`relative block h-4 ${className}`}>
      <motion.span className="absolute left-0 top-1 h-2 rounded-sm bg-foreground/10" style={{ width: w }} animate={{ opacity: on ? 0 : 1 }} transition={{ duration: 0.25, delay: on ? 0 : 0.1 }} />
      <motion.span className="absolute inset-0 truncate" animate={{ opacity: on ? 1 : 0, y: on ? 0 : 3 }} transition={{ duration: on ? 0.35 : 0.1, ease }}>{children}</motion.span>
    </span>
  );
}

/** Plain connector line between two side-by-side panels. */
function Wire() {
  return <span className="h-px w-6 shrink-0 bg-white/70 sm:w-10" />;
}

function CountUp({ to }: { to: number }) {
  const v = useSpring(0, { stiffness: 60, damping: 18 });
  const n = useTransform(v, (x) => Math.round(x));
  // Up springs; the loop reset snaps back to 0
  useEffect(() => (to ? v.set(to) : v.jump(0)), [v, to]);
  return <motion.span>{n}</motion.span>;
}

/* ---------- 01 Voice: the live call, orb in the middle ---------- */

const QUESTIONS = ["Walk me through a system you designed.", "What was the hardest trade-off?", "How did you measure success?"];
const ANSWERS = ["I led the rewrite of our payments flow…", "We traded strict consistency for checkout latency…", "Failed checkouts fell by 40% within a month…"];
const PHASES = [
  { orb: "composing", label: "Asking" },
  { orb: "listening", label: "Listening" },
  { orb: "solving", label: "Thinking…" },
] as const;
const BARS = Array.from({ length: 32 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.55)));

function Waveform({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-7 flex-1 items-center justify-between">
      {BARS.map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-foreground/70"
          animate={active && !reduce ? { height: [`${h * 25}%`, `${h * 100}%`, `${h * 45}%`] } : { height: active ? `${h * 70}%` : "12%" }}
          transition={active && !reduce ? { duration: 0.8 + (i % 5) * 0.13, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.3 }}
        />
      ))}
    </div>
  );
}

export function VoiceVisual() {
  const [ref, step] = useStep(QUESTIONS.length * 3, 2200);
  const q = Math.floor(step / 3);
  const phase = PHASES[step % 3];
  const secs = 268 - step * 7;
  return (
    <Frame tone="lime" frameRef={ref}>
      <Glass className="w-full max-w-[22rem] p-4 sm:p-5">
        <div className="flex items-center justify-between text-[0.6875rem] text-muted">
          <span className="flex items-center gap-1.5 tabular-nums">
            <span className="size-1.5 rounded-full bg-danger motion-safe:animate-pulse" />
            Live · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </span>
          <span className="tabular-nums">Question {q + 1} of 5</span>
        </div>
        <div className="mt-4 flex flex-col items-center text-center">
          <ThinkingOrb state={phase.orb} size={64} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={phase.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-[0.6875rem] text-muted">{phase.label}</motion.p>
          </AnimatePresence>
          <div className="relative mt-2 h-10 w-full">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={q}
                initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                transition={{ duration: 0.45, ease }}
                className="absolute inset-0 flex items-center justify-center text-balance text-sm font-medium leading-snug"
              >
                “{QUESTIONS[q]}”
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <div className="well mt-3 flex items-center gap-3 rounded-xl px-3 py-2">
          <Icon d={icons.mic} size={14} className="shrink-0 text-muted" />
          <Waveform active={step % 3 === 1} />
        </div>
        <div className="mt-2.5 h-4 text-xs">
          <AnimatePresence mode="wait">
            {step % 3 >= 1 && (
              <motion.p key={q} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }} className="truncate text-muted">
                <span className="font-medium text-foreground">You</span> {ANSWERS[q]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Glass>
    </Frame>
  );
}

/* ---------- 02 Screening: one question card with the countdown in its header ---------- */

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
  const left = 0.87 - step * 0.035;
  return (
    <Frame tone="lavender" frameRef={ref}>
      <Glass className="w-full max-w-[22rem] p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Question <span className="font-medium tabular-nums text-foreground">{at + 1}</span> of 10</span>
          <span className="flex items-center gap-1.5 text-xs font-medium tabular-nums">
            <svg viewBox="0 0 40 40" className="size-4 -rotate-90">
              <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="6" />
              <motion.circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="6" pathLength={1} strokeDasharray="1 1" animate={{ strokeDashoffset: 1 - left }} transition={{ duration: 0.8, ease }} />
            </svg>
            8:{String(42 - step * 2).padStart(2, "0")}
          </span>
        </div>
        <div className={`${bar} mt-3`}>
          <motion.div className="h-full rounded-full bg-foreground" animate={{ width: `${answered * 10}%` }} transition={{ duration: 0.5, ease }} />
        </div>
        <div className="relative mt-4 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={at} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.4, ease }}>
              <p className="text-sm font-medium">{q.q}</p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((o, i) => {
                  const on = picked && i === q.pick;
                  return (
                    <div key={o} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-colors duration-300 ${on ? "bg-foreground text-background" : "well"}`}>
                      <span className={`flex size-4 items-center justify-center rounded text-[0.625rem] transition-colors duration-300 ${on ? "bg-background text-foreground" : "border border-foreground/15 text-muted"}`}>
                        {on ? <Icon d={icons.check} size={10} /> : "ABC"[i]}
                      </span>
                      {o}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mt-4 flex items-center gap-1">
          <span className={tag}>Frontend</span>
          <span className={tag}>Timed</span>
          <span className="ml-auto text-[0.6875rem] tabular-nums text-muted">{answered} answered</span>
        </div>
      </Glass>
    </Frame>
  );
}

/* ---------- 03 Grading: score ring, then the evidence behind it ---------- */

const EVIDENCE = [
  { ok: true, text: "Clear system design" },
  { ok: true, text: "Strong communication" },
  { ok: true, text: "Owns outcomes end to end" },
  { ok: false, text: "Light on testing strategy" },
];

export function ScoreVisual() {
  // 0 blank, 1 score, 2 analysis, 3-5 one strength each, 6 concern, 7 hold
  const [ref, step] = useStep(8, 1000);
  return (
    <Frame tone="pink" frameRef={ref}>
      <Glass className="w-full max-w-[22rem] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <Avatar id="PS" className="size-8" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium">Priya Sharma</p>
            <p className="truncate text-muted">Frontend Engineer</p>
          </div>
          <span className={`${tag} !bg-success/10 !text-success`}><Icon d={icons.check} size={11} />Evaluated</span>
        </div>
        <div className="mt-4 flex items-center gap-4">
          <div className="relative size-[4.5rem] shrink-0">
            <svg viewBox="0 0 40 40" className="size-full -rotate-90">
              <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth="3" />
              <motion.circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" animate={{ strokeDashoffset: step >= 1 ? 0.14 : 1 }} transition={{ duration: 1.1, ease }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-medium tabular-nums tracking-tight"><CountUp to={step >= 1 ? 86 : 0} /></span>
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <motion.span className={`${tag} mb-1.5`} animate={{ opacity: step >= 1 ? 1 : 0, scale: step >= 1 ? 1 : 0.9 }} transition={{ duration: 0.3, ease, delay: step >= 1 ? 0.5 : 0 }}>Strong fit</motion.span>
            <div className="space-y-0.5 text-muted">
              <Fill on={step >= 2} w="92%">Scored against the job description.</Fill>
              <Fill on={step >= 2} w="74%">Deep frontend; testing is thin.</Fill>
            </div>
          </div>
        </div>
        <ul className="mt-4 space-y-1.5 border-t border-foreground/10 pt-3.5 text-xs">
          {EVIDENCE.map((e, i) => {
            const on = step >= 3 + i;
            return (
              <li key={e.text} className="flex items-center gap-2">
                <motion.span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full ${e.ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
                  animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0.35 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}
                >
                  {e.ok ? <Icon d={icons.check} size={10} /> : <span className="size-1 rounded-full bg-current" />}
                </motion.span>
                <span className="min-w-0 flex-1"><Fill on={on} w={`${50 + (i % 3) * 12}%`}>{e.text}</Fill></span>
              </li>
            );
          })}
        </ul>
      </Glass>
    </Frame>
  );
}

/* ---------- 04 Profile: a resume page is scanned into the profile beside it ---------- */

const JOBS = [
  { co: "Stripe", role: "Senior Frontend" },
  { co: "Notion", role: "Frontend Engineer" },
];
const SKILLS = ["React", "TypeScript", "Node.js"];
// Text lines on the mini resume page; "" is a paragraph gap
const PAGE_LINES = ["70%", "45%", "", "90%", "82%", "60%", "", "88%", "76%", "52%"];

export function ResumeVisual() {
  // 0 scan, 1 identity, 2 experience, 3 skills, 4 export, 5 hold
  const [ref, step] = useStep(6, 1100);
  const reduce = useReducedMotion();
  return (
    <Frame tone="mint" frameRef={ref}>
      <div className="flex w-full max-w-[26rem] items-center">
        <Glass className="relative w-[38%] shrink-0 overflow-hidden p-3">
          <p className={label}><Icon d={icons.file} size={12} className="shrink-0" /><span className="truncate">resume.pdf</span></p>
          <div className="mt-3 space-y-1.5">
            {PAGE_LINES.map((w, i) => (w ? <span key={i} className={`block rounded-sm bg-foreground/15 ${i === 0 ? "h-2" : "h-1"}`} style={{ width: w }} /> : <span key={i} className="block h-1.5" />))}
          </div>
          {step < 4 && !reduce && (
            <motion.span
              className="pointer-events-none absolute inset-x-0 h-10 border-b border-link bg-gradient-to-b from-transparent to-link/20"
              initial={{ top: "-2.5rem" }}
              animate={{ top: "100%" }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </Glass>
        <Wire />
        <Glass className="min-w-0 flex-1 p-3.5" delay={0.12}>
          <div className="flex items-center gap-2.5">
            <Avatar id="PS" className="size-8" />
            <span className="min-w-0 flex-1 text-xs">
              <Fill on={step >= 1} w="60%" className="font-medium">Priya Sharma</Fill>
              <Fill on={step >= 1} w="80%" className="text-muted">Frontend · Pune</Fill>
            </span>
          </div>
          <p className={`${label} mt-3.5`}>Experience</p>
          <div className="mt-1.5 space-y-1.5">
            {JOBS.map((j) => (
              <div key={j.co} className="flex items-center gap-2 text-[0.6875rem]">
                <span className="well flex size-5 shrink-0 items-center justify-center rounded-md text-[0.5625rem] font-medium text-muted">{j.co[0]}</span>
                <span className="min-w-0 flex-1"><Fill on={step >= 2} w="85%">{j.role} · {j.co}</Fill></span>
              </div>
            ))}
          </div>
          <p className={`${label} mt-3.5`}>Skills</p>
          <div className="mt-1.5 flex h-5 flex-wrap gap-1 overflow-hidden">
            {SKILLS.map((s, i) => (
              <motion.span key={s} className={tag} animate={{ opacity: step >= 3 ? 1 : 0, y: step >= 3 ? 0 : 4 }} transition={{ duration: 0.3, ease, delay: step >= 3 ? i * 0.08 : 0 }}>{s}</motion.span>
            ))}
          </div>
          <motion.div
            className="mt-3.5 flex items-center justify-center gap-1.5 rounded-lg bg-foreground py-1.5 text-[0.6875rem] font-medium text-background"
            animate={{ opacity: step >= 4 ? 1 : 0.25 }}
            transition={{ duration: 0.35, ease }}
          >
            <Icon d={icons.download} size={11} />Export ATS PDF
          </motion.div>
        </Glass>
      </div>
    </Frame>
  );
}

/* ---------- 05 Pipeline: kanban board with a notification toast tucked under it ---------- */

const COLS = ["Submitted", "Viewed", "Shortlisted"];
// Column per step for each candidate
const PEOPLE = [
  { id: "PS", name: "Priya Sharma", score: 86, at: [0, 1, 2, 2] },
  { id: "AK", name: "Arjun Kumar", score: 72, at: [0, 0, 1, 1] },
  { id: "MR", name: "Meera Rao", score: 64, at: [0, 0, 0, 0] },
];

export function PipelineVisual() {
  const [ref, step] = useStep(4, 1500);
  return (
    <Frame tone="peach" frameRef={ref}>
      <div className="relative w-full max-w-[24rem] pb-6">
        <Glass className="p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="truncate font-medium">Frontend Engineer</span>
            <span className={tag}>24</span>
            <span className="ml-auto shrink-0 text-[0.6875rem] text-muted">By score</span>
          </div>
          <LayoutGroup>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {COLS.map((c, ci) => {
                const here = PEOPLE.filter((p) => p.at[step] === ci);
                return (
                  <div key={c} className="well min-w-0 rounded-xl p-1.5">
                    <p className="flex items-center justify-between px-1 text-[0.625rem] text-muted">
                      <span className="truncate">{c}</span>
                      <span className="tabular-nums">{here.length}</span>
                    </p>
                    <div className="mt-1.5 min-h-[7.25rem] space-y-1.5">
                      {here.map((p) => (
                        <motion.div key={p.id} layoutId={p.id} transition={{ duration: 0.55, ease }} className="rounded-lg bg-surface/80 p-1.5 shadow-[0_2px_6px_-2px_rgb(0_0_0/0.15)]">
                          <div className="flex items-center gap-1.5">
                            <Avatar id={p.id} className="size-4 text-[0.5rem]" />
                            <span className="min-w-0 truncate text-[0.625rem] font-medium">{p.name.split(" ")[0]}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1">
                            <span className={`${bar} flex-1`}><span className="block h-full rounded-full bg-foreground/70" style={{ width: `${p.score}%` }} /></span>
                            <span className="text-[0.5625rem] tabular-nums text-muted">{p.score}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </LayoutGroup>
        </Glass>
        <div className="absolute inset-x-[10%] bottom-0">
          <AnimatePresence>
            {step >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
                transition={{ duration: 0.5, ease }}
                className="glass flex items-center gap-2.5 rounded-xl p-2.5"
              >
                <Avatar id="PS" />
                <div className="min-w-0 text-[0.6875rem] leading-tight">
                  <p className="truncate"><span className="font-medium">Priya</span> moved to <span className="font-medium">Shortlisted</span></p>
                  <p className="truncate text-muted">Interview attached · just now</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Frame>
  );
}

/* ---------- 06 Trust: company page with the work-email check overlapping it ---------- */

const CODE = "482913";

export function CompanyVisual() {
  // 0 blank, 1 email, 2 code, 3 verified, 4 hold
  const [ref, step] = useStep(5, 1300);
  const verified = step >= 3;
  return (
    <Frame tone="sky" frameRef={ref}>
      <div className="flex w-full max-w-[27rem] items-center">
        <Glass className="w-[44%] shrink-0 p-3">
          <p className={label}><Icon d={icons.company} size={12} className="shrink-0" /><span className="truncate">Verify work email</span></p>
          <div className="well mt-2 flex h-7 items-center overflow-hidden rounded-md px-2 text-[0.6875rem]">
            {step >= 1 ? <motion.span className="truncate" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>priya@acme.com</motion.span> : <span className="h-3 w-px bg-foreground motion-safe:animate-pulse" />}
          </div>
          <div className="mt-1.5 grid grid-cols-6 gap-0.5 sm:gap-1">
            {[...CODE].map((d, i) => (
              <span key={i} className={`well flex h-6 items-center justify-center rounded-md border text-[0.6875rem] tabular-nums transition-colors duration-300 ${verified ? "border-success/60" : "border-transparent"}`}>
                {step >= 2 && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>{d}</motion.span>}
              </span>
            ))}
          </div>
          <motion.p className="mt-2 flex h-4 items-center gap-1 text-[0.6875rem] text-success" animate={{ opacity: verified ? 1 : 0 }} transition={{ duration: 0.3 }}>
            <Icon d={icons.check} size={11} className="shrink-0" /><span className="truncate">Domain verified</span>
          </motion.p>
        </Glass>
        <Wire />
        <Glass className="min-w-0 flex-1 overflow-hidden" delay={0.12}>
          <div className="h-9 bg-[linear-gradient(120deg,rgb(199_215_254/0.7),rgb(233_213_255/0.7)_55%,rgb(251_207_232/0.7))]" />
          <div className="px-3 pb-3 sm:px-3.5 sm:pb-3.5">
            <span className="glass -mt-4 flex size-8 items-center justify-center rounded-lg text-xs font-medium">A</span>
            <p className="mt-1.5 flex items-center gap-1 text-[13px] font-medium tracking-tight">
              Acme Inc
              <AnimatePresence>
                {verified && (
                  <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, transition: { duration: 0.15 } }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="text-link">
                    <Icon d={icons.verified} size={14} />
                  </motion.span>
                )}
              </AnimatePresence>
            </p>
            <p className="truncate text-[0.6875rem] text-muted">acme.com · 120 people</p>
            <div className="mt-2.5 space-y-1">
              {["Frontend Engineer", "Product Designer"].map((r) => (
                <div key={r} className="well flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[0.6875rem]">
                  <span className="truncate font-medium">{r}</span>
                  <span className="hidden text-muted sm:inline">Remote</span>
                </div>
              ))}
            </div>
          </div>
        </Glass>
      </div>
    </Frame>
  );
}

/* ---------- Showcase: one large stage, a feature list that advances on its own ---------- */

// `ms` is roughly one loop of that visual, so each gets to finish before the next takes the stage
const FEATURES = [
  { icon: icons.mic, Visual: VoiceVisual, ms: 13200, title: "Structured voice interviews", body: "Five-minute spoken interviews, any time." },
  { icon: icons.clock, Visual: McqVisual, ms: 9000, title: "Timed assessments", body: "Swap the interview for a timed MCQ test." },
  { icon: icons.level, Visual: ScoreVisual, ms: 8000, title: "Evaluation against the role", body: "Each answer scored against the role." },
  { icon: icons.file, Visual: ResumeVisual, ms: 6600, title: "Profiles from resumes", body: "Upload a resume, get an ATS-ready profile." },
  { icon: icons.jobs, Visual: PipelineVisual, ms: 6000, title: "Unified applicant pipeline", body: "Every applicant, from submit to shortlist." },
  { icon: icons.verified, Visual: CompanyVisual, ms: 6500, title: "Verified company pages", body: "One domain, verified by work email." },
] as const;

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const { Visual } = FEATURES[active];
  // The progress bar is a CSS animation; it pauses off screen or under the pointer/focus, and its end advances the list
  const paused = hold || !inView;
  return (
    <div
      ref={ref}
      className="mt-12 grid gap-8 sm:mt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHold(false)}
    >
      <div className="grid self-start lg:sticky lg:top-24 lg:order-2">
        <AnimatePresence initial={false}>
          <motion.div
            key={active}
            className="[grid-area:1/1]"
            initial={{ opacity: 0, scale: 1.015, filter: "blur(10px)", clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)", clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, scale: 0.99, filter: "blur(6px)", transition: { duration: 0.4, ease } }}
            transition={{ duration: 0.8, ease }}
          >
            <Visual />
          </motion.div>
        </AnimatePresence>
      </div>
      <ul className="border-b border-border lg:self-center">
        {FEATURES.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.title} className="relative border-t border-border">
              {on && (
                <span
                  key={active}
                  aria-hidden
                  className="feature-progress absolute inset-x-0 -top-px h-px origin-left bg-foreground"
                  style={{ animationDuration: `${f.ms}ms`, animationPlayState: paused ? "paused" : "running" }}
                  onAnimationEnd={() => setActive((a) => (a + 1) % FEATURES.length)}
                />
              )}
              <button
                type="button"
                aria-expanded={on}
                aria-controls={`feature-${i}`}
                onClick={() => setActive(i)}
                className={`group flex w-full items-center gap-3 py-4 text-left transition-colors duration-300 sm:py-5 ${on ? "text-foreground" : "text-muted hover:text-foreground"}`}
              >
                <Icon d={f.icon} size={16} className="shrink-0" />
                <span className="text-[clamp(1rem,1.6vw,1.125rem)] font-medium tracking-[-0.02em]">{f.title}</span>
              </button>
              <div id={`feature-${i}`} className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <p className="overflow-hidden pl-7 text-pretty text-[15px] leading-relaxed text-muted">
                  <span className="block pb-5">{f.body}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
