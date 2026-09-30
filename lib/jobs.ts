import { env } from "cloudflare:workers";
import type { SessionStatus } from "./interview";
import type { Fit } from "./interview-fields";
import type { AppStatus, JobFilters, JobType, Level, MyJobsTab, Workplace } from "./job-fields";

/** A job as one viewer sees it: whether they saved it, applied (and where that stands), or posted it. */
export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  workplace: Workplace;
  type: JobType;
  level: Level;
  salary: string | null;
  description: string;
  applicants: number;
  createdAt: number;
  closedAt: number | null;
  poster: { id: string; name: string; imageUrl: string | null; headline: string | null };
  saved: boolean;
  application: { status: AppStatus; at: number } | null;
  /** Voice interview. Link and password only for the poster and applicants; `status` is the viewer's own attempt. */
  interview: { deadline: number; questions: number; slug: string | null; password: string | null; status: SessionStatus | null } | null;
};
export type JobPage = { jobs: Job[]; next: string | null };

export type Applicant = {
  id: string;
  name: string;
  imageUrl: string | null;
  headline: string | null;
  email: string;
  phone: string | null;
  resumeKey: string;
  note: string | null;
  status: AppStatus;
  at: number;
  interview: { status: SessionStatus; score: number | null; fit: Fit | null } | null;
};

type Row = {
  id: string; poster_id: string; title: string; company: string; location: string; workplace: Workplace; type: JobType; level: Level;
  salary: string | null; description: string; applicant_count: number; closed_at: number | null; created_at: number;
  name: string; image_url: string | null; headline: string | null; saved: number; app_status: AppStatus | null; applied_at: number | null;
  iv_deadline: number | null; iv_questions: number | null; iv_slug: string | null; iv_password: string | null; iv_status: SessionStatus | null;
};

const PAGE = 20;
const DAY = 86_400_000;
const POSTED_DAYS = { day: 1, week: 7, month: 30 };

// ?1 is always the viewer
const SELECT = `
  SELECT j.*, u.name, u.image_url, u.headline, a.status AS app_status, a.created_at AS applied_at,
         EXISTS (SELECT 1 FROM saved_jobs s WHERE s.user_id = ?1 AND s.job_id = j.id) AS saved,
         i.deadline AS iv_deadline, json_array_length(i.questions) AS iv_questions, ivs.status AS iv_status,
         CASE WHEN j.poster_id = ?1 OR a.applicant_id IS NOT NULL THEN i.slug END AS iv_slug,
         CASE WHEN j.poster_id = ?1 OR a.applicant_id IS NOT NULL THEN i.password END AS iv_password
  FROM jobs j
  JOIN users u ON u.id = j.poster_id
  LEFT JOIN applications a ON a.job_id = j.id AND a.applicant_id = ?1
  LEFT JOIN interviews i ON i.job_id = j.id
  LEFT JOIN interview_sessions ivs ON ivs.job_id = j.id AND ivs.applicant_id = ?1`;

const toJob = (r: Row): Job => ({
  id: r.id, title: r.title, company: r.company, location: r.location, workplace: r.workplace, type: r.type, level: r.level,
  salary: r.salary, description: r.description, applicants: r.applicant_count, createdAt: r.created_at, closedAt: r.closed_at,
  poster: { id: r.poster_id, name: r.name, imageUrl: r.image_url, headline: r.headline },
  saved: !!r.saved,
  application: r.app_status ? { status: r.app_status, at: r.applied_at! } : null,
  interview: r.iv_deadline === null ? null : { deadline: r.iv_deadline, questions: r.iv_questions ?? 0, slug: r.iv_slug, password: r.iv_password, status: r.iv_status },
});

const like = (s: string) => `%${s.replace(/[!%_]/g, "!$&")}%`;

/**
 * Open jobs, newest first, narrowed by LinkedIn's core filters. Cursor = "createdAt:id".
 * ponytail: keyword search is LIKE over title/company/description (a scan once filters stop narrowing);
 * move to an FTS5 table with relevance ranking when listings reach the tens of thousands.
 */
