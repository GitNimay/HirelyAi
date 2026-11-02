import { describe, expect, it } from "vitest";
import { rank, type Candidate } from "./rank";

const now = Date.UTC(2026, 0, 1);
const H = 3_600_000;
const post = (id: string, author: string, ageH: number, likes = 0, extra: Partial<Candidate> = {}): Candidate => ({
  entryId: id,
  targetId: id,
  entryAuthor: author,
  targetAuthor: author,
  entryAt: now - ageH * H,
  likes,
  comments: 0,
  reposts: 0,
  ...extra,
});
const order = (c: Candidate[], aff = new Map<string, number>()) => rank(c, "me", aff, now).map((p) => p.entryId);

describe("rank", () => {
  it("puts newer before older at equal engagement", () => {
    expect(order([post("old", "a", 10), post("new", "b", 1)])).toEqual(["new", "old"]);
  });

  it("lets an author I interact with outrank a stranger's slightly newer post", () => {
    expect(order([post("stranger", "b", 1), post("friend", "a", 2)], new Map([["a", 20]]))[0]).toBe("friend");
  });

  it("puts a popular post above a quiet one of the same age", () => {
    expect(order([post("quiet", "a", 3), post("viral", "b", 3, 500)])[0]).toBe("viral");
  });

  it("collapses an original and its repost into one entry", () => {
    const repost = post("r1", "c", 0.5, 0, { targetId: "p1", targetAuthor: "a" });
    expect(order([post("p1", "a", 2), repost])).toHaveLength(1);
  });

  it("keeps one author from flooding the top", () => {
    const flood = [post("a1", "a", 1), post("a2", "a", 1.01), post("a3", "a", 1.02), post("b1", "b", 1.03)];
    expect(order(flood).indexOf("b1")).toBeLessThan(3);
  });

  it("pins my own fresh post first for me", () => {
    expect(order([post("viral", "b", 0.2, 900), post("mine", "me", 0.5)])[0]).toBe("mine");
  });

  it("returns an empty list for no candidates", () => {
    expect(order([])).toEqual([]);
  });
});
