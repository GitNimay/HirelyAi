import { describe, expect, it } from "vitest";
import { parseInline, parseProse } from "./prose";

describe("parseProse", () => {
  it("structures a typical pasted job description", () => {
    const jd = `About the role
We're hiring a frontend engineer.
You'll own features end to end.

Responsibilities:
• Build fast React UIs
• Work with design

- Ship weekly

Requirements
1. 3+ years of React
2) TypeScript

## Nice to have
**GraphQL** experience`;
    expect(parseProse(jd)).toEqual([
      { t: "h", text: "About the role" },
      { t: "p", text: "We're hiring a frontend engineer.\nYou'll own features end to end." },
      { t: "h", text: "Responsibilities" },
      { t: "ul", items: ["Build fast React UIs", "Work with design", "Ship weekly"] },
      { t: "h", text: "Requirements" },
      { t: "ol", items: ["3+ years of React", "TypeScript"] },
      { t: "h", text: "Nice to have" },
      { t: "p", text: "**GraphQL** experience" },
    ]);
  });

  it("reads bold-only and ALL CAPS lines as headings, but not '-5%' as a bullet", () => {
    expect(parseProse("**Benefits**\n✓ Health cover\n\nWHO WE ARE\nRevenue grew -5% less.")).toEqual([
      { t: "h", text: "Benefits" },
      { t: "ul", items: ["Health cover"] },
      { t: "h", text: "WHO WE ARE" },
      { t: "p", text: "Revenue grew -5% less." },
    ]);
  });

  it("keeps plain prose as paragraphs", () => {
    expect(parseProse("We build tools.\nShort line\nMore text.\n\nApply now")).toEqual([
      { t: "p", text: "We build tools.\nShort line\nMore text." },
      { t: "p", text: "Apply now" },
    ]);
  });

  it("handles Windows line endings", () => {
    expect(parseProse("Windows\r\nline\r\n")).toEqual([{ t: "p", text: "Windows\nline" }]);
  });

  it("stays linear on a long heading line (regression: ReDoS once took about 100 s)", () => {
    const t0 = performance.now();
    parseProse("# a" + " ".repeat(7000) + "x");
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("parseInline", () => {
  it("finds bold text, links and emails", () => {
    expect(parseInline("See **perks** at https://acme.com/jobs. Mail hr@acme.co.in!")).toEqual([
      { t: "text", text: "See " },
      { t: "b", text: "perks" },
      { t: "text", text: " at " },
      { t: "url", text: "https://acme.com/jobs" },
      { t: "text", text: ". Mail " },
      { t: "email", text: "hr@acme.co.in" },
      { t: "text", text: "!" },
    ]);
  });
});
