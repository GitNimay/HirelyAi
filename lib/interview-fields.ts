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
  score: number; // 0-100 overall
  fit: Fit;
  summary: string;
  resumeFit?: number; // 0-100: resume vs job requirements; absent on old reports
  roleFit?: number; // 0-100: interview answers vs the role; absent on old reports
  strengths: string[];
  concerns: string[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, Number(v) || 0)));
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
/** 0-100 from a number or numeric text; anything else is undefined, not 0. */
const part = (v: unknown) => ((typeof v === "number" || (typeof v === "string" && v.trim())) && Number.isFinite(Number(v)) ? num(v, 0, 100) : undefined);

/** Fit follows the score, so the label and the number never disagree (MCQ and voice alike). */
export const fitFor = (score: number): Fit => (score >= 75 ? "strong" : score >= 50 ? "moderate" : "weak");

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
    fit: fitFor(score),
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

/**
 * Model output → a Report we can render safely. Missing or odd fields become empty/zero instead of throwing.
 * The overall is 35% resume + 65% interview (just the interview when there's no resume); fit is derived from it.
 */
export function cleanReport(raw: unknown): Report {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const resumeFit = part(r.resumeFit);
  const roleFit = part(r.roleFit);
  const score = roleFit === undefined ? num(r.score, 0, 100) : resumeFit === undefined ? roleFit : Math.round(resumeFit * 0.35 + roleFit * 0.65);
  return {
    score,
    fit: fitFor(score),
    summary: str(r.summary, 220),
    resumeFit,
    roleFit,
    strengths: strs(r.strengths, 3, 80),
    concerns: strs(r.concerns, 3, 80),
  };
}

/** Transcript from the agent: only well-formed lines, bounded. A pause mid-answer ends a speech-to-text turn, so back-to-back lines from one speaker are joined. */
export function cleanTranscript(input: unknown): Line[] {
  if (!Array.isArray(input)) return [];
  const out: Line[] = [];
  for (const l of input) {
    const line = { role: l?.role === "agent" ? "agent" : "candidate", text: str(l?.text, 4000) } as Line;
    if (!line.text) continue;
    const last = out.at(-1);
    if (last?.role === line.role) last.text = `${last.text} ${line.text}`.slice(0, 8000);
    else out.push(line);
  }
  return out.slice(0, 400);
}

/**
 * Speech-to-text hints for the call: the candidate's skills, employers and job titles, plus technical-looking terms in the
 * job description (Node.js, C++, AWS, PostgreSQL). AssemblyAI takes up to 100 terms of up to 50 chars; plain English words
 * make it overcorrect, so only names and jargon go in.
 */
export function callKeyterms(description: string, resume: { skills: string[]; experience: { title: string; company: string }[] } | null): string[] {
  // ponytail: shape heuristic (inner capital, digit, symbol, acronym), misses plain-word tech like "Kubernetes"; a JD skills field would fix it
  const jargon = description.match(/[A-Za-z][\w.+#-]*[A-Za-z0-9+#]/g)?.filter((w) => /[a-z][A-Z]|[A-Z]{2,}|\d|[.+#]/.test(w.slice(1)) || /^[A-Z]{2,}$/.test(w)) ?? [];
  const terms = [...(resume?.skills ?? []), ...(resume?.experience.flatMap((e) => [e.company, e.title]) ?? []), ...jargon];
  const seen = new Set<string>();
  return terms.map((t) => t.trim().slice(0, 50)).filter((t) => t.length > 1 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 80);
}

/** Whole years since the earliest "YYYY-MM" start on the resume. */
export function resumeYears(experience: { start: string }[], now = new Date()): number {
  // ponytail: first start to today, ignores gaps and overlaps; the candidate can correct it on the form
  const starts = experience.map((e) => e.start).filter((s) => /^\d{4}-\d{2}/.test(s)).sort();
  if (!starts.length) return 0;
  const [y, m] = starts[0].split("-").map(Number);
  return Math.max(0, Math.floor((now.getFullYear() * 12 + now.getMonth() - (y * 12 + m - 1)) / 12));
}
