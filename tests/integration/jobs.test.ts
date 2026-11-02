import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  applicationProfile,
  companyJobs,
  getApplicants,
  getJob,
  getPublicJob,
  jobQuestions,
  lastApplication,
  myJobs,
  searchJobs,
} from "@/lib/jobs";
import { cleanFilters } from "@/lib/job-fields";
import { company, job, uid, user, verifyWorkEmail } from "./factories";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ sendEach: vi.fn(), sendTo: vi.fn(), broadcast: vi.fn() }));

const DAY = 86_400_000;

async function apply(jobId: string, applicantId: string, over: { at?: number; profile?: object } = {}) {
  await env.DB.prepare(
    "INSERT INTO applications (job_id, applicant_id, email, phone, profile, created_at, updated_at) VALUES (?, ?, ?, '+91 98765 43210', ?, ?, ?)",
  )
    .bind(
      jobId,
      applicantId,
      `${applicantId}@mail.test`,
      over.profile ? JSON.stringify(over.profile) : null,
      over.at ?? Date.now(),
      Date.now(),
    )
    .run();
}

async function withScreening(jobId: string) {
  await env.DB.prepare(
    "INSERT INTO interviews (job_id, slug, password, questions, deadline, created_at, kind) VALUES (?, ?, 'secret-code', ?, ?, ?, 'voice')",
  )
    .bind(jobId, uid("iv"), JSON.stringify(["Why us?", "Tell me about a project"]), Date.now() + DAY, Date.now())
    .run();
}

/** A job whose title only this test uses, so searches see nothing from other tests. */
async function tagged(poster: string, extra: Record<string, unknown> = {}) {
  const tag = uid("t").replace("_", "");
  const id = await job(poster, { title: `${tag} Engineer` });
  if (Object.keys(extra).length)
    await env.DB.prepare(
      `UPDATE jobs SET ${Object.keys(extra)
        .map((k) => `${k} = ?`)
        .join(", ")} WHERE id = ?`,
    )
      .bind(...Object.values(extra), id)
      .run();
  return { id, tag };
}

describe("searchJobs", () => {
  it("matches the keyword in title, company or description, and only open jobs", async () => {
    const poster = await user();
    const { id, tag } = await tagged(poster);
    const closed = await job(poster, { title: `${tag} Closed`, closed: true });

    const ids = (await searchJobs(poster, cleanFilters({ q: tag }))).jobs.map((j) => j.id);
    expect(ids).toEqual([id]);
    expect(ids).not.toContain(closed);
  });

  it("treats % and _ in the keyword literally", async () => {
    const poster = await user();
    const { tag } = await tagged(poster);
    expect((await searchJobs(poster, cleanFilters({ q: `${tag}%` }))).jobs).toEqual([]);
    expect((await searchJobs(poster, cleanFilters({ q: `${tag.slice(0, -1)}_` }))).jobs).toEqual([]);
  });

  it("narrows by workplace, type, level, location and posting date", async () => {
    const poster = await user();
    const { id, tag } = await tagged(poster, {
      workplace: "hybrid",
      type: "contract",
      level: "director",
      location: "Pune, India",
    });
    const { id: old } = await tagged(poster, { created_at: Date.now() - 10 * DAY });
    const q = (f: Record<string, string>) =>
      searchJobs(poster, cleanFilters({ q: tag, ...f })).then((r) => r.jobs.map((j) => j.id));

    expect(await q({ workplace: "hybrid", type: "contract", level: "director", loc: "pune" })).toEqual([id]);
    expect(await q({ workplace: "remote" })).toEqual([]);
    expect(await q({ posted: "week" })).toEqual([id]);
    expect(
      await searchJobs(poster, cleanFilters({ posted: "week" })).then((r) => r.jobs.map((j) => j.id)),
    ).not.toContain(old);
  });

  it("pages newest first with a cursor", async () => {
    const poster = await user();
    const tag = uid("page").replace("_", "");
    for (let i = 0; i < 21; i++) {
      const id = await job(poster, { title: `${tag} ${i}` });
      await env.DB.prepare("UPDATE jobs SET created_at = ? WHERE id = ?")
        .bind(Date.now() - i * 1000, id)
        .run();
    }
    const first = await searchJobs(poster, cleanFilters({ q: tag }));
    expect(first.jobs).toHaveLength(20);
    const second = await searchJobs(poster, cleanFilters({ q: tag }), first.next!);
    expect(second.jobs).toHaveLength(1);
    expect(second.next).toBeNull();
    expect(new Set([...first.jobs, ...second.jobs].map((j) => j.id)).size).toBe(21);
  });
});

