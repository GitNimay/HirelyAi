import assert from "node:assert/strict";
import { autoHeadline, cleanResume, emptyResume, fmtRange, mergeResume, missingFields } from "./resume-fields.ts";
import { resumePdf } from "./resume-pdf.ts";

// Model output is messy: wrong types, "Present", years only, empty rows, duplicate skills
const r = cleanResume({
  name: "  Ada   Lovelace ", phone: "+91 98765 43210", email: "ada@example.com", city: "Pune", status: "working",
  experience: [
    { title: "Engineer", company: "Acme", start: "2021", end: "Present" },
    { title: "", company: "", start: "" },
  ],
  education: [{ school: "IIT", degree: "B.Tech", start: "2017-8", end: 2021 }],
  skills: ["React", "react", " Go ", ""],
  preferredLocations: "Pune, Remote",
  status2: "ignored",
});
assert.equal(r.name, "Ada Lovelace");
assert.deepEqual(r.experience, [{ title: "Engineer", company: "Acme", location: "", start: "2021-01", end: "", current: true, description: "" }]);
assert.equal(r.education[0].start, "2017-08");
assert.equal(r.education[0].end, "2021-01");
assert.deepEqual(r.skills, ["React", "Go"]);
assert.deepEqual(r.preferredLocations, ["Pune", "Remote"]);
assert.deepEqual(missingFields(r), []);
assert.equal(autoHeadline(r), "Engineer at Acme");
assert.equal(fmtRange("2021-01", "", true), "Jan 2021 – Present");

assert.equal(cleanResume(null).status, "fresher");
assert.deepEqual(missingFields(emptyResume()), ["name", "phone", "email", "city", "skills", "preferredLocations", "education"]);
assert.ok(missingFields({ ...r, phone: "12" }).includes("phone"));
assert.ok(missingFields({ ...r, experience: [] }).includes("experience"));
assert.ok(missingFields({ ...r, experience: [{ ...r.experience[0], current: false, end: "2020-01" }] }).includes("experience.0.end"));

// Typed values win; the AI only fills blanks
const typed = { ...emptyResume(), name: "Ada", phone: "9876543210", status: "student" as const };
const merged = mergeResume(typed, r);
assert.equal(merged.name, "Ada");
assert.equal(merged.status, "student");
assert.equal(merged.city, "Pune");
assert.deepEqual(merged.skills, ["React", "Go"]);

// PDF renders, including text the standard fonts can't encode and a long description that wraps across pages
const pdf = await resumePdf({ ...r, name: "Zoë 李", summary: "word ".repeat(3000) });
assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");

console.log("resume-fields ok");
