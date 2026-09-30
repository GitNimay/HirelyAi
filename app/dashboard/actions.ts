"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { getFeed, getPost, type FeedTab, type Media } from "@/lib/feed";
import { isVideo, MAX_COMMENT_CHARS, MAX_IMAGES, MAX_POST_CHARS, MEDIA_TYPES } from "@/lib/media";
import { getNetwork, getPersonAndCounts, profileOf, saveUser, searchPeople, syncDirectory } from "@/lib/network";
import { broadcast, sendTo, type NetEvent } from "@/lib/realtime";

/** A message safe to show the user. Other errors get redacted by the framework in production. */
class Fail extends Error {}
const failed = (e: unknown) => {
  if (e instanceof Fail) return { error: e.message };
  throw e;
};

// Every action re-checks auth: server actions are public POST endpoints.
async function viewer() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

async function writer() {
  const userId = await viewer();
  const { success } = await env.WRITE_LIMIT.limit({ key: userId });
  if (!success) throw new Fail("You're doing that too fast. Try again in a minute.");
  return userId;
}

/** Snapshot the author's Clerk profile so feeds can join on it without calling Clerk. */
async function syncUser(userId: string) {
  const u = await currentUser();
  if (u?.id === userId) await saveUser(profileOf(u));
}

async function pushStats(postId: string) {
  const p = await env.DB.prepare("SELECT like_count, comment_count, repost_count FROM posts WHERE id = ?")
    .bind(postId).first<{ like_count: number; comment_count: number; repost_count: number }>();
  if (p) await broadcast({ t: "stats", id: postId, likes: p.like_count, comments: p.comment_count, reposts: p.repost_count });
  return p;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim() : "").slice(0, max);

export async function loadFeed(tab: FeedTab, cursor?: string) {
  return getFeed(await viewer(), tab === "following" ? "following" : "for-you", cursor);
}

export async function createPost(input: { body: string; media: string[] }) {
  return publish(input).then((post) => ({ post: post! }), failed);
}

/** Media must be objects this user uploaded (keys are server-issued and namespaced by user id). */
async function checkMedia(userId: string, input: unknown): Promise<Media[]> {
  const keys = Array.isArray(input) ? [...new Set(input.map(String))] : [];
  if (keys.length > MAX_IMAGES) throw new Fail("A post can have up to 4 images or 1 video");
  const media = await Promise.all(
    keys.map(async (key) => {
      if (!key.startsWith(`${userId}/`)) throw new Fail("Invalid media");
      const obj = await env.MEDIA.head(key);
      const type = obj?.httpMetadata?.contentType ?? "";
      if (!obj || obj.customMetadata?.owner !== userId || !MEDIA_TYPES[type]) throw new Fail("Invalid media");
      return { key, type };
    }),
  );
  const videos = media.filter((m) => isVideo(m.type)).length;
  if (videos > 1 || (videos === 1 && media.length > 1)) throw new Fail("A post can have up to 4 images or 1 video");
  return media;
}

async function publish(input: { body: string; media: string[] }) {
  const userId = await writer();
  const body = text(input.body, MAX_POST_CHARS);
  const media = await checkMedia(userId, input.media);
  if (!body && media.length === 0) throw new Fail("Write something or add media");

  await syncUser(userId);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO posts (id, author_id, body, media, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, body, media.length ? JSON.stringify(media) : null, Date.now()).run();
  await broadcast({ t: "post", id, authorId: userId });
  return getPost(userId, id);
}

/** Replace a post's text and media (keep, remove, or add newly uploaded files). */
export async function editPost(id: string, input: { body: string; media: string[] }) {
  return edit(String(id), input).then((r) => r, failed);
}

