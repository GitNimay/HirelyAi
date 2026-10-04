import assert from "node:assert/strict";
import { cleanProfile, cleanQuestions, cleanReport, cleanTranscript } from "./interview-fields.ts";

// One per line, blanks dropped, capped at 5
assert.deepEqual(cleanQuestions(" a \n\n b\nc\nd\ne\nf"), ["a", "b", "c", "d", "e"]);
assert.deepEqual(cleanQuestions(42), []);

// Required fields and a bad phone are reported; unknown notice falls back; non-http links are dropped
const p = cleanProfile({ name: " Ada ", phone: "abc", city: "Pune", role: "", years: "120", notice: "toString", link: "javascript:alert(1)" });
assert.equal(p.profile.name, "Ada");
assert.equal(p.profile.years, 50);
assert.equal(p.profile.notice, "30d");
assert.equal(p.profile.link, "");
assert.deepEqual(p.missing, ["role", "phone"]);

// Report: clamped, unknown fit → weak, junk list items dropped
const r = cleanReport({ score: 140, fit: "amazing", summary: "ok", strengths: ["x", 3, ""] });
assert.equal(r.score, 100);
assert.equal(r.fit, "weak");
assert.deepEqual(r.strengths, ["x"]);
assert.deepEqual(r.concerns, []);
assert.equal(cleanReport(null).summary, "");

assert.deepEqual(cleanTranscript([{ role: "agent", text: "Hi" }, { role: "x", text: " yo " }, { text: "" }, null]), [
  { role: "agent", text: "Hi" },
  { role: "candidate", text: "yo" },
]);
console.log("interview-fields: ok");
