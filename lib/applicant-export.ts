import { env } from "cloudflare:workers";
import { strToU8, zipSync } from "fflate";
import { FITS, KINDS, type Kind, type Report } from "./interview-fields.ts";
import { STATUSES, type AppStatus } from "./job-fields.ts";
import { getResume } from "./resume.ts";
import { drawResume, pdfWriter } from "./resume-pdf.ts";
import { cleanResume, fmtRange, STATUSES as CAREER, type Resume } from "./resume-fields.ts";

/** One applicant who finished screening: the profile they sent plus the verdict. Never the transcript. */
export type Completed = { id: string; email: string; phone: string | null; status: AppStatus; at: number; kind: Kind; report: Report; profile: Resume };

/** The poster's completed applicants for a job, best score first. Null when the viewer didn't post it. */
export async function completedApplicants(posterId: string, jobId: string): Promise<{ title: string; company: string; list: Completed[] } | null> {
  const job = await env.DB.prepare("SELECT title, company FROM jobs WHERE id = ? AND poster_id = ?").bind(jobId, posterId).first<{ title: string; company: string }>();
  if (!job) return null;
  const { results } = await env.DB.prepare(
    `SELECT a.applicant_id, a.email, a.phone, a.status, a.created_at, a.profile, i.kind, s.report
     FROM applications a
     JOIN interview_sessions s ON s.job_id = a.job_id AND s.applicant_id = a.applicant_id AND s.status = 'done'
     JOIN interviews i ON i.job_id = a.job_id
     WHERE a.job_id = ? ORDER BY s.score DESC LIMIT 500`,
  ).bind(jobId).all<{ applicant_id: string; email: string; phone: string | null; status: AppStatus; created_at: number; profile: string | null; kind: Kind; report: string | null }>();
  const list = await Promise.all(results.filter((r) => r.report).map(async (r) => ({
    id: r.applicant_id, email: r.email, phone: r.phone, status: r.status, at: r.created_at, kind: r.kind,
    report: JSON.parse(r.report!) as Report,
    // Applications from before profiles were sent fall back to the current profile (like the applicant page)
    profile: (r.profile ? cleanResume(JSON.parse(r.profile)) : await getResume(r.applicant_id)) ?? cleanResume({}),
  })));
  return { ...job, list };
}

const date = (t: number) => new Date(t).toISOString().slice(0, 10);
const appStatus = (s: AppStatus) => (s === "submitted" ? "Under review" : STATUSES[s]);
const current = (r: Resume) => r.experience.find((e) => e.current) ?? r.experience[0];

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote everything; a leading = + - @ would run as a formula in Excel
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export function toCsv(list: Completed[], origin: string) {
  const head = ["Name", "Email", "Phone", "Headline", "City", "Career status", "Current role", "Skills", "Applied", "Application status", "Screening", "Score", "Verdict", "Summary", "Strengths", "Concerns", "Profile"];
  const rows = list.map(({ profile: p, report: v, ...a }) => {
    const c = current(p);
    return [
      p.name, a.email, a.phone ?? "", p.headline, p.city, CAREER[p.status], c ? `${c.title} at ${c.company}` : "", p.skills.join(", "),
      date(a.at), appStatus(a.status), KINDS[a.kind], v.score, FITS[v.fit], v.summary, v.strengths.join("; "), v.concerns.join("; "), `${origin}/in/${a.id}`,
    ];
  });
  // BOM so Excel reads UTF-8
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** One section per candidate: their resume, then the application and verdict. */
export async function toPdf(list: Completed[], title: string) {
  const w = await pdfWriter(title, "Hire Excellence");
  list.forEach((a, i) => {
    if (i) w.newPage();
    drawResume(w, { ...a.profile, email: a.email, phone: a.phone ?? "" });
    w.section("Application");
    w.write(`Applied ${date(a.at)}   ·   ${appStatus(a.status)}`, { size: 10, color: w.SOFT });
    w.section(`${KINDS[a.kind]} verdict`);
    w.row(`${a.report.score}/100   ·   ${FITS[a.report.fit]}`, "");
    if (a.report.summary) w.write(a.report.summary, { size: 10, color: w.SOFT });
    if (a.report.strengths.length) { w.write("Strengths", { f: w.bold, size: 10 }); w.bullets(a.report.strengths.join("\n")); }
    if (a.report.concerns.length) { w.write("Concerns", { f: w.bold, size: 10 }); w.bullets(a.report.concerns.join("\n")); }
  });
  return w.doc.save();
}

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const run = (text: string, { b = false, size = 20, grey = false } = {}) =>
  `<w:r><w:rPr>${b ? "<w:b/>" : ""}${grey ? '<w:color w:val="606060"/>' : ""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (text: string, o: Parameters<typeof run>[1] & { before?: number } = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="60"/></w:pPr>${run(text, o)}</w:p>`;
const heading = (text: string) => para(text.toUpperCase(), { b: true, size: 20, before: 200 });
const bullet = (text: string) => para(`•  ${text}`, { grey: true });
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** A minimal .docx (Word, Google Docs, Pages all open it): same content as the PDF. */
export function toDocx(list: Completed[]) {
  const body = list.map(({ profile: p, report: v, ...a }, i) => [
    i ? pageBreak : "",
    para(p.name, { b: true, size: 36 }),
    p.headline && para(p.headline, { grey: true, size: 22 }),
    para([a.email, a.phone, p.city].filter(Boolean).join("   ·   "), { grey: true }),
    heading(`${KINDS[a.kind]} verdict`),
    para(`${v.score}/100   ·   ${FITS[v.fit]}`, { b: true }),
    v.summary && para(v.summary, { grey: true }),
    v.strengths.length && para("Strengths", { b: true }) + v.strengths.map(bullet).join(""),
    v.concerns.length && para("Concerns", { b: true }) + v.concerns.map(bullet).join(""),
    heading("Application"),
    para(`Applied ${date(a.at)}   ·   ${appStatus(a.status)}`, { grey: true }),
    p.summary && heading("Summary") + para(p.summary, { grey: true }),
    p.experience.length && heading("Experience") + p.experience.map((e) =>
      para(`${e.title} — ${e.company}`, { b: true, before: 80 }) + para([fmtRange(e.start, e.end, e.current), e.location].filter(Boolean).join("   ·   "), { grey: true })).join(""),
    p.education.length && heading("Education") + p.education.map((e) =>
      para(e.school, { b: true, before: 80 }) + para([[e.degree, e.field].filter(Boolean).join(", "), e.grade, fmtRange(e.start, e.end)].filter(Boolean).join("   ·   "), { grey: true })).join(""),
    p.skills.length && heading("Skills") + para(p.skills.join(", "), { grey: true }),
  ].filter(Boolean).join("")).join("");

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:body></w:document>`),
  });
}