async function edit(id: string, input: { body: string; media: string[] }) {
  const userId = await writer();
  const post = await env.DB.prepare("SELECT media FROM posts WHERE id = ? AND author_id = ? AND repost_of IS NULL")
    .bind(id, userId).first<{ media: string | null }>();
  if (!post) throw new Fail("Post not found");

  const body = text(input?.body, MAX_POST_CHARS);
  const media = await checkMedia(userId, input?.media);
  if (!body && media.length === 0) throw new Fail("Write something or add media");

  const editedAt = Date.now();
  await env.DB.prepare("UPDATE posts SET body = ?, media = ?, edited_at = ? WHERE id = ? AND author_id = ?")
    .bind(body, media.length ? JSON.stringify(media) : null, editedAt, id, userId).run();

  // Files dropped in this edit are no longer referenced anywhere
  const kept = new Set(media.map((m) => m.key));
  const removed = (post.media ? (JSON.parse(post.media) as Media[]) : []).filter((m) => !kept.has(m.key)).map((m) => m.key);
  if (removed.length) await env.MEDIA.delete(removed);

  await broadcast({ t: "edit", id, body, media, editedAt });
  return { body, media, editedAt };
}

export async function deletePost(id: string) {
  const userId = await writer();
  const post = await env.DB.prepare("SELECT media, repost_of FROM posts WHERE id = ? AND author_id = ?")
    .bind(String(id), userId).first<{ media: string | null; repost_of: string | null }>();
  if (!post) throw new Error("Not found");
  // Reposts of this post cascade in SQL; their counters don't matter since the original is gone
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(String(id)).run();
  if (post.media) await env.MEDIA.delete((JSON.parse(post.media) as Media[]).map((m) => m.key));
  await broadcast({ t: "delete", id: String(id) });
  if (post.repost_of) await pushStats(post.repost_of);
}

export async function toggleLike(postId: string) {
  const userId = await writer();
  const id = String(postId);
  const del = await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").bind(userId, id).run();
  if (!del.meta.changes) {
    await env.DB.prepare("INSERT INTO likes (user_id, post_id, created_at) SELECT ?, id, ? FROM posts WHERE id = ? AND repost_of IS NULL")
      .bind(userId, Date.now(), id).run();
  }
  await pushStats(id);
  return { liked: !del.meta.changes };
}

export async function toggleRepost(postId: string) {
  const userId = await writer();
  const id = String(postId);
  const removed = await env.DB.prepare("DELETE FROM posts WHERE author_id = ? AND repost_of = ? RETURNING id").bind(userId, id).first<{ id: string }>();
  if (removed) {
    await broadcast({ t: "delete", id: removed.id });
  } else {
    await syncUser(userId);
    const entryId = crypto.randomUUID();
    const ins = await env.DB.prepare(
      "INSERT INTO posts (id, author_id, repost_of, created_at) SELECT ?, ?, id, ? FROM posts WHERE id = ? AND repost_of IS NULL AND author_id <> ?",
    ).bind(entryId, userId, Date.now(), id, userId).run();
    if (ins.meta.changes) await broadcast({ t: "post", id: entryId, authorId: userId });
  }
  await pushStats(id);
  return { reposted: !removed };
}

export type Comment = { id: string; body: string; createdAt: number; author: { id: string; name: string; imageUrl: string | null } };

