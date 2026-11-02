import { describe, expect, it } from "vitest";
import { cleanFilters } from "./job-fields";

describe("cleanFilters", () => {
  it("drops unknown values and prototype keys, and trims strings", () => {
    expect(
      cleanFilters({ q: "  react ", workplace: "remote", type: "toString", level: "ceo", posted: "week", loc: "   " }),
    ).toEqual({ q: "react", loc: undefined, workplace: "remote", type: undefined, level: undefined, posted: "week" });
  });

  it("caps the search text at 100 characters", () => {
    expect(cleanFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("ignores values of the wrong type", () => {
    expect(Object.values(cleanFilters({ q: ["a"], workplace: 1 })).filter(Boolean)).toEqual([]);
  });
});
