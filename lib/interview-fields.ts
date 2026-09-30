/** Voice interview rules and shapes shared by the post form, the candidate flow, the server and the report view. */
export const INTERVIEW = { maxQuestions: 5, questionChars: 300, seconds: 300 };

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
  questions: { question: string; answer: string; score: number; feedback: string }[]; // score 0-10
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, Number(v) || 0)));
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** One question per line (or an array), blanks dropped, capped so they fit the time limit. */
export function cleanQuestions(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split("\n") : [];
  return list.map((q) => str(q, INTERVIEW.questionChars)).filter(Boolean).slice(0, INTERVIEW.maxQuestions);
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
export function cleanReport(raw: unknown, questions: string[]): Report {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const qs = Array.isArray(r.questions) ? r.questions : [];
  return {
    score: num(r.score, 0, 100),
    fit: typeof r.fit === "string" && Object.hasOwn(FITS, r.fit) ? (r.fit as Fit) : "weak",
    summary: str(r.summary, 1200),
    strengths: strs(r.strengths, 5, 200),
    concerns: strs(r.concerns, 5, 200),
    // Always one row per asked question, in order, even if the model skipped one
    questions: questions.map((question, i) => {
      const q = (qs[i] && typeof qs[i] === "object" ? qs[i] : {}) as Record<string, unknown>;
      return { question, answer: str(q.answer, 3000) || "Not answered", score: num(q.score, 0, 10), feedback: str(q.feedback, 500) };
    }),
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
