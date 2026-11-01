// Run: node --experimental-strip-types lib/rank.test.ts
import assert from "node:assert/strict";
import { rank, type Candidate } from "./rank.ts";

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

// Newer beats older at equal engagement
assert.deepEqual(
  rank([post("old", "a", 10), post("new", "b", 1)], "me", new Map(), now).map((p) => p.entryId),
  ["new", "old"],
);

// Affinity: an author I interact with outranks a stranger's slightly newer post
assert.equal(
  rank([post("stranger", "b", 1), post("friend", "a", 2)], "me", new Map([["a", 20]]), now)[0].entryId,
  "friend",
);

// Engagement: a popular post beats a quiet one of the same age
assert.equal(rank([post("quiet", "a", 3), post("viral", "b", 3, 500)], "me", new Map(), now)[0].entryId, "viral");

// Dedupe: original + repost of the same post collapse to one entry
const repost = post("r1", "c", 0.5, 0, { targetId: "p1", targetAuthor: "a" });
assert.equal(rank([post("p1", "a", 2), repost], "me", new Map(), now).length, 1);

// Diversity: 3 posts from one author don't all come before another author's equal post
const flood = [post("a1", "a", 1), post("a2", "a", 1.01), post("a3", "a", 1.02), post("b1", "b", 1.03)];
assert.ok(rank(flood, "me", new Map(), now).findIndex((p) => p.entryId === "b1") < 3);

// My own fresh post is pinned first for me
assert.equal(rank([post("viral", "b", 0.2, 900), post("mine", "me", 0.5)], "me", new Map(), now)[0].entryId, "mine");

console.log("rank: ok");
