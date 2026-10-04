import assert from "node:assert/strict";
import { cleanAnswers, cleanMcq, cleanProfile, cleanQuestions, cleanReport, cleanTranscript, gradeMcq, screeningFacts } from "./interview-fields.ts";

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

// MCQ: blank options dropped with the answer following its text; broken questions skipped, or reported when strict
const m = cleanMcq([
  { q: " What is 2+2? ", options: ["3", "", "4"], answer: 2 },
  { q: "No answer", options: ["a", "b"], answer: 5 },
  { q: "Dupes", options: ["a", "a"], answer: 0 },
  null,
]);
assert.deepEqual(m, [{ q: "What is 2+2?", options: ["3", "4"], answer: 1 }]);
assert.throws(() => cleanMcq([{ q: "x", options: ["a"], answer: 0 }], true), /Question 1 needs at least 2 options/);
assert.deepEqual(cleanAnswers([1, 9, "x"], [{ options: ["a", "b"] }, { options: ["a", "b"] }, { options: ["a"] }]), [1, -1, -1]);
const g = gradeMcq([...m, { q: "y", options: ["a", "b"], answer: 0 }, { q: "z", options: ["a", "b"], answer: 1 }, { q: "w", options: ["a", "b"], answer: 1 }], [1, 0, -1, 0]);
assert.equal(g.score, 50);
assert.equal(g.fit, "moderate");
assert.equal(g.summary, "2 of 4 correct, 1 unanswered.");
assert.equal(screeningFacts("mcq", 10), "10 questions · 10 min");
console.log("mcq: ok");
