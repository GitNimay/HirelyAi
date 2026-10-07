import assert from "node:assert/strict";
import { parseInline, parseProse } from "./prose.ts";

// A typical pasted description: bare and colon headings, bullets split by blank lines, numbered list, markdown heading
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
assert.deepEqual(parseProse(jd), [
  { t: "h", text: "About the role" },
  { t: "p", text: "We're hiring a frontend engineer.\nYou'll own features end to end." },
  { t: "h", text: "Responsibilities" },
  { t: "ul", items: ["Build fast React UIs", "Work with design", "Ship weekly"] },
  { t: "h", text: "Requirements" },
  { t: "ol", items: ["3+ years of React", "TypeScript"] },
  { t: "h", text: "Nice to have" },
  { t: "p", text: "**GraphQL** experience" },
]);

// Bold-only lines and ALL CAPS lines are headings; a "**" line is never a bullet; "-5%" is not a bullet
assert.deepEqual(parseProse("**Benefits**\n✓ Health cover\n\nWHO WE ARE\nRevenue grew -5% less."), [
  { t: "h", text: "Benefits" },
  { t: "ul", items: ["Health cover"] },
  { t: "h", text: "WHO WE ARE" },
  { t: "p", text: "Revenue grew -5% less." },
]);

// Plain prose stays prose: a short final line, a sentence, or a line mid-paragraph is not a heading
assert.deepEqual(parseProse("We build tools.\nShort line\nMore text.\n\nApply now"), [
  { t: "p", text: "We build tools.\nShort line\nMore text." },
  { t: "p", text: "Apply now" },
]);
assert.deepEqual(parseProse("Windows\r\nline\r\n"), [{ t: "p", text: "Windows\nline" }]);

assert.deepEqual(parseInline("See **perks** at https://acme.com/jobs. Mail hr@acme.co.in!"), [
  { t: "text", text: "See " },
  { t: "b", text: "perks" },
  { t: "text", text: " at " },
  { t: "url", text: "https://acme.com/jobs" },
  { t: "text", text: ". Mail " },
  { t: "email", text: "hr@acme.co.in" },
  { t: "text", text: "!" },
]);
// A long "# a     …x" line once backtracked for ~100 s (ReDoS); it must stay linear
const t0 = performance.now();
parseProse("# a" + " ".repeat(7000) + "x");
assert.ok(performance.now() - t0 < 200, "heading regex backtracking");
console.log("prose: ok");
