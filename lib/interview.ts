import { env } from "cloudflare:workers";
import { bedrockJson } from "./bedrock";
import { Fail } from "./guard";
import { cleanQuestions, cleanReport, INTERVIEW, type Line, type Profile, type Report } from "./interview-fields";
import { sendTo } from "./realtime";

export type SessionStatus = "verified" | "onboarded" | "live" | "processing" | "done" | "failed";

/** What the candidate page needs: the job, and their attempt once they've got past the password gate. */
export type CandidateView = {
  slug: string;
  title: string;
  company: string;
  deadline: number;
  questions: number;
  open: boolean;
  session: { status: SessionStatus; startedAt: number | null; prefill: Partial<Profile> } | null;
};

/** The poster's view of one applicant's interview. */
export type InterviewResult = {
  status: SessionStatus;
  profile: Profile | null;
  transcript: Line[];
  report: Report | null;
  startedAt: number | null;
  endedAt: number | null;
};

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i: people retype these from an email
const code = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % ALPHABET.length]).join("");

/** Constant-time string compare, for the shared password and the agent's bearer secret. */
export function same(a: string, b: string) {
  const [x, y] = [new TextEncoder().encode(a), new TextEncoder().encode(b)];
  // timingSafeEqual is a Workers extension, missing from the DOM typings
  return x.byteLength === y.byteLength && (crypto.subtle as unknown as { timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean }).timingSafeEqual(x, y);
}

/** Validates the post form's interview section. Null when the poster didn't add one. */
/** `current`: the saved deadline when editing; leaving it as is skips the window checks. */
export function parseInterview(input: Record<string, unknown>, current?: number) {
  if (input.interview !== "on") return null;
  const questions = cleanQuestions(input.questions);
  const deadline = Number(input.deadline);
  if (!questions.length) throw new Fail("Add at least one interview question");
  if (current !== undefined && Math.abs(deadline - current) < 60_000) return { questions, deadline: current };
  if (!Number.isFinite(deadline) || deadline < Date.now() + 3_600_000) throw new Fail("Set the interview deadline at least an hour from now");
  if (deadline > Date.now() + 90 * 86_400_000) throw new Fail("The interview deadline must be within 90 days");
  return { questions, deadline };
}

