import { env } from "cloudflare:workers";
import { rank } from "./rank";

/** `alt`: the author's description of an image, read by screen readers. */
export type Media = { key: string; type: string; alt?: string };
export type FeedTab = "for-you" | "following";

/** One timeline entry, already shaped for the client. */
export type FeedPost = {
  entryId: string;
  entryAt: number;
  repostedBy: { id: string; name: string } | null;
  id: string;
  body: string;
  media: Media[];
  createdAt: number;
  editedAt: number | null;
  author: { id: string; name: string; imageUrl: string | null; headline: string | null; handle: string | null };
  likes: number;
  comments: number;
  reposts: number;
  liked: boolean;
  reposted: boolean;
  following: boolean;
};

type Row = {
  entry_id: string; entry_at: number; entry_author: string; reposter_name: string; repost_of: string | null;
  id: string; body: string; media: string | null; created_at: number; edited_at: number | null; author_id: string;
  name: string; image_url: string | null; headline: string | null; handle: string | null;
  like_count: number; comment_count: number; repost_count: number;
  liked: number; reposted: number; following: number;
};

export const PAGE = 20;
const DAY = 86_400_000;

// ?1 is always the viewer. A repost row (p) joins to the original it points at (t).
const SELECT = `
  SELECT p.id AS entry_id, p.created_at AS entry_at, p.author_id AS entry_author, ru.name AS reposter_name, p.repost_of,
         t.id, t.body, t.media, t.created_at, t.edited_at, t.author_id, u.name, u.image_url, u.headline, u.handle,
         t.like_count, t.comment_count, t.repost_count,
         EXISTS (SELECT 1 FROM likes l WHERE l.post_id = t.id AND l.user_id = ?1) AS liked,
         EXISTS (SELECT 1 FROM posts r WHERE r.repost_of = t.id AND r.author_id = ?1) AS reposted,
         EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ?1 AND f.followee_id = t.author_id) AS following
  FROM posts p
  JOIN posts t ON t.id = COALESCE(p.repost_of, p.id)
  JOIN users u ON u.id = t.author_id
  JOIN users ru ON ru.id = p.author_id`;

const toPost = (r: Row): FeedPost => ({
  entryId: r.entry_id,
  entryAt: r.entry_at,
  repostedBy: r.repost_of ? { id: r.entry_author, name: r.reposter_name } : null,
  id: r.id,
  body: r.body,
  media: r.media ? JSON.parse(r.media) : [],
  createdAt: r.created_at,
  editedAt: r.edited_at,
  author: { id: r.author_id, name: r.name, imageUrl: r.image_url, headline: r.headline, handle: r.handle },
  likes: r.like_count,
  comments: r.comment_count,
  reposts: r.repost_count,
  liked: !!r.liked,
  reposted: !!r.reposted,
  following: !!r.following,
});

/** Following: strict reverse-chronological (you + people you follow). Cursor = "createdAt:entryId". */
async function following(viewerId: string, cursor?: string) {
  const [at, id] = cursor ? [Number(cursor.split(":")[0]), cursor.split(":")[1]] : [Number.MAX_SAFE_INTEGER, ""];
  const { results } = await env.DB.prepare(
    `${SELECT}
     WHERE (p.author_id = ?1 OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?1))
       AND (p.created_at, p.id) < (?2, ?3)
     ORDER BY p.created_at DESC, p.id DESC LIMIT ${PAGE}`,
  ).bind(viewerId, at, id || "￿").all<Row>();
  const posts = results.map(toPost);
  const last = posts.at(-1);
  return { posts, next: posts.length === PAGE && last ? `${last.entryAt}:${last.entryId}` : null };
}

/**
 * For you: candidate generation (recent posts from everyone) → personalised ranking → page.
 * ponytail: candidates = latest 400 in 14 days and offset paging over a re-ranked list (entries can
 * shift between pages as scores change). Precompute per-user timelines in KV/Queues when volume needs it.
 */
