import type { User } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { profileOf, syncStatements } from "./network";

export type Connection = "none" | "connected" | "sent" | "received";

/** A member's profile as one viewer sees it. `rel` is meaningless (all false/none) on your own profile. */
export type Profile = {
  id: string;
  handle: string | null;
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  imageUrl: string | null;
  coverUrl: string | null;
  joinedAt: number | null;
  counts: { posts: number; connections: number; following: number; followers: number };
  rel: { following: boolean; followsYou: boolean; connection: Connection; mutual: number };
};

type Row = {
  id: string; handle: string | null; name: string; headline: string | null; bio: string | null; location: string | null; website: string | null;
  image_url: string | null; cover_key: string | null; joined_at: number | null;
  posts: number; connections: number; following: number; followers: number;
  i_follow: number; follows_me: number; conn: Connection; mutual: number;
};

/** `ref` is a handle, or a user id (older links, fallback URLs). ?1 = viewer, ?2 = ref. */
export async function getProfile(viewerId: string, ref: string): Promise<Profile | null> {
  const r = await env.DB.prepare(
    `SELECT u.id, u.handle, u.name, u.headline, u.bio, u.location, u.website, u.image_url, u.cover_key, u.joined_at,
       (SELECT COUNT(*) FROM posts WHERE author_id = u.id) AS posts,
       (SELECT COUNT(*) FROM connections WHERE user_id = u.id) AS connections,
       (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following,
       (SELECT COUNT(*) FROM follows WHERE followee_id = u.id) AS followers,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = ?1 AND followee_id = u.id) AS i_follow,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = u.id AND followee_id = ?1) AS follows_me,
       CASE WHEN EXISTS (SELECT 1 FROM connections WHERE user_id = ?1 AND peer_id = u.id) THEN 'connected'
            WHEN EXISTS (SELECT 1 FROM invitations WHERE from_id = ?1 AND to_id = u.id) THEN 'sent'
            WHEN EXISTS (SELECT 1 FROM invitations WHERE from_id = u.id AND to_id = ?1) THEN 'received'
            ELSE 'none' END AS conn,
       (SELECT COUNT(*) FROM connections a JOIN connections b ON b.user_id = u.id AND b.peer_id = a.peer_id WHERE a.user_id = ?1) AS mutual
     FROM users u WHERE u.handle = ?2 OR u.id = ?2 ORDER BY u.handle = ?2 DESC LIMIT 1`,
  ).bind(viewerId, ref).first<Row>();
  if (!r) return null;
  return {
    id: r.id, handle: r.handle, name: r.name, headline: r.headline, bio: r.bio, location: r.location, website: r.website,
    imageUrl: r.image_url, coverUrl: r.cover_key ? `/api/media/${r.cover_key}` : null, joinedAt: r.joined_at,
    counts: { posts: r.posts, connections: r.connections, following: r.following, followers: r.followers },
    rel: { following: !!r.i_follow, followsYou: !!r.follows_me, connection: r.conn, mutual: r.mutual },
  };
}

export type Viewer = { id: string; name: string; imageUrl?: string; handle: string };

/**
 * The signed-in member as the app shows them (sidebar, composer): from D1, so an edited name or photo wins over Clerk's.
 * Also makes sure the D1 row exists, so a brand-new member appears in the network before posting anything.
 */
export async function viewerOf(u: User): Promise<Viewer> {
  const p = profileOf(u);
  const [, , row] = await env.DB.batch<{ name: string; image_url: string | null; handle: string | null }>([
    ...syncStatements(p),
    env.DB.prepare("SELECT name, image_url, handle FROM users WHERE id = ?").bind(p.id),
  ]);
  const r = row.results[0];
  return { id: u.id, name: r?.name ?? p.name, imageUrl: r?.image_url ?? p.imageUrl ?? undefined, handle: r?.handle ?? u.id };
}

/** One comment with the post it answers, for the Replies tab. */
export type Reply = {
  id: string;
  body: string;
  createdAt: number;
  post: { id: string; body: string; hasMedia: boolean; author: { id: string; name: string; handle: string | null } };
};

const REPLY_PAGE = 20;

/** ponytail: offset paging like the other profile tabs. */
export async function getReplies(userId: string, cursor?: string) {
  const offset = Number(cursor) || 0;
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, p.id AS post_id, substr(p.body, 1, 200) AS post_body, p.media IS NOT NULL AS has_media,
            u.id AS uid, u.name, u.handle
     FROM comments c JOIN posts p ON p.id = c.post_id JOIN users u ON u.id = p.author_id
     WHERE c.author_id = ?1 ORDER BY c.created_at DESC, c.id DESC LIMIT ${REPLY_PAGE} OFFSET ?2`,
  ).bind(userId, offset).all<{ id: string; body: string; created_at: number; post_id: string; post_body: string; has_media: number; uid: string; name: string; handle: string | null }>();
  const replies: Reply[] = results.map((r) => ({
    id: r.id, body: r.body, createdAt: r.created_at,
    post: { id: r.post_id, body: r.post_body, hasMedia: !!r.has_media, author: { id: r.uid, name: r.name, handle: r.handle } },
  }));
  return { replies, next: replies.length === REPLY_PAGE ? String(offset + REPLY_PAGE) : null };
}
