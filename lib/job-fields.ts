/** Job field options shared by the forms (labels) and the server (allowlists). Keys match the SQL CHECKs. */
export const WORKPLACES = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" } as const;
export const JOB_TYPES = { "full-time": "Full-time", "part-time": "Part-time", contract: "Contract", temporary: "Temporary", internship: "Internship" } as const;
export const LEVELS = { internship: "Internship", entry: "Entry level", associate: "Associate", "mid-senior": "Mid-Senior level", director: "Director", executive: "Executive" } as const;
export const POSTED = { day: "Past 24 hours", week: "Past week", month: "Past month" } as const;
export const STATUSES = { submitted: "Submitted", viewed: "Viewed", shortlisted: "Shortlisted", rejected: "Not selected" } as const;
/** Completed-applicant downloads (app/api/jobs/[id]/export). */
export const EXPORT_FORMATS = { csv: "CSV", pdf: "PDF", docx: "Word" } as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;

export type Workplace = keyof typeof WORKPLACES;
export type JobType = keyof typeof JOB_TYPES;
export type Level = keyof typeof LEVELS;
export type AppStatus = keyof typeof STATUSES;

export type JobFilters = { q?: string; loc?: string; workplace?: Workplace; type?: JobType; level?: Level; posted?: keyof typeof POSTED };
export type MyJobsTab = "saved" | "applied" | "posted";

export const LIMITS = { title: 120, company: 100, location: 100, salary: 60, description: 8000, note: 1500, email: 254, phone: 30 };
export const RESUME_TYPE = "application/pdf";
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Keep only filters with a known value, so they can come straight from a URL or a client. */
export function cleanFilters(input: Record<string, unknown>): JobFilters {
  const pick = <T extends object>(opts: T, v: unknown) => (typeof v === "string" && Object.hasOwn(opts, v) ? (v as keyof T) : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined);
  return {
    q: str(input.q),
    loc: str(input.loc),
    workplace: pick(WORKPLACES, input.workplace),
    type: pick(JOB_TYPES, input.type),
    level: pick(LEVELS, input.level),
    posted: pick(POSTED, input.posted),
  };
}