async function forYou(viewerId: string, cursor?: string) {
  const offset = Number(cursor) || 0;
  const since = Date.now() - 14 * DAY;
  // Affinity: how much the viewer interacted with each author lately. Follows count most, then reposts, comments, likes.
  const [candidates, affinity] = await env.DB.batch<Row | { author_id: string; w: number }>([
    env.DB.prepare(`${SELECT} WHERE p.created_at > ?2 ORDER BY p.created_at DESC LIMIT 400`).bind(viewerId, since),
    env.DB.prepare(
      `SELECT author_id, SUM(w) AS w FROM (
         SELECT followee_id AS author_id, 8.0 AS w FROM follows WHERE follower_id = ?1
         UNION ALL SELECT p.author_id, 1.0 FROM likes l JOIN posts p ON p.id = l.post_id WHERE l.user_id = ?1 AND l.created_at > ?2
         UNION ALL SELECT p.author_id, 2.0 FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.author_id = ?1 AND c.created_at > ?2
         UNION ALL SELECT o.author_id, 3.0 FROM posts r JOIN posts o ON o.id = r.repost_of WHERE r.author_id = ?1 AND r.created_at > ?2
       ) GROUP BY author_id`,
    ).bind(viewerId, Date.now() - 30 * DAY),
  ]);
  const aff = new Map((affinity.results as { author_id: string; w: number }[]).map((a) => [a.author_id, a.w]));
  const ranked = rank(
    (candidates.results as Row[]).map((r) => ({
      row: r, entryId: r.entry_id, targetId: r.id, entryAuthor: r.entry_author, targetAuthor: r.author_id, entryAt: r.entry_at,
      likes: r.like_count, comments: r.comment_count, reposts: r.repost_count,
    })),
    viewerId,
    aff,
  );
  const page = ranked.slice(offset, offset + PAGE);
  return { posts: page.map((c) => toPost(c.row)), next: offset + PAGE < ranked.length ? String(offset + PAGE) : null };
}

export const getFeed = (viewerId: string, tab: FeedTab, cursor?: string) =>
  tab === "following" ? following(viewerId, cursor) : forYou(viewerId, cursor);

export type ProfileTab = "posts" | "media" | "likes";

/**
 * A member's profile timeline, as `viewerId` sees it. posts: everything they published or reposted;
 * media: their own posts with photos or video; likes: posts they liked, newest like first (callers must only allow the owner).
 * ponytail: offset paging (cursor = number of rows already seen). Fine for one member's history, and the client dedupes by entry.
 */
export async function getUserPosts(viewerId: string, userId: string, tab: ProfileTab, cursor?: string) {
  const offset = Number(cursor) || 0;
  const [join, where, order] =
    tab === "likes" ? [" JOIN likes lk ON lk.post_id = p.id AND lk.user_id = ?2", "p.repost_of IS NULL", "lk.created_at DESC"]
    : tab === "media" ? ["", "p.author_id = ?2 AND p.repost_of IS NULL AND p.media IS NOT NULL", "p.created_at DESC, p.id DESC"]
    : ["", "p.author_id = ?2", "p.created_at DESC, p.id DESC"];
  const { results } = await env.DB.prepare(`${SELECT}${join} WHERE ${where} ORDER BY ${order} LIMIT ${PAGE} OFFSET ?3`).bind(viewerId, userId, offset).all<Row>();
  return { posts: results.map(toPost), next: results.length === PAGE ? String(offset + PAGE) : null };
}

export async function getPost(viewerId: string, id: string) {
  const row = await env.DB.prepare(`${SELECT} WHERE p.id = ?2`).bind(viewerId, id).first<Row>();
  return row && toPost(row);
}

export async function getFollowingIds(viewerId: string) {
  const { results } = await env.DB.prepare("SELECT followee_id FROM follows WHERE follower_id = ?").bind(viewerId).all<{ followee_id: string }>();
  return results.map((r) => r.followee_id);
}

/** A post for the signed-out share page (/post/<id>): originals only, no viewer state. */
export async function getPublicPost(id: string) {
  const post = await getPost("", id);
  return post && !post.repostedBy ? post : null;
}