export async function searchJobs(viewerId: string, f: JobFilters, cursor?: string): Promise<JobPage> {
  const [at, id] = cursor ? [Number(cursor.split(":")[0]), cursor.split(":")[1] ?? ""] : [Number.MAX_SAFE_INTEGER, ""];
  const binds: unknown[] = [viewerId, at, id || "￿"];
  const p = (v: unknown) => `?${binds.push(v)}`;
  const where = ["j.closed_at IS NULL", "(j.created_at, j.id) < (?2, ?3)"];
  if (f.q) {
    const q = p(like(f.q));
    where.push(`(j.title LIKE ${q} ESCAPE '!' OR j.company LIKE ${q} ESCAPE '!' OR j.description LIKE ${q} ESCAPE '!')`);
  }
  if (f.loc) where.push(`j.location LIKE ${p(like(f.loc))} ESCAPE '!'`);
  if (f.workplace) where.push(`j.workplace = ${p(f.workplace)}`);
  if (f.type) where.push(`j.type = ${p(f.type)}`);
  if (f.level) where.push(`j.level = ${p(f.level)}`);
  if (f.posted) where.push(`j.created_at > ${p(Date.now() - POSTED_DAYS[f.posted] * DAY)}`);

  const { results } = await env.DB.prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY j.created_at DESC, j.id DESC LIMIT ${PAGE}`)
    .bind(...binds).all<Row>();
  const jobs = results.map(toJob);
  const last = jobs.at(-1);
  return { jobs, next: jobs.length === PAGE && last ? `${last.createdAt}:${last.id}` : null };
}

/** Saved, applied or posted jobs, including closed ones. ponytail: newest 100 each; page when someone gets there. */
export async function myJobs(viewerId: string, tab: MyJobsTab): Promise<Job[]> {
  const sql = {
    saved: `${SELECT} JOIN saved_jobs s ON s.job_id = j.id AND s.user_id = ?1 ORDER BY s.created_at DESC`,
    applied: `${SELECT} WHERE a.applicant_id IS NOT NULL ORDER BY a.created_at DESC`,
    posted: `${SELECT} WHERE j.poster_id = ?1 ORDER BY j.created_at DESC`,
  }[tab];
  const { results } = await env.DB.prepare(`${sql} LIMIT 100`).bind(viewerId).all<Row>();
  return results.map(toJob);
}

export async function getJob(viewerId: string, id: string) {
  const row = await env.DB.prepare(`${SELECT} WHERE j.id = ?2`).bind(viewerId, id).first<Row>();
  return row && toJob(row);
}

/** Only the poster sees applicants. */
export async function getApplicants(posterId: string, jobId: string): Promise<Applicant[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.*, u.name, u.image_url, u.headline, s.status AS iv_status, s.score AS iv_score, s.report ->> '$.fit' AS iv_fit
     FROM applications a
     JOIN jobs j ON j.id = a.job_id AND j.poster_id = ?1
     JOIN users u ON u.id = a.applicant_id
     LEFT JOIN interview_sessions s ON s.job_id = a.job_id AND s.applicant_id = a.applicant_id
     WHERE a.job_id = ?2 ORDER BY a.created_at DESC LIMIT 500`,
  ).bind(posterId, jobId).all<{
    applicant_id: string; name: string; image_url: string | null; headline: string | null; email: string; phone: string | null;
    resume_key: string; note: string | null; status: AppStatus; created_at: number;
    iv_status: SessionStatus | null; iv_score: number | null; iv_fit: Fit | null;
  }>();
  return results.map((r) => ({
    id: r.applicant_id, name: r.name, imageUrl: r.image_url, headline: r.headline, email: r.email, phone: r.phone,
    resumeKey: r.resume_key, note: r.note, status: r.status, at: r.created_at,
    interview: r.iv_status ? { status: r.iv_status, score: r.iv_score, fit: r.iv_fit } : null,
  }));
}

/** Contact details and resume from the viewer's last application, to prefill the next one. */
export async function lastApplication(viewerId: string) {
  return env.DB.prepare("SELECT email, phone, resume_key AS resumeKey FROM applications WHERE applicant_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(viewerId).first<{ email: string; phone: string | null; resumeKey: string }>();
}

/** What the signed-out share page (/job/<id>) may show: the listing and who posted it, never interview credentials or applicant data. */
export type PublicJob = Pick<Job, "id" | "title" | "company" | "location" | "workplace" | "type" | "level" | "salary" | "description" | "createdAt" | "closedAt"> & {
  poster: { name: string; headline: string | null };
};

export async function getPublicJob(id: string): Promise<PublicJob | null> {
  const j = await getJob("", id);
  if (!j) return null;
  const { title, company, location, workplace, type, level, salary, description, createdAt, closedAt } = j;
  return { id: j.id, title, company, location, workplace, type, level, salary, description, createdAt, closedAt, poster: { name: j.poster.name, headline: j.poster.headline } };
}
