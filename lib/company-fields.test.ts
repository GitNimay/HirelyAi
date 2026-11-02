import { describe, expect, it } from "vitest";
import { cleanCompany, domainOf, linkExperience, memberRows, onDomain } from "./company-fields";
import { cleanResume, emptyExperience } from "./resume-fields";

describe("domainOf", () => {
  it.each([
    ["https://www.Acme.com/careers", "acme.com"],
    ["https://acme.co.uk", "acme.co.uk"],
    ["https://mail.acme.com", "mail.acme.com"],
  ])("takes %s as %s", (url, domain) => {
    expect(domainOf(url)).toBe(domain);
  });

  // Free mail and public suffixes would let anyone "verify" as an employee
  it.each(["https://gmail.com/", "https://yahoo.co.uk", "https://hotmail.fr", "https://co.uk", "https://com.au", null])(
    "refuses %s",
    (url) => {
      expect(domainOf(url)).toBeNull();
    },
  );
});

describe("onDomain", () => {
  it.each([
    ["Ada@ACME.com", "acme.com"],
    ["ada@eng.acme.com", "acme.com"],
    ["ada@acme.co.uk", "acme.co.uk"],
  ])("accepts %s on %s", (email, domain) => {
    expect(onDomain(email, domain)).toBe(true);
  });

  it.each([
    ["ada@notacme.com", "acme.com"],
    ["ada@acme.com.evil.io", "acme.com"],
    ["ada@gmail.com", "gmail.com"],
    ["ada@yahoo.co.uk", "co.uk"],
    ["ada@acme.com", null],
  ])("rejects %s on %s", (email, domain) => {
    expect(onDomain(email, domain)).toBe(false);
  });
});

describe("cleanCompany", () => {
  it("normalises the page and drops values outside the allowlists", () => {
    const c = cleanCompany(
      {
        name: "  Acme   Corp ",
        slug: "Acme",
        website: "acme.com",
        industry: "Internet",
        size: "huge",
        founded: "1999",
        specialties: "AI, ai, Cloud ,",
      },
      2026,
    );
    expect(c).toMatchObject({
      name: "Acme Corp",
      slug: "acme",
      domain: "acme.com",
      industry: "Internet",
      size: null,
      specialties: ["AI", "Cloud"],
    });
  });

  it.each([
    ["a too-short slug", { name: "Acme", slug: "a" }],
    ["a javascript: website", { name: "Acme", slug: "acme", website: "javascript:alert(1)" }],
    ["a founding year in the future", { name: "Acme", slug: "acme", founded: "3000" }],
  ])("returns an error message for %s", (_, input) => {
    expect(cleanCompany(input, 2026)).toBeTypeOf("string");
  });
});

describe("linking experience to pages", () => {
  const x = (company: string, companyId?: string, current = false) => ({
    ...emptyExperience(),
    title: "Eng",
    company,
    companyId,
    current,
  });

  it("prefers a known id, then a unique exact name, else keeps free text", () => {
    const pages = [
      { id: "a", name: "Acme" },
      { id: "b", name: "Beta" },
      { id: "b2", name: "Beta" },
    ];
    const linked = linkExperience([x("acme"), x("Old name", "a"), x("Beta"), x("Gamma"), x("Gamma", "gone")], pages);
    expect(linked.map((e) => [e.company, e.companyId])).toEqual([
      ["Acme", "a"],
      ["Acme", "a"],
      ["Beta", undefined],
      ["Gamma", undefined],
      ["Gamma", undefined],
    ]);
  });

  it("derives one membership per page, current if any role there is current", () => {
    expect(memberRows([x("Acme", "a"), x("Acme", "a", true), x("Gamma")])).toEqual([
      { companyId: "a", title: "Eng", current: true },
    ]);
  });

  it("survives cleanResume, which never adds an empty link", () => {
    expect(cleanResume({ experience: [x("Acme", "a")] }).experience[0].companyId).toBe("a");
    expect(cleanResume({ experience: [x("Acme")] }).experience[0]).not.toHaveProperty("companyId");
  });
});
