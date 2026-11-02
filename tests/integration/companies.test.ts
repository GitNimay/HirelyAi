import { describe, expect, it } from "vitest";
import {
  canPostJobs,
  companiesByIds,
  getCompany,
  listAdmins,
  listPeople,
  myCompanies,
  roleOf,
  searchCompanies,
} from "@/lib/companies";
import { company, companyAdmin, companyMember, followCompany, job, uid, user, verifyWorkEmail } from "./factories";

describe("getCompany", () => {
  it("finds a page by slug or by id, and returns null for neither", async () => {
    const owner = await user();
    const slug = uid("acme").toLowerCase().replace("_", "-");
    const id = await company(owner, { slug, specialties: ["AI", "Cloud"] });

    expect(await getCompany(owner, slug)).toMatchObject({ id, slug, specialties: ["AI", "Cloud"] });
    expect((await getCompany(owner, id))?.slug).toBe(slug);
    expect(await getCompany(owner, "no-such-page")).toBeNull();
  });

  it("shows the viewer's own role, follow and verification", async () => {
    const owner = await user();
    const co = await company(owner);
    await companyAdmin(co, owner);
    await followCompany(owner, co);
    const stranger = await user();

    expect((await getCompany(owner, co))?.me).toEqual({ role: "owner", following: true, verified: false });
    expect((await getCompany(stranger, co))?.me).toEqual({ role: null, following: false, verified: false });
  });

  it("is verified only when an admin proved a work email, not any employee", async () => {
    const owner = await user();
    const co = await company(owner);
    await companyAdmin(co, owner);
    const employee = await user();
    await verifyWorkEmail(co, employee);
    expect((await getCompany(owner, co))?.verified).toBe(false);

    await verifyWorkEmail(co, owner);
    expect((await getCompany(owner, co))?.verified).toBe(true);
  });

  it("counts only public members, plus the viewer themselves, and only open jobs", async () => {
    const owner = await user();
    const co = await company(owner);
    const visible = await user({ resumePublic: true });
    const hidden = await user({ resumePublic: false });
    await companyMember(co, visible);
    await companyMember(co, hidden);
    await job(owner, { companyId: co });
    await job(owner, { companyId: co, closed: true });

    expect((await getCompany(owner, co))?.counts).toEqual({ people: 1, jobs: 1 });
    expect((await getCompany(hidden, co))?.counts.people).toBe(2);
  });
});

describe("listPeople", () => {
  it("lists current employees first and hides private profiles from others", async () => {
    const co = await company(await user());
    const past = await user({ name: "Aaron", resumePublic: true });
    const now = await user({ name: "Zed", resumePublic: true });
    const hidden = await user({ resumePublic: false });
    await companyMember(co, past, "Intern", false);
    await companyMember(co, now, "CTO", true);
    await companyMember(co, hidden);

    const people = await listPeople(await user(), co);
    expect(people.map((p) => [p.id, p.current])).toEqual([
      [now, true],
      [past, false],
    ]);
  });
});

describe("search", () => {
  it("ranks a name prefix above a match in the middle", async () => {
    const owner = await user();
    const tag = uid("zq").replace("_", "");
    const middle = await company(owner, { name: `Big ${tag} Labs` });
    const prefix = await company(owner, { name: `${tag} Systems` });

    const ids = (await searchCompanies(tag)).map((c) => c.id);
    expect(ids).toEqual([prefix, middle]);
  });

  it("treats % and _ in the query as literal text, not wildcards", async () => {
    const owner = await user();
    const tag = uid("pct").replace("_", "");
    await company(owner, { name: `${tag} plain` });
    const literal = await company(owner, { name: `${tag} 100% remote` });

    expect((await searchCompanies(`${tag} 100%`)).map((c) => c.id)).toEqual([literal]);
    expect(await searchCompanies(`${tag}_`)).toEqual([]);
  });

  it("returns cards with media urls, keyed by id", async () => {
    const co = await company(await user());
    const cards = await companiesByIds([co, "missing"]);
    expect(Object.keys(cards)).toEqual([co]);
    expect(cards[co]).toMatchObject({ id: co, logoUrl: null, followers: 0 });
    expect(await companiesByIds([])).toEqual({});
  });
});

describe("permissions", () => {
  it("lets only members with a verified work email post jobs, admins included", async () => {
    const owner = await user();
    const co = await company(owner);
    await companyAdmin(co, owner);
    const employee = await user();
    await verifyWorkEmail(co, employee);

    expect(await roleOf(owner, co)).toBe("owner");
    expect(await canPostJobs(owner, co)).toBe(false);
    expect(await canPostJobs(employee, co)).toBe(true);
    expect(await canPostJobs(await user(), co)).toBe(false);
  });

  it("lists pages I run before pages I only verified at", async () => {
    const me = await user();
    const verifiedOnly = await company(await user(), { name: "Alpha" });
    const run = await company(me, { name: "Zulu" });
    await companyAdmin(run, me, "admin");
    await verifyWorkEmail(verifiedOnly, me);

    expect((await myCompanies(me)).map((c) => [c.id, c.role, c.verified])).toEqual([
      [run, "admin", false],
      [verifiedOnly, null, true],
    ]);
  });

  it("lists the owner before other admins", async () => {
    const co = await company(await user());
    const admin = await user();
    const owner = await user();
    await companyAdmin(co, admin, "admin");
    await companyAdmin(co, owner, "owner");
    expect((await listAdmins(co)).map((a) => a.role)).toEqual(["owner", "admin"]);
  });
});
