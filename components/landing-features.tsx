"use client";

import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion, useSpring, useTransform } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, icons } from "./ui";

/* Looping mini versions of the real screens (Live interview, McqTest, the AI evaluation), for the landing features.
   Each tile is a painted backdrop with layered windows on it, like a desktop. Windows rise in once, the side ones
   drift gently, and the content loops only while on screen; with reduced motion everything holds its finished state. */

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

/** The tile: a slowly drifting painted backdrop; children position themselves on it. */
function Frame({ tone, frameRef, children }: { tone: keyof typeof TONES; frameRef: React.Ref<HTMLDivElement>; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div ref={frameRef} aria-hidden className="relative aspect-[6/5] overflow-hidden border border-border bg-surface sm:aspect-[4/3]">
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

/** A window on the tile. Rises in on first view; `float` adds a slow bob so stacked windows feel alive.
    Give it top and a negative bottom/right to run it off the tile edge. */
function Card({ className, delay = 0, float = false, pad = "p-4", children }: { className: string; delay?: number; float?: boolean; pad?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`absolute ${className}`}
      animate={float && !reduce ? { y: [0, -6, 0] } : undefined}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: delay + 1 }}
    >
      <motion.div
        className={`h-full rounded-xl border border-border/70 bg-surface/95 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.4)] backdrop-blur-md ${pad}`}
        initial={reduce ? false : { opacity: 0, y: 20, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease, delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// Inline tag, the blue token look from issue trackers
const tag = "inline-flex items-center gap-1 rounded-md bg-link/10 px-1.5 py-0.5 text-link";
const label = "flex items-center gap-1.5 text-[0.6875rem] text-muted";

function Avatar({ id, className = "size-6" }: { id: string; className?: string }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full bg-surface-hover text-[0.625rem] font-medium text-muted ${className}`}>{id}</span>;
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

function CountUp({ to }: { to: number }) {
  const v = useSpring(0, { stiffness: 60, damping: 18 });
  const n = useTransform(v, (x) => Math.round(x));
  // Up springs; the loop reset snaps back to 0
  useEffect(() => (to ? v.set(to) : v.jump(0)), [v, to]);
  return <motion.span>{n}</motion.span>;
}

/* ---------- 01 Voice: question bubble over a live interview window ---------- */

const QUESTIONS = ["Walk me through a system you designed.", "What was the hardest trade-off?", "How did you measure success?"];
const ANSWERS = ["I led the rewrite of our payments flow…", "We traded strict consistency for checkout latency…", "Failed checkouts fell by 40% within a month…"];
const PHASES = [
  { orb: "composing", label: "Asking" },
  { orb: "listening", label: "Listening" },
  { orb: "solving", label: "Thinking…" },
] as const;
const BARS = Array.from({ length: 36 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.55)));

function Waveform({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-8 flex-1 items-center gap-[3px]">
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
      <div className="absolute inset-x-0 top-[7%] flex flex-col items-center">
        <div className="relative h-9 w-[76%]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={q}
              initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease }}
              className="absolute inset-0 flex items-center justify-center truncate rounded-xl bg-black/35 px-4 text-xs font-medium text-white backdrop-blur-md"
            >
              “{QUESTIONS[q]}”
            </motion.p>
          </AnimatePresence>
        </div>
        <span className="h-[calc(23%-2.25rem)] min-h-3 w-px bg-white/60" />
      </div>
      <Card className="left-[11%] right-[11%] top-[30%] -bottom-6">
        <div className="flex items-center gap-2.5">
          <ThinkingOrb state={phase.orb} size={32} />
          <div className="min-w-0 text-xs">
            <p className="font-medium">AI interviewer</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={phase.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted">{phase.label}</motion.p>
            </AnimatePresence>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[0.6875rem] tabular-nums text-muted">
            <span className="size-1.5 rounded-full bg-danger motion-safe:animate-pulse" />
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-border">
              <motion.span className="block h-full bg-foreground" animate={{ width: i < q ? "100%" : i === q ? "50%" : "0%" }} transition={{ duration: 0.6, ease }} />
            </span>
          ))}
        </div>
        <p className={`${label} mt-2`}>Question {q + 1} of 5</p>
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-background px-3 py-2">
          <Icon d={icons.mic} size={14} className="shrink-0 text-muted" />
          <Waveform active={step % 3 === 1} />
        </div>
        <div className="mt-3 h-4 text-xs">
          <AnimatePresence mode="wait">
            {step % 3 >= 1 && (
              <motion.p key={q} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease }} className="truncate text-muted">
                <span className="font-medium text-foreground">You</span> {ANSWERS[q]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </Frame>
  );
}

/* ---------- 02 Screening: a countdown window behind the question window ---------- */

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
      <Card className="z-10 left-[5%] top-[40%] w-[40%] max-w-[12rem]" delay={0.15} float pad="p-3.5">
        <p className={label}><Icon d={icons.clock} size={12} />Timed assessment</p>
        <div className="mt-3 flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="size-11 shrink-0 -rotate-90">
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--border)" strokeWidth="3" />
            <motion.circle cx="20" cy="20" r="17" fill="none" stroke="var(--foreground)" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" animate={{ strokeDashoffset: 1 - left }} transition={{ duration: 0.8, ease }} />
          </svg>
          <div className="text-xs">
            <p className="text-base font-medium tabular-nums tracking-tight">8:{String(42 - step * 2).padStart(2, "0")}</p>
            <p className="text-muted">remaining</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1 text-[0.6875rem]">
          <span className={tag}>10 questions</span>
          <span className={tag}>Frontend</span>
        </div>
      </Card>
      <Card className="left-[34%] top-[11%] -right-6 -bottom-6" pad="p-4 pr-10">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Question <span className="font-medium text-foreground tabular-nums">{at + 1}</span> of 10</span>
          <span className="tabular-nums">{answered} answered</span>
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-border">
          <motion.div className="h-full rounded-full bg-foreground" animate={{ width: `${answered * 10}%` }} transition={{ duration: 0.5, ease }} />
        </div>
        <div className="relative mt-4 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={at} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.4, ease }}>
              <p className="text-[13px] font-medium">{q.q}</p>
              <div className="mt-3 space-y-1.5">
                {q.options.map((o, i) => {
                  const on = picked && i === q.pick;
                  return (
                    <div key={o} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs transition-colors duration-300 ${on ? "border-foreground bg-foreground text-background" : "border-border bg-background"}`}>
                      <span className={`flex size-4 items-center justify-center rounded text-[0.625rem] transition-colors duration-300 ${on ? "bg-background text-foreground" : "border border-border text-muted"}`}>
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
      </Card>
    </Frame>
  );
}

/* ---------- 03 Grading: evaluation window with stacked strengths / concerns ---------- */

const STRENGTHS = ["Clear system design", "Strong communication", "Owns outcomes end to end"];

export function ScoreVisual() {
  // 0 blank, 1 score, 2 analysis, 3-5 one strength each, 6 concern, 7 hold
  const [ref, step] = useStep(8, 1000);
  return (
    <Frame tone="pink" frameRef={ref}>
      <Card className="left-[5%] top-[9%] w-[62%] -bottom-6">
        <span className={`${tag} text-[0.6875rem] !bg-success/10 !text-success`}><Icon d={icons.check} size={11} />Evaluated</span>
        <p className="mt-3 text-[15px] font-medium tracking-tight">Priya Sharma</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-muted">
          <Avatar id="PS" className="size-4 text-[0.5rem]" />Frontend Engineer · applied 2d ago
        </p>
        <div className="mt-4 flex items-end gap-2">
          <p className="text-3xl font-medium tabular-nums tracking-tight"><CountUp to={step >= 1 ? 86 : 0} /></p>
          <p className="mb-1 text-xs text-muted">/ 100</p>
          <AnimatePresence>
            {step >= 1 && (
              <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease, delay: 0.5 }} className={`${tag} mb-1 ml-auto text-[0.6875rem]`}>
                Strong fit
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <motion.div className="h-full rounded-full bg-foreground" animate={{ width: step >= 1 ? "86%" : "0%" }} transition={{ duration: 1, ease }} />
        </div>
        <p className={`${label} mt-4`}><Icon d={icons.level} size={12} />Analysis</p>
        <div className="mt-1.5 space-y-0.5 text-xs text-muted">
          <Fill on={step >= 2} w="92%">Scored against the job description for the role.</Fill>
          <Fill on={step >= 2} w="80%">Deep frontend experience; testing is thin.</Fill>
        </div>
      </Card>
      <Card className="right-[4%] top-[16%] w-[42%]" delay={0.15} float pad="p-3">
        <p className={label}><Icon d={icons.check} size={12} />{STRENGTHS.length} strengths</p>
        <ul className="mt-2 h-[4.5rem] space-y-1.5 text-xs">
          <AnimatePresence>
            {STRENGTHS.slice(0, Math.max(0, step - 2)).map((s) => (
              <motion.li key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.35, ease }} className="flex items-center gap-2">
                <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"><Icon d={icons.check} size={9} /></span>
                <span className="truncate">{s}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Card>
      <Card className="right-[4%] top-[52%] w-[42%]" delay={0.3} float pad="p-3">
        <p className={label}><span className="size-1.5 rounded-full bg-danger" />1 concern</p>
        <div className="mt-2 h-8 text-xs">
          <AnimatePresence>
            {step >= 6 && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.35, ease }}>
                <p className="font-medium">Light on testing</p>
                <p className="truncate text-[0.6875rem] text-muted">No examples of test strategy</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Card>
    </Frame>
  );
}

/* ---------- 04 Profile: parsed resume pieces flowing into the profile window ---------- */

const SOURCES = [
  { icon: icons.file, title: "priya-resume.pdf", sub: "Uploaded" },
  { icon: icons.jobs, title: "Experience", sub: "2 roles found" },
  { icon: icons.level, title: "Skills", sub: "12 extracted" },
];
const JOBS = [
  { co: "Stripe", role: "Senior Frontend Engineer", yrs: "2022–now" },
  { co: "Notion", role: "Frontend Engineer", yrs: "2019–22" },
];
const SKILLS = ["React", "TypeScript", "Node.js", "System design"];
// Connectors from each source (x 20 / 50 / 80) down into the window below; the 100x75 box matches the 4:3 tile
const WIRES = ["M20 11V19Q20 21 22 21H48Q50 21 50 23V25", "M50 11V25", "M80 11V19Q80 21 78 21H52Q50 21 50 23V25"];

export function ResumeVisual() {
  // 0 upload, 1-3 one source each, 4 skills, 5 hold
  const [ref, step] = useStep(6, 1100);
  return (
    <Frame tone="mint" frameRef={ref}>
      <svg viewBox="0 0 100 75" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {WIRES.map((d, i) => (
          <motion.path key={i} d={d} fill="none" stroke="white" strokeOpacity={0.85} strokeWidth={0.3} animate={{ pathLength: step >= i + 1 ? 1 : 0 }} transition={{ duration: 0.6, ease }} />
        ))}
      </svg>
      <div className="absolute inset-x-[5%] top-[6%] flex justify-between">
        {SOURCES.map((s, i) => (
          <Card key={s.title} className="!relative w-[29%]" delay={i * 0.1} pad="px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-muted"><Icon d={s.icon} size={12} /></span>
              <div className="min-w-0 text-[0.6875rem] leading-tight">
                <p className="truncate font-medium">{s.title}</p>
                <p className="truncate text-muted">
                  {i === 0 && step === 0 ? "Parsing…" : step >= i + 1 ? s.sub : "Waiting"}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="left-[9%] right-[9%] top-[33%] -bottom-6" delay={0.3}>
        <div className="flex items-center gap-3">
          <Avatar id="PS" className="size-9" />
          <span className="min-w-0 flex-1 text-xs">
            <Fill on={step >= 1} w="40%" className="text-[13px] font-medium">Priya Sharma</Fill>
            <Fill on={step >= 1} w="65%" className="text-muted">Frontend Engineer · Pune</Fill>
          </span>
          <AnimatePresence>
            {step >= 4 && (
              <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }} className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.6875rem]">
                <Icon d={icons.download} size={11} />ATS PDF
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className={`${label} mt-4`}>Experience</p>
        <div className="mt-2 space-y-2">
          {JOBS.map((j) => (
            <div key={j.co} className="flex items-center gap-2.5 text-xs">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-[0.625rem] font-medium text-muted">{j.co[0]}</span>
              <span className="min-w-0 flex-1"><Fill on={step >= 2} w="62%">{j.role} · {j.co}</Fill></span>
              <span className="text-[0.6875rem] tabular-nums text-muted">{step >= 2 ? j.yrs : ""}</span>
            </div>
          ))}
        </div>
        <p className={`${label} mt-4`}>Skills</p>
        <div className="mt-2 flex h-5 flex-wrap gap-1 text-[0.6875rem]">
          {SKILLS.map((s, i) => (
            <motion.span key={s} className={tag} animate={{ opacity: step >= 3 ? 1 : 0, y: step >= 3 ? 0 : 4 }} transition={{ duration: 0.3, ease, delay: step >= 3 ? i * 0.08 : 0 }}>{s}</motion.span>
          ))}
        </div>
      </Card>
    </Frame>
  );
}

/* ---------- 05 Pipeline: kanban window with a notification toast ---------- */

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
      <Card className="left-[6%] right-[6%] top-[22%] -bottom-6">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">Frontend Engineer</span>
          <span className={`${tag} text-[0.6875rem]`}>24 applicants</span>
          <span className="ml-auto text-[0.6875rem] text-muted">By score</span>
        </div>
        <LayoutGroup>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {COLS.map((c, ci) => {
              const here = PEOPLE.filter((p) => p.at[step] === ci);
              return (
                <div key={c} className="min-w-0 rounded-lg bg-background p-1.5">
                  <p className="flex items-center justify-between px-1 text-[0.625rem] text-muted">
                    <span className="truncate">{c}</span>
                    <span className="tabular-nums">{here.length}</span>
                  </p>
                  <div className="mt-1.5 min-h-[6.75rem] space-y-1.5">
                    {here.map((p) => (
                      <motion.div key={p.id} layoutId={p.id} transition={{ duration: 0.55, ease }} className="rounded-md border border-border bg-surface p-1.5 shadow-sm">
                        <div className="flex items-center gap-1.5">
                          <Avatar id={p.id} className="size-4 text-[0.5rem]" />
                          <span className="min-w-0 truncate text-[0.625rem] font-medium">{p.name.split(" ")[0]}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="h-1 flex-1 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-foreground/70" style={{ width: `${p.score}%` }} /></span>
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
      </Card>
      <div className="absolute right-[5%] top-[5%] w-[52%]">
        <AnimatePresence>
          {step >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease }}
              className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-surface/95 p-2.5 shadow-[0_24px_60px_-24px_rgb(0_0_0/0.4)] backdrop-blur-md"
            >
              <Avatar id="PS" />
              <div className="min-w-0 text-[0.6875rem] leading-tight">
                <p className="truncate"><span className="font-medium">Priya</span> moved to <span className="font-medium">Shortlisted</span></p>
                <p className="text-muted">Interview attached · just now</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Frame>
  );
}

/* ---------- 06 Trust: company page window with the work-email check in front ---------- */

const CODE = "482913";

export function CompanyVisual() {
  // 0 blank, 1 email, 2 code, 3 verified, 4 hold
  const [ref, step] = useStep(5, 1300);
  const verified = step >= 3;
  return (
    <Frame tone="sky" frameRef={ref}>
      <Card className="left-[30%] top-[10%] -right-6 -bottom-6" pad="p-0 pr-6">
        <div className="h-14 rounded-t-xl bg-[linear-gradient(120deg,#c7d7fe,#e9d5ff_55%,#fbcfe8)]" />
        <div className="px-4 pb-4">
          <span className="-mt-5 flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium shadow-sm">A</span>
          <p className="mt-2 flex items-center gap-1 text-[15px] font-medium tracking-tight">
            Acme Inc
            <AnimatePresence>
              {verified && (
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, transition: { duration: 0.15 } }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="text-link">
                  <Icon d={icons.verified} size={15} />
                </motion.span>
              )}
            </AnimatePresence>
          </p>
          <p className="text-[0.6875rem] text-muted">acme.com · Software · 120 employees</p>
          <div className="mt-3 flex gap-4 border-b border-border text-[0.6875rem] text-muted">
            <span className="border-b border-foreground pb-1.5 font-medium text-foreground">About</span>
            <span>Jobs</span>
            <span>People</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {["Frontend Engineer", "Product Designer"].map((r) => (
              <div key={r} className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 text-[0.6875rem]">
                <span className="font-medium">{r}</span>
                <span className="text-muted">Remote</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Card className="z-10 left-[5%] top-[47%] w-[46%] max-w-[13rem]" delay={0.15} float pad="p-3.5">
        <p className={label}><Icon d={icons.company} size={12} />Verify work email</p>
        <div className="mt-2.5 flex h-7 items-center rounded-md border border-border bg-background px-2 text-[0.6875rem]">
          {step >= 1 ? <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}>priya@acme.com</motion.span> : <span className="h-3 w-px bg-foreground motion-safe:animate-pulse" />}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {[...CODE].map((d, i) => (
            <span key={i} className={`flex h-7 items-center justify-center rounded-md border bg-background text-[0.6875rem] tabular-nums transition-colors duration-300 ${verified ? "border-success" : "border-border"}`}>
              {step >= 2 && <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>{d}</motion.span>}
            </span>
          ))}
        </div>
        <motion.p className="mt-2.5 flex h-4 items-center gap-1 text-[0.6875rem] text-success" animate={{ opacity: verified ? 1 : 0 }} transition={{ duration: 0.3 }}>
          <Icon d={icons.check} size={11} />Domain verified
        </motion.p>
      </Card>
    </Frame>
  );
}
