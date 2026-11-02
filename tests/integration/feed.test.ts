import { describe, expect, it } from "vitest";
import { PAGE, getFeed, getFollowingIds, getPost, getPublicPost, getUserPosts } from "@/lib/feed";
import { comment, company, follow, followCompany, like, post, user } from "./factories";

const DAY = 86_400_000;
const ids = (r: { posts: { entryId: string }[] }) => r.posts.map((p) => p.entryId);

describe("following tab", () => {
  it("shows my posts and people I follow, newest first, and nobody else", async () => {
    const [me, friend, stranger] = [await user(), await user(), await user()];
    await follow(me, friend);
    const t = Date.now();
    const mine = await post(me, { at: t - 3000 });
    const theirs = await post(friend, { at: t - 1000 });
    await post(stranger, { at: t });

    expect(ids(await getFeed(me, "following"))).toEqual([theirs, mine]);
  });

  it("includes posts from company pages I follow", async () => {
    const me = await user();
    const admin = await user();
    const co = await company(admin);
    await followCompany(me, co);
    const companyPost = await post(admin, { companyId: co });

    const feed = await getFeed(me, "following");
    expect(ids(feed)).toEqual([companyPost]);
    expect(feed.posts[0].company).toMatchObject({ id: co });
  });

  it("pages with a cursor, without gaps or repeats, even when posts share a timestamp", async () => {
    const me = await user();
    const at = Date.now() - DAY;
    const all = new Set<string>();
    for (let i = 0; i < PAGE + 5; i++) all.add(await post(me, { at: at - Math.floor(i / 3) }));

    const first = await getFeed(me, "following");
    expect(first.posts).toHaveLength(PAGE);
    const second = await getFeed(me, "following", first.next!);
    expect(second.next).toBeNull();

    const seen = [...ids(first), ...ids(second)];
    expect(seen).toHaveLength(PAGE + 5);
    expect(new Set(seen)).toEqual(all);
  });

  it("shows a repost as its own entry pointing at the original", async () => {
    const [me, author] = [await user(), await user({ name: "Ada" })];
    const original = await post(author, { at: Date.now() - 1000 });
    const repost = await post(me, { repostOf: original });

    const [entry] = (await getFeed(me, "following")).posts;
    expect(entry).toMatchObject({
      entryId: repost,
      id: original,
      author: { id: author, name: "Ada" },
      repostedBy: { id: me },
      reposted: true,
      reposts: 1,
    });
  });
});

describe("for you tab", () => {
  it("ranks recent posts from everyone and leaves out anything older than 14 days", async () => {
    const me = await user();
    const recent = await post(await user(), { at: Date.now() - DAY });
    const old = await post(await user(), { at: Date.now() - 15 * DAY });

    const feed = ids(await getFeed(me, "for-you"));
    expect(feed).toContain(recent);
    expect(feed).not.toContain(old);
  });
});

describe("viewer state", () => {
  it("reports my reaction, the reaction tallies, comments and whether I follow the author", async () => {
    const [me, author] = [await user(), await user()];
    const p = await post(author);
    await like(me, p, "love");
    await like(await user(), p, "like");
    await comment(p, me);
    await follow(me, author);

    expect(await getPost(me, p)).toMatchObject({
      likes: 2,
      reactions: { love: 1, like: 1 },
      reaction: "love",
      comments: 1,
      following: true,
      reposted: false,
    });
    expect(await getPost(await user(), p)).toMatchObject({ reaction: null, following: false });
    expect(await getFollowingIds(me)).toEqual([author]);
  });

  it("parses media and returns null for a missing post", async () => {
    const p = await post(await user(), { media: [{ key: "posts/u/a.png", type: "image/png", alt: "A chart" }] });
    expect((await getPost("", p))?.media).toEqual([{ key: "posts/u/a.png", type: "image/png", alt: "A chart" }]);
    expect(await getPost("", "post_missing")).toBeNull();
  });

  it("shares originals publicly, never reposts", async () => {
    const original = await post(await user());
    const repost = await post(await user(), { repostOf: original });
    expect((await getPublicPost(original))?.id).toBe(original);
    expect(await getPublicPost(repost)).toBeNull();
  });
});

describe("profile tabs", () => {
  it("splits a member's posts, media and likes, and keeps company posts on the company", async () => {
    const [me, other] = [await user(), await user()];
    const co = await company(me);
    const text = await post(me, { at: Date.now() - 4000 });
    const photo = await post(me, { at: Date.now() - 3000, media: [{ key: "k", type: "image/png" }] });
    const asCompany = await post(me, { at: Date.now() - 2000, companyId: co });
    const liked = await post(other);
    await like(me, liked);

    expect(ids(await getUserPosts(me, me, "posts"))).toEqual([photo, text]);
    expect(ids(await getUserPosts(me, me, "media"))).toEqual([photo]);
    expect(ids(await getUserPosts(me, me, "likes"))).toEqual([liked]);
    expect(ids(await getUserPosts(me, co, "company"))).toEqual([asCompany]);
  });

  it("pages by offset", async () => {
    const me = await user();
    for (let i = 0; i < PAGE + 1; i++) await post(me, { at: Date.now() - i * 1000 });
    const first = await getUserPosts(me, me, "posts");
    expect(first.next).toBe(String(PAGE));
    const second = await getUserPosts(me, me, "posts", first.next!);
    expect(second.posts).toHaveLength(1);
    expect(second.next).toBeNull();
  });
});
