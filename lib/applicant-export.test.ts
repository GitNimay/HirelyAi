import { describe, expect, it, vi } from "vitest";
import { toCsv, toDocx, toPdf, type Completed } from "./applicant-export";
import { cleanReport } from "./interview-fields";
import { cleanResume } from "./resume-fields";

// The DB side (completedApplicants) is covered through the export route in tests/integration
vi.mock("./resume.ts", () => ({ getResume: vi.fn() }));

const applicant = (over: Partial<Completed> & { name?: string } = {}): Completed => ({
  id: "user_1",
  email: "ada@mail.test",
  phone: null,
  status: "shortlisted",
  at: Date.UTC(2026, 9, 1),
  kind: "voice",
  report: cleanReport({ score: 82, summary: "Strong", strengths: ["Go"], concerns: [] }),
  profile: cleanResume({
    name: over.name ?? "Ada Lovelace",
    city: "Pune",
    skills: ["Go", "SQL"],
    experience: [{ title: "SDE", company: "Acme", start: "2021-01", current: true }],
  }),
  ...over,
});

const rows = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

describe("toCsv", () => {
  it("starts with a BOM so Excel reads UTF-8, and has one row per applicant", () => {
    const csv = toCsv([applicant(), applicant({ id: "user_2" })], "https://hire.test");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(rows(csv)).toHaveLength(3);
    expect(rows(csv)[0]).toMatch(/^"Name","Email","Phone",/);
  });

  it("fills a row with the profile, the application and the verdict", () => {
    const row = rows(toCsv([applicant()], "https://hire.test"))[1];
    for (const cell of ["Ada Lovelace", "ada@mail.test", "SDE at Acme", "Go, SQL", "2026-10-01", "82", "Strong"])
      expect(row).toContain(`"${cell}"`);
    expect(row).toContain('"https://hire.test/in/user_1"');
  });

  // CSV injection: an applicant controls their name, and a cell starting with = + - @ runs as an Excel formula
  it.each(['=HYPERLINK("http://evil")', "+1+1", "-2+3", "@SUM(A1)"])("neutralises a cell starting %j", (name) => {
    const first = rows(toCsv([applicant({ name })], "https://hire.test"))[1].split(",")[0];
    expect(first.startsWith(`"'`)).toBe(true);
  });

  it("escapes quotes and keeps commas and newlines inside one cell", () => {
    const row = rows(toCsv([applicant({ name: 'Ada "The Countess", Lovelace' })], "https://hire.test"))[1];
    expect(row.startsWith('"Ada ""The Countess"", Lovelace",')).toBe(true);
  });
});

describe("toPdf and toDocx", () => {
  it("produce a PDF and a Word (zip) file", async () => {
    const pdf = await toPdf([applicant(), applicant({ id: "user_2" })], "Applicants");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const docx = toDocx([applicant()]);
    expect([...docx.slice(0, 2)]).toEqual([0x50, 0x4b]); // "PK"
  });
});