describe("screening credentials", () => {
  it("show the link and password to the poster and applicants only", async () => {
    const [poster, applicant, stranger] = [await user(), await user(), await user()];
    const j = await job(poster);
    await withScreening(j);
    await apply(j, applicant);

    for (const who of [poster, applicant]) {
      expect((await getJob(who, j))?.interview).toMatchObject({ password: "secret-code", slug: expect.any(String) });
    }
    expect((await getJob(stranger, j))?.interview).toMatchObject({
      kind: "voice",
      questions: 2,
      slug: null,
      password: null,
    });
  });

  it("never reach the public share page", async () => {
    const j = await job(await user());
    await withScreening(j);
    const pub = await getPublicJob(j);
    expect(pub?.interview).toEqual({ kind: "voice", deadline: expect.any(Number), questions: 2, minutes: 0 });
    expect(JSON.stringify(pub)).not.toContain("secret-code");
    expect(pub).not.toHaveProperty("poster.id");
    expect(await getPublicJob("job_missing")).toBeNull();
  });

  it("give the questions to the poster only", async () => {
    const poster = await user();
    const j = await job(poster);
    await withScreening(j);
    expect(await jobQuestions(poster, j)).toEqual(["Why us?", "Tell me about a project"]);
    expect(await jobQuestions(await user(), j)).toEqual([]);
  });
});

describe("applicants", () => {
  it("are visible to the poster only, newest first, and can be narrowed to one", async () => {
    const poster = await user();
    const j = await job(poster);
    const [first, second] = [await user(), await user()];
    await apply(j, first, { at: Date.now() - 1000 });
    await apply(j, second);

    expect((await getApplicants(poster, j)).map((a) => a.id)).toEqual([second, first]);
    expect((await getApplicants(poster, j, first)).map((a) => a.id)).toEqual([first]);
    expect(await getApplicants(await user(), j)).toEqual([]);
    expect((await getJob(poster, j))?.applicants).toBe(2);
  });

  it("share the submitted profile with the poster only", async () => {
    const poster = await user();
    const j = await job(poster);
    const applicant = await user();
    await apply(j, applicant, { profile: { name: "Ada", skills: ["Go"] } });

    expect(await applicationProfile(poster, j, applicant)).toMatchObject({ name: "Ada", skills: ["Go"] });
    expect(await applicationProfile(await user(), j, applicant)).toBeNull();
  });

  it("prefill the next application from the last one", async () => {
    const me = await user();
    await apply(await job(await user()), me);
    expect(await lastApplication(me)).toEqual({ email: `${me}@mail.test`, phone: "+91 98765 43210" });
    expect(await lastApplication(await user())).toBeNull();
  });
});

describe("my jobs and company jobs", () => {
  it("lists saved, applied and posted jobs per viewer", async () => {
    const me = await user();
    const posted = await job(me);
    const applied = await job(await user());
    const saved = await job(await user());
    await apply(applied, me);
    await env.DB.prepare("INSERT INTO saved_jobs (user_id, job_id, created_at) VALUES (?, ?, ?)")
      .bind(me, saved, Date.now())
      .run();

    expect((await myJobs(me, "posted")).map((j) => j.id)).toEqual([posted]);
    expect((await myJobs(me, "applied")).map((j) => [j.id, j.application?.status])).toEqual([[applied, "submitted"]]);
    expect((await myJobs(me, "saved")).map((j) => [j.id, j.saved])).toEqual([[saved, true]]);
  });

  it("marks a company job verified only when its poster verified a work email there", async () => {
    const poster = await user();
    const co = await company(poster);
    const j = await job(poster, { companyId: co });
    await job(poster, { companyId: co, closed: true });
    expect((await getJob(poster, j))?.page?.verified).toBe(false);

    await verifyWorkEmail(co, poster);
    expect((await getJob(poster, j))?.page?.verified).toBe(true);
    expect((await companyJobs(poster, co)).map((x) => x.id)).toEqual([j]);
  });
});