export const insertInterview = (jobId: string, iv: { questions: string[]; deadline: number }) =>
  env.DB.prepare("INSERT INTO interviews (job_id, slug, password, questions, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(jobId, code(12), `${code(4)}-${code(4)}`, JSON.stringify(iv.questions), iv.deadline, Date.now());

const when = (ms: number) => `${new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Mails the interview link and password to a new applicant (Resend's REST API; the SDK adds nothing here).
 * Runs from the queue: throws on errors worth retrying (network, 429, 5xx); a rejected address is logged and dropped.
 */
export async function sendInvite(jobId: string, to: string) {
  const iv = await env.DB.prepare(
    "SELECT i.slug, i.password, i.deadline, i.questions, j.title, j.company FROM interviews i JOIN jobs j ON j.id = i.job_id WHERE i.job_id = ?",
  ).bind(jobId).first<{ slug: string; password: string; deadline: number; questions: string; title: string; company: string }>();
  if (!iv) return;
  const link = `${env.APP_URL}/interview/${iv.slug}`;
  const n = JSON.parse(iv.questions).length;
  const lines = [
    `Thanks for applying for ${iv.title} at ${iv.company}.`,
    `The next step is a short AI voice interview: ${n} question${n === 1 ? "" : "s"}, ${INTERVIEW.seconds / 60} minutes at most. Take it any time before ${when(iv.deadline)}.`,
    `Open ${link} and sign in with the email you applied with and this password: ${iv.password}`,
    "You'll need a quiet place and a microphone. Chrome, Edge or Safari work best.",
  ];
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:520px">
<p>${esc(lines[0])}</p><p>${esc(lines[1])}</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Start your interview</a></p>
<p>Password: <code style="font-size:16px;background:#f2f2f2;padding:2px 8px;border-radius:4px">${esc(iv.password)}</code><br>Use the email address this message was sent to.</p>
<p style="color:#666;font-size:13px">${esc(lines[3])}</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject: `Your voice interview for ${iv.title} at ${iv.company}`, html, text: lines.join("\n\n") }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return;
  const detail = await res.text().catch(() => "");
  if (res.status === 429 || res.status >= 500) throw new Error(`resend ${res.status}: ${detail}`);
  console.error("resend rejected", res.status, detail);
}

type IvRow = { job_id: string; slug: string; password: string; questions: string; deadline: number; title: string; company: string; description: string; poster_id: string; closed_at: number | null };
const interviewBySlug = (slug: string) =>
  env.DB.prepare("SELECT i.*, j.title, j.company, j.description, j.poster_id, j.closed_at FROM interviews i JOIN jobs j ON j.id = i.job_id WHERE i.slug = ?")
    .bind(slug).first<IvRow>();
const isOpen = (iv: IvRow) => iv.deadline > Date.now() && iv.closed_at === null;

type SessRow = { id: string; job_id: string; applicant_id: string; status: SessionStatus; profile: string | null; started_at: number | null };

export async function candidateView(slug: string, sessionId: string | undefined): Promise<CandidateView | null> {
  const iv = await interviewBySlug(slug);
  if (!iv) return null;
  const s = sessionId
    ? await env.DB.prepare(
        `SELECT s.status, s.profile, s.started_at, u.name, u.location, a.phone FROM interview_sessions s
         JOIN users u ON u.id = s.applicant_id
         JOIN applications a ON a.job_id = s.job_id AND a.applicant_id = s.applicant_id
         WHERE s.id = ? AND s.job_id = ?`,
      ).bind(sessionId, iv.job_id).first<{ status: SessionStatus; profile: string | null; started_at: number | null; name: string; location: string | null; phone: string | null }>()
    : null;
  return {
    slug, title: iv.title, company: iv.company, deadline: iv.deadline, questions: JSON.parse(iv.questions).length, open: isOpen(iv),
    session: s && {
      status: s.status,
      startedAt: s.started_at,
      prefill: s.profile ? JSON.parse(s.profile) : { name: s.name, city: s.location ?? "", phone: s.phone ?? "" },
    },
  };
}

/** Password gate: the shared password plus the email they applied with. Returns the session id (the cookie). */
export async function verifyCandidate(slug: string, email: string, password: string) {
  const iv = await interviewBySlug(slug);
  if (!iv) throw new Fail("This interview link isn't valid.");
  if (!isOpen(iv)) throw new Fail("This interview has closed.");
  const app = await env.DB.prepare("SELECT applicant_id FROM applications WHERE job_id = ? AND email = ? COLLATE NOCASE LIMIT 1")
    .bind(iv.job_id, email).first<string>("applicant_id");
  // One message for both, so the form can't be used to find out who applied
  if (!same(password.trim().toLowerCase(), iv.password) || !app) {
    throw new Fail("Email or password is incorrect. Use the email you applied with and the password from your invitation.");
  }
  await env.DB.prepare("INSERT OR IGNORE INTO interview_sessions (id, job_id, applicant_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(crypto.randomUUID(), iv.job_id, app, Date.now()).run();
  return (await env.DB.prepare("SELECT id FROM interview_sessions WHERE job_id = ? AND applicant_id = ?").bind(iv.job_id, app).first<string>("id"))!;
}

async function sessionFor(slug: string, sessionId: string | undefined) {
  const iv = await interviewBySlug(slug);
  const s = iv && sessionId
    ? await env.DB.prepare("SELECT * FROM interview_sessions WHERE id = ? AND job_id = ?").bind(sessionId, iv.job_id).first<SessRow>()
    : null;
  if (!iv || !s) throw new Fail("Your session expired. Reload the page and sign in again.");
  return { iv, s };
}

export async function saveProfile(slug: string, sessionId: string | undefined, profile: Profile) {
  const { s } = await sessionFor(slug, sessionId);
  const upd = await env.DB.prepare("UPDATE interview_sessions SET profile = ?, status = 'onboarded' WHERE id = ? AND status IN ('verified', 'onboarded')")
    .bind(JSON.stringify(profile), s.id).run();
  if (!upd.meta.changes) throw new Fail("You've already started this interview.");
}

/** Checks the candidate may (re)join now and builds the agent's job metadata. */
async function attempt(slug: string, sessionId: string | undefined) {
  const { iv, s } = await sessionFor(slug, sessionId);
  const now = Date.now();
  if (s.status === "live" && s.started_at! + INTERVIEW.seconds * 1000 < now) throw new Fail("Your interview time is over.");
  if (s.status !== "onboarded" && s.status !== "live") throw new Fail(s.status === "verified" ? "Fill in your details first." : "You've already completed this interview.");
  if (s.status === "onboarded" && !isOpen(iv)) throw new Fail("This interview has closed.");
  const startedAt = s.started_at ?? now;
  const profile = JSON.parse(s.profile!) as Profile;
  const seconds = INTERVIEW.seconds - Math.floor((now - startedAt) / 1000);
  const metadata = JSON.stringify({
    sessionId: s.id,
    seconds,
    job: { title: iv.title, company: iv.company, description: iv.description.slice(0, 2000) },
    candidate: profile,
    questions: JSON.parse(iv.questions),
  });
  return { s, profile, startedAt, seconds, metadata };
}

/**
 * Marks the attempt live and returns a LiveKit token whose room config dispatches the interview agent with
 * everything it needs as job metadata. Rejoining within the time limit reuses the room (and the agent in it).
 * `seconds` is what's left of the call; the page counts it down from when the interviewer is actually there.
 */
export async function startInterview(slug: string, sessionId: string | undefined) {
  const { s, profile, startedAt, seconds, metadata } = await attempt(slug, sessionId);
  await env.DB.prepare("UPDATE interview_sessions SET status = 'live', started_at = ? WHERE id = ?").bind(startedAt, s.id).run();
  const token = await livekitToken({
    sub: s.id, name: profile.name,
    video: { room: s.id, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    roomConfig: { agents: [{ agentName: env.LIVEKIT_AGENT_NAME, metadata }] },
  });
  return { url: env.LIVEKIT_URL, token, seconds };
}

/**
 * Sends the agent into the candidate's room while they check their mic, so its cold start (10-20 s on LiveKit's
 * Build plan) and setup are over by the time they press Start. It waits there for them. The token's dispatch only
 * fires when the call creates the room, so this never doubles up; a room that already has an agent is left alone.
 */
export async function warmInterview(slug: string, sessionId: string | undefined) {
  const { s, metadata } = await attempt(slug, sessionId);
  const auth = `Bearer ${await livekitToken({ video: { room: s.id, roomAdmin: true } })}`;
  const api = async (method: string, body: object) => {
    const res = await fetch(`${env.LIVEKIT_URL.replace(/^ws/, "http")}/twirp/livekit.AgentDispatchService/${method}`, {
      method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.status === 404) return {}; // ListDispatch on a room that doesn't exist yet
    if (!res.ok) throw new Error(`LiveKit ${method}: ${res.status} ${await res.text()}`);
    return (await res.json()) as { agent_dispatches?: { agent_name: string }[] };
  };
  const { agent_dispatches = [] } = await api("ListDispatch", { room: s.id });
  if (!agent_dispatches.some((d) => d.agent_name === env.LIVEKIT_AGENT_NAME)) {
    await api("CreateDispatch", { room: s.id, agent_name: env.LIVEKIT_AGENT_NAME, metadata });
  }
}

/** LiveKit access token: an HS256 JWT signed with the project secret (same claims as the server SDK, no dependency). */
async function livekitToken(claims: Record<string, unknown>) {
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const json = (o: object) => b64(new TextEncoder().encode(JSON.stringify(o)));
  const now = Math.floor(Date.now() / 1000);
  const body = `${json({ alg: "HS256", typ: "JWT" })}.${json({ iss: env.LIVEKIT_API_KEY, nbf: now, exp: now + 900, ...claims })}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))))}`;
}

/** The agent's end-of-call report (caller checked its secret). False for a repeat post. */
export async function acceptTranscript(sessionId: string, transcript: Line[]) {
  const upd = await env.DB.prepare("UPDATE interview_sessions SET status = 'processing', transcript = ?, ended_at = ? WHERE id = ? AND status = 'live'")
    .bind(JSON.stringify(transcript), Date.now(), sessionId).run();
  return upd.meta.changes > 0;
}

const JUDGE = `You are a fair, experienced hiring manager reviewing a short AI-led voice screening interview.
You get the job description, the interview questions (in the order asked) and the transcript (speech-to-text, so ignore
small transcription errors and filler words). Judge only what the candidate actually said. Reply with ONLY one JSON object:
{
  "score": 0-100 overall,
  "fit": "strong" | "moderate" | "weak" (fit for THIS job description),
  "summary": "3-4 sentences: how the interview went and why this fit verdict",
  "strengths": ["up to 4 short points"],
  "concerns": ["up to 4 short points"]
}
Weigh every interview question; an unanswered one counts against the candidate. Never invent answers. A candidate who ran out of time is judged on what they covered.`;

/**
 * Bedrock grades the transcript. When Bedrock is busy and this isn't the `final` try, throws so the queue retries later;
 * otherwise a failure is stored as "failed" (transcript kept) and the poster can retry.
 */
export async function evaluate(sessionId: string, final = true) {
  const r = await env.DB.prepare(
    `SELECT s.transcript, s.job_id, s.applicant_id, i.questions, j.title, j.company, j.description, j.poster_id
     FROM interview_sessions s JOIN interviews i ON i.job_id = s.job_id JOIN jobs j ON j.id = s.job_id WHERE s.id = ?`,
  ).bind(sessionId).first<{ transcript: string; job_id: string; applicant_id: string; questions: string; title: string; company: string; description: string; poster_id: string }>();
  if (!r) return;
  const questions = JSON.parse(r.questions) as string[];
  const transcript = JSON.parse(r.transcript ?? "[]") as Line[];
  let report: Report | null;
  if (!transcript.some((l) => l.role === "candidate")) {
    report = cleanReport({ score: 0, fit: "weak", summary: "The candidate joined but didn't answer any questions." });
  } else {
    const out = await bedrockJson(
      JUDGE,
      `Job: ${r.title} at ${r.company}\n\nJob description:\n${r.description.slice(0, 6000)}\n\nInterview questions:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nTranscript:\n${transcript.map((l) => `${l.role === "agent" ? "Interviewer" : "Candidate"}: ${l.text}`).join("\n")}`,
      4000,
    );
    if (!out.ok && out.reason === "busy" && !final) throw new Error(`evaluate ${sessionId}: bedrock busy`);
    report = out.ok ? cleanReport(out.value) : null;
  }
  await env.DB.prepare("UPDATE interview_sessions SET status = ?, report = ?, score = ? WHERE id = ?")
    .bind(report ? "done" : "failed", report && JSON.stringify(report), report?.score ?? null, sessionId).run();
  // The poster's open applicant list refetches on this
  const status = await env.DB.prepare("SELECT status FROM applications WHERE job_id = ? AND applicant_id = ?").bind(r.job_id, r.applicant_id).first<"submitted">("status");
  if (status) sendTo(r.poster_id, { t: "app", jobId: r.job_id, applicantId: r.applicant_id, status });
}

/** Full result for the poster, or null if they don't own the job. */
export async function interviewResult(posterId: string, jobId: string, applicantId: string): Promise<InterviewResult | null> {
  const s = await env.DB.prepare(
    `SELECT s.* FROM interview_sessions s JOIN jobs j ON j.id = s.job_id AND j.poster_id = ?1 WHERE s.job_id = ?2 AND s.applicant_id = ?3`,
  ).bind(posterId, jobId, applicantId).first<SessRow & { transcript: string | null; report: string | null; ended_at: number | null }>();
  if (!s) return null;
  const parse = <T,>(v: string | null) => (v ? (JSON.parse(v) as T) : null);
  return { status: s.status, profile: parse(s.profile), transcript: parse(s.transcript) ?? [], report: parse(s.report), startedAt: s.started_at, endedAt: s.ended_at };
}

/** Poster retries a failed evaluation. */
export async function retryEvaluation(posterId: string, jobId: string, applicantId: string) {
  const s = await env.DB.prepare(
    `UPDATE interview_sessions SET status = 'processing' WHERE job_id = ?2 AND applicant_id = ?3 AND status = 'failed'
     AND EXISTS (SELECT 1 FROM jobs WHERE id = ?2 AND poster_id = ?1) RETURNING id`,
  ).bind(posterId, jobId, applicantId).first<string>("id");
  if (s) await evaluate(s);
}

/**
 * Cron: jobs whose interview deadline passed stop taking applications, and gradings still "processing" an hour after
 * the call (their queue message ended up in the DLQ) become "failed" so the poster sees a Retry button instead of a spinner.
 */
export async function closeExpired() {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("UPDATE jobs SET closed_at = ?1 WHERE closed_at IS NULL AND id IN (SELECT job_id FROM interviews WHERE deadline <= ?1)").bind(now),
    env.DB.prepare("UPDATE interview_sessions SET status = 'failed' WHERE status = 'processing' AND ended_at < ?").bind(now - 3_600_000),
  ]);
}
