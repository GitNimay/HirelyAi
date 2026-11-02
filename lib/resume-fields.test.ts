import { describe, expect, it } from "vitest";
import { autoHeadline, cleanResume, emptyResume, fmtRange, mergeResume, missingFields } from "./resume-fields";
import { resumePdf } from "./resume-pdf";

// Model output is messy: wrong types, "Present", years only, empty rows, duplicate skills
const messy = () =>
  cleanResume({
    name: "  Ada   Lovelace ",
    phone: "+91 98765 43210",
    email: "ada@example.com",
    city: "Pune",
    status: "working",
    experience: [
      { title: "Engineer", company: "Acme", start: "2021", end: "Present" },
      { title: "", company: "", start: "" },
    ],
    education: [{ school: "IIT", degree: "B.Tech", start: "2017-8", end: 2021 }],
    skills: ["React", "react", " Go ", ""],
    preferredLocations: "Pune, Remote",
    status2: "ignored",
  });

describe("cleanResume", () => {
  it("normalises names, dates, current roles, skills and locations", () => {
    const r = messy();
    expect(r.name).toBe("Ada Lovelace");
    expect(r.experience).toEqual([
      { title: "Engineer", company: "Acme", location: "", start: "2021-01", end: "", current: true, description: "" },
    ]);
    expect(r.education[0]).toMatchObject({ start: "2017-08", end: "2021-01" });
    expect(r.skills).toEqual(["React", "Go"]);
    expect(r.preferredLocations).toEqual(["Pune", "Remote"]);
    expect(autoHeadline(r)).toBe("Engineer at Acme");
  });

  it("falls back to an empty fresher resume for junk", () => {
    expect(cleanResume(null).status).toBe("fresher");
  });

  it("formats an ongoing date range", () => {
    expect(fmtRange("2021-01", "", true)).toBe("Jan 2021 – Present");
  });
});

describe("missingFields", () => {
  it("is empty for a complete resume", () => {
    expect(missingFields(messy())).toEqual([]);
  });

  it("lists every required field of an empty resume", () => {
    expect(missingFields(emptyResume())).toEqual([
      "name",
      "phone",
      "email",
      "city",
      "skills",
      "preferredLocations",
      "education",
    ]);
  });

  it("flags a short phone, missing experience for workers, and a past role without an end", () => {
    const r = messy();
    expect(missingFields({ ...r, phone: "12" })).toContain("phone");
    expect(missingFields({ ...r, experience: [] })).toContain("experience");
    expect(missingFields({ ...r, experience: [{ ...r.experience[0], current: false, end: "2020-01" }] })).toContain(
      "experience.0.end",
    );
  });
});

describe("mergeResume", () => {
  it("keeps what the member typed and lets the AI fill only the blanks", () => {
    const typed = { ...emptyResume(), name: "Ada", phone: "9876543210", status: "student" as const };
    const merged = mergeResume(typed, messy());
    expect(merged).toMatchObject({ name: "Ada", status: "student", city: "Pune", skills: ["React", "Go"] });
  });
});

describe("resumePdf", () => {
  it("renders text the standard fonts can't encode and a description long enough to wrap pages", async () => {
    const pdf = await resumePdf({ ...messy(), name: "Zoë 李", summary: "word ".repeat(3000) });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
