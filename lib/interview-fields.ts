/** Screening rules and shapes (voice interview or MCQ test) shared by the post form, the candidate flow, the server and the report view. */
export const INTERVIEW = { maxQuestions: 5, questionChars: 300, seconds: 300 };
export const MCQ = { maxQuestions: 20, minOptions: 2, maxOptions: 6, questionChars: 500, optionChars: 200, secondsPerQuestion: 60, topicChars: 120, summaryChars: 600 };
export const KINDS = { voice: "Voice interview", mcq: "MCQ test" } as const;
export const DIFFICULTY = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

export type Kind = keyof typeof KINDS;
export type Mcq = { q: string; options: string[]; answer: number };
/** What the candidate gets: no answer key. */
export type McqPublic = Omit<Mcq, "answer">;
/** One question as the poster reviews it. `picked` -1 = unanswered. */
export type McqReview = Mcq & { picked: number };

/** Test length: a minute a question. */
export const mcqSeconds = (n: number) => n * MCQ.secondsPerQuestion;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** "3 questions · 5 min" for either kind. */
export const screeningFacts = (kind: Kind, questions: number) =>
  `${plural(questions, "question")} · ${(kind === "mcq" ? mcqSeconds(questions) : INTERVIEW.seconds) / 60} min`;

export const NOTICE = { now: "Immediately", "15d": "15 days", "30d": "30 days", "60d": "60 days", "90d": "90 days or more" } as const;
export const FITS = { strong: "Strong fit", moderate: "Possible fit", weak: "Not a fit" } as const;

export type Fit = keyof typeof FITS;
export type Profile = { name: string; phone: string; city: string; role: string; years: number; notice: keyof typeof NOTICE; link: string };
export type Line = { role: "agent" | "candidate"; text: string };
export type Report = {
  score: number; // 0-100
  fit: Fit;
  summary: string;
  strengths: string[];
  concerns: string[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, Number(v) || 0)));
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** One question per line (or an array), blanks dropped, capped so they fit the time limit. */
export function cleanQuestions(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split("\n") : [];
  return list.map((q) => str(q, INTERVIEW.questionChars)).filter(Boolean).slice(0, INTERVIEW.maxQuestions);
}

/**
 * MCQ questions from the post form or the model: trimmed, blank options dropped, 2-6 options, a valid answer index.
 * `strict` reports the first broken question (the form); otherwise broken ones are skipped (model output).
 */
export function cleanMcq(input: unknown, strict = false): Mcq[] {
  const list = Array.isArray(input) ? input.slice(0, MCQ.maxQuestions) : [];
  const out: Mcq[] = [];
  list.forEach((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const all = Array.isArray(r.options) ? r.options.map((o) => str(o, MCQ.optionChars)) : [];
    const answer = Number(r.answer);
    // Drop blank options but keep the answer pointing at the same text
    const options = all.filter(Boolean).slice(0, MCQ.maxOptions);
    const at = Number.isInteger(answer) && all[answer] ? options.indexOf(all[answer]) : -1;
    const q = str(r.q, MCQ.questionChars);
    const problem = !q ? "has no question" : options.length < MCQ.minOptions ? `needs at least ${MCQ.minOptions} options` : at < 0 ? "needs a correct answer" : new Set(options).size < options.length ? "has duplicate options" : "";
    if (problem && strict) throw new Error(`Question ${i + 1} ${problem}`);
    if (!problem) out.push({ q, options, answer: at });
  });
  return out;
}

/** Candidate picks, one per question, -1 when unanswered or out of range. */
export const cleanAnswers = (input: unknown, questions: Pick<Mcq, "options">[]) =>
  questions.map((q, i) => {
    const v = Array.isArray(input) ? Number(input[i]) : -1;
    return Number.isInteger(v) && v >= 0 && v < q.options.length ? v : -1;
  });

/** Deterministic MCQ grading, in the same Report shape as the voice verdict. */
export function gradeMcq(questions: Mcq[], answers: number[]): Report {
  const right = questions.filter((q, i) => answers[i] === q.answer).length;
  const skipped = answers.filter((a) => a < 0).length;
  const score = questions.length ? Math.round((right / questions.length) * 100) : 0;
  return {
    score,
    fit: score >= 75 ? "strong" : score >= 50 ? "moderate" : "weak",
    summary: `${right} of ${questions.length} correct${skipped ? `, ${skipped} unanswered` : ""}.`,
    strengths: [],
    concerns: [],
  };
}

/** Onboarding answers, with what's missing. */
export function cleanProfile(input: Record<string, unknown>): { profile: Profile; missing: string[] } {
  const profile: Profile = {
    name: str(input.name, 60),
    phone: str(input.phone, 30),
    city: str(input.city, 60),
    role: str(input.role, 80),
    years: num(input.years, 0, 50),
    notice: typeof input.notice === "string" && Object.hasOwn(NOTICE, input.notice) ? (input.notice as Profile["notice"]) : "30d",
    link: /^https?:\/\/\S+$/.test(str(input.link, 200)) ? str(input.link, 200) : "",
  };
  const missing = (["name", "phone", "city", "role"] as const).filter((k) => !profile[k]);
  if (profile.phone && !/^[+\d\s().-]{6,}$/.test(profile.phone)) missing.push("phone");
  return { profile, missing };
}

/** Model output → a Report we can render safely. Missing or odd fields become empty/zero instead of throwing. */
export function cleanReport(raw: unknown): Report {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    score: num(r.score, 0, 100),
    fit: typeof r.fit === "string" && Object.hasOwn(FITS, r.fit) ? (r.fit as Fit) : "weak",
    summary: str(r.summary, 1200),
    strengths: strs(r.strengths, 5, 200),
    concerns: strs(r.concerns, 5, 200),
  };
}

/** Transcript from the agent: only well-formed lines, bounded. */
export function cleanTranscript(input: unknown): Line[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((l) => ({ role: l?.role === "agent" ? "agent" : "candidate", text: str(l?.text, 4000) }) as Line)
    .filter((l) => l.text)
    .slice(0, 400);
}