export async function loadComments(postId: string): Promise<Comment[]> {
  await viewer();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, u.id AS uid, u.name, u.image_url FROM comments c JOIN users u ON u.id = c.author_id
     WHERE c.post_id = ? ORDER BY c.created_at LIMIT 200`,
  ).bind(String(postId)).all<{ id: string; body: string; created_at: number; uid: string; name: string; image_url: string | null }>();
  return results.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, author: { id: r.uid, name: r.name, imageUrl: r.image_url } }));
}

export async function addComment(postId: string, input: string) {
  return comment(postId, input).then((comments) => ({ comments }), failed);
}

async function comment(postId: string, input: string) {
  const userId = await writer();
  const body = text(input, MAX_COMMENT_CHARS);
  if (!body) throw new Fail("Comment is empty");
  await syncUser(userId);
  const ins = await env.DB.prepare("INSERT INTO comments (id, post_id, author_id, body, created_at) SELECT ?, id, ?, ?, ? FROM posts WHERE id = ? AND repost_of IS NULL")
    .bind(crypto.randomUUID(), userId, body, Date.now(), String(postId)).run();
  if (!ins.meta.changes) throw new Fail("This post was deleted");
  await pushStats(String(postId));
  return loadComments(postId);
}

export async function toggleFollow(targetId: string) {
  const userId = await writer();
  const id = String(targetId);
  if (id === userId) throw new Error("You can't follow yourself");
  const del = await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").bind(userId, id).run();
  if (!del.meta.changes) {
    await env.DB.prepare("INSERT INTO follows (follower_id, followee_id, created_at) SELECT ?, id, ? FROM users WHERE id = ?")
      .bind(userId, Date.now(), id).run();
  }
  await notify("follow", userId, id);
  return { following: !del.meta.changes };
}

// ---- My Network ----

/**
 * Tell both sides (or just the actor, for changes the other side must not learn about) what changed,
 * each with the other person as they see them and their own fresh counts.
 */
async function notify(kind: NetEvent["kind"], actor: string, other: string, both = true) {
  const pair = both ? ([[actor, other, "out"], [other, actor, "in"]] as const) : ([[actor, other, "out"]] as const);
  await Promise.all(
    pair.map(async ([to, about, dir]) => {
      const { person, counts } = await getPersonAndCounts(to, about);
      if (person) await sendTo(to, { t: "net", kind, dir, person, counts });
    }),
  );
}

export async function loadNetwork() {
  const me = await viewer();
  await syncDirectory();
  return getNetwork(me);
}

export async function findPeople(query: string) {
  const me = await viewer();
  await syncDirectory();
  return searchPeople(me, String(query));
}

/** Send a connection request, or accept theirs if they already invited you. */
export async function connect(targetId: string) {
  const me = await writer();
  const id = String(targetId);
  if (id === me) throw new Error("You can't connect with yourself");
  const theirs = await env.DB.prepare("SELECT 1 FROM invitations WHERE from_id = ? AND to_id = ?").bind(id, me).first();
  if (theirs) return acceptInvite(id);
  await syncUser(me);
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO invitations (from_id, to_id, created_at) SELECT ?1, id, ?3 FROM users
     WHERE id = ?2 AND NOT EXISTS (SELECT 1 FROM connections WHERE user_id = ?1 AND peer_id = ?2)`,
  ).bind(me, id, Date.now()).run();
  if (ins.meta.changes) await notify("invite", me, id);
}

export async function acceptInvite(fromId: string) {
  const me = await writer();
  const id = String(fromId);
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(id, me).run();
  if (!del.meta.changes) throw new Error("This invitation is no longer available");
  await syncUser(me);
  const now = Date.now();
  // Connecting also makes you follow each other, like LinkedIn. A crossed invite in the other direction is now moot.
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO connections (user_id, peer_id, created_at) VALUES (?1, ?2, ?3), (?2, ?1, ?3)").bind(me, id, now),
    env.DB.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?1, ?2, ?3), (?2, ?1, ?3)").bind(me, id, now),
    env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(me, id),
  ]);
  await notify("connect", me, id);
}

/** The sender isn't told (same as LinkedIn): their request just stays pending on their side. */
export async function ignoreInvite(fromId: string) {
  const me = await writer();
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(String(fromId), me).run();
  if (del.meta.changes) await notify("uninvite", me, String(fromId), false);
}

export async function withdrawInvite(toId: string) {
  const me = await writer();
  const del = await env.DB.prepare("DELETE FROM invitations WHERE from_id = ? AND to_id = ?").bind(me, String(toId)).run();
  if (del.meta.changes) await notify("uninvite", me, String(toId));
}

export async function removeConnection(peerId: string) {
  const me = await writer();
  const id = String(peerId);
  const [del] = await env.DB.batch([
    env.DB.prepare("DELETE FROM connections WHERE (user_id = ?1 AND peer_id = ?2) OR (user_id = ?2 AND peer_id = ?1)").bind(me, id),
    env.DB.prepare("DELETE FROM follows WHERE (follower_id = ?1 AND followee_id = ?2) OR (follower_id = ?2 AND followee_id = ?1)").bind(me, id),
  ]);
  if (del.meta.changes) await notify("disconnect", me, id);
}
