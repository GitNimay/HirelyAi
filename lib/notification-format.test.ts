import { describe, expect, it } from "vitest";
import { categoryOf, hasPreview, verb, who } from "./notification-format";

const n = (...names: string[]) => names.map((name) => ({ name }));

describe("who", () => {
  it.each([
    [[], 0, "Someone"],
    [n("Ada"), 1, "Ada"],
    [n("Bo", "Ada"), 2, "Bo and Ada"],
    [n("Cy", "Bo", "Ada"), 3, "Cy, Bo and 1 other"],
    [n("Cy", "Bo", "Ada"), 12, "Cy, Bo and 10 others"],
  ])("names %j with %i actors as %s", (actors, count, expected) => {
    expect(who(actors, count)).toBe(expected);
  });
});

describe("verb", () => {
  it.each([
    ["like", "reacted to your post"],
    ["repost", "reposted your post"],
    ["comment", "commented on your post"],
    ["thread", "also commented on a post you commented on"],
    ["post", "shared a post"],
    ["follow", "started following you"],
    ["invite", "sent you a connection invitation"],
    ["accept", "accepted your connection invitation"],
    ["applicant", "applied to Designer"],
    ["app_viewed", "viewed your application to Designer"],
    ["app_shortlisted", "shortlisted your application to Designer"],
    ["app_rejected", "moved forward with other candidates for Designer"],
    ["job", "posted a job: Designer"],
    ["job_closed", "is no longer accepting applications for Designer"],
  ] as const)("describes %s as %j", (type, sentence) => {
    expect(verb(type, "Designer")).toBe(sentence);
  });
});

describe("hasPreview", () => {
  it("shows a text preview for post activity only", () => {
    expect(hasPreview("comment")).toBe(true);
    expect(hasPreview("applicant")).toBe(false);
  });
});

describe("categoryOf", () => {
  it.each([
    ["like", "posts"],
    ["invite", "network"],
    ["app_rejected", "jobs"],
    ["job_closed", "jobs"],
  ] as const)("files %s under %s", (type, category) => {
    expect(categoryOf(type)).toBe(category);
  });
});
