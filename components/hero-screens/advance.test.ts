import { describe, expect, it } from "vitest";
import { advance } from "./advance";

const run = (at: number, opts: { alive: boolean; reduced: boolean }) => advance(at, 6, opts);

describe("advance", () => {
  it("moves to the next screen", () => {
    expect(run(0, { alive: true, reduced: false })).toBe(1);
    expect(run(4, { alive: true, reduced: false })).toBe(5);
  });

  it("wraps from the last screen back to the first", () => {
    expect(run(5, { alive: true, reduced: false })).toBe(0);
  });

  it("stays put when the story was cancelled (the visitor already moved on)", () => {
    expect(run(2, { alive: false, reduced: false })).toBe(null);
  });

  it("never advances on its own under reduced motion (the pager drives it)", () => {
    expect(run(2, { alive: true, reduced: true })).toBe(null);
  });
});
