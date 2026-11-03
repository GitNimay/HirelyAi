import { describe, expect, it } from "vitest";
import {
  callKeyterms,
  cleanAnswers,
  cleanMcq,
  cleanProfile,
  cleanQuestions,
  cleanReport,
  cleanTranscript,
  gradeMcq,
  resumeYears,
  screeningFacts,
} from "./fields";

describe("cleanQuestions", () => {
  it("takes one per line, drops blanks and keeps at most five", () => {
    expect(cleanQuestions(" a \n\n b\nc\nd\ne\nf")).toEqual(["a", "b", "c", "d", "e"]);
    expect(cleanQuestions(42)).toEqual([]);
  });
});

describe("cleanProfile", () => {
  it("reports missing fields and a bad phone, clamps years and drops unsafe links", () => {
    const p = cleanProfile({
      name: " Ada ",
      phone: "abc",
      city: "Pune",
      role: "",
      years: "120",
      notice: "toString",
      link: "javascript:alert(1)",
    });
    expect(p.profile).toMatchObject({ name: "Ada", years: 50, notice: "30d", link: "" });
    expect(p.missing).toEqual(["role", "phone"]);
  });
});

describe("cleanReport", () => {
  it("clamps the score, derives fit from it and drops junk list items", () => {
    const r = cleanReport({ score: 140, fit: "weak", summary: "ok", strengths: ["x", 3, ""] });
    expect(r).toMatchObject({ score: 100, fit: "strong", strengths: ["x"], concerns: [] });
    expect(cleanReport(null).summary).toBe("");
  });

  it.each([
    [75, "strong"],
    [74, "moderate"],
    [50, "moderate"],
    [49, "weak"],
  ])("labels a score of %i as %s, whatever the model said", (score, fit) => {
    expect(cleanReport({ score, fit: "strong" }).fit).toBe(fit);
  });

  it("leaves absent part scores undefined (old reports) and clamps present ones", () => {
    const old = cleanReport({ score: 60, fit: "moderate" });
    expect(old.resumeFit).toBeUndefined();
    expect(old.roleFit).toBeUndefined();
    expect(cleanReport({ resumeFit: null, roleFit: "n/a" }).roleFit).toBeUndefined();
    expect(cleanReport({ resumeFit: 140, roleFit: "70" })).toMatchObject({ resumeFit: 100, roleFit: 70 });
  });

  it("weights 35% resume and 65% interview, ignoring the model's own score", () => {
    expect(cleanReport({ score: 10, resumeFit: 80, roleFit: 60 })).toMatchObject({ score: 67, fit: "moderate" });
    expect(cleanReport({ score: 10, resumeFit: 100, roleFit: 80 }).fit).toBe("strong");
    expect(cleanReport({ score: 10, roleFit: 62 }).score).toBe(62);
  });

  it("caps the summary at 220 characters and three items of 80 each", () => {
    const capped = cleanReport({
      summary: "x".repeat(300),
      strengths: ["a", "b", "c", "d"],
      concerns: ["y".repeat(100)],
    });
    expect(capped.summary).toHaveLength(220);
    expect(capped.strengths).toHaveLength(3);
    expect(capped.concerns[0]).toHaveLength(80);
  });
});

describe("cleanTranscript", () => {
  it("drops empty lines and treats unknown roles as the candidate", () => {
    expect(cleanTranscript([{ role: "agent", text: "Hi" }, { role: "x", text: " yo " }, { text: "" }, null])).toEqual([
      { role: "agent", text: "Hi" },
      { role: "candidate", text: "yo" },
    ]);
  });

  it("joins one answer split by a pause into one line", () => {
    expect(
      cleanTranscript([
        { role: "agent", text: "Q1?" },
        { role: "candidate", text: "First," },
        { role: "candidate", text: "then more." },
        { role: "agent", text: "Q2?" },
      ]),
    ).toEqual([
      { role: "agent", text: "Q1?" },
      { role: "candidate", text: "First, then more." },
      { role: "agent", text: "Q2?" },
    ]);
  });
});

describe("callKeyterms", () => {
  it("collects resume skills, companies, titles and tech terms from the job, without duplicates", () => {
    const kt = callKeyterms("We use Node.js, C++ and AWS with PostgreSQL. The team ships daily.", {
      skills: ["React", "react", "TypeScript"],
      experience: [{ title: "SDE 2", company: "Acme" }],
    });
    expect(kt).toEqual(["React", "TypeScript", "Acme", "SDE 2", "Node.js", "C++", "AWS", "PostgreSQL"]);
  });

  it("handles no resume and caps the list at 80", () => {
    expect(callKeyterms("x", null)).toEqual([]);
    expect(
      callKeyterms("", { skills: Array.from({ length: 120 }, (_, i) => `skill${i}`), experience: [] }),
    ).toHaveLength(80);
  });
});

describe("resumeYears", () => {
  it("counts from the earliest start and ignores blanks", () => {
    expect(resumeYears([{ start: "2021-03" }, { start: "2019-10" }, { start: "" }], new Date(2026, 9, 10))).toBe(7);
    expect(resumeYears([], new Date())).toBe(0);
  });
});

describe("MCQ tests", () => {
  const m = cleanMcq([
    { q: " What is 2+2? ", options: ["3", "", "4"], answer: 2 },
    { q: "No answer", options: ["a", "b"], answer: 5 },
    { q: "Dupes", options: ["a", "a"], answer: 0 },
    null,
  ]);

  it("drops blank options with the answer following its text, and skips broken questions", () => {
    expect(m).toEqual([{ q: "What is 2+2?", options: ["3", "4"], answer: 1 }]);
  });

  it("reports broken questions in strict mode", () => {
    expect(() => cleanMcq([{ q: "x", options: ["a"], answer: 0 }], true)).toThrow(
      /Question 1 needs at least 2 options/,
    );
  });

  it("turns out-of-range answers into unanswered", () => {
    expect(cleanAnswers([1, 9, "x"], [{ options: ["a", "b"] }, { options: ["a", "b"] }, { options: ["a"] }])).toEqual([
      1, -1, -1,
    ]);
  });

  it("grades right, wrong and unanswered", () => {
    const g = gradeMcq(
      [
        ...m,
        { q: "y", options: ["a", "b"], answer: 0 },
        { q: "z", options: ["a", "b"], answer: 1 },
        { q: "w", options: ["a", "b"], answer: 1 },
      ],
      [1, 0, -1, 0],
    );
    expect(g).toMatchObject({ score: 50, fit: "moderate", summary: "2 of 4 correct, 1 unanswered." });
    expect(screeningFacts("mcq", 10)).toBe("10 questions · 10 min");
  });
});
