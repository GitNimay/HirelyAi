import { describe, expect, it } from "vitest";
import { isReaction, moveReaction, topReactions } from "./reactions";

describe("moveReaction", () => {
  it("adds, removes and switches a reaction", () => {
    expect(moveReaction({}, null, "like")).toEqual({ like: 1 });
    expect(moveReaction({ like: 1 }, "like", null)).toEqual({});
    expect(moveReaction({ like: 2, love: 1 }, "like", "love")).toEqual({ like: 1, love: 2 });
    expect(moveReaction({ like: 1 }, "like", "like")).toEqual({ like: 1 });
  });

  it("never goes negative on stale client state", () => {
    expect(moveReaction({}, "funny", null)).toEqual({});
  });
});

describe("topReactions", () => {
  it("returns the three most used kinds", () => {
    expect(topReactions({ like: 1, love: 5, funny: 3, celebrate: 2 })).toEqual(["love", "funny", "celebrate"]);
  });
});

describe("isReaction", () => {
  it("accepts known kinds only, so a value can't reach a JSON path", () => {
    expect(isReaction("insightful")).toBe(true);
    expect(isReaction("$.x")).toBe(false);
  });
});
