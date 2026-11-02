import { readdirSync } from "node:fs";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { comment, company, follow, followCompany, job, like, post, row, uid, user } from "./factories";

// The counters and reaction tallies shown everywhere are kept by SQL triggers (migrations/), not app code,
// so they are only testable against a real database.

const counts = (postId: string) =>
  row<{ like_count: number; comment_count: number; repost_count: number; reactions: string }>(
    "SELECT like_count, comment_count, repost_count, reactions FROM posts WHERE id = ?",
    postId,
  );

describe("migrations", () => {
  it("apply every file in migrations/, in order", async () => {
    const files = readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const { results } = await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(files);
  });
});

describe("post counters", () => {
  it("count likes and tally each reaction kind", async () => {
    const author = await user();
    const [a, b, c] = [await user(), await user(), await user()];
    const p = await post(author);

    await like(a, p, "like");
    await like(b, p, "love");
    await like(c, p, "love");
    expect(await counts(p)).toMatchObject({ like_count: 3 });
    expect(JSON.parse((await counts(p))!.reactions)).toEqual({ like: 1, love: 2 });

    await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").bind(a, p).run();
    expect(await counts(p)).toMatchObject({ like_count: 2 });
    expect(JSON.parse((await counts(p))!.reactions)).toEqual({ love: 2 });
  });

  it("move a reaction between kinds without changing the total", async () => {
    const p = await post(await user());
    const fan = await user();
    await like(fan, p, "like");

    await env.DB.prepare("UPDATE likes SET kind = 'funny' WHERE user_id = ? AND post_id = ?").bind(fan, p).run();

    expect(await counts(p)).toMatchObject({ like_count: 1 });
    expect(JSON.parse((await counts(p))!.reactions)).toEqual({ funny: 1 });
  });

  it("count comments and reposts, and undo them on delete", async () => {
    const author = await user();
    const p = await post(author);
    const c = await comment(p, await user());
    const r = await post(await user(), { repostOf: p });
    expect(await counts(p)).toMatchObject({ comment_count: 1, repost_count: 1 });

    await env.DB.batch([
      env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(c),
      env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(r),
    ]);
    expect(await counts(p)).toMatchObject({ comment_count: 0, repost_count: 0 });
  });

  it("allow one reaction per member per post", async () => {
    const p = await post(await user());
    const fan = await user();
    await like(fan, p);
    await expect(like(fan, p, "love")).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it("reject an unknown reaction kind", async () => {
    const p = await post(await user());
    await expect(like(await user(), p, "angry")).rejects.toThrow(/CHECK/);
  });
});

describe("member and company counters", () => {
  it("track follower and following counts on both sides", async () => {
    const [a, b] = [await user(), await user()];
    await follow(a, b);
    expect(await row("SELECT following_count FROM users WHERE id = ?", a)).toEqual({ following_count: 1 });
    expect(await row("SELECT follower_count FROM users WHERE id = ?", b)).toEqual({ follower_count: 1 });

    await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").bind(a, b).run();
    expect(await row("SELECT follower_count FROM users WHERE id = ?", b)).toEqual({ follower_count: 0 });
  });

  it("refuse following yourself", async () => {
    const a = await user();
    await expect(follow(a, a)).rejects.toThrow(/CHECK/);
  });

  it("count company followers", async () => {
    const co = await company(await user());
    await followCompany(await user(), co);
    await followCompany(await user(), co);
    expect(await row("SELECT follower_count FROM companies WHERE id = ?", co)).toEqual({ follower_count: 2 });
  });

  it("count job applicants", async () => {
    const j = await job(await user());
    const applicant = await user();
    await env.DB.prepare(
      "INSERT INTO applications (job_id, applicant_id, email, created_at, updated_at) VALUES (?, ?, 'a@b.test', 0, 0)",
    )
      .bind(j, applicant)
      .run();
    expect(await row("SELECT applicant_count FROM jobs WHERE id = ?", j)).toEqual({ applicant_count: 1 });
  });

  it("keep company slugs unique", async () => {
    const owner = await user();
    const slug = uid("slug");
    await company(owner, { slug });
    await expect(company(owner, { slug })).rejects.toThrow(/UNIQUE/);
  });
});
