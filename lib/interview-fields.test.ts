import assert from "node:assert/strict";
import { callKeyterms, cleanAnswers, cleanMcq, cleanProfile, cleanQuestions, cleanReport, cleanTranscript, gradeMcq, resumeYears, screeningFacts } from "./interview-fields.ts";

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

// Report: clamped, fit follows the score (the model's label is ignored), junk list items dropped
const r = cleanReport({ score: 140, fit: "weak", summary: "ok", strengths: ["x", 3, ""] });
assert.equal(r.score, 100);
assert.equal(r.fit, "strong");
assert.deepEqual(r.strengths, ["x"]);
assert.deepEqual(r.concerns, []);
assert.equal(cleanReport(null).summary, "");
assert.equal(cleanReport({ score: 75 }).fit, "strong");
assert.equal(cleanReport({ score: 74 }).fit, "moderate");
assert.equal(cleanReport({ score: 50 }).fit, "moderate");
assert.equal(cleanReport({ score: 49, fit: "strong" }).fit, "weak");

// Part scores: absent or non-numeric stays undefined (old reports), not 0; present ones clamp
const old = cleanReport({ score: 60, fit: "moderate" });
assert.equal(old.resumeFit, undefined);
assert.equal(old.roleFit, undefined);
assert.equal(cleanReport({ resumeFit: null, roleFit: "n/a" }).roleFit, undefined);
const parts = cleanReport({ resumeFit: 140, roleFit: "70" });
assert.equal(parts.resumeFit, 100);
assert.equal(parts.roleFit, 70);

// With both parts the overall is 35% resume + 65% interview, and the model's own score is ignored
const w = cleanReport({ score: 10, resumeFit: 80, roleFit: 60 });
assert.equal(w.score, 67);
assert.equal(w.fit, "moderate");
assert.equal(cleanReport({ score: 10, resumeFit: 100, roleFit: 80 }).fit, "strong");
assert.equal(cleanReport({ score: 10, roleFit: 62 }).score, 62); // no resume: the interview alone

// Summary 220 chars, three strengths and concerns of 80 chars each
const capped = cleanReport({ summary: "x".repeat(300), strengths: ["a", "b", "c", "d"], concerns: ["y".repeat(100)] });
assert.equal(capped.summary.length, 220);
assert.equal(capped.strengths.length, 3);
assert.equal(capped.concerns[0].length, 80);

assert.deepEqual(cleanTranscript([{ role: "agent", text: "Hi" }, { role: "x", text: " yo " }, { text: "" }, null]), [
  { role: "agent", text: "Hi" },
  { role: "candidate", text: "yo" },
]);
// One answer split by a pause becomes one line
assert.deepEqual(cleanTranscript([{ role: "agent", text: "Q1?" }, { role: "candidate", text: "First," }, { role: "candidate", text: "then more." }, { role: "agent", text: "Q2?" }]), [
  { role: "agent", text: "Q1?" },
  { role: "candidate", text: "First, then more." },
  { role: "agent", text: "Q2?" },
]);

const kt = callKeyterms("We use Node.js, C++ and AWS with PostgreSQL. The team ships daily.", { skills: ["React", "react", "TypeScript"], experience: [{ title: "SDE 2", company: "Acme" }] });
assert.deepEqual(kt, ["React", "TypeScript", "Acme", "SDE 2", "Node.js", "C++", "AWS", "PostgreSQL"]);
assert.equal(callKeyterms("x", null).length, 0);
assert.equal(callKeyterms("", { skills: Array.from({ length: 120 }, (_, i) => `skill${i}`), experience: [] }).length, 80);

assert.equal(resumeYears([{ start: "2021-03" }, { start: "2019-10" }, { start: "" }], new Date(2026, 9, 10)), 7);
assert.equal(resumeYears([], new Date()), 0);
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
