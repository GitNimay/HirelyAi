/** Resume shape, limits and validation shared by the forms, the AI extractor and the server. Pure, so it also runs under `npm test`. */

export const STATUSES = { student: "Student", fresher: "Fresher", working: "Working professional" } as const;
export type Status = keyof typeof STATUSES;

/** `companyId`: the company page this links to (shows its logo); without one, `company` is just text. */
export type Experience = { title: string; company: string; companyId?: string; location: string; start: string; end: string; current: boolean; description: string };
export type Education = { school: string; degree: string; field: string; start: string; end: string; grade: string };
export type Project = { name: string; link: string; description: string };

/** Dates are "YYYY-MM" (what <input type="month"> uses) or "". */
export type Resume = {
  name: string;
  headline: string;
  city: string;
  email: string;
  phone: string;
  status: Status;
  summary: string;
  experience: Experience[];
  education: Education[];
  projects: Project[];
  skills: string[];
  preferredLocations: string[];
};

export const LIMITS = { short: 100, headline: 120, summary: 1500, description: 2000, link: 200, list: 15, skills: 50, locations: 10 };
export const MAX_RESUME_PDF_BYTES = 5 * 1024 * 1024;

export const emptyExperience = (): Experience => ({ title: "", company: "", location: "", start: "", end: "", current: false, description: "" });
export const emptyEducation = (): Education => ({ school: "", degree: "", field: "", start: "", end: "", grade: "" });
export const emptyProject = (): Project => ({ name: "", link: "", description: "" });
export const emptyResume = (): Resume => ({
  name: "", headline: "", city: "", email: "", phone: "", status: "fresher", summary: "",
  experience: [], education: [], projects: [], skills: [], preferredLocations: [],
});

const str = (v: unknown, max: number) => (typeof v === "string" || typeof v === "number" ? String(v).trim().replace(/\s+\n/g, "\n").slice(0, max) : "");
const line = (v: unknown, max = LIMITS.short) => str(v, max).replace(/\s+/g, " ");
const month = (v: unknown) => {
  const m = line(v).match(/^(\d{4})(?:-(\d{1,2}))?/);
  if (!m) return "";
  const mm = Math.min(Math.max(Number(m[2] ?? 1), 1), 12);
  return `${m[1]}-${String(mm).padStart(2, "0")}`;
};
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
/** Unique (case-insensitive), non-empty. Accepts an array or a comma-separated string. */
const tags = (v: unknown, max: number) => {
  const seen = new Set<string>();
  return (typeof v === "string" ? v.split(",") : arr(v))
    .map((t) => line(t, 60))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
    .slice(0, max);
};
const filled = (o: object) => Object.values(o).some((x) => typeof x === "string" && x);

/**
 * Coerce anything (a form, a model's JSON, an old row) into a valid Resume: trims, clamps lengths,
 * normalises dates and drops entries that are completely empty. Never throws.
 */
export function cleanResume(input: unknown): Resume {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const status = typeof o.status === "string" && Object.hasOwn(STATUSES, o.status) ? (o.status as Status) : "fresher";
  const experience = arr(o.experience).slice(0, LIMITS.list).map((e): Experience => {
    const current = e?.current === true || /present|current|now/i.test(String(e?.end ?? ""));
    const companyId = line(e?.companyId, 40);
    return {
      title: line(e?.title), company: line(e?.company), ...(companyId && { companyId }), location: line(e?.location),
      start: month(e?.start), end: current ? "" : month(e?.end), current, description: str(e?.description, LIMITS.description),
    };
  }).filter(filled);
  const education = arr(o.education).slice(0, LIMITS.list).map((e): Education => ({
    school: line(e?.school), degree: line(e?.degree), field: line(e?.field), start: month(e?.start), end: month(e?.end), grade: line(e?.grade, 30),
  })).filter(filled);
  const projects = arr(o.projects).slice(0, LIMITS.list).map((p): Project => ({
    name: line(p?.name), link: line(p?.link, LIMITS.link), description: str(p?.description, LIMITS.description),
  })).filter(filled);
  return {
    name: line(o.name, 50), headline: line(o.headline, LIMITS.headline), city: line(o.city, 60), email: line(o.email, 254), phone: line(o.phone, 30),
    status, summary: str(o.summary, LIMITS.summary), experience, education, projects,
    skills: tags(o.skills, LIMITS.skills), preferredLocations: tags(o.preferredLocations, LIMITS.locations),
  };
}

/** Fill only the blanks of `base` from `extra` (what the member typed wins over what the AI found). */
export function mergeResume(base: Resume, extra: Resume): Resume {
  const out = { ...base };
  for (const k of Object.keys(out) as (keyof Resume)[]) {
    const cur = out[k];
    if (k !== "status" && (Array.isArray(cur) ? cur.length === 0 : !cur)) (out as Record<string, unknown>)[k] = extra[k];
  }
  return out;
}

export const validPhone = (p: string) => /^\+?[\d\s().-]+$/.test(p) && (p.match(/\d/g)?.length ?? 0) >= 7 && (p.match(/\d/g)?.length ?? 0) <= 15;
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * What still needs the member's attention, as field paths the form highlights:
 * "name", "skills", "experience", "experience.0.title", ... Empty means ready to save.
 */
export function missingFields(r: Resume): string[] {
  const miss: string[] = [];
  if (!r.name) miss.push("name");
  if (!validPhone(r.phone)) miss.push("phone");
  if (!validEmail(r.email)) miss.push("email");
  if (!r.city) miss.push("city");
  if (!r.skills.length) miss.push("skills");
  if (!r.preferredLocations.length) miss.push("preferredLocations");
  if (!r.education.length) miss.push("education");
  if (r.status === "working" && !r.experience.length) miss.push("experience");
  r.experience.forEach((e, i) => {
    if (!e.title) miss.push(`experience.${i}.title`);
    if (!e.company) miss.push(`experience.${i}.company`);
    if (!e.start) miss.push(`experience.${i}.start`);
    if (e.end && e.start && e.end < e.start) miss.push(`experience.${i}.end`);
  });
  r.education.forEach((e, i) => {
    if (!e.school) miss.push(`education.${i}.school`);
    if (!e.degree) miss.push(`education.${i}.degree`);
  });
  r.projects.forEach((p, i) => !p.name && miss.push(`projects.${i}.name`));
  return miss;
}

/** "2023-04" → "Apr 2023" */
export const fmtMonth = (m: string) => {
  if (!m) return "";
  const [y, mm] = m.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mm - 1] ?? ""} ${y}`.trim();
};
export const fmtRange = (start: string, end: string, current = false) =>
  [fmtMonth(start), current ? "Present" : fmtMonth(end)].filter(Boolean).join(" – ");

/** A headline from the resume when the member didn't write one: "Frontend Engineer at Acme", or "Student at IIT Bombay". */
export function autoHeadline(r: Resume) {
  if (r.headline) return r.headline;
  const job = r.experience.find((e) => e.current) ?? r.experience[0];
  if (r.status === "working" && job) return `${job.title} at ${job.company}`;
  const edu = r.education[0];
  if (r.status === "student" && edu) return `Student at ${edu.school}`;
  return job ? `${job.title} at ${job.company}` : "";
}
